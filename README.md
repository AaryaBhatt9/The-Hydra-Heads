# 🐉 Hydra Heads — Recovery Intelligence

> From patient standing to personalized recovery session in 90 seconds —
> no wearables, no setup, no guesswork.

**GlobeHack Season 1 · ASU April 2026 · Sponsor Track: Hydrawav3 Wellness Technology Intelligence**

**Award:** Winner, TamaGrow Track

---

## 🎥 Demo

Demo video: https://youtu.be/utiUBV71CDA?si=fGlM-OMf1Q0Rf6X_

---

## ✨ What It Does

Hydra Heads is an AI recovery intelligence layer for the Hydrawav3 wellness device. In under 90 seconds it:

1. **Assesses posture** — MediaPipe 33-landmark pose detection measures shoulder elevation, knee flexion, hip asymmetry, and ROM flags in real time
2. **Measures contactless vitals** — heart rate, HRV, and breathing rate from your face and shoulders using skin-color rPPG (CHROM + POS algorithms). No wearables. No contact.
3. **Analyzes posture with Claude Vision** — one photo → pad placement recommendations
4. **Generates a personalized protocol** — Claude AI combines camera data, vitals, and intake into a specific session configuration
5. **Speaks the protocol aloud** — ElevenLabs voice synthesis, fully hands-free
6. **Fires the session to the device** — single MQTT API call starts the Hydrawav3 device autonomously
7. **Generates a PDF report** — vitals, protocol, and session history in one downloadable file

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- A modern browser (Chrome or Edge recommended for Web Speech API)
- A webcam

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/AaryaBhatt9/The-Hydra-Heads.git
cd The-Hydra-Heads

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev

# 4. Open in browser
# → http://localhost:5173
```

### API Keys (optional — app works in demo mode without them)

Open the app → click **Settings** (top right) and paste in:

| Key | Where to get it | What it unlocks |
|-----|----------------|-----------------|
| Claude API Key | [console.anthropic.com](https://console.anthropic.com) | AI protocol generation + Vision posture analysis |
| ElevenLabs API Key | [elevenlabs.io](https://elevenlabs.io) → Profile → API Key | Voice protocol delivery |
| Hydra Heads Device URL + MAC | Your device credentials | MQTT device control |

> **No keys needed to test** — all screens, vitals, and pose assessment work without any API keys. Protocol generation requires Claude API key.

---

## 🗂️ Project Structure

```
The-Hydra-Heads/
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── App.jsx          ← Entire application (single file)
    ├── App.css          ← Dark theme styles
    └── index.css        ← Global reset + typography
```

### Inside App.jsx

| Section | Lines | What it does |
|---------|-------|-------------|
| Pose Assessment | ~1–278 | MediaPipe landmarks, ROM angles, asymmetry detection |
| Vitals Engine | ~279–836 | Skin-color rPPG, CHROM + POS, Welch PSD, HRV, breathing |
| Voice Input | ~837–925 | Web Speech API — click to start/stop dictation |
| ElevenLabs TTS | ~926–955 | Text-to-speech protocol delivery |
| Claude Vision | ~956–1030 | Posture photo → pad placement analysis |
| AI Protocol | ~1031–1065 | Claude API prompt + response normalization |
| App State & Logic | ~1065–1570 | All React state, MQTT, PDF, session control |
| Screen: 0 Assess | | Camera + pose + Claude Vision UI |
| Screen: Vitals | | 30s contactless vitals measurement |
| Screen: 1 Know | | Patient intake + voice quick-fill |
| Screen: 2 Act | | Protocol display + device start |
| Screen: 3 Session | | Live timer + pause/stop controls |
| Screen: 4 Learn | | Recovery score + report + PDF |
| Landing Page | ~2337+ | Entry screen with Enter Dashboard button |

---

## 🧠 How Contactless Vitals Work

No finger on camera. No wearable. Just your face.

```
Camera frame
  → MediaPipe detects face landmarks
  → 3 ROIs: Forehead (50%) + Left Cheek (25%) + Right Cheek (25%)
  → YCbCr skin-pixel filter removes hair / shadows / background
  → ITA calibration adjusts for your skin tone (first 3 seconds)
  → CHROM rPPG + POS rPPG run in parallel
  → Motion gating: high-motion frames excluded automatically
  → Welch PSD with parabolic interpolation → Heart Rate
  → Peak detection + RMSSD → HRV
  → Shoulder width oscillation → Breathing Rate
