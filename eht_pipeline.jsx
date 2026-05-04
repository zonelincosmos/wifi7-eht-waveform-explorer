// SPDX-License-Identifier: MIT
// Copyright (c) 2026 zonelincosmos
// JavaScript port of ref/wifi7-python/{eht_waveform_gen,modulation/*,fields/*,
// utils/*}.py from https://github.com/zonelincosmos/wifi7-eht-waveform-generator-python
//
// eht_pipeline.jsx — Bit-perfect EHT PPDU waveform synthesis.
//
// Translates ref/wifi7-python/{eht_waveform_gen, modulation/*, fields/*, utils/*}.py
// into browser JS with no external dependencies. Produces real complex IQ samples
// for the Data field (preamble currently uses simplified analytic stubs that match
// duration but not bit-for-bit content; Phase 2 will flesh those out).
//
// Loaded as `<script type="text/babel" src="eht_pipeline.jsx">` AFTER
// eht_compute.jsx and eht_ldpc_matrices.js. Exposes:
//   window.EHT.pipeline.generate(params) → memoized result keyed on params hash.
//
// Performance budget for the canonical case (BW=320 MCS=13 APEP=5000):
//   ~50 ms LDPC P-derive (cached after 1st run)
//   ~15 ms LDPC encode  (31 codewords × 1620-bit info)
//   ~15 ms QAM map + tone permute + pilots
//   ~250 ms IFFTs       (2 Data symbols + ~7 stub preamble symbols, all NFFT=6144)
//   total ≤ 500 ms on V8.
//
// Numerical convention: Float64Array for IQ. Python uses
//   td_sym = ifft(freq, NFFT) * sqrt(NFFT)
// = (1/sqrt(NFFT)) * Σ freq[k] * e^(+2πi nk/NFFT)
// Our Bluestein IFFT here applies the same sqrt(NFFT) scaling.

