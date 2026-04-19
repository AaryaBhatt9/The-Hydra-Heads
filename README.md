# RecoveryIQ Build

This workspace now contains a working RecoveryIQ demo split across:

- `Hydra_WebApp/`: practitioner + patient-facing React/Vite app with the before/during/after flow
- `recoveryiq/backend/`: FastAPI backend with patient seed data, vitals mock/rPPG fallback, 3-agent pipeline, and MQTT device control endpoints

## Run it

Frontend:

```bash
cd Hydra_WebApp
npm install
npm run dev
```

Backend:

```bash
cd recoveryiq/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Demo Flow

1. Open the dashboard and choose a seeded patient.
2. Start a new session and complete the 3-tap intake.
3. Run the before-session VitalScan.
4. Generate the agent pipeline protocol and start the device session.
5. Run the after-session scan and complete the session to unlock the share card and RecoveryRx routine.
