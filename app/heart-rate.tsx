import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import * as ImageManipulator from "expo-image-manipulator";
import pako from "pako";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as FileSystem from "expo-file-system";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { useAvicenna } from "@/contexts/AvicennaContext";
import { getProfile, saveProfile } from "@/lib/storage";

const IS_MOBILE = Platform.OS !== "web";
const MEASUREMENT_DURATION = IS_MOBILE ? 25 : 20;
const MIN_SAMPLES = IS_MOBILE ? 25 : 30;
const FINGER_DETECT_INTERVAL_MS = 350;
const FINGER_CONFIRM_FRAMES = 3;
const EXTRACT_FPS = 10;
const EXTRACT_BATCH_SIZE = 5;
const RGB_SMOOTH_WINDOW = 5;
const EMA_ALPHA = 0.3;

type MeasurementState = "idle" | "waiting_finger" | "measuring" | "processing" | "result";

interface HeartRateResult {
  heartRate: number;
  confidence: "high" | "medium" | "low";
  waveform: number[];
  signalQuality: number;
  message: string;
  validReading: boolean;
}

function extractRGBFromBase64Web(base64Data: string): Promise<{ r: number; g: number; b: number }> {
  return new Promise((resolve) => {
    try {
      const img = new (window as any).Image() as HTMLImageElement;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ r: -1, g: -1, b: -1 });
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const roiX = Math.floor(size * 0.2);
        const roiY = Math.floor(size * 0.3);
        const roiW = Math.floor(size * 0.6);
        const roiH = Math.floor(size * 0.4);
        const imageData = ctx.getImageData(roiX, roiY, roiW, roiH);
        const data = imageData.data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          count++;
        }
        resolve({
          r: count > 0 ? rSum / count : -1,
          g: count > 0 ? gSum / count : -1,
          b: count > 0 ? bSum / count : -1,
        });
      };
      img.onerror = () => resolve({ r: -1, g: -1, b: -1 });
      const imgSrc = base64Data.startsWith("data:")
        ? base64Data
        : `data:image/png;base64,${base64Data}`;
      img.src = imgSrc;
    } catch {
      resolve({ r: -1, g: -1, b: -1 });
    }
  });
}

function parsePNGPixels(base64: string): { r: number; g: number; b: number } {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    let width = 0;
    let height = 0;
    let colorType = 6;
    let pos = 8;
    while (pos < bytes.length) {
      const length = (bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3];
      const type = String.fromCharCode(bytes[pos+4], bytes[pos+5], bytes[pos+6], bytes[pos+7]);
      if (type === "IHDR") {
        width = (bytes[pos+8] << 24) | (bytes[pos+9] << 16) | (bytes[pos+10] << 8) | bytes[pos+11];
        height = (bytes[pos+12] << 24) | (bytes[pos+13] << 16) | (bytes[pos+14] << 8) | bytes[pos+15];
        colorType = bytes[pos+17];
      }
      pos += 12 + length;
    }

    if (width === 0 || height === 0) return { r: -1, g: -1, b: -1 };

    pos = 8;
    const idatChunks: Uint8Array[] = [];
    while (pos < bytes.length) {
      const length = (bytes[pos] << 24) | (bytes[pos+1] << 16) | (bytes[pos+2] << 8) | bytes[pos+3];
      const type = String.fromCharCode(bytes[pos+4], bytes[pos+5], bytes[pos+6], bytes[pos+7]);
      if (type === "IDAT") {
        idatChunks.push(bytes.slice(pos + 8, pos + 8 + length));
      }
      pos += 12 + length;
    }

    const totalLen = idatChunks.reduce((s, c) => s + c.length, 0);
    const idatData = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of idatChunks) {
      idatData.set(chunk, offset);
      offset += chunk.length;
    }

    let decompressed: Uint8Array;
    try {
      decompressed = pako.inflate(idatData);
    } catch {
      return { r: -1, g: -1, b: -1 };
    }

    const bpp = (colorType === 2) ? 3 : 4;
    const rowBytes = width * bpp;
    const pixels = new Uint8Array(width * height * bpp);

    for (let y = 0; y < height; y++) {
      const filterType = decompressed[y * (rowBytes + 1)];
      const rowStart = y * (rowBytes + 1) + 1;
      const pixelRowStart = y * rowBytes;

      for (let x = 0; x < rowBytes; x++) {
        const raw = decompressed[rowStart + x];
        let left = 0;
        let up = 0;
        let upLeft = 0;

        if (x >= bpp) left = pixels[pixelRowStart + x - bpp];
        if (y > 0) up = pixels[(y - 1) * rowBytes + x];
        if (x >= bpp && y > 0) upLeft = pixels[(y - 1) * rowBytes + x - bpp];

        let val = raw;
        switch (filterType) {
          case 0: val = raw; break;
          case 1: val = (raw + left) & 0xff; break;
          case 2: val = (raw + up) & 0xff; break;
          case 3: val = (raw + Math.floor((left + up) / 2)) & 0xff; break;
          case 4: {
            const p = left + up - upLeft;
            const pa = Math.abs(p - left);
            const pb = Math.abs(p - up);
            const pc = Math.abs(p - upLeft);
            const paeth = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
            val = (raw + paeth) & 0xff;
            break;
          }
        }
        pixels[pixelRowStart + x] = val;
      }
    }

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < width * height; i++) {
      rSum += pixels[i * bpp];
      gSum += pixels[i * bpp + 1];
      bSum += pixels[i * bpp + 2];
      count++;
    }

    return {
      r: count > 0 ? rSum / count : -1,
      g: count > 0 ? gSum / count : -1,
      b: count > 0 ? bSum / count : -1,
    };
  } catch {
    return { r: -1, g: -1, b: -1 };
  }
}

async function extractRGBNative(uri: string): Promise<{ r: number; g: number; b: number }> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 8, height: 8 } }],
      { base64: true, format: ImageManipulator.SaveFormat.PNG }
    );
    if (result.base64) {
      const rawBase64 = result.base64.startsWith("data:")
        ? result.base64.replace(/^data:image\/\w+;base64,/, "")
        : result.base64;
      return parsePNGPixels(rawBase64);
    }
    return { r: -1, g: -1, b: -1 };
  } catch {
    return { r: -1, g: -1, b: -1 };
  }
}

function smoothRGB(history: Array<{r: number; g: number; b: number}>): { r: number; g: number; b: number } {
  if (history.length === 0) return { r: -1, g: -1, b: -1 };
  const recent = history.slice(-RGB_SMOOTH_WINDOW);
  const sum = recent.reduce((acc, v) => ({ r: acc.r + v.r, g: acc.g + v.g, b: acc.b + v.b }), { r: 0, g: 0, b: 0 });
  return { r: sum.r / recent.length, g: sum.g / recent.length, b: sum.b / recent.length };
}

function isFingerCovering(r: number, g: number, b: number, duringMeasurement = false): boolean {
  const brightness = (r + g + b) / 3;
  if (brightness < 10 || brightness > 245) return false;

  if (duringMeasurement) {
    if (brightness >= 15 && brightness <= 240 && r >= g * 0.8) return true;
    return false;
  }

  if (r > 160 && r > g * 1.2 && r > b * 1.2) return true;
  if (brightness > 20 && brightness < 200 && r > g && r > b && (r - g) > 3 && (r - b) > 3) return true;
  if (brightness > 60 && brightness < 200 && r >= g * 0.95 && r >= b * 0.95) return true;
  if (brightness >= 80 && brightness <= 200) {
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    if ((maxC - minC) < 40 && r >= minC) return true;
  }
  return false;
}

