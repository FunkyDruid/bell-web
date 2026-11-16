// Bell: modal synthesis engine for the browser.
// A line-for-line port of Source/BellEngine.h and Source/BellModels.h from the plugin,
// so the web version and the AU/VST3 make the same sound. Runs in an AudioWorklet;
// also loads in Node for the parity test against the C++ renderer.

const P = (ratio, ampDb, t60, split) => ({ ratio, ampDb, t60, split });

const kChurch = [
  P(0.500, -5.0, 42.0, 0.0042), P(1.000, -4.0, 24.0, 0.0031), P(1.188, -2.5, 17.0, 0.0026),
  P(1.497, -14.0, 8.0, 0.0020), P(2.000, 0.0, 12.0, 0.0016), P(2.514, -9.0, 5.5, 0.0012),
  P(2.667, -13.0, 4.6, 0.0010), P(3.005, -6.0, 6.0, 0.0010), P(4.000, -9.0, 3.4, 0.0008),
  P(4.236, -16.0, 2.3, 0.0006), P(4.751, -15.0, 1.9, 0.0006), P(5.062, -14.0, 1.8, 0.0005),
  P(5.408, -18.0, 1.5, 0), P(5.983, -16.0, 1.2, 0), P(6.667, -20.0, 1.0, 0),
  P(7.183, -21.0, 0.9, 0), P(8.020, -22.0, 0.7, 0),
];
const kTubular = [
  P(0.617, -32.0, 18.0, 0.0006), P(1.210, -17.0, 16.0, 0.0005), P(2.000, 0.0, 14.0, 0.0004),
  P(2.965, -2.0, 10.5, 0.0004), P(4.065, -4.5, 7.6, 0.0003), P(5.325, -8.0, 5.4, 0.0003),
  P(6.745, -12.0, 3.8, 0.0002), P(8.330, -16.0, 2.7, 0.0002), P(10.06, -20.0, 1.9, 0),
  P(11.93, -23.0, 1.4, 0), P(13.95, -27.0, 1.0, 0),
];
const kHandbell = [
  P(1.000, 0.0, 14.0, 0.0016), P(2.480, -28.0, 4.0, 0.0010), P(3.000, -9.0, 6.0, 0.0011),
  P(4.250, -26.0, 2.6, 0.0008), P(5.250, -15.0, 3.0, 0.0007), P(7.800, -21.0, 1.8, 0),
  P(10.90, -26.0, 1.1, 0),
];
const kGlock = [
  P(1.000, 0.0, 5.0, 0), P(2.756, -9.0, 1.7, 0), P(3.910, -28.0, 0.9, 0),
  P(5.404, -17.0, 0.75, 0), P(8.933, -25.0, 0.38, 0),
];
const kCelesta = [P(1.000, 0.0, 3.2, 0), P(2.000, -30.0, 1.2, 0), P(2.756, -24.0, 0.9, 0), P(5.404, -34.0, 0.35, 0)];
const kCrotales = [
  P(1.000, 0.0, 9.0, 0.0008), P(1.720, -24.0, 4.0, 0.0006), P(2.930, -7.0, 4.6, 0.0006),
  P(5.050, -14.0, 2.4, 0.0004), P(7.400, -20.0, 1.5, 0), P(9.900, -24.0, 1.0, 0),
];
const kBowl = [
  P(1.000, 0.0, 36.0, 0.0060), P(2.710, -6.0, 18.0, 0.0042), P(5.150, -12.0, 9.0, 0.0030),
  P(8.430, -18.0, 5.0, 0.0020), P(12.30, -24.0, 3.0, 0.0015), P(16.70, -28.0, 2.0, 0),
];

const M = (name, partials, refHz, sizeExponent, clusterCount, clusterLo, clusterHi, clusterDb, clusterT60, noiseDb, noiseMs, trimDb) =>
  ({ name, partials, refHz, sizeExponent, clusterCount, clusterLo, clusterHi, clusterDb, clusterT60, noiseDb, noiseMs, trimDb });

