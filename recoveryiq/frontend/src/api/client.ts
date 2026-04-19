import type { Patient, PipelineResult, VitalsData } from '../types';

const BASE =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:8000`;

async function jsonFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export const api = {
  getPatients: () =>
    jsonFetch<Patient[]>(`${BASE}/api/patients/`),

  getPatientHistory: (id: string) =>
    jsonFetch(`${BASE}/api/patients/${id}/history`),

  runPipeline: (intake: {
    patient_id: string;
    focus_area: string;
    pain_level: number;
    session_type: string;
    intake_notes?: string;
    pose_data?: object;
    vitals_data?: object;
  }) =>
    jsonFetch<PipelineResult>(`${BASE}/api/pipeline/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intake),
    }),

  completeSession: (
    sessionId: string,
    romBefore: number,
    romAfter: number,
    afterVitals?: object,
  ) =>
    jsonFetch<{ status: string; rom_delta: number; session_id: string }>(`${BASE}/api/pipeline/complete/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rom_before: romBefore,
        rom_after: romAfter,
        after_vitals: afterVitals,
      }),
    }),

  analyzeVitals: (frames: string[], fps = 30) =>
    jsonFetch<VitalsData>(`${BASE}/api/vitals/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frames, fps }),
    }),

  startDevice: (
    sessionId: string,
    intensity: string,
    sessionType: string,
    durationMinutes = 9,
    mqttPayload?: object,
  ) =>
    jsonFetch<{ success: boolean; mock?: boolean; error?: string; payload_sent?: object }>(`${BASE}/api/device/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        intensity,
        session_type: sessionType,
        duration_minutes: durationMinutes,
        mqtt_payload: mqttPayload,
      }),
    }),

  stopDevice: () =>
    jsonFetch<{ success: boolean; mock?: boolean }>(`${BASE}/api/device/stop`, { method: 'POST' }),

  pauseDevice: () =>
    jsonFetch<{ success: boolean; mock?: boolean }>(`${BASE}/api/device/pause`, { method: 'POST' }),
};