function detrendSignal(sig: number[]) {
  const len = sig.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < len; i++) {
    sumX += i; sumY += sig[i]; sumXY += i * sig[i]; sumXX += i * i;
  }
  const denom = len * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return sig.map(() => 0);
  const slope = (len * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / len;
  return sig.map((v, i) => v - (slope * i + intercept));
}

function normalizeSignal(sig: number[]) {
  const mean = sig.reduce((a, b) => a + b, 0) / sig.length;
  const std = Math.sqrt(sig.reduce((s, v) => s + (v - mean) ** 2, 0) / sig.length) || 1;
  return sig.map(v => (v - mean) / std);
}

function bandpassFilter(sig: number[], sampleRate: number, lowFreq: number, highFreq: number) {
  const hpRC = 1.0 / (2 * Math.PI * lowFreq);
  const hpAlpha = hpRC / (hpRC + 1.0 / sampleRate);
  const hp = new Array(sig.length);
  hp[0] = sig[0];
  for (let i = 1; i < sig.length; i++) {
    hp[i] = hpAlpha * (hp[i - 1] + sig[i] - sig[i - 1]);
  }
  const hp2 = new Array(sig.length);
  hp2[0] = hp[0];
  for (let i = 1; i < sig.length; i++) {
    hp2[i] = hpAlpha * (hp2[i - 1] + hp[i] - hp[i - 1]);
  }
  const lpRC = 1.0 / (2 * Math.PI * highFreq);
  const lpAlpha = (1.0 / sampleRate) / (lpRC + 1.0 / sampleRate);
  const lp = new Array(sig.length);
  lp[0] = hp2[0];
  for (let i = 1; i < sig.length; i++) {
    lp[i] = lp[i - 1] + lpAlpha * (hp2[i] - lp[i - 1]);
  }
  const lp2 = new Array(sig.length);
  lp2[0] = lp[0];
  for (let i = 1; i < sig.length; i++) {
    lp2[i] = lp2[i - 1] + lpAlpha * (lp[i] - lp2[i - 1]);
  }
  return lp2;
}

function movingAverage(sig: number[], windowSize: number): number[] {
  const result = new Array(sig.length);
  const halfW = Math.floor(windowSize / 2);
  for (let i = 0; i < sig.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - halfW); j <= Math.min(sig.length - 1, i + halfW); j++) {
      sum += sig[j];
      count++;
    }
    result[i] = sum / count;
  }
  return result;
}

function interpolateSignal(values: number[], timestamps: number[], targetFps: number): { signal: number[]; fps: number } {
  if (values.length < 3) return { signal: values, fps: 1 };
  const startTime = timestamps[0];
  const endTime = timestamps[timestamps.length - 1];
  const duration = (endTime - startTime) / 1000;
  if (duration <= 0) return { signal: values, fps: 1 };

  const numSamples = Math.max(values.length, Math.round(duration * targetFps));
  const dt = duration / (numSamples - 1);
  const result: number[] = [];

  for (let i = 0; i < numSamples; i++) {
    const t = startTime + i * dt * 1000;
    let idx = 0;
    while (idx < timestamps.length - 1 && timestamps[idx + 1] < t) idx++;

    if (idx >= timestamps.length - 1) {
      result.push(values[values.length - 1]);
    } else {
      const t0 = timestamps[idx];
      const t1 = timestamps[idx + 1];
      const frac = (t1 - t0) > 0 ? (t - t0) / (t1 - t0) : 0;
      const v0 = values[idx];
      const v1 = values[idx + 1];

      if (idx > 0 && idx < timestamps.length - 2) {
        const vm1 = values[idx - 1];
        const v2 = values[idx + 2];
        const a = -0.5 * vm1 + 1.5 * v0 - 1.5 * v1 + 0.5 * v2;
        const b = vm1 - 2.5 * v0 + 2 * v1 - 0.5 * v2;
        const c = -0.5 * vm1 + 0.5 * v1;
        const d = v0;
        result.push(a * frac * frac * frac + b * frac * frac + c * frac + d);
      } else {
        result.push(v0 + frac * (v1 - v0));
      }
    }
  }

  return { signal: result, fps: (numSamples - 1) / duration };
}

function countPeaksBpm(sig: number[], fps: number): { bpm: number; confidence: number } {
  if (sig.length < 10) return { bpm: 0, confidence: 0 };

  const smoothed = movingAverage(sig, Math.max(3, Math.round(fps * 0.1)));
  const mean = smoothed.reduce((a, b) => a + b, 0) / smoothed.length;

  let crossings = 0;
  let wasAbove = smoothed[0] > mean;
  const crossingPositions: number[] = [];

  for (let i = 1; i < smoothed.length; i++) {
    const isAbove = smoothed[i] > mean;
    if (isAbove && !wasAbove) {
      crossings++;
      crossingPositions.push(i);
    }
    wasAbove = isAbove;
  }

  if (crossings < 2) return { bpm: 0, confidence: 0 };

  const duration = sig.length / fps;
  const bpm = Math.round((crossings / duration) * 60);

  const intervals: number[] = [];
  for (let i = 1; i < crossingPositions.length; i++) {
    intervals.push((crossingPositions[i] - crossingPositions[i - 1]) / fps);
  }
  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const intervalVariance = intervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(intervalVariance) / (meanInterval || 1);
  const confidence = Math.max(0, 1 - cv * 2);

  return { bpm, confidence };
}

function fft(re: number[], im: number[], sz: number) {
  if (sz <= 1) return;
  const halfN = sz / 2;
  const evenReal = new Array(halfN);
  const evenImag = new Array(halfN);
  const oddReal = new Array(halfN);
  const oddImag = new Array(halfN);
  for (let i = 0; i < halfN; i++) {
    evenReal[i] = re[2 * i]; evenImag[i] = im[2 * i];
    oddReal[i] = re[2 * i + 1]; oddImag[i] = im[2 * i + 1];
  }
  fft(evenReal, evenImag, halfN);
  fft(oddReal, oddImag, halfN);
  for (let k = 0; k < halfN; k++) {
    const angle = -2 * Math.PI * k / sz;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tReal = cos * oddReal[k] - sin * oddImag[k];
    const tImag = sin * oddReal[k] + cos * oddImag[k];
    re[k] = evenReal[k] + tReal;
    im[k] = evenImag[k] + tImag;
    re[k + halfN] = evenReal[k] - tReal;
    im[k + halfN] = evenImag[k] - tImag;
  }
}

function computeFFTBpm(sig: number[], fps: number): { bpm: number; snr: number } {
  const n = sig.length;
  const minFreq = 0.83;
  const maxFreq = 3.0;

  const zeroPadFactor = 8;
  const fftSize = Math.pow(2, Math.ceil(Math.log2(n * zeroPadFactor)));
  const real = new Array(fftSize).fill(0);
  const imag = new Array(fftSize).fill(0);
  for (let i = 0; i < n; i++) {
    const hannCoeff = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    real[i] = sig[i] * hannCoeff;
  }

  fft(real, imag, fftSize);

  const magnitudes: number[] = [];
  for (let i = 0; i < fftSize / 2; i++) {
    magnitudes.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
  }

  const scaledMinBin = Math.max(1, Math.floor(minFreq * fftSize / fps));
  const scaledMaxBin = Math.min(fftSize / 2 - 1, Math.ceil(maxFreq * fftSize / fps));

  let peakBin = scaledMinBin;
  let peakMag = 0;
  for (let i = scaledMinBin; i <= scaledMaxBin; i++) {
    if (magnitudes[i] > peakMag) {
      peakMag = magnitudes[i];
      peakBin = i;
    }
  }

  let peakFreq: number;
  if (peakBin > scaledMinBin && peakBin < scaledMaxBin) {
    const a = magnitudes[peakBin - 1];
    const b = magnitudes[peakBin];
    const c = magnitudes[peakBin + 1];
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-10) {
      const delta = 0.5 * (a - c) / denom;
      peakFreq = (peakBin + delta) * fps / fftSize;
    } else {
      peakFreq = peakBin * fps / fftSize;
    }
  } else {
    peakFreq = peakBin * fps / fftSize;
  }

  let totalPower = 0;
  let peakPower = 0;
  for (let i = scaledMinBin; i <= scaledMaxBin; i++) {
    const power = magnitudes[i] * magnitudes[i];
    totalPower += power;
    if (Math.abs(i - peakBin) <= 2) peakPower += power;
  }
  const snr = totalPower > 0 ? peakPower / totalPower : 0;
  return { bpm: Math.round(peakFreq * 60), snr };
}

