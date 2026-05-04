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
      <h2><span className="num">α₂</span>Channel puncturing pattern <span className="desc">— §16 · click any 20-MHz subblock to mask it (primary can't be punctured)</span></h2>
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
    'small-26':     { name:'Many small RUs',                 layout:Array.from({length:9}).map((_,i)=>({w:106, u:String.fromCharCode(65+i), col:['#3b82f6','#10b981','#db2777','#f97316','#7c5ce0','#0ea5b7','#dc2a55','#16a34a','#eab308'][i]})) }
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
      <h2><span className="num">β₂</span>OFDMA RU / MRU layout <span className="desc">— §17 · split SCs across users; MRU = multi-RU per user (EHT only)</span></h2>
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
        <span>20 MHz</span><span>80 MHz</span><span>160 MHz</span><span>240 MHz</span><span>320 MHz</span>
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
        OFDMA divides the 320-MHz channel into Resource Units (RU): 26/52/106/242/484/996/2×996/4×996 tones.
        EHT adds <strong>MRU</strong>: a single user can take 484+242 or 996+484 (non-contiguous), reducing fragmentation
        when puncturing is active. The AP signals each user's RU assignment in EHT-SIG User-Info.
      </div>
    </div>
  );
}

// =============== §1.5 MLO link mapper ===============
function MLOViz() {
  const [mode, setMode] = useS7('emlsr');
  const links = [
    { band:'2.4 GHz', ch:'1 / 11', bw:40,  rate:574,  col:'#10b981', label:'reach' },
    { band:'5 GHz',   ch:'36 / 149', bw:160, rate:2401, col:'#3b82f6', label:'workhorse' },
    { band:'6 GHz',   ch:'1 / 33 / 65', bw:320, rate:11500, col:'#7c5ce0', label:'gigabit' }
  ];
  const MODES = {
    'emlsr':  { name:'EMLSR',          desc:'Enhanced Multi-Link Single-Radio — listen on all, transmit on one' },
    'mlmr':   { name:'MLMR (str)',     desc:'Multi-Link Multi-Radio (STR) — transmit/recv simultaneously on multiple links' },
    'nstr':   { name:'NSTR',           desc:'Non-STR pair — share TXOP between two links to avoid self-interference' }
  };
  const totalRate = mode==='mlmr' ? links.reduce((a,l)=>a+l.rate,0) : Math.max(...links.map(l=>l.rate));
  return (
    <div className="panel">
      <h2><span className="num">γ₂</span>Multi-Link Operation (MLO) <span className="desc">— §1 · 802.11be flagship: bind 2.4/5/6 GHz under one MAC</span></h2>
      <div style={{display:'flex', gap:6, marginBottom:14}}>
        {Object.entries(MODES).map(([k,v])=>(
          <button key={k} onClick={()=>setMode(k)} style={{
            flex:1, padding:'10px 12px', fontSize:12, borderRadius:6,
            background: mode===k?'var(--accent)':'#fff', color: mode===k?'#fff':'var(--ink-dim)',
            border:`1px solid ${mode===k?'var(--accent)':'var(--line)'}`,
            cursor:'pointer', fontWeight:600, textAlign:'left'
          }}>
            <div>{v.name}</div>
            <div style={{fontSize:10, opacity:0.8, marginTop:3, fontWeight:400}}>{v.desc}</div>
          </button>
        ))}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginBottom:14}}>
        {links.map(l=>{
          const active = mode==='mlmr' || (mode==='emlsr' && l.band==='5 GHz') || (mode==='nstr' && l.band!=='2.4 GHz');
          return (
            <div key={l.band} style={{
              padding:'14px 16px', borderRadius:10,
              background: active ? l.col+'15' : '#f8fafc',
              border:`2px solid ${active ? l.col : 'var(--line)'}`,
              opacity: active ? 1 : 0.5,
              transition:'all 0.2s'
            }}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                <div style={{width:10, height:10, borderRadius:'50%', background:l.col}}/>
                <div style={{fontWeight:700, fontSize:14}}>{l.band}</div>
                <div style={{fontSize:10, color:l.col, fontWeight:700, marginLeft:'auto', textTransform:'uppercase', letterSpacing:'0.06em'}}>{l.label}</div>
              </div>
              <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:11, color:'var(--ink-muted)', marginBottom:8}}>
                ch {l.ch} · {l.bw} MHz max
              </div>
              <div style={{fontSize:24, fontWeight:800, color: active ? l.col : 'var(--ink-muted)', fontFamily:'JetBrains Mono, monospace'}}>
                {l.rate>=1000 ? (l.rate/1000).toFixed(1)+' Gbps' : l.rate+' Mbps'}
              </div>
              <div style={{fontSize:10, color: active ? l.col : 'var(--ink-muted)', marginTop:4, fontWeight:600}}>
                {active ? '● ACTIVE' : '○ idle'}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{
        padding:'18px 22px', borderRadius:10,
        background:'linear-gradient(135deg, #2548c7 0%, #6e3bef 100%)', color:'#fff'
      }}>
        <div style={{fontSize:11, opacity:0.7, textTransform:'uppercase', letterSpacing:'0.1em'}}>Effective MLO throughput · {MODES[mode].name}</div>
        <div style={{fontSize:36, fontWeight:800, fontFamily:'JetBrains Mono, monospace'}}>
          {totalRate>=1000 ? (totalRate/1000).toFixed(2)+' Gbps' : totalRate+' Mbps'}
        </div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        MLO is mostly a MAC-layer change — same EHT PHY runs on each link. The AP and STA negotiate which links to bind;
        STR-capable hardware can transmit on all simultaneously, while EMLSR uses one radio that listens broadly and
        switches to whichever link won contention. Latency drops because alternate links absorb spikes; aggregate
        throughput multiplies for STR users.
      </div>
    </div>
  );
}

