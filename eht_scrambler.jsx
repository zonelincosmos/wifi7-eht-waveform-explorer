// SPDX-License-Identifier: MIT
// Copyright (c) 2026 zonelincosmos
// JavaScript port companion of ref/wifi7-python/modulation/scrambler.py
// EHT Scrambler — interactive walkthrough (rebuild v3)
//
// IEEE 802.11be-2024 §36.3.13.2 · Eq. 36-46 · Fig. 36-50
//   S(x) = x^11 + x^9 + 1
//
// Visual goals:
//   • Conveyor-belt metaphor: 11 cells, bits travel rightward, output drops out the end
//   • Spec-aligned: feedback line on top, tap dots, X11..X1 left-to-right matches Fig 36-50
//   • Educational-warm: warm palette, rounded cards, soft gradients
//   • Layered explainer: ①polynomial ②shift ③feedback ④output XOR ⑤descrambler symmetry
//   • Hybrid animation: play=smooth (350ms ease), step=discrete
//   • Piano-roll bit stream: 3 rows share timeline, cursor sweeps columns
//   • SERVICE comparison card: seed=all-1s, first 16 PN bits

const { useState: useSc, useEffect: useEc, useRef: useRc, useMemo: useMc } = React;

// ---------- LFSR core ----------
// Array convention: regs[i] holds X_{i+1}. So regs[0]=X₁, regs[8]=X₉, regs[10]=X₁₁.
// Per IEEE 802.11be-2024 Fig 36-50 the OUTPUT tap is X₁₁ and feedback fb = X₉ ⊕ X₁₁.
// Shift each clock: every X_i ← X_{i+1} (X₁₁ falls off as the PN bit), and the new X₁
// receives the freshly-computed fb at index 0.
//
// Earlier revisions of this file mirrored both the output tap and the shift direction,
// producing a different sequence than the spec test vector (NOTE 1: with seed = 0x7FF
// the first 11 output bits should all be 1). The fix below restores spec-correct math
// while keeping the existing visual cell-mapping (the ConveyorBelt SVG renders X₁₁ at
// the leftmost cell and labels via `cellVal(i) = before[10 - i]`, so reading before[10]
// first stays consistent with what the user sees).
function scrStep(regs) {
  const out = regs[10];                                   // X₁₁ → PN output
  const fb  = regs[8] ^ regs[10];                         // X₉ ⊕ X₁₁
  const next = [fb, regs[0], regs[1], regs[2], regs[3], regs[4],
                regs[5], regs[6], regs[7], regs[8], regs[9]];
  return { out, fb, next };
}
function scrRun(seed11, inputBits) {
  const recs = [];
  let regs = seed11.slice();
  for (let n = 0; n < inputBits.length; n++) {
    const before = regs.slice();
    const { out, fb, next } = scrStep(regs);
    const inBit = inputBits[n];
    recs.push({ n, before, tapX11: before[10], tapX9: before[8], sBit: out, fb, inBit, outBit: inBit ^ out, after: next });
    regs = next;
  }
  return recs;
}
function strToBits(s, lenHint) {
  s = s.trim().replace(/\s+/g,'').toLowerCase();
  let bits = [];
  if (s.startsWith('0x')) {
    for (let i = 2; i < s.length; i++) {
      const v = parseInt(s[i], 16);
      if (Number.isNaN(v)) continue;
      for (let b = 3; b >= 0; b--) bits.push((v >> b) & 1);
    }
  } else if (/^[01]+$/.test(s)) {
    bits = s.split('').map(c => +c);
  } else {
    for (let i = 0; i < s.length; i++) {
      const v = s.charCodeAt(i) & 0xff;
      for (let b = 7; b >= 0; b--) bits.push((v >> b) & 1);
    }
  }
  if (lenHint && bits.length < lenHint) while (bits.length < lenHint) bits.push(0);
  return bits;
}
function bitsToHex(bits) {
  if (!bits.length) return '';
  const padded = bits.slice();
  while (padded.length % 4) padded.push(0);
  let s = '';
  for (let i = 0; i < padded.length; i += 4) {
    let v = 0;
    for (let b = 0; b < 4; b++) v = (v << 1) | padded[i+b];
    s += v.toString(16);
  }
  return s.toUpperCase();
}
// Integer convention: X₁ = MSB (bit 10), X₁₁ = LSB (bit 0). This matches
// ref/wifi7-python/modulation/scrambler.py and eht_pipeline.jsx (line 201,
// `reg[i] = (init >> (10-i)) & 1`). Seed integer 1 ("0x001") therefore means
// "lone X₁₁ = 1" in spec notation, NOT "lone X₁ = 1".
function seedToInt(seed) {
  let v = 0;
  for (let i = 0; i < 11; i++) if (seed[i]) v |= (1 << (10 - i));
  return v;
}

const SEED_PRESETS = [
  { label: 'all-1s · 0x7FF',   bits: [1,1,1,1,1,1,1,1,1,1,1], note: 'Spec NOTE 1 test vector' },
  { label: '0x555 · palindrome', bits: [1,0,1,0,1,0,1,0,1,0,1], note: 'X₁=X₃=X₅=X₇=X₉=X₁₁=1' },
  { label: '0x400 · lone X₁',  bits: [1,0,0,0,0,0,0,0,0,0,0], note: 'X₁=1, all others 0 (=integer 1024)' },
  { label: '0x001 · lone X₁₁', bits: [0,0,0,0,0,0,0,0,0,0,1], note: 'X₁₁=1 (=Python init_state=1)' }
];

// SERVICE field reference: with seed=all-1s, the first 16 PN bits are:
// X1..X11 = all 1s, then 5 more clocks of feedback. Compute statically once.
const SERVICE_REF = (() => {
  const recs = scrRun([1,1,1,1,1,1,1,1,1,1,1], new Array(16).fill(0));
  return recs.map(r => r.sBit);
})();

// ---------- Educational-warm palette ----------
// Warm peach / amber / sage / dusty-rose; cream backdrops; deep ink for text.
const SC = {
  bg:        '#FFF8F0',     // cream
  bg2:       '#FCEFD9',     // pale peach
  bgWarm:    'linear-gradient(135deg, #FFF4E1 0%, #FCE3CB 100%)',
  card:      '#FFFFFF',
  cardSoft:  '#FFFAF2',
  ink:       '#2A1F1A',     // deep warm ink
  inkDim:    '#5C4A3F',
  inkMuted:  '#8B7766',
  line:      '#EDD9BF',
  lineSoft:  '#F5E6CE',

  amber:     '#E8893C',     // primary accent
  amberSoft: '#FAD8AE',
  amberDeep: '#B95F12',

  sage:      '#7BA68A',     // secondary
  sageSoft:  '#D4E6DA',
  sageDeep:  '#476B53',

  rose:      '#D6657A',     // tertiary
  roseSoft:  '#F5C8D1',
  roseDeep:  '#9C3F52',

  plum:      '#7C5CA8',
  plumSoft:  '#DECCEC',
  plumDeep:  '#4F3677',
};

