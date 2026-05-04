// EHT Waveform Explorer — Part 7
// VIZ panels (gap fillers):
//   §16.6 puncturing-pattern        (per-20-MHz channel puncturing picker)
//   §17.4 ofdma-ru-layout           (RU + MRU mosaic over 320 MHz)
//   §1.5  mlo-link-mapper           (Multi-Link Operation 2.4/5/6 GHz)
//   §14.6 csd-cyclic-shift          (cyclic shift diversity per stream)
//   §14.7 spatial-mapping-q         (Q matrix · precoding/beamforming)
//   §18.7 pe-windowing              (Packet Extension + T_TR window/overlap)

const { useState: useS7, useMemo: useM7 } = React;

// =============== §16.6 Puncturing pattern picker ===============
function PuncturingViz({p}) {
  const N20 = ({20:1,40:2,80:4,160:8,320:16})[p.BW];
  const [punc, setPunc] = useS7(()=>new Set());
  // primary 20 cannot be punctured
  const toggle = (i)=>{
    if (i===0) return; // primary must stay
    const n = new Set(punc);
    n.has(i) ? n.delete(i) : n.add(i);
    setPunc(n);
  };
  const usable20 = N20 - punc.size;
  const usableBw = usable20 * 20;
  const lossPct = (1 - usable20/N20) * 100;
  // Common patterns
  const PRESETS = {
    'all':       { name: 'No puncturing',          set: ()=>new Set() },
    '160-edge':  { name: 'Drop top 160 MHz',       set: ()=>{ const s=new Set(); for(let i=N20-8;i<N20;i++) s.add(i); return s; } },
    '40-radar':  { name: 'Avoid radar (mid-40)',   set: ()=>{ const s=new Set(); s.add(Math.floor(N20/2)); s.add(Math.floor(N20/2)+1); return s; } },
    'one-20':    { name: 'Mask 1× 20 MHz',         set: ()=>new Set([3]) }
  };
  return (
    <div className="panel">
      <h2><span className="num">α₂</span>Channel puncturing pattern <span className="desc">— IEEE 802.11be-2024 §36.3.6 · click any 20-MHz subblock to mask it (primary 20 MHz cannot be punctured)</span></h2>
      {N20 < 4 ? (
        <div style={{padding:14, background:'#fff8e6', borderRadius:8, color:'var(--orange)', fontSize:13}}>
          Set BW ≥ 80 MHz to demonstrate puncturing (need ≥ 4 subblocks).
        </div>
      ) : (
        <>
          <div style={{display:'flex', gap:8, marginBottom:14, flexWrap:'wrap'}}>
            {Object.entries(PRESETS).map(([k,v])=>(
              <button key={k} onClick={()=>setPunc(v.set())} style={{
                padding:'6px 12px', fontSize:11, borderRadius:5,
                border:'1px solid var(--line)', background:'#fff', color:'var(--ink-dim)',
                cursor:'pointer'
              }}>{v.name}</button>
            ))}
          </div>
          <div style={{display:'flex', gap:3, marginBottom:14, height:80, alignItems:'stretch', borderRadius:8, overflow:'hidden', border:'2px solid #1a2236'}}>
            {Array.from({length:N20}).map((_,i)=>{
              const isPunc = punc.has(i);
              const isPri = i===0;
              return (
                <div key={i} onClick={()=>toggle(i)} style={{
                  flex:1, minWidth:0,
                  background: isPunc ? 'repeating-linear-gradient(45deg, #fee2e2, #fee2e2 6px, #fff 6px, #fff 12px)'
                            : isPri ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                            : 'linear-gradient(135deg, #93c5fd, #60a5fa)',
                  cursor: isPri?'not-allowed':'pointer',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  color: isPunc?'var(--red)':'#fff', borderRight: i<N20-1?'1px solid rgba(255,255,255,0.4)':'none',
                  fontSize:10, fontWeight:700, fontFamily:'JetBrains Mono, monospace',
                  position:'relative'
                }}>
                  <div style={{fontSize:13}}>{i+1}</div>
                  {isPri && <div style={{fontSize:8, marginTop:2, opacity:0.85}}>PRIMARY</div>}
                  {isPunc && <div style={{fontSize:14, marginTop:2}}>✕</div>}
                </div>
              );
            })}
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8}}>
            <div className="hl-card"><div className="lab">Total BW</div><div className="vv">{p.BW}<span className="un">MHz</span></div></div>
            <div className="hl-card"><div className="lab">Punctured</div><div className="vv" style={{color:'var(--red)'}}>{punc.size*20}<span className="un">MHz</span></div></div>
            <div className="hl-card"><div className="lab">Usable BW</div><div className="vv" style={{color:'var(--green)'}}>{usableBw}<span className="un">MHz</span></div></div>
            <div className="hl-card"><div className="lab">Throughput loss</div><div className="vv">{lossPct.toFixed(0)}<span className="un">%</span></div></div>
          </div>
        </>
      )}
      <div className="detail" style={{marginTop:12}}>
        EHT lets the AP punch holes in the operating channel: a {`{20,40,80,160}`}-MHz subblock with radar / interference / busy
        legacy STAs can be masked, and the rest still carries data on the same wide PPDU. The primary 20 MHz must always
        be present (beacon, contention). Allowed puncturing patterns are signalled in U-SIG; the RX trusts which 20-MHz
        subblocks have valid data and ignores the rest.
      </div>
    </div>
  );
}

