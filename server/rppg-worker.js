const { parentPort, workerData } = require('worker_threads');

function processRppg(signals, fps) {
  const actualFps = fps || 10;
  const n = signals.length;

  if (n < 30) {
    throw new Error("Not enough samples for analysis");
  }

  const rRaw = signals.map(s => s.r);
  const gRaw = signals.map(s => s.g);
  const bRaw = signals.map(s => s.b);

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
  const posSignal = new Array(n).fill(0);

  for (let start = 0; start < n - windowSize; start += Math.floor(windowSize / 2)) {
    const end = Math.min(start + windowSize, n);
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

  const minFreq = 0.75;
  const maxFreq = 3.5;

  function butterworthBandpass(sig, sampleRate, lowFreq, highFreq) {
    const dt = 1.0 / sampleRate;
    const lowRC = 1.0 / (2 * Math.PI * lowFreq);
    const highRC = 1.0 / (2 * Math.PI * highFreq);
    const alphaHigh = dt / (highRC + dt);
    const alphaLow = lowRC / (lowRC + dt);

    const highPassed = new Array(sig.length).fill(0);
    highPassed[0] = sig[0];
    for (let i = 1; i < sig.length; i++) {
      highPassed[i] = alphaLow * (highPassed[i - 1] + sig[i] - sig[i - 1]);
    }

    const bandPassed = new Array(sig.length).fill(0);
    bandPassed[0] = highPassed[0];
    for (let i = 1; i < sig.length; i++) {
      bandPassed[i] = bandPassed[i - 1] + alphaHigh * (highPassed[i] - bandPassed[i - 1]);
    }

    const result = new Array(sig.length).fill(0);
    result[0] = bandPassed[0];
    for (let i = 1; i < sig.length; i++) {
      result[i] = alphaLow * (result[i - 1] + bandPassed[i] - bandPassed[i - 1]);
    }
    const finalResult = new Array(sig.length).fill(0);
    finalResult[0] = result[0];
    for (let i = 1; i < sig.length; i++) {
      finalResult[i] = finalResult[i - 1] + alphaHigh * (result[i] - finalResult[i - 1]);
    }

    return finalResult;
  }

  const filtered = butterworthBandpass(posDetrended, actualFps, minFreq, maxFreq);

  const zeroPadFactor = 4;
  const fftSize = Math.pow(2, Math.ceil(Math.log2(n * zeroPadFactor)));
  const real = new Array(fftSize).fill(0);
  const imag = new Array(fftSize).fill(0);

  for (let i = 0; i < n; i++) {
    const hannCoeff = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
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
    const delta = 0.5 * (alpha_val - gamma) / (alpha_val - 2 * beta + gamma);
    peakFreq = (peakBin + delta) * actualFps / fftSize;
  } else {
    peakFreq = peakBin * actualFps / fftSize;
  }

  let heartRate = Math.round(peakFreq * 60);
  heartRate = Math.max(45, Math.min(180, heartRate));

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

  const signalVariance = filtered.reduce((s, v) => s + v * v, 0) / n;
  const hasVariation = signalVariance > 1e-10;

  let confidence;
  if (snr > 0.25 && n >= 150 && hasVariation) {
    confidence = "high";
  } else if (snr > 0.12 && n >= 80 && hasVariation) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  const waveformLength = 100;
  const waveform = [];
  for (let i = 0; i < waveformLength; i++) {
    const idx = Math.floor(i * filtered.length / waveformLength);
    waveform.push(filtered[idx] || 0);
  }

  const maxWave = Math.max(...waveform.map(Math.abs)) || 1;
  const normalizedWaveform = waveform.map(v => v / maxWave);

  return {
    heartRate,
    confidence,
    waveform: normalizedWaveform,
    signalQuality: Math.round(snr * 100),
    samplesProcessed: n,
    message: confidence === "high"
      ? "Strong signal detected"
      : confidence === "medium"
        ? "Moderate signal quality - try holding still in good lighting"
        : "Weak signal - ensure face is well-lit and stay still",
  };
}

const result = processRppg(workerData.signals, workerData.fps);
parentPort.postMessage(result);
