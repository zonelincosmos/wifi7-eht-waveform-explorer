// EHT Waveform Explorer — main React app
const { useState, useEffect, useMemo, useRef } = React;
const { ppduFields, compute, MAC_HEADER, FC_BITS, DELIM_BITS, CRC_LIST, MCS, BW_CFG } = window.EHT;

function fmt(n, dec=0) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (typeof n !== 'number') return String(n);
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(dec||2) + 'M';
  if (Math.abs(n) >= 1e3 && Number.isInteger(n)) return n.toLocaleString();
  return Number.isInteger(n) ? n.toString() : n.toFixed(dec);
}

// ------------- Controls panel -------------
function Controls({p, set}) {
  const update = (k,v) => set({...p, [k]:v});
  return (
    <div className="panel">
      <h2><span className="num">P</span>Parameters <span className="desc">— change anything; the entire chain recomputes live</span></h2>
      <div className="ctrls">
        <div className="ctrl">
          <label>Bandwidth (MHz)</label>
          <select value={p.BW} onChange={e=>update('BW', +e.target.value)}>
            {[20,40,80,160,320].map(b=><option key={b} value={b}>{b} MHz</option>)}
          </select>
        </div>
        <div className="ctrl">
          <label>EHT-MCS</label>
          <select value={p.MCS} onChange={e=>update('MCS', +e.target.value)}>
            {MCS.map(m=><option key={m.idx} value={m.idx}>MCS {m.idx} — {m.name} {m.Rn}/{m.Rd}</option>)}
          </select>
        </div>
        <div className="ctrl">
          <label>APEP_LENGTH <span className="val">{p.APEP.toLocaleString()} B</span></label>
          <input type="range" min="100" max="65535" step="100" value={p.APEP} onChange={e=>update('APEP', +e.target.value)} />
        </div>
        <div className="ctrl">
          <label>Guard Interval (µs)</label>
          <select value={p.GI} onChange={e=>update('GI', +e.target.value)}>
            <option value={0.8}>0.8</option>
            <option value={1.6}>1.6</option>
            <option value={3.2}>3.2</option>
          </select>
        </div>
        <div className="ctrl">
          <label>EHT-LTF Type</label>
          <select value={p.LTFType} onChange={e=>update('LTFType', +e.target.value)}>
            <option value={2}>2× (6.4 µs DFT)</option>
            <option value={4}>4× (12.8 µs DFT)</option>
          </select>
        </div>
        <div className="ctrl">
          <label>Coding</label>
          <select value="LDPC" disabled><option>LDPC</option></select>
        </div>
        <div className="ctrl">
          <label>NSS</label>
          <select value="1" disabled><option>1</option></select>
        </div>
        <div className="ctrl">
          <label>PPDU Type</label>
          <select value="SU" disabled><option>EHT MU SU</option></select>
        </div>
      </div>
    </div>
  );
}

// ------------- Headline stats -------------
function Headline({c, p}) {
  const items = [
    { lab:'PHY rate', vv:c.phy_rate_Mbps.toFixed(1), un:'Mbps' },
    { lab:'TXTIME',   vv:c.TXTIME.toFixed(1), un:'µs' },
    { lab:'N_DBPS',   vv:c.N_DBPS.toLocaleString(), un:'bits/sym' },
    { lab:'N_SYM',    vv:c.N_SYM, un:'OFDM' },
    { lab:'PSDU',     vv:c.PSDU_bytes.toLocaleString(), un:'bytes' },
    { lab:'Pre-FEC pad',vv:c.N_PAD.toLocaleString(), un:'bits' }
  ];
  return (
    <div className="hl-row">
      {items.map((it,i)=>(
        <div className="hl-card" key={i}>
          <div className="lab">{it.lab}</div>
          <div className="vv">{it.vv}<span className="un">{it.un}</span></div>
        </div>
      ))}
    </div>
  );
}

