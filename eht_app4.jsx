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
  const N_EHT_SIG = 2;
  const offset = E4.pilotOffsetForData(N_EHT_SIG);
  const [sym, setSym] = useS4(0);
  const idx = (sym + offset) % 127;
  const pol = E4.PILOT_POL_127[idx];
  const cx=160, cy=160, R=130;

  return (
    <div className="panel">
      <h2><span className="num">η</span>Pilot polarity clock <span className="desc">— IEEE 802.11-2020 §17.3.5.10 (127-element p_n) · IEEE 802.11be-2024 §36.3.13.11 (EHT pilot offset 4 + N_EHT-SIG)</span></h2>
      <div style={{display:'grid', gridTemplateColumns:'320px 1fr', gap:24, alignItems:'center'}}>
        <svg width="320" height="320" style={{display:'block'}}>
          <circle cx={cx} cy={cy} r={R} fill="#fff" stroke="var(--line)" strokeWidth="1.5"/>
          {E4.PILOT_POL_127.map((v,i)=>{
            const a = (i/127)*2*Math.PI - Math.PI/2;
            const r1 = R-12, r2 = R-2;
            const x1 = cx+Math.cos(a)*r1, y1=cy+Math.sin(a)*r1;
            const x2 = cx+Math.cos(a)*r2, y2=cy+Math.sin(a)*r2;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={i===idx? '#ef4444': (v>0?'#3b82f6':'#94a3b8')}
              strokeWidth={i===idx?3:1.5}/>;
          })}
          {/* arm */}
          {(() => {
            const a = (idx/127)*2*Math.PI - Math.PI/2;
            return <line x1={cx} y1={cy} x2={cx+Math.cos(a)*(R-12)} y2={cy+Math.sin(a)*(R-12)}
              stroke="#ef4444" strokeWidth="3" strokeLinecap="round"/>;
          })()}
          <circle cx={cx} cy={cy} r="6" fill="#ef4444"/>
          <text x={cx} y={cy+50} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="22" fontWeight="700" fill="var(--accent)">p_n = {pol>0?'+1':'−1'}</text>
          <text x={cx} y={cy+72} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="var(--ink-muted)">index {idx} / 127</text>
        </svg>
        <div>
          <label style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Data symbol n</label>
          <input type="range" min={0} max={20} value={sym} onChange={e=>setSym(+e.target.value)}
            style={{width:'100%', marginTop:6}}/>
          <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:13, color:'var(--ink-dim)', marginTop:6}}>
            <div>n = <b style={{color:'var(--accent)'}}>{sym}</b></div>
            <div>offset = 4 + N_EHT-SIG = 4 + {N_EHT_SIG} = <b>{offset}</b></div>
            <div>(n + offset) mod 127 = <b style={{color:'var(--green)'}}>{idx}</b></div>
            <div>p_n = <b style={{color:'var(--orange)'}}>{pol}</b></div>
          </div>
          <div style={{marginTop:14}}>
            <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4}}>Per-SC base Ψ (8-element cyclic, Eq. 27-104)</div>
            <div style={{display:'flex', gap:4}}>
              {E4.PSI_8.map((v,i)=>(
                <div key={i} style={{
                  width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center',
                  border:'1px solid var(--line)', borderRadius:6,
                  background: v>0?'#dbeafe':'#fee2e2',
                  color: v>0?'#1e40af':'#b91c1c',
                  fontFamily:'JetBrains Mono, monospace', fontWeight:700
                }}>{v>0?'+1':'−1'}</div>
              ))}
            </div>
          </div>
          <div className="detail" style={{marginTop:14}}>
            Pilot value at SC pp, symbol n = p_n × Ψ[(n+pp−1) mod 8]. Advancing polarity acts as a per-symbol counter so RX detects skipped symbols.
          </div>
        </div>
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

  // build region map from the exact layout — one block per subframe segment
  const regions = [];
  layout.subframes.forEach((sf, i) => {
    const lab = numMpdus > 1 ? ` #${i+1}` : '';
    regions.push({ len:4,         color:'#fbcfe8', label:'Delim'+lab,      hex:'4 B · CRC-8 · Sig 0x4E' });
    regions.push({ len:26,        color:'#ddd6fe', label:'MAC Header'+lab, hex:'26 B · 88 01 …' });
    regions.push({ len:sf.chunk,  color:'#bfdbfe', label:'Body'+lab,       hex:`${sf.chunk.toLocaleString()} B` });
    regions.push({ len:4,         color:'#bbf7d0', label:'FCS'+lab,        hex:'CRC-32' });
    if (sf.align > 0) {
      regions.push({ len:sf.align, color:'#fef3c7', label:'align'+lab, hex:`${sf.align} B (0x00)` });
    }
  });
  if (layout.eof_count > 0) {
    regions.push({ len: layout.eof_count*4, color:'#fed7aa',
                   label:`${layout.eof_count}× EOF Pad`, hex:'01 00 9E 4E ×'+layout.eof_count });
  }
  if (layout.eof_tail > 0) {
    regions.push({ len: layout.eof_tail, color:'#fed7aa',
                   label:'tail', hex:`${layout.eof_tail} B · 0xFF` });
  }
  if (c.N_PAD_PHY_bits > 0) {
    regions.push({ len:0, color:'#fee2e2',
                   label:`+ ${c.N_PAD_PHY_bits}b PHY pad`, hex:'sub-byte' });
  }

  return (
    <div className="panel">
      <h2><span className="num">ι</span>A-MPDU byte layout <span className="desc">— IEEE 802.11-2024 §10.12.7 · APEP = {APEP.toLocaleString()} B → PSDU = {total.toLocaleString()} B · NumMPDUs = {numMpdus} · all numbers are exact (matches ref/wifi7-python build_ampdu)</span></h2>
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
        Per-subframe layout (chunk + align): {layout.subframes.map((sf, i) =>
          `#${i+1} = ${sf.chunk}+${sf.align}`).join(' · ')}.
        {' '}
        Real-subframes total = {layout.total_real.toLocaleString()} B · EOF region = {layout.eof_bytes.toLocaleString()} B
        {' '}({layout.eof_count} delim{layout.eof_tail>0?` + ${layout.eof_tail} B 0xFF tail`:''}) · PSDU = {total.toLocaleString()} B ✓
        <br/>
        <span style={{display:'block', marginTop:6, color:'var(--ink-muted)', fontSize:11}}>
          Note: APEP_LENGTH ({APEP.toLocaleString()} B) is the signalled <em>target</em> pre-EOF size; the actual real-subframes
          region is {layout.total_real.toLocaleString()} B ({APEP - layout.total_real} B less) because each subframe must end on a 4-byte
          boundary and at least one EOF delim must follow. Eq. 36-66 N_PAD_MAC_bytes = {c.N_PAD_MAC_bytes.toLocaleString()} B; the
          {' '}{layout.eof_bytes - c.N_PAD_MAC_bytes}-byte difference is the alignment slack absorbed at the start of the EOF region.
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
    // build 16 bits MSB-first per delim spec
    const bits = [];
    for (let i=0;i<2 && i<bytes.length;i++){
      for (let b=7;b>=0;b--) bits.push((bytes[i]>>b)&1);
    }
    while (bits.length<16) bits.push(0);
    result = E4.crc8_amDelim(bits.slice(0,16));
    scopeDesc = 'A-MPDU delimiter B0–B15 (16 bits) · poly 0x07, init 0xFF, final XOR 0xFF';
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
            <button onClick={()=>setInput('35EA')} style={presetBtn()}>delim B0–B15 of "35 EA 6E 4E" → expect 0x6E</button>
            <button onClick={()=>setInput('0100')} style={presetBtn()}>EOF delim → expect 0x9E</button>
          </>
        ) : (
          <>
            <button onClick={()=>setInput('00')} style={presetBtn()}>0x00 → expect 0xD202EF8D</button>
            <button onClick={()=>setInput('123456789')} style={presetBtn()}>"123456789" check vector → 0xCBF43926</button>
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
        For the A-MPDU delimiter "<code>35 EA 6E 4E</code>": the first 16 bits cover length=14989 + EOF=1 + reserved=0 (bit-reversed for transmission). CRC-8 over those 16 bits = <b>0x6E</b>, then a fixed signature byte <b>0x4E</b> ends the delimiter.
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
