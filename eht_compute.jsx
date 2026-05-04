// SPDX-License-Identifier: MIT
// Copyright (c) 2026 zonelincosmos
// JavaScript port of the spec-compliant Python reference at
// https://github.com/zonelincosmos/wifi7-eht-waveform-generator-python
//
// EHT pipeline compute helpers — pure JS, exposed on window.EHT.
// Implements the length / N_DBPS / N_SYM cascade (IEEE 802.11be-2024
// §36.3.7.10, Eq. 36-54..62, Table 19-16), CRC-4 / CRC-8 / CRC-32, and the
// MCS / BW / pilot / Ψ data tables.
"use strict";
(function(){
  // BW config tables.
  // NFFT_native = native FFT size at fs = BW MHz. Python reference oversamples
  // to fs = 480 MHz with a single NFFT = 6144 zero-padded IFFT for ALL BWs
  // (eht_config.py:329 hardcodes cfg['NFFT'] = 6144).
  // N_sb = segment parser sub-block count (Eq. 36-70): 1 for BW≤80, 2 for 160, 4 for 320.
  const BW_CFG = {
    20:  { NFFT_native:256,  N_SR:122, N_SD:234,  N_SP:8,  N_ST:242,  N_SDshort:60,  N_sb:1, N_20MHz:1  },
    40:  { NFFT_native:512,  N_SR:244, N_SD:468,  N_SP:16, N_ST:484,  N_SDshort:120, N_sb:1, N_20MHz:2  },
    80:  { NFFT_native:1024, N_SR:500, N_SD:980,  N_SP:16, N_ST:996,  N_SDshort:240, N_sb:1, N_20MHz:4  },
    160: { NFFT_native:2048, N_SR:1012,N_SD:1960, N_SP:32, N_ST:1992, N_SDshort:492, N_sb:2, N_20MHz:8  },
    320: { NFFT_native:4096, N_SR:2036,N_SD:3920, N_SP:64, N_ST:3984, N_SDshort:984, N_sb:4, N_20MHz:16 }
  };
  // Oversampled NFFT and Fs for time-domain output (Python reference convention).
  const NFFT_OS = 6144;
  const FS_OS_MHZ = 480;
  // CP samples derive from GI alone (not BW): CP = round(GI_us · Fs_MHz).
  // Backward-compat: keep `NSDshort` alias for any external code that read the old key.
  for (const k in BW_CFG) {
    BW_CFG[k].NFFT = NFFT_OS;
    BW_CFG[k].fs   = FS_OS_MHZ;
    BW_CFG[k].sub  = 480 / k;          // oversampling factor per BW
    BW_CFG[k].NSDshort = BW_CFG[k].N_SDshort;  // legacy alias
  }
  // MCS table
  const MCS = [
    {idx:0,  name:'BPSK',     bpscs:1,  Rn:1,Rd:2, points:2},
    {idx:1,  name:'QPSK',     bpscs:2,  Rn:1,Rd:2, points:4},
    {idx:2,  name:'QPSK',     bpscs:2,  Rn:3,Rd:4, points:4},
    {idx:3,  name:'16-QAM',   bpscs:4,  Rn:1,Rd:2, points:16},
    {idx:4,  name:'16-QAM',   bpscs:4,  Rn:3,Rd:4, points:16},
    {idx:5,  name:'64-QAM',   bpscs:6,  Rn:2,Rd:3, points:64},
    {idx:6,  name:'64-QAM',   bpscs:6,  Rn:3,Rd:4, points:64},
    {idx:7,  name:'64-QAM',   bpscs:6,  Rn:5,Rd:6, points:64},
    {idx:8,  name:'256-QAM',  bpscs:8,  Rn:3,Rd:4, points:256},
    {idx:9,  name:'256-QAM',  bpscs:8,  Rn:5,Rd:6, points:256},
    {idx:10, name:'1024-QAM', bpscs:10, Rn:3,Rd:4, points:1024},
    {idx:11, name:'1024-QAM', bpscs:10, Rn:5,Rd:6, points:1024},
    {idx:12, name:'4096-QAM', bpscs:12, Rn:3,Rd:4, points:4096},
    {idx:13, name:'4096-QAM', bpscs:12, Rn:5,Rd:6, points:4096}
  ];

  // PPDU fields (durations in us at fs=480 → samples = us*480)
  function ppduFields(p) {
    const fs = 480; // MHz
    const TSYM_us = p.GI === 3.2 ? 16.0 : (p.GI === 1.6 ? 14.4 : 13.6);
    // T_EHT_LTF_SYM = T_DFT + T_GI; T_DFT = 12.8 (4x) or 6.4 (2x). Per IEEE 802.11be-2024 §36.3.6.
    const NEHT_LTF = (p.LTFType === 4 ? 12.8 : 6.4) + p.GI;
    return [
      { name:'L-STF',    us:8.0,  color:'#fde4b8', desc:'Legacy STF — AGC, timing sync, coarse freq offset. 12 nonzero SCs every 4th, values (±1±j)/√2 per Eq. 19-8, 10× 0.8 µs.' },
      { name:'L-LTF',    us:8.0,  color:'#e6d5f5', desc:'Legacy LTF — channel estimation for L-SIG. 52 nonzero SCs, 1.6µs double-GI + 2× 3.2µs symbols.' },
      { name:'L-SIG',    us:4.0,  color:'#c8e6ec', desc:'Legacy SIG — 24 bits BCC R=1/2 BPSK. RATE=0xD, LENGTH (12b), parity, tail. LENGTH mod 3 = 0 differentiates EHT vs HE.' },
      { name:'RL-SIG',   us:4.0,  color:'#cfe9d4', desc:'Repeated L-SIG. Same content as L-SIG but pilot polarity p_1. NOT Q-BPSK rotated.' },
      { name:'U-SIG',    us:8.0,  color:'#f0e4b0', desc:'Universal SIG — 2 syms BPSK BCC R=1/2. PHY ver, BW, BSS color, TXOP, PPDU type, EHT-SIG MCS, N_EHT-SIG, CRC-4.' },
      { name:'EHT-SIG',  us:8.0,  color:'#fbd5b8', desc:'EHT SIG — Common(20b) + User(22b) + 4-bit CRC + 6-bit Tail. BCC R=1/2. Carries MCS, NSS, coding, pre-FEC pad factor a, GI+LTF.' },
      { name:'EHT-STF',  us:4.0,  color:'#f5c8c8', desc:'EHT STF — AGC reset for EHT MIMO portion. 5× 0.8µs (MU non-TB). Periodic sequence.' },
      { name:'EHT-LTF',  us:NEHT_LTF, color:'#dde8c0', desc:'EHT LTF — MIMO channel estimation. 4× LTF populates every SC; 2× LTF every 2nd SC interpolated.' },
      { name:'Data',     us:NaN,  color:'#c8d8f0', desc:'Data field — N_SYM × T_SYM. Carries SERVICE + scrambled+LDPC-encoded PSDU + post-FEC pad.' },
      { name:'PE',       us:4.0,  color:'#dbe1ea', desc:'Packet Extension — 0–20µs, content implementation-defined. Lets RX drain its pipeline before signal extension.' }
    ];
  }

  // L-SIG length from TXTIME (per IEEE 802.11be-2024 Eq. 36-43, SE = 0 µs for SU)
  function lsigLength(TXTIME_us) {
    return Math.ceil((TXTIME_us - 0 - 20) / 4) * 3 - 3;
  }

  // Resolve coding mode (auto / BCC / LDPC). Auto picks BCC for BW=20 + MCS≤9, else LDPC.
  function resolveCoding(BW, MCS, requested) {
    const r = (requested || 'auto').toString().toUpperCase();
    if (r === 'BCC' || r === 'LDPC') return r;
    return (BW === 20 && MCS <= 9) ? 'BCC' : 'LDPC';
  }

  // _ldpcParams — full IEEE 802.11-2024 Table 19-16 cascade with EHT-specific
  // Eq. 36-54..58 extra-symbol updates. Faithful port of
  // ref/wifi7-python/eht_config.py:_ldpc_params (lines 20–163).
  //
  // Inputs: per-symbol bit counts (CBPS / CBPS_short), code rate (Rn/Rd),
  // PSDU bytes, SERVICE bits, optional a_init override.
  // Returns object with keys: L_LDPC, N_CW, N_shrt, N_punc, N_rep, N_SYM,
  // N_avbits, N_pld, N_pld_raw, has_extra_symbol, a_init_used.
  function _ldpcParams(N_CBPS, N_CBPS_short, Rn, Rd, psdu_bytes, N_service, a_init_in) {
    const R = Rn / Rd;
    const m_STBC = 1;

    // Step a) raw N_pld and initial N_SYM
    const N_pld_raw = 8 * psdu_bytes + N_service;            // LDPC: N_tail = 0
    const N_DBPS = Math.floor(N_CBPS * R);
    let N_SYM = Math.ceil(N_pld_raw / (N_DBPS * m_STBC)) * m_STBC;
    const N_SYM_init = N_SYM;
    let N_pld = N_pld_raw;

    // Resolve a_init for Eq. 36-56/58 handling
    let a_init = null;
    if (a_init_in != null) {
      a_init = a_init_in;
    } else if (N_CBPS_short != null) {
      const N_DBPS_short = Math.floor(N_CBPS_short * R);
      const N_Excess = N_pld % N_DBPS;
      a_init = (N_Excess === 0) ? 4 : Math.min(Math.ceil(N_Excess / N_DBPS_short), 4);
    }

    // EHT override: N_pld (Eq. 36-54) and N_avbits (Eq. 36-55)
    let N_avbits;
    if (a_init != null && N_CBPS_short != null) {
      const N_DBPS_short_local = Math.floor(N_CBPS_short * R);
      const N_DBPS_last_init = (a_init === 4) ? N_DBPS : a_init * N_DBPS_short_local;
      const N_CBPS_last_init = (a_init === 4) ? N_CBPS : a_init * N_CBPS_short;
      N_pld    = (N_SYM - m_STBC) * N_DBPS + m_STBC * N_DBPS_last_init;       // Eq. 36-54
      N_avbits = (N_SYM - m_STBC) * N_CBPS + m_STBC * N_CBPS_last_init;       // Eq. 36-55
    } else {
      N_avbits = N_CBPS * N_SYM;
    }

    // Step b) Select N_CW and L_LDPC per Table 19-16 (5-way cascade)
    let N_CW, L_LDPC;
    if (N_avbits <= 648) {
      N_CW = 1;
      L_LDPC = (N_avbits >= N_pld + 912 * (1 - R)) ? 1296 : 648;
    } else if (N_avbits <= 1296) {
      N_CW = 1;
      L_LDPC = (N_avbits >= N_pld + 1464 * (1 - R)) ? 1944 : 1296;
    } else if (N_avbits <= 1944) {
      N_CW = 1;
      L_LDPC = 1944;
    } else if (N_avbits <= 2592) {
      N_CW = 2;
      L_LDPC = (N_avbits >= N_pld + 2916 * (1 - R)) ? 1944 : 1296;
    } else {
      N_CW   = Math.ceil(N_pld / (1944 * R));
      L_LDPC = 1944;
    }

    // Step c) Shortening bits (Eq. 19-37)
    let N_shrt = Math.max(0, Math.round(N_CW * L_LDPC * R) - N_pld);

    // Step d) Puncturing bits (Eq. 19-38)
    let N_punc = Math.max(0, Math.round(N_CW * L_LDPC) - N_avbits - N_shrt);

    // Step d) excessive-puncturing condition
    const parity_total = N_CW * L_LDPC * (1 - R);
    const cond1 = (N_punc > 0.1 * parity_total) &&
                  (N_shrt < 1.2 * N_punc * R / (1 - R));
    const cond2 = (N_punc > 0.3 * parity_total);
    const has_extra = cond1 || cond2;

    if (has_extra) {
      if (N_CBPS_short == null || a_init == null) {
        // Fallback HT-style update (Eq. 19-39 / 19-40)
        N_avbits = N_avbits + N_CBPS * m_STBC;
        N_SYM    = N_SYM + m_STBC;
      } else {
        // EHT-spec branched update (Eq. 36-56 + 36-58)
        if (a_init === 3) {
          N_avbits = N_avbits + N_CBPS - 3 * N_CBPS_short;
        } else {
          N_avbits = N_avbits + N_CBPS_short;
        }
        N_SYM = (a_init === 4) ? (N_SYM_init + 1) : N_SYM_init;
      }
      // Eq. 36-57 / 19-40: recompute N_punc with updated N_avbits
      N_punc = Math.max(0, Math.round(N_CW * L_LDPC) - N_avbits - N_shrt);
    }

    // Step e) Repeated coded bits (Eq. 19-42)
    const N_rep = Math.max(0, N_avbits - Math.round(N_CW * L_LDPC * (1 - R)) - N_pld);

    return {
      L_LDPC, N_CW, N_shrt, N_punc, N_rep,
      N_SYM, N_avbits, N_pld, N_pld_raw,
      has_extra_symbol: has_extra,
      a_init_used: a_init
    };
  }

  // Compute pipeline numbers for given parameters.
  // Backward-compatible signature: p = {BW, MCS, APEP, GI, LTFType, NumMPDUs, ScramblerInit?, Coding?}.
  function compute(p) {
    const cfg = BW_CFG[p.BW];
    const m = MCS[p.MCS];
    const N_SD = cfg.N_SD;
    const N_SP = cfg.N_SP;
    const N_ST = cfg.N_ST;
    const N_BPSCS = m.bpscs;
    const N_CBPS = N_SD * 1 * N_BPSCS;
    const N_DBPS = Math.floor(N_CBPS * m.Rn / m.Rd);
    const N_service = 16;
    const Coding = resolveCoding(p.BW, p.MCS, p.Coding);
    const N_tail  = (Coding === 'BCC') ? 6 : 0;
    const APEP = p.APEP;
    const N_SDshort = cfg.N_SDshort;
    const N_CBPSshort = N_SDshort * N_BPSCS;
    const N_DBPSshort = Math.floor(N_CBPSshort * m.Rn / m.Rd);

    // NumMPDUs auto-bump: matches Python ref/wifi7-python/eht_waveform_gen.py:
    //   denom = max_chunk_per_mpdu(4065) + per_mpdu_overhead(34) - 4 + max_align_pad(3) = 4098
    //   N_min = ceil((APEP - 4) / 4098)
    // (an earlier comment said "4095+7=4102" but the spec value is 4098).
    const N_min = Math.max(1, Math.ceil((APEP - 4) / 4098));
    const NumMPDUs = Math.max(p.NumMPDUs || 1, N_min);

    // ----------------------------------------------------------------
    // Length pipeline — branches by Coding
    // ----------------------------------------------------------------
    const N_pld_raw = 8 * APEP + N_service + N_tail;
    const N_Excess  = N_pld_raw % N_DBPS;
    const a_init    = (N_Excess === 0)
                      ? 4
                      : Math.min(Math.ceil(N_Excess / N_DBPSshort), 4);
    const N_SYM_init = Math.ceil(N_pld_raw / N_DBPS);
    const N_DBPS_last = (a_init === 4) ? N_DBPS : a_init * N_DBPSshort;
    const N_CBPS_last = (a_init === 4) ? N_CBPS : a_init * N_CBPSshort;

    let L_LDPC = 0, N_CW = 0, N_shrt = 0, N_punc = 0, N_rep = 0;
    let has_extra = false;
    let N_SYM, N_pld, N_avbits;

    if (Coding === 'LDPC') {
      const lp = _ldpcParams(N_CBPS, N_CBPSshort, m.Rn, m.Rd, APEP, N_service, a_init);
      L_LDPC    = lp.L_LDPC;
      N_CW      = lp.N_CW;
      N_shrt    = lp.N_shrt;
      N_punc    = lp.N_punc;
      N_rep     = lp.N_rep;
      N_SYM     = lp.N_SYM;
      N_avbits  = lp.N_avbits;
      N_pld     = lp.N_pld;
      has_extra = lp.has_extra_symbol;
    } else {
      // BCC: Eq. 36-49 simplified for SU 1SS
      const total_bits = 8 * APEP + N_service + N_tail;
      N_SYM    = Math.ceil(total_bits / N_DBPS);
      N_pld    = N_SYM * N_DBPS;
      N_avbits = N_SYM * N_CBPS;
    }

    // Pre-FEC padding split (MAC EOF delimiters vs PHY sub-byte remainder)
    const N_PAD           = N_pld - N_pld_raw;
    const N_PAD_MAC_bytes = (Coding === 'LDPC') ? Math.floor(N_PAD / 8) : 0;
    const N_PAD_PHY_bits  = (Coding === 'LDPC') ? (N_PAD % 8)            : N_PAD;
    const PSDU_bytes      = APEP + N_PAD_MAC_bytes;

    // ----------------------------------------------------------------
    // Time domain — Python uses NFFT=6144 zero-padded IFFT for ALL BWs at
    // fs=480 MHz (eht_config.py:329). CP samples = round(GI · Fs).
    // ----------------------------------------------------------------
    const TSYM_us  = p.GI === 3.2 ? 16.0 : (p.GI === 1.6 ? 14.4 : 13.6);
    const T_DATA_us = N_SYM * TSYM_us;
    const NFFT      = NFFT_OS;                // 6144 always
    const CP_data   = Math.round(p.GI * FS_OS_MHZ);   // 384 / 768 / 1536
    const data_samps = N_SYM * (NFFT + CP_data);

    // ----------------------------------------------------------------
    // Field samples + TXTIME — port of ref/wifi7-python/eht_config.py:498-555
    // ----------------------------------------------------------------
    // N_EHT_SIG from EHT_SIG_MCS via eht_sig_mcs_table (eht_constants.py:241-244):
    //   MCS 0 → 2 syms · 4 µs = 8 µs (canonical default)
    //   MCS 1 → 1 sym  · 4 µs = 4 µs
    //   MCS 2 → 1 sym  · 4 µs = 4 µs
    //   MCS 3 → 4 syms · 4 µs = 16 µs
    const EHT_SIG_MCS = p.EHT_SIG_MCS != null ? p.EHT_SIG_MCS : 0;
    const N_EHT_SIG_TABLE = {0:2, 1:1, 2:1, 3:4};
    const N_EHT_SIG = N_EHT_SIG_TABLE[EHT_SIG_MCS] != null ? N_EHT_SIG_TABLE[EHT_SIG_MCS] : 2;
    // 1-SS SU minimum; multi-SS not modeled here (eht_config.py:455).
    const N_EHT_LTF = 1;

    // T_PE per Table 36-61: rows = a (1..4), cols = NominalPacketPadding (0/8/16/20).
    // a per Eq. (36-58)/(36-59):
    //   if has_extra and a_init==4 → a = 1
    //   else if has_extra          → a = a_init + 1
    //   else                       → a = a_init
    const a_pad = has_extra ? (a_init === 4 ? 1 : a_init + 1) : a_init;
    const PE_TABLE = {
      1: { 0:0, 8:0,  16:4,  20:8  },
      2: { 0:0, 8:0,  16:8,  20:12 },
      3: { 0:0, 8:4,  16:12, 20:16 },
      4: { 0:0, 8:8,  16:16, 20:20 }
    };
    const NominalPacketPadding = p.NominalPacketPadding != null ? p.NominalPacketPadding : 16;
    const PE_us = (PE_TABLE[a_pad] && PE_TABLE[a_pad][NominalPacketPadding] != null)
                  ? PE_TABLE[a_pad][NominalPacketPadding] : 4;

    // T_EHT_LTF_SYM = T_DFT + T_GI per Table 36-36; T_DFT = 12.8 (4x) or 6.4 (2x).
    const NEHT_LTF_us = (p.LTFType === 4 ? 12.8 : 6.4) + p.GI;
    const fieldUs = {
      'L-STF':   8,
      'L-LTF':   8,
      'L-SIG':   4,
      'RL-SIG':  4,
      'U-SIG':   8,
      'EHT-SIG': N_EHT_SIG * 4,
      'EHT-STF': 4,
      'EHT-LTF': N_EHT_LTF * NEHT_LTF_us,
      'Data':    T_DATA_us,
      'PE':      PE_us
    };
    const TXTIME       = Object.values(fieldUs).reduce((a,b)=>a+b, 0);
    const total_samps  = Math.round(TXTIME * FS_OS_MHZ);
    const LSIG_LEN     = lsigLength(TXTIME);

    // Throughput
    const phy_rate_Mbps      = N_DBPS / TSYM_us;
    const mac_throughput_Mbps = (8 * APEP) / TXTIME;

    return {
      cfg, mcs:m,
      // Subcarriers
      N_SD, N_SP, N_ST, N_sb: cfg.N_sb, N_20MHz: cfg.N_20MHz,
      // Per-symbol bit counts
      N_BPSCS, N_CBPS, N_DBPS,
      N_SDshort, N_CBPSshort, N_DBPSshort,
      // Coding selection
      Coding, N_service, N_tail,
      // Length pipeline (canonical)
      APEP, NumMPDUs, N_min,
      N_pld_raw, N_Excess, a_init, N_SYM_init,
      N_DBPS_last, N_CBPS_last,
      N_pld, N_avbits,
      L_LDPC, N_CW, N_shrt, N_punc, N_rep, has_extra, N_SYM,
      // Pad split
      N_PAD, N_PAD_MAC_bytes, N_PAD_PHY_bits, PSDU_bytes,
      // Time domain (oversampled to fs=480 MHz, NFFT=6144)
      TSYM_us, T_DATA_us, NFFT, CP_data, data_samps,
      // Pre-EHT preamble symbol counts
      EHT_SIG_MCS, N_EHT_SIG, N_EHT_LTF, NominalPacketPadding, a_pad, PE_us,
      fieldUs, TXTIME, total_samps, LSIG_LEN,
      phy_rate_Mbps, mac_throughput_Mbps,
      // A-MPDU summary + EXACT byte map (faithful port of
      // ref/wifi7-python/eht_waveform_gen.py:_size_user_data + utils/ampdu.py).
      // Each real subframe = delim(4) + MAC_hdr(26) + chunk_i + FCS(4)
      // + align_pad_i (0..3, picked so the subframe ends on a 4-byte boundary).
      // user_data is sized as the LARGEST value such that:
      //   (a) chunks fit equally across NumMPDUs subframes (first remainder
      //       chunks get +1),
      //   (b) total_subframes ≤ APEP − 4 (leave at least one EOF delim worth),
      //   (c) (APEP − total_subframes) is a multiple of 4.
      // Result: real_subframes_total may be 0..(34·N + 3·N + 4) bytes less
      // than APEP_LENGTH; that slack is absorbed at the start of the EOF
      // padding region. EOF region = PSDU_bytes − real_subframes_total
      // (which differs by 0..N+1 bytes from the formula-derived
      // N_PAD_MAC_bytes; both are valid, see PIPELINE_OVERVIEW.md §3.3.4).
      ampdu_layout: ((APEP_in, N_in, PSDU_in) => {
        const overhead = 34;          // delim 4 + MAC 26 + FCS 4
        const max_align = 3;
        const min_tail  = 4;
        const max_user  = APEP_in - N_in * overhead - N_in * max_align - min_tail;
        let user_data_len = 0;
        let subframes = [];
        let total_real = 0;
        for (let user_try = max_user; user_try >= 0; user_try--) {
          const chunk_base = Math.floor(user_try / N_in);
          const chunk_rem  = user_try % N_in;
          let total = 0;
          const sf = [];
          for (let i = 0; i < N_in; i++) {
            const cs        = chunk_base + (i < chunk_rem ? 1 : 0);
            const sf_unpad  = overhead + cs;
            const align     = (4 - (sf_unpad % 4)) % 4;
            const sf_total  = sf_unpad + align;
            sf.push({ chunk: cs, align, total: sf_total });
            total += sf_total;
          }
          const remaining = APEP_in - total;
          if (remaining >= min_tail && remaining % 4 === 0) {
            user_data_len = user_try;
            subframes = sf;
            total_real = total;
            break;
          }
        }
        const eof_bytes  = PSDU_in - total_real;
        const eof_count  = Math.floor(eof_bytes / 4);
        const eof_tail   = eof_bytes - eof_count * 4;     // 0..3 bytes of 0xFF tail
        return { user_data_len, subframes, total_real, eof_bytes, eof_count, eof_tail, overhead };
      })(APEP, NumMPDUs, APEP + N_PAD_MAC_bytes),
      perMPDU_overhead: 34,
      max_chunk: 4065
    };
  }

  // Build MAC header byte structure (26 bytes, QoS Data, ToDS=1)
  const MAC_HEADER = [
    { off:0,  size:2, name:'Frame Control', val:'88 01', desc:'Type=Data(10), Subtype=QoS Data(1000), ToDS=1' },
    { off:2,  size:2, name:'Duration / ID', val:'2C 00', desc:'NAV duration in µs (LE)' },
    { off:4,  size:6, name:'Address 1 (RA/BSSID)', val:'02 00 00 00 00 01', desc:'Receiver address; locally-administered MAC' },
    { off:10, size:6, name:'Address 2 (TA/SA)',    val:'02 00 00 00 00 02', desc:'Transmitter / source address' },
    { off:16, size:6, name:'Address 3 (DA)',       val:'02 00 00 00 00 03', desc:'Destination address' },
    { off:22, size:2, name:'Sequence Control',     val:'00 00', desc:'SeqNum=0 + FragNum=0' },
    { off:24, size:2, name:'QoS Control',          val:'00 00', desc:'TID=0, AckPolicy=Normal, A-MSDU=0' }
  ];

  const FC_BITS = [
    { b:'B0–B1', name:'Proto Ver',  val:'00', dec:'0' },
    { b:'B2–B3', name:'Type',       val:'10', dec:'Data' },
    { b:'B4–B7', name:'Subtype',    val:'1000',dec:'QoS Data' },
    { b:'B8',    name:'ToDS',       val:'1',   dec:'1' },
    { b:'B9',    name:'FromDS',     val:'0',   dec:'0' },
    { b:'B10',   name:'MoreFrag',   val:'0',   dec:'0' },
    { b:'B11',   name:'Retry',      val:'0',   dec:'0' },
    { b:'B12',   name:'PwrMgmt',    val:'0',   dec:'0' },
    { b:'B13',   name:'MoreData',   val:'0',   dec:'0' },
    { b:'B14',   name:'Protected',  val:'0',   dec:'0' },
    { b:'B15',   name:'+HTC/Order', val:'0',   dec:'0' }
  ];

  const DELIM_BITS = [
    { b:'B0',    name:'EOF',          val:'1',     desc:'End-of-frame tag (real MPDU last; padding)' },
    { b:'B1',    name:'Reserved',     val:'0',     desc:'= 0' },
    { b:'B2–B15',name:'MPDU Length',  val:'14-bit',desc:'12-bit Low + 2-bit High (HE/EHT)' },
    { b:'B16–B23',name:'CRC-8',       val:'8-bit', desc:'Poly 0x07, init 0xFF, final XOR 0xFF, scope B0–B15' },
    { b:'B24–B31',name:'Signature',   val:'0x4E',  desc:'Magic number, fixed' }
  ];

  const CRC_LIST = [
    { name:'L-SIG Parity',    width:'1 bit',   algo:'XOR even-parity',                scope:'L-SIG B0–B16 (17 bits)' },
    { name:'U-SIG CRC-4',     width:'4 bits',  algo:'x⁸+x²+x+1, init=1s, top-4 inv',   scope:'U-SIG-1 + U-SIG-2[0..15] (42b)' },
    { name:'EHT-SIG CRC-4',   width:'4 bits',  algo:'x⁸+x²+x+1, init=1s, top-4 inv',   scope:'Common(20b)+User(22b)=42b' },
    { name:'A-MPDU Delim CRC-8', width:'8 bits',  algo:'x⁸+x²+x+1 (0x07), bit-rev out', scope:'Delim B0–B15 (16 bits)' },
    { name:'MPDU FCS (CRC-32)',  width:'32 bits', algo:'CRC-32/ISO-HDLC',                scope:'MAC header + Frame Body' }
  ];

  // L-SIG bit layout (24 bits, LSB first per spec §17.3.4)
  const LSIG_BITS = [
    { range:'B0–B3',   name:'RATE',    width:4,  desc:'Always 0xD = 1101 (LSB first) → 6 Mb/s BPSK R=1/2' },
    { range:'B4',      name:'Reserved',width:1,  desc:'= 0' },
    { range:'B5–B16',  name:'LENGTH',  width:12, desc:'TXTIME-derived value; for EHT, LENGTH mod 3 == 0' },
    { range:'B17',     name:'Parity',  width:1,  desc:'Even parity over B0–B16' },
    { range:'B18–B23', name:'Tail',    width:6,  desc:'Six 0 bits for BCC trellis termination' }
  ];

  // U-SIG-1 (26 bits)
  const USIG1_BITS = [
    { range:'B0–B2',   name:'PHY Version',     width:3, desc:'EHT = 0; reserved for future' },
    { range:'B3–B5',   name:'BW',              width:3, desc:'0=20, 1=40, 2=80, 3=160, 4=320-1, 5=320-2' },
    { range:'B6',      name:'UL/DL',           width:1, desc:'0=DL, 1=UL' },
    { range:'B7–B12',  name:'BSS Color',       width:6, desc:'Spatial-reuse identifier per BSS' },
    { range:'B13–B19', name:'TXOP',            width:7, desc:'TXOP duration in units defined by §10' },
    { range:'B20',     name:'Disregard',       width:1, desc:'= 1 (reserved)' },
    { range:'B21–B24', name:'Validate',        width:4, desc:'Bit-pattern test per Table 36-28' },
    { range:'B25',     name:'Validate',        width:1, desc:'per Table 36-28' }
  ];

  // U-SIG-2 (26 bits = 16 data + 4 CRC + 6 tail)
  const USIG2_BITS = [
    { range:'B0–B1',   name:'PPDU Type',         width:2, desc:'0=EHT MU, 1=EHT TB, 2=EHT NDP, 3=EHT MU short' },
    { range:'B2',      name:'Validate',          width:1, desc:'= 1' },
    { range:'B3–B7',   name:'Punct Channel Info',width:5, desc:'Bitmap of punctured 20MHz subchannels' },
    { range:'B8',      name:'Validate',          width:1, desc:'= 1' },
    { range:'B9–B10',  name:'EHT-SIG MCS',       width:2, desc:'0=BPSK 1/2 (2 syms), 1=QPSK 1/2 (1 sym)' },
    { range:'B11–B15', name:'N_EHT-SIG',         width:5, desc:'Number of EHT-SIG OFDM symbols' },
    { range:'B16–B19', name:'CRC-4',             width:4, desc:'covers U-SIG-1 + U-SIG-2[0..15]' },
    { range:'B20–B25', name:'Tail',              width:6, desc:'Six 0 bits for BCC' }
  ];

  // EHT-SIG common (20 bits)
  const EHTSIG_COMMON = [
    { range:'B0',      name:'Spatial Reuse 1',  width:1 },
    { range:'B1',      name:'Spatial Reuse 2',  width:1 },
    { range:'B2',      name:'Reserved',         width:1 },
    { range:'B3–B4',   name:'GI+LTF Size',      width:2, desc:'0=2x+0.8, 1=2x+1.6, 2=4x+0.8, 3=4x+3.2' },
    { range:'B5–B7',   name:'EHT-LTF Symbols',  width:3, desc:'Number of EHT-LTF symbols (1..8)' },
    { range:'B8',      name:'LDPC Extra Sym',   width:1, desc:'1 if N_SYM = N_SYM_init+1 (Eq.36-50/51 trigger)' },
    { range:'B9–B10',  name:'Pre-FEC Pad Factor a', width:2, desc:'a = 1..4 (a=4 encoded as 0)' },
    { range:'B11',     name:'PE Disambiguity',  width:1 },
    { range:'B12–B19', name:'Reserved',         width:8 }
  ];

  // EHT-SIG user (22 bits)
  const EHTSIG_USER = [
    { range:'B0–B10',  name:'STA-ID',           width:11, desc:'Station identifier (0=broadcast)' },
    { range:'B11–B14', name:'EHT-MCS',          width:4,  desc:'0..13' },
    { range:'B15',     name:'Reserved',         width:1 },
    { range:'B16–B18', name:'NSS',              width:3,  desc:'Number of spatial streams (0=1, …, 7=8)' },
    { range:'B19',     name:'Beamforming',      width:1 },
    { range:'B20',     name:'Coding',           width:1,  desc:'0=BCC, 1=LDPC' },
    { range:'B21',     name:'Reserved',         width:1 }
  ];

  // 127-element pilot polarity sequence p_n (Annex L; spec §17.3.5.10)
  // First 64 elements; full sequence 127 long.
  const PILOT_POL_127 = [
    1,1,1,1,-1,-1,-1,1,-1,-1,-1,-1,1,1,-1,1,-1,-1,1,1,-1,1,1,-1,1,1,1,1,1,1,-1,1,
    1,1,-1,1,1,-1,-1,1,1,1,-1,1,-1,-1,-1,1,-1,1,-1,-1,1,-1,-1,1,1,1,1,1,-1,-1,1,1,
    -1,-1,1,-1,1,-1,1,1,-1,-1,-1,1,1,-1,-1,-1,-1,1,-1,-1,1,-1,1,1,1,1,-1,1,-1,1,-1,1,
    -1,-1,-1,-1,-1,1,-1,1,1,-1,1,-1,1,1,1,-1,-1,1,-1,-1,-1,1,1,1,-1,-1,-1,-1,-1,-1,-1
  ];
  // Per-SC base pilot (Ψ, Eq. 27-104)
  const PSI_8 = [1,1,1,-1,-1,1,1,1];

  // Pilot polarity offset map: which PPDU field uses which polarity index.
  // Per IEEE 802.11be-2024 Eq. 36-87 + §17.3.5.10:
  //   L-SIG=0, RL-SIG=1, U-SIG-1=2, U-SIG-2=3, EHT-SIG-{1..N}=4..3+N, then Data starts.
  function pilotOffsetForData(N_EHT_SIG){ return 4 + N_EHT_SIG; }

  // CRC-8 used by A-MPDU delimiter (poly 0x07, init 0xFF, final XOR 0xFF, scope = first 16 bits).
  // Per IEEE 802.11-2024 Section 10.12.7 + ref/wifi7-python/utils/ampdu.py:113-116, the CRC byte
  // is BIT-REVERSED before being placed in the delimiter — bit 7 (MSB) of the register is sent
  // first and lands at bit 0 of the stored byte. Without the reversal, frames look corrupt to a
  // spec-compliant receiver.
  function crc8_amDelim(bits16){
    let reg = 0xFF;
    for (let i = 0; i < 16; i++){
      const b   = bits16[i] & 1;
      const top = (reg >> 7) & 1;
      const fb  = top ^ b;
      reg = (reg << 1) & 0xFF;
      if (fb) reg ^= 0x07;
    }
    const crcReg = (reg ^ 0xFF) & 0xFF;
    // Bit-reverse for transmission order (verified against ampdu.py spec port).
    let crc = 0;
    for (let b = 0; b < 8; b++) if ((crcReg >> b) & 1) crc |= 1 << (7 - b);
    return crc;
  }

  // CRC-32/IEEE used as MPDU FCS
  // Reflected algorithm (poly 0xEDB88320), init 0xFFFFFFFF, final XOR 0xFFFFFFFF
  let _crc32_table = null;
  function crc32_table(){
    if (_crc32_table) return _crc32_table;
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++){
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    _crc32_table = t;
    return t;
  }
  function crc32(bytes){
    const T = crc32_table();
    let c = 0xFFFFFFFF >>> 0;
    for (let i = 0; i < bytes.length; i++) c = (T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
    return ((c ^ 0xFFFFFFFF) >>> 0);
  }

  // CRC-4 for U-SIG / EHT-SIG fields per IEEE 802.11-2024 Section 27.3.11.7.3
  // (Figure 27-24, p.4227). 8-bit LFSR with G(x) = x^8 + x^2 + x + 1, init all-ones,
  // feedback from c7 (MSB), left-shift, output = top 4 bits {c7,c6,c5,c4} inverted.
  // Faithful port of ref/wifi7-python/utils/crc4.py.
  //
  // Returns a 4-bit integer where bit 3 = B7 (MSB), bit 0 = B4 (LSB).
  // Spec test vector: 42-bit input pattern in crc4.py docstring → output 0b0111 = 7.
  function crc4_usig(bits){
    let reg = 0xFF;                           // [c7,c6,c5,c4,c3,c2,c1,c0]
    for (let i = 0; i < bits.length; i++) {
      const b  = bits[i] & 1;
      const c7 = (reg >> 7) & 1;
      const fb = b ^ c7;
      reg = (reg << 1) & 0xFF;                // left-shift, c0 := 0
      if (fb) reg ^= 0b00000111;               // XOR taps at c2, c1, c0 (G(x) low terms)
    }
    return (~(reg >> 4)) & 0xF;               // top 4 bits inverted → {B7,B6,B5,B4}
  }

  // 4-element array form (matches Python signature for tooling that wants per-bit CRC).
  function crc4_usigArray(bits){
    const v = crc4_usig(bits);
    return [(v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1];
  }

  // LDPC tone mapping permutation (Eq. 36-72) — used for visualization
  function ldpcToneMap(N_SD_l, BW){
    const D_TM = (BW === 20) ? 9 : (BW === 40 ? 12 : 20);
    const ratio = N_SD_l / D_TM;
    const out = new Int32Array(N_SD_l);
    for (let k = 0; k < N_SD_l; k++){
      const t_k = D_TM * (k % ratio) + Math.floor(k * D_TM / N_SD_l);
      out[k] = t_k;
    }
    return { D_TM, ratio, perm: out };
  }

  // ----- Self-tests (run once on load) ------------------------------------
  // Verify CRC-4 against the spec test vector embedded in IEEE 802.11-2024
  // Section 27.3.11.7.3, p.4227. Failure indicates a port bug.
  (function _selfTest(){
    const tv = [
      1,1,0,1, 1,1,0,0, 0,0,0,0, 0,0,1,0,
      0,0,0,0, 0,1,1,0, 0,0,0,0, 0,0,0,0,
      0,0,1,0, 0,1,1,0, 1,0
    ];
    const expect = 0b0111;
    const got = crc4_usig(tv);
    if (got !== expect) {
      console.error('[eht_compute] crc4_usig self-test FAILED:',
        'expected 0b' + expect.toString(2).padStart(4,'0'),
        'got 0b' + got.toString(2).padStart(4,'0'));
    }
  })();

  // Verify canonical reference case length pipeline against Python eht_config
  // (run directly: python -c "from eht_config import _ldpc_params; print(_ldpc_params(47040,5,6,5000,16,11808))").
  // NOTE: PIPELINE_OVERVIEW.md §9 lines 843-848 show N_avbits=94080, N_punc=0,
  // N_rep=34996 — those are pre-EHT (HT-style) Eq. 19-37/-38 values. Python's
  // _ldpc_params and the JS port both apply the EHT Eq. 36-55 override which
  // gives N_avbits=58848, N_punc=236, N_rep=0. The doc is wrong here; the JS
  // and Python algorithms agree.
  (function _refSelfTest(){
    const c = compute({ BW:320, MCS:13, APEP:5000, GI:3.2, LTFType:4, NumMPDUs:1, Coding:'LDPC' });
    const expect = {
      N_CBPS:47040, N_DBPS:39200, N_DBPSshort:9840,
      N_pld_raw:40016, N_Excess:816, a_init:1, N_SYM_init:2,
      N_pld:49040, L_LDPC:1944, N_CW:31, N_shrt:1180, N_punc:236, N_rep:0,
      N_SYM:2, N_avbits:58848, N_PAD:9024, N_PAD_MAC_bytes:1128, N_PAD_PHY_bits:0,
      PSDU_bytes:6128, NFFT:6144, CP_data:1536, TSYM_us:16.0, T_DATA_us:32.0,
      data_samps:15360, TXTIME:96.0, total_samps:46080, LSIG_LEN:54, phy_rate_Mbps:2450
    };
    const fail = [];
    for (const k in expect) {
      if (Math.abs(c[k] - expect[k]) > 1e-9) {
        fail.push(`${k}: expected ${expect[k]}, got ${c[k]}`);
      }
    }
    // Only log on failure to keep the production console clean; success is silent.
    if (fail.length) {
      console.error('[eht_compute] reference-case self-test FAILED:', fail);
    }
  })();

  window.EHT = {
    // Constants
    BW_CFG, MCS, NFFT_OS, FS_OS_MHZ,
    // Helpers
    ppduFields, compute, lsigLength, resolveCoding, _ldpcParams,
    // Spec data tables
    MAC_HEADER, FC_BITS, DELIM_BITS, CRC_LIST,
    LSIG_BITS, USIG1_BITS, USIG2_BITS, EHTSIG_COMMON, EHTSIG_USER,
    PILOT_POL_127, PSI_8, pilotOffsetForData,
    // CRC + permutation primitives
    crc8_amDelim, crc32, crc4_usig, crc4_usigArray, ldpcToneMap
  };
})();