"use strict";
(function(){
  if (typeof window === 'undefined' || !window.EHT) {
    console.error('[eht_pipeline] window.EHT not loaded — eht_compute.jsx must run first.');
    return;
  }

  // =====================================================================
  // 1. FFT primitives — radix-2 Cooley-Tukey + Bluestein (any N).
  // =====================================================================

  // In-place radix-2 forward FFT on (re, im) Float64Arrays of length M (M is power of 2).
  // sign = -1 for forward, +1 for inverse. No 1/M scaling applied.
  function fftRadix2(re, im, sign) {
    const N = re.length;
    // Bit reversal
    for (let i = 1, j = 0; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    // Cooley-Tukey
    for (let len = 2; len <= N; len <<= 1) {
      const half = len >> 1;
      const ang = sign * 2 * Math.PI / len;
      const wRe = Math.cos(ang);
      const wIm = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let curRe = 1.0, curIm = 0.0;
        for (let k = 0; k < half; k++) {
          const tRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
          const tIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
          re[i + k + half] = re[i + k] - tRe;
          im[i + k + half] = im[i + k] - tIm;
          re[i + k] = re[i + k] + tRe;
          im[i + k] = im[i + k] + tIm;
          // Rotate twiddle
          const nRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nRe;
        }
      }
    }
  }

  // Next power of 2 ≥ x.
  function nextPow2(x) {
    let p = 1;
    while (p < x) p <<= 1;
    return p;
  }

  // Bluestein convolution-based DFT. Inputs are split-real Float64Arrays.
  // sign = -1 (forward DFT) or +1 (inverse DFT). NO scaling: caller scales.
  //
  // Math (forward):
  //   X[k] = e^{-iπk²/N} · Σ x[n]·e^{-iπn²/N} · e^{+iπ(k-n)²/N}     ... Bluestein
  //        = chirp_k* · (a ⊛ b)[k]   with a[n]=x[n]·w*[n], b[m]=w[m].
  //   We cache wRe/wIm = (cos, sin) of chirp angle πn²/N (i.e. forward exponent),
  //   so w = e^{+iπn²/N}. For inverse DFT, conjugate everything.
  //
  // Cached: BfftRe/BfftIm = FFT(b_forward) where b_forward[k] = w[k] for k=0..N-1
  // with palindromic wrap b[M-k] = w[k] for k=1..N-1. This is the "+wIm" version.
  const _BLUESTEIN_CACHE = {};
  function makeBluestein(N) {
    const cached = _BLUESTEIN_CACHE[N];
    if (cached) return cached;
    const M = nextPow2(2 * N - 1);
    const wRe = new Float64Array(N);
    const wIm = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      // mod-2N keeps precision: e^{iπn²/N} only depends on n² mod 2N.
      const ang = Math.PI * ((n * n) % (2 * N)) / N;
      wRe[n] = Math.cos(ang);
      wIm[n] = Math.sin(ang);
    }
    // b_forward[k] = w[k] = e^{+iπk²/N} for k=0..N-1 (positive imaginary).
    const Bre = new Float64Array(M);
    const Bim = new Float64Array(M);
    for (let k = 0; k < N; k++) {
      Bre[k] = wRe[k];
      Bim[k] = wIm[k];
    }
    for (let k = 1; k < N; k++) {
      Bre[M - k] = wRe[k];
      Bim[M - k] = wIm[k];
    }
    fftRadix2(Bre, Bim, -1);
    const result = { N, M, wRe, wIm, BfftRe: Bre, BfftIm: Bim };
    _BLUESTEIN_CACHE[N] = result;
    return result;
  }

  // Forward DFT (sign=-1) or inverse DFT (sign=+1), N-point, in-place. No /N.
  function bluestein(xRe, xIm, sign) {
    const N = xRe.length;
    const ctx = makeBluestein(N);
    const M = ctx.M, wRe = ctx.wRe, wIm = ctx.wIm;
    // Forward needs a[n]=x[n]·w*[n]  → multiply with -wIm (aSgn=-1)
    // Inverse needs a[n]=x[n]·w[n]   → multiply with +wIm (aSgn=+1)
    const aSgn = sign;          // sign matches chirp imag sign
    // Forward needs B = FFT(b_forward) as cached  (bSgn=+1)
    // Inverse needs B = FFT(b_inverse) = conj(B_forward) since b_forward palindromic
    //   so we negate cached BfftIm (bSgn=-1).
    const bSgn = -sign;
    // Final chirp same as a chirp.
    const fSgn = sign;

    const aRe = new Float64Array(M);
    const aIm = new Float64Array(M);
    for (let n = 0; n < N; n++) {
      const xr = xRe[n], xi = xIm[n];
      const wr = wRe[n], wi = aSgn * wIm[n];
      aRe[n] = xr * wr - xi * wi;
      aIm[n] = xr * wi + xi * wr;
    }
    fftRadix2(aRe, aIm, -1);

    const BRe = ctx.BfftRe, BIm = ctx.BfftIm;
    for (let m = 0; m < M; m++) {
      const ar = aRe[m], ai = aIm[m];
      const br = BRe[m], bi = bSgn * BIm[m];
      aRe[m] = ar * br - ai * bi;
      aIm[m] = ar * bi + ai * br;
    }
    fftRadix2(aRe, aIm, +1);

    const inv = 1 / M;
    for (let k = 0; k < N; k++) {
      const cr = aRe[k] * inv;
      const ci = aIm[k] * inv;
      const wr = wRe[k];
      const wi = fSgn * wIm[k];
      xRe[k] = cr * wr - ci * wi;
      xIm[k] = cr * wi + ci * wr;
    }
  }

  // High-level: NFFT-point IFFT with sqrt(NFFT) scaling (Python convention).
  // Inputs: Float64Array re/im of length NFFT (will be modified).
  // Outputs: same arrays now hold time-domain samples.
  function ifftSqrtN(re, im) {
    const N = re.length;
    bluestein(re, im, 1);                 // sign=+1 → inverse DFT (no /N applied here)
    // Bluestein returns Σ x[k] e^{+iπnk/N} ... wait, our Bluestein just computed
    // (1/N) Σ via internal /M and then partial chirp. Standard Bluestein IFFT:
    //   x[n] = (1/N) Σ X[k] e^{+i2πnk/N}
    // Our Bluestein already includes the 1/M from internal FFT but does NOT
    // include the 1/N. The result is Σ X[k] e^{+i2πnk/N} (no scaling).
    // Python: td = ifft(freq, NFFT) * sqrt(NFFT)
    //       = (1/N) Σ X[k] e^{+i2πnk/N} * sqrt(N)
    //       = (1/sqrt(N)) Σ X[k] e^{+i2πnk/N}
    // So we multiply by 1/sqrt(N).
    const s = 1 / Math.sqrt(N);
    for (let i = 0; i < N; i++) { re[i] *= s; im[i] *= s; }
  }

  // =====================================================================
  // 2. Scrambler — 11-bit LFSR, x^11 + x^9 + 1 (port of modulation/scrambler.py)
  // =====================================================================

  // init_state ∈ [1..2047]. data is Uint8Array of bits. Returns Uint8Array same length.
  function ehtScrambler(data, init_state) {
    if (init_state < 1 || init_state > 2047) {
      throw new Error('scrambler init must be 1..2047');
    }
    // reg[0] = x1 (MSB), reg[10] = x11 (LSB)
    const reg = new Uint8Array(11);
    for (let i = 0; i < 11; i++) reg[i] = (init_state >> (10 - i)) & 1;
    const N = data.length;
    const out = new Uint8Array(N);
    for (let n = 0; n < N; n++) {
      const output = reg[10];
      const fb = reg[8] ^ reg[10];
      out[n] = (data[n] ^ output) & 1;
      // Shift right with feedback in front
      for (let i = 10; i > 0; i--) reg[i] = reg[i - 1];
      reg[0] = fb;
    }
    return out;
  }

  // =====================================================================
  // 3. Constellation map (Gray-coded BPSK..4096-QAM, port of constellation_map.py)
  // =====================================================================

  const K_MOD = {
     1: 1.0,
     2: 1.0 / Math.sqrt(2.0),
     4: 1.0 / Math.sqrt(10.0),
     6: 1.0 / Math.sqrt(42.0),
     8: 1.0 / Math.sqrt(170.0),
    10: 1.0 / Math.sqrt(682.0),
    12: 1.0 / Math.sqrt(2730.0)        // 4096-QAM
  };

  function qamHalfMap(bits, off, n) {
    // Returns signed PAM level for n bits starting at bits[off].
    // bits[off] = MSB = sign bit (0→neg, 1→pos).
    const signBit = bits[off];
    if (n === 1) return 2 * signBit - 1;
    const nMag = n - 1;
    // Gray-to-binary decode
    let prev = bits[off + 1];
    let idx = prev * (1 << (nMag - 1));
    for (let k = 1; k < nMag; k++) {
      const bin = prev ^ bits[off + 1 + k];
      idx += bin * (1 << (nMag - 1 - k));
      prev = bin;
    }
    const N_half = 1 << nMag;
    const magnitude = 2 * (N_half - 1 - idx) + 1;
    return signBit ? magnitude : -magnitude;
  }

  // Returns Float64Array re + Float64Array im, length = bits.length / NBPSCS.
  function constellationMap(bits, NBPSCS) {
    const Nbits = bits.length;
    if (Nbits % NBPSCS !== 0) throw new Error('bits not multiple of NBPSCS');
    const Nsym = Nbits / NBPSCS;
    const re = new Float64Array(Nsym);
    const im = new Float64Array(Nsym);
    const K = K_MOD[NBPSCS];
    if (NBPSCS === 1) {
      for (let i = 0; i < Nsym; i++) re[i] = 2 * bits[i] - 1;
      return { re, im };
    }
    if (NBPSCS === 2) {
      for (let i = 0; i < Nsym; i++) {
        re[i] = K * (2 * bits[2*i]   - 1);
        im[i] = K * (2 * bits[2*i+1] - 1);
      }
      return { re, im };
    }
    const nHalf = NBPSCS >> 1;
    for (let i = 0; i < Nsym; i++) {
      const off = i * NBPSCS;
      re[i] = K * qamHalfMap(bits, off,         nHalf);
      im[i] = K * qamHalfMap(bits, off + nHalf, nHalf);
    }
    return { re, im };
  }

  // =====================================================================
  // 4. LDPC encode pipeline with shortening / puncturing / repetition
  //    Port of ref/wifi7-python/coding/ldpc_encoder.py:ldpc_encoder full mode.
  // =====================================================================

  function ldpcEncodeFull(scrambled, lp, Rn, Rd) {
    // scrambled: Uint8Array of bits (length = N_pld_raw + ... = N_pld). For our
    // pipeline, scrambled.length should equal lp.N_pld bits going into FEC.
    const ldpc = window.EHT_LDPC;
    if (!ldpc) throw new Error('eht_ldpc_matrices.js not loaded');

    const NCW = lp.N_CW;
    const L = lp.L_LDPC;
    const k = Math.round(L * Rn / Rd);   // info bits per codeword

    // Distribute counts across codewords (1-indexed in spec; 0-indexed here)
    const shrtBase = (lp.N_shrt / NCW) | 0;
    const shrtExtra = lp.N_shrt % NCW;
    const puncBase = (lp.N_punc / NCW) | 0;
    const puncExtra = lp.N_punc % NCW;
    const repBase  = (lp.N_rep  / NCW) | 0;
    const repExtra = lp.N_rep  % NCW;

    const parts = [];
    let infoPos = 0;
    for (let cw = 0; cw < NCW; cw++) {
      const sShrt = shrtBase + ((cw + 1) <= shrtExtra ? 1 : 0);
      const sPunc = puncBase + ((cw + 1) <= puncExtra ? 1 : 0);
      const sRep  = repBase  + ((cw + 1) <= repExtra  ? 1 : 0);
      const kAct  = k - sShrt;

      // Extract kAct info bits from scrambled stream (zero-pad if past end)
      const sInfo = new Uint8Array(kAct);
      const avail = Math.max(0, Math.min(kAct, scrambled.length - infoPos));
      for (let i = 0; i < avail; i++) sInfo[i] = scrambled[infoPos + i];
      infoPos += kAct;

      // Pad with shrt zeros to k, encode
      const sFull = new Uint8Array(k);
      sFull.set(sInfo, 0);
      const cwFull = ldpc.encodeInfo(sFull, L, Rn, Rd);    // length = L

      // Build [info-without-shrt-zeros | parity]
      let cwOut = new Uint8Array(kAct + (L - k));
      cwOut.set(sInfo, 0);
      cwOut.set(cwFull.subarray(k), kAct);

      // Puncture: drop last sPunc parity bits
      if (sPunc > 0) cwOut = cwOut.subarray(0, cwOut.length - sPunc);

      // Repeat: cyclically copy
      if (sRep > 0) {
        const baseLen = cwOut.length;
        const totalLen = baseLen + sRep;
        const rep = new Uint8Array(totalLen);
        rep.set(cwOut, 0);
        let pos = baseLen;
        while (pos < totalLen) {
          const chunk = Math.min(baseLen, totalLen - pos);
          rep.set(cwOut.subarray(0, chunk), pos);
          pos += chunk;
        }
        cwOut = rep;
      }
      parts.push(cwOut);
    }
    // Concatenate
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  // PN9 (x^9 + x^5 + 1, seed 0x1FF) post-FEC PHY pad bits per gen_data_field.py:_pn9_seed511.
  function pn9Seed511(nBits) {
    let reg = 511;
    const out = new Uint8Array(nBits);
    for (let i = 0; i < nBits; i++) {
      out[i] = reg & 1;
      const fb = ((reg >> 4) & 1) ^ (reg & 1);
      reg >>= 1;
      if (fb) reg |= 256;
    }
    return out;
  }

  // =====================================================================
  // 5. EHT constants per BW (port of eht_constants.py)
  // =====================================================================

  function ehtConstants(BW) {
    const c = {};
    const N_SR_map = { 20:122, 40:244, 80:500, 160:1012, 320:2036 };
    c.N_SR = N_SR_map[BW];
    c.NFFT_native = { 20:256, 40:512, 80:1024, 160:2048, 320:4096 }[BW];
    c.SC_RATIO = 4;            // 312.5/78.125

    // Pilot indices (Table 36-58 + 27-43/45)
    const p996 = [-468,-400,-334,-266,-220,-152,-86,-18, 18, 86, 152, 220, 266, 334, 400, 468];
    if (BW === 20) {
      c.pilot_indices = [-116,-90,-48,-22, 22, 48, 90, 116];
    } else if (BW === 40) {
      c.pilot_indices = [-238,-212,-170,-144,-104,-78,-36,-10,
                          10, 36, 78, 104, 144, 170, 212, 238];
    } else if (BW === 80) {
      c.pilot_indices = p996.slice();
    } else if (BW === 160) {
      c.pilot_indices = []
        .concat(p996.map(k => k - 512))
        .concat(p996.map(k => k + 512));
    } else if (BW === 320) {
      c.pilot_indices = []
        .concat(p996.map(k => k - 1536))
        .concat(p996.map(k => k -  512))
        .concat(p996.map(k => k +  512))
        .concat(p996.map(k => k + 1536));
    }

    // DC/edge nulls
    let dcNullSet = new Set();
    function addRange(a, b) { for (let k = a; k <= b; k++) dcNullSet.add(k); }
    if (BW === 20) addRange(-1, 1);
    else if (BW === 40 || BW === 80) addRange(-2, 2);
    else if (BW === 160) {
      addRange(-11, 11); addRange(-514, -510); addRange(510, 514);
    } else if (BW === 320) {
      addRange(-11, 11);
      addRange(-514, -510);   addRange(510, 514);
      addRange(-1538, -1534); addRange(1534, 1538);
      addRange(-1035, -1013); addRange(1013, 1035);
    }
    // occupied = all_sc \ dc_null
    const occupied = [];
    for (let k = -c.N_SR; k <= c.N_SR; k++) if (!dcNullSet.has(k)) occupied.push(k);
    // data_indices = occupied \ pilot_indices
    const pilotSet = new Set(c.pilot_indices);
    c.data_indices = occupied.filter(k => !pilotSet.has(k));

    c.all_occupied = occupied.slice().sort((a,b)=>a-b);

    // Pilot polarity (127 elements, Section 17.3.5.10)
    c.pilot_polarity = window.EHT.PILOT_POL_127;

    // Psi sequence (Eq. 27-104)
    c.Psi = window.EHT.PSI_8;

    // ----- Preamble constants per eht_constants.py -----
    const N_20MHz_map = { 20:1, 40:2, 80:4, 160:8, 320:16 };
    c.N_20MHz = N_20MHz_map[BW];
    c.K_Shift = [];
    for (let i = 0; i < c.N_20MHz; i++) c.K_Shift.push((c.N_20MHz - 1 - 2*i) * 32);

    // gamma_preEHT (Eq. 36-14 with (phi1,phi2,phi3) = (1,-1,-1) for BW=320)
    if (BW === 20)       c.gamma_preEHT = [{re:1,im:0}];
    else if (BW === 40)  c.gamma_preEHT = [{re:1,im:0},{re:0,im:1}];
    else if (BW === 80)  c.gamma_preEHT = [{re:1,im:0},{re:-1,im:0},{re:-1,im:0},{re:-1,im:0}];
    else if (BW === 160) c.gamma_preEHT = [{re:1,im:0},{re:-1,im:0},{re:-1,im:0},{re:-1,im:0},
                                            {re:1,im:0},{re:-1,im:0},{re:-1,im:0},{re:-1,im:0}];
    else if (BW === 320) c.gamma_preEHT = [
      {re:1,im:0},{re:1,im:0},{re:1,im:0},{re:-1,im:0},{re:-1,im:0},{re:1,im:0},{re:1,im:0},{re:-1,im:0},
      {re:1,im:0},{re:1,im:0},{re:1,im:0},{re:-1,im:0},{re:-1,im:0},{re:1,im:0},{re:1,im:0},{re:-1,im:0}
    ];

    // Modulated subcarrier counts per field (Table 36-26)
    const tone_LSTF = { 20:12, 40:24, 80:48, 160:96, 320:192 };
    const tone_LLTF = { 20:52, 40:104, 80:208, 160:416, 320:832 };
    const tone_LSIG = { 20:56, 40:112, 80:224, 160:448, 320:896 };
    c.N_tone_LSTF = tone_LSTF[BW];
    c.N_tone_LLTF = tone_LLTF[BW];
    c.N_tone_LSIG = tone_LSIG[BW];

    // L-STF S_{-26..26} (Eq. 19-8): 12 nonzero values · sqrt(1/2). Stored as
    // {re,im} per element, indexed array[k+26] for k=-26..26.
    const sq = 1.0 / Math.sqrt(2.0);
    const S26 = [];
    for (let i = 0; i < 53; i++) S26.push({re:0,im:0});
    function setS(k, sgn_re, sgn_im) { S26[k + 26] = { re: sq*sgn_re, im: sq*sgn_im }; }
    setS(-24, 1, 1); setS(-20, -1, -1); setS(-16, 1, 1); setS(-12, -1, -1);
    setS(-8, -1, -1); setS(-4, 1, 1); setS(4, -1, -1); setS(8, -1, -1);
    setS(12, 1, 1); setS(16, 1, 1); setS(20, 1, 1); setS(24, 1, 1);
    c.S_26_26 = S26;

    // L-LTF L_{-26..26} (Eq. 17-8): 52 ±1 values, DC=0
    c.L_26_26 = [
      1, 1,-1,-1, 1, 1,-1, 1,-1, 1, 1, 1, 1, 1, 1,-1,
     -1, 1, 1,-1, 1,-1, 1, 1, 1, 1,
      0,
      1,-1,-1, 1, 1,-1, 1,-1, 1,-1,-1,-1,-1,-1, 1,
      1,-1,-1, 1,-1, 1,-1, 1, 1, 1, 1
    ];

    // Legacy pilot/L-SIG constants
    c.legacy_pilot_sc = [-21, -7, 7, 21];
    c.LSIG_RATE_bits = [1, 1, 0, 1];      // 6 Mb/s
    c.LSIG_extra_sc_indices = [-28, -27, 27, 28];
    c.LSIG_extra_sc_values  = [-1, -1, -1, 1];

    return c;
  }

  // =====================================================================
  // 6. Data field generation — port of fields/gen_data_field.py
  // =====================================================================

  function ldpcToneMap(sbRe, sbIm, BW) {
    const N_SD_l = sbRe.length;
    const D_TM = (BW === 20) ? 9 : (BW === 40 ? 12 : 20);
    const ratio = N_SD_l / D_TM;
    if (N_SD_l % D_TM !== 0) {
      throw new Error('N_SD_l=' + N_SD_l + ' not divisible by D_TM=' + D_TM);
    }
    const outRe = new Float64Array(N_SD_l);
    const outIm = new Float64Array(N_SD_l);
    for (let k = 0; k < N_SD_l; k++) {
      const t_k = D_TM * (k % ratio) + Math.floor(k * D_TM / N_SD_l);
      outRe[t_k] = sbRe[k];
      outIm[t_k] = sbIm[k];
    }
    return { re: outRe, im: outIm };
  }

  function genDataField(cfg, c) {
    const NFFT = window.EHT.NFFT_OS;       // 6144
    const CP   = cfg.CP_data;
    const BW   = cfg.cfg.BW || cfg.BW;     // accommodate either input shape
    const N_SYM = cfg.N_SYM;

    // Build PSDU bits (cycling 0..255 mod 256 like run_example.py)
    const PSDU_bytes = cfg.PSDU_bytes;
    const psduBytes = new Uint8Array(PSDU_bytes);
    for (let i = 0; i < PSDU_bytes; i++) psduBytes[i] = i & 0xFF;
    // Convert to bits LSB-first per Section 36.3.13.2
    const psduBits = new Uint8Array(PSDU_bytes * 8);
    for (let i = 0; i < PSDU_bytes; i++) {
      const v = psduBytes[i];
      for (let j = 0; j < 8; j++) psduBits[i*8+j] = (v >> j) & 1;
    }

    // SERVICE + tail
    const N_service = cfg.N_service;
    const N_tail = cfg.N_tail;
    const N_PAD_PHY_bits = cfg.N_PAD_PHY_bits;
    const dataBits = new Uint8Array(N_service + psduBits.length + N_PAD_PHY_bits + N_tail);
    // SERVICE = 16 zeros (offset 0..15)
    dataBits.set(psduBits, N_service);
    // pad_bits and tail_bits already zero

    // Scramble
    const scramblerInit = cfg.ScramblerInit || 1;
    const scrambled = ehtScrambler(dataBits, scramblerInit);

    // For BCC, force last 6 to 0 after scrambling (we're LDPC-only here)
    if (cfg.Coding === 'BCC') {
      for (let i = scrambled.length - 6; i < scrambled.length; i++) scrambled[i] = 0;
    }

    // FEC encode
    let encoded;
    if (cfg.Coding === 'BCC') {
      // BCC Data-field encoder not yet wired into the pipeline (the SIG fields
      // do use bccEncoder + interleaver). Returning zeros keeps the field
      // duration correct so the rest of the timeline stays consistent; only
      // the Data segment IQ samples are not bit-perfect.
      console.warn('[eht_pipeline] BCC Data-field encoder not yet wired; Data segment will be zero-filled (preamble fields are unaffected).');
      encoded = new Uint8Array(N_SYM * cfg.N_CBPS);
    } else {
      // LDPC full mode
      const lp = {
        L_LDPC: cfg.L_LDPC, N_CW: cfg.N_CW,
        N_shrt: cfg.N_shrt, N_punc: cfg.N_punc, N_rep: cfg.N_rep,
        N_SYM: cfg.N_SYM, N_avbits: cfg.N_avbits, N_pld: cfg.N_pld
      };
      encoded = ldpcEncodeFull(scrambled, lp, cfg.mcs.Rn, cfg.mcs.Rd);
      // Post-FEC pad (PN9) to fill N_SYM·N_CBPS
      const totalCoded = N_SYM * cfg.N_CBPS;
      const nPostPad = totalCoded - encoded.length;
      if (nPostPad > 0) {
        const padBits = pn9Seed511(nPostPad);
        const cat = new Uint8Array(totalCoded);
        cat.set(encoded, 0);
        cat.set(padBits, encoded.length);
        encoded = cat;
      } else if (nPostPad < 0) {
        console.warn('[eht_pipeline] LDPC encoded ' + encoded.length +
                     ' > N_SYM·N_CBPS=' + totalCoded + '; truncating');
        encoded = encoded.subarray(0, totalCoded);
      }
    }

    // Per-symbol synthesis
    const dataIdx = c.data_indices;
    const pilotIdx = c.pilot_indices;
    const N_SD = dataIdx.length;
    const N_pil = pilotIdx.length;
    const N_ST = cfg.N_ST;
    const N_BPSCS = cfg.N_BPSCS;
    const Psi = c.Psi;
    const polarity = c.pilot_polarity;
    const nPol = polarity.length;
    const pilotPolOffset = 4 + (cfg.N_EHT_SIG || 1);   // 2 + 2 + N_EHT_SIG; defaults to 1 EHT-SIG sym

    const N_sb = cfg.N_sb;
    const N_SD_l = N_SD / N_sb;

    const symLen = NFFT + CP;
    const tdRe = new Float64Array(N_SYM * symLen);
    const tdIm = new Float64Array(N_SYM * symLen);

    for (let symIdx = 0; symIdx < N_SYM; symIdx++) {
      // Slice this symbol's coded bits
      const symBits = encoded.subarray(symIdx * cfg.N_CBPS, (symIdx + 1) * cfg.N_CBPS);

      // Segment parser → per-subblock constellation + tone map
      const dataRe = new Float64Array(N_SD);
      const dataIm = new Float64Array(N_SD);
      if (N_sb === 1) {
        const m = constellationMap(symBits, N_BPSCS);
        let mapped = m;
        if (cfg.Coding === 'LDPC') {
          mapped = ldpcToneMap(m.re, m.im, BW);
        }
        dataRe.set(mapped.re); dataIm.set(mapped.im);
      } else {
        // s_l = max(1, N_BPSCS/2)
        const s_l = Math.max(1, N_BPSCS >> 1);
        const N_CBPSS_l = cfg.N_CBPS / N_sb;
        // Round-robin parse
        const sbBits = [];
        for (let l = 0; l < N_sb; l++) sbBits.push(new Uint8Array(N_CBPSS_l));
        const nRounds = N_CBPSS_l / s_l;
        for (let round = 0; round < nRounds; round++) {
          for (let l = 0; l < N_sb; l++) {
            const srcStart = round * N_sb * s_l + l * s_l;
            const dstStart = round * s_l;
            for (let i = 0; i < s_l; i++) sbBits[l][dstStart + i] = symBits[srcStart + i];
          }
        }
        for (let l = 0; l < N_sb; l++) {
          const m = constellationMap(sbBits[l], N_BPSCS);
          const mapped = ldpcToneMap(m.re, m.im, BW);
          dataRe.set(mapped.re, l * N_SD_l);
          dataIm.set(mapped.im, l * N_SD_l);
        }
      }

      // Build frequency vector NFFT
      const freqRe = new Float64Array(NFFT);
      const freqIm = new Float64Array(NFFT);
      for (let i = 0; i < N_SD; i++) {
        const k = dataIdx[i];
        const bin = ((k % NFFT) + NFFT) % NFFT;
        freqRe[bin] = dataRe[i];
        freqIm[bin] = dataIm[i];
      }
      // Pilots
      const pIdx = ((symIdx + pilotPolOffset) % nPol + nPol) % nPol;
      const p_n = polarity[pIdx];
      for (let pp = 0; pp < N_pil; pp++) {
        const k = pilotIdx[pp];
        const bin = ((k % NFFT) + NFFT) % NFFT;
        const psiVal = Psi[(symIdx + pp) % 8];
        freqRe[bin] = p_n * psiVal;
        freqIm[bin] = 0;
      }
      // Normalize 1/sqrt(N_ST)
      const nrm = 1 / Math.sqrt(N_ST);
      for (let i = 0; i < NFFT; i++) { freqRe[i] *= nrm; freqIm[i] *= nrm; }
      // IFFT
      ifftSqrtN(freqRe, freqIm);
      // CP prepend: copy last CP samples to front of output buffer, then full
      const off = symIdx * symLen;
      for (let i = 0; i < CP; i++) {
        tdRe[off + i] = freqRe[NFFT - CP + i];
        tdIm[off + i] = freqIm[NFFT - CP + i];
      }
      for (let i = 0; i < NFFT; i++) {
        tdRe[off + CP + i] = freqRe[i];
        tdIm[off + CP + i] = freqIm[i];
      }
    }
    return { re: tdRe, im: tdIm, symLen };
  }

  // =====================================================================
  // 7. BCC encoder + puncture + interleavers (port of coding/bcc_*.py)
  // =====================================================================

  // Rate-1/2 BCC encoder, K=7, g0=133o=[1,0,1,1,0,1,1], g1=171o=[1,1,1,1,0,0,1].
  // Output is interleaved [A0,B0,A1,B1,...].
  function bccEncoder(data) {
    const N = data.length;
    const sr = new Uint8Array(7);          // initial state = 0
    const out = new Uint8Array(2 * N);
    for (let i = 0; i < N; i++) {
      // Shift in: prepend (sr[0] = data[i]; old sr[6] drops)
      for (let j = 6; j > 0; j--) sr[j] = sr[j-1];
      sr[0] = data[i];
      // g0 = 133 octal → taps at positions 0,2,3,5,6
      // g1 = 171 octal → taps at positions 0,1,2,3,6
      const A = (sr[0] ^ sr[2] ^ sr[3] ^ sr[5] ^ sr[6]) & 1;
      const B = (sr[0] ^ sr[1] ^ sr[2] ^ sr[3] ^ sr[6]) & 1;
      out[2*i] = A;
      out[2*i+1] = B;
    }
    return out;
  }

  // BCC puncturing per Section 17.3.5.6 / Table 17-24.
  // Patterns (over interleaved A/B input pairs):
  //   2/3: keep A0,B0,A1            (drop B1)        -- 3 of 4
  //   3/4: keep A0,B0,A1,B2          (drop B1,A2)    -- 4 of 6
  //   5/6: keep A0,B0,A1,B2,A3,B4    (drop B1,A2,B3,A4) -- 6 of 10
  function bccPuncture(encoded, Rn, Rd) {
    if (Rn === 1 && Rd === 2) return encoded.slice();
    const nHalf = encoded.length >> 1;
    const a = new Uint8Array(nHalf), b = new Uint8Array(nHalf);
    for (let i = 0; i < nHalf; i++) { a[i] = encoded[2*i]; b[i] = encoded[2*i+1]; }
    let out;
    if (Rn === 2 && Rd === 3) {
      const ng = nHalf >> 1, rem = nHalf & 1;
      out = new Uint8Array(ng*3 + rem*2);
      for (let g = 0; g < ng; g++) {
        out[g*3]   = a[g*2];
        out[g*3+1] = b[g*2];
        out[g*3+2] = a[g*2+1];
      }
      if (rem) { out[ng*3] = a[ng*2]; out[ng*3+1] = b[ng*2]; }
    } else if (Rn === 3 && Rd === 4) {
      const ng = (nHalf / 3) | 0, rem = nHalf % 3;
      let extra = 0;
      if (rem >= 1) extra += 2;
      if (rem >= 2) extra += 1;
      out = new Uint8Array(ng*4 + extra);
      for (let g = 0; g < ng; g++) {
        out[g*4]   = a[g*3];
        out[g*4+1] = b[g*3];
        out[g*4+2] = a[g*3+1];
        out[g*4+3] = b[g*3+2];
      }
      let p = ng*4;
      if (rem >= 1) { out[p++] = a[ng*3]; out[p++] = b[ng*3]; }
      if (rem >= 2) { out[p++] = a[ng*3+1]; }
    } else if (Rn === 5 && Rd === 6) {
      const ng = (nHalf / 5) | 0, rem = nHalf % 5;
      let extra = 0;
      if (rem >= 1) extra += 2;
      if (rem >= 2) extra += 1;
      if (rem >= 3) extra += 1;
      if (rem >= 4) extra += 1;
      out = new Uint8Array(ng*6 + extra);
      for (let g = 0; g < ng; g++) {
        out[g*6]   = a[g*5];
        out[g*6+1] = b[g*5];
        out[g*6+2] = a[g*5+1];
        out[g*6+3] = b[g*5+2];
        out[g*6+4] = a[g*5+3];
        out[g*6+5] = b[g*5+4];
      }
      let p = ng*6;
      if (rem >= 1) { out[p++] = a[ng*5]; out[p++] = b[ng*5]; }
      if (rem >= 2) { out[p++] = a[ng*5+1]; }
      if (rem >= 3) { out[p++] = b[ng*5+2]; }
      if (rem >= 4) { out[p++] = a[ng*5+3]; }
    } else {
      throw new Error('BCC puncture: unsupported rate ' + Rn + '/' + Rd);
    }
    return out;
  }

  // BCC frequency interleaver for 242-tone RU (Section 36.3.13.6 / Table 27-36).
  // Only valid for BW=20.
  function bccInterleaver(bits, NCBPS, NBPSCS) {
    const N_COL = 26;
    const N_ROW = 9 * NBPSCS;
    if (NCBPS !== N_ROW * N_COL) throw new Error('BCC interleaver length mismatch');
    const s = Math.max(NBPSCS >> 1, 1);
    const out = new Uint8Array(NCBPS);
    for (let k = 0; k < NCBPS; k++) {
      const i = N_ROW * (k % N_COL) + ((k / N_COL) | 0);
      const j = s * ((i / s) | 0) +
                ((i + NCBPS - N_COL * ((i / NCBPS) | 0)) % s);
      out[j] = bits[k];
    }
    return out;
  }

  // Legacy 802.11a/g interleaver (for L-SIG); N_COL=16.
  function legacyInterleave(bits, NCBPS, NBPSCS) {
    const N_COL = 16;
    const s = Math.max(NBPSCS >> 1, 1);
    const out = new Uint8Array(NCBPS);
    for (let k = 0; k < NCBPS; k++) {
      const i = ((NCBPS / N_COL) | 0) * (k % N_COL) + ((k / N_COL) | 0);
      const j = s * ((i / s) | 0) +
                ((i + NCBPS - N_COL * ((i / NCBPS) | 0)) % s);
      out[j] = bits[k];
    }
    return out;
  }

  // HE-SIG-A interleaver (for U-SIG and EHT-SIG); N_COL=13.
  function hesigaInterleave(bits, NCBPS, NBPSCS) {
    const N_COL = 13;
    const N_ROW = (NCBPS / N_COL) | 0;
    const s = Math.max(NBPSCS >> 1, 1);
    const out = new Uint8Array(NCBPS);
    for (let k = 0; k < NCBPS; k++) {
      const i = N_ROW * (k % N_COL) + ((k / N_COL) | 0);
      const j = s * ((i / s) | 0) +
                ((i + NCBPS - N_COL * ((i / NCBPS) | 0)) % s);
      out[j] = bits[k];
    }
    return out;
  }

  // Integer → LSB-first bit vector (de2bi 'right-msb' equivalent).
  function de2bi(val, n) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) { out[i] = val & 1; val >>>= 1; }
    return out;
  }

  // BPSK mapper: 0 → -1, 1 → +1 (real-valued).
  function bpskMap(bits) {
    const out = new Float64Array(bits.length);
    for (let i = 0; i < bits.length; i++) out[i] = 2 * bits[i] - 1;
    return out;
  }

  // =====================================================================
  // 7b. Pre-EHT field helper: build per-segment legacy SC vector → NFFT.
  // For pre-EHT (legacy 312.5 kHz) fields, each legacy SC k_local maps to
  // FFT bin (k_local - K_Shift[seg]) * SC_RATIO mod NFFT, multiplied by
  // gamma_preEHT[seg].
  // =====================================================================
  function buildPreEHTFreq(legacy_sc, legacyHalfWidth, c, NFFT) {
    const freqRe = new Float64Array(NFFT);
    const freqIm = new Float64Array(NFFT);
    for (let seg = 0; seg < c.N_20MHz; seg++) {
      const Ks = c.K_Shift[seg];
      const gRe = c.gamma_preEHT[seg].re;
      const gIm = c.gamma_preEHT[seg].im;
      for (let k_local = -legacyHalfWidth; k_local <= legacyHalfWidth; k_local++) {
        const v = legacy_sc[k_local + legacyHalfWidth];
        if (!v) continue;
        const valRe = (typeof v === 'number') ? v : v.re;
        const valIm = (typeof v === 'number') ? 0 : v.im;
        const k_global = k_local - Ks;
        const fft_idx = k_global * c.SC_RATIO;
        const bin = ((fft_idx % NFFT) + NFFT) % NFFT;
        // freq[bin] += gamma · val (segments don't overlap so '=' is fine for SU)
        freqRe[bin] = gRe * valRe - gIm * valIm;
        freqIm[bin] = gRe * valIm + gIm * valRe;
      }
    }
    return { freqRe, freqIm };
  }

  // =====================================================================
  // 7c. Field generators — port of fields/gen_*.py
  // =====================================================================

  // L-STF (8 µs = 10 × 0.8 µs short symbols)
  function genLSTF(cfg, c) {
    const NFFT = window.EHT.NFFT_OS;
    // Build legacy SC array of length 53 (k=-26..26), complex.
    const legacy = c.S_26_26;        // already array of {re,im}
    const { freqRe, freqIm } = buildPreEHTFreq(legacy, 26, c, NFFT);

    // Norm = sqrt(N_LLTF/N_LSIG) / sqrt(N_LSTF)   (SISO non-punctured)
    const eps = Math.sqrt(c.N_tone_LLTF / c.N_tone_LSIG);
    const norm = eps / Math.sqrt(c.N_tone_LSTF);
    for (let i = 0; i < NFFT; i++) { freqRe[i] *= norm; freqIm[i] *= norm; }

    ifftSqrtN(freqRe, freqIm);
    // Repeat first NFFT/16 samples 10 times → 8 µs.
    const period = NFFT / 16;       // 384 for NFFT=6144
    const totalLen = period * 10;
    const re = new Float64Array(totalLen);
    const im = new Float64Array(totalLen);
    for (let r = 0; r < 10; r++) {
      for (let i = 0; i < period; i++) {
        re[r*period + i] = freqRe[i];
        im[r*period + i] = freqIm[i];
      }
    }
    return { re, im };
  }

  // L-LTF (8 µs = 1.6 µs CP + 2 × 3.2 µs symbols)
  function genLLTF(cfg, c) {
    const NFFT = window.EHT.NFFT_OS;
    const Fs   = window.EHT.FS_OS_MHZ * 1e6;
    const legacy = c.L_26_26.map(v => ({re:v, im:0}));
    const { freqRe, freqIm } = buildPreEHTFreq(legacy, 26, c, NFFT);

    const norm = 1 / Math.sqrt(c.N_tone_LSIG);
    for (let i = 0; i < NFFT; i++) { freqRe[i] *= norm; freqIm[i] *= norm; }
    ifftSqrtN(freqRe, freqIm);

    // Symbol length = 3.2 µs at 480 MHz = 1536 samples (also = NFFT/4 for 6144)
    const symLen = Math.round(3.2e-6 * Fs);            // 1536
    const cpLen  = Math.round(1.6e-6 * Fs);            // 768  (T_GI_LLTF)
    const totalLen = cpLen + 2 * symLen;
    const re = new Float64Array(totalLen);
    const im = new Float64Array(totalLen);
    // CP = last cpLen of one_sym
    for (let i = 0; i < cpLen; i++) {
      re[i] = freqRe[symLen - cpLen + i];
      im[i] = freqIm[symLen - cpLen + i];
    }
    // First symbol
    for (let i = 0; i < symLen; i++) {
      re[cpLen + i] = freqRe[i];
      im[cpLen + i] = freqIm[i];
    }
    // Second symbol (identical)
    for (let i = 0; i < symLen; i++) {
      re[cpLen + symLen + i] = freqRe[i];
      im[cpLen + symLen + i] = freqIm[i];
    }
    return { re, im };
  }

  // L-SIG (4 µs = 0.8 µs CP + 3.2 µs symbol). Returns {re, im, lsigFreq20}
  // where lsigFreq20 is the per-20-MHz freq vector for RL-SIG to reuse.
  function genLSIG(cfg, c) {
    const NFFT = window.EHT.NFFT_OS;
    const Fs   = window.EHT.FS_OS_MHZ * 1e6;
    // 24 bits: RATE(4)+R(1)+LENGTH(12)+P(1)+TAIL(6)
    const rate = c.LSIG_RATE_bits;
    const lengthBits = de2bi(cfg.LSIG_LEN, 12);
    let parity = 0;
    for (let i = 0; i < 4; i++) parity ^= rate[i];
    parity ^= 0;       // reserved
    for (let i = 0; i < 12; i++) parity ^= lengthBits[i];
    const lsigBits = new Uint8Array(24);
    lsigBits.set(rate, 0);
    lsigBits[4] = 0;                          // reserved
    lsigBits.set(lengthBits, 5);
    lsigBits[17] = parity & 1;
    // bits 18..23 = tail = 0

    // BCC encode → 48 bits, legacy interleave, BPSK
    const enc = bccEncoder(lsigBits);
    const interleaved = legacyInterleave(enc, 48, 1);
    const dk = bpskMap(interleaved);

    // Build legacy 57-element vector (k=-28..28)
    const legacy = new Array(57);
    for (let i = 0; i < 57; i++) legacy[i] = 0;
    const data_sc = [];
    [[-26,-22],[-20,-8],[-6,-1],[1,6],[8,20],[22,26]].forEach(([a,b]) => {
      for (let k = a; k <= b; k++) data_sc.push(k);
    });
    for (let i = 0; i < 48; i++) legacy[data_sc[i] + 28] = dk[i];
    // Pilots (p0)
    const p0 = c.pilot_polarity[0];
    const pilotVals = [p0, p0, p0, -p0];
    for (let i = 0; i < 4; i++) legacy[c.legacy_pilot_sc[i] + 28] = pilotVals[i];
    // Extra SCs at ±27, ±28
    for (let i = 0; i < 4; i++) legacy[c.LSIG_extra_sc_indices[i] + 28] = c.LSIG_extra_sc_values[i];

    const lsigFreq20 = legacy.slice();    // for RL-SIG reuse

    const legacyComplex = legacy.map(v => ({re:v, im:0}));
    const { freqRe, freqIm } = buildPreEHTFreq(legacyComplex, 28, c, NFFT);

    const norm = 1 / Math.sqrt(c.N_tone_LSIG);
    for (let i = 0; i < NFFT; i++) { freqRe[i] *= norm; freqIm[i] *= norm; }
    ifftSqrtN(freqRe, freqIm);

    const symLen = Math.round(3.2e-6 * Fs);
    const cpLen  = Math.round(0.8e-6 * Fs);
    const re = new Float64Array(cpLen + symLen);
    const im = new Float64Array(cpLen + symLen);
    for (let i = 0; i < cpLen; i++) {
      re[i] = freqRe[symLen - cpLen + i];
      im[i] = freqIm[symLen - cpLen + i];
    }
    for (let i = 0; i < symLen; i++) {
      re[cpLen + i] = freqRe[i];
      im[cpLen + i] = freqIm[i];
    }
    return { re, im, lsigFreq20 };
  }

  // RL-SIG: identical to L-SIG except pilots use p1 polarity.
  function genRLSIG(cfg, c, lsigFreq20) {
    const NFFT = window.EHT.NFFT_OS;
    const Fs   = window.EHT.FS_OS_MHZ * 1e6;
    const legacy = lsigFreq20.slice();
    const p1 = c.pilot_polarity[1];
    const pilotVals = [p1, p1, p1, -p1];
    for (let i = 0; i < 4; i++) legacy[c.legacy_pilot_sc[i] + 28] = pilotVals[i];

    const legacyComplex = legacy.map(v => ({re:v, im:0}));
    const { freqRe, freqIm } = buildPreEHTFreq(legacyComplex, 28, c, NFFT);

    const norm = 1 / Math.sqrt(c.N_tone_LSIG);
    for (let i = 0; i < NFFT; i++) { freqRe[i] *= norm; freqIm[i] *= norm; }
    ifftSqrtN(freqRe, freqIm);

    const symLen = Math.round(3.2e-6 * Fs);
    const cpLen  = Math.round(0.8e-6 * Fs);
    const re = new Float64Array(cpLen + symLen);
    const im = new Float64Array(cpLen + symLen);
    for (let i = 0; i < cpLen; i++) {
      re[i] = freqRe[symLen - cpLen + i];
      im[i] = freqIm[symLen - cpLen + i];
    }
    for (let i = 0; i < symLen; i++) {
      re[cpLen + i] = freqRe[i];
      im[cpLen + i] = freqIm[i];
    }
    return { re, im };
  }

  // U-SIG (2 OFDM symbols × 4 µs = 8 µs).
  function genUSIG(cfg, c) {
    const NFFT = window.EHT.NFFT_OS;
    const Fs   = window.EHT.FS_OS_MHZ * 1e6;

    // Build U-SIG-1 (26 bits) and U-SIG-2 (26 bits)
    const phyVer = de2bi(0, 3);
    const bwMap = { 20:0, 40:1, 80:2, 160:3, 320:4 };
    const bwBits = de2bi(bwMap[cfg.BW], 3);
    const ulDl = new Uint8Array([cfg.UL_DL || 0]);
    const bssColor = de2bi(cfg.BSS_Color || 0, 6);
    const txop = de2bi(cfg.TXOP != null ? cfg.TXOP : 127, 7);
    const disregard = new Uint8Array([1,1,1,1,1]);
    const validate1 = new Uint8Array([1]);
    const usig1 = new Uint8Array(26);
    let p = 0;
    function pushBits(arr) { for (let i = 0; i < arr.length; i++) usig1[p++] = arr[i]; }
    pushBits(phyVer); pushBits(bwBits); pushBits(ulDl); pushBits(bssColor);
    pushBits(txop); pushBits(disregard); pushBits(validate1);

    const ppduType = de2bi(1, 2);           // EHT SU = 1
    const validate2 = new Uint8Array([1]);
    const punctInfo = de2bi(0, 5);
    const validate3 = new Uint8Array([1]);
    const ehtSigMcs = de2bi(cfg.EHT_SIG_MCS != null ? cfg.EHT_SIG_MCS : 0, 2);
    const nEhtSigField = de2bi(cfg.N_EHT_SIG - 1, 5);
    const usig2info = new Uint8Array(16);
    let q = 0;
    function pushBits2(arr) { for (let i = 0; i < arr.length; i++) usig2info[q++] = arr[i]; }
    pushBits2(ppduType); pushBits2(validate2); pushBits2(punctInfo);
    pushBits2(validate3); pushBits2(ehtSigMcs); pushBits2(nEhtSigField);

    // CRC4 over 42 bits (USIG1 ‖ USIG2info)
    const crcInput = new Uint8Array(42);
    crcInput.set(usig1, 0);
    crcInput.set(usig2info, 26);
    const crcVal = window.EHT.crc4_usigArray(crcInput);   // 4-element [B7,B6,B5,B4]

    const usig2 = new Uint8Array(26);
    usig2.set(usig2info, 0);
    for (let i = 0; i < 4; i++) usig2[16 + i] = crcVal[i];
    // bits 20..25 = tail = 0

    // BCC encode all 52 bits → 104 bits
    const allBits = new Uint8Array(52);
    allBits.set(usig1, 0);
    allBits.set(usig2, 26);
    const encoded = bccEncoder(allBits);    // 104 bits

    // 2 OFDM symbols
    const data_sc = [];
    [[-28,-22],[-20,-8],[-6,-1],[1,6],[8,20],[22,28]].forEach(([a,b]) => {
      for (let k = a; k <= b; k++) data_sc.push(k);
    });
    const symLen = Math.round(3.2e-6 * Fs);
    const cpLen  = Math.round(0.8e-6 * Fs);
    const total = 2 * (cpLen + symLen);
    const re = new Float64Array(total);
    const im = new Float64Array(total);

    for (let symIdx = 0; symIdx < 2; symIdx++) {
      const symBits = encoded.slice(symIdx * 52, (symIdx + 1) * 52);
      const interleaved = hesigaInterleave(symBits, 52, 1);
      const dk = bpskMap(interleaved);

      const legacy = new Array(57);
      for (let i = 0; i < 57; i++) legacy[i] = 0;
      for (let i = 0; i < 52; i++) legacy[data_sc[i] + 28] = dk[i];

      const pIdx = symIdx + 2;             // U-SIG-1=p2, U-SIG-2=p3
      const pVal = c.pilot_polarity[pIdx % c.pilot_polarity.length];
      const pilotVals = [pVal, pVal, pVal, -pVal];
      for (let i = 0; i < 4; i++) legacy[c.legacy_pilot_sc[i] + 28] = pilotVals[i];

      const legacyComplex = legacy.map(v => ({re:v, im:0}));
      const { freqRe, freqIm } = buildPreEHTFreq(legacyComplex, 28, c, NFFT);
      const norm = 1 / Math.sqrt(c.N_tone_LSIG);
      for (let i = 0; i < NFFT; i++) { freqRe[i] *= norm; freqIm[i] *= norm; }
      ifftSqrtN(freqRe, freqIm);

      const off = symIdx * (cpLen + symLen);
      for (let i = 0; i < cpLen; i++) {
        re[off + i] = freqRe[symLen - cpLen + i];
        im[off + i] = freqIm[symLen - cpLen + i];
      }
      for (let i = 0; i < symLen; i++) {
        re[off + cpLen + i] = freqRe[i];
        im[off + cpLen + i] = freqIm[i];
      }
    }
    return { re, im };
  }

  // EHT-SIG (N_EHT_SIG OFDM symbols × 4 µs each).
  function genEHTSIG(cfg, c) {
    const NFFT = window.EHT.NFFT_OS;
    const Fs   = window.EHT.FS_OS_MHZ * 1e6;
    const N_EHT_SIG = cfg.N_EHT_SIG || 1;

    // Common field (20 bits) — Table 36-36
    const spatialReuse = de2bi(cfg.SpatialReuse || 0, 4);
    let giVal;
    if (cfg.LTFType === 2 && cfg.GI === 0.8)      giVal = 0;
    else if (cfg.LTFType === 2 && cfg.GI === 1.6) giVal = 1;
    else if (cfg.LTFType === 4 && cfg.GI === 0.8) giVal = 2;
    else                                            giVal = 3;       // (4, 3.2)
    const giLtf = de2bi(giVal, 2);
    const ltfCountMap = { 1:0, 2:1, 4:2, 6:3, 8:4 };
    const nLtfBits = de2bi(ltfCountMap[cfg.N_EHT_LTF || 1], 3);
    const ldpcExtra = new Uint8Array([(cfg.has_extra ? 1 : 0)]);
    const aVal = (cfg.a_init === 4) ? 0 : (cfg.a_init || 1);
    const preFecPad = de2bi(aVal, 2);
    const peDisamb = new Uint8Array([0]);
    const disregardE = new Uint8Array([1,1,1,1]);
    const nNonOfdma = de2bi(0, 3);
    const common = new Uint8Array(20);
    let r = 0;
    function p1(arr) { for (let i = 0; i < arr.length; i++) common[r++] = arr[i]; }
    p1(spatialReuse); p1(giLtf); p1(nLtfBits); p1(ldpcExtra);
    p1(preFecPad); p1(peDisamb); p1(disregardE); p1(nNonOfdma);

    // User field (22 bits)
    const staId = de2bi(cfg.STA_ID || 888, 11);
    const mcsBits = de2bi(cfg.MCS, 4);
    const reserved = new Uint8Array([1]);
    const nssBits = de2bi(0, 4);                 // NSS-1 = 0 for SU 1SS
    const beamformed = new Uint8Array([cfg.Beamformed || 0]);
    const codingBit = new Uint8Array([cfg.Coding === 'LDPC' ? 1 : 0]);
    const userField = new Uint8Array(22);
    let s2 = 0;
    function p2(arr) { for (let i = 0; i < arr.length; i++) userField[s2++] = arr[i]; }
    p2(staId); p2(mcsBits); p2(reserved); p2(nssBits); p2(beamformed); p2(codingBit);

    // CRC4 + tail
    const dataBits = new Uint8Array(42);
    dataBits.set(common, 0);
    dataBits.set(userField, 20);
    const crc = window.EHT.crc4_usigArray(dataBits);

    const allBits = new Uint8Array(52);
    allBits.set(dataBits, 0);
    for (let i = 0; i < 4; i++) allBits[42 + i] = crc[i];
    // 46..51 = tail = 0

    const encoded = bccEncoder(allBits);          // 104 bits

    const data_sc = [];
    [[-28,-22],[-20,-8],[-6,-1],[1,6],[8,20],[22,28]].forEach(([a,b]) => {
      for (let k = a; k <= b; k++) data_sc.push(k);
    });
    const symLen = Math.round(3.2e-6 * Fs);
    const cpLen  = Math.round(0.8e-6 * Fs);
    const total = N_EHT_SIG * (cpLen + symLen);
    const re = new Float64Array(total);
    const im = new Float64Array(total);

    // Phase rotation gamma_m per Eq. 36-24: positions 26..51 alternate sign
    const gammaM = new Float64Array(52);
    for (let i = 0; i < 52; i++) gammaM[i] = (i >= 26) ? Math.pow(-1, i) : 1;

    for (let symIdx = 0; symIdx < N_EHT_SIG; symIdx++) {
      const start = symIdx * 52;
      const symBits = new Uint8Array(52);
      for (let i = 0; i < 52 && start + i < encoded.length; i++) symBits[i] = encoded[start + i];
      const interleaved = hesigaInterleave(symBits, 52, 1);
      const dk = bpskMap(interleaved);

      const legacy = new Array(57);
      for (let i = 0; i < 57; i++) legacy[i] = 0;
      for (let i = 0; i < 52; i++) legacy[data_sc[i] + 28] = gammaM[i] * dk[i];

      const pIdx = 4 + symIdx;
      const pVal = c.pilot_polarity[pIdx % c.pilot_polarity.length];
      const pilotVals = [pVal, pVal, pVal, -pVal];
      for (let i = 0; i < 4; i++) legacy[c.legacy_pilot_sc[i] + 28] = pilotVals[i];

      const legacyComplex = legacy.map(v => ({re:v, im:0}));
      const { freqRe, freqIm } = buildPreEHTFreq(legacyComplex, 28, c, NFFT);
      const norm = 1 / Math.sqrt(c.N_tone_LSIG);
      for (let i = 0; i < NFFT; i++) { freqRe[i] *= norm; freqIm[i] *= norm; }
      ifftSqrtN(freqRe, freqIm);

      const off = symIdx * (cpLen + symLen);
      for (let i = 0; i < cpLen; i++) {
        re[off + i] = freqRe[symLen - cpLen + i];
        im[off + i] = freqIm[symLen - cpLen + i];
      }
      for (let i = 0; i < symLen; i++) {
        re[off + cpLen + i] = freqRe[i];
        im[off + cpLen + i] = freqIm[i];
      }
    }
    return { re, im };
  }

  // EHT-STF (4 µs = 5 × 0.8 µs periods). M sequence per Eq. 27-22.
  // Uses direct EHT subcarrier spacing (NOT legacy ×4).
  function genEHTSTF(cfg, c) {
    const NFFT = window.EHT.NFFT_OS;
    const M = [-1,-1,-1,1,1,1,-1,1,1,1,-1,1,1,-1,1];           // 15 elements
    const negM = M.map(v => -v);
    let coeff, scStart, scStep;
    scStep = 16;
    if (cfg.BW === 20)        { coeff = M.slice(); scStart = -112; }
    else if (cfg.BW === 40)   { coeff = [].concat(M, [0], negM); scStart = -240; }
    else if (cfg.BW === 80)   { coeff = [].concat(M, [1], negM, [0], negM, [1], negM); scStart = -496; }
    else if (cfg.BW === 160)  { coeff = [].concat(M, [1], negM, [0], negM, [1], negM, [0], negM, [-1], M, [0], negM, [1], negM); scStart = -1008; }
    else if (cfg.BW === 320)  {
      coeff = [].concat(
        M, [1], negM, [0], negM, [1], negM, [0],
        M, [1], negM, [0], negM, [1], negM, [0],
        negM, [-1], M, [0], M, [-1], M, [0],
        negM, [-1], M, [0], M, [-1], M
      );
      scStart = -2032;
    } else { throw new Error('EHT-STF unsupported BW'); }

    // Apply (1+j)/sqrt(2)
    const scale = 1 / Math.sqrt(2);
    // DC = 0 (already enforced by sequence structure when k=0 has 0)
    const freqRe = new Float64Array(NFFT);
    const freqIm = new Float64Array(NFFT);
    let nNonzero = 0;
    for (let i = 0; i < coeff.length; i++) {
      const k = scStart + i * scStep;
      const v = coeff[i];
      if (v === 0 || k === 0) continue;
      const bin = ((k % NFFT) + NFFT) % NFFT;
      freqRe[bin] = v * scale;
      freqIm[bin] = v * scale;
      nNonzero++;
    }
    if (nNonzero > 0) {
      const norm = 1 / Math.sqrt(nNonzero);
      for (let i = 0; i < NFFT; i++) { freqRe[i] *= norm; freqIm[i] *= norm; }
    }
    ifftSqrtN(freqRe, freqIm);

    const period = NFFT / 16;
    const totalLen = period * 5;
    const re = new Float64Array(totalLen);
    const im = new Float64Array(totalLen);
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < period; i++) {
        re[r*period + i] = freqRe[i];
        im[r*period + i] = freqIm[i];
      }
    }
    return { re, im };
  }

  // EHT-LTF: bit-perfect for canonical (BW=320, LTFType=4) using full Annex
  // sequence. For other configs, falls back to a deterministic ±1 sequence
  // derived from the EHT-STF M seed (preserves duration/structure but is not
  // bit-perfect against Python — flagged via console.warn).
  function genEHTLTF(cfg, c) {
    const NFFT = window.EHT.NFFT_OS;
    const Fs   = window.EHT.FS_OS_MHZ * 1e6;
    const ltfType = cfg.LTFType;
    const N_SR = c.N_SR;
    const scStep = (ltfType === 1) ? 4 : (ltfType === 2 ? 2 : 1);
    const sc_idx = [];
    for (let k = -N_SR; k <= N_SR; k += scStep) sc_idx.push(k);

    let vals;
    if (cfg.BW === 320 && ltfType === 4 && window.EHT_LTF_320_4X) {
      vals = window.EHT_LTF_320_4X;       // Loaded from eht_ldpc_matrices.js / eht_ltf.js
    } else {
      // Fallback: deterministic PN-like sequence (NOT bit-perfect).
      console.warn('[eht_pipeline] EHT-LTF using fallback sequence for (BW=' +
                   cfg.BW + ', LTFType=' + ltfType + '). Python LUT not embedded for this combo.');
      vals = new Float64Array(sc_idx.length);
      let lfsr = 0xACE;
      for (let i = 0; i < vals.length; i++) {
        vals[i] = (lfsr & 1) ? 1 : -1;
        const fb = ((lfsr >> 11) ^ (lfsr >> 8)) & 1;
        lfsr = ((lfsr << 1) | fb) & 0xFFF;
      }
    }
    if (vals.length !== sc_idx.length) {
      // Trim or pad (defensive)
      const tmp = new Float64Array(sc_idx.length);
      for (let i = 0; i < Math.min(vals.length, sc_idx.length); i++) tmp[i] = vals[i];
      vals = tmp;
    }

    const freqRe = new Float64Array(NFFT);
    const freqIm = new Float64Array(NFFT);
    for (let i = 0; i < sc_idx.length; i++) {
      const k = sc_idx[i];
      if (vals[i] === 0) continue;
      const bin = ((k % NFFT) + NFFT) % NFFT;
      freqRe[bin] = vals[i];
    }
    // Normalization per Eq. 36-44: gamma = N_total / divisor
    const ltfDivisor = { 1:4, 2:2, 4:1 }[ltfType];
    const N_total = c.all_occupied.length;
    const gamma = N_total / ltfDivisor;
    const norm = 1 / Math.sqrt(gamma);
    for (let i = 0; i < NFFT; i++) { freqRe[i] *= norm; freqIm[i] *= norm; }
    ifftSqrtN(freqRe, freqIm);

    const symLenMap = { 1: NFFT/4, 2: NFFT/2, 4: NFFT };
    const symLen = symLenMap[ltfType];
    const giLen = Math.round((cfg.GI || 3.2) * 1e-6 * Fs);
    const N_LTF = cfg.N_EHT_LTF || 1;
    const totalLen = N_LTF * (giLen + symLen);
    const re = new Float64Array(totalLen);
    const im = new Float64Array(totalLen);

    for (let n = 0; n < N_LTF; n++) {
      const off = n * (giLen + symLen);
      for (let i = 0; i < giLen; i++) {
        re[off + i] = freqRe[symLen - giLen + i];
        im[off + i] = freqIm[symLen - giLen + i];
      }
      for (let i = 0; i < symLen; i++) {
        re[off + giLen + i] = freqRe[i];
        im[off + giLen + i] = freqIm[i];
      }
    }
    return { re, im };
  }

  // PE: tile last data symbol up to T_PE samples (per eht_waveform_gen.py).
  function genPE(cfg, c, lastDataSym) {
    const Fs = window.EHT.FS_OS_MHZ * 1e6;
    const T_PE_us = cfg.fieldUs['PE'] || 4.0;
    const nSamp = Math.round(T_PE_us * 1e-6 * Fs);
    const re = new Float64Array(nSamp);
    const im = new Float64Array(nSamp);
    if (lastDataSym && lastDataSym.re.length > 0) {
      const src = lastDataSym;
      for (let i = 0; i < nSamp; i++) {
        re[i] = src.re[i % src.re.length];
        im[i] = src.im[i % src.im.length];
      }
    }
    return { re, im };
  }

  // =====================================================================
  // 8. Top-level generate(params) — full PPDU IQ + field map
  // =====================================================================

  // Memo cache keyed on params hash
  const _GEN_CACHE = {};
  function paramKey(p) {
    return [p.BW, p.MCS, p.APEP, p.GI, p.LTFType, p.NumMPDUs || 1,
            p.ScramblerInit || 1, p.Coding || 'auto'].join('|');
  }

  function generate(params) {
    const key = paramKey(params);
    if (_GEN_CACHE[key]) return _GEN_CACHE[key];

    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;

    const cfg = window.EHT.compute(params);
    const BW = params.BW;
    const c = ehtConstants(BW);

    // Augment cfg with the runtime fields gen_data_field expects
    cfg.BW = BW;
    cfg.ScramblerInit = params.ScramblerInit || 1;
    cfg.LSIG_LEN = cfg.LSIG_LEN;        // already from compute()
    cfg.LTFType = params.LTFType;
    cfg.GI = params.GI;
    cfg.MCS = params.MCS;
    cfg.UL_DL = params.UL_DL || 0;
    cfg.BSS_Color = params.BSS_Color || 0;
    cfg.TXOP = (params.TXOP != null) ? params.TXOP : 127;
    cfg.STA_ID = params.STA_ID || 888;
    cfg.Beamformed = params.Beamformed || 0;
    cfg.SpatialReuse = params.SpatialReuse || 0;
    cfg.EHT_SIG_MCS = (params.EHT_SIG_MCS != null) ? params.EHT_SIG_MCS : 0;
    // EHT-SIG symbol count from MCS table (Table 36-28)
    const ehtSigSymMap = { 0:2, 1:1, 2:1, 3:4 };
    cfg.N_EHT_SIG = ehtSigSymMap[cfg.EHT_SIG_MCS];
    cfg.N_EHT_LTF = 1;             // SISO 1SS

    // EHT-SIG duration scales with the actual symbol count (4 µs each).
    // The cfg.fieldUs default of 8 µs is the worst case (MCS 0 = 2 syms);
    // override here so TXTIME / total_samps stay invariant for MCS 1/2/3.
    cfg.fieldUs['EHT-SIG'] = cfg.N_EHT_SIG * 4;
    cfg.TXTIME = Object.values(cfg.fieldUs).reduce((a,b)=>a+b, 0);
    cfg.total_samps = Math.round(cfg.TXTIME * window.EHT.FS_OS_MHZ);
    cfg.LSIG_LEN = window.EHT.lsigLength(cfg.TXTIME);

    // Field durations per spec — fieldUs now reflects actual N_EHT_SIG.
    const fieldUs = cfg.fieldUs;
    const fieldOrder = ['L-STF','L-LTF','L-SIG','RL-SIG','U-SIG','EHT-SIG','EHT-STF','EHT-LTF','Data','PE'];

    // Build per-field IQ — fully spec-compliant generators where available
    const segments = [];
    let cumSample = 0;
    let lsigFreq20 = null;
    let lastDataSym = null;
    for (const name of fieldOrder) {
      let seg;
      try {
        if      (name === 'L-STF')   seg = genLSTF(cfg, c);
        else if (name === 'L-LTF')   seg = genLLTF(cfg, c);
        else if (name === 'L-SIG')   { const r = genLSIG(cfg, c); lsigFreq20 = r.lsigFreq20; seg = { re: r.re, im: r.im }; }
        else if (name === 'RL-SIG')  seg = genRLSIG(cfg, c, lsigFreq20);
        else if (name === 'U-SIG')   seg = genUSIG(cfg, c);
        else if (name === 'EHT-SIG') seg = genEHTSIG(cfg, c);
        else if (name === 'EHT-STF') seg = genEHTSTF(cfg, c);
        else if (name === 'EHT-LTF') seg = genEHTLTF(cfg, c);
        else if (name === 'Data')    {
          seg = genDataField(cfg, c);
          // Capture last data symbol for PE tiling
          const symLen = cfg.NFFT + cfg.CP_data;
          if (seg.re.length >= symLen) {
            const start = seg.re.length - symLen;
            lastDataSym = {
              re: seg.re.slice(start),
              im: seg.im.slice(start)
            };
          }
        }
        else if (name === 'PE')      seg = genPE(cfg, c, lastDataSym);
        else { seg = { re: new Float64Array(0), im: new Float64Array(0) }; }
      } catch (e) {
        console.error('[eht_pipeline] field', name, 'failed:', e);
        const nSamp = Math.round((fieldUs[name] || 0) * 1e-6 * window.EHT.FS_OS_MHZ * 1e6);
        seg = { re: new Float64Array(nSamp), im: new Float64Array(nSamp) };
      }
      const len = seg.re.length;
      segments.push({ name, startSample: cumSample, endSample: cumSample + len, re: seg.re, im: seg.im });
      cumSample += len;
    }
    const total = cumSample;

    // Concatenate
    const iqRe = new Float64Array(total);
    const iqIm = new Float64Array(total);
    for (const s of segments) {
      iqRe.set(s.re, s.startSample);
      iqIm.set(s.im, s.startSample);
    }

    const t1 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const result = {
      iqRe, iqIm,
      fields: segments.map(s => ({ name: s.name, startSample: s.startSample, endSample: s.endSample })),
      stats: {
        totalSamples: total,
        durationUs: total / window.EHT.FS_OS_MHZ,
        N_SYM_data: cfg.N_SYM,
        Coding: cfg.Coding,
        gen_ms: (t1 - t0) | 0
      },
      cfg
    };
    _GEN_CACHE[key] = result;
    return result;
  }

  // SHA-256 hash of IQ samples for reference-validation panel.
  // Byte order: little-endian Float64, I then Q interleaved.
  async function sha256IQ(iqRe, iqIm) {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const N = iqRe.length;
    const buf = new ArrayBuffer(N * 16);
    const dv = new DataView(buf);
    for (let i = 0; i < N; i++) {
      dv.setFloat64(i*16,    iqRe[i], true);
      dv.setFloat64(i*16+8, iqIm[i], true);
    }
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(hash);
    return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // =====================================================================
  // 9. Self-tests
  // =====================================================================

  // Verify Bluestein IFFT against simple radix-2 case: impulse → constant
  (function _bluesteinSelfTest(){
    const N = 16;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    re[0] = 1.0;     // δ(k=0) → IFFT = constant 1/sqrt(N) per Python convention
    ifftSqrtN(re, im);
    const expect = 1 / Math.sqrt(N);
    let maxErr = 0;
    for (let i = 0; i < N; i++) {
      maxErr = Math.max(maxErr, Math.abs(re[i] - expect), Math.abs(im[i]));
    }
    // Production-quiet: only log on failure.
    if (maxErr > 1e-10) {
      console.error('[eht_pipeline] Bluestein impulse self-test FAILED, maxErr=' + maxErr);
    }
  })();

  // =====================================================================
  // 10. Public API
  // =====================================================================

  window.EHT.pipeline = {
    generate, sha256IQ,
    // Building blocks for visualizations
    ifftSqrtN, fftRadix2, makeBluestein,
    ehtScrambler, constellationMap,
    ldpcEncodeFull, pn9Seed511, ldpcToneMap,
    genDataField, ehtConstants, K_MOD,
    // BCC + interleavers + helpers
    bccEncoder, bccPuncture, bccInterleaver,
    legacyInterleave, hesigaInterleave,
    de2bi, bpskMap, buildPreEHTFreq,
    // Field generators
    genLSTF, genLLTF, genLSIG, genRLSIG, genUSIG, genEHTSIG, genEHTSTF, genEHTLTF, genPE,
    // Cache control (Reference Validation panel can clear)
    clearCache: () => { for (const k in _GEN_CACHE) delete _GEN_CACHE[k]; }
  };
})();
