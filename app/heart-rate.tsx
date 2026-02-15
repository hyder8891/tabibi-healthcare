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
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { getProfile, saveProfile } from "@/lib/storage";

const MEASUREMENT_DURATION = 20;
const CAPTURE_FPS = Platform.OS === "web" ? 8 : 4;
const MIN_SAMPLES = 30;

type MeasurementState = "idle" | "measuring" | "processing" | "result";

interface RppgResult {
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
      img.onerror = () => {
        resolve({ r: -1, g: -1, b: -1 });
      };
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

async function extractRGBFromPhotoNative(uri: string, photoWidth: number, photoHeight: number): Promise<{ r: number; g: number; b: number }> {
  try {
    const cropX = Math.floor(photoWidth * 0.2);
    const cropY = Math.floor(photoHeight * 0.3);
    const cropW = Math.floor(photoWidth * 0.6);
    const cropH = Math.floor(photoHeight * 0.4);

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        { crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } },
        { resize: { width: 4, height: 4 } },
      ],
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

function processRppgClient(signals: Array<{r: number; g: number; b: number}>, fps: number): RppgResult {
  const actualFps = fps || 10;
  const n = signals.length;

  const invalidResult: RppgResult = {
    heartRate: 0,
    confidence: "low",
    waveform: [],
    signalQuality: 0,
    message: "Could not detect heart rate",
    validReading: false,
  };

  if (n < 30) {
    return { ...invalidResult, message: "Not enough samples for analysis" };
  }

  const validSignals = signals.filter(s => s.r >= 0 && s.g >= 0 && s.b >= 0);
  if (validSignals.length < 30) {
    return { ...invalidResult, message: "Too many failed frame captures" };
  }

  const gValues = validSignals.map(s => s.g);
  const gMin = Math.min(...gValues);
  const gMax = Math.max(...gValues);
  const gRange = gMax - gMin;

  if (gRange < 0.3) {
    return { ...invalidResult, message: "No color variation detected - ensure face is visible and well-lit" };
  }

  const rRaw = validSignals.map(s => s.r);
  const gRaw = validSignals.map(s => s.g);
  const bRaw = validSignals.map(s => s.b);
  const vn = validSignals.length;

  function detrendSignal(sig: number[]) {
    const len = sig.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < len; i++) {
      sumX += i;
      sumY += sig[i];
      sumXY += i * sig[i];
      sumXX += i * i;
    }
    const slope = (len * sumXY - sumX * sumY) / (len * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / len;
    return sig.map((v, i) => v - (slope * i + intercept));
  }

  function normalizeSignal(sig: number[]) {
    const mean = sig.reduce((a, b) => a + b, 0) / sig.length;
    const std = Math.sqrt(sig.reduce((s, v) => s + (v - mean) ** 2, 0) / sig.length) || 1;
    return sig.map(v => (v - mean) / std);
  }

  const rDetrend = detrendSignal(rRaw);
  const gDetrend = detrendSignal(gRaw);
  const bDetrend = detrendSignal(bRaw);

  const rNorm = normalizeSignal(rDetrend);
  const gNorm = normalizeSignal(gDetrend);
  const bNorm = normalizeSignal(bDetrend);

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

    for (let i = 0; i < len; i++) {
      posSignal[start + i] += xs[i] + alpha * ys[i];
    }
  }

  const posDetrended = detrendSignal(posSignal);

  const greenDetrended = detrendSignal(gRaw);
  const greenNormalized = normalizeSignal(greenDetrended);

  const minFreq = 0.75;
  const maxFreq = 3.0;

  function bandpassFilter(sig: number[], sampleRate: number, lowFreq: number, highFreq: number) {
    const result = new Array(sig.length);

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
    result[0] = hp2[0];
    for (let i = 1; i < sig.length; i++) {
      result[i] = result[i - 1] + lpAlpha * (hp2[i] - result[i - 1]);
    }
    const lp2 = new Array(sig.length);
    lp2[0] = result[0];
    for (let i = 1; i < sig.length; i++) {
      lp2[i] = lp2[i - 1] + lpAlpha * (result[i] - lp2[i - 1]);
    }

    return lp2;
  }

  const filteredPOS = bandpassFilter(posDetrended, actualFps, minFreq, maxFreq);
  const filteredGreen = bandpassFilter(greenNormalized, actualFps, minFreq, maxFreq);