function computeAutocorrelationBpm(sig: number[], fps: number): { bpm: number; confidence: number } {
  const minLag = Math.max(1, Math.ceil(fps * 60 / 180));
  const maxLag = Math.min(sig.length - 1, Math.floor(fps * 60 / 40));
  if (maxLag <= minLag) return { bpm: 0, confidence: 0 };

  const n = sig.length;
  const mean = sig.reduce((a, b) => a + b, 0) / n;
  const centered = sig.map(v => v - mean);
  const variance = centered.reduce((s, v) => s + v * v, 0);
  if (variance < 1e-10) return { bpm: 0, confidence: 0 };

  let bestLag = minLag;
  let bestCorr = -Infinity;
  const correlations: number[] = [];

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += centered[i] * centered[i + lag];
    }
    const corr = sum / variance;
    correlations.push(corr);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const freq = fps / bestLag;
  const bpm = Math.round(freq * 60);
  const confidence = Math.max(0, bestCorr);
  return { bpm, confidence };
}

function processFingerSignals(redValues: number[], greenValues: number[], timestamps: number[]): HeartRateResult {
  const invalidResult: HeartRateResult = {
    heartRate: 0,
    confidence: "low",
    waveform: [],
    signalQuality: 0,
    message: "Could not detect heart rate",
    validReading: false,
  };

  const n = redValues.length;
  if (n < 15) {
    return { ...invalidResult, message: "Not enough samples for analysis" };
  }

  let rawFps = 10;
  if (timestamps.length > 1) {
    const totalDuration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
    if (totalDuration > 0) {
      rawFps = (timestamps.length - 1) / totalDuration;
    }
  }

  const TARGET_FPS = 10;
  const needsInterpolation = rawFps < 4;

  let redSig: number[];
  let greenSig: number[];
  let actualFps: number;

  if (needsInterpolation && timestamps.length >= 3) {
    const interpRed = interpolateSignal(redValues, timestamps, TARGET_FPS);
    const interpGreen = interpolateSignal(greenValues, timestamps, TARGET_FPS);
    redSig = interpRed.signal;
    greenSig = interpGreen.signal;
    actualFps = interpRed.fps;
  } else {
    redSig = redValues;
    greenSig = greenValues;
    actualFps = rawFps;
  }

  const redDetrended = normalizeSignal(detrendSignal(redSig));
  const greenDetrended = normalizeSignal(detrendSignal(greenSig));

  const minFreq = 0.83;
  const maxFreq = 3.0;

  const redFiltered = bandpassFilter(redDetrended, actualFps, minFreq, maxFreq);
  const greenFiltered = bandpassFilter(greenDetrended, actualFps, minFreq, maxFreq);

  const smoothedRed = movingAverage(redFiltered, 3);
  const smoothedGreen = movingAverage(greenFiltered, 3);

  const fftRed = computeFFTBpm(smoothedRed, actualFps);
  const fftGreen = computeFFTBpm(smoothedGreen, actualFps);

  const acRed = computeAutocorrelationBpm(smoothedRed, actualFps);
  const acGreen = computeAutocorrelationBpm(smoothedGreen, actualFps);

  const peakRed = countPeaksBpm(smoothedRed, actualFps);
  const peakGreen = countPeaksBpm(smoothedGreen, actualFps);

  const candidates: Array<{bpm: number; score: number; method: string}> = [];
  if (fftRed.bpm >= 50 && fftRed.bpm <= 180) candidates.push({ bpm: fftRed.bpm, score: fftRed.snr, method: "fft-red" });
  if (fftGreen.bpm >= 50 && fftGreen.bpm <= 180) candidates.push({ bpm: fftGreen.bpm, score: fftGreen.snr * 1.1, method: "fft-green" });
  if (acRed.bpm >= 50 && acRed.bpm <= 180) candidates.push({ bpm: acRed.bpm, score: acRed.confidence * 0.8, method: "ac-red" });
  if (acGreen.bpm >= 50 && acGreen.bpm <= 180) candidates.push({ bpm: acGreen.bpm, score: acGreen.confidence * 0.9, method: "ac-green" });
  if (peakRed.bpm >= 50 && peakRed.bpm <= 180) candidates.push({ bpm: peakRed.bpm, score: peakRed.confidence * 0.7, method: "peak-red" });
  if (peakGreen.bpm >= 50 && peakGreen.bpm <= 180) candidates.push({ bpm: peakGreen.bpm, score: peakGreen.confidence * 0.75, method: "peak-green" });

  let bestBpm = 0;
  let bestScore = 0;
  let bestMethod = "none";

  const agreeing = candidates.filter(c => {
    return candidates.some(other => other !== c && Math.abs(other.bpm - c.bpm) <= 8);
  });
  if (agreeing.length >= 2) {
    agreeing.sort((a, b) => b.score - a.score);
    const agreedGroup = agreeing.filter(c => Math.abs(c.bpm - agreeing[0].bpm) <= 8);
    const avgBpm = Math.round(agreedGroup.reduce((s, c) => s + c.bpm, 0) / agreedGroup.length);
    bestBpm = avgBpm;
    bestScore = agreeing[0].score * 1.5;
    bestMethod = agreeing[0].method + "+agree(" + agreedGroup.length + ")";
  } else if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    bestBpm = candidates[0].bpm;
    bestScore = candidates[0].score;
    bestMethod = candidates[0].method;
  }

  const signalVariance = smoothedRed.reduce((s, v) => s + v * v, 0) / smoothedRed.length;
  const hasVariation = signalVariance > 1e-8;
  const isValidBpm = bestBpm >= 50 && bestBpm <= 180;
  const isValidSignal = bestScore > 0.06 && hasVariation;
  const validReading = isValidBpm && isValidSignal;
  const heartRate = validReading ? bestBpm : 0;

  let confidence: "high" | "medium" | "low";
  if (bestScore > 0.2 && n >= 30 && validReading && bestMethod.includes("agree")) confidence = "high";
  else if (bestScore > 0.10 && n >= 20 && validReading) confidence = "medium";
  else confidence = "low";

  const displaySig = smoothedGreen.length > 0 ? smoothedGreen : smoothedRed;
  const waveformLength = 100;
  const waveform: number[] = [];
  for (let i = 0; i < waveformLength; i++) {
    const idx = Math.floor(i * displaySig.length / waveformLength);
    waveform.push(displaySig[idx] || 0);
  }
  const maxWave = Math.max(...waveform.map(Math.abs)) || 1;
  const normalizedWaveform = waveform.map(v => v / maxWave);

  console.log(`HeartRate: ${n}raw/${redSig.length}interp rawFps=${rawFps.toFixed(1)} effectiveFps=${actualFps.toFixed(1)} best=${bestBpm}bpm score=${bestScore.toFixed(3)} method=${bestMethod} fftR=${fftRed.bpm}/${fftRed.snr.toFixed(2)} fftG=${fftGreen.bpm}/${fftGreen.snr.toFixed(2)} acR=${acRed.bpm}/${acRed.confidence.toFixed(2)} acG=${acGreen.bpm}/${acGreen.confidence.toFixed(2)} pkR=${peakRed.bpm}/${peakRed.confidence.toFixed(2)} pkG=${peakGreen.bpm}/${peakGreen.confidence.toFixed(2)}`);

  return {
    heartRate,
    confidence,
    waveform: normalizedWaveform,
    signalQuality: Math.round(bestScore * 100),
    validReading,
    message: validReading
      ? (confidence === "high" ? "Strong signal detected" : "Moderate signal - try holding still next time")
      : "Could not detect a reliable heart rate - press finger firmly and stay still",
  };
}