const ANIM = {
  ease: 'cubic-bezier(0.32, 0.72, 0.35, 1.0)',
  step: 380,    // ms — single play tick (smooth)
};

// ---------- Main component ----------
function ScramblerTutorial() {
  const [seed, setSeed]       = useSc([1,1,1,1,1,1,1,1,1,1,1]);
  const [inputText, setInput] = useSc('0x0000');
  const [step, setStep]       = useSc(0);
  const [playing, setPlaying] = useSc(false);
  const [speed, setSpeed]     = useSc(2);  // play ticks per second
  const [reveal, setReveal]   = useSc(5);  // mini-panel reveal level (1..5)
  const [showDescrambler, setShowDescr] = useSc(false);

  const inputBits = useMc(()=> strToBits(inputText, 11), [inputText]);
  const records   = useMc(()=> scrRun(seed, inputBits), [seed, inputBits]);

  useEc(()=>{
    if (!playing) return;
    const id = setInterval(()=>{
      setStep(s => {
        if (s + 1 >= records.length) { setPlaying(false); return records.length - 1; }
        return s + 1;
      });
    }, Math.max(150, 1000 / speed));
    return ()=> clearInterval(id);
  }, [playing, speed, records.length]);

  useEc(()=>{ if (step >= records.length) setStep(Math.max(0, records.length - 1)); }, [records.length, step]);

  const cur = records[step] || records[0];
  const N = records.length;
  const seedZero = seed.every(b => b === 0);
  const seedInt  = seedToInt(seed);

  return (
    <div className="panel" style={{
      background: SC.bgWarm,
      border: `1px solid ${SC.line}`,
      padding: '22px 24px 26px',
      borderRadius: 14,
    }}>
      <ScrTitle/>

      {/* "What this whole panel does" — plain-language story before the LFSR diagram */}
      <PlainLanguageIntro/>

      {/* Mini-panel reveal selector */}
      <RevealStrip reveal={reveal} setReveal={setReveal}/>

      {/* ① Polynomial card */}
      <PolyCard reveal={reveal}/>

      {/* Controls */}
      <SeedAndInputControls
        seed={seed} setSeed={setSeed} seedZero={seedZero} seedInt={seedInt}
        inputText={inputText} setInput={setInput} inputBitsLen={inputBits.length}
        setStep={setStep}
      />

      {/* Playback */}
      <PlaybackBar
        step={step} N={N} playing={playing} setPlaying={setPlaying}
        setStep={setStep} speed={speed} setSpeed={setSpeed}
      />

      {/* ②③④ Conveyor-belt diagram */}
      <ConveyorBelt cur={cur} step={step} playing={playing} reveal={reveal}/>

      {/* Step explanation */}
      <StepExplain cur={cur} step={step} reveal={reveal}/>

      {/* Mini-panels: shift / feedback / xor */}
      {reveal >= 2 && <MiniPanels cur={cur} reveal={reveal}/>}

      {/* Piano-roll bit stream */}
      <PianoRoll records={records} step={step} setStep={setStep}/>

      {/* ⑤ Descrambler symmetry */}
      {reveal >= 5 && <DescramblerCard records={records} step={step}
        showDescrambler={showDescrambler} setShowDescr={setShowDescr}/>}

      {/* SERVICE-field comparison */}
      <ServiceCard seed={seed} records={records}/>
    </div>
  );
}

// ---------- "What is this whole thing" plain-language intro ----------
// Goal: before showing the wire-spaghetti SVG, explain in human language
// what scrambling actually does, what the 3 streams are, and why anyone cares.
function PlainLanguageIntro() {
  return (
    <div style={{
      background: '#FFFDF5', border: `1px solid ${SC.amberSoft}`,
      borderRadius: 12, padding: '14px 18px', marginBottom: 18,
      boxShadow: '0 1px 2px rgba(184,95,18,0.04)',
    }}>
      <div style={{fontSize:11, fontWeight:700, color:SC.amberDeep, textTransform:'uppercase',
                    letterSpacing:'0.1em', marginBottom:8}}>
        What this panel actually does
      </div>
      <div style={{fontSize:13, color:SC.inkDim, lineHeight:1.7, marginBottom:10}}>
        A WiFi transmitter takes your raw data bits (PSDU + SERVICE) and XORs them
        bit-by-bit with a pseudo-random sequence before sending. This is called
        <b style={{color:SC.amberDeep}}> scrambling</b>. The point is to <b>whiten the
        spectrum</b> so a long run of identical data bits doesn't accidentally produce a tone.
        The receiver runs the SAME XOR with the SAME sequence to recover the data — XOR is its
        own inverse.
      </div>

      {/* Three-stream story: in / PN / out */}
      <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:'8px 14px',
                    fontSize:12.5, fontFamily:'JetBrains Mono, monospace', alignItems:'center', marginTop:6}}>
        <span style={{color:SC.sageDeep, fontWeight:700, padding:'2px 8px',
                      background: SC.sageSoft, borderRadius:5}}>
          in
        </span>
        <span><b>Data input</b> — your raw bits going INTO the scrambler (e.g. SERVICE
          all-zeros, then your PSDU bytes). One bit per clock.</span>

        <span style={{color:SC.roseDeep, fontWeight:700, padding:'2px 8px',
                      background: 'rgba(244, 114, 182, 0.12)', borderRadius:5}}>
          PN
        </span>
        <span><b>Pseudo-random Number bit</b> — what the 11-bit shift-register
          (LFSR) emits this clock. Looks random, but completely deterministic given the seed.
          <i> This is the only thing the LFSR diagram below actually computes.</i></span>

        <span style={{color:SC.plumDeep, fontWeight:700, padding:'2px 8px',
                      background: 'rgba(168, 85, 247, 0.12)', borderRadius:5}}>
          out
        </span>
        <span><b>Scrambled output</b> = <code>in ⊕ PN</code>. This is what
          actually goes on the air (after FEC, IFFT, etc.).</span>
      </div>

      <div style={{fontSize:12, color:SC.inkMuted, marginTop:10, lineHeight:1.6}}>
        <b style={{color:SC.amberDeep}}>How to read the diagram below:</b> the 11 boxes (X₁…X₁₁) are
        register cells. Every clock the bits inside SHIFT one cell to the right. The
        rightmost cell (X₁₁) drops its bit out the bottom — that's the PN bit for this clock.
        Two of the cells (X₁₁ and X₉) feed back UP into a XOR; the result drops into the leftmost
        cell to refill the register. Then the data XOR happens at the bottom-right: <code>in ⊕ PN</code>.
      </div>
    </div>
  );
}

