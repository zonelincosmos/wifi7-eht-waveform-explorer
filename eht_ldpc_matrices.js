// SPDX-License-Identifier: MIT
// Copyright (c) 2026 zonelincosmos
// IEEE 802.11-2024 Annex F (LDPC base matrices) — JavaScript port of
// ref/wifi7-python/coding/ldpc_matrices.py from
// https://github.com/zonelincosmos/wifi7-eht-waveform-generator-python
//
// eht_ldpc_matrices.js — IEEE 802.11-2024 Annex F LDPC base matrices and
// quasi-cyclic expansion + GF(2) Gaussian elimination utilities.
//
// Plain JS (no JSX). Loaded via <script src="eht_ldpc_matrices.js"></script>
// (NOT type="text/babel") to bypass Babel parsing for ~3 KB of pure data and
// ~120 lines of bit-twiddling math.
//
// Faithful port of ref/wifi7-python/coding/ldpc_matrices.py.
// Exposes: window.EHT_LDPC.{ BASE_MATRICES, BM_ROWS, Z_BY_NCW,
//                            getBaseMatrix, expandQC, deriveP,
//                            loadEncMatrix, encodeInfo }
//
// matrix_id = ri*10 + ci where:
//   ri = 1 (R=1/2), 2 (R=2/3), 3 (R=3/4), 4 (R=5/6)
//   ci = 1 (N=648),  2 (N=1296), 3 (N=1944)
"use strict";
(function(){

  // ====================================================================
  //  Rate 1/2 — 12 rows × 24 columns
  // ====================================================================

  // R=1/2, N=648, Z=27 — Annex F Table F-5
  const _BM_11 = new Int8Array([
     0,-1,-1,-1, 0, 0,-1,-1, 0,-1,-1, 0, 1, 0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    22, 0,-1,-1,17,-1, 0, 0,12,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,-1,-1,
     6,-1, 0,-1,10,-1,-1,-1,24,-1, 0,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,-1,
     2,-1,-1, 0,20,-1,-1,-1,25, 0,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,
    23,-1,-1,-1, 3,-1,-1,-1, 0,-1, 9,11,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,
    24,-1,23, 1,17,-1, 3,-1,10,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,
    25,-1,-1,-1, 8,-1,-1,-1, 7,18,-1,-1, 0,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,
    13,24,-1,-1, 0,-1, 8,-1, 6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,
     7,20,-1,16,22,10,-1,-1,23,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,
    11,-1,-1,-1,19,-1,-1,-1,13,-1, 3,17,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,
    25,-1, 8,-1,23,18,-1,14, 9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,
     3,-1,-1,-1,16,-1,-1, 2,25, 5,-1,-1, 1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0
  ]);

  // R=1/2, N=1296, Z=54 — Annex F Table F-6
  const _BM_12 = new Int8Array([
    40,-1,-1,-1,22,-1,49,23,43,-1,-1,-1, 1, 0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    50, 1,-1,-1,48,35,-1,-1,13,-1,30,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    39,50,-1,-1, 4,-1, 2,-1,-1,-1,-1,49,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,-1,
    33,-1,-1,38,37,-1,-1, 4, 1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,
    45,-1,-1,-1, 0,22,-1,-1,20,42,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,
    51,-1,-1,48,35,-1,-1,-1,44,-1,18,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,
    47,11,-1,-1,-1,17,-1,-1,51,-1,-1,-1, 0,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,
     5,-1,25,-1, 6,-1,45,-1,13,40,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,
    33,-1,-1,34,24,-1,-1,-1,23,-1,-1,46,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,
     1,-1,27,-1, 1,-1,-1,-1,38,-1,44,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,
    -1,18,-1,-1,23,-1,-1, 8, 0,35,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,
    49,-1,17,-1,30,-1,-1,-1,34,-1,-1,19, 1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0
  ]);

  // R=1/2, N=1944, Z=81 — Annex F Table F-7
  const _BM_13 = new Int8Array([
    57,-1,-1,-1,50,-1,11,-1,50,-1,79,-1, 1, 0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
     3,-1,28,-1, 0,-1,-1,-1,55, 7,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    30,-1,-1,-1,24,37,-1,-1,56,14,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,-1,
    62,53,-1,-1,53,-1,-1, 3,35,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,-1,
    40,-1,-1,20,66,-1,-1,22,28,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,-1,
     0,-1,-1,-1, 8,-1,42,-1,50,-1,-1, 8,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,
    69,79,79,-1,-1,-1,56,-1,52,-1,-1,-1, 0,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,
    65,-1,-1,-1,38,57,-1,-1,72,-1,27,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,
    64,-1,-1,-1,14,52,-1,-1,30,-1,-1,32,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,
    -1,45,-1,70, 0,-1,-1,-1,77, 9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,
     2,56,-1,57,35,-1,-1,-1,-1,-1,12,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0, 0,
    24,-1,61,-1,60,-1,-1,27,51,-1,-1,16, 1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1, 0
  ]);

  // ====================================================================
  //  Rate 2/3 — 8 rows × 24 columns
  // ====================================================================

  // R=2/3, N=648, Z=27 — Annex F Table F-8
  const _BM_21 = new Int8Array([
    25,26,14,-1,20,-1, 2,-1, 4,-1,-1, 8,-1,16,-1,18, 1, 0,-1,-1,-1,-1,-1,-1,
    10, 9,15,11,-1, 0,-1, 1,-1,-1,18,-1, 8,-1,10,-1,-1, 0, 0,-1,-1,-1,-1,-1,
    16, 2,20,26,21,-1, 6,-1, 1,26,-1, 7,-1,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,
    10,13, 5, 0,-1, 3,-1, 7,-1,-1,26,-1,-1,13,-1,16,-1,-1,-1, 0, 0,-1,-1,-1,
    23,14,24,-1,12,-1,19,-1,17,-1,-1,-1,20,-1,21,-1, 0,-1,-1,-1, 0, 0,-1,-1,
     6,22, 9,20,-1,25,-1,17,-1, 8,-1,14,-1,18,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,
    14,23,21,11,20,-1,24,-1,18,-1,19,-1,-1,-1,-1,22,-1,-1,-1,-1,-1,-1, 0, 0,
    17,11,11,20,-1,21,-1,26,-1, 3,-1,-1,18,-1,26,-1, 1,-1,-1,-1,-1,-1,-1, 0
  ]);

  // R=2/3, N=1296, Z=54 — Annex F Table F-9
  const _BM_22 = new Int8Array([
    39,31,22,43,-1,40, 4,-1,11,-1,-1,50,-1,-1,-1, 6, 1, 0,-1,-1,-1,-1,-1,-1,
    25,52,41, 2, 6,-1,14,-1,34,-1,-1,-1,24,-1,37,-1,-1, 0, 0,-1,-1,-1,-1,-1,
    43,31,29, 0,21,-1,28,-1,-1, 2,-1,-1, 7,-1,17,-1,-1,-1, 0, 0,-1,-1,-1,-1,
    20,33,48,-1, 4,13,-1,26,-1,-1,22,-1,-1,46,42,-1,-1,-1,-1, 0, 0,-1,-1,-1,
    45, 7,18,51,12,25,-1,-1,-1,50,-1,-1, 5,-1,-1,-1, 0,-1,-1,-1, 0, 0,-1,-1,
    35,40,32,16, 5,-1,-1,18,-1,-1,43,51,-1,32,-1,-1,-1,-1,-1,-1,-1, 0, 0,-1,
     9,24,13,22,28,-1,-1,37,-1,-1,25,-1,-1,52,-1,13,-1,-1,-1,-1,-1,-1, 0, 0,
    32,22, 4,21,16,-1,-1,-1,27,28,-1,38,-1,-1,-1, 8, 1,-1,-1,-1,-1,-1,-1, 0
  ]);

  // R=2/3, N=1944, Z=81 — Annex F Table F-10
  const _BM_23 = new Int8Array([
    61,75, 4,63,56,-1,-1,-1,-1,-1,-1, 8,-1, 2,17,25, 1, 0,-1,-1,-1,-1,-1,-1,
    56,74,77,20,-1,-1,-1,64,24, 4,67,-1, 7,-1,-1,-1,-1, 0, 0,-1,-1,-1,-1,-1,
    28,21,68,10, 7,14,65,-1,-1,-1,23,-1,-1,-1,75,-1,-1,-1, 0, 0,-1,-1,-1,-1,
    48,38,43,78,76,-1,-1,-1,-1, 5,36,-1,15,72,-1,-1,-1,-1,-1, 0, 0,-1,-1,-1,
    40, 2,53,25,-1,52,62,-1,20,-1,-1,44,-1,-1,-1,-1, 0,-1,-1,-1, 0, 0,-1,-1,
    69,23,64,10,22,-1,21,-1,-1,-1,-1,-1,68,23,29,-1,-1,-1,-1,-1,-1, 0, 0,-1,
    12, 0,68,20,55,61,-1,40,-1,-1,-1,52,-1,-1,-1,44,-1,-1,-1,-1,-1,-1, 0, 0,
    58, 8,34,64,78,-1,-1,11,78,24,-1,-1,-1,-1,-1,58, 1,-1,-1,-1,-1,-1,-1, 0
  ]);

  // ====================================================================
  //  Rate 3/4 — 6 rows × 24 columns
  // ====================================================================

  // R=3/4, N=648, Z=27 — Annex F Table F-11
  const _BM_31 = new Int8Array([
    16,17,22,24, 9, 3,14,-1, 4, 2, 7,-1,26,-1, 2,-1,21,-1, 1, 0,-1,-1,-1,-1,
    25,12,12, 3, 3,26, 6,21,-1,15,22,-1,15,-1, 4,-1,-1,16,-1, 0, 0,-1,-1,-1,
    25,18,26,16,22,23, 9,-1, 0,-1, 4,-1, 4,-1, 8,23,11,-1,-1,-1, 0, 0,-1,-1,
     9, 7, 0, 1,17,-1,-1, 7, 3,-1, 3,23,-1,16,-1,-1,21,-1, 0,-1,-1, 0, 0,-1,
    24, 5,26, 7, 1,-1,-1,15,24,15,-1, 8,-1,13,-1,13,-1,11,-1,-1,-1,-1, 0, 0,
     2, 2,19,14,24, 1,15,19,-1,21,-1, 2,-1,24,-1, 3,-1, 2, 1,-1,-1,-1,-1, 0
  ]);

  // R=3/4, N=1296, Z=54 — Annex F Table F-12
  const _BM_32 = new Int8Array([
    39,40,51,41, 3,29, 8,36,-1,14,-1, 6,-1,33,-1,11,-1, 4, 1, 0,-1,-1,-1,-1,
    48,21,47, 9,48,35,51,-1,38,-1,28,-1,34,-1,50,-1,50,-1,-1, 0, 0,-1,-1,-1,
    30,39,28,42,50,39, 5,17,-1, 6,-1,18,-1,20,-1,15,-1,40,-1,-1, 0, 0,-1,-1,
    29, 0, 1,43,36,30,47,-1,49,-1,47,-1, 3,-1,35,-1,34,-1, 0,-1,-1, 0, 0,-1,
     1,32,11,23,10,44,12, 7,-1,48,-1, 4,-1, 9,-1,17,-1,16,-1,-1,-1,-1, 0, 0,
    13, 7,15,47,23,16,47,-1,43,-1,29,-1,52,-1, 2,-1,53,-1, 1,-1,-1,-1,-1, 0
  ]);

  // R=3/4, N=1944, Z=81 — Annex F Table F-13
  const _BM_33 = new Int8Array([
    48,29,28,39, 9,61,-1,-1,-1,63,45,80,-1,-1,-1,37,32,22, 1, 0,-1,-1,-1,-1,
     4,49,42,48,11,30,-1,-1,-1,49,17,41,37,15,-1,54,-1,-1,-1, 0, 0,-1,-1,-1,
    35,76,78,51,37,35,21,-1,17,64,-1,-1,-1,59, 7,-1,-1,32,-1,-1, 0, 0,-1,-1,
     9,65,44, 9,54,56,73,34,42,-1,-1,-1,35,-1,-1,-1,46,39, 0,-1,-1, 0, 0,-1,
     3,62, 7,80,68,26,-1,80,55,-1,36,-1,26,-1, 9,-1,72,-1,-1,-1,-1,-1, 0, 0,
    26,75,33,21,69,59, 3,38,-1,-1,-1,35,-1,62,36,26,-1,-1, 1,-1,-1,-1,-1, 0
  ]);

  // ====================================================================
  //  Rate 5/6 — 4 rows × 24 columns
  // ====================================================================

  // R=5/6, N=648, Z=27 — Annex F Table F-14
  const _BM_41 = new Int8Array([
    17,13, 8,21, 9, 3,18,12,10, 0, 4,15,19, 2, 5,10,26,19,13,13, 1, 0,-1,-1,
     3,12,11,14,11,25, 5,18, 0, 9, 2,26,26,10,24, 7,14,20, 4, 2,-1, 0, 0,-1,
    22,16, 4, 3,10,21,12, 5,21,14,19, 5,-1, 8, 5,18,11, 5, 5,15, 0,-1, 0, 0,
     7, 7,14,14, 4,16,16,24,24,10, 1, 7,15, 6,10,26, 8,18,21,14, 1,-1,-1, 0
  ]);

  // R=5/6, N=1296, Z=54 — Annex F Table F-15
  const _BM_42 = new Int8Array([
    48,29,37,52, 2,16, 6,14,53,31,34, 5,18,42,53,31,45,-1,46,52, 1, 0,-1,-1,
    17, 4,30, 7,43,11,24, 6,14,21, 6,39,17,40,47, 7,15,41,19,-1,-1, 0, 0,-1,
     7, 2,51,31,46,23,16,11,53,40,10, 7,46,53,33,35,-1,25,35,38, 0,-1, 0, 0,
    19,48,41, 1,10, 7,36,47, 5,29,52,52,31,10,26, 6, 3, 2,-1,51, 1,-1,-1, 0
  ]);

  // R=5/6, N=1944, Z=81 — Annex F Table F-16 (canonical case for BW=320 MCS=13)
  const _BM_43 = new Int8Array([
    13,48,80,66, 4,74, 7,30,76,52,37,60,-1,49,73,31,74,73,23,-1, 1, 0,-1,-1,
    69,63,74,56,64,77,57,65, 6,16,51,-1,64,-1,68, 9,48,62,54,27,-1, 0, 0,-1,
    51,15, 0,80,24,25,42,54,44,71,71, 9,67,35,-1,58,-1,29,-1,53, 0,-1, 0, 0,
    16,29,36,41,44,56,59,37,50,24,-1,65, 4,65,52,-1, 4,-1,73,52, 1,-1,-1, 0
  ]);

  const BASE_MATRICES = {
    11: _BM_11, 12: _BM_12, 13: _BM_13,
    21: _BM_21, 22: _BM_22, 23: _BM_23,
    31: _BM_31, 32: _BM_32, 33: _BM_33,
    41: _BM_41, 42: _BM_42, 43: _BM_43
  };

  // Number of base-matrix rows per code rate:
  //   R=1/2 → 12 rows,  R=2/3 → 8,  R=3/4 → 6,  R=5/6 → 4.
  // Each matrix has 24 columns regardless of rate.
  const BM_ROWS = { 1: 12, 2: 8, 3: 6, 4: 4 };

  // Lifting factor Z by codeword length.
  const Z_BY_NCW = { 648: 27, 1296: 54, 1944: 81 };

  function rateToRi(Rn, Rd) {
    const scale = (Rn * 12) / Rd;     // 1/2→6, 2/3→8, 3/4→9, 5/6→10
    if (scale === 6)  return 1;
    if (scale === 8)  return 2;
    if (scale === 9)  return 3;
    if (scale === 10) return 4;
    return -1;
  }
  function ncwToCi(ncw) {
    if (ncw === 648)  return 1;
    if (ncw === 1296) return 2;
    if (ncw === 1944) return 3;
    return -1;
  }

  // Returns { data: Int8Array(rows*24), rows, cols:24, z }
  function getBaseMatrix(n_cw, r_num, r_den) {
    const ri = rateToRi(r_num, r_den);
    const ci = ncwToCi(n_cw);
    if (ri < 0 || ci < 0) {
      throw new Error('LDPC: unsupported (' + r_num + '/' + r_den + ', N=' + n_cw + ')');
    }
    return {
      data: BASE_MATRICES[ri * 10 + ci],
      rows: BM_ROWS[ri],
      cols: 24,
      z:    Z_BY_NCW[n_cw]
    };
  }

  // Quasi-cyclic expansion: each base entry s ∈ [0, Z-1] becomes a Z×Z
  // identity circularly shifted right by s positions; s = -1 becomes zero block.
  // Returns Uint8Array of shape (rows*z) × (cols*z), row-major flat layout.
  function expandQC(bm, rows, cols, z) {
    const M = rows * z;
    const N = cols * z;
    const h = new Uint8Array(M * N);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const s = bm[r * cols + c];
        if (s < 0) continue;                    // zero block
        // Identity row i has a 1 at column i; shifted-right by s puts it at (i+s) mod z.
        for (let i = 0; i < z; i++) {
          const j = (i + s) % z;
          h[(r * z + i) * N + (c * z + j)] = 1;
        }
      }
    }
    return h;
  }

  // GF(2) Gaussian elimination to derive encoding matrix P such that
  //   parity = P · info_bits (mod 2)
  // and codeword = [info, parity] satisfies H · codeword = 0 (mod 2).
  //
  // Partition H = [H1 | H2] where H1 ∈ M×K, H2 ∈ M×M. Augment [H2 | H1] and
  // row-reduce to [I | P]. Bit-packed Uint32Array rows give 32× speedup vs
  // byte-per-bit; for the canonical (1944, 5/6) case this runs in <50 ms.
  function deriveP(h, M, N) {
    const K = N - M;
    const totalBits = M + K;                      // = N (per row of `a`)
    const rowWords = Math.ceil(totalBits / 32);
    const a = [];
    for (let r = 0; r < M; r++) {
      const row = new Uint32Array(rowWords);
      // First M cols of a ← columns K..N-1 of H (= H2)
      for (let c = 0; c < M; c++) {
        if (h[r * N + (K + c)]) row[c >>> 5] |= (1 << (c & 31));
      }
      // Next K cols of a ← columns 0..K-1 of H (= H1)
      for (let c = 0; c < K; c++) {
        const idx = M + c;
        if (h[r * N + c]) row[idx >>> 5] |= (1 << (idx & 31));
      }
      a.push(row);
    }
    // Forward + back substitution: reduce columns 0..M-1 to identity
    for (let col = 0; col < M; col++) {
      const wIdx = col >>> 5;
      const bMask = 1 << (col & 31);
      // Find pivot row at index >= col with a 1 at this column
      let pivot = -1;
      for (let r = col; r < M; r++) {
        if (a[r][wIdx] & bMask) { pivot = r; break; }
      }
      if (pivot < 0) {
        throw new Error('LDPC: H2 submatrix singular at column ' + col);
      }
      if (pivot !== col) {
        const tmp = a[col]; a[col] = a[pivot]; a[pivot] = tmp;
      }
      const piv = a[col];
      for (let r = 0; r < M; r++) {
        if (r === col) continue;
        if (a[r][wIdx] & bMask) {
          const ar = a[r];
          for (let w = 0; w < rowWords; w++) ar[w] ^= piv[w];
        }
      }
    }
    // Extract P from columns M..M+K-1 of `a`
    const P = new Uint8Array(M * K);
    for (let r = 0; r < M; r++) {
      const ar = a[r];
      for (let c = 0; c < K; c++) {
        const colIdx = M + c;
        if (ar[colIdx >>> 5] & (1 << (colIdx & 31))) P[r * K + c] = 1;
      }
    }
    return P;
  }

  // First-call cached load of P for given (n_cw, r_num, r_den).
  const _P_CACHE = {};
  function loadEncMatrix(n_cw, r_num, r_den) {
    const key = n_cw + '_' + r_num + '_' + r_den;
    if (_P_CACHE[key]) return _P_CACHE[key];
    const bm = getBaseMatrix(n_cw, r_num, r_den);
    const M = bm.rows * bm.z;
    const N = bm.cols * bm.z;
    const K = N - M;
    const h = expandQC(bm.data, bm.rows, bm.cols, bm.z);
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const P = deriveP(h, M, N);
    const t1 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const result = { P, M, K, N, z: bm.z, h, derive_ms: (t1 - t0) | 0 };
    _P_CACHE[key] = result;
    return result;
  }

  // Encode a single (n_cw, R) codeword. info has length K.
  // Returns Uint8Array of length n_cw = K + M (info concatenated with parity).
  function encodeInfo(infoBits, n_cw, r_num, r_den) {
    const enc = loadEncMatrix(n_cw, r_num, r_den);
    const P = enc.P, M = enc.M, K = enc.K;
    if (infoBits.length !== K) {
      throw new Error('LDPC: info length ' + infoBits.length + ' != K=' + K);
    }
    const codeword = new Uint8Array(n_cw);
    for (let i = 0; i < K; i++) codeword[i] = infoBits[i] & 1;
    for (let r = 0; r < M; r++) {
      let bit = 0;
      const off = r * K;
      for (let c = 0; c < K; c++) {
        if (P[off + c]) bit ^= infoBits[c];
      }
      codeword[K + r] = bit & 1;
    }
    return codeword;
  }

  // Verify H · codeword = 0 (mod 2) for a sanity check.
  function verifyCodeword(codeword, n_cw, r_num, r_den) {
    const enc = loadEncMatrix(n_cw, r_num, r_den);
    const h = enc.h, M = enc.M, N = enc.N;
    for (let r = 0; r < M; r++) {
      let s = 0;
      const off = r * N;
      for (let c = 0; c < N; c++) {
        if (h[off + c]) s ^= codeword[c];
      }
      if (s & 1) return false;
    }
    return true;
  }

  // ---- Lazy self-test (runs on first encode) -----------------------
  // Tests both the smallest matrix (648, 1/2) and the canonical-case largest
  // (1944, 5/6) used by BW=320 MCS=13. For each: encodes an info vector with a
  // single 1 and checks H·c = 0 mod 2.
  let _selfTested = false;
  function ensureSelfTest() {
    if (_selfTested) return;
    _selfTested = true;
    function trial(N, Rn, Rd) {
      try {
        const enc = loadEncMatrix(N, Rn, Rd);
        const info = new Uint8Array(enc.K);
        info[0] = 1;
        const cw = encodeInfo(info, N, Rn, Rd);
        const ok = verifyCodeword(cw, N, Rn, Rd);
        if (!ok) {
          console.error('[eht_ldpc_matrices] H·c=0 self-test FAILED for (' + N + ', ' + Rn + '/' + Rd + ').');
          return false;
        }
        return true;                          // silent success
      } catch (e) {
        console.error('[eht_ldpc_matrices] self-test exception (' + N + ', ' + Rn + '/' + Rd + '):', e);
        return false;
      }
    }
    trial(648, 1, 2);                          // smallest
    trial(1944, 5, 6);                         // canonical for BW=320 MCS=13
  }

  window.EHT_LDPC = {
    // Data
    BASE_MATRICES, BM_ROWS, Z_BY_NCW,
    // Lookups
    rateToRi, ncwToCi, getBaseMatrix,
    // Math
    expandQC, deriveP,
    // High-level
    loadEncMatrix, encodeInfo, verifyCodeword,
    // Run self-test (the user can call from console after load)
    ensureSelfTest
  };
})();