function processFaceSignals(signals: Array<{r: number; g: number; b: number}>, fps: number): HeartRateResult {
  const actualFps = fps || 10;
  const n = signals.length;

  const invalidResult: HeartRateResult = {
    heartRate: 0, confidence: "low", waveform: [], signalQuality: 0,
    message: "Could not detect heart rate", validReading: false,
  };

  if (n < 30) return { ...invalidResult, message: "Not enough samples for analysis" };

  const validSignals = signals.filter(s => s.r >= 0 && s.g >= 0 && s.b >= 0);
  if (validSignals.length < 30) return { ...invalidResult, message: "Too many failed frame captures" };

  const gValues = validSignals.map(s => s.g);
  const gMin = Math.min(...gValues);
  const gMax = Math.max(...gValues);
  if (gMax - gMin < 0.3) return { ...invalidResult, message: "No color variation detected - ensure face is visible and well-lit" };

  const rRaw = validSignals.map(s => s.r);
  const gRaw = validSignals.map(s => s.g);
  const bRaw = validSignals.map(s => s.b);
  const vn = validSignals.length;

  const rNorm = normalizeSignal(detrendSignal(rRaw));
  const gNorm = normalizeSignal(detrendSignal(gRaw));
  const bNorm = normalizeSignal(detrendSignal(bRaw));

  const windowSize = Math.max(Math.floor(actualFps * 1.6), 10);
  const posSignal = new Array(vn).fill(0);

  for (let start = 0; start < vn - windowSize; start += Math.floor(windowSize / 2)) {
    const end = Math.min(start + windowSize, vn);
    const len = end - start;
    const rWin = rNorm.slice(start, end);
    const gWin = gNorm.slice(start, end);
    const bWin = bNorm.slice(start, end);
    const rMean = rWin.reduce((a, b) => a + b, 0) / len;
    const gMean = gWin.reduce((a, b) => a + b, 0) / len;
    const bMean = bWin.reduce((a, b) => a + b, 0) / len;
    const rStd = Math.sqrt(rWin.reduce((s, v) => s + (v - rMean) ** 2, 0) / len) || 1;
    const gStd = Math.sqrt(gWin.reduce((s, v) => s + (v - gMean) ** 2, 0) / len) || 1;
    const bStd = Math.sqrt(bWin.reduce((s, v) => s + (v - bMean) ** 2, 0) / len) || 1;
    const rN = rWin.map(v => (v - rMean) / rStd);
    const gN = gWin.map(v => (v - gMean) / gStd);
    const bN = bWin.map(v => (v - bMean) / bStd);
    const xs = new Array(len);
    const ys = new Array(len);
    for (let i = 0; i < len; i++) {
      xs[i] = 3 * rN[i] - 2 * gN[i];
      ys[i] = 1.5 * rN[i] + gN[i] - 1.5 * bN[i];
    }
    const xsStd = Math.sqrt(xs.reduce((s: number, v: number) => s + v * v, 0) / len) || 1;
    const ysStd = Math.sqrt(ys.reduce((s: number, v: number) => s + v * v, 0) / len) || 1;
    const alpha = xsStd / ysStd;
    for (let i = 0; i < len; i++) posSignal[start + i] += xs[i] + alpha * ys[i];
  }

  const minFreq = 0.83;
  const maxFreq = 3.0;

  const filteredPOS = bandpassFilter(detrendSignal(posSignal), actualFps, minFreq, maxFreq);
  const filteredGreen = bandpassFilter(normalizeSignal(detrendSignal(gRaw)), actualFps, minFreq, maxFreq);

  const posResult = computeFFTBpm(filteredPOS, actualFps);
  const greenResult = computeFFTBpm(filteredGreen, actualFps);

  let bestBpm: number, bestSnr: number;
  if (posResult.snr >= greenResult.snr && posResult.snr > 0.05) {
    bestBpm = posResult.bpm; bestSnr = posResult.snr;
  } else if (greenResult.snr > 0.05) {
    bestBpm = greenResult.bpm; bestSnr = greenResult.snr;
  } else {
    bestBpm = posResult.snr >= greenResult.snr ? posResult.bpm : greenResult.bpm;
    bestSnr = Math.max(posResult.snr, greenResult.snr);
  }

  const isValid = bestBpm >= 50 && bestBpm <= 180 && bestSnr > 0.08;
  const heartRate = isValid ? bestBpm : 0;
  let confidence: "high" | "medium" | "low";
  if (bestSnr > 0.18 && vn >= 60 && isValid) confidence = "high";
  else if (bestSnr > 0.10 && vn >= 40 && isValid) confidence = "medium";
  else confidence = "low";

  const display = posResult.snr >= greenResult.snr ? filteredPOS : filteredGreen;
  const waveform: number[] = [];
  for (let i = 0; i < 100; i++) waveform.push(display[Math.floor(i * display.length / 100)] || 0);
  const mx = Math.max(...waveform.map(Math.abs)) || 1;

  return {
    heartRate, confidence,
    waveform: waveform.map(v => v / mx),
    signalQuality: Math.round(bestSnr * 100),
    validReading: isValid,
    message: isValid
      ? (confidence === "high" ? "Strong signal detected" : "Moderate signal - try better lighting next time")
      : "Could not detect a reliable heart rate - ensure good lighting and stay very still",
  };
}

function PulseWaveform({ waveform, color }: { waveform: number[]; color: string }) {
  const width = Dimensions.get("window").width - 64;
  const height = 80;
  const points = waveform.length;
  if (points === 0) return null;
  const stepX = width / (points - 1);
  const midY = height / 2;
  const amplitude = height * 0.4;
  return (
    <View style={{ width, height, overflow: "hidden" }}>
      {waveform.map((val, i) => {
        if (i === 0) return null;
        const x = i * stepX;
        const y = midY - val * amplitude;
        return (
          <View key={i} style={{
            position: "absolute", left: x - 1.5, top: y - 1.5, width: 3, height: 3,
            borderRadius: 1.5, backgroundColor: color, opacity: 0.8,
          }} />
        );
      })}
    </View>
  );
}