// ---------- Title ----------
function ScrTitle() {
  return (
    <div style={{display:'flex', alignItems:'flex-end', gap:14, marginBottom:18, flexWrap:'wrap'}}>
      <div>
        <div style={{fontSize:11, fontWeight:600, color:SC.amberDeep, letterSpacing:'0.14em', textTransform:'uppercase', marginBottom:4}}>
          Step 5 · Data Scrambler
        </div>
        <h2 style={{margin:0, fontSize:26, fontWeight:700, color:SC.ink, letterSpacing:'-0.01em'}}>
          The 11-bit conveyor belt
        </h2>
        <div style={{fontSize:14, color:SC.inkDim, marginTop:6, maxWidth:680, lineHeight:1.55}}>
          Every Data-field bit gets XOR'd with a pseudo-random sequence so the on-air spectrum stays white.
          The PN generator is a Fibonacci LFSR with polynomial <b style={{color:SC.amberDeep, fontFamily:'JetBrains Mono, monospace'}}>S(x) = x¹¹ + x⁹ + 1</b>.
        </div>
      </div>
      <div style={{flex:1}}/>
      <div style={{
        background: '#fff', border: `1px solid ${SC.line}`, borderRadius: 10,
        padding: '8px 14px', fontSize: 11, color: SC.inkMuted,
        fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.04em'
      }}>
        IEEE 802.11be-2024 · §36.3.13.2 · Fig 36-50
      </div>
    </div>
  );
}

// ---------- Mini-panel reveal strip ----------
function RevealStrip({reveal, setReveal}) {
  const stages = [
    { n: 1, t: 'Polynomial' },
    { n: 2, t: 'Shift' },
    { n: 3, t: 'Feedback' },
    { n: 4, t: 'Output XOR' },
    { n: 5, t: 'Symmetry' },
  ];
  return (
    <div style={{
      display:'flex', gap:8, marginBottom:18, flexWrap:'wrap',
      background: 'rgba(255,255,255,0.55)', borderRadius:10, padding:8,
      border: `1px solid ${SC.lineSoft}`,
    }}>
      <div style={{fontSize:10, color:SC.inkMuted, alignSelf:'center', textTransform:'uppercase', letterSpacing:'0.1em', padding:'0 6px', fontWeight:600}}>
        Reveal up to:
      </div>
      {stages.map(s => {
        const active = reveal >= s.n;
        const sel = reveal === s.n;
        return (
          <button key={s.n} onClick={()=>setReveal(s.n)}
            style={{
              padding:'6px 12px', borderRadius:7, border:'none', cursor:'pointer',
              fontSize:12, fontWeight:600, fontFamily:'inherit',
              background: sel ? SC.amber : (active ? SC.amberSoft : '#fff'),
              color:      sel ? '#fff'   : (active ? SC.amberDeep : SC.inkMuted),
              border: `1px solid ${sel ? SC.amber : SC.lineSoft}`,
              boxShadow: sel ? `0 2px 6px ${SC.amberSoft}` : 'none',
              transition: 'all 0.18s'
            }}>
            <span style={{opacity:0.7, marginRight:4}}>{['①','②','③','④','⑤'][s.n-1]}</span>{s.t}
          </button>
        );
      })}
    </div>
  );
}

// ---------- ① Polynomial card ----------
function PolyCard({reveal}) {
  return (
    <div style={{
      background:'#fff', borderRadius:12, padding:'18px 22px', marginBottom:16,
      border: `1px solid ${SC.line}`,
      boxShadow:'0 1px 2px rgba(184,95,18,0.04), 0 4px 12px rgba(184,95,18,0.04)',
    }}>
      <div style={{display:'flex', gap:18, alignItems:'center', flexWrap:'wrap'}}>
        <div style={{
          width:42, height:42, borderRadius:10, background: SC.amberSoft,
          display:'flex', alignItems:'center', justifyContent:'center',
          color: SC.amberDeep, fontSize:20, fontWeight:700, flexShrink:0
        }}>①</div>
        <div style={{minWidth:240}}>
          <div style={{fontSize:11, color:SC.amberDeep, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600, marginBottom:3}}>
            The polynomial
          </div>
          <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:24, color:SC.ink, fontWeight:600, letterSpacing:'-0.01em'}}>
            S(x) = x<sup>11</sup> + x<sup>9</sup> + 1
          </div>
        </div>
        <div style={{flex:1, minWidth:280, fontSize:13, color:SC.inkDim, lineHeight:1.65}}>
          Two non-zero terms (besides the constant) → exactly two <b style={{color:SC.rose}}>tap points</b>: bit positions
          {' '}<TapBadge n={11}/> and <TapBadge n={9}/>. The XOR of those taps becomes tomorrow's
          {' '}<TapBadge n={11}/>. This particular polynomial is <em>primitive</em>, so the sequence cycles through all 2¹¹−1 = <b style={{color:SC.amberDeep}}>2047</b> non-zero states before repeating.
        </div>
      </div>
    </div>
  );
}
function TapBadge({n}) {
  return (
    <span style={{
      display:'inline-block', padding:'1px 8px', borderRadius:6,
      background: SC.roseSoft, color: SC.roseDeep, fontFamily:'JetBrains Mono, monospace',
      fontSize:12, fontWeight:700, letterSpacing:'-0.01em',
    }}>X<sub style={{fontSize:10}}>{n}</sub></span>
  );
}

