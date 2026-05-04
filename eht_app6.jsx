// EHT Waveform Explorer — Part 6
// VIZ panels:
//   §App-K   pipeline-stepper                 (18-step end-to-end orchestrator)
//   §1.6     he-eht-comparison                (side-by-side HE vs EHT diff)
//   §App-D   phy-rate-calculator              (interactive Mbps calculator)
//   §6.5     ppdu-timing-diagram              (full PPDU stacked timeline)
//   §22.4    recipe-inverter                  (bytes → params reverse parser)

const { useState: useS6, useMemo: useM6 } = React;

// =============== §App-K 18-step end-to-end stepper ===============
const PIPELINE_STEPS = [
  { id:1,  group:'PSDU',  name:'MPDU bytes prepared',          desc:'MAC frame body assembled, Header+FCS in place; raw user payload before any PHY processing.', byteSrc:c=>c.PSDU_bytes_pre },
  { id:2,  group:'PSDU',  name:'A-MPDU aggregation',           desc:'Multiple MPDUs concatenated with 4-byte delimiters and EOF padding subframes to align with PSDU length.', byteSrc:c=>c.PSDU_bytes },
  { id:3,  group:'PSDU',  name:'PSDU + SERVICE + tail',        desc:'Prepend 16-bit SERVICE field (zero-init for scrambler); append 6 zero tail bits per encoder.', byteSrc:c=>c.PSDU_bytes },
  { id:4,  group:'CODING',name:'Scramble',                     desc:'XOR data with the 11-bit LFSR S(x)=x¹¹+x⁹+1 (Eq. 36-46, Fig. 36-50). Init seed 1..2047 is recoverable from the SERVICE field. Whitens the spectrum.' },
  { id:5,  group:'CODING',name:'LDPC encode',                  desc:'Each codeword block (648/1296/1944) encoded; padding + shortening + puncturing per Eq. 36-72.' },
  { id:6,  group:'CODING',name:'Stream parser',                desc:'Distribute coded bits across N_SS spatial streams (s = max(N_BPSCS/2, 1) bits per round-robin).' },
  { id:7,  group:'CODING',name:'Segment parser',               desc:'For BW > 80 MHz, split into 80-MHz segments before interleaving (legacy 11ax, identity in EHT).' },
  { id:8,  group:'MAP',   name:'Constellation mapping',        desc:'Bit groups → I/Q symbols (BPSK / QPSK / 16-/64-/256-/1024-/4096-QAM, Gray coded).' },
  { id:9,  group:'MAP',   name:'LDPC tone mapping',            desc:'Permutation D_TM applied across SCs to spread codeword bits in frequency (interleaving for LDPC).' },
  { id:10, group:'MAP',   name:'Pilot insertion',              desc:'Insert pilot tones modulated by Ψ × p_n (Ψ from §27.3.12.13, p_n 127-element from §17.3.5.10). Pilot count per BW: 8 / 16 / 16 / 32 / 64 (Table 36-58).' },
  { id:11, group:'MAP',   name:'CSD per stream',               desc:'Apply cyclic shift diversity (γ_iSS) per stream so multiple antennas don\'t form an unintended beam.' },
  { id:12, group:'MAP',   name:'Spatial mapping Q',            desc:'Multiply N_SS-vector by N_TX×N_SS matrix Q (precoding / beamforming steering).' },
  { id:13, group:'OFDM',  name:'IFFT per chain',               desc:'Each TX chain runs an N_FFT-point IFFT over its frequency-domain symbol.' },
  { id:14, group:'OFDM',  name:'Cyclic prefix prepend',        desc:'Copy last GI µs (0.8/1.6/3.2) to front of each symbol — protects against multipath ≤ GI.' },
  { id:15, group:'OFDM',  name:'Window / overlap',             desc:'Apply T_TR=100 ns raised-cosine ramp; adjacent symbols overlap-add to soften spectral edges.' },
  { id:16, group:'TX',    name:'PHY preamble preceeds',        desc:'L-STF→L-LTF→L-SIG→RL-SIG→U-SIG→EHT-SIG→EHT-STF→EHT-LTF inserted before data symbols.' },
  { id:17, group:'TX',    name:'DAC + RF up-conversion',       desc:'Digital baseband → analog → mix to carrier (channel center). Per-antenna chain output.' },
  { id:18, group:'TX',    name:'On-air',                       desc:'Radiated waveform; RX inverts every step exactly (FFT, demap, decode, descramble, CRC check).' },
];

