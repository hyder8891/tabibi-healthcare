const { parentPort, workerData } = require('worker_threads');

function processRppg(signals, fps) {
  const actualFps = fps || 10;
  const n = signals.length;

  if (n < 30) {
    throw new Error("Not enough samples for analysis");
  }

  const validSignals = signals.filter(s => s.r >= 0 && s.g >= 0 && s.b >= 0);
  if (validSignals.length < 30) {
    throw new Error("Too many failed frame captures");
  }

  const rRaw = validSignals.map(s => s.r);
  const gRaw = validSignals.map(s => s.g);
  const bRaw = validSignals.map(s => s.b);
  const vn = validSignals.length;

  const gMin = Math.min(...gRaw);
  const gMax = Math.max(...gRaw);
  const gRange = gMax - gMin;

  if (gRange < 0.3) {
    return {
      heartRate: 0,
      confidence: "low",
      waveform: [],
      signalQuality: 0,
      samplesProcessed: vn,
      validReading: false,
      message: "No color variation detected",
    };
  }

  function detrendSignal(sig) {
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

  function normalizeSignal(sig) {
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

    const xsStd = Math.sqrt(xs.reduce((s, v) => s + v * v, 0) / len) || 1;
    const ysStd = Math.sqrt(ys.reduce((s, v) => s + v * v, 0) / len) || 1;
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

  function bandpassFilter(sig, sampleRate, lowFreq, highFreq) {
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

  const filteredPOS = bandpassFilter(posDetrended, actualFps, minFreq, maxFreq);
  const filteredGreen = bandpassFilter(greenNormalized, actualFps, minFreq, maxFreq);

  function computeFFTBpm(filtered, sigLen) {
    const zeroPadFactor = 4;
    const fftSize = Math.pow(2, Math.ceil(Math.log2(sigLen * zeroPadFactor)));
    const real = new Array(fftSize).fill(0);
    const imag = new Array(fftSize).fill(0);

    for (let i = 0; i < sigLen; i++) {
      const hannCoeff = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (sigLen - 1));
      real[i] = filtered[i] * hannCoeff;
    }

    function fft(real, imag, n) {
      if (n <= 1) return;
      const halfN = n / 2;
      const evenReal = new Array(halfN);
      const evenImag = new Array(halfN);
      const oddReal = new Array(halfN);
      const oddImag = new Array(halfN);

      for (let i = 0; i < halfN; i++) {
        evenReal[i] = real[2 * i];
        evenImag[i] = imag[2 * i];
        oddReal[i] = real[2 * i + 1];
        oddImag[i] = imag[2 * i + 1];
      }

      fft(evenReal, evenImag, halfN);
      fft(oddReal, oddImag, halfN);

      for (let k = 0; k < halfN; k++) {
        const angle = -2 * Math.PI * k / n;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const tReal = cos * oddReal[k] - sin * oddImag[k];
        const tImag = sin * oddReal[k] + cos * oddImag[k];
        real[k] = evenReal[k] + tReal;
        imag[k] = evenImag[k] + tImag;
        real[k + halfN] = evenReal[k] - tReal;
        imag[k + halfN] = evenImag[k] - tImag;
      }
    }

    fft(real, imag, fftSize);

    const magnitudes = [];
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

    let peakFreq;
    if (peakBin > scaledMinBin && peakBin < scaledMaxBin) {
      const alpha_val = magnitudes[peakBin - 1];
      const beta = magnitudes[peakBin];
      const gamma = magnitudes[peakBin + 1];
      const denom = alpha_val - 2 * beta + gamma;
      if (Math.abs(denom) > 1e-10) {
        const delta = 0.5 * (alpha_val - gamma) / denom;
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

  let bestBpm, bestSnr;
  if (posResult.snr >= greenResult.snr && posResult.snr > 0.05) {
    bestBpm = posResult.bpm;
    bestSnr = posResult.snr;
  } else if (greenResult.snr > 0.05) {
    bestBpm = greenResult.bpm;
    bestSnr = greenResult.snr;
  } else {
    bestBpm = posResult.snr >= greenResult.snr ? posResult.bpm : greenResult.bpm;
    bestSnr = Math.max(posResult.snr, greenResult.snr);
  }

  const signalVariance = filteredPOS.reduce((s, v) => s + v * v, 0) / vn;
  const hasVariation = signalVariance > 1e-10;

  const isValidBpm = bestBpm >= 45 && bestBpm <= 180;
  const isValidSignal = bestSnr > 0.08 && hasVariation;
  const validReading = isValidBpm && isValidSignal;

  const heartRate = validReading ? Math.max(45, Math.min(180, bestBpm)) : 0;

  let confidence;
  if (bestSnr > 0.18 && vn >= 60 && hasVariation && validReading) {
    confidence = "high";
  } else if (bestSnr > 0.10 && vn >= 40 && hasVariation && validReading) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  const displayFiltered = posResult.snr >= greenResult.snr ? filteredPOS : filteredGreen;
  const waveformLength = 100;
  const waveform = [];
  for (let i = 0; i < waveformLength; i++) {
    const idx = Math.floor(i * displayFiltered.length / waveformLength);
    waveform.push(displayFiltered[idx] || 0);
  }

  const maxWave = Math.max(...waveform.map(Math.abs)) || 1;
  const normalizedWaveform = waveform.map(v => v / maxWave);

  return {
    heartRate,
    confidence,
    waveform: normalizedWaveform,
    signalQuality: Math.round(bestSnr * 100),
    samplesProcessed: vn,
    validReading,
    message: validReading
      ? (confidence === "high"
        ? "Strong signal detected"
        : "Moderate signal quality - try holding still in good lighting")
      : "Could not detect a reliable heart rate",
  };
}

const result = processRppg(workerData.signals, workerData.fps);
parentPort.postMessage(result);