// =============== §17.4 OFDMA RU + MRU layout ===============
function OFDMARUViz() {
  const [scheme, setScheme] = useS7('mru-mix');
  const SCHEMES = {
    'su-996':       { name:'SU 996-tone (single user)',      layout:[{w:996, u:'A', col:'#3b82f6'}] },
    'mu-484x2':     { name:'MU · 2×484-tone',                layout:[{w:484, u:'A', col:'#3b82f6'},{w:484, u:'B', col:'#10b981'}] },
    'mu-242x4':     { name:'MU · 4×242-tone',                layout:[{w:242, u:'A', col:'#3b82f6'},{w:242, u:'B', col:'#10b981'},{w:242, u:'C', col:'#db2777'},{w:242, u:'D', col:'#f97316'}] },
    'mru-mix':      { name:'MRU · 484+242 + 996 + 484',      layout:[{w:484, u:'A', col:'#3b82f6'},{w:242, u:'A', col:'#3b82f6', mru:true},{w:996, u:'B', col:'#10b981'},{w:484, u:'C', col:'#db2777'}] },
    'small-mix':    { name:'Mixed small RUs (illustrative)', layout:[
                      {w:106, u:'A', col:'#3b82f6'},{w:106, u:'B', col:'#10b981'},{w:106, u:'C', col:'#db2777'},{w:26, u:'D', col:'#f97316'},
                      {w:106, u:'E', col:'#7c5ce0'},{w:106, u:'F', col:'#0ea5b7'},{w:106, u:'G', col:'#dc2a55'},{w:26, u:'H', col:'#16a34a'},
                      {w:106, u:'I', col:'#eab308'},{w:106, u:'J', col:'#ec4899'},{w:106, u:'K', col:'#84cc16'}
                    ] }
  };
  const cur = SCHEMES[scheme];
  const total = cur.layout.reduce((a,r)=>a+r.w, 0);
  // group by user for legend
  const byUser = {};
  cur.layout.forEach(r=>{
    if (!byUser[r.u]) byUser[r.u] = { col:r.col, tones:0, parts:0 };
    byUser[r.u].tones += r.w;
    byUser[r.u].parts += 1;
  });
  return (
    <div className="panel">
      <h2><span className="num">β₂</span>OFDMA RU / MRU layout <span className="desc">— IEEE 802.11be-2024 §36.3.2.2 · split SCs across users; MRU = non-contiguous multi-RU per user (EHT-only feature)</span></h2>
      <div style={{display:'flex', gap:6, marginBottom:14, flexWrap:'wrap'}}>
        {Object.entries(SCHEMES).map(([k,v])=>(
          <button key={k} onClick={()=>setScheme(k)} style={{
            padding:'7px 12px', fontSize:11, borderRadius:5,
            background: scheme===k?'var(--accent)':'#fff',
            color: scheme===k?'#fff':'var(--ink-dim)',
            border:`1px solid ${scheme===k?'var(--accent)':'var(--line)'}`,
            cursor:'pointer', fontWeight:600
          }}>{v.name}</button>
        ))}
      </div>
      <div style={{display:'flex', height:90, borderRadius:8, overflow:'hidden', border:'2px solid #1a2236', marginBottom:6}}>
        {cur.layout.map((r,i)=>{
          const w = (r.w/total)*100;
          return (
            <div key={i} style={{
              flex:`0 0 ${w}%`,
              background:r.mru ?
                `repeating-linear-gradient(45deg, ${r.col}, ${r.col} 8px, ${r.col}cc 8px, ${r.col}cc 16px)`
                : r.col,
              color:'#fff',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              borderRight: i<cur.layout.length-1 ? '2px solid #1a2236':'none',
              fontFamily:'JetBrains Mono, monospace', fontWeight:700,
              padding:'4px 6px', overflow:'hidden', textAlign:'center'
            }}>
              <div style={{fontSize:14}}>{r.w}-tone</div>
              <div style={{fontSize:11, opacity:0.85, marginTop:2}}>User {r.u}{r.mru?' (MRU)':''}</div>
            </div>
          );
        })}
      </div>
      <div style={{display:'flex', justifyContent:'space-between', fontSize:10, fontFamily:'JetBrains Mono, monospace', color:'var(--ink-muted)', marginBottom:14}}>
        <span>0</span><span>80</span><span>160</span><span>240</span><span>320 MHz</span>
      </div>
      <div style={{display:'grid', gridTemplateColumns:`repeat(${Object.keys(byUser).length}, 1fr)`, gap:8}}>
        {Object.entries(byUser).map(([u,info])=>(
          <div key={u} className="hl-card" style={{borderLeft:`4px solid ${info.col}`}}>
            <div className="lab">User {u}{info.parts>1?` (${info.parts}× MRU)`:''}</div>
            <div className="vv">{info.tones}<span className="un">tones</span></div>
          </div>
        ))}
      </div>
      <div className="detail" style={{marginTop:12}}>
        OFDMA divides the 320-MHz channel into Resource Units (RU): 26 / 52 / 106 / 242 / 484 / 996 / 2×996 / 4×996 tones.
        EHT adds <strong>MRU</strong> (Multi-RU): a single user can be assigned non-contiguous RUs to reduce fragmentation
        under puncturing. Spec-allowed combinations include 484+242, 996+484, 996+484+242, 2×996+484, 3×996, 3×996+484
        (large-MRU); and small-MRU patterns 52+26, 106+26 (small-RU only). The constraint is{' '}
        <strong>small RUs (≤106) only combine with small RUs; large RUs (≥242) only with large</strong>{' '}
        — see IEEE 802.11be-2024 §36.3.2.2. The AP signals each user's RU/MRU assignment via EHT-SIG User-Info.
      </div>
    </div>
  );
}
// =============== §18.7 Packet Extension + windowing ===============
function PEWindowViz() {
  const [pe, setPe] = useS7(8);
  const symbolBody = 60;
  return (
    <div className="panel">
      <h2><span className="num">ζ₂</span>Packet Extension &amp; T_TR window <span className="desc">— IEEE 802.11be-2024 §36.3.13 · Table 36-61 (T_PE) · last symbol decays through T_TR so spectral leakage is bounded</span></h2>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:14}}>
        <span style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>PE size</span>
        {[0, 8, 16, 20].map(v=>(
          <button key={v} onClick={()=>setPe(v)} style={{
            padding:'6px 12px', fontSize:11, borderRadius:5,
            background:pe===v?'var(--orange)':'#fff', color:pe===v?'#fff':'var(--ink-dim)',
            border:`1px solid ${pe===v?'var(--orange)':'var(--line)'}`,
            cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600
          }}>{v} µs</button>
        ))}
      </div>
      <svg width="100%" height="160" viewBox="0 0 800 160" style={{background:'#fafcff', borderRadius:8, border:'1px solid var(--line)'}}>
        <defs>
          <linearGradient id="pe-grad" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.8"/>
            <stop offset="80%" stopColor="#f97316" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="#f97316" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* timeline base */}
        <line x1="20" y1="120" x2="780" y2="120" stroke="#cbd5e1" strokeWidth="1"/>
        {/* DATA symbols */}
        {Array.from({length:5}).map((_,i)=>(
          <rect key={i} x={20 + i*symbolBody*0.9} y={50} width={symbolBody*0.85} height={70} fill="#3b82f6" opacity={0.85} stroke="#1d4ed8"/>
        ))}
        <text x={20 + 2.5*symbolBody*0.9} y={45} fontSize="11" textAnchor="middle" fill="#1d4ed8" fontWeight="700">DATA symbols (last 5 shown)</text>
        {/* T_TR window edge — raised cosine ramp on right of last symbol */}
        <path d={`M ${20 + 4.85*symbolBody*0.9} 50 Q ${20 + 4.95*symbolBody*0.9} 60, ${20 + 5.05*symbolBody*0.9} 80 T ${20 + 5.2*symbolBody*0.9} 120 L ${20 + 5.2*symbolBody*0.9} 50 Z`} fill="#fbbf24" opacity="0.7" stroke="#d97706"/>
        <text x={20 + 5.05*symbolBody*0.9} y={45} fontSize="10" textAnchor="middle" fill="#d97706" fontWeight="700">T_TR=100ns</text>
        {/* PE */}
        {pe>0 && (
          <>
            <rect x={20 + 5.2*symbolBody*0.9} y={50} width={pe*8} height={70} fill="url(#pe-grad)"/>
            <text x={20 + 5.2*symbolBody*0.9 + pe*4} y={45} fontSize="11" textAnchor="middle" fill="#d97706" fontWeight="700">PE = {pe} µs</text>
            <text x={20 + 5.2*symbolBody*0.9 + pe*4} y={140} fontSize="10" textAnchor="middle" fill="var(--ink-muted)" fontFamily="JetBrains Mono, monospace">RX processing pad</text>
          </>
        )}
        {/* µs ticks */}
        {[0, 16, 32, 48, 64, 80].map((t,i)=>(
          <g key={i}>
            <line x1={20 + i*symbolBody*0.9} y1="120" x2={20 + i*symbolBody*0.9} y2="125" stroke="#94a3b8"/>
            <text x={20 + i*symbolBody*0.9} y="138" fontSize="10" textAnchor="middle" fill="#94a3b8" fontFamily="JetBrains Mono, monospace">{t}µs</text>
          </g>
        ))}
      </svg>
      <div className="detail" style={{marginTop:12}}>
        Two things happen at the end of every PPDU:
        <br/>
        <strong>① T_TR window</strong> — the last 100 ns of the final symbol is multiplied by a raised-cosine ramp so spectral
        side-lobes don't violate the spectral mask. (Same window applies between symbols via overlap-add.)
        <br/>
        <strong>② Packet Extension</strong> — extra padding (4/8/16 µs) signalled in U-SIG, giving the RX time to finish
        LDPC decoding the last symbol before it has to send back the BlockAck. Larger MCS / larger PSDU → larger PE.
      </div>
    </div>
  );
}

window.PuncturingViz = PuncturingViz;
window.OFDMARUViz = OFDMARUViz;
window.PEWindowViz = PEWindowViz;