// ------------- PPDU Timeline -------------
function Timeline({c, p, sel, setSel}) {
  const fields = ppduFields(p).map(f => ({...f, us: c.fieldUs[f.name] || 0}));
  const total = c.TXTIME;
  return (
    <div className="panel">
      <h2><span className="num">1</span>PPDU Timeline <span className="desc">— click a field to inspect (TXTIME = {total.toFixed(1)} µs, {c.total_samps.toLocaleString()} samples @ 480 MHz)</span></h2>
      <div className="tl">
        {fields.map((f,i)=>{
          const w = (f.us/total) * 100;
          const samps = Math.round(f.us * 480);
          return (
            <div key={i} className={'tl-seg' + (sel===i?' active':'')}
                 style={{flex: w + ' 1 0', background:f.color, color:'#1a2236'}}
                 onClick={()=>setSel(i)}>
              <div className="nm">{f.name}</div>
              <div className="du">{f.us.toFixed(1)}µs · {samps.toLocaleString()} samples</div>
            </div>
          );
        })}
      </div>
      <div className="tl-axis">
        <span>0 µs</span>
        <span>{(total/4).toFixed(1)}</span>
        <span>{(total/2).toFixed(1)}</span>
        <span>{(3*total/4).toFixed(1)}</span>
        <span>{total.toFixed(1)} µs</span>
      </div>
      {sel!=null && (
        <div className="detail">
          <h3>{fields[sel].name}</h3>
          <div className="desc">{fields[sel].desc}</div>
          <div className="kv">
            <span className="k">Duration</span><span className="v">{fields[sel].us.toFixed(2)} µs</span>
            <span className="k">Samples @ 480 MHz</span><span className="v">{Math.round(fields[sel].us * 480).toLocaleString()}</span>
            <span className="k">% of PPDU</span><span className="v">{(fields[sel].us/total*100).toFixed(1)} %</span>
            {fields[sel].name==='L-SIG' && <><span className="k">L-SIG LENGTH</span><span className="v">{c.LSIG_LEN} (mod 3 = {c.LSIG_LEN%3})</span></>}
            {fields[sel].name==='Data' && <><span className="k">N_SYM × T_SYM</span><span className="v">{c.N_SYM} × {c.TSYM_us} µs = {c.T_DATA_us.toFixed(1)} µs</span></>}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------- Concentric Data Field -------------
function Concentric({c}) {
  const layers = [
    { c:'#1d4ed8', t:'PPDU Data Field', s:`${c.N_SYM} OFDM symbols × ${c.N_CBPS.toLocaleString()} coded bits = ${(c.N_SYM*c.N_CBPS).toLocaleString()} bits` },
    { c:'#2563eb', t:'After OFDM Mapping', s:`${c.N_SYM} symbols × (${c.N_SD} data + ${c.N_SP} pilot) SCs` },
    { c:'#3b82f6', t:'After Constellation Map', s:`${c.N_BPSCS} bits/SC × ${c.N_SD} data SCs/sym = ${c.N_CBPS.toLocaleString()} coded/sym` },
    { c:'#60a5fa', t:'LDPC Output (N_avbits)', s:`${c.N_avbits.toLocaleString()} coded bits + ${(c.N_SYM*c.N_CBPS - c.N_avbits).toLocaleString()} post-FEC pad` },
    { c:'#93c5fd', t:'LDPC Input (N_pld)', s:`${c.N_pld.toLocaleString()} info bits → ${c.N_CW} × ${c.L_LDPC}-bit codewords` },
    { c:'#bfdbfe', t:'Scrambler Input', s:`SERVICE(16) + PSDU(${c.PSDU_bytes.toLocaleString()}B = ${(c.PSDU_bytes*8).toLocaleString()}b) + PHY pad(${c.N_PAD_PHY_bits}b) = ${c.N_pld.toLocaleString()}b` },
    { c:'#dbeafe', t:'PSDU = A-MPDU',
      s:`${c.PSDU_bytes.toLocaleString()} B = real-subframes ${c.ampdu_layout.total_real.toLocaleString()} B + EOF-padding ${c.ampdu_layout.eof_bytes.toLocaleString()} B (= ${c.ampdu_layout.eof_count} delims${c.ampdu_layout.eof_tail>0?` + ${c.ampdu_layout.eof_tail} B 0xFF tail`:''})` },
    { c:'#e0f2fe', t:`${c.NumMPDUs} real MPDU subframe${c.NumMPDUs>1?'s':''}`,
      s:c.ampdu_layout.subframes.map((sf,i)=>`#${i+1}: delim 4 + MAC 26 + body ${sf.chunk} + FCS 4${sf.align>0?` + align ${sf.align}`:''} = ${sf.total} B`).join(' · ') + ` · total user data ${c.ampdu_layout.user_data_len.toLocaleString()} B` },
    { c:'#f0f9ff', t:'MPDU = Header + Body + FCS', s:`26B MAC header + Frame Body + 4B FCS` }
  ];
  return (
    <div className="panel">
      <h2><span className="num">2</span>Data Field — Layer-by-layer <span className="desc">— outermost = on-air bits; innermost = MPDU contents</span></h2>
      <div className="conc">
        {layers.map((L,i)=>(
          <div key={i} className="conc-layer" style={{background:L.c, marginLeft: i*8 + 'px', marginRight: i*8 + 'px', color: i<4?'#fff':'#1a2236'}}>
            <div className="ll">Layer {i}</div>
            <div className="nm">{L.t}</div>
            <div className="vv">{L.s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------- Bit-Pipeline Stages -------------
function BitPipeline({c, p}) {
  const [open, setOpen] = useState(0);
  const m = c.mcs;
  const stages = [
    {
      t: 'Step 1 — Build PSDU (A-MPDU)',
      v: `${c.PSDU_bytes.toLocaleString()} bytes`,
      body: <>
        <p>Wrap user payload (<code>APEP_LENGTH = {c.APEP.toLocaleString()} B</code>) into <code>{c.NumMPDUs}</code> real MPDU subframe{c.NumMPDUs>1?'s':''} + EOF-padding delimiters to fill PSDU_LENGTH = <code>{c.PSDU_bytes.toLocaleString()} B</code>.</p>
        <p>Real subframe: <code>4 (Delim) + 26 (MAC hdr) + body + 4 (FCS) + 0–3 (4B align)</code><br/>
        EOF padding subframes: each 4 bytes <code>= 01 00 9E 4E</code> (length=0, EOF=1, sig=0x4E)</p>
        <p>Spec: §10.12.6 (MAC), §36.3.13.3.5 Eq.36-66 (PHY signaling).</p>
      </>
    },
    {
      t: 'Step 2 — Compute pre-FEC padding',
      v: `${c.N_PAD} bits (MAC ${c.N_PAD_MAC_bytes}B + PHY ${c.N_PAD_PHY_bits}b)`,
      body: <>
        <p>N_Excess = (8·APEP + N_tail + N_service) mod N_DBPS = <code>{c.N_Excess}</code> bits<br/>
        a_init = min(⌈N_Excess / N_DBPSshort⌉, 4) = <code>{c.a_init}</code><br/>
        N_SYM_init = ⌈(8·APEP+16) / N_DBPS⌉ = <code>{c.N_SYM_init}</code></p>
        <p>Pre-FEC pad split (Eq.36-66/67):
          <br/>• MAC bytes (EOF delimiters) = ⌊N_PAD / 8⌋ = <code>{c.N_PAD_MAC_bytes}</code> bytes
          <br/>• PHY bits (zero-bits) = N_PAD mod 8 = <code>{c.N_PAD_PHY_bits}</code> bits
        </p>
      </>
    },
    {
      t: 'Step 3 — Prepend SERVICE, append tail/pad',
      v: `${c.N_pld.toLocaleString()} bits (= N_pld)`,
      body: <>
        <p>Bit stream into scrambler:<br/>
          <code>[SERVICE 16] | [PSDU {(c.PSDU_bytes*8).toLocaleString()}b] | [N_tail {c.N_tail}] | [PHY pad {c.N_PAD_PHY_bits}]</code></p>
        <p>SERVICE = all-zeros pre-scramble; B0–B10 carry scrambler init seed (LSB-first).</p>
      </>
    },
    {
      t: 'Step 4 — Scramble (S(x)=x¹¹+x⁹+1)',
      v: 'XOR with 2047-bit PN',
      body: <>
        <p>11-bit Fibonacci LFSR. Init seed in <code>{'{1..127}'}</code>. Tap = X₁₁ ⊕ X₉. Output bit = X₁ each clock; shift right; new X₁₁ = feedback.</p>
        <p>Spec NOTE 1: with init = all-1s, first 11 outputs = all-1s (test vector).</p>
      </>
    },
    {
      t: 'Step 5 — LDPC encode',
      v: `${c.N_avbits.toLocaleString()} coded bits`,
      body: <>
        <p>Codeword length L_LDPC = <code>{c.L_LDPC}</code>, R = {m.Rn}/{m.Rd}, K = {Math.round(c.L_LDPC*m.Rn/m.Rd)} info bits/CW</p>
        <p>N_CW = <code>{c.N_CW}</code> · N_shrt = <code>{c.N_shrt}</code> · N_punc = <code>{c.N_punc}</code> · N_rep = <code>{c.N_rep}</code></p>
        <p>Verify: N_CW·L_LDPC − N_shrt − N_punc + N_rep = <code>{(c.N_CW*c.L_LDPC - c.N_shrt - c.N_punc + c.N_rep).toLocaleString()}</code> = N_avbits</p>
      </>
    },
    {
      t: 'Step 6 — Stream parsing & interleaving',
      v: `${m.bpscs} bits/SC parsed`,
      body: <>
        <p>Round-robin parse coded bits across N_SS streams (s = max(1, N_BPSCS/2) bits at a time per stream). LDPC tone mapping per Eq.36-72 ("J3 tone mapper") then maps groups of bits onto data subcarriers.</p>
      </>
    },
    {
      t: 'Step 7 — Constellation map',
      v: `${m.name} (K_mod normalized)`,
      body: <>
        <p>{m.bpscs} bits → 1 complex point on {m.name} grid. Normalization factor K_mod scales unit-average symbol power.</p>
        <p>Total points: <code>{m.points.toLocaleString()}</code></p>
      </>
    },
    {
      t: 'Step 8 — Pilot insertion',
      v: `${c.N_SP} pilots / sym`,
      body: <>
        <p>Pilots placed at fixed SC indices (Ψ pattern). Each pilot is multiplied by polarity sequence <code>p_n</code> per OFDM symbol index, plus per-BW phase offset (Eq.36-87).</p>
      </>
    },
    {
      t: 'Step 9 — IFFT & cyclic prefix',
      v: `${c.NFFT}-pt iFFT + ${c.CP_data}-sample CP`,
      body: <>
        <p>Map (data + pilot + DC + guard) onto NFFT bins. iFFT → time samples. Prepend cyclic prefix of <code>{c.CP_data}</code> samples (= GI {p.GI} µs × 480 MHz).</p>
        <p>One OFDM symbol = <code>{c.NFFT + c.CP_data}</code> samples = <code>{c.TSYM_us}</code> µs.</p>
      </>
    },
    {
      t: 'Step 10 — Concatenate × N_SYM, append PE',
      v: `${c.data_samps.toLocaleString()} + PE samples`,
      body: <>
        <p>Repeat for N_SYM = <code>{c.N_SYM}</code> OFDM symbols. Append Packet Extension (T_PE = <code>{c.fieldUs['PE']} µs</code>, depends on a_init &amp; NominalPacketPadding per IEEE 802.11be-2024 Table 36-61). Final Data+PE field = <code>{(c.data_samps + Math.round(c.fieldUs['PE'] * window.EHT.FS_OS_MHZ)).toLocaleString()}</code> samples.</p>
      </>
    }
  ];
  return (
    <div className="panel">
      <h2><span className="num">3</span>Bit Pipeline — APEP_LENGTH → time samples <span className="desc">— click each stage to expand</span></h2>
      <div className="stages">
        {stages.map((s,i)=>(
          <div key={i} className={'stage'+(open===i?' expanded':'')} onClick={()=>setOpen(open===i?-1:i)}>
            <div className="head">
              <span className="stage-n">{(i+1).toString().padStart(2,'0')}</span>
              <span className="stage-t">{s.t}</span>
              <span className="stage-v">{s.v}</span>
              <span className="arrow">▶</span>
            </div>
            {open===i && <div className="body">{s.body}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------- Bit Stream visualization -------------
function BitStream({c}) {
  const total = c.N_pld;
  const segs = [
    { name:'SERVICE',  bits:c.N_service, color:'#eab308', desc:'16 unscrambled bits; carries scrambler-init seed in B0–B10' },
    { name:'PSDU',     bits:c.PSDU_bytes*8, color:'#3b82f6', desc:`${c.PSDU_bytes.toLocaleString()} bytes A-MPDU`},
    { name:'N_tail',   bits:c.N_tail, color:'#94a3b8', desc:'LDPC: 0; BCC: 6 (zeros)'},
    { name:'PHY pad',  bits:c.N_PAD_PHY_bits, color:'#f97316', desc:'0–7 zero bits, sub-byte filler before LDPC'}
  ].filter(s=>s.bits>0);
  return (
    <div className="panel">
      <h2><span className="num">4</span>Scrambler-input bit stream <span className="desc">— what the LDPC encoder sees ({total.toLocaleString()} bits = N_pld)</span></h2>
      <div className="bigbar">
        {segs.map((s,i)=>{
          const w = (s.bits/total)*100;
          return (
            <div key={i} className="bigbar-seg" style={{flex:w+' 1 0', background:s.color, minWidth:'60px'}}>
              <div className="nm">{s.name}</div>
              <div className="du">{s.bits.toLocaleString()} b</div>
            </div>
          );
        })}
      </div>
      <div className="bigbar-legend">
        {segs.map((s,i)=><span key={i}><span className="sw" style={{background:s.color}}></span>{s.name} — {s.desc}</span>)}
      </div>
      <div className="detail" style={{marginTop:14}}>
        <div className="kv">
          <span className="k">N_pld_raw (= 8·APEP + N_service + N_tail)</span><span className="v">{c.N_pld_raw.toLocaleString()} bits</span>
          <span className="k">N_PAD (pre-FEC pad total)</span><span className="v">{c.N_PAD.toLocaleString()} bits</span>
          <span className="k">  ↳ MAC EOF-delim bytes</span><span className="v">{c.N_PAD_MAC_bytes.toLocaleString()} B ({(c.N_PAD_MAC_bytes*8).toLocaleString()} b)</span>
          <span className="k">  ↳ PHY zero-pad bits</span><span className="v">{c.N_PAD_PHY_bits} b</span>
          <span className="k">N_pld (LDPC input)</span><span className="v">{c.N_pld.toLocaleString()} bits</span>
        </div>
      </div>
    </div>
  );
}

// ------------- LDPC parameter calc -------------
function LDPCParams({c}) {
  const m = c.mcs;
  const verify = c.N_CW * c.L_LDPC - c.N_shrt - c.N_punc + c.N_rep;
  const Rfrac = m.Rn / m.Rd;
  return (
    <div className="panel">
      <h2><span className="num">5</span>LDPC Parameter Calculation <span className="desc">— Eq. 36-47 through 36-55, Table 19-16</span></h2>
      <div className="grid3">
        <div className="stat">
          <div className="label">N_Excess (Eq.36-47)</div>
          <div className="num-mid">{c.N_Excess}</div>
          <div className="label" style={{marginTop:6}}>(8·APEP+N_tail+N_service) mod N_DBPS</div>
        </div>
        <div className="stat">
          <div className="label">a_init (Eq.36-48)</div>
          <div className="num-mid">{c.a_init} <span style={{fontSize:11, color:'var(--ink-muted)'}}>of 4 quarter-segments</span></div>
          <div className="label" style={{marginTop:6}}>min(⌈N_Excess/N_DBPSshort⌉, 4)</div>
        </div>
        <div className="stat">
          <div className="label">N_SYM_init (Eq.36-49)</div>
          <div className="num-mid">{c.N_SYM_init}{c.has_extra && <span className="badge-warn" style={{marginLeft:8}}>+1 LDPC extra</span>}</div>
          <div className="label" style={{marginTop:6}}>⌈N_pld_raw / N_DBPS⌉ = ⌈{c.N_pld_raw.toLocaleString()}/{c.N_DBPS.toLocaleString()}⌉</div>
        </div>
        <div className="stat">
          <div className="label">N_pld (Eq.36-54)</div>
          <div className="num-mid">{c.N_pld.toLocaleString()}</div>
          <div className="label" style={{marginTop:6}}>(N_SYM_init−1)·N_DBPS + N_DBPS_last</div>
        </div>
        <div className="stat">
          <div className="label">N_avbits (Eq.36-55)</div>
          <div className="num-mid">{c.N_avbits.toLocaleString()}</div>
          <div className="label" style={{marginTop:6}}>(N_SYM_init−1)·N_CBPS + N_CBPS_last</div>
        </div>
        <div className="stat">
          <div className="label">L_LDPC × N_CW</div>
          <div className="num-mid">{c.L_LDPC} × {c.N_CW}</div>
          <div className="label" style={{marginTop:6}}>= {(c.L_LDPC*c.N_CW).toLocaleString()} raw codeword bits</div>
        </div>
        <div className="stat" style={{borderColor:'var(--accent2)'}}>
          <div className="label">N_shrt (shortening)</div>
          <div className="num-mid">{c.N_shrt.toLocaleString()}</div>
          <div className="label" style={{marginTop:6}}>max(0, N_CW·L_LDPC·R − N_pld)</div>
        </div>
        <div className="stat" style={{borderColor:'var(--orange)'}}>
          <div className="label">N_punc (puncturing)</div>
          <div className="num-mid">{c.N_punc.toLocaleString()}</div>
          <div className="label" style={{marginTop:6}}>parity bits removed to fit N_avbits</div>
        </div>
        <div className="stat" style={{borderColor:'var(--green)'}}>
          <div className="label">N_rep (repetition)</div>
          <div className="num-mid">{c.N_rep.toLocaleString()}</div>
          <div className="label" style={{marginTop:6}}>cyclic copy when N_avbits > raw output</div>
        </div>
      </div>
      <div className="detail" style={{marginTop:12}}>
        <h3>Verification</h3>
        <div className="kv">
          <span className="k">N_CW·L_LDPC − N_shrt − N_punc + N_rep</span>
          <span className="v">{verify.toLocaleString()} {verify===c.N_avbits ? '✓ = N_avbits' : '✗ ≠ N_avbits!'}</span>
          <span className="k">Code rate effective</span>
          <span className="v">{(c.N_pld / c.N_avbits).toFixed(4)} (target {Rfrac.toFixed(4)})</span>
          <span className="k">Post-FEC padding</span>
          <span className="v">{(c.N_SYM*c.N_CBPS - c.N_avbits).toLocaleString()} bits ({((c.N_SYM*c.N_CBPS - c.N_avbits)/(c.N_SYM*c.N_CBPS)*100).toFixed(1)}%)</span>
        </div>
      </div>
    </div>
  );
}

window.Controls = Controls;
window.Headline = Headline;
window.Timeline = Timeline;
window.Concentric = Concentric;
window.BitPipeline = BitPipeline;
window.BitStream = BitStream;
window.LDPCParams = LDPCParams;
window.fmt = fmt;
