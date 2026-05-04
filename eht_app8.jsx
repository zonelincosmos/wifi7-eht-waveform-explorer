// SPDX-License-Identifier: MIT
// Copyright (c) 2026 zonelincosmos
//
// eht_app8.jsx — Heavy Section VI / VIII components that depend on the numeric
// pipeline (eht_pipeline.jsx): ReferenceValidation, TimeDomainPlot, PSDPlot,
// BitTraceTool, VSA89600MockPanel, VSAErrorSummaryViz.
//
// Loaded AFTER eht_app1..7 + eht_scrambler so it can reuse their helpers, and
// BEFORE eht_app.jsx (the orchestrator) so the components are available when
// the section layout is rendered.

const { useState: useState8, useEffect: useEffect8, useMemo: useMemo8, useRef: useRef8 } = React;

// =====================================================================
// ReferenceValidation — 31-row Expected vs Computed checklist for the
// canonical reference case (BW=320, MCS=13, APEP=5000, GI=3.2, LTFType=4).
// All values verified against PIPELINE_OVERVIEW.md §5/§9.
// =====================================================================

const REF_PARAMS = {
  BW: 320, MCS: 13, APEP: 5000, GI: 3.2, LTFType: 4,
  NumMPDUs: 1, ScramblerInit: 1, Coding: 'LDPC'
};

// PIPELINE_OVERVIEW.md §5/§9 expected values. Note: §5 row 6 shows N_CW=49
// which is a typo; §9 trace at line 844 derives ceil(49040/1620) = 31 (the
// correct value, used by the Python reference and our compute).
const REF_EXPECTED = [
  { group: 'Subcarriers',  key: 'N_SD',            label: 'N_SD (data SC)',         value: 3920 },
  { group: 'Subcarriers',  key: 'N_SP',            label: 'N_SP (pilots)',          value: 64 },
  { group: 'Subcarriers',  key: 'N_ST',            label: 'N_ST = N_SD + N_SP',     value: 3984 },
  { group: 'Subcarriers',  key: 'N_sb',            label: 'N_sb (segment parser)',  value: 4 },
  { group: 'Per-symbol',   key: 'N_BPSCS',         label: 'N_BPSCS (4096-QAM)',     value: 12 },
  { group: 'Per-symbol',   key: 'N_CBPS',          label: 'N_CBPS = N_SD·N_BPSCS',  value: 47040 },
  { group: 'Per-symbol',   key: 'N_DBPS',          label: 'N_DBPS = floor(N_CBPS·R)', value: 39200 },
  { group: 'Per-symbol',   key: 'N_DBPSshort',     label: 'N_DBPS_short',           value: 9840 },
  { group: 'Length pipe',  key: 'N_pld_raw',       label: 'N_pld_raw = 8·APEP+16',  value: 40016 },
  { group: 'Length pipe',  key: 'N_Excess',        label: 'N_Excess = mod(N_pld_raw, N_DBPS)', value: 816 },
  { group: 'Length pipe',  key: 'a_init',          label: 'a_init',                 value: 1 },
  { group: 'Length pipe',  key: 'N_SYM_init',      label: 'N_SYM_init',             value: 2 },
  { group: 'Length pipe',  key: 'N_pld',           label: 'N_pld (Eq. 36-54)',      value: 49040 },
  { group: 'LDPC',         key: 'L_LDPC',          label: 'L_LDPC',                 value: 1944 },
  { group: 'LDPC',         key: 'N_CW',            label: 'N_CW = ceil(N_pld/(L·R))', value: 31 },
  { group: 'LDPC',         key: 'N_shrt',          label: 'N_shrt',                 value: 1180 },
  { group: 'LDPC',         key: 'N_punc',          label: 'N_punc',                 value: 0 },
  { group: 'LDPC',         key: 'N_rep',           label: 'N_rep',                  value: 34996 },
  { group: 'LDPC',         key: 'has_extra',       label: 'has_extra_symbol',       value: false },
  { group: 'LDPC',         key: 'N_SYM',           label: 'N_SYM',                  value: 2 },
  { group: 'LDPC',         key: 'N_avbits',        label: 'N_avbits = N_SYM·N_CBPS', value: 94080 },
  { group: 'PSDU pad',     key: 'N_PAD',           label: 'N_PAD = N_pld − N_pld_raw', value: 9024 },
  { group: 'PSDU pad',     key: 'N_PAD_MAC_bytes', label: 'MAC EOF delim bytes',    value: 1128 },
  { group: 'PSDU pad',     key: 'N_PAD_PHY_bits',  label: 'PHY pad bits',           value: 0 },
  { group: 'PSDU pad',     key: 'PSDU_bytes',      label: 'PSDU bytes = APEP + N_PAD_MAC', value: 6128 },
  { group: 'Time domain',  key: 'NFFT',            label: 'NFFT (zero-padded @ 480 MHz)', value: 6144 },
  { group: 'Time domain',  key: 'CP_data',         label: 'CP_data samples',        value: 1536 },
  { group: 'Time domain',  key: 'TSYM_us',         label: 'T_SYM (µs)',             value: 16.0 },
  { group: 'Time domain',  key: 'T_DATA_us',       label: 'T_Data (µs)',            value: 32.0 },
  { group: 'Time domain',  key: 'data_samps',      label: 'Data field samples',     value: 15360 },
  { group: 'Time domain',  key: 'TXTIME',          label: 'TXTIME (µs)',            value: 96.0 },
  { group: 'Time domain',  key: 'total_samps',     label: 'Total samples @ 480 MHz', value: 46080 },
  { group: 'Time domain',  key: 'LSIG_LEN',        label: 'L-SIG LENGTH',           value: 54 },
  { group: 'Time domain',  key: 'phy_rate_Mbps',   label: 'PHY raw rate (Mbps)',    value: 2450 }
];

function fmtVal(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number')  return Number.isInteger(v) ? v.toString() : v.toFixed(3);
  return String(v);
}

function eq(a, b) {
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
  if (typeof a === 'number' && typeof b === 'number')   return Math.abs(a - b) < 1e-6;
  return a === b;
}

