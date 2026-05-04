// EHT Waveform Explorer — Part 4
// VIZ panels:
//   §14.18 tone-mapping-permutation (D_TM)
//   §14.18 pilot-polarity-clock (127-element + Ψ)
//   §17.6 constellation-explorer (Gray-code bit lookup)
//   §19.10 ampdu-byte-table
//   §20.3 crc8-stepper / crc32-stepper

const { useState: useS4, useEffect: useE4, useRef: useR4, useMemo: useM4 } = React;
const E4 = window.EHT;

// ============== Tone Mapping permutation ==============
function ToneMapViz({p}) {
  const ref = useR4(null);
  const BW = p.BW;
  const N_SD_l = (BW===20)?234:(BW===40?468:980);
  const tm = E4.ldpcToneMap(N_SD_l, BW);
  const D_TM = tm.D_TM;
  const [hover, setHover] = useS4(null);

  useE4(()=>{
    const cv = ref.current; if (!cv) return;
    const W=cv.width, H=cv.height;
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const padL=80, padR=20, padT=40, padB=40;
    const innerW = W-padL-padR, innerH=H-padT-padB;
    // top axis: logical k. bottom: physical t(k)
    ctx.font='11px JetBrains Mono, monospace';
    ctx.fillStyle='#64748b';
    ctx.fillText('logical k →', padL, padT-14);
    ctx.fillText('physical SC t(k) →', padL, H-padB+24);
    // draw lines
    for (let k=0;k<N_SD_l;k++){
      const tk = tm.perm[k];
      const x1 = padL + (k/(N_SD_l-1))*innerW;
      const x2 = padL + (tk/(N_SD_l-1))*innerW;
      const y1 = padT, y2 = H-padB;
      const isHi = hover!==null && (k===hover);
      ctx.strokeStyle = isHi ? '#ef4444' : `rgba(59,130,246,${k%D_TM===0?0.55:0.12})`;
      ctx.lineWidth = isHi ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }
    // dots
    ctx.fillStyle='#1e3a8a';
    for (let k=0;k<N_SD_l;k+=Math.max(1,Math.floor(N_SD_l/40))){
      const x = padL + (k/(N_SD_l-1))*innerW;
      ctx.beginPath(); ctx.arc(x,padT,2.4,0,6.28); ctx.fill();
    }
    ctx.fillStyle='#7c2d12';
    for (let i=0;i<N_SD_l;i+=Math.max(1,Math.floor(N_SD_l/40))){
      const x = padL + (i/(N_SD_l-1))*innerW;
      ctx.beginPath(); ctx.arc(x,H-padB,2.4,0,6.28); ctx.fill();
    }
  }, [BW, hover]);

  return (
    <div className="panel">
      <h2><span className="num">ζ</span>LDPC tone mapping <span className="desc">— Eq. 36-72 · D_TM = {D_TM} for BW={BW} · t(k) = D_TM·(k mod N/D_TM) + ⌊k·D_TM/N⌋</span></h2>
      <canvas ref={ref} width={1380} height={300} style={{width:'100%', height:300}}/>
      <div style={{display:'flex', gap:14, marginTop:10, alignItems:'center', flexWrap:'wrap'}}>
        <span style={{fontSize:11, color:'var(--ink-muted)'}}>highlight logical k:</span>
        <input type="range" min={0} max={N_SD_l-1} value={hover||0} onChange={e=>setHover(+e.target.value)}
          style={{flex:1, minWidth:200}}/>
        <span style={{fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontSize:13, fontWeight:700}}>
          k={hover||0} → t(k)={tm.perm[hover||0]}
        </span>
      </div>
      <div className="detail" style={{marginTop:10}}>
        Consecutive constellation symbols (which may share an LDPC codeword) get spread <b>{D_TM}</b> SCs apart in physical frequency.
        With ~78 kHz spacing that's ~{(D_TM*0.078).toFixed(1)} MHz between adjacent codeword bits — wide enough that typical fading patterns don't correlate them.
      </div>
    </div>
  );
}