```

**Accuracy:** ±3–6 bpm HR, ±2 bpm breathing, ±10ms HRV

> Best results: sit still, even front lighting, face 50–80cm from camera

---

## 🔧 Tech Stack

| Category | Technology |
|----------|-----------|
| Frontend | React 18 + Vite |
| AI | Claude API (claude-sonnet-4) — protocol + vision |
| Voice out | ElevenLabs API |
| Voice in | Web Speech API (free, browser-native) |
| Pose | MediaPipe Pose (Google CDN) |
| Vitals | CHROM rPPG + POS rPPG (custom DSP) |
| Device | Hydrawav3 MQTT API + JWT auth |
| PDF | jsPDF (no backend) |
| Deploy | Browser-native — no server required |

---

## 📱 App Flow

```
Landing → Enter Dashboard
  │
  ├── 0 Assess   → Camera + MediaPipe pose + ROM angles + Claude Vision
  ├── Vitals     → 30s contactless HR / HRV / Breathing
  ├── 1 Know     → Patient intake (voice or manual)
  ├── 2 Act      → AI-generated protocol + MQTT device start
  ├── 3 Session  → Live timer + device control (pause/stop)
  └── 4 Learn    → Recovery score + PDF report
```

---

## 📄 PDF Report

Click **Generate Report** on the Recovery screen. The PDF includes:

- Patient name, age, mobility score
- Protocol: goal, intensity, duration, Sun/Moon pad placement
- Vitals: heart rate, breathing rate, HRV
- Session summary and coaching tip
- Re-test recommendation

No server needed — generated entirely in the browser via jsPDF.

---

## 🔌 Device API Reference

The app sends sessions to the Hydrawav3 device via MQTT over REST:

```
POST /api/v1/auth/login       → JWT token
POST /api/v1/mqtt/publish     → topic: "HydraWav3Pro/config"
```

Test credentials (included in Settings defaults):

```
Server:  http://54.241.236.53:8080
MAC:     74:4D:BD:A0:A3:EC
User:    testpractitioner
Pass:    1234
```

---

## 🏁 Challenges We Ran Into

The hardest problem was contactless HR accuracy. Green-channel rPPG sounds simple but fails badly in practice — camera auto-exposure adjustments create 0.5–1 Hz artifacts that mask the actual pulse frequency. We went through four iterations:

1. Single green channel → too noisy, auto-exposure interference
2. CHROM algorithm → better, but skin-tone dependent
3. Added YCbCr skin-pixel filter → dramatically improved SNR
4. Added motion gating + linear detrending + parabolic FFT interpolation → consistent ±3–6 bpm accuracy

We also hit browser CORS issues calling the Anthropic API directly (fixed with `anthropic-dangerous-direct-browser-access` header), and the PDF was completely blank initially because `html2canvas` can't render `backdrop-filter` — replaced entirely with jsPDF text APIs.

---

## 🔮 What's Next

- Mobile app (Expo React Native) with the same pipeline on phone camera
- Longitudinal tracking — comparing vitals and ROM across sessions
- Practitioner dashboard — multi-patient history and outcome analytics
- HRV-guided protocol adaptation mid-session
- EHR integration for clinical-grade documentation

---

## 👥 Team

**Hydra Heads** — GlobeHack Season 1, ASU April 2026

---

## 📜 License

MIT