// ---------- Seed + input controls ----------
function SeedAndInputControls({seed, setSeed, seedZero, seedInt, inputText, setInput, inputBitsLen, setStep}) {
  return (
    <div style={{
      background:'#fff', borderRadius:12, padding:'16px 20px', marginBottom:14,
      border: `1px solid ${SC.line}`,
      display:'grid', gridTemplateColumns:'1fr 1fr', gap:24
    }}>
      {/* Seed */}
      <div>
        <FieldLabel>Initial state · X₁ → X₁₁ &nbsp;<span style={{textTransform:'none', color:SC.inkMuted, fontWeight:400}}>(non-zero)</span></FieldLabel>
        <div style={{display:'flex', gap:4, marginTop:6}}>
          {seed.map((b,i)=>{
            const isTap = (i === 8 || i === 10);
            return (
              <button key={i}
                onClick={()=>{
                  const nx = seed.slice(); nx[i] = b ? 0 : 1;
                  if (!nx.every(x=>x===0)) setSeed(nx);
                  setStep(0);
                }}
                style={{
                  flex:1, height:44, fontFamily:'JetBrains Mono, monospace', fontSize:16, fontWeight:700,
                  border: `2px solid ${b ? SC.amber : SC.line}`, borderRadius:8, cursor:'pointer',
                  background: b ? `linear-gradient(180deg, ${SC.amber}, ${SC.amberDeep})` : '#fff',
                  color: b ? '#fff' : SC.inkMuted,
                  boxShadow: b ? `0 2px 4px ${SC.amberSoft}` : 'none',
                  position:'relative', transition:'all 0.15s'
                }}>
                {b}
                {isTap && <span style={{
                  position:'absolute', top:-5, right:-3, width:9, height:9, borderRadius:'50%',
                  background: SC.rose, border:'2px solid #fff'
                }}/>}
              </button>
            );
          })}
        </div>
        <div style={{fontSize:10, color:SC.inkMuted, marginTop:5, fontFamily:'JetBrains Mono, monospace', display:'flex', justifyContent:'space-between'}}>
          <span>X₁ &nbsp; X₂ &nbsp; X₃ &nbsp; X₄ &nbsp; X₅ &nbsp; X₆ &nbsp; X₇ &nbsp; X₈ &nbsp; X₉ &nbsp;X₁₀ &nbsp;X₁₁</span>
          <span style={{color:SC.amberDeep, fontWeight:600}}>= 0x{seedInt.toString(16).toUpperCase().padStart(3,'0')}</span>
        </div>
        <div style={{display:'flex', gap:5, marginTop:9, flexWrap:'wrap'}}>
          {SEED_PRESETS.map((p,i)=>(
            <button key={i} onClick={()=>{ setSeed(p.bits); setStep(0); }}
              style={pillBtn()}
              title={p.note}>
              {p.label}
            </button>
          ))}
        </div>
        {seedZero && <div style={{display:'inline-block', marginTop:6, padding:'3px 9px', background: SC.roseSoft, color: SC.roseDeep, borderRadius:5, fontSize:11, fontFamily:'JetBrains Mono, monospace'}}>
          ⚠ seed must be non-zero
        </div>}
      </div>

      {/* Input */}
      <div>
        <FieldLabel>Input bits &nbsp;<span style={{textTransform:'none', color:SC.inkMuted, fontWeight:400}}>(0x… / 0/1 / ASCII)</span></FieldLabel>
        <input value={inputText} onChange={e=>{ setInput(e.target.value); setStep(0); }}
          style={{
            width:'100%', marginTop:6, padding:'10px 12px',
            border:`2px solid ${SC.line}`, borderRadius:8,
            fontFamily:'JetBrains Mono, monospace', fontSize:14, color:SC.ink, background: SC.cardSoft,
            outline:'none', transition:'border 0.15s',
          }}
          onFocus={e=>e.target.style.borderColor = SC.amber}
          onBlur={e=>e.target.style.borderColor = SC.line}
        />
        <div style={{fontSize:11, color:SC.inkMuted, marginTop:5, fontFamily:'JetBrains Mono, monospace'}}>
          {inputBitsLen} bits · try <code style={{background:SC.bg2, padding:'1px 6px', borderRadius:4, color:SC.amberDeep}}>0x0000</code> to see raw PN sequence
        </div>
        <div style={{display:'flex', gap:5, marginTop:9, flexWrap:'wrap'}}>
          <button onClick={()=>{ setInput('0x0000'); setStep(0); }} style={pillBtn()}>SERVICE (16×0)</button>
          <button onClick={()=>{ setInput('0'.repeat(127)); setStep(0); }} style={pillBtn()}>127 zeros</button>
          <button onClick={()=>{ setInput('0xDEADBEEF'); setStep(0); }} style={pillBtn()}>0xDEADBEEF</button>
          <button onClick={()=>{ setInput('Hello!'); setStep(0); }} style={pillBtn()}>"Hello!"</button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({children}) {
  return <div style={{fontSize:11, color:SC.amberDeep, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.1em'}}>{children}</div>;
}
function pillBtn() {
  return {
    fontSize:11, padding:'4px 10px', border:`1px solid ${SC.lineSoft}`, borderRadius:6,
    background:'#fff', cursor:'pointer', color: SC.amberDeep,
    fontFamily:'JetBrains Mono, monospace', fontWeight:500,
    transition:'all 0.12s'
  };
}

// ---------- Playback bar ----------
function PlaybackBar({step, N, playing, setPlaying, setStep, speed, setSpeed}) {
  return (
    <div style={{
      background:'#fff', borderRadius:12, padding:'12px 18px', marginBottom:14,
      border: `1px solid ${SC.line}`,
      display:'flex', gap:18, alignItems:'center', flexWrap:'wrap'
    }}>
      <div style={{display:'flex', gap:6}}>
        <CtrlBtn onClick={()=>{ setStep(0); setPlaying(false); }}>⏮</CtrlBtn>
        <CtrlBtn onClick={()=>{ setStep(s=>Math.max(0,s-1)); setPlaying(false); }}>◀</CtrlBtn>
        <CtrlBtn onClick={()=>setPlaying(p=>!p)} primary>
          {playing ? '⏸ Pause' : '▶ Play'}
        </CtrlBtn>
        <CtrlBtn onClick={()=>{ setStep(s=>Math.min(N-1,s+1)); setPlaying(false); }}>▶</CtrlBtn>
      </div>
      <div style={{flex:1, minWidth:180}}>
        <input type="range" min={0} max={Math.max(0, N-1)} step={1} value={step}
          onChange={e=>{ setStep(+e.target.value); setPlaying(false); }}
          style={{width:'100%', accentColor: SC.amber}}/>
        <div style={{fontSize:11, color:SC.inkMuted, fontFamily:'JetBrains Mono, monospace', marginTop:2, display:'flex', justifyContent:'space-between'}}>
          <span>tick</span>
          <span style={{color:SC.amberDeep, fontWeight:600}}>{step+1} / {N}</span>
        </div>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:8, minWidth:160}}>
        <span style={{fontSize:10, color:SC.inkMuted, textTransform:'uppercase', letterSpacing:'0.08em'}}>speed</span>
        <input type="range" min={1} max={20} step={1} value={speed} onChange={e=>setSpeed(+e.target.value)}
          style={{flex:1, accentColor: SC.sage}}/>
        <span style={{fontFamily:'JetBrains Mono, monospace', fontSize:11, color:SC.sageDeep, fontWeight:600, minWidth:30}}>{speed}/s</span>
      </div>
    </div>
  );
}
function CtrlBtn({children, onClick, primary}) {
  return (
    <button onClick={onClick}
      style={{
        padding: primary ? '8px 16px' : '8px 12px',
        fontSize: 13, fontWeight: 600, fontFamily:'inherit',
        border: `1.5px solid ${primary ? SC.amber : SC.line}`, borderRadius: 7, cursor:'pointer',
        background: primary ? `linear-gradient(180deg, ${SC.amber}, ${SC.amberDeep})` : '#fff',
        color:      primary ? '#fff' : SC.ink,
        boxShadow:  primary ? `0 2px 6px ${SC.amberSoft}` : 'none',
        transition: 'all 0.15s'
      }}>{children}</button>
  );
}

// ---------- ②③④ Conveyor belt SVG ----------
// Layout per IEEE Fig 36-50:
//   feedback line on TOP, register cells X11..X1 LEFT-to-RIGHT,
//   tap pickoffs at X11 and X9 going UP into the feedback adder,
//   output X₁₁ drops out the left side (X11=leftmost cell), then meets the data XOR.
function ConveyorBelt({cur, step, playing, reveal}) {
  if (!cur) return null;

  const cellW = 72, cellH = 68, gap = 8;
  const padL = 160, padR = 320, padT = 170, padB = 150;
  const xs = [];
  for (let i = 0; i < 11; i++) xs.push(padL + i * (cellW + gap));
  const yReg = padT;
  const W = padL + 11*(cellW+gap) - gap + padR;
  const H = padT + cellH + padB;

  // Visual cell index 0..10 (left→right) shows X_{11-i}, i.e. before[10-i]
  const cellName = i => 11 - i;
  const cellVal  = i => cur.before[10 - i];
  const isTap    = i => (i === 0 || i === 2);    // X11 (i=0), X9 (i=2)
  const x_X11 = xs[0]  + cellW/2;
  const x_X9  = xs[2]  + cellW/2;
  const x_X1  = xs[10] + cellW/2;

  const yFBtop  = yReg - 110;           // top feedback rail (X11 tap goes here)
  const yFBmid  = yReg - 70;            // middle rail (X9 tap goes here, below X11 tap)
  const xFBxor  = padL - 90;            // feedback adder x-pos (left of register)
  const yFBxor  = yReg + cellH/2;
  const xOutXor = xs[10] + cellW + 110;
  const yOutXor = yReg + cellH + 100;

  return (
    <div style={{
      background:'#fff', borderRadius:14, padding:'18px 20px 12px', marginBottom:14,
      border: `1px solid ${SC.line}`,
      boxShadow:'0 1px 2px rgba(184,95,18,0.04), 0 6px 18px rgba(184,95,18,0.05)',
      overflowX:'auto'
    }}>
      <div style={{fontSize:13, color:SC.amberDeep, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700, marginBottom:4}}>
        The 11-cell shift register &amp; the data XOR
      </div>
      <div style={{fontSize:12, color:SC.inkMuted, marginBottom:10, lineHeight:1.55}}>
        Three colour-coded zones:
        {' '}<b style={{color:SC.roseDeep}}>red</b> = LFSR feedback path (taps from X₁₁ &amp; X₉ →
        XOR → back into X₁₁ to refill the register).
        {' '}<b style={{color:SC.amberDeep}}>amber</b> = the 11 register cells (showing their
        current bit values).
        {' '}<b style={{color:SC.plumDeep}}>purple</b> = the data XOR — where the PN bit (out of
        cell X₁₁) meets your incoming data bit, producing the scrambled output.
      </div>

      <svg width={W} height={H} style={{display:'block', margin:'0 auto', minWidth:W}}>
        <defs>
          <linearGradient id="cell-on" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SC.amber}/>
            <stop offset="100%" stopColor={SC.amberDeep}/>
          </linearGradient>
          <linearGradient id="cell-off" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff"/>
            <stop offset="100%" stopColor={SC.cardSoft}/>
          </linearGradient>
          <marker id="arrR" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9 Z" fill={SC.rose}/>
          </marker>
          <marker id="arrG" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9 Z" fill={SC.sageDeep}/>
          </marker>
          <marker id="arrP" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9 Z" fill={SC.plum}/>
          </marker>
          <marker id="arrK" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={SC.inkMuted}/>
          </marker>
          <filter id="cellShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor={SC.amberDeep} floodOpacity="0.15"/>
          </filter>
        </defs>

        {/* Belt base "rails" — visual conveyor */}
        <rect x={padL - 14} y={yReg + cellH + 6} width={11*(cellW+gap) - gap + 28} height={6} rx={3}
              fill={SC.lineSoft}/>
        <rect x={padL - 14} y={yReg - 10} width={11*(cellW+gap) - gap + 28} height={4} rx={2}
              fill={SC.lineSoft} opacity="0.6"/>

        {/* Feedback line (top) — taps from X11, X9 go UP, then to feedback XOR */}
        {reveal >= 3 && (
          <g>
            {/* X11 tap goes up to top rail, then left into XOR */}
            <path d={`M ${x_X11} ${yReg - 4} V ${yFBtop} H ${xFBxor}`}
                  stroke={SC.rose} strokeWidth="2.5" fill="none"/>
            {/* X9 tap goes up to mid rail, then left into XOR (below the X11 line) */}
            <path d={`M ${x_X9} ${yReg - 4} V ${yFBmid} H ${xFBxor}`}
                  stroke={SC.rose} strokeWidth="2.5" fill="none"/>
            {/* Vertical drop from top+mid rails down into the XOR */}
            <line x1={xFBxor} y1={yFBtop} x2={xFBxor} y2={yFBxor - 18}
                  stroke={SC.rose} strokeWidth="2.5"/>
            {/* tap dots */}
            <circle cx={x_X11} cy={yReg - 4} r="6" fill={SC.rose} stroke="#fff" strokeWidth="2"/>
            <circle cx={x_X9}  cy={yReg - 4} r="6" fill={SC.rose} stroke="#fff" strokeWidth="2"/>
            {/* tap labels — placed ABOVE their respective rails so they never collide with X_n labels */}
            <text x={x_X11 + 16} y={yFBtop - 8} textAnchor="start" fontSize="14" fill={SC.roseDeep}
                  fontFamily="JetBrains Mono, monospace" fontWeight="700">tap X₁₁</text>
            <text x={x_X9 + 16}  y={yFBmid - 8} textAnchor="start" fontSize="14" fill={SC.roseDeep}
                  fontFamily="JetBrains Mono, monospace" fontWeight="700">tap X₉</text>

            {/* Feedback XOR adder */}
            <XorBubble cx={xFBxor} cy={yFBxor} val={cur.fb} color={SC.rose} colorDeep={SC.roseDeep}/>
            {/* fb formula */}
            <text x={xFBxor} y={yFBxor + 60} textAnchor="middle" fontSize="13"
                  fontFamily="JetBrains Mono, monospace" fill={SC.roseDeep} fontWeight="700">
              fb = X₁₁⊕X₉
            </text>
            <text x={xFBxor} y={yFBxor + 78} textAnchor="middle" fontSize="13"
                  fontFamily="JetBrains Mono, monospace" fill={SC.roseDeep}>
              {cur.tapX11}⊕{cur.tapX9} = <tspan fontWeight="700" fontSize="15">{cur.fb}</tspan>
            </text>

            {/* Feedback wire from XOR into X11 cell */}
            <line x1={xFBxor + 22} y1={yFBxor} x2={xs[0] - 4} y2={yFBxor}
                  stroke={SC.rose} strokeWidth="2.5" markerEnd="url(#arrR)"/>
          </g>
        )}

        {/* Register cells */}
        {[0,1,2,3,4,5,6,7,8,9,10].map(i => {
          const v = cellVal(i);
          const tap = isTap(i);
          return (
            <g key={i}>
              <rect x={xs[i]} y={yReg} width={cellW} height={cellH} rx={11}
                    fill={v ? 'url(#cell-on)' : 'url(#cell-off)'}
                    stroke={v ? SC.amberDeep : SC.line}
                    strokeWidth="2"
                    filter={v ? 'url(#cellShadow)' : ''}
                    style={{transition: `all ${ANIM.step}ms ${ANIM.ease}`}}/>
              <text x={xs[i] + cellW/2} y={yReg + cellH/2 + 11} textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace" fontSize="30" fontWeight="700"
                    fill={v ? '#fff' : SC.inkMuted}
                    style={{transition: `fill ${ANIM.step}ms ${ANIM.ease}`}}>{v}</text>
              <text x={xs[i] + cellW/2} y={yReg - 22} textAnchor="middle"
                    fontSize="15" fill={tap ? SC.roseDeep : SC.inkMuted}
                    fontWeight={tap ? 700 : 500}
                    fontFamily="JetBrains Mono, monospace">
                X<tspan fontSize="12" baselineShift="sub">{cellName(i)}</tspan>
              </text>
            </g>
          );
        })}

        {/* Internal shift arrows: values move LEFT→RIGHT (X11 is leftmost, X1 rightmost; X_i ← X_{i+1} means slot at i gets value from slot to its left) */}
        {reveal >= 2 && [0,1,2,3,4,5,6,7,8,9].map(i=>(
          <path key={i}
                d={`M ${xs[i] + cellW + 4} ${yReg + cellH + 56} L ${xs[i+1] - 4} ${yReg + cellH + 56}`}
                stroke={SC.inkMuted} strokeWidth="1.6" markerEnd="url(#arrK)" opacity="0.6"/>
        ))}
        {reveal >= 2 && (
          <text x={(xs[2] + xs[7] + cellW)/2} y={yReg + cellH + 80} textAnchor="middle"
                fontSize="13" fill={SC.inkMuted} fontFamily="JetBrains Mono, monospace" fontStyle="italic">
            shift right · X<tspan fontSize="11" baselineShift="sub">i</tspan> ← X<tspan fontSize="11" baselineShift="sub">i+1</tspan>
          </text>
        )}

        {/* Output: X11 (leftmost cell) drops down to output XOR per IEEE Fig 36-50 */}
        {reveal >= 4 && (
          <g>
            {/* X11 (leftmost) → drop down → over to output XOR */}
            <path d={`M ${x_X11} ${yReg + cellH + 6} V ${yOutXor} H ${xOutXor - 24}`}
                  stroke={SC.rose} strokeWidth="2.5" fill="none"/>
            <text x={x_X11 - 30} y={yReg + cellH + 30} fontSize="13"
                  fontFamily="JetBrains Mono, monospace" fill={SC.roseDeep} fontWeight="700">
              s_n = X₁₁ = {cur.sBit}
            </text>

            {/* Input wire — comes in from far left, well below the register, into output XOR */}
            <line x1={padL - 130} y1={yOutXor} x2={xOutXor - 24} y2={yOutXor}
                  stroke={SC.sageDeep} strokeWidth="2.5" markerEnd="url(#arrG)"/>
            <text x={padL - 130} y={yOutXor - 10} textAnchor="start" fontSize="13"
                  fontFamily="JetBrains Mono, monospace" fill={SC.sageDeep} fontWeight="700">
              in_n = {cur.inBit}
            </text>

            {/* Output XOR bubble */}
            <XorBubble cx={xOutXor} cy={yOutXor} val={cur.outBit} color={SC.plum} colorDeep={SC.plumDeep}/>

            {/* Output arrow */}
            <line x1={xOutXor + 24} y1={yOutXor} x2={xOutXor + 110} y2={yOutXor}
                  stroke={SC.plum} strokeWidth="2.5" markerEnd="url(#arrP)"/>
            <text x={xOutXor + 118} y={yOutXor - 8} fontSize="15"
                  fontFamily="JetBrains Mono, monospace" fill={SC.plumDeep} fontWeight="700">
              out = {cur.outBit}
            </text>
            <text x={xOutXor + 118} y={yOutXor + 12} fontSize="12"
                  fontFamily="JetBrains Mono, monospace" fill={SC.plum}>
              (scrambled)
            </text>
          </g>
        )}
      </svg>

      {/* Animation legend strip */}
      <div style={{display:'flex', gap:22, justifyContent:'center', flexWrap:'wrap', marginTop:10, fontSize:13, color:SC.inkDim}}>
        <LegendDot color={SC.amber} label="Register cell"/>
        <LegendDot color={SC.rose} label="Tap / feedback path"/>
        <LegendDot color={SC.sageDeep} label="Data input"/>
        <LegendDot color={SC.plum} label="Scrambled output"/>
      </div>
    </div>
  );
}

function XorBubble({cx, cy, val, color, colorDeep}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="22" fill="#fff" stroke={color} strokeWidth="2.5"/>
      <circle cx={cx} cy={cy} r="22" fill={color} opacity="0.08"/>
      <text x={cx} y={cy + 7} textAnchor="middle" fontSize="22" fontWeight="700" fill={colorDeep}>⊕</text>
      {val !== undefined && (
        <text x={cx + 17} y={cy - 14} fontSize="11" fontFamily="JetBrains Mono, monospace"
              fill={colorDeep} fontWeight="700">={val}</text>
      )}
    </g>
  );
}
function LegendDot({color, label}) {
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
      <span style={{width:10, height:10, borderRadius:'50%', background:color, display:'inline-block'}}/>
      <span>{label}</span>
    </span>
  );
}