// =============== §14.6 CSD cyclic shift diversity ===============
function CSDViz() {
  const [nss, setNss] = useS7(4);
  // Per-stream CSD values (ns) per spec table
  const csd_ns = [0, -400, -200, -600, -350, -650, -100, -750];
  const TS_NS = 12800; // FFT body in ns
  // Each row shows time-shifted version of the same waveform
  return (
    <div className="panel">
      <h2><span className="num">δ₂</span>Cyclic Shift Diversity (CSD) <span className="desc">— §14 · per-stream cyclic shift so multiple antennas don't beam-form unintentionally</span></h2>
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:14}}>
        <span style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>N_SS</span>
        {[1,2,4,8].map(n=>(
          <button key={n} onClick={()=>setNss(n)} style={{
            padding:'6px 12px', fontSize:11, borderRadius:5,
            background:nss===n?'var(--purple)':'#fff', color:nss===n?'#fff':'var(--ink-dim)',
            border:`1px solid ${nss===n?'var(--purple)':'var(--line)'}`,
            cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600
          }}>{n}</button>
        ))}
      </div>
      <div style={{background:'var(--bg2)', padding:12, borderRadius:8, border:'1px solid var(--line)'}}>
        {Array.from({length:nss}).map((_,i)=>{
          const shift = csd_ns[i];
          const shiftPct = (shift / TS_NS) * 100; // negative = wrap-around
          return (
            <div key={i} style={{display:'flex', alignItems:'center', gap:10, marginBottom:8}}>
              <div style={{width:80, fontSize:12, fontFamily:'JetBrains Mono, monospace', color:'var(--ink-dim)', textAlign:'right'}}>
                stream {i+1}
              </div>
              <div style={{flex:1, height:36, background:'#fff', borderRadius:6, border:'1px solid var(--line)', position:'relative', overflow:'hidden'}}>
                {/* visualize as sinusoidal pattern shifted */}
                <svg width="100%" height="36" style={{display:'block'}}>
                  <defs>
                    <linearGradient id={`csd-grad-${i}`} x1="0%" x2="100%">
                      <stop offset="0%" stopColor={['#3b82f6','#10b981','#db2777','#f97316','#7c5ce0','#0ea5b7','#dc2a55','#eab308'][i]} stopOpacity="0.3"/>
                      <stop offset="100%" stopColor={['#3b82f6','#10b981','#db2777','#f97316','#7c5ce0','#0ea5b7','#dc2a55','#eab308'][i]} stopOpacity="0.9"/>
                    </linearGradient>
                  </defs>
                  {Array.from({length:60}).map((_,k)=>{
                    const phase = (k/60)*Math.PI*8 + (shift/TS_NS)*Math.PI*8;
                    const h = 14 + 12*Math.sin(phase);
                    return <rect key={k} x={`${(k/60)*100}%`} y={18-h/2} width="1.2%" height={h} fill={`url(#csd-grad-${i})`}/>;
                  })}
                </svg>
              </div>
              <div style={{width:80, fontSize:12, fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700}}>
                {shift>0?'+':''}{shift} ns
              </div>
            </div>
          );
        })}
      </div>
      <div className="detail" style={{marginTop:12}}>
        Without CSD, identical L-STF/L-LTF on all TX antennas combine constructively in some directions and destructively in others —
        a legacy RX in a "null" might miss the preamble entirely. By cyclically shifting each stream by 100–800 ns, the antennas
        decorrelate and the radiated pattern becomes ~omnidirectional. CSD is applied <em>per stream after IFFT</em>, hence "cyclic":
        shifting in time wraps via the FFT periodicity, equivalent to a per-SC linear phase ramp.
      </div>
    </div>
  );
}