// ============== Pilot Polarity Clock ==============
function PilotClockViz({c}) {
  // Symbol picker covers the whole PPDU — every preamble symbol + every Data
  // symbol gets its own polarity-sequence index per IEEE 802.11be-2024 Eq. 36-87.
  const N_EHT_SIG = 2;                              // canonical (EHT_SIG_MCS=0 → 2 syms)
  const N_SYM_DATA = c.N_SYM;                       // number of Data OFDM symbols
  // Build symbol list with their polarity-sequence index assignment.
  const symList = [
    { tag:'L-SIG',     idx:0 },
    { tag:'RL-SIG',    idx:1 },
    { tag:'U-SIG-1',   idx:2 },
    { tag:'U-SIG-2',   idx:3 },
  ];
  for (let i = 0; i < N_EHT_SIG; i++) symList.push({ tag:`EHT-SIG-${i+1}`, idx: 4 + i });
  for (let i = 0; i < N_SYM_DATA; i++) symList.push({ tag:`Data #${i}`,    idx: 4 + N_EHT_SIG + i });

  const [pickIdx, setPickIdx] = useS4(4 + N_EHT_SIG);   // default: first Data symbol
  // Find the row matching pickIdx, falling back to first row.
  const pickRow = symList.find(s => s.idx === pickIdx) || symList[0];
  const idxMod  = pickRow.idx % 127;
  const p_n     = E4.PILOT_POL_127[idxMod];

  // Pilot count per BW (Table 36-58)
  const pilotCount = c.N_SP;
  // For visual: show first 8 pilots (or all if fewer), with their pp index
  const showCount = Math.min(8, pilotCount);

  return (
    <div className="panel">
      <h2><span className="num">η</span>Pilot polarity sequence
        <span className="desc">— IEEE 802.11-2020 §17.3.5.10 (127-element p_n) · IEEE 802.11be-2024 §36.3.13.11 + Eq. 36-87 (per-symbol pilot values)</span>
      </h2>

      <div className="detail" style={{marginBottom:16, background:'var(--bg2)', border:'1px solid var(--line)'}}>
        <strong>Why pilots?</strong> {pilotCount} of the {c.N_ST.toLocaleString()} active subcarriers carry a <em>known</em> ±1 value so
        the receiver can track residual carrier-frequency offset and phase noise across each OFDM symbol.
        <br/>
        <strong>Pilot value formula</strong> (Eq. 36-87): &nbsp;<code style={{color:'var(--accent)', fontWeight:700}}>
          pilot<sub>pp</sub>[n] = p<sub>n</sub> &nbsp;×&nbsp; Ψ<sub>(n + pp) mod 8</sub>
        </code>
        &nbsp;— two independent ±1 factors, one per symbol (anti-replay) and one per pilot subcarrier.
      </div>

      {/* ============== Step 1: pick which OFDM symbol ============== */}
      <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>
        ① Pick a symbol — every preamble + Data symbol gets its own slot in the sequence
      </div>
      <div style={{display:'flex', gap:4, flexWrap:'wrap', marginBottom:14}}>
        {symList.map(s => (
          <button key={s.idx} onClick={()=>setPickIdx(s.idx)} style={{
            padding:'6px 10px', borderRadius:5, fontSize:11,
            background: s.idx === pickIdx ? 'var(--accent)' : 'var(--bg2)',
            color:    s.idx === pickIdx ? '#fff'           : 'var(--ink-dim)',
            border:`1px solid ${s.idx === pickIdx ? 'var(--accent)' : 'var(--line)'}`,
            cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600
          }}>{s.tag} <span style={{opacity:0.7}}>· n={s.idx}</span></button>
        ))}
      </div>

      {/* ============== Step 2: look up p_n in the 127-element strip ============== */}
      <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>
        ② Look up p<sub>n</sub> in the 127-element polarity sequence (HE-inherited from §17.3.5.10)
      </div>
      <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:12, color:'var(--ink-dim)', marginBottom:6}}>
        index = n mod 127 = {pickRow.idx} mod 127 = <b style={{color:'var(--green)'}}>{idxMod}</b>
      </div>
      <div style={{display:'flex', gap:1, height:34, padding:2, background:'var(--bg2)', border:'1px solid var(--line)', borderRadius:6, overflow:'hidden'}}>
        {E4.PILOT_POL_127.map((v,i)=>(
          <div key={i} title={`idx ${i} = ${v>0?'+1':'−1'}`} style={{
            flex:'1 1 0', minWidth:5,
            background: i === idxMod ? '#ef4444' : (v > 0 ? '#3b82f6' : '#94a3b8'),
            border: i === idxMod ? '2px solid #b91c1c' : 'none',
            boxSizing:'border-box'
          }}/>
        ))}
      </div>
      <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:14, color:'var(--ink)', marginTop:8, fontWeight:600}}>
        p<sub>n</sub> = <span style={{color:'#ef4444'}}>{p_n > 0 ? '+1' : '−1'}</span>
        <span style={{fontSize:11, color:'var(--ink-muted)', fontWeight:400, marginLeft:10}}>
          (red bar = current symbol · blue = +1 · grey = −1)
        </span>
      </div>

      {/* ============== Step 3: per-pilot Ψ rotation ============== */}
      <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:18, marginBottom:6}}>
        ③ Per-pilot Ψ rotation — Ψ = [+1, +1, +1, −1, −1, +1, +1, +1] cycles every 8 pilots (Eq. 27-104)
      </div>
      <div style={{display:'flex', gap:4, marginBottom:6}}>
        {E4.PSI_8.map((v,i)=>(
          <div key={i} style={{
            width:42, height:42, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            border:'1px solid var(--line)', borderRadius:6,
            background: v > 0 ? '#dbeafe' : '#fee2e2',
            color:    v > 0 ? '#1e40af' : '#b91c1c',
            fontFamily:'JetBrains Mono, monospace'
          }}>
            <div style={{fontSize:9, opacity:0.7}}>k={i}</div>
            <div style={{fontSize:14, fontWeight:700}}>{v > 0 ? '+1' : '−1'}</div>
          </div>
        ))}
      </div>

      {/* ============== Step 4: final pilot values for this symbol ============== */}
      <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:18, marginBottom:6}}>
        ④ Final pilot values for {pickRow.tag} (showing first {showCount} of {pilotCount} pilots — BW = {c.cfg && c.cfg.BW || c.N_20MHz*20} MHz)
      </div>
      <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
        {Array.from({length: showCount}).map((_, pp) => {
          const k = (pickRow.idx + pp) % 8;
          const psi = E4.PSI_8[k];
          const pilot = p_n * psi;
          return (
            <div key={pp} style={{
              minWidth:120, padding:'8px 10px', borderRadius:6,
              border:'1px solid var(--line)', background:'#fff',
              fontFamily:'JetBrains Mono, monospace', fontSize:11
            }}>
              <div style={{color:'var(--ink-muted)', fontSize:10}}>pilot pp = {pp}</div>
              <div style={{color:'var(--ink-dim)', marginTop:2}}>
                Ψ<sub>(n+pp) mod 8</sub> = Ψ<sub>{k}</sub> = <b style={{color: psi>0?'#1e40af':'#b91c1c'}}>{psi>0?'+1':'−1'}</b>
              </div>
              <div style={{marginTop:4, fontSize:14, fontWeight:700, color: pilot>0?'var(--green)':'var(--red)'}}>
                p<sub>n</sub> × Ψ = {pilot > 0 ? '+1' : '−1'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="detail" style={{marginTop:14, fontSize:11, lineHeight:1.6}}>
        <strong>Why advance per symbol?</strong> If a receiver mis-counts OFDM symbols (e.g. a glitch drops one), the pilot
        polarity will be wrong on subsequent symbols → the RX's channel estimator sees a sign-flip on every pilot and can flag
        the loss. So p<sub>n</sub> is both a phase reference AND a per-symbol counter.
        <br/>
        <strong>Why both p<sub>n</sub> and Ψ?</strong> Ψ varies pilot-to-pilot (frequency-domain whitening of pilot tones,
        prevents PAPR concentration). p<sub>n</sub> varies symbol-to-symbol (counter). Their product gives every (symbol, pilot)
        cell a deterministic ±1 value that's known to both TX and RX without explicit signalling.
      </div>
    </div>
  );
}

// ============== Constellation explorer (Gray-code bit lookup) ==============
function ConstellationExplorer({c}) {
  const m = c.mcs;
  const ref = useR4(null);
  const [pick, setPick] = useS4(null);
  const N = m.points;
  const side = m.bpscs===1?2:Math.round(Math.sqrt(N));
  const Kmod = m.bpscs===1?1:(1/Math.sqrt((N-1)*2/3));
  // Gray code helper
  const grayN = (n,bits)=>{
    const g = n ^ (n>>1);
    return g.toString(2).padStart(bits,'0');
  };
  const points = useM4(()=>{
    if (m.bpscs===1) return [{I:-1,Q:0,bits:'0'},{I:1,Q:0,bits:'1'}];
    const half = m.bpscs/2;
    const pts = [];
    for (let qi=0; qi<side; qi++){
      for (let ii=0; ii<side; ii++){
        const I = (2*ii-(side-1))*Kmod;
        const Q = (2*qi-(side-1))*Kmod;
        const ig = grayN(ii, half);
        const qg = grayN(qi, half);
        pts.push({I, Q, bits: ig+qg, ii, qi});
      }
    }
    return pts;
  }, [m]);

  useE4(()=>{
    const cv = ref.current; if (!cv) return;
    const W=cv.width, H=cv.height;
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const cx=W/2, cy=H/2;
    ctx.strokeStyle='rgba(0,0,0,0.08)';
    ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy); ctx.moveTo(cx,0); ctx.lineTo(cx,H); ctx.stroke();
    const scale = W*0.4;
    const dotR = side>32?1.2:(side>8?2.5:6);
    points.forEach((pt,i)=>{
      const sel = pick===i;
      ctx.fillStyle = sel?'#ef4444':`rgba(59,130,246,${side>32?0.6:0.85})`;
      ctx.beginPath();
      ctx.arc(cx+pt.I*scale, cy-pt.Q*scale, sel?5:dotR, 0, 6.28);
      ctx.fill();
    });
  }, [m, pick, points]);

  const handleClick = (e)=>{
    const cv = ref.current; if (!cv) return;
    const r = cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const W=cv.width, H=cv.height;
    const cx=W/2, cy=H/2, scale=W*0.4;
    let best=-1, bd=1e9;
    points.forEach((pt,i)=>{
      const px=cx+pt.I*scale, py=cy-pt.Q*scale;
      const d=(px-x)**2+(py-y)**2;
      if (d<bd){bd=d; best=i;}
    });
    if (bd<400) setPick(best);
  };
  const sel = pick!==null?points[pick]:null;
  return (
    <div className="panel">
      <h2><span className="num">θ</span>Constellation explorer <span className="desc">— IEEE 802.11be-2024 §36.3.13.5 · Table 36-51 · {m.name}, Gray-coded I and Q axes · click any point to see its bit pattern</span></h2>
      <div style={{display:'grid', gridTemplateColumns:'380px 1fr', gap:24}}>
        <canvas ref={ref} width={380} height={380} style={{cursor:'crosshair', border:'1px solid var(--line)', borderRadius:8}} onClick={handleClick}/>
        <div>
          {sel ? (
            <div>
              <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>selected point</div>
              <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:18, marginTop:6, color:'var(--accent)', fontWeight:700}}>
                bits = {sel.bits}
              </div>
              <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:13, color:'var(--ink-dim)', marginTop:4}}>
                I = {sel.I.toFixed(4)} &nbsp;Q = {sel.Q.toFixed(4)}
              </div>
              {m.bpscs>1 && (
                <div style={{marginTop:10, fontSize:12, color:'var(--ink-dim)', lineHeight:1.6}}>
                  First {m.bpscs/2} bits = I-axis Gray code; last {m.bpscs/2} bits = Q-axis Gray code. Adjacent constellation points differ by exactly one bit — a wrong neighbor decoded by the demodulator costs only 1 bit error, which is exactly what FEC was designed to clean up.
                </div>
              )}
            </div>
          ) : (
            <div style={{fontSize:13, color:'var(--ink-muted)'}}>Click any constellation point to see its bit pattern.</div>
          )}
          <div style={{marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <div className="hl-card"><div className="lab">N_BPSCS</div><div className="vv">{m.bpscs}</div></div>
            <div className="hl-card"><div className="lab">Points</div><div className="vv">{N.toLocaleString()}</div></div>
            <div className="hl-card"><div className="lab">K_mod</div><div className="vv" style={{fontSize:14}}>{Kmod.toFixed(5)}</div></div>
            <div className="hl-card"><div className="lab">Side count</div><div className="vv">{side}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== A-MPDU byte table ==============
function AMPDUBytesViz({c}) {
  const APEP     = c.APEP;
  const total    = c.PSDU_bytes;
  const numMpdus = c.NumMPDUs || 1;
  const layout   = c.ampdu_layout;        // exact byte map from compute()

  // build region map from the exact layout — one block per subframe segment.
  // The block shows {label, len_in_bytes, hex_or_note}; len is rendered
  // separately, so `hex` should describe content only (no byte count).
  const regions = [];
  layout.subframes.forEach((sf, i) => {
    const lab = numMpdus > 1 ? ` #${i+1}` : '';
    regions.push({ len:4,         color:'#fbcfe8', label:'Delim'+lab,      hex:'CRC-8 · Sig 0x4E' });
    regions.push({ len:26,        color:'#ddd6fe', label:'MAC Header'+lab, hex:'88 01 …' });
    regions.push({ len:sf.chunk,  color:'#bfdbfe', label:'Body'+lab,       hex:'user data' });
    regions.push({ len:4,         color:'#bbf7d0', label:'FCS'+lab,        hex:'CRC-32' });
    if (sf.align > 0) {
      regions.push({ len:sf.align, color:'#fef3c7', label:'align'+lab, hex:'0x00 …' });
    }
  });
  if (layout.eof_count > 0) {
    regions.push({ len: layout.eof_count*4, color:'#fed7aa',
                   label:`${layout.eof_count}× EOF Pad`, hex:'01 00 79 4E ×'+layout.eof_count });
  }
  if (layout.eof_tail > 0) {
    regions.push({ len: layout.eof_tail, color:'#fed7aa',
                   label:'tail', hex:'0xFF …' });
  }
  if (c.N_PAD_PHY_bits > 0) {
    regions.push({ len:0, color:'#fee2e2',
                   label:`+ ${c.N_PAD_PHY_bits}b PHY pad`, hex:'sub-byte' });
  }

  return (
    <div className="panel">
      <h2><span className="num">ι</span>A-MPDU byte layout <span className="desc">— IEEE 802.11-2024 §10.12.7 · all byte counts are exact (matches ref/wifi7-python build_ampdu)</span></h2>
      <div style={{display:'flex', gap:2, marginTop:10, height:80, borderRadius:8, overflow:'hidden', border:'1px solid var(--line)'}}>
        {regions.filter(r=>r.len>0).map((r,i)=>(
          <div key={i} title={`${r.len.toLocaleString()} bytes`} style={{
            flex:`${Math.max(r.len, total*0.02)} 0 0`,
            background:r.color, padding:'8px 10px',
            display:'flex', flexDirection:'column', justifyContent:'space-between',
            minWidth:60, borderRight:'1px solid rgba(0,0,0,0.08)'
          }}>
            <div style={{fontSize:11, fontWeight:700, color:'#1e293b'}}>{r.label}</div>
            <div style={{fontSize:10, fontFamily:'JetBrains Mono, monospace', color:'#475569'}}>
              <div>{r.len.toLocaleString()} B</div>
              <div style={{opacity:0.8}}>{r.hex}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, marginTop:14}}>
        <div className="hl-card"><div className="lab">APEP_LENGTH</div><div className="vv">{APEP.toLocaleString()}<span className="un">B</span></div></div>
        <div className="hl-card"><div className="lab">NumMPDUs</div><div className="vv">{numMpdus}</div></div>
        <div className="hl-card"><div className="lab">User data total</div><div className="vv">{layout.user_data_len.toLocaleString()}<span className="un">B</span></div></div>
        <div className="hl-card"><div className="lab">EOF delims</div><div className="vv">{layout.eof_count}</div></div>
        <div className="hl-card"><div className="lab">PSDU bytes</div><div className="vv">{total.toLocaleString()}<span className="un">B</span></div></div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        Per-subframe split (chunk + align bytes): {layout.subframes.map((sf, i) =>
          `#${i+1} = ${sf.chunk}+${sf.align}`).join(' · ')}.
        {' '}Real-subframes total {layout.total_real.toLocaleString()} + EOF region {layout.eof_bytes.toLocaleString()}
        {' '}({layout.eof_count} delim{layout.eof_tail>0?` + ${layout.eof_tail}-byte 0xFF tail`:''}) = {total.toLocaleString()} ✓
        <br/>
        <span style={{display:'block', marginTop:6, color:'var(--ink-muted)', fontSize:11}}>
          Note: APEP_LENGTH is the signalled <em>target</em> pre-EOF size; real-subframes region is
          {' '}{APEP - layout.total_real} smaller because each subframe must end on a 4-byte boundary and at least one EOF
          delim must follow. Eq. 36-66 N_PAD_MAC_bytes = {c.N_PAD_MAC_bytes.toLocaleString()};
          the {layout.eof_bytes - c.N_PAD_MAC_bytes}-byte gap is the alignment slack absorbed at the start of the EOF region.
        </span>
      </div>
    </div>
  );
}

// ============== CRC stepper (CRC-8 delim & CRC-32 FCS) ==============
function CRCStepperViz() {
  const [variant, setVariant] = useS4('crc8');
  const [input, setInput] = useS4('35EA');
  const bytes = useM4(()=>{
    const s = input.replace(/\s+/g,'').toLowerCase();
    const out = [];
    for (let i=0; i+1<s.length; i+=2){
      const v = parseInt(s.slice(i,i+2),16);
      if (!Number.isNaN(v)) out.push(v);
    }
    return out;
  }, [input]);
  let result, scopeDesc;
  if (variant==='crc8'){
    // 802.11 transmits LSB-first within each byte, so bits16[i] = bit i of byte (i>>3),
    // taking the LOW bit first.  This matches ref/wifi7-python/utils/ampdu.py:_build_delimiter
    // which does `[(word16 >> b) & 1 for b in range(16)]` over a word built byte0=LSByte.
    const bits = [];
    for (let i=0;i<2 && i<bytes.length;i++){
      for (let b=0;b<8;b++) bits.push((bytes[i]>>b)&1);
    }
    while (bits.length<16) bits.push(0);
    result = E4.crc8_amDelim(bits.slice(0,16));
    scopeDesc = 'A-MPDU delim B0–B15 (16 bits, LSB-first per byte) · poly 0x07, init 0xFF, final XOR 0xFF, output bit-reversed';
  } else {
    result = E4.crc32(bytes);
    scopeDesc = 'CRC-32/IEEE (reflected, poly 0xEDB88320, init/final 0xFFFFFFFF)';
  }
  return (
    <div className="panel">
      <h2><span className="num">κ</span>Interactive CRC <span className="desc">— CRC-8 delim §10.12.7 · CRC-32 FCS §10.3.4 (IEEE 802.11-2024) · type bytes, see the checksum compute live</span></h2>
      <div style={{display:'flex', gap:8, marginBottom:12}}>
        {[['crc8','CRC-8 (A-MPDU delim)'],['crc32','CRC-32 (MPDU FCS)']].map(([k,t])=>(
          <button key={k} onClick={()=>setVariant(k)} style={{
            padding:'7px 14px', fontSize:12, borderRadius:6,
            background: variant===k?'var(--accent)':'#fff', color:variant===k?'#fff':'var(--ink-dim)',
            border:`1px solid ${variant===k?'var(--accent)':'var(--line)'}`,
            cursor:'pointer', fontWeight:600
          }}>{t}</button>
        ))}
      </div>
      <label style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>input bytes (hex)</label>
      <input value={input} onChange={e=>setInput(e.target.value)}
        style={{display:'block', width:'100%', marginTop:6, padding:'10px 12px',
          fontFamily:'JetBrains Mono, monospace', fontSize:13,
          border:'1px solid var(--line)', borderRadius:6}}/>
      <div style={{display:'flex', gap:8, marginTop:8, flexWrap:'wrap'}}>
        {variant==='crc8' ? (
          <>
            <button onClick={()=>setInput('0100')} style={presetBtn()}>EOF delim B0–B15 (length=0,EOF=1) → expect 0x79</button>
            <button onClick={()=>setInput('B09B')} style={presetBtn()}>real subframe (mpdu_len=2491) → expect 0x03</button>
          </>
        ) : (
          <>
            <button onClick={()=>setInput('00')} style={presetBtn()}>0x00 → expect 0xD202EF8D</button>
            <button onClick={()=>setInput('313233343536373839')} style={presetBtn()}>ASCII "123456789" check vector → 0xCBF43926</button>
          </>
        )}
      </div>
      <div style={{marginTop:18, padding:'14px 18px', background:'#0f172a', color:'#e2e8f0', borderRadius:10, fontFamily:'JetBrains Mono, monospace'}}>
        <div style={{fontSize:11, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em'}}>result</div>
        <div style={{fontSize:24, color:'#10b981', fontWeight:700, marginTop:4}}>
          {variant==='crc8' ? `0x${result.toString(16).toUpperCase().padStart(2,'0')}` : `0x${result.toString(16).toUpperCase().padStart(8,'0')}`}
        </div>
        <div style={{fontSize:11, color:'#94a3b8', marginTop:6}}>{scopeDesc}</div>
        <div style={{fontSize:11, color:'#cbd5e1', marginTop:4}}>input = {bytes.length} bytes: {bytes.map(b=>b.toString(16).toUpperCase().padStart(2,'0')).join(' ')||'(empty)'}</div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        Delimiter format (HE/EHT, IEEE 802.11-2024 §9.6.2 / Figure 9-66): B0=EOF, B1–B3=Reserved(0), B4–B15=MPDU Length(12-bit), B16–B23=CRC-8, B24–B31=signature <code>0x4E</code>.
        The EOF padding delim with length=0 / EOF=1 → word16=<code>0x0001</code> → byte stream <code>01 00</code>; CRC-8 over those 16 LSB-first bits = <b>0x79</b>; full delim = <code>01 00 79 4E</code>.
        For a real subframe with mpdu_len=2491 → word16=<code>0x9BB0</code> → byte stream <code>B0 9B</code>; CRC-8 = <b>0x03</b>; full delim = <code>B0 9B 03 4E</code>.
      </div>
    </div>
  );
}
function presetBtn(){
  return {
    fontSize:11, padding:'4px 10px', borderRadius:5,
    background:'#fff', color:'var(--accent)',
    border:'1px solid var(--line)', cursor:'pointer',
    fontFamily:'JetBrains Mono, monospace'
  };
}

window.ToneMapViz = ToneMapViz;
window.PilotClockViz = PilotClockViz;
window.ConstellationExplorer = ConstellationExplorer;
window.AMPDUBytesViz = AMPDUBytesViz;
window.CRCStepperViz = CRCStepperViz;