// ---------- Step explanation ----------
function StepExplain({cur, step, reveal}) {
  if (!cur) return null;
  return (
    <div style={{
      background: SC.cardSoft, borderRadius:10, padding:'14px 18px', marginBottom:14,
      border: `1px solid ${SC.lineSoft}`,
      fontFamily:'JetBrains Mono, monospace', fontSize:13.5, lineHeight:1.9, color:SC.ink
    }}>
      <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:SC.inkMuted, fontFamily:'inherit', marginBottom:4, fontWeight:600}}>
        Tick {step+1} · what just happened
      </div>
      {/* Steps ordered to match the reveal levels (so the early reveals tell a coherent story) */}
      {reveal >= 2 && <div>① <span style={{color:SC.amberDeep}}>shift right</span>: each X_i ← X_(i+1) · old X₁₁ = <BitChip v={cur.before[10]} c={SC.amber}/> drops out · new X₁ ← <BitChip v={cur.fb} c={SC.rose}/></div>}
      {reveal >= 3 && <div>② <span style={{color:SC.roseDeep}}>feedback</span>: fb = X₁₁ ⊕ X₉ = <BitChip v={cur.tapX11} c={SC.rose}/> ⊕ <BitChip v={cur.tapX9} c={SC.rose}/> = <BitChip v={cur.fb} c={SC.rose}/></div>}
      {reveal >= 4 && <div>③ <span style={{color:SC.roseDeep}}>output tap</span>: s_n = X₁₁ = <BitChip v={cur.sBit} c={SC.rose}/></div>}
      {reveal >= 4 && <div>④ <span style={{color:SC.plumDeep}}>scramble</span>: out_n = in ⊕ s_n = <BitChip v={cur.inBit} c={SC.sage}/> ⊕ <BitChip v={cur.sBit} c={SC.rose}/> = <BitChip v={cur.outBit} c={SC.plum}/></div>}
    </div>
  );
}
function BitChip({v, c}) {
  return (
    <span style={{
      display:'inline-block', width:22, height:22, lineHeight:'22px', textAlign:'center',
      background: c, color:'#fff', borderRadius:5, fontWeight:700, fontSize:13, margin:'0 1px',
      verticalAlign:'middle'
    }}>{v}</span>
  );
}

