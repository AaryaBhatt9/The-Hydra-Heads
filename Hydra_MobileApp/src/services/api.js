import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Hydrawav3 MQTT Device API ────────────────────────────────────────────────
export async function deviceLogin(serverUrl, username, password) {
  const r = await fetch(`${serverUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, rememberMe: true }),
  });
  if (!r.ok) throw new Error(`Auth failed (${r.status})`);
  const d = await r.json();
  return (d.JWT_ACCESS_TOKEN || '').replace('Bearer ', '');
}

export async function sendMQTT(serverUrl, token, payload) {
  const r = await fetch(`${serverUrl}/api/v1/mqtt/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ topic: 'HydraWav3Pro/config', payload: JSON.stringify(payload) }),
  });
  if (!r.ok) throw new Error(`MQTT failed (${r.status})`);
  return r.json();
}

export function buildSessionConfig(mac, protocol) {
  const pwm = {
    gentle:   { hot:[70,70,70],   cold:[180,180,180] },
    moderate: { hot:[80,80,80],   cold:[220,220,220] },
    intense:  { hot:[90,90,90],   cold:[250,250,250] },
  }[protocol.intensity] || { hot:[80,80,80], cold:[220,220,220] };
  const vib = {
    gentle:   { min:10, max:120 },
    moderate: { min:15, max:180 },
    intense:  { min:20, max:222 },
  }[protocol.intensity] || { min:15, max:180 };
  const act = protocol.goal === 'activation';
  return {
    mac, sessionCount:3, sessionPause:30, sDelay:0, cycle1:1, cycle5:1,
    edgeCycleDuration:9, cycleRepetitions:[6,6,3], cycleDurations:[3,3,3],
    cyclePauses:[3,3,3], pauseIntervals:[3,3,3],
    leftFuncs:  act ? ['leftHotRed','leftColdBlue','leftHotRed']    : ['leftColdBlue','leftHotRed','leftColdBlue'],
    rightFuncs: act ? ['rightColdBlue','rightHotRed','rightColdBlue'] : ['rightHotRed','rightColdBlue','rightHotRed'],
    pwmValues: pwm, playCmd:1, led:1, hotDrop:5, coldDrop:3,
    vibMin: vib.min, vibMax: vib.max, totalDuration:426,
  };
}

// ─── Claude AI Protocol Generation ───────────────────────────────────────────
export async function generateProtocol(patient, assessment) {
  const cam = assessment ? `
OBJECTIVE CAMERA DATA (MoveNet pose + rPPG):
  Right shoulder elevation : ${assessment.shoulderR}° (normal 140–180°)
  Left shoulder elevation  : ${assessment.shoulderL}° (normal 140–180°)
  Right knee flexion       : ${assessment.kneeR}° (normal 120–155°)
  Left knee flexion        : ${assessment.kneeL}° (normal 120–155°)
  Shoulder asymmetry       : ${assessment.shoulderAsym}° (flag >10°)
  Hip tilt                 : ${assessment.hipAsym}% (flag >8%)
  Flags                    : ${assessment.flags?.join('; ') || 'None'}
  Mobility score           : ${assessment.mobilityScore}/10
${assessment.heartRate ? `  Heart rate (rPPG)        : ${assessment.heartRate} bpm` : ''}` : 'No camera assessment.';

  const prompt = `You are a Hydrawav3 wellness protocol specialist. Generate a personalized protocol in wellness-only language.

PATIENT:
  Name: ${patient.name}, Age: ${patient.age || 'n/a'}
  Practitioner: ${patient.practitionerType}
  Goal: ${patient.primaryConcern}
  Areas: ${patient.areas?.join(', ') || 'n/a'}
  Mobility: ${patient.mobilityScore}/10
  HRV: ${patient.hrv || 'n/a'} · Sleep: ${patient.sleepQuality || 'n/a'}
${cam}

DEVICE: Hydrawav3 dual-pad
  Sun pad = heating + red LED 660nm → supports circulation, tissue prep
  Moon pad = cooling + blue LED 450nm → supports nervous system, recovery
  goal: "relaxation"|"activation"|"recovery"|"reset"
  intensity: "gentle"|"moderate"|"intense"

RULES: use "supports/wellness/mobility" NOT "treats/clinical/medical/diagnoses"

Return ONLY valid JSON:
{
  "sunPadPlacement": "body area",
  "moonPadPlacement": "body area",
  "goal": "relaxation|activation|recovery|reset",
  "intensity": "gentle|moderate|intense",
  "sessionDurationMinutes": 9,
  "primaryFinding": "key camera finding in wellness language",
  "reasoning": "2-3 sentences explaining protocol",
  "asymmetryNote": "asymmetry guidance or null",
  "coachingTip": "one between-visit tip",
  "recoveryFocus": "what to retest post-session"
}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await resp.json();
  const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

// ─── Patient AI Coaching ──────────────────────────────────────────────────────
export async function getDailyCoaching(patientName, history, lastProtocol) {
  const prompt = `You are a Hydrawav3 wellness coach. Give a short daily recovery tip.

Patient: ${patientName}
Sessions completed: ${history?.length || 0}
Last session goal: ${lastProtocol?.goal || 'n/a'}
Last coaching tip: ${lastProtocol?.coachingTip || 'n/a'}
Focus areas: ${lastProtocol?.recoveryFocus || 'n/a'}

Return ONLY JSON:
{
  "greeting": "short motivating greeting (10 words max)",
  "tip": "one actionable mobility or wellness tip for today (1-2 sentences)",
  "exercise": "one simple between-visit exercise or movement (1 sentence)",
  "checkIn": "one question to ask themselves about how they feel today"
}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await resp.json();
  const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────
const KEYS = { history: '@hw3_history', settings: '@hw3_settings', patient: '@hw3_patient' };

export async function saveSession(entry) {
  try {
    const raw = await AsyncStorage.getItem(KEYS.history);
    const hist = raw ? JSON.parse(raw) : [];
    hist.unshift({ ...entry, id: Date.now() });
    await AsyncStorage.setItem(KEYS.history, JSON.stringify(hist.slice(0, 100)));
  } catch (e) { console.warn('saveSession error', e); }
}

export async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.history);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveSettings(s) {
  try { await AsyncStorage.setItem(KEYS.settings, JSON.stringify(s)); } catch {}
}

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.settings);
    return raw ? JSON.parse(raw) : { serverUrl:'', deviceMac:'74:4D:BD:A0:A3:EC', username:'', password:'' };
  } catch { return { serverUrl:'', deviceMac:'74:4D:BD:A0:A3:EC', username:'', password:'' }; }
}

export async function savePatientProfile(p) {
  try { await AsyncStorage.setItem(KEYS.patient, JSON.stringify(p)); } catch {}
}

export async function loadPatientProfile() {
  try {
    const raw = await AsyncStorage.getItem(KEYS.patient);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
