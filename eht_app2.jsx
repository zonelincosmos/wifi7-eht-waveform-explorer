// EHT Waveform Explorer — part 2: MAC, subcarrier, constellation, CRC
const { useState: useState2, useEffect: useEffect2, useRef: useRef2, useMemo: useMemo2 } = React;

// ------------- A-MPDU / MPDU structure -------------
// APEP_LENGTH covers the entire pre-EOF region of the PSDU. For NumMPDUs=1
// (S-MPDU, default) one real subframe fills it:
//   APEP = Delim(4) + MAC_hdr(26) + Body + FCS(4)   ⇒  Body = APEP − 34
// PSDU then appends EOF-padding delimiters (Length=0 / EOF=1, 4 B each):
//   PSDU = APEP + N_PAD_MAC_bytes
// Canonical (APEP=5000) → Body=4966, EOF count = 1128/4 = 282, PSDU=6128. ✓
function MPDUView({c}) {
  const bodyLen   = c.APEP - 4 - 26 - 4;            // = APEP − 34
  const eofBytes  = c.N_PAD_MAC_bytes;              // EOF-padding region size in bytes
  const eofCount  = Math.max(0, Math.floor(eofBytes / 4));
  return (
    <div className="panel">
      <h2><span className="num">6</span>A-MPDU / MPDU Structure
        <span className="desc">— IEEE 802.11-2024 §10.12.7 · PSDU = real subframe(s) + EOF-padding delimiters · two zoom levels below</span>
      </h2>

      {/* ============== Top bar: full A-MPDU = the entire PSDU ============== */}
      <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:10, marginBottom:6}}>
        ① Full A-MPDU (= PSDU) · {c.PSDU_bytes.toLocaleString()} B
      </div>
      <div className="bigbar" style={{height:80}}>
        <div className="bigbar-seg" style={{flex:`${c.APEP} 0 0`, background:'#3b82f6', minWidth:140}}>
          <div className="nm">Real subframe{c.NumMPDUs > 1 ? `s × ${c.NumMPDUs}` : ''}</div>
          <div className="du">{c.APEP.toLocaleString()} B = APEP_LENGTH</div>
        </div>
        {eofBytes > 0 && (
          <div className="bigbar-seg" style={{flex:`${eofBytes} 0 0`, background:'#fb923c', minWidth:120,
              backgroundImage:'repeating-linear-gradient(45deg, #fb923c, #fb923c 6px, #f97316 6px, #f97316 12px)'}}>
            <div className="nm">EOF-padding region</div>
            <div className="du">{eofBytes.toLocaleString()} B · {eofCount} delim × 4 B</div>
          </div>
        )}
      </div>
      <div className="bigbar-legend">
        <span><span className="sw" style={{background:'#3b82f6'}}></span>Real subframe(s) — carry actual MPDU(s)</span>
        <span><span className="sw" style={{background:'#fb923c'}}></span>EOF-padding delim — Length=0, EOF=1, fixed bytes <code>01 00 9E 4E</code></span>
      </div>
      <div style={{fontSize:11, color:'var(--ink-muted)', marginTop:6, fontFamily:'JetBrains Mono, monospace'}}>
        PSDU = APEP_LENGTH + N_PAD_MAC_bytes = {c.APEP.toLocaleString()} + {eofBytes.toLocaleString()} = {c.PSDU_bytes.toLocaleString()} B ✓
      </div>

      {/* ============== Zoom: one real subframe = delim + MPDU ============== */}
      <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:18, marginBottom:6}}>
        ② Zoom — one real subframe ({c.APEP.toLocaleString()} B for NumMPDUs=1, splits when NumMPDUs &gt; 1)
      </div>
      <div className="bigbar">
        <div className="bigbar-seg" style={{flex:'4 0 0', background:'#db5a8a', minWidth:60}}>
          <div className="nm">Delim</div><div className="du">4 B</div>
        </div>
        <div className="bigbar-seg" style={{flex:'26 0 0', background:'#7c5ce0', minWidth:90}}>
          <div className="nm">MAC Header</div><div className="du">26 B</div>
        </div>
        <div className="bigbar-seg" style={{flex:`${bodyLen} 1 0`, background:'#60a5fa', minWidth:120}}>
          <div className="nm">Frame Body (user data)</div><div className="du">{bodyLen.toLocaleString()} B</div>
        </div>
        <div className="bigbar-seg" style={{flex:'4 0 0', background:'#22c55e', minWidth:60}}>
          <div className="nm">FCS</div><div className="du">4 B</div>
        </div>
      </div>
      <div className="bigbar-legend">
        <span><span className="sw" style={{background:'#db5a8a'}}></span>Real-subframe Delim — Length = (MAC+body+FCS), EOF = 0, CRC-8, Sig <code>0x4E</code></span>
        <span><span className="sw" style={{background:'#22c55e'}}></span>FCS — CRC-32 over MAC header + body</span>
      </div>
      <div style={{fontSize:11, color:'var(--ink-muted)', marginTop:6, fontFamily:'JetBrains Mono, monospace'}}>
        Body = APEP − Delim(4) − MAC(26) − FCS(4) = {c.APEP.toLocaleString()} − 34 = {bodyLen.toLocaleString()} B
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