// ---------- Mini-panels (shift/feedback/output) ----------
function MiniPanels({cur, reveal}) {
  if (!cur) return null;
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:14}}>
      {reveal >= 2 && <MiniPanel n="②" title="Shift" color={SC.amber} colorDeep={SC.amberDeep}>
        <div style={{fontSize:13, color:SC.inkDim, lineHeight:1.55}}>
          Every clock, the entire register slides one cell rightward — like a conveyor belt. The
          {' '}<b style={{color:SC.amberDeep}}>old X₁₁</b> falls off the end (becomes the PN bit), and a fresh
          {' '}<b style={{color:SC.amberDeep}}>new X₁</b> drops in at the front (= the freshly-computed feedback).
        </div>
      </MiniPanel>}
      {reveal >= 3 && <MiniPanel n="③" title="Feedback" color={SC.rose} colorDeep={SC.roseDeep}>
        <div style={{fontSize:13, color:SC.inkDim, lineHeight:1.55}}>
          The freshman X₁ isn't random — it's <b style={{color:SC.roseDeep}}>X₁₁ ⊕ X₉</b> from <em>before</em> the shift.
          Those two tap positions correspond to the non-zero exponents in S(x). They're what makes the sequence
          {' '}<b>maximal-length</b>.
        </div>
      </MiniPanel>}
      {reveal >= 4 && <MiniPanel n="④" title="Output XOR" color={SC.plum} colorDeep={SC.plumDeep}>
        <div style={{fontSize:13, color:SC.inkDim, lineHeight:1.55}}>
          The bit that just fell off (s_n) is XOR'd with the data bit you fed in. That XOR result is
          {' '}<b style={{color:SC.plumDeep}}>the scrambled bit on air</b>. Notice: the scrambler doesn't add
          information; it just whitens the spectrum.
        </div>
      </MiniPanel>}
    </div>
  );
}
function MiniPanel({n, title, color, colorDeep, children}) {
  return (
    <div style={{
      background:'#fff', borderRadius:11, padding:'14px 16px',
      border: `1px solid ${SC.line}`,
      borderLeft: `3px solid ${color}`,
      boxShadow:'0 1px 2px rgba(184,95,18,0.03)'
    }}>
      <div style={{display:'flex', alignItems:'baseline', gap:8, marginBottom:6}}>
        <span style={{fontSize:18, color, fontWeight:700, fontFamily:'inherit'}}>{n}</span>
        <span style={{fontSize:13, fontWeight:700, color:colorDeep, letterSpacing:'-0.005em'}}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ---------- Piano-roll bit stream ----------
// 3 rows (in / PN / out) share a horizontal timeline; cursor sweeps over columns.
function PianoRoll({records, step, setStep}) {
  const containerRef = useRc(null);
  const cellW = 26;
  const N = records.length;

  useEc(()=>{
    const el = containerRef.current; if (!el) return;
    const cell = el.querySelector(`[data-col="${step}"]`);
    if (cell) {
      const cleft = cell.offsetLeft, ew = el.clientWidth, sw = el.scrollLeft, cw = cell.offsetWidth;
      if (cleft < sw + 50 || cleft > sw + ew - 50 - cw) {
        el.scrollTo({ left: cleft - ew/2 + cw/2, behavior:'smooth' });
      }
    }
  }, [step]);

  const inBits  = records.map(r=>r.inBit);
  const pnBits  = records.map(r=>r.sBit);
  const outBits = records.map(r=>r.outBit);

  return (
    <div style={{
      background:'#fff', borderRadius:12, padding:'14px 18px', marginBottom:14,
      border: `1px solid ${SC.line}`,
    }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4}}>
        <div style={{fontSize:11, color:SC.amberDeep, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:600}}>
          Bit-stream piano roll · 3 streams over time
        </div>
        <div style={{fontSize:11, color:SC.inkMuted, fontFamily:'JetBrains Mono, monospace'}}>
          click any column to jump
        </div>
      </div>
      <div style={{fontSize:11, color:SC.inkMuted, marginBottom:8, lineHeight:1.55}}>
        Each column = one clock tick.
        {' '}<b style={{color:SC.sageDeep}}>Data in</b> (raw input, e.g. SERVICE all-zeros, then PSDU bytes)
        ⊕
        {' '}<b style={{color:SC.roseDeep}}>PN bit</b> (X₁₁ output of the LFSR this clock)
        =
        {' '}<b style={{color:SC.plumDeep}}>Scrambled</b> (what goes on the air).
      </div>

      <div ref={containerRef} style={{overflowX:'auto', position:'relative', paddingBottom:6}}>
        <div style={{
          display:'inline-block', minWidth:'100%', position:'relative',
          fontFamily:'JetBrains Mono, monospace'
        }}>
          {/* Cursor — offset = label width(74) + label margin(6) = 80 */}
          <div style={{
            position:'absolute',
            left: 80 + step*(cellW+2),
            top: 4, bottom: 4,
            width: cellW,
            background: SC.amberSoft,
            borderRadius: 6, border:`2px solid ${SC.amber}`,
            transition: `left ${ANIM.step}ms ${ANIM.ease}`,
            pointerEvents:'none',
            zIndex: 1,
          }}/>

          <RollRow label="Data in"     color={SC.sageDeep}  bits={inBits}  step={step} cellW={cellW} setStep={setStep}/>
          <div style={{position:'relative', height:18, marginLeft:80}}>
            <div style={{
              position:'absolute', left: step*(cellW+2) + cellW/2 - 8, top:1,
              fontSize: 14, color: SC.rose, fontWeight: 700, transition: `left ${ANIM.step}ms ${ANIM.ease}`
            }}>⊕</div>
          </div>
          <RollRow label="PN bit"      color={SC.roseDeep}  bits={pnBits}  step={step} cellW={cellW} setStep={setStep}/>
          <div style={{position:'relative', height:14, marginLeft:80, borderTop:`1px dashed ${SC.line}`}}/>
          <RollRow label="Scrambled"   color={SC.plumDeep}  bits={outBits} step={step} cellW={cellW} setStep={setStep}/>
        </div>
      </div>

      {/* Tail summary */}
      <div style={{display:'flex', gap:18, marginTop:10, flexWrap:'wrap', fontSize:12, color:SC.inkDim}}>
        <SummaryItem label="PN tap output" bits={pnBits} step={step} color={SC.rose}/>
        <SummaryItem label="Scrambled out" bits={outBits} step={step} color={SC.plum}/>
      </div>
    </div>
  );
}

function RollRow({label, color, bits, step, cellW, setStep}) {
  return (
    <div style={{display:'flex', alignItems:'center', marginBottom:3, position:'relative'}}>
      <div style={{
        width: 74, fontSize:11, color, fontWeight:700, textAlign:'right',
        marginRight:6, fontFamily:'JetBrains Mono, monospace'
      }}>{label}</div>
      <div style={{display:'flex', gap:2}}>
        {bits.map((b,i)=>{
          const active = i === step;
          const past = i < step;
          return (
            <div key={i} data-col={i} onClick={()=>setStep(i)}
              style={{
                width:cellW, minWidth:cellW, height:30,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:13, fontWeight:700, cursor:'pointer',
                background: b ? color : '#fff',
                color:      b ? '#fff' : (past ? color : SC.inkMuted),
                border: `1.5px solid ${past ? color : SC.lineSoft}`,
                borderRadius:5,
                opacity: past || active ? 1 : 0.45,
                position:'relative', zIndex: active ? 2 : 0,
                transition: 'opacity 0.2s, background 0.2s'
              }}>{b}</div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryItem({label, bits, step, color}) {
  const shown = bits.slice(0, step+1);
  const hex = bitsToHex(shown);
  return (
    <div style={{flex:'1 1 280px'}}>
      <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:SC.inkMuted, fontWeight:600}}>{label}</div>
      <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:12, color:SC.ink, wordBreak:'break-all', marginTop:2}}>
        {shown.map((b,i)=>(
          <span key={i} style={{color: b ? color : SC.inkMuted}}>{b}</span>
        ))}
        {step+1 < bits.length && <span style={{color:SC.inkMuted}}>…</span>}
        {hex && <span style={{color:SC.inkMuted, marginLeft:8}}>(0x{hex})</span>}
      </div>
    </div>
  );
}

// ---------- ⑤ Descrambler symmetry ----------
function DescramblerCard({records, step, showDescrambler, setShowDescr}) {
  // The descrambler is the SAME circuit. Apply the scrambler again to the
  // already-scrambled output → we recover the original input.
  const out = records.slice(0, step+1).map(r=>r.outBit);
  const seed = records[0]?.before ?? [1,1,1,1,1,1,1,1,1,1,1];
  const recovered = useMc(()=> scrRun(seed, out), [out, seed]);
  return (
    <div style={{
      background:'#fff', borderRadius:12, padding:'16px 20px', marginBottom:14,
      border: `1px solid ${SC.line}`,
      borderLeft: `3px solid ${SC.sageDeep}`
    }}>
      <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:8}}>
        <span style={{fontSize:18, color:SC.sageDeep, fontWeight:700}}>⑤</span>
        <span style={{fontSize:14, fontWeight:700, color:SC.sageDeep}}>Descrambler is the same circuit</span>
        <span style={{flex:1}}/>
        <button onClick={()=>setShowDescr(s=>!s)} style={pillBtn()}>
          {showDescrambler ? 'hide demo ▴' : 'show demo ▾'}
        </button>
      </div>
      <div style={{fontSize:13, color:SC.inkDim, lineHeight:1.6}}>
        Because XOR is its own inverse, feeding the scrambled stream back through an identical LFSR
        (same polynomial, same initial state) recovers the original bits.
        The receiver doesn't need a different circuit — and the seed is recovered from the SERVICE field.
      </div>

      {showDescrambler && (
        <div style={{marginTop:12, background: SC.cardSoft, borderRadius:8, padding:'10px 14px', border:`1px solid ${SC.lineSoft}`, fontFamily:'JetBrains Mono, monospace', fontSize:12}}>
          <div style={{display:'grid', gridTemplateColumns:'80px 1fr', gap:'4px 12px'}}>
            <div style={{color:SC.inkMuted}}>scrambled →</div>
            <div style={{color:SC.plum, wordBreak:'break-all'}}>
              {out.map((b,i)=><span key={i}>{b}</span>)}
            </div>
            <div style={{color:SC.inkMuted}}>↓ same LFSR</div>
            <div style={{color:SC.sageDeep}}>···</div>
            <div style={{color:SC.inkMuted}}>recovered ←</div>
            <div style={{color:SC.sageDeep, wordBreak:'break-all', fontWeight:700}}>
              {recovered.map((r,i)=><span key={i}>{r.outBit}</span>)}
            </div>
            <div style={{color:SC.inkMuted}}>original</div>
            <div style={{color:SC.ink, wordBreak:'break-all'}}>
              {records.slice(0, step+1).map((r,i)=><span key={i}>{r.inBit}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- SERVICE-field comparison ----------
function ServiceCard({seed, records}) {
  const isAllOnes = seed.every(b => b === 1);
  const pn16 = records.slice(0, 16).map(r=>r.sBit);
  // Pad to 16 if input shorter
  while (pn16.length < 16) pn16.push(null);
  const matches = pn16.every((b,i) => b === SERVICE_REF[i]);

  return (
    <div style={{
      background: isAllOnes ? `linear-gradient(135deg, ${SC.sageSoft}, #E8F1EC)` : SC.cardSoft,
      borderRadius:12, padding:'16px 20px',
      border: `1px solid ${isAllOnes ? SC.sage : SC.line}`,
    }}>
      <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:8, flexWrap:'wrap'}}>
        <span style={{fontSize:11, color:SC.sageDeep, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700}}>
          ✱ Spec NOTE 1 · SERVICE field reference
        </span>
        {isAllOnes && matches && (
          <span style={{padding:'2px 8px', background:SC.sage, color:'#fff', fontSize:11, fontFamily:'JetBrains Mono, monospace', borderRadius:5, fontWeight:700}}>
            ✓ matches
          </span>
        )}
      </div>
      <div style={{fontSize:13, color:SC.inkDim, lineHeight:1.6, marginBottom:10}}>
        With seed = <b style={{color:SC.amberDeep, fontFamily:'JetBrains Mono, monospace'}}>0x7FF (all-1s)</b>,
        the first 16 PN bits are documented in the spec. Receivers use this to recover the unknown TX seed
        from the SERVICE field (which is transmitted as 16 zeros).
      </div>

      {/* Two-row comparison */}
      <div style={{display:'grid', gridTemplateColumns:'120px 1fr', gap:'4px 14px', alignItems:'center', fontFamily:'JetBrains Mono, monospace', fontSize:13}}>
        <div style={{textAlign:'right', fontSize:11, color:SC.inkMuted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em'}}>
          spec ref
        </div>
        <div style={{display:'flex', gap:3}}>
          {SERVICE_REF.map((b,i)=>(
            <BitBox key={i} b={b} color={SC.sage}/>
          ))}
        </div>
        <div style={{textAlign:'right', fontSize:11, color:SC.inkMuted, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em'}}>
          your seed
        </div>
        <div style={{display:'flex', gap:3}}>
          {pn16.map((b,i)=>(
            <BitBox key={i} b={b} color={isAllOnes ? SC.sage : SC.amber}
              dim={b === null} mismatch={b !== null && b !== SERVICE_REF[i]}/>
          ))}
        </div>
      </div>

      {!isAllOnes && (
        <div style={{marginTop:10, fontSize:11, color:SC.inkMuted, fontStyle:'italic'}}>
          ⓘ change seed to <b style={{color:SC.amberDeep}}>all-1s</b> to see the canonical match.
        </div>
      )}
    </div>
  );
}
function BitBox({b, color, dim, mismatch}) {
  return (
    <div style={{
      width:24, height:26, borderRadius:5,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontWeight:700, fontSize:13,
      background: b === null ? '#fff' : (b ? color : '#fff'),
      color:      b === null ? SC.inkMuted : (b ? '#fff' : color),
      border: `1.5px solid ${mismatch ? SC.rose : (dim ? SC.lineSoft : color)}`,
      opacity: dim ? 0.4 : 1,
    }}>
      {b === null ? '·' : b}
    </div>
  );
}

window.ScramblerTutorial = ScramblerTutorial;
