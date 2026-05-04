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

// =============== PHY rate calculator (Section VIII) ===============
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

window.PipelineStepper = PipelineStepper;
window.PHYRateCalc = PHYRateCalc;