const MODELS = [
  M("Church Bell", kChurch, 262, 1.00, 26, 8.5, 26.0, -27.0, 0.40, -30.0, 4.0, -1.5),
  M("Tubular Bells", kTubular, 262, 0.70, 18, 15.0, 34.0, -29.0, 0.22, -27.0, 3.0, 0.5),
  M("Handbells", kHandbell, 523, 0.90, 10, 9.0, 22.0, -31.0, 0.15, -36.0, 2.0, 4.9),
  M("Glockenspiel", kGlock, 1047, 0.80, 8, 9.5, 20.0, -33.0, 0.08, -25.0, 1.5, 6.7),
  M("Celesta", kCelesta, 523, 0.60, 4, 6.0, 12.0, -40.0, 0.05, -38.0, 4.0, 8.5),
  M("Crotales", kCrotales, 1047, 0.80, 12, 10.0, 28.0, -31.0, 0.12, -29.0, 1.5, 4.6),
  M("Singing Bowl", kBowl, 220, 1.00, 6, 18.0, 30.0, -38.0, 0.20, -40.0, 3.0, 2.6),
];

const MAX_MODES = 80, MAX_VOICES = 48, VOICE_GAIN = 0.07;
const TWO_PI = Math.PI * 2;
const db2g = (db) => Math.pow(10, db / 20);
const clamp = (lo, hi, v) => (v < lo ? lo : v > hi ? hi : v);

const DEFAULTS = {
  model: 1, hardness: 0.7, velToHardness: 0.55, velSens: 0.75, brightness: 0, decay: 1, damp: 0.1,
  warble: 1, character: 0.25, stretch: 0, humDb: 0, strikeDb: 0, sizeTrack: 1, width: 0.5, rackSpread: 0.3,
  dampOnRelease: false, release: 1.2, tuneCents: 0, transpose: 0, bendRange: 2,
};

function signatureOf(s) {
  return [s.model, s.transpose, s.tuneCents, s.stretch, s.character, s.warble, s.decay, s.damp, s.sizeTrack, s.width, s.rackSpread].join("|");
}

class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() {
    let s = this.s;
    s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0;
    this.s = s;
    return (s >>> 8) / 16777216;
  }
  bipolar() { return this.next() * 2 - 1; }
}

class Voice {
  constructor() {
    const f = () => new Float64Array(MAX_MODES);
    this.re = f(); this.im = f(); this.pr = f(); this.pi = f(); this.g = f(); this.gl = f(); this.gr = f();
    this.omega = f(); this.radius = f(); this.freqHz = f(); this.t60 = f();
    this.id = new Int32Array(MAX_MODES);
    this.age = 0;
    this.reset();
  }
  reset() {
    this.active = this.keyDown = this.pendingDamp = this.damped = false;
    this.note = -1; this.numModes = 0; this.pulsePos = this.pulseLen = 0;
    this.noiseEnv = 0; this.noiseLp = 0; this.noiseLp2 = 0;
    this.signature = ""; this.sampleRate = 0; this.bend = 1;
    this.pulseQ = 0; this.pulseQn = 0; this.pulseNorm = 0; this.noiseMul = 0; this.noiseCoef = 0; this.noiseHpCoef = 0; this.noiseSeed = 1;
  }
  energy() {
    let e = 0;
    for (let m = 0; m < this.numModes; ++m) e += this.re[m] * this.re[m] + this.im[m] * this.im[m];
    return e;
  }
}