export default function HeartRateScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();
  const { recordVital } = useAvicenna();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<MeasurementState>("idle");
  const [countdown, setCountdown] = useState(MEASUREMENT_DURATION);
  const [sampleCount, setSampleCount] = useState(0);
  const [result, setResult] = useState<HeartRateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fingerDetected, setFingerDetected] = useState(false);
  const [liveBpm, setLiveBpm] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ current: 0, total: 0 });
  const cameraReadyRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const signalsRef = useRef<Array<{ r: number; g: number; b: number; timestamp: number }>>([]);
  const fingerRedRef = useRef<number[]>([]);
  const fingerGreenRef = useRef<number[]>([]);
  const fingerTimestampsRef = useRef<number[]>([]);
  const rgbHistoryRef = useRef<Array<{r: number; g: number; b: number}>>([]);
  const liveBpmRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fingerCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);
  const fingerConfirmCount = useRef(0);
  const measurementStartedRef = useRef(false);
  const measureActiveRef = useRef(false);
  const recordingRef = useRef(false);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  const pulseAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const startPulseAnimation = useCallback(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 400, easing: Easing.in(Easing.ease) })
      ), -1, false
    );
    pulseOpacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 400 }), withTiming(0.6, { duration: 400 })),
      -1, false
    );
  }, []);

  const stopPulseAnimation = useCallback(() => {
    cancelAnimation(pulseScale);
    cancelAnimation(pulseOpacity);
    pulseScale.value = 1;
    pulseOpacity.value = 0.6;
  }, []);

  const clearAllTimers = useCallback(() => {
    measureActiveRef.current = false;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (fingerCheckRef.current) { clearInterval(fingerCheckRef.current); fingerCheckRef.current = null; }
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
      stopPulseAnimation();
    };
  }, []);

  const handleCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
    if (IS_MOBILE) {
      setTimeout(() => {
        setTorchOn(true);
      }, 300);
    }
  }, []);


  const captureFrameFace = useCallback(async () => {
    if (!cameraRef.current || processingRef.current) return;
    processingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.1,
        base64: true,
        skipProcessing: true,
      });
      if (photo) {
        let rgb: { r: number; g: number; b: number };
        if (photo.base64) {
          rgb = await extractRGBFromBase64Web(photo.base64);
        } else if (photo.uri) {
          rgb = await extractRGBFromBase64Web(photo.uri);
        } else return;
        if (rgb.r >= 0 && rgb.g >= 0 && rgb.b >= 0) {
          signalsRef.current.push({ ...rgb, timestamp: Date.now() });
          setSampleCount(signalsRef.current.length);
        }
      }
    } catch {} finally {
      processingRef.current = false;
    }
  }, []);

  const fingerCheckErrorCount = useRef(0);

  const checkFingerPresence = useCallback(async () => {
    if (!cameraRef.current || processingRef.current || !cameraReadyRef.current) return;
    processingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.01,
        base64: false,
        skipProcessing: true,
      });
      fingerCheckErrorCount.current = 0;
      if (photo) {
        const rgb = await extractRGBNative(photo.uri);
        if (rgb.r >= 0) {
          rgbHistoryRef.current.push(rgb);
          if (rgbHistoryRef.current.length > RGB_SMOOTH_WINDOW * 2) {
            rgbHistoryRef.current = rgbHistoryRef.current.slice(-RGB_SMOOTH_WINDOW * 2);
          }
          const smoothed = smoothRGB(rgbHistoryRef.current);
          const detected = isFingerCovering(smoothed.r, smoothed.g, smoothed.b);
          console.log(`FingerCheck: r=${smoothed.r.toFixed(0)} g=${smoothed.g.toFixed(0)} b=${smoothed.b.toFixed(0)} detected=${detected} confirms=${fingerConfirmCount.current}`);
          if (detected) {
            fingerConfirmCount.current++;
            if (fingerConfirmCount.current >= FINGER_CONFIRM_FRAMES) {
              setFingerDetected(true);
              if (!measurementStartedRef.current) {
                measurementStartedRef.current = true;
                startFingerMeasurement();
              }
            }
          } else {
            fingerConfirmCount.current = Math.max(0, fingerConfirmCount.current - 1);
            if (fingerConfirmCount.current === 0) {
              setFingerDetected(false);
            }
          }
        }
      }
    } catch (e) {
      console.log("FingerCheck error:", e);
      fingerCheckErrorCount.current++;
      if (fingerCheckErrorCount.current >= 3) {
        console.log("takePictureAsync not available in video mode, showing manual start");
        if (fingerCheckRef.current) { clearInterval(fingerCheckRef.current); fingerCheckRef.current = null; }
        setFingerDetected(true);
      }
    } finally {
      processingRef.current = false;
    }
  }, []);

  const startFingerMeasurement = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (fingerCheckRef.current) { clearInterval(fingerCheckRef.current); fingerCheckRef.current = null; }

    fingerRedRef.current = [];
    fingerGreenRef.current = [];
    fingerTimestampsRef.current = [];
    liveBpmRef.current = 0;
    setSampleCount(0);
    setLiveBpm(0);
    setState("measuring");
    setCountdown(MEASUREMENT_DURATION);
    measureActiveRef.current = true;
    recordingRef.current = true;

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          try { cameraRef.current?.stopRecording(); } catch {}
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      if (!cameraRef.current) throw new Error("Camera not ready");

      const video = await cameraRef.current.recordAsync({
        maxDuration: MEASUREMENT_DURATION + 2,
      });

      recordingRef.current = false;

      if (!measureActiveRef.current) {
        try { await FileSystem.deleteAsync(video.uri, { idempotent: true }); } catch {}
        return;
      }

      setState("processing");

      const durationMs = MEASUREMENT_DURATION * 1000;
      const intervalMs = Math.round(1000 / EXTRACT_FPS);
      const totalFrames = Math.floor(durationMs / intervalMs);
      setAnalyzeProgress({ current: 0, total: totalFrames });

      const redValues: number[] = [];
      const greenValues: number[] = [];
      const timestamps: number[] = [];

      for (let i = 0; i < totalFrames; i += EXTRACT_BATCH_SIZE) {
        if (!measureActiveRef.current) break;

        const batch: Promise<{ rgb: { r: number; g: number; b: number }; timeMs: number }>[] = [];
        for (let j = 0; j < EXTRACT_BATCH_SIZE && (i + j) < totalFrames; j++) {
          const frameIdx = i + j;
          const timeMs = frameIdx * intervalMs;
          batch.push(
            VideoThumbnails.getThumbnailAsync(video.uri, { time: timeMs })
              .then(async (thumb) => {
                const rgb = await extractRGBNative(thumb.uri);
                try { await FileSystem.deleteAsync(thumb.uri, { idempotent: true }); } catch {}
                return { rgb, timeMs };
              })
              .catch(() => ({ rgb: { r: -1, g: -1, b: -1 } as { r: number; g: number; b: number }, timeMs }))
          );
        }

        const results = await Promise.all(batch);
        for (const { rgb, timeMs } of results) {
          if (rgb.r >= 0 && isFingerCovering(rgb.r, rgb.g, rgb.b, true)) {
            redValues.push(rgb.r);
            greenValues.push(rgb.g);
            timestamps.push(timeMs);
          }
        }

        setAnalyzeProgress({ current: Math.min(i + EXTRACT_BATCH_SIZE, totalFrames), total: totalFrames });
        setSampleCount(redValues.length);
      }

      try { await FileSystem.deleteAsync(video.uri, { idempotent: true }); } catch {}

      if (!measureActiveRef.current) return;

      fingerRedRef.current = redValues;
      fingerGreenRef.current = greenValues;
      fingerTimestampsRef.current = timestamps;

      if (redValues.length < MIN_SAMPLES) {
        setError(t(
          "Not enough data collected. Press your finger firmly over the camera and flash.",
          "لم يتم جمع بيانات كافية. اضغط إصبعك بقوة على الكاميرا والفلاش."
        ));
        setState("idle");
        measurementStartedRef.current = false;
        return;
      }

      const data = processFingerSignals(redValues, greenValues, timestamps);
      setResult(data);
      setState("result");
      setTorchOn(false);
      if (data.validReading) {
        startPulseAnimation();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        getProfile().then((profile) => {
          saveProfile({ ...profile, lastBpm: data.heartRate, lastBpmDate: Date.now() });
        });
        recordVital("heart_rate", data.heartRate, data.confidence, true).catch(() => {});
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (err) {
      console.log("Recording/analysis error:", err);
      recordingRef.current = false;
      if (measureActiveRef.current) {
        setError(t("Recording failed. Please try again.", "فشل التسجيل. يرجى المحاولة مرة أخرى."));
        setState("idle");
        measurementStartedRef.current = false;
      }
    }
  }, []);

  const startWaitingForFinger = useCallback(() => {
    setError(null);
    setResult(null);
    setSampleCount(0);
    setLiveBpm(0);
    liveBpmRef.current = 0;
    fingerConfirmCount.current = 0;
    measurementStartedRef.current = false;
    rgbHistoryRef.current = [];
    setFingerDetected(false);
    setState("waiting_finger");

    setTorchOn(false);
    setTimeout(() => setTorchOn(true), 100);

    setTimeout(() => {
      fingerCheckRef.current = setInterval(checkFingerPresence, FINGER_DETECT_INTERVAL_MS);
    }, 500);
  }, [checkFingerPresence]);

  const startFaceMeasurement = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setResult(null);
    setSampleCount(0);
    signalsRef.current = [];
    setState("measuring");
    setCountdown(MEASUREMENT_DURATION);

    intervalRef.current = setInterval(captureFrameFace, 125);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (countdownRef.current) clearInterval(countdownRef.current);
          processFaceResult();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [captureFrameFace]);

  const processFaceResult = useCallback(() => {
    setState("processing");
    try {
      const signals = signalsRef.current;
      if (signals.length < MIN_SAMPLES) {
        setError(t(
          "Not enough data collected. Try again with better lighting.",
          "لم يتم جمع بيانات كافية. حاول مرة أخرى في إضاءة أفضل."
        ));
        setState("idle");
        return;
      }
      const timestamps = signals.map(s => s.timestamp);
      let fps = 8;
      if (timestamps.length > 1) {
        const dur = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
        if (dur > 0) fps = (timestamps.length - 1) / dur;
      }
      const rgbSignals = signals.map(s => ({ r: s.r, g: s.g, b: s.b }));
      const data = processFaceSignals(rgbSignals, fps);
      setResult(data);
      setState("result");
      if (data.validReading) {
        startPulseAnimation();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        getProfile().then((profile) => {
          saveProfile({ ...profile, lastBpm: data.heartRate, lastBpmDate: Date.now() });
        });
        recordVital("heart_rate", data.heartRate, data.confidence, true).catch(() => {});
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      setError(t("Failed to process data.", "فشل في المعالجة."));
      setState("idle");
    }
  }, []);

  const resetMeasurement = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearAllTimers();
    stopPulseAnimation();
    if (recordingRef.current) {
      try { cameraRef.current?.stopRecording(); } catch {}
      recordingRef.current = false;
    }
    signalsRef.current = [];
    fingerRedRef.current = [];
    fingerGreenRef.current = [];
    fingerTimestampsRef.current = [];
    rgbHistoryRef.current = [];
    liveBpmRef.current = 0;
    measurementStartedRef.current = false;
    fingerConfirmCount.current = 0;
    setState("idle");
    setResult(null);
    setError(null);
    setSampleCount(0);
    setLiveBpm(0);
    setCountdown(MEASUREMENT_DURATION);
    setFingerDetected(false);
    setAnalyzeProgress({ current: 0, total: 0 });
    if (IS_MOBILE) {
      setTorchOn(true);
    }
  }, []);

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionIconCircle}>
            <Ionicons name="heart" size={40} color={Colors.light.emergency} />
          </View>
          <Text style={styles.permissionTitle}>
            {t("Camera Access Required", "مطلوب الوصول إلى الكاميرا")}
          </Text>
          <Text style={styles.permissionText}>
            {IS_MOBILE
              ? t(
                  "Place your finger over the back camera and flash to measure your heart rate. Please allow camera access to continue.",
                  "ضع إصبعك على الكاميرا الخلفية والفلاش لقياس نبضات قلبك. يرجى السماح بالوصول إلى الكاميرا للاستمرار."
                )
              : t(
                  "The heart rate monitor uses your front camera to detect subtle color changes in your face. Please allow camera access.",
                  "يستخدم مقياس النبض الكاميرا الأمامية لاكتشاف تغييرات اللون في وجهك. يرجى السماح بالوصول."
                )}
          </Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>
              {t("Allow Camera", "السماح بالكاميرا")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const confidenceColor =
    result?.confidence === "high" ? Colors.light.success
      : result?.confidence === "medium" ? Colors.light.warning
        : Colors.light.emergency;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => { setTorchOn(false); setTimeout(() => router.back(), 50); }} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("Heart Rate Monitor", "مقياس نبضات القلب")}
        </Text>
        <View style={styles.headerButton} />
      </View>

      {state !== "result" ? (
        <View style={styles.cameraSection}>
          {IS_MOBILE ? (
            <View style={styles.fingerCircleOuter}>
              <View style={styles.fingerCircleClip}>
                <CameraView
                  ref={cameraRef}
                  style={styles.fingerCameraFill}
                  facing="back"
                  mode="video"
                  enableTorch={torchOn}
                  animateShutter={false}
                  onCameraReady={handleCameraReady}
                />
                <View style={[
                  styles.fingerCircleBorder,
                  fingerDetected ? styles.fingerCircleDetected : styles.fingerCircleWaiting,
                ]}>
                  {state === "measuring" && fingerDetected ? (
                    <View style={styles.fingerInnerPulse}>
                      <Ionicons name="heart" size={36} color={Colors.light.emergency} />
                      {liveBpm > 0 && (
                        <Text style={styles.liveBpmText}>{liveBpm}</Text>
                      )}
                    </View>
                  ) : state === "measuring" && !fingerDetected ? (
                    <View style={styles.fingerLostInner}>
                      <Ionicons name="finger-print" size={36} color={Colors.light.emergency} />
                      <Text style={styles.fingerLostText}>
                        {t("Replace finger", "أعد وضع الإصبع")}
                      </Text>
                    </View>
                  ) : fingerDetected ? (
                    <View style={styles.fingerDetectedInner}>
                      <Ionicons name="checkmark-circle" size={36} color={Colors.light.success} />
                      <Text style={styles.fingerDetectedText}>
                        {t("Finger detected", "تم اكتشاف الإصبع")}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.fingerWaitInner}>
                      <Ionicons name="finger-print" size={44} color="rgba(255,255,255,0.8)" />
                    </View>
                  )}
                </View>
              </View>
              {state === "measuring" && (
                <View style={styles.fingerCountdownRow}>
                  <Text style={styles.fingerCountdownText}>{countdown}s</Text>
                  <View style={styles.fingerProgressBg}>
                    <View style={[styles.fingerProgressFill, {
                      width: `${((MEASUREMENT_DURATION - countdown) / MEASUREMENT_DURATION) * 100}%`,
                    }]} />
                  </View>
                  <Text style={styles.fingerSampleText}>
                    {t("Recording...", "جاري التسجيل...")}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.cameraContainer}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="front"
                animateShutter={false}
                onCameraReady={handleCameraReady}
              />
              <View style={styles.cameraOverlay}>
                <View style={styles.faceGuide}>
                  <View style={[styles.cornerTL, styles.corner]} />
                  <View style={[styles.cornerTR, styles.corner]} />
                  <View style={[styles.cornerBL, styles.corner]} />
                  <View style={[styles.cornerBR, styles.corner]} />
                </View>
              </View>
              {state === "measuring" && (
                <View style={styles.countdownOverlay}>
                  <Text style={styles.countdownText}>{countdown}s</Text>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, {
                      width: `${((MEASUREMENT_DURATION - countdown) / MEASUREMENT_DURATION) * 100}%`,
                    }]} />
                  </View>
                  <Text style={styles.sampleCountText}>
                    {sampleCount} {t("frames", "إطار")}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.instructionSection}>
            {state === "idle" && (
              <>
                <Text style={[styles.instructionTitle, isRTL && { textAlign: "right" }]}>
                  {IS_MOBILE
                    ? t("Place Your Finger", "ضع إصبعك")
                    : t("Position Your Face", "ضع وجهك")}
                </Text>
                <Text style={[styles.instructionText, isRTL && { textAlign: "right" }]}>
                  {IS_MOBILE
                    ? t(
                        "Cover the back camera and flash completely with your fingertip. The circle will turn green when your finger is properly placed.",
                        "غطِّ الكاميرا الخلفية والفلاش بالكامل بطرف إصبعك. ستتحول الدائرة إلى اللون الأخضر عندما يكون إصبعك موضوعاً بشكل صحيح."
                      )
                    : t(
                        "Hold your phone steady and look at the camera. Ensure good, natural lighting on your face. Stay very still during measurement.",
                        "امسك هاتفك ثابتاً وانظر إلى الكاميرا. تأكد من الإضاءة الطبيعية الجيدة على وجهك."
                      )}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.startButton,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={IS_MOBILE ? startWaitingForFinger : startFaceMeasurement}
                >
                  <Ionicons name="heart" size={20} color="#fff" />
                  <Text style={styles.startButtonText}>
                    {IS_MOBILE
                      ? t("Start", "ابدأ")
                      : t("Start Measurement", "بدء القياس")}
                  </Text>
                </Pressable>
              </>
            )}

            {state === "waiting_finger" && (
              <>
                <View style={styles.measuringRow}>
                  <View style={[styles.pulsingDot, { backgroundColor: fingerDetected ? Colors.light.success : Colors.light.warning }]} />
                  <Text style={styles.measuringText}>
                    {fingerDetected
                      ? t("Finger detected!", "تم اكتشاف الإصبع!")
                      : t("Waiting for finger...", "في انتظار الإصبع...")}
                  </Text>
                </View>
                <Text style={[styles.instructionText, isRTL && { textAlign: "right" }]}>
                  {t(
                    "Press your fingertip firmly over the camera lens and flash light.",
                    "اضغط طرف إصبعك بقوة على عدسة الكاميرا وضوء الفلاش."
                  )}
                </Text>
                {fingerDetected && !measurementStartedRef.current && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.startButton,
                      pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                    onPress={() => {
                      if (!measurementStartedRef.current) {
                        measurementStartedRef.current = true;
                        startFingerMeasurement();
                      }
                    }}
                  >
                    <Ionicons name="videocam" size={20} color="#fff" />
                    <Text style={styles.startButtonText}>
                      {t("Start Recording", "بدء التسجيل")}
                    </Text>
                  </Pressable>
                )}
                <Pressable style={styles.cancelButton} onPress={resetMeasurement}>
                  <Text style={styles.cancelButtonText}>{t("Cancel", "إلغاء")}</Text>
                </Pressable>
              </>
            )}

            {state === "measuring" && (
              <>
                <View style={styles.measuringRow}>
                  <View style={[styles.pulsingDot, { backgroundColor: Colors.light.success }]} />
                  <Text style={styles.measuringText}>
                    {IS_MOBILE
                      ? t("Recording...", "جاري التسجيل...")
                      : t("Measuring...", "جاري القياس...")}
                  </Text>
                </View>
                <Text style={[styles.instructionText, isRTL && { textAlign: "right" }]}>
                  {t("Stay still and breathe normally", "ابقَ ثابتاً وتنفس بشكل طبيعي")}
                </Text>
                <Pressable style={styles.cancelButton} onPress={resetMeasurement}>
                  <Text style={styles.cancelButtonText}>{t("Cancel", "إلغاء")}</Text>
                </Pressable>
              </>
            )}

            {state === "processing" && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
                <Text style={styles.processingText}>
                  {analyzeProgress.total > 0
                    ? t(
                        `Analyzing frames... ${analyzeProgress.current}/${analyzeProgress.total}`,
                        `جاري تحليل الإطارات... ${analyzeProgress.current}/${analyzeProgress.total}`
                      )
                    : t("Analyzing pulse data...", "جاري تحليل بيانات النبض...")}
                </Text>
                {analyzeProgress.total > 0 && (
                  <View style={{ width: 200, marginTop: 8 }}>
                    <View style={styles.fingerProgressBg}>
                      <View style={[styles.fingerProgressFill, {
                        width: `${(analyzeProgress.current / analyzeProgress.total) * 100}%`,
                      }]} />
                    </View>
                  </View>
                )}
                {sampleCount > 0 && (
                  <Text style={[styles.processingText, { fontSize: 13, marginTop: 4 }]}>
                    {sampleCount} {t("valid frames", "إطار صالح")}
                  </Text>
                )}
                <Pressable style={[styles.cancelButton, { marginTop: 16 }]} onPress={resetMeasurement}>
                  <Text style={styles.cancelButtonText}>{t("Cancel", "إلغاء")}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      ) : result ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.resultSection} showsVerticalScrollIndicator={false}>
          {result.validReading ? (
            <>
              <Animated.View style={[styles.bpmCircle, pulseAnimStyle]}>
                <Ionicons name="heart" size={28} color={Colors.light.emergency} />
                <Text style={styles.bpmValue}>{result.heartRate}</Text>
                <Text style={styles.bpmLabel}>BPM</Text>
              </Animated.View>
              <View style={[styles.confidenceBadge, { backgroundColor: confidenceColor + "20" }]}>
                <View style={[styles.confidenceDot, { backgroundColor: confidenceColor }]} />
                <Text style={[styles.confidenceText, { color: confidenceColor }]}>
                  {result.confidence === "high"
                    ? t("High Confidence", "ثقة عالية")
                    : result.confidence === "medium"
                      ? t("Medium Confidence", "ثقة متوسطة")
                      : t("Low Confidence", "ثقة منخفضة")}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.noReadingCircle}>
              <Ionicons name="heart-dislike-outline" size={32} color={Colors.light.textTertiary} />
              <Text style={styles.noReadingText}>{"\u2014"}</Text>
              <Text style={styles.noReadingLabel}>BPM</Text>
            </View>
          )}

          <Text style={[styles.resultMessage, isRTL && { textAlign: "right" }]}>
            {result.validReading
              ? result.message
              : IS_MOBILE
                ? t(
                    "Could not detect a reliable heart rate. Press your finger more firmly over the camera and flash, and stay completely still.",
                    "لم يتمكن من اكتشاف نبضات قلب موثوقة. اضغط إصبعك بقوة أكبر على الكاميرا والفلاش، وابقَ ثابتاً تماماً."
                  )
                : t(
                    "Could not detect a reliable heart rate. Try again with better lighting, hold very still, and make sure your face is clearly visible.",
                    "لم يتمكن من اكتشاف نبضات قلب موثوقة. حاول مرة أخرى مع إضاءة أفضل وابقَ ثابتاً."
                  )}
          </Text>

          {result.validReading && result.waveform && result.waveform.length > 0 && (
            <View style={styles.waveformContainer}>
              <Text style={styles.waveformLabel}>{t("Pulse Waveform", "موجة النبض")}</Text>
              <PulseWaveform waveform={result.waveform} color={Colors.light.emergency} />
            </View>
          )}

          {result.validReading && (
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{result.signalQuality}%</Text>
                <Text style={styles.statLabel}>{t("Signal Quality", "جودة الإشارة")}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {result.heartRate < 60 ? t("Low", "منخفض")
                    : result.heartRate > 100 ? t("High", "مرتفع")
                      : t("Normal", "طبيعي")}
                </Text>
                <Text style={styles.statLabel}>{t("Range", "النطاق")}</Text>
              </View>
            </View>
          )}

          {!result.validReading && (
            <View style={styles.tipsContainer}>
              <Text style={[styles.tipsTitle, isRTL && { textAlign: "right" }]}>
                {t("Tips for better results:", "نصائح لنتائج أفضل:")}
              </Text>
              {IS_MOBILE ? (
                <>
                  <View style={[styles.tipRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <Ionicons name="finger-print" size={16} color={Colors.light.primary} />
                    <Text style={[styles.tipText, isRTL && { textAlign: "right" }]}>
                      {t("Press finger firmly over camera AND flash", "اضغط الإصبع بقوة على الكاميرا والفلاش")}
                    </Text>
                  </View>
                  <View style={[styles.tipRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <Ionicons name="hand-left-outline" size={16} color={Colors.light.primary} />
                    <Text style={[styles.tipText, isRTL && { textAlign: "right" }]}>
                      {t("Keep your hand completely still", "أبقِ يدك ثابتة تماماً")}
                    </Text>
                  </View>
                  <View style={[styles.tipRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <Ionicons name="flash-outline" size={16} color={Colors.light.primary} />
                    <Text style={[styles.tipText, isRTL && { textAlign: "right" }]}>
                      {t("Make sure the flash light is on and visible through your finger", "تأكد أن ضوء الفلاش مضاء ومرئي عبر إصبعك")}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.tipRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <Ionicons name="sunny-outline" size={16} color={Colors.light.primary} />
                    <Text style={[styles.tipText, isRTL && { textAlign: "right" }]}>
                      {t("Use natural, even lighting on your face", "استخدم إضاءة طبيعية متساوية على وجهك")}
                    </Text>
                  </View>
                  <View style={[styles.tipRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <Ionicons name="phone-portrait-outline" size={16} color={Colors.light.primary} />
                    <Text style={[styles.tipText, isRTL && { textAlign: "right" }]}>
                      {t("Hold the phone completely still", "أمسك الهاتف ثابتاً تماماً")}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.9 }]}
            onPress={resetMeasurement}
          >
            <Ionicons name="refresh" size={18} color={Colors.light.primary} />
            <Text style={styles.retryButtonText}>{t("Measure Again", "قياس مرة أخرى")}</Text>
          </Pressable>

          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.light.textTertiary} />
            <Text style={[styles.disclaimerText, isRTL && { textAlign: "right" }]}>
              {t(
                "This is not a medical device. Results are approximate and for informational purposes only. Consult a healthcare professional for accurate measurements.",
                "هذا ليس جهازاً طبياً. النتائج تقريبية ولأغراض إعلامية فقط. استشر مختصاً في الرعاية الصحية للحصول على قياسات دقيقة."
              )}
            </Text>
          </View>
        </ScrollView>
      ) : null}

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={Colors.light.accent} />
          <Text style={[styles.errorText, isRTL && { textAlign: "right" }]}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 36,
    gap: 4,
  },
  permissionIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.emergencyLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 10,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  permissionButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  cameraSection: {
    flex: 1,
    padding: 16,
  },
  fingerCircleOuter: {
    alignSelf: "center",
    alignItems: "center",
    marginTop: 24,
    gap: 20,
  },
  fingerCircleClip: {
    width: 240,
    height: 240,
    borderRadius: 120,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  fingerCameraFill: {
    width: 240,
    height: 240,
  },
  fingerCircleBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 120,
    borderWidth: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  fingerCircleWaiting: {
    borderColor: Colors.light.emergency,
  },
  fingerCircleDetected: {
    borderColor: Colors.light.success,
  },
  fingerCountdownRow: {
    alignItems: "center",
    width: 240,
  },
  fingerCountdownText: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 6,
  },
  fingerProgressBg: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.borderLight,
  },
  fingerProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.primary,
  },
  fingerSampleText: {
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    marginTop: 4,
  },
  fingerWaitInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  fingerDetectedInner: {
    alignItems: "center",
    gap: 4,
  },
  fingerDetectedText: {
    fontSize: 11,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.success,
    textAlign: "center",
  },
  fingerInnerPulse: {
    alignItems: "center",
    gap: 2,
  },
  liveBpmText: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.emergency,
  },
  fingerLostInner: {
    alignItems: "center",
    gap: 4,
  },
  fingerLostText: {
    fontSize: 11,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.emergency,
    textAlign: "center",
  },
  cameraContainer: {
    aspectRatio: 3 / 4,
    width: "100%",
    maxHeight: "55%",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000",
    alignSelf: "center",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  faceGuide: {
    width: 180,
    height: 220,
    position: "relative" as const,
  },
  corner: {
    position: "absolute" as const,
    width: 30,
    height: 30,
    borderColor: "rgba(255,255,255,0.7)",
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  countdownOverlay: {
    position: "absolute" as const,
    bottom: 16,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  countdownText: {
    fontSize: 24,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  progressBarBg: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.primaryLight,
  },
  sampleCountText: {
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  instructionSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  instructionTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 8,
    textAlign: "center",
  },
  instructionText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.emergency,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: Colors.light.emergency,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  measuringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.light.emergency,
  },
  measuringText: {
    fontSize: 18,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  liveBpmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.light.emergencyLight,
    borderRadius: 12,
  },
  liveBpmDisplay: {
    fontSize: 16,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.emergency,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.light.borderLight,
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  processingContainer: {
    alignItems: "center",
    gap: 16,
  },
  processingText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  resultSection: {
    alignItems: "center",
    padding: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  bpmCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.light.emergencyLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 4,
    borderColor: Colors.light.emergency + "40",
    shadowColor: Colors.light.emergency,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  noReadingCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.light.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 4,
    borderColor: Colors.light.textTertiary + "30",
  },
  noReadingText: {
    fontSize: 48,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.textTertiary,
    marginTop: 2,
  },
  noReadingLabel: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textTertiary,
    opacity: 0.7,
    marginTop: -4,
  },
  bpmValue: {
    fontSize: 48,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.emergency,
    marginTop: 2,
  },
  bpmLabel: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.emergency,
    opacity: 0.7,
    marginTop: -4,
  },
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 12,
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
  },
  resultMessage: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  waveformContainer: {
    width: "100%",
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  waveformLabel: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    width: "100%",
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  statValue: {
    fontSize: 18,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
  tipsContainer: {
    width: "100%",
    backgroundColor: Colors.light.primarySurface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  tipsTitle: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.light.primarySurface,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.primary,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: Colors.light.borderLight,
    borderRadius: 12,
    width: "100%",
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    lineHeight: 16,
  },
  errorBanner: {
    position: "absolute" as const,
    bottom: 40,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    backgroundColor: Colors.light.accentLight,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.accent,
  },
});
