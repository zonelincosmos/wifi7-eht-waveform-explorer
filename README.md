# 802.11be EHT Waveform Explorer

Interactive, in-browser visualisation of the IEEE 802.11be (Wi-Fi 7) EHT
PPDU pipeline — from APEP_LENGTH bytes through scrambler, LDPC encoder,
Gray-coded constellation, LDPC tone map, pilot insertion, NFFT = 6144 IFFT,
cyclic prefix, and the nine preamble fields (L-STF, L-LTF, L-SIG, RL-SIG,
U-SIG, EHT-SIG, EHT-STF, EHT-LTF, PE).

The pipeline is a JavaScript port of the spec-compliant Python reference
[zonelincosmos/wifi7-eht-waveform-generator-python](https://github.com/zonelincosmos/wifi7-eht-waveform-generator-python),
faithful to IEEE 802.11be-2024 §36.3 and 802.11-2024 §10.12 / §17.3.5 / §19.3.11.

---

## Live demo

> _After GitHub Pages deployment, the URL will be:_
> **`https://<your-username>.github.io/wifi7-eht-waveform-explorer/`**

No install, no build, no dependency download — just open the link.

---

## Quick start (local)

The page must be served over HTTP (Babel-standalone fetches `.jsx` via
`fetch()`, which Chrome/Edge block under `file://`):

```bash
# Python 3 (pre-installed almost everywhere):
python -m http.server 8000

# or Node:
npx serve .
```

Then visit <http://localhost:8000/>.

---

## What's where

| File | Purpose |
|---|---|
| `index.html` | Entry HTML, CSS, CDN script tags. |
| `eht_compute.jsx` | Length / parameter / CRC layer (live-recompute, cheap). |
| `eht_pipeline.jsx` | Numeric pipeline (Bluestein FFT, scrambler, LDPC, BCC, constellation, OFDM, 9 preamble field generators). |
| `eht_ldpc_matrices.js` | Annex F LDPC base matrices (12) + QC expansion + GF(2) Gauss-Jordan. |
| `eht_ltf_320_4x.js` | EHT-LTF 4x sequence for BW = 320 MHz canonical case. |
| `eht_app1.jsx` … `eht_app8.jsx` | UI components, split horizontally to keep Babel parsing fast. |
| `eht_scrambler.jsx` | Standalone interactive scrambler walkthrough. |
| `eht_app.jsx` | Main React wrapper / section layout / TOC. |

---

## How it's built

* React 18 (UMD) + Babel-standalone via CDN — JSX is transpiled in the
  browser. This trades ~700 ms first-paint for a zero-build, view-source
  friendly demo.
* No bundler, no `node_modules`, no deployment step.
* All numeric work is `Float64Array` for IEEE-754 parity with NumPy
  `complex128`.
* The IFFT is a Bluestein chirp-z so any N (e.g. 6144) is supported.

---

## Spec coverage

Verified against the Python reference and the IEEE drafts:

| Pipeline stage | Spec section | Reference Python |
|---|---|---|
| Length / N_DBPS / N_SYM cascade | §36.3.7.10, Table 19-16 | `eht_config.py::_ldpc_params` |
| A-MPDU + delimiter CRC-8 | §10.12.7 | `utils/ampdu.py` |
| Scrambler PN11 (S(x)=x¹¹+x⁹+1) | §36.3.13.2, Eq. 36-46, Fig. 36-50 | `modulation/scrambler.py` |
| LDPC + shortening / puncturing / repetition | §19.3.11.7.5, Eq. 36-54..62 | `coding/ldpc_encoder.py` |
| BCC + puncture + interleavers | §17.3.5.5/6/7 | `coding/bcc_*.py` |
| Constellation Gray-coded BPSK..4096-QAM | §36.3.13.5, Table 36-51 | `modulation/constellation_map.py` |
| LDPC tone map | Eq. 36-72 (D_TM = 9/12/20) | `fields/gen_data_field.py` |
| Pilot insertion (127-element polarity, Ψ₈) | §17.3.5.10, Eq. 27-104 | `eht_constants.py` |
| OFDM modulate + CP | §36.3.13 | `modulation/ofdm_mod.py` |
| Preamble (L-STF, L-LTF, L-SIG, RL-SIG, U-SIG, EHT-SIG, EHT-STF, EHT-LTF, PE) | §36.3.12.x | `fields/gen_*.py` |

The canonical case **BW = 320 MHz, MCS = 13 (4096-QAM 5/6 LDPC),
GI = 3.2 µs, LTFType = 4×, PayloadBytes = 5000** produces a 96 µs PPDU
(46,080 samples @ 480 MHz), bit-exact with the Python reference.

---

## Reference

* Python (canonical, spec-compliant) — <https://github.com/zonelincosmos/wifi7-eht-waveform-generator-python>
* IEEE Std 802.11be-2024 (EHT amendment) and IEEE Std 802.11-2024 base.

## License

[MIT](LICENSE) — same as the Python reference.
