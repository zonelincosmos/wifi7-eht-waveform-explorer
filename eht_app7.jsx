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
// =============== Packet Extension + windowing ===============
function PEWindowViz({c}) {
  // Live derived value from compute() — the actual T_PE depends on
  // (a, NominalPacketPadding) per Table 36-61. The buttons below let the user
  // explore — they only change the local NominalPacketPadding selector for the
  // viz (c.NominalPacketPadding from the global params is the live default).
  const [nomPE, setNomPE] = useS7(c?.NominalPacketPadding ?? 16);
  // Re-derive T_PE for the local nomPE choice (table 36-61). a is from c.a_pad.
  const PE_TABLE = {
    1: { 0:0, 8:0,  16:4,  20:8  },
    2: { 0:0, 8:0,  16:8,  20:12 },
    3: { 0:0, 8:4,  16:12, 20:16 },
    4: { 0:0, 8:8,  16:16, 20:20 }
  };
  const a_pad = c?.a_pad ?? 1;
  const pe = (PE_TABLE[a_pad] && PE_TABLE[a_pad][nomPE] != null) ? PE_TABLE[a_pad][nomPE] : 0;
  return (
    <div className="panel">
      <h2><span className="num">ζ₂</span>Packet Extension &amp; T_TR window <span className="desc">— IEEE 802.11be-2024 §36.3.13 · Table 36-61 · T_PE depends on BOTH NominalPacketPadding (TX policy) and a (post-FEC pad factor); two-step lookup shown below</span></h2>
      <div style={{display:'flex', gap:14, alignItems:'center', marginBottom:14, flexWrap:'wrap'}}>
        <span style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>NominalPacketPadding (input)</span>
        {[0, 8, 16, 20].map(v=>(
          <button key={v} onClick={()=>setNomPE(v)} style={{
            padding:'6px 12px', fontSize:11, borderRadius:5,
            background:nomPE===v?'var(--orange)':'#fff', color:nomPE===v?'#fff':'var(--ink-dim)',
            border:`1px solid ${nomPE===v?'var(--orange)':'var(--line)'}`,
            cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600
          }}>{v} µs</button>
        ))}
        <span style={{fontSize:11, color:'var(--ink-muted)', marginLeft:14}}>
          live a = <b>{a_pad}</b> · table 36-61[a={a_pad}][NomPE={nomPE}] = derived T_PE = <b>{pe} µs</b>
        </span>
      </div>

      {/* Schematic layout — three blocks separated by gaps. Strictly
          NOT-TO-SCALE: T_TR (100 ns) and T_PE (0..20 µs) differ by 200×;
          drawing them in proportion would make T_TR a sub-pixel sliver.
          The gap between blocks is intentional, marked "schematic". */}
      <svg width="100%" height="180" viewBox="0 0 800 180" style={{background:'#fafcff', borderRadius:8, border:'1px solid var(--line)'}}>
        <defs>
          <linearGradient id="ttr-grad" x1="0%" x2="100%">
            <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.85"/>
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05"/>
          </linearGradient>
          <linearGradient id="pe-grad" x1="0%" x2="100%">
            <stop offset="0%"   stopColor="#f97316" stopOpacity="0.85"/>
            <stop offset="100%" stopColor="#f97316" stopOpacity="0.4"/>
          </linearGradient>
        </defs>

        {/* baseline */}
        <line x1="20" y1="135" x2="780" y2="135" stroke="#cbd5e1" strokeWidth="1"/>

        {/* ===== Block A: trailing DATA symbols (300 px wide) ===== */}
        {Array.from({length:3}).map((_,i)=>(
          <rect key={i} x={20 + i*92} y={55} width={86} height={80}
                fill="#3b82f6" opacity={0.85} stroke="#1d4ed8" strokeWidth="1.5"/>
        ))}
        <text x={20 + 1.5*92 + 43} y={50} fontSize="12" textAnchor="middle" fill="#1d4ed8" fontWeight="700">
          last 3 DATA symbols
        </text>
        <text x={20 + 1.5*92 + 43} y={155} fontSize="11" textAnchor="middle" fill="#1d4ed8" fontFamily="JetBrains Mono, monospace">
          each = T_SYM (12.8 + GI µs)
        </text>

        {/* gap between A and B with "//"  break-mark */}
        <text x="320" y="100" fontSize="20" textAnchor="middle" fill="#94a3b8">⌇</text>

        {/* ===== Block B: T_TR ramp (340..440 px) — exaggerated for visibility ===== */}
        <rect x="340" y="55" width="100" height="80" fill="url(#ttr-grad)" stroke="#1d4ed8" strokeWidth="1.5"/>
        {/* fade curve overlay */}
        <path d="M 340 55 L 340 135 L 440 135 Q 420 105, 410 75 Q 395 60, 340 55 Z"
              fill="#fbbf24" opacity="0.6" stroke="#d97706" strokeWidth="1"/>
        <text x="390" y="50" fontSize="12" textAnchor="middle" fill="#d97706" fontWeight="700">T_TR rolloff</text>
        <text x="390" y="155" fontSize="11" textAnchor="middle" fill="#d97706" fontFamily="JetBrains Mono, monospace">
          100 ns (raised-cosine)
        </text>
        <text x="390" y="170" fontSize="9" textAnchor="middle" fill="#94a3b8" fontStyle="italic">
          shown 200× larger than to-scale
        </text>

        {/* gap between B and C */}
        <text x="465" y="100" fontSize="20" textAnchor="middle" fill="#94a3b8">⌇</text>

        {/* ===== Block C: Packet Extension (490..760 px) ===== */}
        {pe > 0 ? (
          <>
            <rect x="490" y="55" width="270" height="80" fill="url(#pe-grad)" stroke="#c2410c" strokeWidth="1.5"/>
            <text x="625" y="50" fontSize="12" textAnchor="middle" fill="#c2410c" fontWeight="700">
              Packet Extension · T_PE = {pe} µs
            </text>
            <text x="625" y="100" fontSize="11" textAnchor="middle" fill="#7c2d12" fontFamily="JetBrains Mono, monospace" fontWeight="600">
              RX has T_PE to finish LDPC
            </text>
            <text x="625" y="118" fontSize="11" textAnchor="middle" fill="#7c2d12" fontFamily="JetBrains Mono, monospace" fontWeight="600">
              before BlockAck deadline
            </text>
            <text x="625" y="155" fontSize="11" textAnchor="middle" fill="#c2410c" fontFamily="JetBrains Mono, monospace">
              {pe} µs · {pe * 480} samples @ 480 MHz
            </text>
          </>
        ) : (
          <>
            <rect x="490" y="55" width="270" height="80" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4"/>
            <text x="625" y="100" fontSize="12" textAnchor="middle" fill="#64748b" fontStyle="italic">
              T_PE = 0 (PE omitted)
            </text>
            <text x="625" y="155" fontSize="11" textAnchor="middle" fill="#94a3b8" fontFamily="JetBrains Mono, monospace">
              no extra processing pad
            </text>
          </>
        )}
      </svg>

      <div className="detail" style={{marginTop:12}}>
        Two distinct things happen at the end of every PPDU:
        <br/>
        <strong>① T_TR window</strong> (only ~100 ns) — the trailing edge of the last DATA symbol is multiplied by a
        raised-cosine ramp so out-of-band spectral side-lobes don't violate the spectral mask. The same window also
        joins symbol n's tail onto symbol n+1's head via overlap-add.
        <br/>
        <strong>② Packet Extension</strong> (T_PE = 0 / 8 / 16 / 20 µs, signalled in U-SIG) — extra padding samples
        whose only job is to give the RX time to finish LDPC decoding the last symbol before the SIFS-bounded BlockAck
        deadline. Higher MCS → larger codewords → bigger PE budget. Per Table 36-61 the exact T_PE depends on a_init
        and NominalPacketPadding.
        <br/>
        <span style={{color:'var(--ink-muted)', fontSize:11}}>
          The two regions are drawn schematically, not in proportion: a real T_TR (100 ns) is ~200× shorter than a
          16 µs PE, so a strict timeline would make T_TR a sub-pixel line.
        </span>
      </div>
    </div>
  );
}

window.PuncturingViz = PuncturingViz;
window.OFDMARUViz = OFDMARUViz;
window.PEWindowViz = PEWindowViz;