  function computeFFTBpm(filtered: number[], sigLen: number) {
    const zeroPadFactor = 4;
    const fftSize = Math.pow(2, Math.ceil(Math.log2(sigLen * zeroPadFactor)));
    const real = new Array(fftSize).fill(0);
    const imag = new Array(fftSize).fill(0);

    for (let i = 0; i < sigLen; i++) {
      const hannCoeff = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (sigLen - 1));
      real[i] = filtered[i] * hannCoeff;
    }

    function fft(re: number[], im: number[], sz: number) {
      if (sz <= 1) return;
      const halfN = sz / 2;
      const evenReal = new Array(halfN);
      const evenImag = new Array(halfN);
      const oddReal = new Array(halfN);
      const oddImag = new Array(halfN);

      for (let i = 0; i < halfN; i++) {
        evenReal[i] = re[2 * i];
        evenImag[i] = im[2 * i];
        oddReal[i] = re[2 * i + 1];
        oddImag[i] = im[2 * i + 1];
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

    fft(real, imag, fftSize);

    const magnitudes: number[] = [];
    for (let i = 0; i < fftSize / 2; i++) {
      magnitudes.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
    }

    const scaledMinBin = Math.max(1, Math.floor(minFreq * fftSize / actualFps));
    const scaledMaxBin = Math.min(fftSize / 2 - 1, Math.ceil(maxFreq * fftSize / actualFps));

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
      const alphaVal = magnitudes[peakBin - 1];
      const beta = magnitudes[peakBin];
      const gamma = magnitudes[peakBin + 1];
      const denom = alphaVal - 2 * beta + gamma;
      if (Math.abs(denom) > 1e-10) {
        const delta = 0.5 * (alphaVal - gamma) / denom;
        peakFreq = (peakBin + delta) * actualFps / fftSize;
      } else {
        peakFreq = peakBin * actualFps / fftSize;
      }
    } else {
      peakFreq = peakBin * actualFps / fftSize;
    }

    let totalPower = 0;
    let peakPower = 0;
    for (let i = scaledMinBin; i <= scaledMaxBin; i++) {
      const power = magnitudes[i] * magnitudes[i];
      totalPower += power;
      if (Math.abs(i - peakBin) <= 2) {
        peakPower += power;
      }
    }
    const snr = totalPower > 0 ? peakPower / totalPower : 0;

    return { bpm: Math.round(peakFreq * 60), snr, peakMag };
  }

  const posResult = computeFFTBpm(filteredPOS, vn);
  const greenResult = computeFFTBpm(filteredGreen, vn);

  let bestBpm: number;
  let bestSnr: number;
  let usedMethod: string;

  if (posResult.snr >= greenResult.snr && posResult.snr > 0.05) {
    bestBpm = posResult.bpm;
    bestSnr = posResult.snr;
    usedMethod = "POS";
  } else if (greenResult.snr > 0.05) {
    bestBpm = greenResult.bpm;
    bestSnr = greenResult.snr;
    usedMethod = "Green";
  } else {
    bestBpm = posResult.snr >= greenResult.snr ? posResult.bpm : greenResult.bpm;
    bestSnr = Math.max(posResult.snr, greenResult.snr);
    usedMethod = "fallback";
  }

  const signalVariance = filteredPOS.reduce((s, v) => s + v * v, 0) / vn;
  const hasVariation = signalVariance > 1e-10;

  const isValidBpm = bestBpm >= 45 && bestBpm <= 180;
  const isValidSignal = bestSnr > 0.08 && hasVariation;
  const validReading = isValidBpm && isValidSignal;

  const heartRate = validReading ? Math.max(45, Math.min(180, bestBpm)) : 0;

  let confidence: "high" | "medium" | "low";
  if (bestSnr > 0.18 && vn >= 60 && hasVariation && validReading) {
    confidence = "high";
  } else if (bestSnr > 0.10 && vn >= 40 && hasVariation && validReading) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  const displayFiltered = posResult.snr >= greenResult.snr ? filteredPOS : filteredGreen;
  const waveformLength = 100;
  const waveform: number[] = [];
  for (let i = 0; i < waveformLength; i++) {
    const idx = Math.floor(i * displayFiltered.length / waveformLength);
    waveform.push(displayFiltered[idx] || 0);
  }

  const maxWave = Math.max(...waveform.map(Math.abs)) || 1;
  const normalizedWaveform = waveform.map(v => v / maxWave);

