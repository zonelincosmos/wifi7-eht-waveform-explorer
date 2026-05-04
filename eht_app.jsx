// SPDX-License-Identifier: MIT
// Copyright (c) 2026 zonelincosmos
// Web companion to https://github.com/zonelincosmos/wifi7-eht-waveform-generator-python
//
// EHT Waveform Explorer — main wrapper
// Organised by pipeline order with sticky TOC.

const { useState: useStateM, useEffect: useEffectM, useRef: useRefM } = React;

// Section definitions: each has id, title, icon, and the panels (functions) inside.
// Panels are referenced by name from window.* — wrapped in section divs.
// Section layout follows the data-flow story: bytes → bits → coded bits →
// constellation symbols → subcarriers → time-domain samples → preamble assembly
// → advanced/MU features → tools. Each section keeps a tight thematic focus so
// learners can dive in/out without losing context.
const SECTIONS = [
  { id:'sec-overview',  num:'I',    title:'Overview & Timeline',
    desc:'Live parameter dashboard · PPDU timeline · concentric byte/bit hierarchy · 18-step orchestrator pipeline' },
  { id:'sec-bytes',     num:'II',   title:'Bytes, MAC & Scrambling',
    desc:'PSDU layout · A-MPDU aggregation · MAC header · byte→bit conversion · scrambler PN11 · CRC steppers' },
  { id:'sec-coding',    num:'III',  title:'Error Correction & Channel Shaping',
    desc:'LDPC param cascade · Annex F base matrix · BCC trellis · tone mapping · puncturing patterns' },
  { id:'sec-mapping',   num:'IV',   title:'Constellation & Subcarrier Layout',
    desc:'Gray-coded BPSK..4096-QAM · Gray vs binary intuition · subcarrier coordinates · pilot clock · per-SC bit diffs' },
  { id:'sec-sig',       num:'V',    title:'Preamble & Signaling',
    desc:'L-SIG / U-SIG / EHT-SIG bit-field viewers · L-STF time waveform · EHT-LTF mode comparison' },
  { id:'sec-ofdm',      num:'VI',   title:'Time-Domain Synthesis',
    desc:'IFFT · CP / ISI demonstration · packet extension windowing · zero-pad vs polyphase resample' },
  { id:'sec-features',  num:'VII',  title:'Multi-User OFDMA',
    desc:'OFDMA RU / MRU layout — how SCs are split across users in EHT MU PPDUs' },
  { id:'sec-rate',      num:'VIII', title:'PHY Rate Calculator',
    desc:'Interactive Mbps / TXTIME calculator across (BW, MCS, GI, NSS, payload) combinations' },
  { id:'sec-trace',     num:'IX',   title:'Bit-Trace Tool',
    desc:'Follow one PSDU bit through scrambler → LDPC → constellation → subcarrier → OFDM symbol → samples' },
];