function PipelineStepper({c}) {
  const [step, setStep] = useS6(1);
  const cur = PIPELINE_STEPS[step-1];
  const groupColors = { PSDU:'#3b82f6', CODING:'#8b5cf6', MAP:'#db2777', OFDM:'#f97316', TX:'#10b981' };
  return (
    <div className="panel">
      <h2><span className="num">ρ</span>End-to-end PHY pipeline <span className="desc">— 18 steps from MPDU bytes to on-air RF · click any step</span></h2>
      <div style={{display:'flex', gap:3, marginBottom:14, flexWrap:'wrap'}}>
        {PIPELINE_STEPS.map(s=>{
          const active = s.id===step;
          const col = groupColors[s.group];
          return (
            <button key={s.id} onClick={()=>setStep(s.id)} style={{
              flex:'1 0 0', minWidth:50,
              padding:'10px 4px', fontSize:11, borderRadius:6,
              background: active?col:'#fff',
              color: active?'#fff':col,
              border:`1.5px solid ${col}`,
              cursor:'pointer', fontWeight:700,
              fontFamily:'JetBrains Mono, monospace',
              transition:'all 0.12s'
            }}>{s.id}</button>
          );
        })}
      </div>
      <div style={{
        padding:'18px 22px', borderRadius:10,
        background:`${groupColors[cur.group]}10`,
        border:`1.5px solid ${groupColors[cur.group]}`
      }}>
        <div style={{display:'flex', alignItems:'baseline', gap:12, marginBottom:8}}>
          <div style={{
            fontSize:11, padding:'3px 9px', borderRadius:4,
            background:groupColors[cur.group], color:'#fff',
            fontWeight:700, letterSpacing:'0.06em'
          }}>{cur.group}</div>
          <div style={{fontSize:14, color:'var(--ink-muted)', fontFamily:'JetBrains Mono, monospace'}}>step {cur.id}/18</div>
          <div style={{fontSize:20, fontWeight:700, color:'var(--ink)'}}>{cur.name}</div>
        </div>
        <div style={{fontSize:14, color:'var(--ink-dim)', lineHeight:1.55}}>{cur.desc}</div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6, marginTop:14}}>
        {Object.entries(groupColors).map(([g,col])=>(
          <div key={g} style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--ink-muted)'}}>
            <div style={{width:10, height:10, borderRadius:2, background:col}}/>{g}
          </div>
        ))}
      </div>
      <div className="detail" style={{marginTop:14}}>
        Each step is reversible. RX walks 18 → 1: down-convert → strip CP → FFT → channel-equalize → demap →
        deinterleave → desegment → unparse streams → LDPC decode → descramble → check FCS. Most "PHY" issues
        in real life live in steps 12 (precoding) and 13–14 (FFT timing / CP alignment).
      </div>
    </div>
  );
}