  console.log(`rPPG: ${vn} valid samples, fps=${actualFps.toFixed(1)}, POS(bpm=${posResult.bpm},snr=${posResult.snr.toFixed(3)}), Green(bpm=${greenResult.bpm},snr=${greenResult.snr.toFixed(3)}), used=${usedMethod}, valid=${validReading}`);

  return {
    heartRate,
    confidence,
    waveform: normalizedWaveform,
    signalQuality: Math.round(bestSnr * 100),
    validReading,
    message: validReading
      ? (confidence === "high"
        ? "Strong signal detected"
        : "Moderate signal - try better lighting next time")
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
          <View
            key={i}
            style={{
              position: "absolute",
              left: x - 1.5,
              top: y - 1.5,
              width: 3,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: color,
              opacity: 0.8,
            }}
          />
        );
      })}
    </View>
  );
}

export default function HeartRateScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<MeasurementState>("idle");
  const [countdown, setCountdown] = useState(MEASUREMENT_DURATION);
  const [sampleCount, setSampleCount] = useState(0);
  const [result, setResult] = useState<RppgResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const signalsRef = useRef<Array<{ r: number; g: number; b: number; timestamp: number }>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processingRef = useRef(false);
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
      ),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.6, { duration: 400 })
      ),
      -1,
      false
    );
  }, []);

  const stopPulseAnimation = useCallback(() => {
    cancelAnimation(pulseScale);
    cancelAnimation(pulseOpacity);
    pulseScale.value = 1;
    pulseOpacity.value = 0.6;
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      stopPulseAnimation();
    };
  }, []);

  const captureFrame = useCallback(async () => {
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
        if (Platform.OS === "web") {
          if (photo.base64) {
            rgb = await extractRGBFromBase64Web(photo.base64);
          } else if (photo.uri) {
            rgb = await extractRGBFromBase64Web(photo.uri);
          } else {
            return;
          }
        } else {
          rgb = await extractRGBFromPhotoNative(photo.uri, photo.width, photo.height);
        }
        if (rgb.r >= 0 && rgb.g >= 0 && rgb.b >= 0) {
          signalsRef.current.push({
            ...rgb,
            timestamp: Date.now(),
          });
          setSampleCount(signalsRef.current.length);
        }
      }
    } catch {
    } finally {
      processingRef.current = false;
    }
  }, []);

  const processSignals = useCallback(async () => {
    setState("processing");

    try {
      const signals = signalsRef.current;
      if (signals.length < MIN_SAMPLES) {
        setError(t(
          "Not enough data collected. Please try again with better lighting and hold the phone steady.",
          "لم يتم جمع بيانات كافية. يرجى المحاولة مرة أخرى في إضاءة أفضل مع تثبيت الهاتف."
        ));
        setState("idle");
        return;
      }

      const timestamps = signals.map(s => s.timestamp);
      let actualFps = CAPTURE_FPS;
      if (timestamps.length > 1 && timestamps[0] > 0) {
        const totalDuration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
        if (totalDuration > 0) {
          actualFps = (timestamps.length - 1) / totalDuration;
        }
      }

      const rgbSignals = signals.map(s => ({ r: s.r, g: s.g, b: s.b }));
      const data = processRppgClient(rgbSignals, actualFps);

      setResult(data);
      setState("result");
      if (data.validReading) {
        startPulseAnimation();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        getProfile().then((profile) => {
          saveProfile({ ...profile, lastBpm: data.heartRate, lastBpmDate: Date.now() });
        });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (err) {
      setError(t(
        "Failed to process heart rate data. Please try again.",
        "فشل في معالجة بيانات معدل ضربات القلب. يرجى المحاولة مرة أخرى."
      ));
      setState("idle");
    }
  }, []);

  const startMeasurement = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setResult(null);
    setSampleCount(0);
    signalsRef.current = [];
    setState("measuring");
    setCountdown(MEASUREMENT_DURATION);

    intervalRef.current = setInterval(captureFrame, Math.round(1000 / CAPTURE_FPS));

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (countdownRef.current) clearInterval(countdownRef.current);
          processSignals();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [captureFrame, processSignals]);

  const resetMeasurement = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    stopPulseAnimation();
    signalsRef.current = [];
    setState("idle");
    setResult(null);
    setError(null);
    setSampleCount(0);
    setCountdown(MEASUREMENT_DURATION);
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
            {t(
              "The heart rate monitor uses your front camera to detect subtle color changes in your face caused by blood flow. Please allow camera access to continue.",
              "يستخدم مقياس نبضات القلب الكاميرا الأمامية للكشف عن تغييرات اللون الدقيقة في وجهك الناتجة عن تدفق الدم. يرجى السماح بالوصول إلى الكاميرا للاستمرار."
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
    result?.confidence === "high"
      ? Colors.light.success
      : result?.confidence === "medium"
        ? Colors.light.warning
        : Colors.light.emergency;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("Heart Rate Monitor", "مقياس نبضات القلب")}
        </Text>
        <View style={styles.headerButton} />
      </View>

      {state !== "result" ? (
        <View style={styles.cameraSection}>
          <View style={styles.cameraContainer}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
              animateShutter={false}
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
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${((MEASUREMENT_DURATION - countdown) / MEASUREMENT_DURATION) * 100}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.sampleCountText}>
                  {sampleCount} {t("frames", "إطار")}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.instructionSection}>
            {state === "idle" && (
              <>
                <Text style={[styles.instructionTitle, isRTL && { textAlign: "right" }]}>
                  {t("Position Your Face", "ضع وجهك")}
                </Text>
                <Text style={[styles.instructionText, isRTL && { textAlign: "right" }]}>
                  {t(
                    "Hold your phone steady and look at the camera. Ensure good, natural lighting on your face. Stay very still during measurement.",
                    "امسك هاتفك ثابتاً وانظر إلى الكاميرا. تأكد من الإضاءة الطبيعية الجيدة على وجهك. ابقَ ثابتاً تماماً أثناء القياس."
                  )}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.startButton,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={startMeasurement}
                >
                  <Ionicons name="heart" size={20} color="#fff" />
                  <Text style={styles.startButtonText}>
                    {t("Start Measurement", "بدء القياس")}
                  </Text>
                </Pressable>
              </>
            )}

            {state === "measuring" && (
              <>
                <View style={styles.measuringRow}>
                  <View style={styles.pulsingDot} />
                  <Text style={styles.measuringText}>
                    {t("Measuring...", "جاري القياس...")}
                  </Text>
                </View>
                <Text style={[styles.instructionText, isRTL && { textAlign: "right" }]}>
                  {t("Stay still and breathe normally", "ابقَ ثابتاً وتنفس بشكل طبيعي")}
                </Text>
                <Pressable style={styles.cancelButton} onPress={resetMeasurement}>
                  <Text style={styles.cancelButtonText}>
                    {t("Cancel", "إلغاء")}
                  </Text>
                </Pressable>
              </>
            )}

            {state === "processing" && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
                <Text style={styles.processingText}>
                  {t("Analyzing pulse data...", "جاري تحليل بيانات النبض...")}
                </Text>
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
              <Text style={styles.noReadingText}>—</Text>
              <Text style={styles.noReadingLabel}>BPM</Text>
            </View>
          )}

          <Text style={[styles.resultMessage, isRTL && { textAlign: "right" }]}>
            {result.validReading
              ? result.message
              : t(
                  "Could not detect a reliable heart rate. Try again with better lighting, hold very still, and make sure your face is clearly visible.",
                  "لم يتمكن من اكتشاف نبضات قلب موثوقة. حاول مرة أخرى مع إضاءة أفضل، ابقَ ثابتاً تماماً، وتأكد من أن وجهك واضح."
                )}
          </Text>

          {result.validReading && result.waveform && result.waveform.length > 0 && (
            <View style={styles.waveformContainer}>
              <Text style={styles.waveformLabel}>
                {t("Pulse Waveform", "موجة النبض")}
              </Text>
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
                  {result.heartRate < 60
                    ? t("Low", "منخفض")
                    : result.heartRate > 100
                      ? t("High", "مرتفع")
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
              <View style={[styles.tipRow, isRTL && { flexDirection: "row-reverse" }]}>
                <Ionicons name="person-outline" size={16} color={Colors.light.primary} />
                <Text style={[styles.tipText, isRTL && { textAlign: "right" }]}>
                  {t("Keep your face centered and still", "ابقِ وجهك في المنتصف وثابتاً")}
                </Text>
              </View>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.retryButton,
              pressed && { opacity: 0.9 },
            ]}
            onPress={resetMeasurement}
          >
            <Ionicons name="refresh" size={18} color={Colors.light.primary} />
            <Text style={styles.retryButtonText}>
              {t("Measure Again", "قياس مرة أخرى")}
            </Text>
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
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "rgba(255,255,255,0.7)",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  countdownOverlay: {
    position: "absolute",
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
    position: "absolute",
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
