// EHT Waveform Explorer — Part 5
// VIZ panels:
//   §7.7  lstf-construction               (L-STF 12-tone comb + replication)
//   §13.8 eht-ltf-mode-comparison         (1×/2×/4× SC mask + duration)
//   §15.7 scrambler-spectrum-comparison   (data spectrum w/ vs w/o scrambling)
//   §18.8 ifft-animation                  (sum-of-cosines IFFT)
//   §18.8 cyclic-prefix-isi-demo          (multipath delay → CP absorbs)

const { useState: useS5, useEffect: useE5, useRef: useR5, useMemo: useM5 } = React;

// 12 nonzero L-STF subcarriers (one per 4 bins, ±26 range, normalized later).
// Spec Eq. 19-8: S_-26..26 = sqrt(1/2)·(±1±j) at every 4th SC. The legacy
// 802.11a Eq. 17-8 (sqrt(13/6) magnitude) is no longer used; modern HT/VHT/HE/EHT
// receivers all use Eq. 19-8 values.
const LSTF_TONES_20 = [-24,-20,-16,-12,-8,-4,4,8,12,16,20,24];

// =============== §7.7 L-STF freq comb + replication ===============
function LSTFViz({p}) {
  const ref = useR5(null);
  const N20 = ({20:1,40:2,80:4,160:8,320:16})[p.BW];
  // Per-segment K_Shift (§36.3.12.3 / Table 36-26 — each 20 MHz subblock shifted
  // by an integer number of pre-EHT FFT bins relative to centre).
  const shiftStep = 256;
  // For visualization we plot in pre-EHT FFT space (1× sample rate).
  // pre-EHT NFFT scales as: 64 (20 MHz), 128 (40), 256 (80), 512 (160), 1024 (320).
  const NFFTpre = ({20:64,40:128,80:256,160:512,320:1024})[p.BW];

  useE5(()=>{
    const cv = ref.current; if (!cv) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const padL=50, padR=20, padT=20, padB=40;
    const innerW = W-padL-padR, innerH = H-padT-padB;
    // x: -NFFTpre/2 .. +NFFTpre/2-1
    const half = NFFTpre/2;
    // axis
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(padL, padT+innerH/2, innerW, 1);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign='center';
    [-half, -half/2, 0, half/2, half-1].forEach(k=>{
      const x = padL + ((k+half)/(NFFTpre))*innerW;
      ctx.fillRect(x, padT+innerH-3, 1, 6);
      ctx.fillText(k, x, padT+innerH+16);
    });
    // baseline
    ctx.fillStyle='#94a3b8';
    ctx.fillText('frequency bin (pre-EHT FFT, NFFTpre='+NFFTpre+')', padL+innerW/2, H-6);
    // draw L-STF tones: replicate per 20 MHz subblock
    // each subblock has its 12 tones at center+LSTF_TONES_20, then K_shift offset
    // For visualization, lay out subblocks evenly across the full BW
    const subW = NFFTpre / N20; // bins per subblock in pre-EHT space
    for (let s=0; s<N20; s++){
      const center = -half + (s+0.5)*subW;
      LSTF_TONES_20.forEach(k=>{
        const ks = center + k * (subW/64); // scale 64-FFT tone positions to subblock width
        const x = padL + ((ks+half)/NFFTpre)*innerW;
        const mag = innerH * 0.8 * Math.sqrt(13/6) / Math.sqrt(13/6);
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(x-1.5, padT+innerH/2 - mag/2, 3, mag/2);
        // dot
        ctx.beginPath(); ctx.arc(x, padT+innerH/2-mag/2, 4, 0, 6.28); ctx.fill();
      });
      // subblock divider
      if (s>0){
        const xd = padL + (s*subW/NFFTpre)*innerW;
        ctx.strokeStyle='rgba(0,0,0,0.1)';
        ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.moveTo(xd, padT); ctx.lineTo(xd, padT+innerH); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [p.BW]);

  return (
    <div className="panel">
      <h2><span className="num">λ</span>L-STF construction <span className="desc">— IEEE 802.11be-2024 §36.3.12.3 · Eq. 36-15 · 12 nonzero S_(-26..26) tones every 4th SC, replicated across {N20}× 20 MHz subblock{N20>1?'s':''}</span></h2>
      <canvas ref={ref} width={1380} height={180} style={{width:'100%', height:180, background:'#fafcff', borderRadius:8, border:'1px solid var(--line)'}}/>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8, marginTop:10}}>
        <div className="hl-card"><div className="lab">Sparse spacing</div><div className="vv">every 4 SC</div></div>
        <div className="hl-card"><div className="lab">→ Time period</div><div className="vv">0.8<span className="un">µs</span></div></div>
        <div className="hl-card"><div className="lab">Reps in 8 µs</div><div className="vv">10×</div></div>
        <div className="hl-card"><div className="lab">20 MHz subblocks</div><div className="vv">{N20}</div></div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        Sparse comb in frequency ⇒ short repetition in time. The IFFT of a comb-spaced spectrum is a periodic train, so the L-STF
        repeats 10× within its 8 µs envelope. RX correlator catches it for packet detection / AGC / coarse timing.
        Each 20 MHz subblock carries the same 12 base values (1/√2)·(±1±j) per Eq. 19-8 (with phase rotation γ).
        Replication preserves legacy receivers' ability to detect L-STF first.
      </div>
    </div>
  );
}

// =============== §13.8 EHT-LTF mode comparison ===============
function EHTLTFViz() {
  const modes = [
    { type:'1×', mask:'every 4th SC, no zeros',           dur:3.2,  res:'coarse',    note:'subset modes only' },
    { type:'2×', mask:'every 2nd SC, zeros on alt',       dur:6.4,  res:'medium',    note:'most common' },
    { type:'4×', mask:'every SC populated',               dur:12.8, res:'fine',      note:'full resolution' }
  ];
  const [sel, setSel] = useS5(2);
  return (
    <div className="panel">
      <h2><span className="num">μ</span>EHT-LTF mode comparison <span className="desc">— IEEE 802.11be-2024 §36.3.12.10 · Eq. 36-37..36-44 · 1×/2×/4× trade off SC-mask density vs symbol duration</span></h2>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginTop:10}}>
        {modes.map((m,i)=>{
          const active = sel===i;
          return (
            <div key={i} onClick={()=>setSel(i)} style={{
              padding:'14px 16px', borderRadius:10, cursor:'pointer',
              border:`2px solid ${active?'var(--accent)':'var(--line)'}`,
              background: active?'#dfe9ff':'#fff',
              transition:'all 0.15s'
            }}>
              <div style={{fontSize:24, fontWeight:700, color:'var(--accent)', fontFamily:'JetBrains Mono, monospace'}}>{m.type}</div>
              <div style={{fontSize:13, color:'var(--ink-dim)', marginTop:4}}>{m.mask}</div>
              <div style={{fontSize:11, color:'var(--ink-muted)', marginTop:8, fontFamily:'JetBrains Mono, monospace'}}>
                duration · {m.dur} µs<br/>resolution · {m.res}
              </div>
              <div style={{fontSize:11, color:'var(--accent2)', marginTop:6, fontStyle:'italic'}}>{m.note}</div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:14}}>
        <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>
          subcarrier mask preview (first 32 SCs · {modes[sel].type})
        </div>
        <div style={{display:'flex', gap:2}}>
          {Array.from({length:32}).map((_,i)=>{
            const stride = sel===0?4:(sel===1?2:1);
            const on = i % stride === 0;
            return (
              <div key={i} style={{
                width:20, height:32, borderRadius:3,
                background: on?'var(--accent)':'#fff',
                border:`1px solid ${on?'var(--accent)':'var(--line)'}`
              }}/>
            );
          })}
        </div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        Since the IFFT of an N-stride sparse mask produces an N-fold periodic time signal,
        you can <em>truncate</em> the IFFT output to 1/N of its length and lose nothing — that's where the
        shorter durations come from. P-matrix requires <code>N_EHT_LTF ≥ N_SS</code> symbols to separate streams.
        4× mode wastes no SCs and gives the cleanest channel estimate, used when timing/freq tolerances allow it.
      </div>
    </div>
  );
}

// =============== §15.7 Scrambler spectrum comparison ===============
function ScramblerSpectrumViz() {
  const ref = useR5(null);
  const [scrambled, setScrambled] = useS5(true);
  // Build a fake "long zero run with occasional 1s" data pattern,
  // FFT it, plot magnitude. Then build scrambled version.
  useE5(()=>{
    const cv = ref.current; if (!cv) return;
    const W=cv.width, H=cv.height;
    const ctx=cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const N = 256;
    // Two arrays of ±1
    function bpsk(bits){ return bits.map(b=>b?1:-1); }
    // Unscrambled "MAC-like" data: header + lots of zero padding + structure
    const raw = [];
    for (let i=0;i<N;i++){
      // mostly 0 with some structured 1s
      raw.push((i<24 && (i%3===0)) || (i%32===0) ? 1 : 0);
    }
    // Scrambled: XOR with PN9 (good enough for visualization)
    let lfsr = 0x1FF;
    const scr = raw.map(b=>{
      const out = (lfsr>>8)&1;
      const fb = ((lfsr>>8)^(lfsr>>4))&1;
      lfsr = ((lfsr<<1) | fb) & 0x1FF;
      return b ^ out;
    });
    const x = scrambled ? bpsk(scr) : bpsk(raw);
    // DFT magnitude
    const mag = new Array(N/2).fill(0);
    for (let k=0; k<N/2; k++){
      let re=0, im=0;
      for (let n=0; n<N; n++){
        const ang = -2*Math.PI*k*n/N;
        re += x[n]*Math.cos(ang);
        im += x[n]*Math.sin(ang);
      }
      mag[k] = Math.sqrt(re*re+im*im);
    }
    const max = Math.max(...mag);
    // plot
    const padL=50, padR=20, padT=20, padB=40;
    const innerW = W-padL-padR, innerH = H-padT-padB;
    ctx.fillStyle='#94a3b8';
    ctx.font='11px JetBrains Mono, monospace';
    ctx.textAlign='left';
    ctx.fillText('|FFT|', padL+4, padT+12);
    ctx.textAlign='center';
    ctx.fillText('frequency bin →', W/2, H-6);
    // baseline
    ctx.strokeStyle='var(--line)';
    ctx.beginPath(); ctx.moveTo(padL, padT+innerH); ctx.lineTo(W-padR, padT+innerH); ctx.stroke();
    // bars
    const barW = innerW / mag.length;
    mag.forEach((m,k)=>{
      const h = (m/max) * innerH * 0.95;
      const x = padL + k*barW;
      ctx.fillStyle = scrambled ? 'rgba(34,197,94,0.85)' : 'rgba(220,42,85,0.85)';
      ctx.fillRect(x, padT+innerH-h, barW*0.85, h);
    });
  }, [scrambled]);
  return (
    <div className="panel">
      <h2><span className="num">ν</span>Scrambler spectrum effect <span className="desc">— IEEE 802.11be-2024 §36.3.13.2 · Eq. 36-46 · why we whiten the bit stream before modulation</span></h2>
      <div style={{display:'flex', gap:8, marginBottom:10}}>
        {[[true,'Scrambled (white)'],[false,'Raw data (peaky)']].map(([k,t])=>(
          <button key={String(k)} onClick={()=>setScrambled(k)} style={{
            padding:'8px 14px', fontSize:12, borderRadius:6,
            background: scrambled===k ? (k?'var(--green)':'var(--red)') : '#fff',
            color: scrambled===k?'#fff':'var(--ink-dim)',
            border:`1px solid ${scrambled===k? (k?'var(--green)':'var(--red)') : 'var(--line)'}`,
            cursor:'pointer', fontWeight:600
          }}>{t}</button>
        ))}
      </div>
      <canvas ref={ref} width={1380} height={220} style={{width:'100%', height:220, background:'#fafcff', borderRadius:8, border:'1px solid var(--line)'}}/>
      <div className="detail" style={{marginTop:12}}>
        Raw MAC frames have lots of zeros (header padding, repeated MAC addresses, FCS=0x00 patterns), giving spectral lines and high PAPR.
        XOR'ing with the LFSR PN sequence whitens the spectrum: every bit looks ~50/50 random, FFT magnitude is roughly flat,
        and the PA stays in its linear region. The receiver applies the same LFSR to undo it.
      </div>
    </div>
  );
}

// =============== §18.8 IFFT sum-of-cosines animation ===============
function IFFTViz() {
  const ref = useR5(null);
  const [N, setN] = useS5(8);   // number of active subcarriers
  const [showSum, setShowSum] = useS5(true);
  // Random QPSK symbols on N subcarriers (deterministic)
  const syms = useM5(()=>{
    const s = [];
    for (let k=0;k<N;k++){
      const phase = ((k*1.61803)%1) * 2*Math.PI;
      s.push({ I: Math.cos(phase), Q: Math.sin(phase) });
    }
    return s;
  }, [N]);

  useE5(()=>{
    const cv = ref.current; if (!cv) return;
    const W=cv.width, H=cv.height;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const padL=50, padR=20, padT=20, padB=40;
    const innerW = W-padL-padR, innerH = H-padT-padB;
    const cy = padT + innerH/2;
    // axes
    ctx.strokeStyle='var(--line)';
    ctx.beginPath(); ctx.moveTo(padL, cy); ctx.lineTo(W-padR, cy); ctx.stroke();
    // sample T points
    const T = 256;
    const colors = ['#3b82f6','#10b981','#eab308','#db2777','#8b5cf6','#06b6d4','#f97316','#dc2a55','#7c5ce0','#16a34a','#0ea5b7','#ea7c3a'];
    // each subcarrier as cosine at freq k+1
    syms.forEach((s,k)=>{
      ctx.strokeStyle = colors[k%colors.length] + '90';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let n=0; n<T; n++){
        const t = n/T;
        const v = s.I*Math.cos(2*Math.PI*(k+1)*t) - s.Q*Math.sin(2*Math.PI*(k+1)*t);
        const x = padL + (n/T)*innerW;
        const y = cy - v*(innerH*0.18);
        if (n===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    });
    // sum
    if (showSum){
      ctx.strokeStyle='#1a2236';
      ctx.lineWidth=2.5;
      ctx.beginPath();
      for (let n=0; n<T; n++){
        let v=0;
        const t = n/T;
        syms.forEach((s,k)=>{
          v += s.I*Math.cos(2*Math.PI*(k+1)*t) - s.Q*Math.sin(2*Math.PI*(k+1)*t);
        });
        const x = padL + (n/T)*innerW;
        const y = cy - v*(innerH*0.05);
        if (n===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    ctx.fillStyle='#94a3b8'; ctx.font='11px JetBrains Mono, monospace'; ctx.textAlign='center';
    ctx.fillText('time (one OFDM symbol)', W/2, H-6);
  }, [syms, showSum, N]);

  return (
    <div className="panel">
      <h2><span className="num">ξ</span>IFFT = sum of cosines <span className="desc">— IEEE 802.11be-2024 §36.3.13 · each non-zero SC contributes one rotating phasor · the time-domain symbol is their sum</span></h2>
      <div style={{display:'flex', gap:18, alignItems:'center', flexWrap:'wrap', marginBottom:10}}>
        <label style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>active SCs</span>
          <input type="range" min={1} max={12} value={N} onChange={e=>setN(+e.target.value)} style={{width:160}}/>
          <span style={{fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700}}>{N}</span>
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer'}}>
          <input type="checkbox" checked={showSum} onChange={e=>setShowSum(e.target.checked)}/> show sum
        </label>
      </div>
      <canvas ref={ref} width={1380} height={260} style={{width:'100%', height:260, background:'#fafcff', borderRadius:8, border:'1px solid var(--line)'}}/>
      <div className="detail" style={{marginTop:12}}>
        IFFT just sums weighted complex exponentials. Each subcarrier k contributes <code>X_k · exp(j2πkt/T_sym)</code>;
        with thousands of them adding randomly, the result looks Gaussian-ish (high PAPR is a known cost).
        Then a cyclic prefix is prepended — copy the last 1.6 / 3.2 µs of the symbol to its front.
      </div>
    </div>
  );
}

// =============== §18.8 Cyclic Prefix / ISI demo ===============
function CPISIViz() {
  const ref = useR5(null);
  const [delay, setDelay] = useS5(0.4);  // µs of multipath delay
  const [gi, setGi] = useS5(3.2);
  useE5(()=>{
    const cv = ref.current; if (!cv) return;
    const W=cv.width, H=cv.height;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,W,H);
    const padL=80, padR=30, padT=30, padB=50;
    const innerW = W-padL-padR, innerH=H-padT-padB;
    // Symbol = 12.8 µs FFT body. Plot 2 symbols + their CPs.
    const total = 2 * (gi + 12.8);
    const x_us = (us) => padL + (us/total)*innerW;
    const lanes = [
      { y: padT+10,  label:'TX direct',   col:'#3b82f6', off:0 },
      { y: padT+90,  label:'TX echo (×0.4)', col:'#db2777', off:delay },
      { y: padT+170, label:'RX (sum) — what RX sees in FFT window', col:'#10b981', off:0, sum:true }
    ];
    ctx.font='11px JetBrains Mono, monospace';
    ctx.textAlign='left';

    function drawSymbolRow(y, off, fillA, fillB, label){
      ctx.fillStyle='#94a3b8';
      ctx.fillText(label, 8, y+30);
      // sym 1
      ctx.fillStyle=fillA + '40';
      ctx.fillRect(x_us(off), y, x_us(gi)-x_us(0), 50);
      ctx.fillStyle=fillA;
      ctx.fillRect(x_us(off+gi), y, x_us(12.8)-x_us(0), 50);
      // sym 2
      const start2 = off + gi + 12.8;
      ctx.fillStyle=fillB + '40';
      ctx.fillRect(x_us(start2), y, x_us(gi)-x_us(0), 50);
      ctx.fillStyle=fillB;
      ctx.fillRect(x_us(start2+gi), y, x_us(12.8)-x_us(0), 50);
      // labels
      ctx.fillStyle='#fff';
      ctx.textAlign='center';
      ctx.fillText('CP', x_us(off+gi/2), y+30);
      ctx.fillText('Symbol n', x_us(off+gi+6.4), y+30);
      ctx.fillText('CP', x_us(start2+gi/2), y+30);
      ctx.fillText('Symbol n+1', x_us(start2+gi+6.4), y+30);
      ctx.textAlign='left';
    }
    drawSymbolRow(lanes[0].y, 0, '#3b82f6', '#7c5ce0', 'TX direct');
    drawSymbolRow(lanes[1].y, delay, '#db2777', '#dc2a55', `TX echo (+${delay.toFixed(1)} µs)`);
    // RX FFT window for symbol n: from (gi) to (gi+12.8), only includes what arrived
    // ISI happens if echo of symbol n still active during gi window of n+1, BUT
    // if delay < gi, echo's symbol n tail overlaps only the CP of n+1 → discarded ✓
    const rxY = lanes[2].y;
    ctx.fillStyle='#94a3b8'; ctx.fillText('RX sees', 8, rxY+30);
    // FFT window of symbol n: [gi, gi+12.8]
    // direct contributes its symbol body in [gi, gi+12.8] — clean
    // echo contributes its symbol n body in [gi+delay, gi+12.8+delay]
    // overlap with FFT window: from max(gi, gi+delay)=gi+delay to min(gi+12.8, gi+12.8+delay)=gi+12.8
    // → length = 12.8 - delay → if delay > 0, the part [gi, gi+delay] of FFT window has echo from PREV CP (clean rotation, no ISI)
    // ISI only happens if delay > gi (echo from SYMBOL n-1 leaks into FFT window of n)
    const isi = delay > gi;
    // Draw FFT window
    ctx.fillStyle = isi?'rgba(220,42,85,0.18)':'rgba(16,185,129,0.18)';
    ctx.fillRect(x_us(gi), rxY-5, x_us(12.8)-x_us(0), 60);
    ctx.strokeStyle = isi?'#dc2a55':'#10b981';
    ctx.lineWidth=2; ctx.setLineDash([6,4]);
    ctx.strokeRect(x_us(gi), rxY-5, x_us(12.8)-x_us(0), 60);
    ctx.setLineDash([]);
    ctx.fillStyle = isi?'#dc2a55':'#10b981';
    ctx.font='13px -apple-system, sans-serif';
    ctx.textAlign='center';
    ctx.fillText(isi?'⚠ ISI — echo > GI':'✓ Clean — echo absorbed by CP', x_us(gi+6.4), rxY+30);
    ctx.font='11px JetBrains Mono, monospace';

    // GI marker at top
    ctx.strokeStyle='#0ea5b7'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x_us(0), padT+8); ctx.lineTo(x_us(gi), padT+8); ctx.stroke();
    ctx.fillStyle='#0ea5b7';
    ctx.textAlign='center';
    ctx.fillText('GI = '+gi+' µs', x_us(gi/2), padT+4);

    // µs ticks
    ctx.fillStyle='#94a3b8'; ctx.textAlign='center';
    for (let t=0; t<=Math.ceil(total); t+=2){
      const x = x_us(t);
      ctx.fillRect(x, padT+innerH+8, 1, 4);
      ctx.fillText(t+'µs', x, padT+innerH+24);
    }
  }, [delay, gi]);
  return (
    <div className="panel">
      <h2><span className="num">π</span>Cyclic prefix &amp; ISI <span className="desc">— IEEE 802.11be-2024 §36.3.13 · Table 36-25 · drag the multipath delay — the CP absorbs echoes shorter than GI</span></h2>
      <div style={{display:'flex', gap:18, alignItems:'center', flexWrap:'wrap', marginBottom:10}}>
        <label style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>echo delay</span>
          <input type="range" min={0} max={6} step={0.1} value={delay} onChange={e=>setDelay(+e.target.value)} style={{width:200}}/>
          <span style={{fontFamily:'JetBrains Mono, monospace', color:'var(--accent)', fontWeight:700, minWidth:60}}>{delay.toFixed(1)} µs</span>
        </label>
        <label style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>GI</span>
          {[0.8, 1.6, 3.2].map(v=>(
            <button key={v} onClick={()=>setGi(v)} style={{
              padding:'5px 10px', fontSize:11, borderRadius:5,
              background: gi===v?'var(--accent2)':'#fff', color: gi===v?'#fff':'var(--ink-dim)',
              border:`1px solid ${gi===v?'var(--accent2)':'var(--line)'}`,
              cursor:'pointer', fontFamily:'JetBrains Mono, monospace', fontWeight:600
            }}>{v} µs</button>
          ))}
        </label>
      </div>
      <canvas ref={ref} width={1380} height={300} style={{width:'100%', height:300, background:'#fafcff', borderRadius:8, border:'1px solid var(--line)'}}/>
      <div className="detail" style={{marginTop:12}}>
        Cyclic = the CP is a <em>copy</em> of the symbol's tail. Within the FFT window, an echo with delay τ &lt; GI just looks like
        a phase rotation per SC — the channel estimator absorbs it. If τ &gt; GI, the previous symbol's tail leaks in: that's ISI.
        Indoor multipath ≤ 0.5 µs → 0.8 µs GI is fine; outdoor multipath needs 1.6 or 3.2 µs.
      </div>
    </div>
  );
}

window.LSTFViz = LSTFViz;
window.EHTLTFViz = EHTLTFViz;
window.ScramblerSpectrumViz = ScramblerSpectrumViz;
window.IFFTViz = IFFTViz;
window.CPISIViz = CPISIViz;