function ReferenceValidation({ p, set }) {
  const isRef = (
    p.BW === REF_PARAMS.BW && p.MCS === REF_PARAMS.MCS && p.APEP === REF_PARAMS.APEP &&
    p.GI === REF_PARAMS.GI && p.LTFType === REF_PARAMS.LTFType
  );
  const c = window.EHT.compute({ ...REF_PARAMS });
  const live = window.EHT.compute(p);

  const [genState, setGenState] = useState8({ status: 'idle', result: null, error: null });
  const [hashHex, setHashHex] = useState8(null);

  const onLoadRef = () => set({ ...REF_PARAMS });
  const onGenerate = () => {
    if (!window.EHT.pipeline) {
      setGenState({ status: 'error', result: null, error: 'eht_pipeline.jsx not loaded' });
      return;
    }
    setGenState({ status: 'running', result: null, error: null });
    // Run async to allow paint
    setTimeout(() => {
      try {
        const r = window.EHT.pipeline.generate({ ...REF_PARAMS });
        setGenState({ status: 'done', result: r, error: null });
        // SHA-256 in background
        if (window.EHT.pipeline.sha256IQ) {
          window.EHT.pipeline.sha256IQ(r.iqRe, r.iqIm).then(h => setHashHex(h));
        }
      } catch (e) {
        setGenState({ status: 'error', result: null, error: e.message });
      }
    }, 50);
  };

  // Group rows by group
  const groups = {};
  for (const row of REF_EXPECTED) {
    if (!groups[row.group]) groups[row.group] = [];
    groups[row.group].push(row);
  }

  // Pass count
  let nPass = 0, nFail = 0;
  for (const row of REF_EXPECTED) {
    if (eq(c[row.key], row.value)) nPass++; else nFail++;
  }

  return (
    <div className="panel">
      <h2><span className="num">★</span> Reference Case Validation
        <span className="desc">PIPELINE_OVERVIEW.md §5/§9 — BW=320, MCS=13, APEP=5000, GI=3.2 µs, LTFType=4 → 96 µs / 46,080 samples</span>
      </h2>
      <div style={{display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
        <button
          onClick={onLoadRef}
          disabled={isRef}
          style={{
            padding:'8px 16px', borderRadius:6, border:'1px solid var(--accent)',
            background: isRef ? 'var(--bg2)' : 'var(--accent)',
            color: isRef ? 'var(--ink-muted)' : '#fff',
            fontSize:13, fontWeight:600, cursor: isRef ? 'default' : 'pointer'
          }}>
          {isRef ? '✓ Reference loaded' : 'Load Reference Case'}
        </button>
        <button
          onClick={onGenerate}
          disabled={genState.status === 'running'}
          style={{
            padding:'8px 16px', borderRadius:6, border:'1px solid var(--accent2)',
            background: 'var(--accent2)', color:'#fff',
            fontSize:13, fontWeight:600, cursor:'pointer'
          }}>
          {genState.status === 'running' ? 'Generating...' : 'Generate Waveform'}
        </button>
        <span style={{fontFamily:'JetBrains Mono, monospace', fontSize:13}}>
          <span className="badge-ok" style={{marginRight:6}}>{nPass} ✓</span>
          {nFail > 0 && <span className="badge-warn">{nFail} ✗</span>}
        </span>
        {genState.status === 'done' && genState.result && (
          <span style={{color:'var(--ink-dim)', fontSize:12}}>
            Generated {genState.result.stats.totalSamples} samples
            ({genState.result.stats.durationUs.toFixed(1)} µs)
            in {genState.result.stats.gen_ms} ms
          </span>
        )}
        {genState.status === 'error' && (
          <span style={{color:'var(--red)', fontSize:12}}>Error: {genState.error}</span>
        )}
      </div>

      {!isRef && (
        <div style={{
          padding:'10px 14px', background:'#fff5e0', border:'1px solid #f5b660',
          borderRadius:6, fontSize:12, color:'#8a4d00', marginBottom:14
        }}>
          Current params differ from the reference case. The "Computed (live)" column reflects
          your params, not the canonical example. Click <b>Load Reference Case</b> to align.
        </div>
      )}

      <table className="mac-tbl" style={{tableLayout:'fixed'}}>
        <thead>
          <tr>
            <th style={{width:'15%'}}>Group</th>
            <th style={{width:'40%'}}>Quantity</th>
            <th style={{width:'15%', textAlign:'right'}}>Expected</th>
            <th style={{width:'15%', textAlign:'right'}}>Computed (live params)</th>
            <th style={{width:'15%', textAlign:'right'}}>Reference (forced params)</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(groups).map(grp => groups[grp].map((row, idx) => {
            const computedRef = c[row.key];
            const computedLive = live[row.key];
            const passRef  = eq(computedRef, row.value);
            const passLive = eq(computedLive, row.value);
            return (
              <tr key={row.key}>
                <td style={{color: idx===0 ? 'var(--accent)' : 'var(--ink-muted)', fontFamily:'-apple-system, sans-serif', fontWeight: idx===0 ? 600 : 400}}>
                  {idx === 0 ? grp : ''}
                </td>
                <td className="field-name">{row.label}</td>
                <td style={{textAlign:'right'}}>{fmtVal(row.value)}</td>
                <td style={{textAlign:'right', color: passLive ? 'var(--green)' : 'var(--red)'}}>
                  {fmtVal(computedLive)} {passLive ? '✓' : '✗'}
                </td>
                <td style={{textAlign:'right', color: passRef ? 'var(--green)' : 'var(--red)'}}>
                  {fmtVal(computedRef)} {passRef ? '✓' : '✗'}
                </td>
              </tr>
            );
          }))}
          {hashHex && (
            <tr>
              <td style={{color:'var(--ink-muted)'}}>Bit-hash</td>
              <td className="field-name">SHA-256(IQ samples)</td>
              <td colSpan={3} style={{fontFamily:'JetBrains Mono, monospace', fontSize:11, color:'var(--ink-dim)', wordBreak:'break-all'}}>
                {hashHex}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
window.ReferenceValidation = ReferenceValidation;

// =====================================================================
// TimeDomainPlot — canvas plot of |IQ| over the 96 µs PPDU.
// Mirrors ref/wifi7-python/eht_waveform_time.png with field-boundary lines.
// =====================================================================

function TimeDomainPlot({ p }) {
  const canvasRef = useRef8(null);
  const [view, setView] = useState8('mag');     // 'mag' | 're' | 'im' | 'logmag'
  const [waveform, setWaveform] = useState8(null);
  const [running, setRunning] = useState8(false);

  const onGenerate = () => {
    if (!window.EHT.pipeline) return;
    setRunning(true);
    setTimeout(() => {
      try {
        const r = window.EHT.pipeline.generate(p);
        setWaveform(r);
      } catch (e) {
        console.error(e);
      }
      setRunning(false);
    }, 50);
  };

  useEffect8(() => {
    if (!waveform || !canvasRef.current) return;
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.fillStyle = '#fafcff';
    ctx.fillRect(0, 0, W, H);

    const { iqRe, iqIm, fields } = waveform;
    const N = iqRe.length;
    const fieldColors = {
      'L-STF': '#fde4b8', 'L-LTF': '#e6d5f5', 'L-SIG': '#c8e6ec', 'RL-SIG': '#cfe9d4',
      'U-SIG': '#f0e4b0', 'EHT-SIG': '#fbd5b8', 'EHT-STF': '#f5c8c8',
      'EHT-LTF': '#dde8c0', 'Data': '#c8d8f0', 'PE': '#dbe1ea'
    };

    // Draw field background bands
    for (const f of fields) {
      const x0 = (f.startSample / N) * W;
      const x1 = (f.endSample / N) * W;
      ctx.fillStyle = fieldColors[f.name] || '#eee';
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x0, 0, x1 - x0, H);
    }
    ctx.globalAlpha = 1;

    // Compute Y values (decimated for plot)
    const samplesPerCol = Math.max(1, Math.floor(N / W));
    const yVals = new Float32Array(W);
    let yMax = 0;
    for (let x = 0; x < W; x++) {
      const i0 = x * samplesPerCol;
      const i1 = Math.min(i0 + samplesPerCol, N);
      let agg = 0;
      for (let i = i0; i < i1; i++) {
        let v;
        if (view === 'mag')      v = Math.hypot(iqRe[i], iqIm[i]);
        else if (view === 're')  v = iqRe[i];
        else if (view === 'im')  v = iqIm[i];
        else                     v = Math.log10(1e-6 + Math.hypot(iqRe[i], iqIm[i]));
        agg = (Math.abs(v) > Math.abs(agg)) ? v : agg;
      }
      yVals[x] = agg;
      if (Math.abs(agg) > yMax) yMax = Math.abs(agg);
    }
    if (yMax === 0) yMax = 1;

    // Plot waveform
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const y = (view === 'mag' || view === 'logmag')
        ? H - (yVals[x] / yMax) * (H - 24) - 4
        : H/2 - (yVals[x] / yMax) * (H/2 - 12);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Field boundary lines + labels
    ctx.fillStyle = '#1a2236';
    ctx.font = '10px JetBrains Mono, monospace';
    for (const f of fields) {
      const x0 = (f.startSample / N) * W;
      ctx.strokeStyle = '#1a2236';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, 0); ctx.lineTo(x0, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(f.name, x0 + 3, 12);
    }
  }, [waveform, view]);

  return (
    <div className="panel">
      <h2><span className="num">▦</span> Time-Domain Waveform
        <span className="desc">|IQ| vs sample index (full PPDU). Mirrors ref/wifi7-python/eht_waveform_time.png.</span>
      </h2>
      <div style={{display:'flex', gap:10, marginBottom:10, alignItems:'center'}}>
        <button
          onClick={onGenerate}
          disabled={running}
          style={{padding:'6px 12px', borderRadius:5, border:'1px solid var(--accent)',
                  background:'var(--accent)', color:'#fff', fontSize:12, cursor:'pointer'}}>
          {running ? 'Generating...' : (waveform ? 'Regenerate' : 'Generate')}
        </button>
        <div style={{display:'flex', gap:4}}>
          {['mag','re','im','logmag'].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{padding:'4px 10px', borderRadius:4,
                      border:'1px solid var(--line)',
                      background: view === v ? 'var(--accent)' : 'var(--bg2)',
                      color: view === v ? '#fff' : 'var(--ink)',
                      fontSize:11, cursor:'pointer', fontFamily:'JetBrains Mono, monospace'}}>
              {v === 'mag' ? '|IQ|' : v === 're' ? 'I' : v === 'im' ? 'Q' : 'log|IQ|'}
            </button>
          ))}
        </div>
        {waveform && (
          <span style={{color:'var(--ink-dim)', fontSize:11}}>
            {waveform.iqRe.length} samples · {(waveform.iqRe.length / 480).toFixed(1)} µs · gen {waveform.stats.gen_ms} ms
          </span>
        )}
      </div>
      <canvas ref={canvasRef} width={1200} height={220}
              style={{width:'100%', maxWidth:1200, border:'1px solid var(--line)', borderRadius:6}} />
      {!waveform && (
        <div style={{color:'var(--ink-muted)', fontSize:12, marginTop:8, fontStyle:'italic'}}>
          Click <b>Generate</b> to synthesize the IQ waveform. Currently the preamble fields use
          placeholder analytic stubs (matching duration, not bit-content); the Data field is
          fully spec-compliant.
        </div>
      )}
    </div>
  );
}
window.TimeDomainPlot = TimeDomainPlot;

// =====================================================================
// PSDPlot — Welch periodogram via the same generated IQ.
// Segment 256, 50% overlap, Hann window.
// =====================================================================

function welchPSD(iqRe, iqIm, segLen, hopLen, fs) {
  const N = iqRe.length;
  const hann = new Float64Array(segLen);
  for (let n = 0; n < segLen; n++) hann[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (segLen - 1));
  let winSum = 0;
  for (let n = 0; n < segLen; n++) winSum += hann[n] * hann[n];
  // segLen must be a power of 2 for the radix-2 FFT used here (256 is fine).
  const psd = new Float64Array(segLen);
  let nSeg = 0;
  for (let off = 0; off + segLen <= N; off += hopLen) {
    const segRe = new Float64Array(segLen);
    const segIm = new Float64Array(segLen);
    for (let n = 0; n < segLen; n++) {
      segRe[n] = iqRe[off + n] * hann[n];
      segIm[n] = iqIm[off + n] * hann[n];
    }
    window.EHT.pipeline.fftRadix2(segRe, segIm, -1);
    for (let k = 0; k < segLen; k++) {
      psd[k] += (segRe[k]*segRe[k] + segIm[k]*segIm[k]);
    }
    nSeg++;
  }
  if (nSeg === 0) return null;
  const norm = 1 / (nSeg * winSum * fs);
  for (let k = 0; k < segLen; k++) psd[k] *= norm;
  // FFT-shift so that DC is in middle
  const half = segLen / 2;
  const psdShift = new Float64Array(segLen);
  for (let k = 0; k < segLen; k++) psdShift[k] = psd[(k + half) % segLen];
  // Frequency axis (MHz, centered)
  const freq = new Float64Array(segLen);
  for (let k = 0; k < segLen; k++) freq[k] = (k - half) * fs / segLen / 1e6;
  return { freq, psd: psdShift, nSeg };
}

function PSDPlot({ p }) {
  const canvasRef = useRef8(null);
  const [waveform, setWaveform] = useState8(null);
  const [running, setRunning] = useState8(false);

  const onGenerate = () => {
    if (!window.EHT.pipeline) return;
    setRunning(true);
    setTimeout(() => {
      try { setWaveform(window.EHT.pipeline.generate(p)); }
      catch (e) { console.error(e); }
      setRunning(false);
    }, 50);
  };

  useEffect8(() => {
    if (!waveform || !canvasRef.current) return;
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.fillStyle = '#fafcff';
    ctx.fillRect(0, 0, W, H);

    const fs = 480e6;
    const psdRes = welchPSD(waveform.iqRe, waveform.iqIm, 256, 128, fs);
    if (!psdRes) return;
    const { freq, psd } = psdRes;
    const dB = new Float64Array(psd.length);
    let dBmax = -Infinity, dBmin = Infinity;
    for (let i = 0; i < psd.length; i++) {
      dB[i] = 10 * Math.log10(psd[i] + 1e-20);
      if (dB[i] > dBmax) dBmax = dB[i];
      if (dB[i] < dBmin) dBmin = dB[i];
    }
    const range = Math.max(20, dBmax - dBmin);
    const fMin = freq[0], fMax = freq[freq.length - 1];

    // Plot
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < freq.length; i++) {
      const x = ((freq[i] - fMin) / (fMax - fMin)) * W;
      const y = H - ((dB[i] - dBmin) / range) * (H - 24) - 4;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#1a2236';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(`${fMin.toFixed(0)} MHz`, 4, H - 4);
    ctx.fillText(`${fMax.toFixed(0)} MHz`, W - 60, H - 4);
    ctx.fillText('0 Hz', W/2 - 12, H - 4);
    ctx.fillText(`${dBmax.toFixed(1)} dB`, 4, 12);
    ctx.fillText(`${dBmin.toFixed(1)} dB`, 4, H - 16);

    // Grid: 80-MHz boundaries for BW=320
    if (p.BW === 320) {
      ctx.strokeStyle = '#cbd5e0';
      ctx.setLineDash([2, 3]);
      for (const fline of [-160, -80, 0, 80, 160]) {
        const x = ((fline - fMin) / (fMax - fMin)) * W;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }, [waveform, p]);

  return (
    <div className="panel">
      <h2><span className="num">▥</span> Power Spectral Density (Welch)
        <span className="desc">256-pt segments, 50% overlap, Hann window. Mirrors ref/wifi7-python/eht_waveform_psd.png.</span>
      </h2>
      <div style={{display:'flex', gap:10, marginBottom:10, alignItems:'center'}}>
        <button
          onClick={onGenerate}
          disabled={running}
          style={{padding:'6px 12px', borderRadius:5, border:'1px solid var(--accent)',
                  background:'var(--accent)', color:'#fff', fontSize:12, cursor:'pointer'}}>
          {running ? 'Generating...' : (waveform ? 'Regenerate' : 'Generate')}
        </button>
      </div>
      <canvas ref={canvasRef} width={1200} height={220}
              style={{width:'100%', maxWidth:1200, border:'1px solid var(--line)', borderRadius:6}} />
    </div>
  );
}
window.PSDPlot = PSDPlot;

// =====================================================================
// BitTraceTool — Stub Phase-2 component. Currently shows the path through
// the pipeline at a high level; full bit-tracing requires more wiring.
// =====================================================================

function BitTraceTool({ p }) {
  const [byteIdx, setByteIdx] = useState8(0);
  const [bitIdx,  setBitIdx]  = useState8(3);
  const c = window.EHT.compute(p);

  // Reset byte/bit selection when PSDU layout changes (different BW/MCS/APEP)
  // so the user never lands on an out-of-range byte after a param change.
  useEffect8(() => { setByteIdx(0); setBitIdx(3); }, [p.BW, p.MCS, p.APEP, c.PSDU_bytes]);

  // Clamp inputs (defensive — covers the render between effect dispatches)
  const maxByte = Math.max(0, c.PSDU_bytes - 1);
  const safeByteIdx = Math.min(Math.max(0, byteIdx), maxByte);
  const safeBitIdx  = Math.min(Math.max(0, bitIdx), 7);

  // ---- Stage 1: PSDU byte (real APEP vs MAC EOF-padding delimiter) ----
  const isPaddingByte = safeByteIdx >= c.APEP;

  // ---- Stage 2: PHY bit-stream position (LSB-first per byte, after SERVICE) ----
  // bit_stream[0..15] = SERVICE; bit_stream[16..16+8·PSDU_bytes-1] = PSDU bits.
  const bitStreamPos = c.N_service + safeByteIdx * 8 + safeBitIdx;
  const inBounds     = bitStreamPos < c.N_pld;

  // ---- Stage 4: LDPC codeword distribution ----
  // The encoder pulls k_act = k − s_shrt info bits per codeword, sequentially.
  // Shortening is distributed: first (N_shrt mod N_CW) codewords get one extra zero.
  const k = Math.round(c.L_LDPC * c.mcs.Rn / c.mcs.Rd);
  const shrtBase = (c.N_CW > 0) ? Math.floor(c.N_shrt / c.N_CW) : 0;
  const shrtExtra = (c.N_CW > 0) ? c.N_shrt % c.N_CW : 0;
  const puncBase = (c.N_CW > 0) ? Math.floor(c.N_punc / c.N_CW) : 0;
  const puncExtra = (c.N_CW > 0) ? c.N_punc % c.N_CW : 0;
  const repBase  = (c.N_CW > 0) ? Math.floor(c.N_rep  / c.N_CW) : 0;
  const repExtra = (c.N_CW > 0) ? c.N_rep  % c.N_CW : 0;

  let cwIdx = -1, posInCw = -1, kActOfCw = 0;
  let encStartOfCw = 0;
  if (c.Coding === 'LDPC' && inBounds) {
    let infoAcc = 0;     // total info bits consumed so far
    let encAcc  = 0;     // total encoded bits emitted so far
    for (let cw = 0; cw < c.N_CW; cw++) {
      const sShrt = shrtBase + ((cw + 1) <= shrtExtra ? 1 : 0);
      const sPunc = puncBase + ((cw + 1) <= puncExtra ? 1 : 0);
      const sRep  = repBase  + ((cw + 1) <= repExtra  ? 1 : 0);
      const kAct  = k - sShrt;
      const cwOutLen = kAct + (c.L_LDPC - k) - sPunc + sRep;
      if (bitStreamPos < infoAcc + kAct) {
        cwIdx = cw;
        posInCw = bitStreamPos - infoAcc;
        kActOfCw = kAct;
        encStartOfCw = encAcc;
        break;
      }
      infoAcc += kAct;
      encAcc  += cwOutLen;
    }
  }

  // ---- Stage 5: which OFDM symbol + position within symbol ----
  // Encoded bits stream is the concatenation of cwOuts; symbol idx = floor(enc_pos / N_CBPS).
  // Info bits sit at the START of each cwOut, so encoded position of our bit = encStartOfCw + posInCw.
  const encPos = (cwIdx >= 0) ? (encStartOfCw + posInCw) : -1;
  const symIdx   = (encPos >= 0) ? Math.floor(encPos / c.N_CBPS) : -1;
  const posInSym = (encPos >= 0) ? (encPos % c.N_CBPS) : -1;

  // ---- Stage 6: segment parser (BW ≥ 160) ----
  // Round-robin into N_sb sub-blocks of s_l = max(1, N_BPSCS/2) bits per round.
  // src_start = round * N_sb * s_l + l * s_l; dst_start = round * s_l + offset_in_chunk.
  const N_sb = c.N_sb;
  const s_l  = Math.max(1, c.N_BPSCS >> 1);
  let subBlock = 0, posInSb = posInSym;
  if (N_sb > 1 && posInSym >= 0) {
    const roundIdx     = Math.floor(posInSym / (N_sb * s_l));
    const offsetInRound = posInSym % (N_sb * s_l);
    subBlock = Math.floor(offsetInRound / s_l);
    const offsetInChunk = offsetInRound % s_l;
    posInSb = roundIdx * s_l + offsetInChunk;
  }

  // ---- Stage 7: constellation point + LDPC tone map ----
  // Each N_BPSCS bits → one Gray-coded QAM point. Sub-block size:
  //   N_SD_l = N_SD / N_sb; constellation index k = floor(posInSb / N_BPSCS).
  // ldpc_tone_map (Eq. 36-72): t(k) = D_TM·(k mod (N_SD_l/D_TM)) + floor(k·D_TM/N_SD_l)
  const N_SD_l = c.N_SD / N_sb;
  const D_TM = (p.BW === 20) ? 9 : (p.BW === 40 ? 12 : 20);
  let constIdx = -1, physIdxInSb = -1;
  if (posInSb >= 0 && c.Coding === 'LDPC') {
    constIdx = Math.floor(posInSb / c.N_BPSCS);
    physIdxInSb = D_TM * (constIdx % (N_SD_l / D_TM)) + Math.floor(constIdx * D_TM / N_SD_l);
  } else if (posInSb >= 0) {
    constIdx = Math.floor(posInSb / c.N_BPSCS);
    physIdxInSb = constIdx; // BCC: identity tone map (Eq. 36-74)
  }

  // K_mod table (matches modulation/constellation_map.py:K_mod_table)
  const K_MOD_DEN = { 1: 1, 2: 2, 4: 10, 6: 42, 8: 170, 10: 682, 12: 2730 };
  const kModDen = K_MOD_DEN[c.N_BPSCS];

  // ---- Stage 8: time-domain sample range ----
  // Preamble samples = sum of (L-STF, L-LTF, L-SIG, RL-SIG, U-SIG, EHT-SIG, EHT-STF, EHT-LTF) µs · 480 MHz.
  // Read directly from c.fieldUs to honor the corrected EHT-LTF formula.
  const preambleUs = c.fieldUs['L-STF'] + c.fieldUs['L-LTF'] + c.fieldUs['L-SIG'] +
                     c.fieldUs['RL-SIG'] + c.fieldUs['U-SIG'] + c.fieldUs['EHT-SIG'] +
                     c.fieldUs['EHT-STF'] + c.fieldUs['EHT-LTF'];
  const preambleSamples = Math.round(preambleUs * 480);
  const symLen = c.NFFT + c.CP_data;
  const symStart = preambleSamples + Math.max(0, symIdx) * symLen;
  const symEnd   = symStart + symLen - 1;

  const stages = [
    { title: 'PSDU byte location',
      detail: `Byte ${safeByteIdx} of ${c.PSDU_bytes} (APEP=${c.APEP} real bytes + ${c.N_PAD_MAC_bytes} EOF-pad delimiter bytes; PHY pad ${c.N_PAD_PHY_bits} sub-byte bits at PHY layer). ${isPaddingByte ? 'This byte is a MAC EOF padding delimiter (signature 0x4E + length=0 + CRC-8).' : 'This byte is real APEP user payload.'}`
    },
    { title: 'PHY bit-stream position (LSB-first per byte, §36.3.13.2)',
      detail: `bit_pos = N_service(${c.N_service}) + byte(${safeByteIdx})·8 + bit(${safeBitIdx}) = ${bitStreamPos} of N_pld = ${c.N_pld}.`
    },
    { title: 'Scrambler XOR (PN11, x¹¹+x⁹+1)',
      detail: `scrambled[${bitStreamPos}] = data[${bitStreamPos}] ⊕ PN11_seq[${bitStreamPos}], with init seed = ${p.ScramblerInit || 1}. The XOR is bit-by-bit; bit position is preserved.`
    },
    { title: c.Coding === 'LDPC' ? 'LDPC codeword distribution' : 'BCC encode (rate 1/2 + puncture)',
      detail: c.Coding === 'LDPC' && cwIdx >= 0
        ? `k = round(L_LDPC·R) = round(${c.L_LDPC}·${c.mcs.Rn}/${c.mcs.Rd}) = ${k}. Per-codeword shortening: base ${shrtBase}, +1 for first ${shrtExtra} codewords. Lands in codeword #${cwIdx} (of ${c.N_CW}), info offset ${posInCw} of k_act = ${kActOfCw}. Output offset of this info bit = ${encStartOfCw + posInCw} (info comes first in cwOut = [info | parity]).`
        : (c.Coding === 'BCC' ? 'BCC encoding doubles each scrambled bit (rate-1/2, K=7, g0=133/g1=171 octal). Detailed BCC trace TBD.' : '— bit out of N_pld range —')
    },
    { title: 'OFDM symbol & encoded bit position',
      detail: symIdx >= 0
        ? `Encoded position ${encPos} → OFDM symbol #${symIdx} of ${c.N_SYM}, encoded-bit offset ${posInSym} of N_CBPS = ${c.N_CBPS}.`
        : '—'
    },
    { title: `Segment parser (N_sb = ${N_sb})`,
      detail: N_sb > 1 && posInSym >= 0
        ? `BW ≥ 160 MHz: round-robin into ${N_sb} sub-blocks. s_l = max(1, N_BPSCS/2) = ${s_l} bits/round. Round = floor(posInSym / ${N_sb*s_l}). Lands in sub-block #${subBlock}, position ${posInSb} of N_CBPSS_l = ${c.N_CBPS / N_sb}.`
        : (posInSym >= 0
            ? `BW ≤ 80 MHz: single sub-block, identity (no parsing). Position in sub-block = posInSym = ${posInSb}.`
            : '—')
    },
    { title: 'Constellation point + LDPC tone map (Eq. 36-72)',
      detail: constIdx >= 0
        ? `${c.mcs.name}, ${c.N_BPSCS} bits/SC, K_mod = 1/√${kModDen}. Logical SC #${constIdx} in sub-block (of N_SD_l = ${N_SD_l}). Tone map (D_TM = ${D_TM}): physical SC offset ${physIdxInSb} within sub-block #${subBlock}.`
        : '—'
    },
    { title: 'Time-domain sample range',
      detail: symIdx >= 0
        ? `Preamble = ${preambleUs.toFixed(1)} µs · 480 MHz = ${preambleSamples} samples. Data symbol #${symIdx} occupies samples ${symStart}..${symEnd} (NFFT ${c.NFFT} + CP ${c.CP_data} = ${symLen}/symbol).`
        : '—'
    }
  ];

  return (
    <div className="panel">
      <h2><span className="num">⤳</span> Bit-Trace Tool
        <span className="desc">Pick ONE bit of your PSDU payload — see exactly where it lives at every stage of the PHY pipeline (math verified vs ref/wifi7-python)</span>
      </h2>

      {/* "What is this" intro card — keeps the panel self-explanatory */}
      <div style={{
        padding:'12px 16px', background:'#eef6ff', border:'1px solid #b6d4fe',
        borderRadius:8, fontSize:13, lineHeight:1.6, color:'#1e3a8a', marginBottom:14
      }}>
        <div style={{fontWeight:700, marginBottom:6, fontSize:14}}>What this tool does</div>
        <div>
          A WiFi 7 transmitter shreds your payload through 8 transformations
          (scrambler → LDPC → bit→QAM → segment-parser → tone-map → pilots → IFFT → CP).
          By the time the bit becomes RF, its <i>identity</i> is buried inside a complex sample.
          Pick a single byte (e.g. byte&nbsp;0, bit&nbsp;3 = the 4th bit of byte&nbsp;0) and the
          panel tells you, at every stage:
          <ul style={{margin:'6px 0 0 0', paddingLeft:24, lineHeight:1.7}}>
            <li><b>which</b> LDPC codeword it lands in (#0..#{c.N_CW-1})</li>
            <li><b>which</b> OFDM symbol carries it (#0..#{c.N_SYM-1})</li>
            <li><b>which</b> sub-block (segment parser) and <b>which</b> physical subcarrier it modulates</li>
            <li><b>which</b> time-domain sample range, in 480 MHz samples, it ultimately occupies</li>
          </ul>
          <div style={{marginTop:8, fontSize:12, color:'#1e40af'}}>
            <b>Use it for:</b> debugging spec edge cases · teaching the LDPC distribution rule (shortening / puncturing / repetition) · sanity-checking your own reference implementation byte-by-byte.
          </div>
        </div>
      </div>

      <div style={{display:'flex', gap:14, marginBottom:14, fontFamily:'JetBrains Mono, monospace', fontSize:13, alignItems:'center', flexWrap:'wrap'}}>
        <label>byte:&nbsp;
          <input type="number" min="0" max={maxByte} value={safeByteIdx}
            onChange={e => setByteIdx(Math.max(0, Math.min(maxByte, +e.target.value || 0)))}
            style={{width:90, padding:'4px 8px', border:'1px solid var(--line)', borderRadius:4}}/>
        </label>
        <span style={{color:'var(--ink-muted)', fontSize:11}}>(0..{maxByte})</span>
        <label>bit (LSB=0..MSB=7):&nbsp;
          <input type="number" min="0" max="7" value={safeBitIdx}
            onChange={e => setBitIdx(Math.max(0, Math.min(7, +e.target.value || 0)))}
            style={{width:60, padding:'4px 8px', border:'1px solid var(--line)', borderRadius:4}}/>
        </label>
        <span style={{color:'var(--ink-dim)', fontSize:11}}>
          {isPaddingByte ? '· MAC EOF padding delimiter byte' : '· APEP payload byte'}
        </span>
      </div>
      <div className="stages">
        {stages.map((s, i) => (
          <div key={i} className="stage" style={{cursor:'default'}}>
            <div className="head">
              <span className="stage-n">{i + 1}</span>
              <span className="stage-t">{s.title}</span>
            </div>
            <div style={{padding:'4px 0 0 40px', fontSize:12, color:'var(--ink-dim)', fontFamily:'JetBrains Mono, monospace', lineHeight:1.6}}>
              {s.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.BitTraceTool = BitTraceTool;

// =====================================================================
// VSA89600MockPanel — recreation of Keysight 89600 VSA layout.
// Three tile windows: time trace, freq trace, error summary table.
// =====================================================================

function VSA89600MockPanel({ p }) {
  const c = window.EHT.compute(p);
  const stat = (label, val, unit) => (
    <div style={{padding:'6px 10px', borderBottom:'1px solid var(--line)', display:'flex', justifyContent:'space-between'}}>
      <span style={{color:'var(--ink-muted)', fontSize:11}}>{label}</span>
      <span style={{fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--accent)'}}>
        {val}{unit && <span style={{color:'var(--ink-dim)', marginLeft:3}}>{unit}</span>}
      </span>
    </div>
  );
  return (
    <div className="panel">
      <h2><span className="num">VSA</span> Keysight 89600 Mock Panel
        <span className="desc">Recreates the analyzer layout (Section 6.4 of TEACHING.md). Values from compute().</span>
      </h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
        <div style={{background:'#101a2c', color:'#88d8e8', padding:'10px 14px', borderRadius:6, fontFamily:'JetBrains Mono, monospace'}}>
          <div style={{fontSize:11, color:'#88a5d8', marginBottom:8}}>TIME · |IQ|</div>
          <div style={{height:120, position:'relative', background:'#0a0f1a', borderRadius:4, padding:6, fontSize:10, color:'#88d8e8'}}>
            <div style={{position:'absolute', top:6, left:6}}>0.0 V</div>
            <div style={{position:'absolute', bottom:6, right:6}}>{c.TXTIME.toFixed(1)} µs</div>
            <div style={{position:'absolute', top:'40%', left:0, right:0, height:1, background:'#88d8e8', opacity:0.5}}></div>
          </div>
        </div>
        <div style={{background:'#101a2c', color:'#88d8e8', padding:'10px 14px', borderRadius:6, fontFamily:'JetBrains Mono, monospace'}}>
          <div style={{fontSize:11, color:'#88a5d8', marginBottom:8}}>FREQ · PSD (dBm/MHz)</div>
          <div style={{height:120, position:'relative', background:'#0a0f1a', borderRadius:4, padding:6, fontSize:10, color:'#88d8e8'}}>
            <div style={{position:'absolute', top:6, left:6}}>0 dBm</div>
            <div style={{position:'absolute', bottom:6, left:6}}>−80 dBm</div>
            <div style={{position:'absolute', bottom:6, right:6}}>{p.BW}/2 MHz</div>
          </div>
        </div>
        <div style={{background:'var(--bg2)', borderRadius:6, padding:0, border:'1px solid var(--line)'}}>
          <div style={{padding:'6px 10px', background:'var(--ink)', color:'#fff', fontSize:11, fontWeight:600, borderRadius:'6px 6px 0 0'}}>
            ERROR SUMMARY
          </div>
          {stat('PHY rate',     c.phy_rate_Mbps.toFixed(2), 'Mbps')}
          {stat('TXTIME',       c.TXTIME.toFixed(1),         'µs')}
          {stat('PSDU bytes',   c.PSDU_bytes,                'B')}
          {stat('N_SYM',        c.N_SYM,                     '')}
          {stat('N_DBPS',       c.N_DBPS,                    'b/sym')}
          {stat('LSIG LENGTH',  c.LSIG_LEN,                  '')}
        </div>
      </div>
    </div>
  );
}
window.VSA89600MockPanel = VSA89600MockPanel;

// =====================================================================
// Appendix J top-5 visualizations
// =====================================================================

// 1. LDPCBaseMatrixViz — heatmap of Annex F base matrix.
// Cells: -1 → light gray (zero block); 0..Z-1 → blue scale (circulant shift).
// Hover shows row/col + shift value.
function LDPCBaseMatrixViz({ p }) {
  const c = window.EHT.compute(p);
  const [rateChoice, setRateChoice] = useState8(null);
  const [ncwChoice, setNcwChoice] = useState8(null);
  const Rn = rateChoice ? rateChoice[0] : c.mcs.Rn;
  const Rd = rateChoice ? rateChoice[1] : c.mcs.Rd;
  // Default to canonical 1944 if compute() didn't pick LDPC (e.g. BCC mode L_LDPC=0)
  const Ncw = ncwChoice || (c.L_LDPC && c.L_LDPC > 0 ? c.L_LDPC : 1944);
  const ldpc = window.EHT_LDPC;
  if (!ldpc) {
    return <div className="panel"><h2>LDPC Base Matrix</h2>
      <div style={{color:'var(--ink-muted)', fontSize:12}}>eht_ldpc_matrices.js not loaded.</div></div>;
  }
  let bm, rows, cols, z;
  try { ({ data: bm, rows, cols, z } = ldpc.getBaseMatrix(Ncw, Rn, Rd)); }
  catch (e) { return <div className="panel"><h2>LDPC Base Matrix</h2><div style={{color:'var(--red)'}}>{e.message}</div></div>; }

  const cellW = Math.min(36, Math.floor(900 / cols));
  const cellH = Math.min(28, cellW);
  const rates = [[1,2],[2,3],[3,4],[5,6]];
  const ncws  = [648, 1296, 1944];

  return (
    <div className="panel">
      <h2><span className="num">▤</span> LDPC Base Matrix Heatmap
        <span className="desc">Annex F · {Ncw}-bit codeword, R={Rn}/{Rd}, Z={z} (lift factor) · ports of `_BM_{Rn===1&&Rd===2?1:Rn===2?2:Rn===3?3:4}{Ncw===648?1:Ncw===1296?2:3}` from coding/ldpc_matrices.py</span>
      </h2>
      <div style={{display:'flex', gap:14, marginBottom:14, alignItems:'center', flexWrap:'wrap', fontSize:12}}>
        <div>Rate:&nbsp;
          {rates.map(r => (
            <button key={r.join('/')} onClick={()=>setRateChoice(r)}
              style={{padding:'3px 8px', marginRight:4, borderRadius:3,
                border:'1px solid var(--line)', cursor:'pointer',
                background: (Rn===r[0] && Rd===r[1]) ? 'var(--accent)' : 'var(--bg2)',
                color: (Rn===r[0] && Rd===r[1]) ? '#fff' : 'var(--ink)',
                fontFamily:'JetBrains Mono, monospace', fontSize:11}}>
              {r[0]}/{r[1]}
            </button>
          ))}
        </div>
        <div>N:&nbsp;
          {ncws.map(n => (
            <button key={n} onClick={()=>setNcwChoice(n)}
              style={{padding:'3px 8px', marginRight:4, borderRadius:3,
                border:'1px solid var(--line)', cursor:'pointer',
                background: (Ncw===n) ? 'var(--accent2)' : 'var(--bg2)',
                color: (Ncw===n) ? '#fff' : 'var(--ink)',
                fontFamily:'JetBrains Mono, monospace', fontSize:11}}>
              {n}
            </button>
          ))}
        </div>
        <span style={{color:'var(--ink-dim)'}}>{rows}×{cols} cells · Z×Z = {z}×{z} per cell</span>
      </div>
      <div style={{display:'inline-block', border:'1px solid var(--line)', borderRadius:4, overflow:'hidden', maxWidth:'100%', overflowX:'auto'}}>
        {Array.from({length: rows}).map((_, r) => (
          <div key={`row-${r}`} style={{display:'flex'}}>
            {Array.from({length: cols}).map((_, k) => {
              const v = bm[r * cols + k];
              const isZero = v < 0;
              const intensity = isZero ? 0 : Math.min(1, v / (z - 1));
              const bg = isZero ? '#f1f5fb' : `hsl(${220 - intensity*40}, ${60 + intensity*30}%, ${85 - intensity*40}%)`;
              const fg = isZero ? 'var(--ink-muted)' : (intensity > 0.5 ? '#fff' : 'var(--ink)');
              return (
                <div key={`r${r}-c${k}`} title={`row=${r}, col=${k}, ${isZero?'zero block':'shift='+v}`}
                  style={{
                    width:cellW, height:cellH,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background:bg, color:fg, fontSize:9,
                    fontFamily:'JetBrains Mono, monospace',
                    borderRight:'1px solid #fff', borderBottom:'1px solid #fff'
                  }}>
                  {isZero ? '·' : v}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{marginTop:10, fontSize:11, color:'var(--ink-dim)', lineHeight:1.5}}>
        Each cell is a Z×Z block: <b>·</b> = zero block; integer s ∈ [0, Z−1] = identity matrix circularly right-shifted by s.
        Full parity-check matrix H is (rows·Z) × (cols·Z) = ({rows*z}×{cols*z}). The encoding matrix P is derived
        once (cached) via GF(2) Gaussian elimination so that <code>parity = P · info (mod 2)</code>.
      </div>
    </div>
  );
}
window.LDPCBaseMatrixViz = LDPCBaseMatrixViz;

// 2. BCCTrellisViz — 64-state trellis for K=7, R=1/2 BCC.
// User types bit sequence; renders state path + per-step (A,B) outputs.
function BCCTrellisViz({ p }) {
  const [bitInput, setBitInput] = useState8('1101001');
  const bits = bitInput.split('').filter(c => c === '0' || c === '1').map(c => +c);

  // Walk the 64-state shift register
  const states = [0];
  const outputs = [];
  let sr = 0;
  for (const b of bits) {
    sr = ((sr << 1) | b) & 0x3F;             // shift and mask to 6 bits (state)
    states.push(sr);
    // g0 = 133 octal = 0b1011011, g1 = 171 octal = 0b1111001
    // Compute parity using full 7-bit register (bit + previous 6 state bits)
    const reg7 = ((b << 6) | sr) & 0x7F;     // {data, prev6}
    let A = 0, B = 0;
    const G0 = 0b1011011;
    const G1 = 0b1111001;
    for (let j = 0; j < 7; j++) {
      A ^= ((reg7 >> j) & 1) & ((G0 >> j) & 1);
      B ^= ((reg7 >> j) & 1) & ((G1 >> j) & 1);
    }
    outputs.push([A, B]);
  }

  const W = 920, H = 380;
  const stepX = bits.length > 0 ? (W - 100) / (bits.length) : 100;
  const numStates = 64;
  const stateY = s => 30 + (s / (numStates - 1)) * (H - 60);

  return (
    <div className="panel">
      <h2><span className="num">⊥</span> BCC Trellis (K=7, R=1/2, g0=133o, g1=171o)
        <span className="desc">6-bit shift-register state evolution; output (A,B) per step. Section 17.3.5.5.</span>
      </h2>
      <div style={{display:'flex', gap:14, marginBottom:10, fontFamily:'JetBrains Mono, monospace', fontSize:13}}>
        <label>input bits:&nbsp;
          <input type="text" value={bitInput}
            onChange={e => setBitInput(e.target.value)}
            placeholder="e.g. 1101001"
            style={{width:200, padding:'4px 8px', border:'1px solid var(--line)', borderRadius:4}}/>
        </label>
        <span style={{color:'var(--ink-dim)', fontSize:11}}>{bits.length} bits → {bits.length*2} coded</span>
      </div>
      <svg width={W} height={H} style={{background:'#fafcff', border:'1px solid var(--line)', borderRadius:4}}>
        {/* State labels */}
        {[0, 16, 32, 48, 63].map(s => (
          <text key={s} x={4} y={stateY(s)+4} fontSize="9" fontFamily="JetBrains Mono, monospace" fill="var(--ink-muted)">
            {s.toString(2).padStart(6,'0')}
          </text>
        ))}
        {/* Path */}
        {states.slice(0, -1).map((s, i) => {
          const x1 = 60 + i * stepX;
          const x2 = 60 + (i+1) * stepX;
          const y1 = stateY(s);
          const y2 = stateY(states[i+1]);
          const inputBit = bits[i];
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={inputBit ? '#dc2a55' : '#2563eb'} strokeWidth="2"
                strokeDasharray={inputBit ? '4 2' : 'none'}/>
              <circle cx={x2} cy={y2} r="4" fill={inputBit ? '#dc2a55' : '#2563eb'}/>
              <text x={(x1+x2)/2} y={(y1+y2)/2 - 6} fontSize="10"
                fontFamily="JetBrains Mono, monospace" fill="var(--ink)" textAnchor="middle">
                in={inputBit} → {outputs[i][0]}{outputs[i][1]}
              </text>
            </g>
          );
        })}
        <circle cx={60} cy={stateY(0)} r="5" fill="var(--green)"/>
        <text x={60} y={stateY(0)-8} fontSize="10" textAnchor="middle" fill="var(--green)">start</text>
        {/* Time axis */}
        <line x1={60} y1={H-15} x2={W-20} y2={H-15} stroke="var(--ink-muted)" strokeWidth="1"/>
        <text x={W-20} y={H-3} fontSize="10" textAnchor="end" fill="var(--ink-muted)" fontFamily="JetBrains Mono, monospace">time →</text>
      </svg>
      <div style={{marginTop:10, fontSize:11, color:'var(--ink-dim)', lineHeight:1.5}}>
        Solid blue = input bit 0 · dashed red = input bit 1. Y-axis = 6-bit state (0..63). Path traces how the
        encoder's state evolves as you feed input bits. Output is the full-rate-1/2 stream interleaved (A0,B0,A1,B1,...).
      </div>
    </div>
  );
}
window.BCCTrellisViz = BCCTrellisViz;

// 3. GrayVsBinaryViz — 16-QAM, side-by-side: Gray vs natural-binary mapping.
// Highlights nearest-neighbor Hamming distance.
function GrayVsBinaryViz({ p }) {
  const [highlight, setHighlight] = useState8(5);
  const points = [];
  // 16-QAM layout: 4×4 grid in (-3,-1,+1,+3) × (-3,-1,+1,+3)
  const levels = [-3, -1, 1, 3];
  const grayDecode = idx => idx ^ (idx >> 1);   // simplified Gray: bin->Gray = bin ^ bin>>1
  // Build 16 points: for each (Iidx, Qidx), compute Gray and binary 4-bit codes
  for (let qi = 0; qi < 4; qi++) {
    for (let ii = 0; ii < 4; ii++) {
      const I = levels[ii], Q = levels[qi];
      const binCode = (qi << 2) | ii;       // simple 4-bit binary
      // Gray code spec: spec uses Gray for I and Q independently, then concat.
      // For 16-QAM: 2 bits per axis; Gray code(0..3) = {00, 01, 11, 10}.
      const grayMap2 = [0b00, 0b01, 0b11, 0b10];
      const grayI = grayMap2[ii];
      const grayQ = grayMap2[qi];
      const grayCode = (grayQ << 2) | grayI;
      points.push({ I, Q, ii, qi, binCode, grayCode });
    }
  }
  const popcount4 = x => ((x>>0)&1) + ((x>>1)&1) + ((x>>2)&1) + ((x>>3)&1);
  const hl = points[highlight];
  const grayHam = points.map(pt => popcount4(pt.grayCode ^ hl.grayCode));
  const binHam  = points.map(pt => popcount4(pt.binCode  ^ hl.binCode));

  function ConstPanel({ codeKind, hams }) {
    const W = 280, H = 280;
    const px = I => W/2 + (I/4) * (W/2 - 30);
    const py = Q => H/2 - (Q/4) * (H/2 - 30);
    return (
      <svg width={W} height={H} style={{background:'#fafcff', border:'1px solid var(--line)', borderRadius:4}}>
        <line x1={W/2} y1={10} x2={W/2} y2={H-10} stroke="var(--line)"/>
        <line x1={10} y1={H/2} x2={W-10} y2={H/2} stroke="var(--line)"/>
        {points.map((pt, i) => {
          const isHl = (i === highlight);
          const ham = hams[i];
          const colorScale = ham === 0 ? '#16a34a' : ham === 1 ? '#7c5ce0' : ham === 2 ? '#ea7c3a' : '#dc2a55';
          return (
            <g key={i} style={{cursor:'pointer'}} onClick={()=>setHighlight(i)}>
              <circle cx={px(pt.I)} cy={py(pt.Q)} r={isHl ? 9 : 6}
                fill={isHl ? '#fff' : colorScale} stroke={colorScale} strokeWidth="2"/>
              <text x={px(pt.I)} y={py(pt.Q)+4} fontSize="13" textAnchor="middle"
                fontFamily="JetBrains Mono, monospace" fill={isHl ? colorScale : '#fff'} fontWeight={isHl?700:600}
                style={{paintOrder:'stroke', stroke: isHl ? 'none' : 'rgba(0,0,0,0.35)', strokeWidth: isHl ? 0 : 0.5}}>
                {(codeKind==='gray' ? pt.grayCode : pt.binCode).toString(2).padStart(4,'0')}
              </text>
            </g>
          );
        })}
        <text x={W/2} y={H-3} fontSize="10" textAnchor="middle" fill="var(--ink-muted)">
          {codeKind === 'gray' ? 'Gray (spec)' : 'Naïve binary'}
        </text>
      </svg>
    );
  }

  return (
    <div className="panel">
      <h2><span className="num">◇</span> Gray vs. Binary Mapping (16-QAM)
        <span className="desc">Click a point. Color = Hamming distance from selection. Notice Gray's nearest neighbors are 1-bit apart.</span>
      </h2>
      <div style={{display:'flex', gap:20, flexWrap:'wrap', marginBottom:12}}>
        <div>
          <ConstPanel codeKind="gray" hams={grayHam}/>
          <div style={{fontSize:11, color:'var(--ink-dim)', marginTop:4, fontFamily:'JetBrains Mono, monospace'}}>
            avg Hamming dist (4 nearest): {(grayHam.filter(h => h>0).slice(0,4).reduce((a,b)=>a+b,0)/4).toFixed(2)}
          </div>
        </div>
        <div>
          <ConstPanel codeKind="binary" hams={binHam}/>
          <div style={{fontSize:11, color:'var(--ink-dim)', marginTop:4, fontFamily:'JetBrains Mono, monospace'}}>
            avg Hamming dist (4 nearest): {(binHam.filter(h => h>0).slice(0,4).reduce((a,b)=>a+b,0)/4).toFixed(2)}
          </div>
        </div>
        <div style={{fontSize:11, color:'var(--ink-dim)', maxWidth:360}}>
          <b style={{color:'var(--ink)'}}>Why Gray?</b> A small AWGN error nudges a symbol to its nearest neighbor.
          With Gray coding, that neighbor differs by exactly 1 bit → the bit error is minimised. With naïve binary,
          neighbors can differ in up to 4 bits, dramatically inflating BER for the same SNR.
        </div>
      </div>
      <div style={{display:'flex', gap:14, fontSize:10, color:'var(--ink-dim)'}}>
        <span style={{color:'#16a34a'}}>● 0 (selected)</span>
        <span style={{color:'#7c5ce0'}}>● 1 bit diff</span>
        <span style={{color:'#ea7c3a'}}>● 2 bits diff</span>
        <span style={{color:'#dc2a55'}}>● 3+ bits diff</span>
      </div>
    </div>
  );
}
window.GrayVsBinaryViz = GrayVsBinaryViz;

// 4. PerSCBitsDiffViz — paste two per-SC bit dumps, see deltas.
function PerSCBitsDiffViz({ p }) {
  const [a, setA] = useState8('0 1100\n1 0011\n2 1010');
  const [b, setB] = useState8('0 1100\n1 0011\n2 1011');
  function parse(s) {
    const m = new Map();
    s.split('\n').forEach(line => {
      const t = line.trim();
      if (!t) return;
      const parts = t.split(/\s+/);
      if (parts.length < 2) return;            // need both `k` and `bits`
      const k = parseInt(parts[0], 10);
      if (isNaN(k)) return;
      if (!parts[1] || !/^[01]+$/.test(parts[1])) return;   // skip non-binary
      m.set(k, parts[1]);
    });
    return m;
  }
  const ma = parse(a);
  const mb = parse(b);
  const allK = Array.from(new Set([...ma.keys(), ...mb.keys()])).sort((x,y) => x-y);
  let nMatch = 0, nMismatch = 0, nBitErr = 0;
  const rows = [];
  for (const k of allK) {
    const va = ma.get(k) || '';
    const vb = mb.get(k) || '';
    if (va === vb) { nMatch++; continue; }
    nMismatch++;
    let diffBits = 0;
    const len = Math.max(va.length, vb.length);
    for (let i = 0; i < len; i++) {
      const ca = va[i] || '0';
      const cb = vb[i] || '0';
      if (ca !== cb) diffBits++;
    }
    nBitErr += diffBits;
    rows.push({ k, va, vb, diffBits });
  }
  return (
    <div className="panel">
      <h2><span className="num">Δ</span> Per-Subcarrier Bits Diff
        <span className="desc">Paste two dumps in `k bits` format (one SC per line). See per-SC mismatch and bit-error count.</span>
      </h2>
      <div style={{display:'flex', gap:10, marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11, color:'var(--ink-muted)', marginBottom:4}}>Dump A</div>
          <textarea value={a} onChange={e => setA(e.target.value)} rows={6}
            style={{width:'100%', fontFamily:'JetBrains Mono, monospace', fontSize:11,
              padding:6, border:'1px solid var(--line)', borderRadius:4, resize:'vertical'}}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:11, color:'var(--ink-muted)', marginBottom:4}}>Dump B</div>
          <textarea value={b} onChange={e => setB(e.target.value)} rows={6}
            style={{width:'100%', fontFamily:'JetBrains Mono, monospace', fontSize:11,
              padding:6, border:'1px solid var(--line)', borderRadius:4, resize:'vertical'}}/>
        </div>
      </div>
      <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:12, marginBottom:10}}>
        <span className="badge-ok">{nMatch} matching SC</span>
        {' '}{nMismatch > 0 && <span className="badge-warn">{nMismatch} mismatching SC · {nBitErr} bit errors</span>}
      </div>
      {rows.length > 0 && (
        <div style={{maxHeight:160, overflow:'auto', border:'1px solid var(--line)', borderRadius:4}}>
          <table className="mac-tbl" style={{fontSize:11}}>
            <thead><tr><th>k</th><th>A</th><th>B</th><th>bit Δ</th></tr></thead>
            <tbody>
              {rows.slice(0, 200).map(r => (
                <tr key={r.k}>
                  <td>{r.k}</td>
                  <td style={{color:'var(--ink)'}}>{r.va}</td>
                  <td style={{color:'var(--red)'}}>{r.vb}</td>
                  <td style={{color:'var(--orange)'}}>{r.diffBits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
window.PerSCBitsDiffViz = PerSCBitsDiffViz;

// 5. ZeroPadVsResampleViz — Static educational comparison of zero-pad IFFT
// vs polyphase resample for OFDM up-sampling. Uses a fixed sinc/spectral
// model for quick visualization.
function ZeroPadVsResampleViz({ p }) {
  const W = 460, H = 180;
  // Simple analytical PSDs:
  //   Zero-pad: sinc^2 envelope around DC, slow rolloff.
  //   Polyphase: ideal brick-wall passband followed by stopband.
  function plotPSD(getDB, label, color) {
    const pts = [];
    for (let x = 0; x < W; x++) {
      const f = (x / W - 0.5) * 2;        // -1..+1 normalised
      const dB = getDB(f);
      const y = H - 16 - ((dB + 60) / 60) * (H - 30);
      pts.push([x, Math.min(H-4, Math.max(4, y))]);
    }
    const path = pts.map((pt, i) => (i===0 ? 'M' : 'L') + pt[0] + ',' + pt[1]).join(' ');
    return (
      <svg width={W} height={H} style={{background:'#fafcff', border:'1px solid var(--line)', borderRadius:4}}>
        <path d={path} stroke={color} strokeWidth="2" fill="none"/>
        <text x={4} y={12} fontSize="10" fill={color} fontWeight={600}>{label}</text>
        <text x={W-4} y={H-3} fontSize="9" textAnchor="end" fill="var(--ink-muted)">−1.0   0   +1.0   (f / Fs/2)</text>
        <text x={4} y={H-3} fontSize="9" fill="var(--ink-muted)">−60 dB</text>
        <line x1={W/2} y1={4} x2={W/2} y2={H-16} stroke="var(--line)" strokeDasharray="2 3"/>
      </svg>
    );
  }
  const zpDB = f => {
    if (Math.abs(f) > 0.5) return -50 - Math.abs(f-0.5)*30;     // rolloff
    const x = f * 4;
    return x === 0 ? 0 : 20 * Math.log10(Math.abs(Math.sin(Math.PI*x)/(Math.PI*x)));
  };
  const ppDB = f => Math.abs(f) <= 0.5 ? 0 : -55;

  return (
    <div className="panel">
      <h2><span className="num">◊</span> Zero-Pad IFFT vs. Polyphase Resample
        <span className="desc">PSD comparison · Python uses zero-pad for simplicity (NFFT=6144 for all BWs at Fs=480 MHz)</span>
      </h2>
      <div style={{display:'flex', gap:14, flexWrap:'wrap'}}>
        {plotPSD(zpDB, 'Zero-pad IFFT (Python convention)', '#2563eb')}
        {plotPSD(ppDB, 'Polyphase upsample + brick-wall', '#0ea5b7')}
      </div>
      <div style={{marginTop:10, fontSize:11, color:'var(--ink-dim)', lineHeight:1.55, maxWidth:920}}>
        <b style={{color:'var(--ink)'}}>Zero-pad</b>: append zeros in the frequency domain → IFFT → bandlimited
        interpolation. Perfect math (no aliasing, no group delay) but the rectangular zero-band has a sharp
        spectral mask only if you don't apply any further filtering. Used by `ofdm_mod.py` for all BW.
        <br/>
        <b style={{color:'var(--ink)'}}>Polyphase</b>: upsample by L → FIR brick-wall at Fs/(2L) → output. Steeper
        out-of-band rolloff, but introduces filter group delay and design effort. Real-world DACs typically use
        a low-order CIC + polyphase chain.
      </div>
    </div>
  );
}
window.ZeroPadVsResampleViz = ZeroPadVsResampleViz;

// =====================================================================
// ScramblerSeedRecoveryViz — explains how the receiver recovers the 11-bit
// scrambler init seed from the SERVICE field bits, given that scrambling is
// just XOR with the LFSR output sequence.
//
// Key insight (per IEEE 802.11be-2024 §36.3.13.2 + Table 36-1):
//   • SERVICE = 16 zero bits, prepended to the data stream BEFORE scrambling.
//   • Because XOR with 0 is identity, the scrambled SERVICE bits are exactly
//     the first 16 PN-output bits of the LFSR.
//   • By spec convention the very first PN bit equals the LSB of the seed,
//     the second PN bit equals bit 1 of the seed, …, and the eleventh PN bit
//     equals bit 10 (MSB) of the seed.
//   • So the receiver reads scrambled[0..10] and treats them as an LSB-first
//     11-bit integer to recover the seed verbatim.
// =====================================================================

function ScramblerSeedRecoveryViz({ p }) {
  const [seed, setSeed] = useState8(p.ScramblerInit || 93);
  const seedClamped = Math.max(1, Math.min(2047, seed | 0));

  // Run the spec LFSR forward for 16 steps (input = 16 zeros = SERVICE).
  // Output = reg[10] = X11; feedback = reg[8] ^ reg[10]; shift right with fb at reg[0].
  const reg = new Uint8Array(11);
  for (let i = 0; i < 11; i++) reg[i] = (seedClamped >> (10 - i)) & 1;
  const pn = [];
  for (let n = 0; n < 16; n++) {
    pn.push(reg[10]);
    const fb = reg[8] ^ reg[10];
    for (let i = 10; i > 0; i--) reg[i] = reg[i - 1];
    reg[0] = fb;
  }
  // The first 11 PN bits, interpreted LSB-first, must equal the seed.
  let recovered = 0;
  for (let k = 0; k < 11; k++) recovered |= pn[k] << k;
  const ok = recovered === seedClamped;

  return (
    <div className="panel">
      <h2><span className="num">⏎</span> SERVICE field & seed recovery
        <span className="desc">
          §36.3.13.2 · Table 36-1 · how the receiver finds the scrambler init seed without it ever being transmitted explicitly
        </span>
      </h2>

      <div style={{display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', marginBottom:14, fontSize:13, fontFamily:'JetBrains Mono, monospace'}}>
        <label>Tx seed (1..2047):
          <input type="number" min="1" max="2047" value={seedClamped}
            onChange={e => setSeed(Math.max(1, Math.min(2047, +e.target.value || 1)))}
            style={{width:90, marginLeft:8, padding:'4px 8px', border:'1px solid var(--line)', borderRadius:4}}/>
        </label>
        <span style={{color:'var(--ink-dim)'}}>
          binary: <code style={{color:'var(--accent)'}}>{seedClamped.toString(2).padStart(11, '0')}</code>
          {' '}· hex: <code style={{color:'var(--accent)'}}>0x{seedClamped.toString(16).padStart(3, '0').toUpperCase()}</code>
        </span>
      </div>

      <div style={{background:'var(--bg2)', border:'1px solid var(--line)', borderRadius:6, padding:'12px 14px', marginBottom:14, fontSize:12, lineHeight:1.6, color:'var(--ink-dim)'}}>
        <b style={{color:'var(--ink)'}}>Tx side</b>: SERVICE = 16 zero bits is concatenated before the PSDU,
        then the whole bit stream is XORed with the 11-bit PN sequence
        S(x) = x¹¹ + x⁹ + 1 driven by the seed. Since 0 ⊕ x = x, the
        scrambled SERVICE bits are identically the first 16 PN bits.
        {' '}<b style={{color:'var(--ink)'}}>Rx side</b>: after FFT + LDPC decode, the receiver knows the
        SERVICE bits should have been zero, so it simply reads the first
        16 descrambler-input bits as the PN sequence — no separate seed
        signalling is needed.
      </div>

      <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:'10px 14px', fontFamily:'JetBrains Mono, monospace', fontSize:12, marginBottom:14}}>
        <div style={{color:'var(--ink-muted)'}}>scrambled SERVICE = first 16 PN bits</div>
        <div>
          {pn.map((b, i) => (
            <span key={i} style={{
              display:'inline-block', minWidth:18, padding:'2px 4px', margin:'0 2px',
              textAlign:'center', borderRadius:3,
              background: i < 11 ? '#dfe9ff' : 'var(--bg2)',
              color: i < 11 ? 'var(--accent)' : 'var(--ink-dim)',
              border:'1px solid ' + (i < 11 ? 'var(--accent)' : 'var(--line)'),
              fontWeight: i < 11 ? 700 : 400
            }}>{b}</span>
          ))}
        </div>
        <div style={{color:'var(--ink-muted)'}}>read PN[0..10] LSB-first → seed</div>
        <div>
          PN[0..10] = [{pn.slice(0, 11).join(', ')}]
          {' '}→ <code style={{color:'var(--accent)', fontWeight:700}}>{recovered}</code>
          {' '}({ok ? <span style={{color:'var(--green)'}}>✓ matches Tx seed</span>
                    : <span style={{color:'var(--red)'}}>✗ MISMATCH (port bug)</span>})
        </div>
        <div style={{color:'var(--ink-muted)'}}>descrambling</div>
        <div>
          identical to scrambling (XOR with the same PN regenerated from the
          recovered seed). Self-inverse, no separate Rx hardware.
        </div>
      </div>

      <div style={{fontSize:11, color:'var(--ink-muted)', lineHeight:1.55}}>
        Reference: IEEE 802.11be-2024 §36.3.13.2 (data scrambler), Table 36-1
        (SCRAMBLER_INITIAL_VALUE ↔ first scrambling bit), Eq. 36-46 (polynomial),
        Fig. 36-50 (LFSR diagram). Python: <code>ref/wifi7-python/modulation/scrambler.py</code>.
      </div>
    </div>
  );
}
window.ScramblerSeedRecoveryViz = ScramblerSeedRecoveryViz;

function VSAErrorSummaryViz({ p }) {
  const c = window.EHT.compute(p);
  const rows = [
    ['EVM RMS',          '−40.0',      'dB',      '(simulated; depends on impairments)'],
    ['EVM Peak',         '−32.0',      'dB',      '(simulated)'],
    ['Frequency Error',  '0.000',      'kHz',     '(0 ppm carrier offset)'],
    ['Symbol Clk Error', '0.0',        'ppm',     '(perfect timing)'],
    ['IQ Origin Offset', '−60.0',      'dBc',     '(no LO leakage)'],
    ['IQ Quad Error',    '0.0',        'deg',     '(perfect quadrature)'],
    ['IQ Gain Imbalance','0.0',        'dB',      '(perfect IQ balance)'],
    ['CCDF @ 1e−3',      'PAPR ≈ 11.5','dB',      '(typical for high-MCS OFDM)']
  ];
  return (
    <div className="panel">
      <h2><span className="num">ε</span> VSA Error Summary
        <span className="desc">Synthetic — for live measurements use a real spectrum analyzer / VSA</span>
      </h2>
      <table className="mac-tbl">
        <thead><tr><th>Metric</th><th style={{textAlign:'right'}}>Value</th><th>Unit</th><th>Note</th></tr></thead>
        <tbody>
          {rows.map(([m, v, u, n]) => (
            <tr key={m}>
              <td className="field-name">{m}</td>
              <td style={{textAlign:'right'}}>{v}</td>
              <td style={{color:'var(--ink-muted)'}}>{u}</td>
              <td style={{color:'var(--ink-dim)', fontFamily:'-apple-system, sans-serif'}}>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
window.VSAErrorSummaryViz = VSAErrorSummaryViz;