// =============== §1.6 HE → EHT comparison ===============
const HE_EHT_DIFFS = [
  { feat:'Max BW',                he:'160 MHz', eht:'320 MHz',          col:'green' },
  { feat:'Highest MCS',           he:'MCS 11 (1024-QAM)', eht:'MCS 13 (4096-QAM)', col:'green' },
  { feat:'Bits per symbol',       he:'10',      eht:'12',               col:'green' },
  { feat:'Spatial streams',       he:'8 max',   eht:'8 max (16 in MU)', col:'gray' },
  { feat:'Multi-Link',            he:'—',       eht:'MLO (2.4/5/6 GHz simultaneously)', col:'green' },
  { feat:'Subcarrier spacing',    he:'78.125 kHz', eht:'78.125 kHz',    col:'gray' },
  { feat:'Symbol duration',       he:'12.8 µs', eht:'12.8 µs',          col:'gray' },
  { feat:'GI options',            he:'0.8/1.6/3.2', eht:'0.8/1.6/3.2',  col:'gray' },
  { feat:'Coding',                he:'BCC + LDPC', eht:'LDPC only (BCC removed for EHT-MCS)', col:'green' },
  { feat:'Preamble fields',       he:'L + RL-SIG + HE-SIG-A/B + HE-STF/LTF', eht:'L + RL-SIG + U-SIG + EHT-SIG + EHT-STF/LTF', col:'green' },
  { feat:'PPDU formats',          he:'SU/ER-SU/MU/TB',  eht:'EHT MU PPDU + EHT TB PPDU (only 2)', col:'green' },
  { feat:'Punctured BW',          he:'subset only', eht:'flexible per-20-MHz puncturing pattern', col:'green' },
  { feat:'OFDMA RUs',             he:'fixed 26/52/106/242/484/996', eht:'+ MRU (multiple RU per user)', col:'green' },
  { feat:'Peak rate (1×N_SS)',    he:'1.2 Gbps', eht:'2.9 Gbps (single stream, 320 MHz)', col:'green' },
  { feat:'Peak rate (8 streams)', he:'9.6 Gbps','eht':'23 Gbps',        col:'green' }
];
function HEEHTViz() {
  return (
    <div className="panel">
      <h2><span className="num">σ</span>HE → EHT changes <span className="desc">— §1 · what 802.11be added on top of 11ax</span></h2>
      <table className="t">
        <thead>
          <tr><th>Feature</th><th>HE (11ax)</th><th>EHT (11be)</th></tr>
        </thead>
        <tbody>
          {HE_EHT_DIFFS.map((r,i)=>(
            <tr key={i} style={{background: r.col==='green'?'rgba(16,185,129,0.04)':'transparent'}}>
              <td style={{fontWeight:600, color:'var(--ink)'}}>{r.feat}</td>
              <td style={{color:'var(--ink-dim)'}}>{r.he}</td>
              <td style={{color: r.col==='green'?'var(--green)':'var(--ink-dim)', fontWeight: r.col==='green'?600:400}}>
                {r.col==='green' && <span style={{marginRight:4}}>▲</span>}{r.eht}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="detail" style={{marginTop:12}}>
        EHT keeps the OFDM numerology (78.125 kHz spacing, 12.8 µs symbol, same GI options) — your existing PHY
        radio can mostly be reused. The big additions are <strong>320 MHz BW</strong>, <strong>4096-QAM</strong>,
        <strong> MLO</strong> (a MAC-layer change really), <strong>flexible puncturing</strong>, and <strong>MRU</strong>.
        BCC is gone from EHT-MCS rates; LDPC is mandatory.
      </div>
    </div>
  );
}

// =============== §App-D PHY rate calculator ===============
function PHYRateCalc() {
  const [bw, setBw] = useS6(320);
  const [mcs, setMcs] = useS6(13);
  const [nss, setNss] = useS6(2);
  const [gi, setGi] = useS6(0.8);

  // N_SD per BW (data SCs only, ignoring puncturing)
  const NSD = { 20: 234, 40: 468, 80: 980, 160: 1960, 320: 3920 };
  // bits per SC per MCS (EHT MCS table)
  const NBPSCS = [1, 2, 2, 4, 4, 6, 6, 6, 8, 8, 10, 10, 12, 12];
  // code rate per MCS
  const RATE = [1/2, 1/2, 3/4, 1/2, 3/4, 2/3, 3/4, 5/6, 3/4, 5/6, 3/4, 5/6, 3/4, 5/6];

  const sym_us = 12.8 + gi;
  const dataBitsPerSym = NSD[bw] * NBPSCS[mcs] * RATE[mcs] * nss;
  const mbps = dataBitsPerSym / sym_us;

  return (
    <div className="panel">
      <h2><span className="num">τ</span>PHY rate calculator <span className="desc">— IEEE 802.11be-2024 Table 36-79 · peak Mbps = N_SD · N_BPSCS · R · N_SS / T_SYM</span></h2>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:14}}>
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>BW (MHz)</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
            {[20,40,80,160,320].map(v=>(
              <button key={v} onClick={()=>setBw(v)} style={{
                padding:'6px 10px', fontSize:11, borderRadius:5,
                background: bw===v?'var(--accent)':'#fff', color: bw===v?'#fff':'var(--ink-dim)',
                border:`1px solid ${bw===v?'var(--accent)':'var(--line)'}`,
                cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>MCS</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:3}}>
            {Array.from({length:14}).map((_,i)=>(
              <button key={i} onClick={()=>setMcs(i)} style={{
                padding:'5px 7px', fontSize:10, borderRadius:4,
                background: mcs===i?'var(--accent2)':'#fff', color: mcs===i?'#fff':'var(--ink-dim)',
                border:`1px solid ${mcs===i?'var(--accent2)':'var(--line)'}`,
                cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600,
                minWidth:24
              }}>{i}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>N_SS</div>
          <div style={{display:'flex', flexWrap:'wrap', gap:4}}>
            {[1,2,4,8].map(v=>(
              <button key={v} onClick={()=>setNss(v)} style={{
                padding:'6px 10px', fontSize:11, borderRadius:5,
                background: nss===v?'var(--purple)':'#fff', color: nss===v?'#fff':'var(--ink-dim)',
                border:`1px solid ${nss===v?'var(--purple)':'var(--line)'}`,
                cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>GI (µs)</div>
          <div style={{display:'flex', gap:4}}>
            {[0.8, 1.6, 3.2].map(v=>(
              <button key={v} onClick={()=>setGi(v)} style={{
                padding:'6px 10px', fontSize:11, borderRadius:5,
                background: gi===v?'var(--orange)':'#fff', color: gi===v?'#fff':'var(--ink-dim)',
                border:`1px solid ${gi===v?'var(--orange)':'var(--line)'}`,
                cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600
              }}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        padding:'24px 28px', borderRadius:14,
        background:'linear-gradient(135deg, #2548c7 0%, #6e3bef 100%)',
        color:'#fff', marginBottom:14
      }}>
        <div style={{fontSize:11, opacity:0.7, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6}}>Peak PHY rate</div>
        <div style={{fontSize:48, fontWeight:800, fontFamily:'JetBrains Mono, monospace', letterSpacing:'-0.02em'}}>
          {mbps>=1000 ? (mbps/1000).toFixed(2) : mbps.toFixed(0)}
          <span style={{fontSize:24, marginLeft:8, opacity:0.7}}>{mbps>=1000 ? 'Gbps' : 'Mbps'}</span>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8}}>
        <div className="hl-card"><div className="lab">N_SD (data SCs)</div><div className="vv">{NSD[bw]}</div></div>
        <div className="hl-card"><div className="lab">N_BPSCS</div><div className="vv">{NBPSCS[mcs]}<span className="un">b/SC</span></div></div>
        <div className="hl-card"><div className="lab">Code rate R</div><div className="vv">{RATE[mcs].toFixed(3)}</div></div>
        <div className="hl-card"><div className="lab">N_SS</div><div className="vv">{nss}</div></div>
        <div className="hl-card"><div className="lab">T_sym</div><div className="vv">{sym_us}<span className="un">µs</span></div></div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        Formula: <code>data_rate = N_SD × N_BPSCS × R × N_SS / (12.8 + GI) µs</code>
        <br/>
        E.g., {bw} MHz · MCS {mcs} ({NBPSCS[mcs]}-bit per SC, R={RATE[mcs].toFixed(3)}) · {nss} SS · {gi} µs GI
        = {NSD[bw]} × {NBPSCS[mcs]} × {RATE[mcs].toFixed(3)} × {nss} / {sym_us} = <strong>{mbps.toFixed(0)} Mbps</strong>
        <br/>This is the PHY data rate; subtract MAC overhead (preamble, IFS, ACK, headers) for realistic throughput — typically 60–75%.
      </div>
    </div>
  );
}

// =============== §6.5 PPDU timing diagram ===============
function PPDUTimingViz() {
  const fields = [
    { name:'L-STF',     dur:8,    col:'#bfdbfe', tt:'10× short training, packet detect/AGC' },
    { name:'L-LTF',     dur:8,    col:'#93c5fd', tt:'long training, channel est for legacy' },
    { name:'L-SIG',     dur:4,    col:'#3b82f6', tt:'24 bits, BPSK, length+rate, 1/2 BCC' },
    { name:'RL-SIG',    dur:4,    col:'#7c5ce0', tt:'repeat L-SIG, HE/EHT marker' },
    { name:'U-SIG',     dur:8,    col:'#a78bfa', tt:'2 OFDM symbols, version, BW, format' },
    { name:'EHT-SIG',   dur:8,    col:'#db2777', tt:'1+ symbols, MCS/RU/User Info' },
    { name:'EHT-STF',   dur:8,    col:'#10b981', tt:'AGC for EHT (separate from L-STF)' },
    { name:'EHT-LTF',   dur:13,   col:'#16a34a', tt:'channel est for N_SS streams' },
    { name:'DATA',      dur:120,  col:'#f97316', tt:'PSDU symbols (variable, 1-2000+)' },
    { name:'PE',        dur:8,    col:'#fde68a', tt:'packet extension, RX processing time' }
  ];
  const total = fields.reduce((a,f)=>a+f.dur, 0);
  return (
    <div className="panel">
      <h2><span className="num">υ</span>EHT MU PPDU timeline <span className="desc">— §6 · field durations stacked left-to-right</span></h2>
      <div style={{position:'relative', height:60, display:'flex', borderRadius:8, overflow:'hidden', border:'1px solid var(--line)', background:'#fff'}}>
        {fields.map((f,i)=>{
          const w = (f.dur/total)*100;
          return (
            <div key={i} title={f.tt} style={{
              flex:`0 0 ${w}%`,
              background:f.col,
              borderRight: i<fields.length-1?'1px solid rgba(255,255,255,0.4)':'none',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'JetBrains Mono, monospace',
              fontSize: w>5?12:10, fontWeight:700, color:'#1a2236',
              cursor:'help', overflow:'hidden'
            }}>{f.name}</div>
          );
        })}
      </div>
      <div style={{display:'flex', position:'relative', marginTop:6, fontFamily:'JetBrains Mono, monospace', fontSize:10, color:'var(--ink-muted)'}}>
        {fields.map((f,i)=>(
          <div key={i} style={{flex:`0 0 ${(f.dur/total)*100}%`, textAlign:'center'}}>{f.dur}µs</div>
        ))}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, marginTop:18}}>
        <div className="hl-card"><div className="lab">Preamble (legacy)</div><div className="vv">24<span className="un">µs</span></div></div>
        <div className="hl-card"><div className="lab">Preamble (EHT)</div><div className="vv">37<span className="un">µs</span></div></div>
        <div className="hl-card"><div className="lab">Total preamble</div><div className="vv">61<span className="un">µs</span></div></div>
        <div className="hl-card"><div className="lab">DATA shown</div><div className="vv">{fields[8].dur}<span className="un">µs</span></div></div>
        <div className="hl-card"><div className="lab">Total ex.</div><div className="vv">{total}<span className="un">µs</span></div></div>
      </div>

      <div className="detail" style={{marginTop:12}}>
        First 24 µs (L-STF + L-LTF + L-SIG + RL-SIG) is decodable by every Wi-Fi RX since 11a — that's how legacy
        STAs know to defer. RL-SIG (repeated L-SIG with reversed scrambling) tells HE/EHT-capable RX "keep going".
        U-SIG carries version/BW; EHT-SIG carries per-user info. EHT-STF gives a fresh AGC after the legacy fields,
        and EHT-LTF gives channel estimates wide enough to support the actual {`N_SS`}.
      </div>
    </div>
  );
}

// =============== §22.4 Recipe inverter ===============
const KNOWN_RECIPES = {
  '0x0d_320_8': { name:'Peak 23 Gbps', desc:'MCS 13 · 320 MHz · 8 SS — fastest single-AP rate' },
  '0x00_20_1':  { name:'BPSK robust',  desc:'MCS 0 · 20 MHz · 1 SS — fallback for fringe RX' },
  '0x07_160_2': { name:'Common gaming',desc:'MCS 7 · 160 MHz · 2 SS — typical phone uplink' },
  '0x0b_80_2':  { name:'1024-QAM 80',  desc:'MCS 11 · 80 MHz · 2 SS — solid indoor video' }
};
function RecipeInverter() {
  const [hex, setHex] = useS6('0d');
  const [bw, setBw] = useS6(320);
  const [nss, setNss] = useS6(8);
  const key = `0x${hex.padStart(2,'0')}_${bw}_${nss}`;
  const match = KNOWN_RECIPES[key];
  // decode mcs hex
  const mcs = parseInt(hex, 16);
  const valid = !isNaN(mcs) && mcs>=0 && mcs<=13;
  return (
    <div className="panel">
      <h2><span className="num">φ</span>Recipe inverter <span className="desc">— §22 · type MCS hex + BW + N_SS, get human-readable preset</span></h2>
      <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr', gap:14, marginBottom:14}}>
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>MCS (hex)</div>
          <input type="text" value={hex} onChange={e=>setHex(e.target.value.replace(/[^0-9a-f]/gi,'').slice(0,2))}
            style={{
              width:'100%', padding:'10px 14px', fontSize:18,
              fontFamily:'JetBrains Mono, monospace', fontWeight:700,
              border:'2px solid var(--line)', borderRadius:8,
              color:'var(--accent)', background:'#fafcff', textTransform:'lowercase'
            }}/>
          <div style={{fontSize:10, color:'var(--ink-muted)', marginTop:4, fontFamily:'JetBrains Mono, monospace'}}>
            {valid ? `→ MCS ${mcs}` : '✗ invalid hex'}
          </div>
        </div>
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>BW</div>
          <select value={bw} onChange={e=>setBw(+e.target.value)} style={{
            width:'100%', padding:'10px 14px', fontSize:16,
            fontFamily:'JetBrains Mono, monospace', fontWeight:700,
            border:'2px solid var(--line)', borderRadius:8,
            background:'#fafcff'
          }}>
            {[20,40,80,160,320].map(v=><option key={v} value={v}>{v} MHz</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>N_SS</div>
          <select value={nss} onChange={e=>setNss(+e.target.value)} style={{
            width:'100%', padding:'10px 14px', fontSize:16,
            fontFamily:'JetBrains Mono, monospace', fontWeight:700,
            border:'2px solid var(--line)', borderRadius:8,
            background:'#fafcff'
          }}>
            {[1,2,3,4,5,6,7,8].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div style={{
        padding:'18px 22px', borderRadius:10,
        background: match ? 'rgba(16,185,129,0.06)' : 'rgba(148,163,184,0.06)',
        border: `1.5px solid ${match ? 'var(--green)' : 'var(--line)'}`
      }}>
        {match ? (
          <>
            <div style={{fontSize:11, color:'var(--green)', fontWeight:700, letterSpacing:'0.08em', marginBottom:6}}>RECIPE MATCH</div>
            <div style={{fontSize:24, fontWeight:800, color:'var(--ink)'}}>{match.name}</div>
            <div style={{fontSize:14, color:'var(--ink-dim)', marginTop:4}}>{match.desc}</div>
          </>
        ) : (
          <>
            <div style={{fontSize:11, color:'var(--ink-muted)', fontWeight:700, letterSpacing:'0.08em', marginBottom:6}}>NO PRESET</div>
            <div style={{fontSize:14, color:'var(--ink-dim)'}}>This combination is valid but not in our catalogue. Try one of the known recipes below.</div>
          </>
        )}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8, marginTop:14}}>
        {Object.entries(KNOWN_RECIPES).map(([k,v])=>{
          const [h, b, n] = k.split('_');
          return (
            <button key={k} onClick={()=>{setHex(h.slice(2)); setBw(+b); setNss(+n);}} style={{
              textAlign:'left', padding:'10px 12px', borderRadius:8,
              border:'1px solid var(--line)', background:'#fff',
              cursor:'pointer', transition:'all 0.12s'
            }}
            onMouseEnter={e=>e.currentTarget.style.background='#f7faff'}
            onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              <div style={{fontSize:13, fontWeight:700, color:'var(--ink)'}}>{v.name}</div>
              <div style={{fontSize:10, color:'var(--ink-muted)', fontFamily:'JetBrains Mono, monospace', marginTop:2}}>{k}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

window.PipelineStepper = PipelineStepper;
window.HEEHTViz = HEEHTViz;
window.PHYRateCalc = PHYRateCalc;
window.PPDUTimingViz = PPDUTimingViz;
window.RecipeInverter = RecipeInverter;
