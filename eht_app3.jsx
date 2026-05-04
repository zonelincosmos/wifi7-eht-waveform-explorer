// EHT Waveform Explorer — Part 3
// Part I/II/III VIZ panels driven from TEACHING.md:
//   §2.4 subcarrier-coordinate-systems   (k ↔ FFT-bin)
//   §2.5 byte-to-bits-animator            (LSB-first explosion)
//   §9.9 lsig-bit-strip                   (L-SIG 24-bit + LENGTH/mod 3)
//   §10.9 usig-bit-viewer                 (U-SIG-1 / U-SIG-2)
//   §11.8 ehtsig-bit-viewer               (EHT-SIG common + user)

const { useState: useS3, useMemo: useM3 } = React;
const E3 = window.EHT;

// =============== §2.5 BYTE → BITS LSB-first animator ===============
function ByteBitsViz() {
  const [hex, setHex] = useS3('53');
  const [order, setOrder] = useS3('lsb'); // 'lsb' (correct) or 'msb' (wrong)
  const v = parseInt(hex, 16) & 0xFF;
  const bits = [];
  if (order === 'lsb') {
    for (let i = 0; i < 8; i++) bits.push({ pos: i, val: (v >> i) & 1 }); // bit0 first
  } else {
    for (let i = 7; i >= 0; i--) bits.push({ pos: i, val: (v >> i) & 1 });
  }
  return (
    <div className="panel">
      <h2><span className="num">α</span>Byte → bit ordering <span className="desc">— §2.5 · 802.11 transmits bit 0 of byte 0 first (LSB-first inside each byte)</span></h2>
      <div style={{display:'flex', gap:18, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
        <div>
          <label style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>byte (hex)</label>
          <input value={hex} onChange={e=>setHex(e.target.value.replace(/[^0-9a-fA-F]/g,'').slice(0,2))}
            style={{display:'block', marginTop:4, padding:'8px 10px', width:90, fontFamily:'JetBrains Mono, monospace', fontSize:14, border:'1px solid var(--line)', borderRadius:6}}/>
          <div style={{fontSize:11, color:'var(--ink-muted)', marginTop:4, fontFamily:'JetBrains Mono, monospace'}}>= 0x{v.toString(16).toUpperCase().padStart(2,'0')} = {v}</div>
        </div>
        <div style={{display:'flex', gap:6}}>
          {[
            ['lsb','LSB-first (spec)'],
            ['msb','MSB-first (WRONG)']
          ].map(([k,t])=>(
            <button key={k} onClick={()=>setOrder(k)}
              style={{padding:'7px 12px', fontSize:12, borderRadius:6,
                background: order===k ? (k==='lsb'?'var(--green)':'var(--orange)') : '#fff',
                color: order===k ? '#fff':'var(--ink-dim)',
                border:`1px solid ${order===k? (k==='lsb'?'var(--green)':'var(--orange)') : 'var(--line)'}`,
                cursor:'pointer', fontWeight:600}}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{display:'flex', gap:4, alignItems:'center'}}>
        <span style={{fontSize:11, color:'var(--ink-muted)', minWidth:80}}>on-air order →</span>
        {bits.map((b,i)=>(
          <div key={i} style={{
            width:54, padding:'8px 0', textAlign:'center',
            border:`1px solid ${b.val? 'var(--accent)':'var(--line)'}`,
            background: b.val? 'var(--accent)':'#fff',
            color: b.val?'#fff':'var(--ink-muted)',
            borderRadius:6, fontFamily:'JetBrains Mono, monospace'
          }}>
            <div style={{fontSize:9, color: b.val?'rgba(255,255,255,0.75)':'var(--ink-muted)'}}>bit {b.pos}</div>
            <div style={{fontSize:18, fontWeight:700}}>{b.val}</div>
          </div>
        ))}
      </div>
      <div className="detail" style={{marginTop:12}}>
        Code: <code>psdu_bits((i-1)*8+1 : i*8) = bitget(double(psdu(i)), 1:8)</code> — <code>bitget(_,1)</code> returns LSB.
        Reverse this and the entire PSDU decodes to garbage even though byte values look identical.
      </div>
    </div>
  );
}

// =============== §2.4 k ↔ FFT bin coordinate systems ===============
function CoordViz() {
  const NFFT = 6144;
  const N_SR = 2036;
  const [k, setK] = useS3(0);
  const bin = ((k % NFFT) + NFFT) % NFFT + 1;
  const samples = [
    {k:0, label:'DC'}, {k:1, label:'+1'}, {k:100, label:'+100'},
    {k:-1, label:'−1'}, {k:-2036, label:'−N_SR (edge)'}, {k:2036, label:'+N_SR'}
  ];
  return (
    <div className="panel">
      <h2><span className="num">β</span>Subcarrier coordinates <span className="desc">— §2.4 · signed k vs MATLAB FFT bin: <code>bin = mod(k, NFFT) + 1</code></span></h2>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
        <div>
          <label style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>signed index k</label>
          <input type="range" min={-N_SR} max={N_SR} step={1} value={k} onChange={e=>setK(+e.target.value)}
            style={{width:'100%', marginTop:6}}/>
          <div style={{display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--ink-muted)', fontFamily:'JetBrains Mono, monospace'}}>
            <span>−2036</span><span style={{color:'var(--accent)', fontWeight:700, fontSize:14}}>k = {k}</span><span>+2036</span>
          </div>
          <div className="detail" style={{marginTop:10, fontFamily:'JetBrains Mono, monospace', fontSize:13}}>
            <div>k = <span style={{color:'var(--accent)', fontWeight:700}}>{k}</span></div>
            <div>NFFT = 6144</div>
            <div>bin = mod(k, NFFT) + 1 = mod({k}, 6144) + 1 = <span style={{color:'var(--green)', fontWeight:700}}>{bin}</span></div>
          </div>
        </div>
        <div>
          <div style={{fontSize:11, color:'var(--ink-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6}}>worked examples</div>
          <table style={{width:'100%', borderCollapse:'collapse', fontFamily:'JetBrains Mono, monospace', fontSize:12}}>
            <thead><tr style={{color:'var(--ink-muted)', fontSize:10}}>
              <th style={{textAlign:'left', padding:4}}>label</th><th style={{textAlign:'right', padding:4}}>k</th><th style={{textAlign:'right', padding:4}}>bin</th>
            </tr></thead>
            <tbody>
              {samples.map((s,i)=>{
                const b = ((s.k % NFFT) + NFFT) % NFFT + 1;
                const sel = s.k === k;
                return (
                  <tr key={i} onClick={()=>setK(s.k)} style={{cursor:'pointer', background: sel?'#dfe9ff':'transparent'}}>
                    <td style={{padding:4, color:sel?'var(--accent)':'var(--ink-dim)', fontFamily:'-apple-system,sans-serif'}}>{s.label}</td>
                    <td style={{padding:4, textAlign:'right', color:sel?'var(--accent)':'inherit'}}>{s.k}</td>
                    <td style={{padding:4, textAlign:'right', color:sel?'var(--green)':'var(--accent2)'}}>{b}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{fontSize:11, color:'var(--ink-muted)', marginTop:8, lineHeight:1.55}}>
            FFT bin order is <em>not</em> natural order: DC sits at index 1, positive freqs go up, negative freqs wrap around to the upper half.
            That's what <code>ifft()</code> expects; <code>ifftshift()</code> first if you have natural order.
          </div>
        </div>
      </div>
    </div>
  );
}

// =============== §9.9 L-SIG bit strip ===============
function LSigViz({c, p}) {
  const txtime = c.TXTIME;
  const lsigLen = c.LSIG_LEN;
  const mod3 = lsigLen % 3;
  // build 24-bit pattern
  const rate = [1,0,1,1]; // 0xD LSB-first = 1101 reversed = 1011 (LSB at pos0=1)
  const length12 = [];
  for (let i = 0; i < 12; i++) length12.push((lsigLen >> i) & 1);
  // parity over B0..B16
  const all17 = [...rate, 0, ...length12];
  const parity = all17.reduce((a,b)=>a^b, 0);
  const bits = [...rate, 0, ...length12, parity, 0,0,0,0,0,0];
  return (
    <div className="panel">
      <h2><span className="num">γ</span>L-SIG bit strip <span className="desc">— §9.2/9.9 · 24-bit BCC R=1/2 BPSK · LENGTH derived so LENGTH mod 3 == 0 marks EHT</span></h2>
      <div style={{display:'flex', gap:4, marginTop:8, flexWrap:'nowrap', overflowX:'auto', paddingBottom:6}}>
        {bits.map((b,i)=>{
          let region, color;
          if (i<=3) { region='RATE'; color='#3b82f6'; }
          else if (i===4) { region='Rsv'; color='#94a3b8'; }
          else if (i<=16) { region='LENGTH'; color='#10b981'; }
          else if (i===17) { region='Par'; color='#eab308'; }
          else { region='Tail'; color='#cbd5e1'; }
          return (
            <div key={i} style={{
              minWidth:34, padding:'6px 0', textAlign:'center',
              border:`1px solid ${color}`,
              background: b ? color : '#fff',
              color: b? '#fff':color,
              borderRadius:4, fontFamily:'JetBrains Mono, monospace', fontSize:14, fontWeight:700
            }}>
              <div style={{fontSize:8, color: b?'rgba(255,255,255,0.8)':'var(--ink-muted)', fontWeight:500}}>B{i}</div>
              {b}
            </div>
          );
        })}
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, marginTop:14}}>
        <div className="hl-card"><div className="lab">TXTIME</div><div className="vv">{txtime.toFixed(0)}<span className="un">µs</span></div></div>
        <div className="hl-card"><div className="lab">LENGTH</div><div className="vv">{lsigLen}</div></div>
        <div className="hl-card" style={{borderColor: mod3===0?'var(--green)':'var(--orange)'}}>
          <div className="lab">LENGTH mod 3</div>
          <div className="vv" style={{color: mod3===0?'var(--green)':'var(--orange)'}}>{mod3}</div>
        </div>
        <div className="hl-card"><div className="lab">RATE field</div><div className="vv" style={{fontSize:13}}>0xD</div></div>
        <div className="hl-card"><div className="lab">Parity</div><div className="vv">{parity}</div></div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        Eq.36-17: <code>LENGTH = ⌈(TXTIME − 20)/4⌉×3 − 3</code>. For our PPDU: ⌈({txtime.toFixed(0)}−20)/4⌉×3 − 3 = <b style={{color:'var(--green)'}}>{lsigLen}</b>.
        Legacy receivers compute defer time as <code>(LENGTH+3)/3 × 4 + 20</code>; EHT receivers spot the <code>mod 3 == 0</code> as the EHT signature.
      </div>
    </div>
  );
}

// =============== shared bit-strip renderer ===============
function BitFieldStrip({fields, total, palette}) {
  return (
    <div style={{display:'flex', gap:3, marginTop:6, flexWrap:'wrap'}}>
      {fields.map((f,i)=>{
        const c = palette[i % palette.length];
        return (
          <div key={i} title={f.desc||''} style={{
            flex: `${f.width} 0 0`, minWidth: Math.max(40, f.width*18),
            padding:'8px 10px',
            background: c.bg,
            border:`1px solid ${c.bd}`,
            borderRadius:6,
            color: c.fg,
            cursor: f.desc? 'help':'default'
          }}>
            <div style={{fontSize:9.5, fontFamily:'JetBrains Mono, monospace', color: c.label, fontWeight:600}}>{f.range} · {f.width}b</div>
            <div style={{fontSize:12, fontWeight:600, marginTop:2}}>{f.name}</div>
            {f.desc && <div style={{fontSize:10.5, color:c.dim, marginTop:3, lineHeight:1.45}}>{f.desc}</div>}
          </div>
        );
      })}
    </div>
  );
}

const PALETTE_BLUE = [
  { bg:'#dbeafe', bd:'#3b82f6', fg:'#1e40af', label:'#1d4ed8', dim:'#3b5f9c' },
  { bg:'#e0f2fe', bd:'#0ea5e9', fg:'#075985', label:'#0369a1', dim:'#2563a8' },
  { bg:'#fef3c7', bd:'#eab308', fg:'#854d0e', label:'#a16207', dim:'#7c5e1a' },
  { bg:'#f1f5f9', bd:'#64748b', fg:'#334155', label:'#475569', dim:'#5b6b80' },
  { bg:'#dcfce7', bd:'#10b981', fg:'#065f46', label:'#047857', dim:'#1f6e54' },
  { bg:'#fce7f3', bd:'#db2777', fg:'#831843', label:'#9d174d', dim:'#783056' },
  { bg:'#ede9fe', bd:'#8b5cf6', fg:'#4c1d95', label:'#5b21b6', dim:'#5e3f96' },
  { bg:'#ffedd5', bd:'#f97316', fg:'#7c2d12', label:'#c2410c', dim:'#8b4423' }
];

function USigViz() {
  return (
    <div className="panel">
      <h2><span className="num">δ</span>U-SIG bit layout <span className="desc">— §10 · 26 + 26 = 52 bits, BCC R=1/2 BPSK across both 4 µs symbols</span></h2>
      <div style={{fontSize:13, color:'var(--accent)', fontWeight:600, marginTop:10, marginBottom:4}}>U-SIG-1 (26 bits)</div>
      <BitFieldStrip fields={E3.USIG1_BITS} palette={PALETTE_BLUE}/>
      <div style={{fontSize:13, color:'var(--accent)', fontWeight:600, marginTop:18, marginBottom:4}}>U-SIG-2 (26 bits = 16 data + 4 CRC + 6 tail)</div>
      <BitFieldStrip fields={E3.USIG2_BITS} palette={PALETTE_BLUE}/>
      <div className="detail" style={{marginTop:14}}>
        <b>Critical:</b> BCC encoding is one continuous pass over all 52 bits, <em>not</em> two separate 26-bit encodes. The 4-bit CRC covers B0–B41 (= U-SIG-1[0..25] ++ U-SIG-2[0..15]).
        Computed via 8-bit register with poly x⁴+x+1; the top 4 bits of the register are bit-inverted to produce the CRC.
      </div>
    </div>
  );
}

function EhtSigViz() {
  return (
    <div className="panel">
      <h2><span className="num">ε</span>EHT-SIG bit layout <span className="desc">— §36.3.12.8 · Common(20 b) + User(22 b) = 42 b · single 4-bit CRC over all 42 b · 6-bit tail</span></h2>
      <div style={{fontSize:13, color:'var(--accent)', fontWeight:600, marginTop:10, marginBottom:4}}>Common field (20 bits)</div>
      <BitFieldStrip fields={E3.EHTSIG_COMMON} palette={PALETTE_BLUE}/>
      <div style={{fontSize:13, color:'var(--accent)', fontWeight:600, marginTop:18, marginBottom:4}}>User field (22 bits, SU PPDU)</div>
      <BitFieldStrip fields={E3.EHTSIG_USER} palette={PALETTE_BLUE}/>
      <div className="detail" style={{marginTop:14}}>
        <b>LDPC Extra Sym</b> (B8 of common): 1 if <code>N_SYM = N_SYM_init + 1</code> (Eq. 36-50/51 trigger). The extra symbol gives more codeword space when puncturing would have to be too aggressive.
        For our reference case the LDPC param solver does <em>not</em> trigger an extra symbol → bit = 0.
      </div>
    </div>
  );
}

window.ByteBitsViz = ByteBitsViz;
window.CoordViz = CoordViz;
window.LSigViz = LSigViz;
window.USigViz = USigViz;
window.EhtSigViz = EhtSigViz;