// =============== §14.7 Spatial mapping Q matrix ===============
function SpatialQViz() {
  const [mode, setMode] = useS7('beam');
  const MODES = {
    'direct':   { name:'Direct (Q=I)',         desc:'one stream per antenna, no mixing' },
    'expand':   { name:'Expansion',            desc:'fewer streams than antennas; spatial expansion increases diversity' },
    'beam':     { name:'Beamforming',          desc:'Q from SVD of channel — focus energy at intended RX' }
  };
  const NTX = 4, NSS = 2;
  // Generate sample Q (4×2)
  const Q = useM7(()=>{
    if (mode==='direct') {
      return [[1,0],[0,1],[0,0],[0,0]];
    }
    if (mode==='expand') {
      return [[0.71,0],[0,0.71],[0.71,0],[0,0.71]]; // 1/√2 weights
    }
    // beamforming: random-ish unitary
    return [
      [0.62, 0.31],
      [0.55,-0.42],
      [0.41, 0.66],
      [-0.38,0.54]
    ];
  },[mode]);

  return (
    <div className="panel">
      <h2><span className="num">ε₂</span>Spatial mapping Q · MIMO precoding <span className="desc">— §14 · N_SS streams → N_TX antennas via N_TX × N_SS matrix Q</span></h2>
      <div style={{display:'flex', gap:6, marginBottom:14}}>
        {Object.entries(MODES).map(([k,v])=>(
          <button key={k} onClick={()=>setMode(k)} style={{
            flex:1, padding:'10px 12px', fontSize:12, borderRadius:6,
            background: mode===k?'var(--accent)':'#fff', color: mode===k?'#fff':'var(--ink-dim)',
            border:`1px solid ${mode===k?'var(--accent)':'var(--line)'}`, cursor:'pointer', fontWeight:600, textAlign:'left'
          }}>
            <div>{v.name}</div>
            <div style={{fontSize:10, opacity:0.8, marginTop:3, fontWeight:400}}>{v.desc}</div>
          </button>
        ))}
      </div>
      <div style={{display:'flex', gap:30, alignItems:'center', justifyContent:'center', padding:'20px 0'}}>
        {/* SS column */}
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, textAlign:'center'}}>Streams (N_SS={NSS})</div>
          {Array.from({length:NSS}).map((_,i)=>(
            <div key={i} style={{
              width:80, height:50, background:'#dfe9ff', border:'2px solid var(--accent)',
              borderRadius:8, marginBottom:8, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center'
            }}>
              <div style={{fontSize:11, color:'var(--ink-muted)'}}>SS</div>
              <div style={{fontFamily:'JetBrains Mono, monospace', fontWeight:700, color:'var(--accent)', fontSize:16}}>{i+1}</div>
            </div>
          ))}
        </div>
        {/* Q matrix */}
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8}}>Q ({NTX} × {NSS})</div>
          <div style={{display:'inline-block', padding:14, border:'2px solid var(--purple)', borderRadius:10, background:'#f5f3ff'}}>
            <table style={{borderCollapse:'collapse', fontFamily:'JetBrains Mono, monospace', fontSize:13}}>
              <tbody>
                {Q.map((row,i)=>(
                  <tr key={i}>
                    {row.map((v,j)=>(
                      <td key={j} style={{
                        padding:'6px 12px', textAlign:'center',
                        color: Math.abs(v)>0.6 ? 'var(--purple)' : Math.abs(v)>0.1 ? 'var(--ink-dim)' : 'var(--ink-muted)',
                        fontWeight: Math.abs(v)>0.6 ? 700 : 400,
                        background: Math.abs(v)>0.6 ? '#ddd6fe' : Math.abs(v)>0.1 ? '#ede9fe50' : 'transparent',
                        borderRadius:4
                      }}>{v>=0?'+':''}{v.toFixed(2)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* TX column */}
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, textAlign:'center'}}>Antennas (N_TX={NTX})</div>
          {Array.from({length:NTX}).map((_,i)=>(
            <div key={i} style={{
              width:80, height:50, background:'#fef3c7', border:'2px solid var(--orange)',
              borderRadius:8, marginBottom:8, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center'
            }}>
              <div style={{fontSize:11, color:'var(--ink-muted)'}}>ant</div>
              <div style={{fontFamily:'JetBrains Mono, monospace', fontWeight:700, color:'var(--orange)', fontSize:16}}>{i+1}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        For each subcarrier, frequency-domain symbols of all N_SS streams are stacked into an N_SS-vector and multiplied by Q to
        get the N_TX-vector that drives the IFFTs. <strong>Direct</strong>: identity (no MIMO). <strong>Expansion</strong>: when N_TX &gt; N_SS,
        spread streams across antennas with low-correlation weights. <strong>Beamforming</strong>: AP measures the channel via
        sounding (NDP), computes Q from SVD/codebook so that Q·H aims energy at the intended RX. EHT supports up to 8 streams,
        16 in MU-MIMO.
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
      <h2><span className="num">ζ₂</span>Packet Extension &amp; T_TR window <span className="desc">— §18 · last symbol → soft fall-off so spectral leakage is bounded</span></h2>
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
window.MLOViz = MLOViz;
window.CSDViz = CSDViz;
window.SpatialQViz = SpatialQViz;
window.PEWindowViz = PEWindowViz;
