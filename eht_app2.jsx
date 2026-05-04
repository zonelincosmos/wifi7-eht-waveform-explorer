// EHT Waveform Explorer — part 2: MAC, subcarrier, constellation, CRC
const { useState: useState2, useEffect: useEffect2, useRef: useRef2, useMemo: useMemo2 } = React;

// ------------- A-MPDU / MPDU structure -------------
// PSDU = pre-EOF region (NumMPDUs real subframes) + EOF-padding delimiters.
// Per IEEE 802.11-2024 §10.12.7 + Python ref/wifi7-python/utils/ampdu.py:
//
//   subframe_i = delim(4) + MAC_hdr(26) + chunk_i + FCS(4) + align_pad_i (0..3)
//   APEP_LENGTH (cfg.PayloadBytes) is the TARGET pre-EOF size; build_ampdu
//   may produce slightly smaller real subframes if alignment forces shorter
//   chunks. The 0..3·N "alignment slack" gets absorbed at the start of the
//   EOF-padding region.
//
// For canonical (APEP=5000, NumMPDUs auto-bumps to 2 because ⌈(5000−4)/4102⌉=2):
//   Subframe 1 = 4+26+2461+4+1 = 2496 B (verified via build_ampdu)
//   Subframe 2 = 4+26+2461+4+1 = 2496 B
//   Real region = 4992 B, EOF region = 1136 B = 284 delims, PSDU = 6128. ✓
//   N_PAD_MAC_bytes (Eq. 36-66) = 1128 B = 282 delims; the 8-byte alignment
//   slack on top is implementation overhead, still inside the EOF region.
function MPDUView({c}) {
  const numMpdus  = c.NumMPDUs || 1;
  // Approximate per-subframe sizes assuming chunks are equally split and no
  // alignment overhead (matches the spec formula PSDU = APEP + N_PAD_MAC_bytes).
  // The actual byte map produced by build_ampdu may shift 0..3 bytes per
  // subframe into the EOF region, but the totals are invariant.
  const chunkApprox  = Math.floor(c.APEP / numMpdus) - 4 - 26 - 4;       // body per subframe
  const subframeApprox = c.APEP / numMpdus;                              // bytes per subframe
  const eofBytes  = c.N_PAD_MAC_bytes;
  const eofCount  = Math.max(0, Math.floor(eofBytes / 4));

  return (
    <div className="panel">
      <h2><span className="num">6</span>A-MPDU / MPDU Structure
        <span className="desc">— IEEE 802.11-2024 §10.12.7 · PSDU = {numMpdus} real subframe{numMpdus>1?'s':''} + EOF-padding delimiters · NumMPDUs auto = ⌈(APEP−4)/4102⌉ = {Math.max(1, Math.ceil((c.APEP-4)/4102))}</span>
      </h2>

      {/* ============== ① Full A-MPDU = PSDU ============== */}
      <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:10, marginBottom:6}}>
        ① Full A-MPDU (= PSDU) · {c.PSDU_bytes.toLocaleString()} B
      </div>
      <div className="bigbar" style={{height:80}}>
        {Array.from({length: numMpdus}).map((_, i) => (
          <div key={i} className="bigbar-seg" style={{
            flex:`${subframeApprox} 0 0`, minWidth:120,
            background: i % 2 === 0 ? '#3b82f6' : '#2563eb'
          }}>
            <div className="nm">Subframe {i+1}</div>
            <div className="du">≈ {subframeApprox.toLocaleString()} B</div>
          </div>
        ))}
        {eofBytes > 0 && (
          <div className="bigbar-seg" style={{flex:`${eofBytes} 0 0`, background:'#fb923c', minWidth:120,
              backgroundImage:'repeating-linear-gradient(45deg, #fb923c, #fb923c 6px, #f97316 6px, #f97316 12px)'}}>
            <div className="nm">EOF-padding region</div>
            <div className="du">{eofBytes.toLocaleString()} B · {eofCount} delim × 4 B</div>
          </div>
        )}
      </div>
      <div className="bigbar-legend">
        <span><span className="sw" style={{background:'#3b82f6'}}></span>Real subframe — carries one MPDU + alignment pad</span>
        <span><span className="sw" style={{background:'#fb923c'}}></span>EOF-padding delim — Length=0, EOF=1, fixed bytes <code>01 00 9E 4E</code></span>
      </div>
      <div style={{fontSize:11, color:'var(--ink-muted)', marginTop:6, fontFamily:'JetBrains Mono, monospace'}}>
        PSDU = APEP_LENGTH + N_PAD_MAC_bytes = {c.APEP.toLocaleString()} + {eofBytes.toLocaleString()} = {c.PSDU_bytes.toLocaleString()} B ✓
        {numMpdus > 1 && (
          <span style={{color:'var(--ink-muted)'}}>
            {'  '}· each subframe ≈ APEP / NumMPDUs = {subframeApprox.toLocaleString()} B
          </span>
        )}
      </div>

      {/* ============== ② Zoom on one real subframe ============== */}
      <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:18, marginBottom:6}}>
        ② Zoom — one real subframe (≈ {subframeApprox.toLocaleString()} B for NumMPDUs={numMpdus})
      </div>
      <div className="bigbar">
        <div className="bigbar-seg" style={{flex:'4 0 0', background:'#db5a8a', minWidth:60}}>
          <div className="nm">Delim</div><div className="du">4 B</div>
        </div>
        <div className="bigbar-seg" style={{flex:'26 0 0', background:'#7c5ce0', minWidth:90}}>
          <div className="nm">MAC Header</div><div className="du">26 B</div>
        </div>
        <div className="bigbar-seg" style={{flex:`${chunkApprox} 1 0`, background:'#60a5fa', minWidth:120}}>
          <div className="nm">Frame Body (user data chunk)</div><div className="du">≈ {chunkApprox.toLocaleString()} B</div>
        </div>
        <div className="bigbar-seg" style={{flex:'4 0 0', background:'#22c55e', minWidth:60}}>
          <div className="nm">FCS</div><div className="du">4 B</div>
        </div>
      </div>
      <div className="bigbar-legend">
        <span><span className="sw" style={{background:'#db5a8a'}}></span>Real-subframe Delim — Length = (MAC+body+FCS), EOF = 0, CRC-8, Sig <code>0x4E</code></span>
        <span><span className="sw" style={{background:'#22c55e'}}></span>FCS — CRC-32 over MAC header + body</span>
      </div>
      <div style={{fontSize:11, color:'var(--ink-muted)', marginTop:6, fontFamily:'JetBrains Mono, monospace', lineHeight:1.55}}>
        Body chunk ≈ ⌊APEP / NumMPDUs⌋ − 34 = ⌊{c.APEP.toLocaleString()} / {numMpdus}⌋ − 34 = {chunkApprox.toLocaleString()} B per subframe.
        <br/>
        <span style={{color:'var(--ink-muted)'}}>
          Real <code>build_ampdu</code> output may differ by 0..3 bytes per subframe due to 4-byte alignment of (delim+MPDU);
          for canonical APEP=5000/NumMPDUs=2 the actual chunks are 2461 B + 1 B align = 2496 B per subframe (verified vs.
          ref/wifi7-python). The 8-byte slack accumulates into the EOF region.
        </span>
      </div>

      <h3 style={{fontSize:13, color:'var(--accent)', margin:'18px 0 8px', fontWeight:600}}>A-MPDU Delimiter — 32 bits</h3>
      <div className="bits">
        {DELIM_BITS.map((b,i)=>(
          <div className="bit" key={i} style={{flex:1, minWidth:90}}>
            <span className="bn">{b.b}</span>
            <div className="bv" style={{color:'var(--accent2)', fontSize:12}}>{b.name}</div>
            <div style={{color:'var(--green)', fontSize:11}}>{b.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------- MAC Header bit-by-bit -------------
function MACHeaderView() {
  return (
    <div className="panel">
      <h2><span className="num">7</span>MAC Header — 26 bytes (3-address QoS Data, ToDS=1) <span className="desc">— LSByte-first per field</span></h2>
      <table className="mac-tbl">
        <thead><tr><th>Off</th><th>Size</th><th>Field</th><th>Value (hex)</th><th>Description</th></tr></thead>
        <tbody>
          {MAC_HEADER.map((f,i)=>(
            <tr key={i}>
              <td>{f.off}</td>
              <td>{f.size}</td>
              <td className="field-name">{f.name}</td>
              <td className="hex">{f.val}</td>
              <td style={{color:'var(--ink-dim)', fontFamily:'inherit'}}>{f.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{fontSize:13, color:'var(--accent)', margin:'18px 0 8px', fontWeight:600}}>Frame Control — 16 bits (0x88 0x01)</h3>
      <div className="bits" style={{flexWrap:'wrap'}}>
        {FC_BITS.map((b,i)=>(
          <div className="bit" key={i} style={{flex:'1 1 80px'}}>
            <span className="bn">{b.b}</span>
            <div style={{color:'var(--accent2)', fontSize:11}}>{b.name}</div>
            <div className="bv" style={{color:'var(--green)'}}>{b.val}</div>
            <div style={{fontSize:10, color:'var(--ink-muted)'}}>{b.dec}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------- Subcarrier Map -------------
function SubcarrierMap({c, p}) {
  const ref = useRef2(null);
  useEffect2(()=>{
    const cv = ref.current; if (!cv) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const NSR = c.cfg.N_SR;
    const total = 2*NSR + 1;
    const padX = 30, padY = 10;
    const innerW = W - 2*padX, innerH = H - 2*padY;
    const dx = innerW / total;
    // Pilot indices (approx evenly spaced for visualization; real spec uses specific Ψ)
    const pilots = new Set();
    const np = c.N_SP;
    for (let i = 0; i < np; i++) {
      const k = Math.round(-NSR + (i+0.5)*(2*NSR/np));
      pilots.add(k);
    }
    // DC null: typically -2..+2 for full-BW (for 320 it's wider)
    const dcW = ({20:1,40:3,80:3,160:5,320:11})[p.BW] || 1;
    const dcSet = new Set();
    for (let k = -Math.floor(dcW/2); k <= Math.floor(dcW/2); k++) dcSet.add(k);
    // Guard: above NSR threshold
    for (let i = 0; i < total; i++) {
      const k = i - NSR;
      const x = padX + i*dx;
      const w = Math.max(1, dx);
      let color;
      if (Math.abs(k) > NSR) color = '#cbd5e1';
      else if (dcSet.has(k)) color = '#ef4444';
      else if (pilots.has(k)) color = '#eab308';
      else color = '#3b82f6';
      ctx.fillStyle = color;
      ctx.fillRect(x, padY, w-0.5, innerH);
    }
    // Axis ticks
    ctx.fillStyle = '#64748b';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    for (let k = -NSR; k <= NSR; k += Math.round(NSR/4)) {
      const x = padX + (k + NSR)*dx;
      ctx.fillRect(x, padY+innerH, 1, 4);
      ctx.fillText(k.toString(), x, padY+innerH+16);
    }
    // 0 marker
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(padX + NSR*dx - 0.5, padY, 1, innerH);
  }, [c, p]);
  return (
    <div className="panel">
      <h2><span className="num">8</span>Subcarrier Map <span className="desc">— BW = {p.BW} MHz · NFFT_native = {c.cfg.NFFT_native} (oversampled to {c.NFFT} @ 480 MHz) · ±N_SR = ±{c.cfg.N_SR}</span></h2>
      <div className="sc-canvas-wrap">
        <canvas ref={ref} width={1380} height={220} style={{width:'100%', height:220}} />
      </div>
      <div className="sc-legend">
        <span><span className="sw" style={{background:'#3b82f6'}}></span>Data SC ({c.N_SD.toLocaleString()})</span>
        <span><span className="sw" style={{background:'#eab308'}}></span>Pilot SC ({c.N_SP})</span>
        <span><span className="sw" style={{background:'#ef4444'}}></span>DC null</span>
        <span><span className="sw" style={{background:'#cbd5e1'}}></span>Guard</span>
      </div>
      <div className="detail" style={{marginTop:12}}>
        <div className="kv">
          <span className="k">N_ST (data + pilot)</span><span className="v">{c.N_ST.toLocaleString()}</span>
          <span className="k">N_SD,short (Table 36-46)</span><span className="v">{c.N_SDshort.toLocaleString()}</span>
          <span className="k">N_CBPS = N_SD × N_BPSCS</span><span className="v">{c.N_SD.toLocaleString()} × {c.N_BPSCS} = {c.N_CBPS.toLocaleString()}</span>
          <span className="k">N_DBPS = ⌊N_CBPS × R⌋</span><span className="v">⌊{c.N_CBPS.toLocaleString()} × {c.mcs.Rn}/{c.mcs.Rd}⌋ = {c.N_DBPS.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ------------- Constellation -------------
function Constellation({c}) {
  const ref = useRef2(null);
  const m = c.mcs;
  useEffect2(()=>{
    const cv = ref.current; if (!cv) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const cx = W/2, cy = H/2;
    // Draw axes
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy); ctx.moveTo(cx,0); ctx.lineTo(cx,H); ctx.stroke();
    // Compute side count
    const N = m.points;
    if (m.bpscs === 1) {
      // BPSK
      ctx.fillStyle = '#eab308';
      [-1,1].forEach(x => { ctx.beginPath(); ctx.arc(cx + x*W*0.3, cy, 5, 0, 6.28); ctx.fill(); });
    } else {
      const side = Math.round(Math.sqrt(N));
      const Kmod = 1 / Math.sqrt((N - 1) * 2 / 3);
      const pts = [];
      for (let i = 0; i < side; i++) {
        for (let j = 0; j < side; j++) {
          const I = (2*i - (side-1));
          const Q = (2*j - (side-1));
          pts.push([I*Kmod, Q*Kmod]);
        }
      }
      const scale = W * 0.42;
      const dotR = side > 32 ? 0.8 : (side > 8 ? 1.5 : 4);
      // Color gradient by index
      pts.forEach((pt, idx) => {
        const t = idx / pts.length;
        const r = Math.round(77 + 178*t);
        const g = Math.round(208 - 80*t);
        const b = Math.round(255 - 100*t);
        ctx.fillStyle = `rgba(${r},${g},${b},${side>32?0.5:0.9})`;
        ctx.beginPath();
        ctx.arc(cx + pt[0]*scale, cy - pt[1]*scale, dotR, 0, 6.28);
        ctx.fill();
      });
    }
    // Origin circle
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(cx, cy, W*0.42, 0, 6.28); ctx.stroke();
  }, [c]);
  return (
    <div className="panel">
      <h2><span className="num">9</span>Constellation — {m.name} <span className="desc">— {m.bpscs} bits/SC, {m.points.toLocaleString()} points</span></h2>
      <div style={{display:'flex', gap:18, alignItems:'center'}}>
        <canvas ref={ref} className="const" width={380} height={380} style={{flex:'0 0 380px'}} />
        <div style={{flex:1}}>
          <div className="grid2">
            <div className="stat">
              <div className="label">Modulation</div><div className="num-mid">{m.name}</div>
            </div>
            <div className="stat">
              <div className="label">Code rate R</div><div className="num-mid">{m.Rn}/{m.Rd} = {(m.Rn/m.Rd).toFixed(4)}</div>
            </div>
            <div className="stat">
              <div className="label">Bits per SC (N_BPSCS)</div><div className="num-mid">{m.bpscs}</div>
            </div>
            <div className="stat">
              <div className="label">Points</div><div className="num-mid">{m.points.toLocaleString()}</div>
            </div>
            <div className="stat">
              <div className="label">K_mod (norm)</div><div className="num-mid">{m.bpscs>1 ? (1/Math.sqrt((m.points-1)*2/3)).toFixed(5) : '1.00000'}</div>
            </div>
            <div className="stat">
              <div className="label">Min EVM dB (theoretical)</div><div className="num-mid">{m.bpscs>=10 ? '−47…−35' : (m.bpscs===8 ? '−32' : '−25 or better')}</div>
            </div>
          </div>
          <div className="detail" style={{marginTop:14}}>
            For 4096-QAM: spacing between points is so dense that a 47 dB EVM only just leaves enough margin —
            a single dB of phase noise or non-linearity sinks the link. That's why MCS 12/13 are reserved for
            the cleanest channels and shortest ranges.
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------- CRC list -------------
function CRCView() {
  return (
    <div className="panel">
      <h2><span className="num">A</span>Five layers of CRC / Parity in one EHT MU PPDU</h2>
      <div className="crc-list">
        {CRC_LIST.map((cr,i)=>(
          <div className="crc-item" key={i}>
            <div style={{minWidth:30, color:'var(--accent)', fontWeight:700}}>#{i+1}</div>
            <div className="name">{cr.name}</div>
            <div className="algo">{cr.width} · {cr.algo}</div>
            <div className="scope">scope: {cr.scope}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------- MCS reference table -------------
function MCSTable({p}) {
  const Tsym = 12.8 + p.GI; // µs per OFDM symbol
  return (
    <div className="panel">
      <h2><span className="num">B</span>MCS rate table <span className="desc">— single-stream rate (Mbps) @ NSS=1, GI={p.GI} µs (T_sym = {Tsym.toFixed(1)} µs)</span></h2>
      <table className="mcs-tbl">
        <thead><tr><th style={{textAlign:'left'}}>MCS</th><th style={{textAlign:'left'}}>Mod</th><th>R</th><th>20 MHz</th><th>40 MHz</th><th>80 MHz</th><th>160 MHz</th><th>320 MHz</th></tr></thead>
        <tbody>
          {MCS.map(m => {
            const cur = m.idx === p.MCS;
            const cells = [20,40,80,160,320].map(bw => {
              const NSD = BW_CFG[bw].N_SD;
              const NDBPS = Math.floor(NSD * m.bpscs * m.Rn / m.Rd);
              const rate = (NDBPS / Tsym).toFixed(1);
              return (
                <td key={bw} style={{color: bw===p.BW && cur ? 'var(--accent)' : (bw===p.BW?'var(--accent2)':'inherit')}}>
                  {rate}
                </td>
              );
            });
            return (
              <tr key={m.idx} className={cur?'cur':''}>
                <td style={{textAlign:'left'}}>{m.idx}</td>
                <td style={{textAlign:'left'}}>{m.name}</td>
                <td>{m.Rn}/{m.Rd}</td>
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{fontSize:11, color:'var(--ink-muted)', marginTop:8}}>
        Each cell = single-stream rate in Mbps @ GI={p.GI}µs. Highlighted column = current BW. Yellow row = current MCS.
      </div>
    </div>
  );
}

window.MPDUView = MPDUView;
window.MACHeaderView = MACHeaderView;
window.SubcarrierMap = SubcarrierMap;
window.Constellation = Constellation;
window.CRCView = CRCView;
window.MCSTable = MCSTable;