class BellEngine {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.voices = Array.from({ length: MAX_VOICES }, () => new Voice());
    this.settings = { ...DEFAULTS };
    this.signature = signatureOf(this.settings);
    this.sustainDown = false;
    this.bendRatio = 1;
    this.oldRe = new Float64Array(MAX_MODES * 2); this.oldIm = new Float64Array(MAX_MODES * 2); this.oldHas = new Uint8Array(MAX_MODES * 2);
  }

  setSettings(s) { this.settings = { ...DEFAULTS, ...s }; this.signature = signatureOf(this.settings); }

  noteOn(note, velocity) {
    velocity = clamp(0.01, 1, velocity);
    for (const v of this.voices) {
      if (v.active && v.note === note) {
        if (v.signature === this.signature && v.sampleRate === this.sampleRate) { this.strike(v, note, velocity, true); return; }
        v.note = -1;
      }
    }
    this.strike(this.allocateVoice(), note, velocity, false);
  }

  noteOff(note) {
    for (const v of this.voices) {
      if (!v.active || v.note !== note || !v.keyDown) continue;
      v.keyDown = false;
      if (this.settings.dampOnRelease) {
        if (this.sustainDown) v.pendingDamp = true;
        else this.damp(v, this.settings.release);
      }
    }
  }

  setSustain(down) {
    this.sustainDown = down;
    if (down) return;
    for (const v of this.voices) if (v.active && v.pendingDamp && !v.keyDown) this.damp(v, this.settings.release);
  }

  allNotesOff() { for (const v of this.voices) if (v.active) { v.keyDown = false; this.damp(v, 0.15); } }
  panic() { for (const v of this.voices) v.reset(); }
  setPitchBend(n) { this.bendRatio = Math.pow(2, (n * this.settings.bendRange) / 12); }
  activeVoiceCount() { let n = 0; for (const v of this.voices) if (v.active) ++n; return n; }

  render(L, R, offset, n) {
    for (const v of this.voices) {
      if (!v.active) continue;
      if (v.bend !== this.bendRatio) this.updatePoles(v, this.bendRatio);
      this.renderVoice(v, L, R, offset, n);
      this.cull(v);
    }
  }

  allocateVoice() {
    for (const v of this.voices) if (!v.active) return v;
    let best = this.voices[0], bestScore = Infinity;
    for (const v of this.voices) {
      const score = v.energy() * (v.keyDown ? 100 : 1);
      if (score < bestScore) { bestScore = score; best = v; }
    }
    best.reset();
    return best;
  }

  static hfFactor(f, damp) { const x = f / 5000; return 1 / (1 + 4 * damp * x * x); }

  strike(v, note, vel, restrike) {
    const s = this.settings;
    const Mo = MODELS[clamp(0, MODELS.length - 1, s.model | 0)];
    const fs = this.sampleRate;
    const f0 = 440 * Math.pow(2, (note + s.transpose - 69) / 12 + s.tuneCents / 1200);
    const nyquistLimit = Math.min(0.45 * fs, 20000);

    const tauHardMs = 4 * Math.pow(0.008, s.hardness);
    const tauMs = tauHardMs * Math.pow(vel, -0.7 * s.velToHardness);
    const pulseGain = (f, tMs) => { const x = TWO_PI * f * tMs * 0.001; return 1 / (1 + x * x); };
    const tauRefMs = 4 * Math.pow(0.008, 0.7);
    const tableComp = (f) => Math.min(16, 1 / pulseGain(f, tauRefMs));
    let mainRatio = 1, mainDb = -1000;
    for (const p of Mo.partials) if (p.ampDb > mainDb) { mainDb = p.ampDb; mainRatio = p.ratio; }
    const fMain = f0 * mainRatio;
    const makeup = clamp(0.25, 5.6, pulseGain(fMain, tauRefMs) / pulseGain(fMain, tauHardMs));

    const hardEff = clamp(0, 1, Math.log(4 / tauMs) / Math.log(125));
    const tauS = Math.max(0.02, tauMs * 0.001 * fs);
    const amp = Math.pow(vel, 2 * s.velSens) * db2g(Mo.trimDb) * VOICE_GAIN;
    const sizeScale = Math.pow(Mo.refHz / f0, Mo.sizeExponent * s.sizeTrack);
    const stretchCents = s.stretch * 30;

    const { oldRe, oldIm, oldHas } = this;
    oldHas.fill(0);
    if (restrike) {
      for (let m = 0; m < v.numModes; ++m) {
        const k = v.id[m];
        if (k >= 0 && k < MAX_MODES * 2) { oldRe[k] = v.re[m]; oldIm[k] = v.im[m]; oldHas[k] = 1; }
      }
    }

    const seed = (Math.imul(note, 2654435761 | 0) ^ ((s.model * 40503 + 17) | 0)) >>> 0;
    const rng = new Rng(seed);
    let n = 0;
    const notePan = s.rackSpread * 0.7 * clamp(-1, 1, (note - 66) / 12);

    const addMode = (modeId, f, level, t60, pan) => {
      pan = notePan + pan * (1 - 0.5 * Math.abs(notePan));
      if (n >= MAX_MODES || f >= nyquistLimit || f < 15 || level < 1e-6) return;
      const th = (clamp(-1, 1, pan) + 1) * Math.PI * 0.25;
      v.id[n] = modeId;
      v.freqHz[n] = f;
      v.t60[n] = clamp(0.01, 120, t60);
      v.omega[n] = (TWO_PI * f) / fs;
      v.radius[n] = Math.exp(-6.907755 / (v.t60[n] * fs));
      v.g[n] = level * tableComp(f) * makeup;
      v.gl[n] = Math.cos(th);
      v.gr[n] = Math.sin(th);
      v.re[n] = oldHas[modeId] ? oldRe[modeId] : 0;
      v.im[n] = oldHas[modeId] ? oldIm[modeId] : 0;
      ++n;
    };

    Mo.partials.forEach((p, i) => {
      const rDetune = rng.bipolar(), rLevel = rng.bipolar(), rSplit = rng.next(), rAngle = rng.next();
      const rT1 = rng.bipolar(), rT2 = rng.bipolar(), rP1 = rng.bipolar(), rP2 = rng.bipolar();
      const oct = Math.log2(p.ratio);
      const strongWeight = p.ampDb > -6 ? 0.3 : 1;
      const cents = stretchCents * oct + s.character * 12 * strongWeight * rDetune;
      const f = f0 * p.ratio * Math.pow(2, cents / 1200);
      let levelDb = p.ampDb + s.brightness * 8 * oct + s.character * 2 * rLevel;
      if (p.ratio < 0.95) levelDb += s.humDb;
      const level = amp * db2g(levelDb);
      const t60 = p.t60 * s.decay * sizeScale * BellEngine.hfFactor(f, s.damp);
      if (p.split > 0 && s.warble > 0.001) {
        const d = p.split * s.warble * (0.7 + 0.6 * rSplit);
        const phi = (0.15 + 0.7 * rAngle) * Math.PI * 0.5;
        addMode(i * 2, f * (1 - 0.5 * d), level * Math.cos(phi), t60 * (1 + 0.08 * rT1), rP1 * s.width);
        addMode(i * 2 + 1, f * (1 + 0.5 * d), level * Math.sin(phi), t60 * (1 + 0.08 * rT2), rP2 * s.width);
      } else {
        addMode(i * 2, f, level, t60, rP1 * s.width);
      }
    });

    const strikeGain = db2g(s.strikeDb);
    for (let k = 0; k < Mo.clusterCount; ++k) {
      const rR = rng.next(), rL = rng.bipolar(), rT = rng.next(), rP = rng.bipolar();
      const ratio = Mo.clusterLo * Math.pow(Mo.clusterHi / Mo.clusterLo, rR);
      const f = f0 * ratio;
      const levelDb = Mo.clusterDb - 3 * Math.log2(ratio / Mo.clusterLo) + 2 * rL + s.brightness * 8 * Math.log2(ratio);
      const level = amp * strikeGain * db2g(levelDb);
      const t60 = Mo.clusterT60 * (0.5 + rT) * Math.sqrt(s.decay * sizeScale) * BellEngine.hfFactor(f, s.damp);
      addMode(MAX_MODES + k, f, level, t60, rP * s.width);
    }

    v.numModes = n;
    for (let m = n; m < MAX_MODES; ++m) { v.re[m] = v.im[m] = v.g[m] = v.gl[m] = v.gr[m] = 0; }
    v.damped = false; v.pendingDamp = false; v.bend = this.bendRatio;
    this.updatePoles(v, this.bendRatio);

    v.pulseQ = Math.exp(-1 / tauS);
    v.pulseQn = 1;
    v.pulseNorm = ((1 - v.pulseQ) * (1 - v.pulseQ)) / Math.max(v.pulseQ, 1e-30);
    v.pulsePos = 0;
    v.pulseLen = Math.ceil(20 * tauS) + 2;

    const noiseLevel = amp * strikeGain * db2g(Mo.noiseDb) * (0.25 + 0.75 * hardEff);
    const noiseTau = Mo.noiseMs * 0.001 * (0.5 + 1.5 * (1 - hardEff)) * fs;
    v.noiseEnv = noiseLevel;
    v.noiseMul = Math.exp(-1 / Math.max(1, noiseTau));
    v.noiseCoef = 1 - Math.exp((-TWO_PI * (1500 + 13500 * hardEff)) / fs);
    v.noiseHpCoef = 1 - Math.exp((-TWO_PI * 900) / fs);
    v.noiseSeed = (Math.imul(note, 747796405) + 2891336453 + Math.imul(v.age, 1013904223)) >>> 0;

    v.note = note; v.keyDown = true; v.active = true;
    v.signature = this.signature; v.sampleRate = this.sampleRate;
    v.age = (v.age + 1) >>> 0;
  }

  updatePoles(v, bend) {
    v.bend = bend;
    for (let m = 0; m < v.numModes; ++m) {
      const w = v.omega[m] * bend;
      v.pr[m] = v.radius[m] * Math.cos(w);
      v.pi[m] = v.radius[m] * Math.sin(w);
    }
  }

  damp(v, releaseSeconds) {
    const fs = this.sampleRate;
    for (let m = 0; m < v.numModes; ++m) {
      const t = clamp(0.01, v.t60[m], releaseSeconds / (1 + v.freqHz[m] / 2500));
      v.radius[m] = Math.exp(-6.907755 / (t * fs));
    }
    v.damped = true; v.pendingDamp = false;
    this.updatePoles(v, v.bend);
  }

  renderVoice(v, L, R, offset, numSamples) {
    const nm = v.numModes, re = v.re, im = v.im, pr = v.pr, pi = v.pi, g = v.g, gl = v.gl, gr = v.gr;
    for (let i = 0; i < numSamples; ++i) {
      let x = 0;
      if (v.pulsePos < v.pulseLen) { x = v.pulsePos * v.pulseQn * v.pulseNorm; v.pulseQn *= v.pulseQ; ++v.pulsePos; }
      let sl = 0, sr = 0;
      for (let m = 0; m < nm; ++m) {
        const a = re[m], b = im[m];
        const ni = pr[m] * b + pi[m] * a;
        re[m] = pr[m] * a - pi[m] * b + g[m] * x;
        im[m] = ni;
        sl += ni * gl[m]; sr += ni * gr[m];
      }
      let noise = 0;
      if (v.noiseEnv > 1e-7) {
        v.noiseSeed = (Math.imul(v.noiseSeed, 1664525) + 1013904223) >>> 0;
        const white = (v.noiseSeed | 0) / 2147483648;
        v.noiseLp += (white - v.noiseLp) * v.noiseCoef;
        v.noiseLp2 += (v.noiseLp - v.noiseLp2) * v.noiseHpCoef;
        noise = (v.noiseLp - v.noiseLp2) * v.noiseEnv;
        v.noiseEnv *= v.noiseMul;
      }
      L[offset + i] += sl + noise * 0.7071;
      R[offset + i] += sr + noise * 0.7071;
    }
  }

  cull(v) {
    if (v.pulsePos < v.pulseLen) return;
    const th2 = 3e-7 * 3e-7;
    let m = 0;
    while (m < v.numModes) {
      if (v.re[m] * v.re[m] + v.im[m] * v.im[m] < th2) {
        const last = --v.numModes;
        if (m !== last) {
          for (const k of ["re", "im", "pr", "pi", "g", "gl", "gr", "omega", "radius", "freqHz", "t60", "id"]) v[k][m] = v[k][last];
        }
        v.re[last] = v.im[last] = v.g[last] = v.gl[last] = v.gr[last] = 0;
      } else ++m;
    }
    if (v.numModes === 0 && v.noiseEnv <= 1e-7) v.reset();
  }
}