function Section({id, num, title, desc, children}) {
  return (
    <section id={id} style={{scrollMarginTop:80, marginTop:36}}>
      <div style={{
        display:'flex', alignItems:'baseline', gap:16,
        marginBottom:16, paddingBottom:14,
        borderBottom:'2px solid var(--line)'
      }}>
        <div style={{
          fontFamily:'JetBrains Mono, monospace',
          fontSize:42, fontWeight:800,
          color:'var(--accent)', letterSpacing:'-0.04em', lineHeight:1
        }}>{num}</div>
        <div>
          <div style={{fontSize:24, fontWeight:700, color:'var(--ink)', letterSpacing:'-0.01em'}}>{title}</div>
          <div style={{fontSize:13, color:'var(--ink-muted)', marginTop:4}}>{desc}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function TOC({active, setActive}) {
  return (
    <nav style={{
      position:'sticky', top:14, alignSelf:'flex-start',
      width:230, marginRight:24,
      paddingRight:14, borderRight:'1px solid var(--line)',
      maxHeight:'calc(100vh - 28px)', overflowY:'auto'
    }}>
      <div style={{
        fontSize:10, color:'var(--ink-muted)', textTransform:'uppercase',
        letterSpacing:'0.1em', marginBottom:10, fontWeight:700
      }}>Sections</div>
      {SECTIONS.map(s=>(
        <a key={s.id} href={`#${s.id}`}
          onClick={()=>setActive(s.id)}
          style={{
            display:'flex', alignItems:'baseline', gap:8,
            padding:'8px 10px', borderRadius:6, marginBottom:2,
            textDecoration:'none',
            background: active===s.id ? '#dfe9ff' : 'transparent',
            color: active===s.id ? 'var(--accent)' : 'var(--ink-dim)',
            fontWeight: active===s.id ? 600 : 400,
            transition:'all 0.12s'
          }}
          onMouseEnter={e=>{ if (active!==s.id) e.currentTarget.style.background='#f1f5fb'; }}
          onMouseLeave={e=>{ if (active!==s.id) e.currentTarget.style.background='transparent'; }}>
          <div style={{
            fontFamily:'JetBrains Mono, monospace', fontSize:11,
            color: active===s.id ? 'var(--accent)' : 'var(--ink-muted)',
            minWidth:24, fontWeight:700
          }}>{s.num}</div>
          <div style={{fontSize:13}}>{s.title}</div>
        </a>
      ))}
      <div style={{marginTop:18, paddingTop:14, borderTop:'1px solid var(--line)', fontSize:10, color:'var(--ink-muted)', lineHeight:1.5}}>
        IEEE 802.11be-2024<br/>§36.3 · §10.12 · §19.3
      </div>
    </nav>
  );
}

function App() {
  const [params, setParams] = useStateM({
    BW: 320, MCS: 13, APEP: 5000, GI: 3.2, LTFType: 4, NumMPDUs: 1
  });
  const [tlSel, setTlSel] = useStateM(8);
  const [active, setActive] = useStateM('sec-overview');
  const c = window.EHT.compute(params);

  // Scroll-spy: update active TOC entry on scroll
  useEffectM(()=>{
    const handler = () => {
      // find the section whose top is closest to (but ≤) viewport top + 100px
      let best = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= 120) best = s.id;
      }
      setActive(best);
    };
    window.addEventListener('scroll', handler, {passive:true});
    return ()=>window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div style={{display:'flex', alignItems:'flex-start'}}>
      <TOC active={active} setActive={setActive}/>
      <div style={{flex:1, minWidth:0}}>
        <h1>802.11be EHT Waveform Explorer</h1>
        <div className="sub">
          <span className="pill">Wi-Fi 7</span>
          <span className="pill">EHT MU PPDU</span>
          <span className="pill">SU · NSS=1</span>
          Interactive walk-through of the bit pipeline from APEP_LENGTH bytes to time-domain samples. All numbers below recompute live as you change parameters above.
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%)',
          border: '1px solid var(--accent)',
          borderLeft: '4px solid var(--accent)',
          borderRadius: 8,
          padding: '14px 18px',
          marginBottom: 20,
          fontSize: 13,
          lineHeight: 1.6
        }}>
          <div style={{display:'flex', alignItems:'baseline', flexWrap:'wrap', gap:10}}>
            <span style={{fontWeight:700, color:'var(--accent)', fontSize:14}}>Built on the open-source Python reference</span>
            <span style={{color:'var(--ink-muted)'}}>·</span>
            <a href="https://github.com/zonelincosmos/wifi7-eht-waveform-generator-python"
               target="_blank" rel="noopener noreferrer"
               style={{color:'var(--accent)', fontFamily:'JetBrains Mono, monospace', fontWeight:600, textDecoration:'none'}}>
              github.com/zonelincosmos/wifi7-eht-waveform-generator-python
            </a>
          </div>
          <div style={{marginTop:8, color:'var(--ink-dim)'}}>
            This explorer is a browser port of the spec-compliant Python generator implementing IEEE 802.11be-2024
            §36.3 — A-MPDU assembly, scrambler (PN11), LDPC encode (Annex F base matrices), constellation map
            (Gray-coded BPSK..4096-QAM), tone permutation (Eq. 36-72), pilots, NFFT=6144 IFFT, and all 9 preamble
            fields (L-STF/L-LTF/L-SIG/RL-SIG/U-SIG/EHT-SIG/EHT-STF/EHT-LTF). Use the Python repo for offline waveform
            generation, .npz export, automated test vectors, and reference VSA dumps.
          </div>
        </div>

        <window.Controls p={params} set={setParams} />
        <window.Headline c={c} p={params} />

        <Section {...SECTIONS[0]}>
          <window.Timeline c={c} p={params} sel={tlSel} setSel={setTlSel} />
          <div className="row">
            <div className="col" style={{flex:'1 1 460px'}}>
              <window.Concentric c={c} />
            </div>
            <div className="col" style={{flex:'2 1 600px'}}>
              <window.BitPipeline c={c} p={params} />
            </div>
          </div>
          <window.PipelineStepper c={c} />
        </Section>

        {/* II. Bytes, MAC & Scrambling — frame assembly + bit stream + scrambler + CRCs.
            CRCStepperViz lives here (not in Coding) because CRC is an information-layer
            integrity check, not a forward-error-correction step. */}
        <Section {...SECTIONS[1]}>
          <window.MPDUView c={c} />
          <window.AMPDUBytesViz c={c} />
          <window.MACHeaderView />
          <window.ByteBitsViz />
          <window.BitStream c={c} />
          <window.ScramblerTutorial />
          {window.ScramblerSeedRecoveryViz && <window.ScramblerSeedRecoveryViz p={params} />}
          <window.ScramblerSpectrumViz />
          <window.CRCStepperViz />
        </Section>

        {/* III. Error Correction & Channel Shaping — LDPC math, BCC trellis, tone
            mapping, puncturing. All deal with redundancy / channel adaptation. */}
        <Section {...SECTIONS[2]}>
          <window.LDPCParams c={c} />
          {window.LDPCBaseMatrixViz && <window.LDPCBaseMatrixViz p={params} />}
          {window.BCCTrellisViz && <window.BCCTrellisViz p={params} />}
          <window.ToneMapViz p={params} />
          <window.PuncturingViz p={params} />
        </Section>

        {/* IV. Constellation & Subcarrier Layout — bits → symbols → frequency grid. */}
        <Section {...SECTIONS[3]}>
          <window.ConstellationExplorer c={c} />
          {window.GrayVsBinaryViz && <window.GrayVsBinaryViz p={params} />}
          <window.CoordViz />
          <window.SubcarrierMap c={c} p={params} />
          <window.PilotClockViz c={c} />
          {window.PerSCBitsDiffViz && <window.PerSCBitsDiffViz p={params} />}
        </Section>

        {/* V. Preamble & Signaling — L-STF / L-LTF / SIG fields / EHT-LTF. */}
        <Section {...SECTIONS[4]}>
          <window.LSigViz c={c} p={params} />
          <window.USigViz />
          <window.EhtSigViz />
          <window.LSTFViz p={params} />
          <window.EHTLTFViz />
        </Section>

        {/* VI. Time-Domain Synthesis — last DSP step before the DAC. */}
        <Section {...SECTIONS[5]}>
          <window.IFFTViz />
          <window.CPISIViz />
          <window.PEWindowViz />
        </Section>

        {/* VII. Multi-User OFDMA — RU / MRU layouts that split SCs across users. */}
        <Section {...SECTIONS[6]}>
          <window.OFDMARUViz />
        </Section>

        <Section {...SECTIONS[7]}>
          <window.PHYRateCalc />
        </Section>

        <Section {...SECTIONS[8]}>
          {window.BitTraceTool && <window.BitTraceTool p={params} />}
        </Section>

        <div className="footer">
          Spec refs: IEEE 802.11be-2024 §36.3 (PHY) · IEEE 802.11-2024 §10.12 (A-MPDU) · §19.3.11 (LDPC) · §17.3.5 (BCC) · §27 (HE legacy fields).
          {' · '}
          Source: <a href="https://github.com/zonelincosmos/wifi7-eht-waveform-generator-python"
            target="_blank" rel="noopener noreferrer"
            style={{color:'var(--accent)'}}>zonelincosmos/wifi7-eht-waveform-generator-python</a>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
