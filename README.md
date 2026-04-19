# The-Hydra-Heads
Globe Hacks
# 🐉 Hydra Heads — Recovery Intelligence

> From patient standing to personalized recovery session in 90 seconds —
> no wearables, no setup, no guesswork.

**GlobeHack Season 1 · ASU April 2026 · Sponsor Track: Hydrawav3 Wellness Technology Intelligence**

---

## 🎥 Demo

> _[Add your 2-minute demo video link here — Loom / YouTube]_

---

## ✨ What It Does

Hydra Heads is an AI recovery intelligence layer for the Hydrawav3 wellness
device. In under 90 seconds it:

1. **Assesses posture** — MediaPipe 33-landmark pose detection measures
   shoulder elevation, knee flexion, hip asymmetry, and ROM flags in real time
2. **Measures contactless vitals** — heart rate, HRV, and breathing rate from
   your face and shoulders using skin-color rPPG (CHROM + POS algorithms).
   No wearables. No contact.
3. **Analyzes posture with Claude Vision** — one photo → pad placement
   recommendations
4. **Generates a personalized protocol** — Claude AI combines camera data,
   vitals, and intake into a specific session configuration
5. **Speaks the protocol aloud** — ElevenLabs voice synthesis, fully hands-free
6. **Fires the session to the device** — single MQTT API call starts the
   Hydrawav3 device autonomously
7. **Generates a PDF report** — vitals, protocol, and session history in one
   downloadable file

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
| Hydrawav3 Server URL + MAC | Your device credentials | MQTT device control |

> **No keys needed to test** — all screens, vitals, and pose assessment work
> without any API keys. Protocol generation requires Claude API key.

---

## 🗂️ Project Structure