// ---------------------------------------------------------------- worklet processors
if (typeof registerProcessor === "function") {
  class BellProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.engine = new BellEngine(sampleRate);
      this.counter = 0;
      this.port.onmessage = ({ data }) => {
        const e = this.engine;
        switch (data.type) {
          case "settings": e.setSettings(data.settings); break;
          case "on": e.noteOn(data.note, data.velocity); break;
          case "off": e.noteOff(data.note); break;
          case "sustain": e.setSustain(data.down); break;
          case "bend": e.setPitchBend(data.value); break;
          case "allOff": e.allNotesOff(); break;
          case "panic": e.panic(); break;
        }
      };
    }
    process(_inputs, outputs) {
      const out = outputs[0];
      const L = out[0], R = out[1] || out[0];
      this.engine.render(L, R, 0, L.length);
      if (out.length === 1) for (let i = 0; i < L.length; ++i) L[i] *= 0.5;
      if (++this.counter % 32 === 0) this.port.postMessage({ type: "voices", count: this.engine.activeVoiceCount() });
      return true;
    }
  }
  registerProcessor("bell-engine", BellProcessor);

  // Safety limiter: -1 dBFS ceiling, 0.3 ms attack, 150 ms release, soft clip above 0.9.
  class LimiterProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.gain = 1; this.on = true; this.peak = 0; this.minGain = 1; this.counter = 0;
      this.attack = 1 - Math.exp(-1 / (0.0003 * sampleRate));
      this.release = 1 - Math.exp(-1 / (0.15 * sampleRate));
      this.port.onmessage = ({ data }) => { if (data.type === "on") this.on = data.on; };
    }
    process(inputs, outputs) {
      const inp = inputs[0], out = outputs[0];
      if (!inp.length) return true;
      const n = out[0].length, chans = Math.min(inp.length, out.length);
      for (let i = 0; i < n; ++i) {
        let pk = 0;
        for (let c = 0; c < chans; ++c) pk = Math.max(pk, Math.abs(inp[c][i]));
        if (this.on) {
          const target = pk > 0.891 ? 0.891 / pk : 1;
          this.gain += (target - this.gain) * (target < this.gain ? this.attack : this.release);
          if (this.gain < this.minGain) this.minGain = this.gain;
        } else this.gain = 1;
        for (let c = 0; c < chans; ++c) {
          let v = inp[c][i] * this.gain;
          const a = Math.abs(v);
          if (this.on && a > 0.9) v = Math.sign(v) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
          out[c][i] = v;
          if (Math.abs(v) > this.peak) this.peak = Math.abs(v);
        }
      }
      if (++this.counter % 8 === 0) {
        this.port.postMessage({ type: "meter", peak: this.peak, reductionDb: 20 * Math.log10(this.minGain) });
        this.peak = 0; this.minGain = 1;
      }
      return true;
    }
  }
  registerProcessor("bell-limiter", LimiterProcessor);
}

if (typeof module !== "undefined") module.exports = { BellEngine, MODELS, DEFAULTS };
