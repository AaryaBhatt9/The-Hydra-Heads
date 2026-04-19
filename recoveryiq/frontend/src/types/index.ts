export interface Patient {
  id: string;
  name: string;
  age: number;
  condition: string;
  activity_level: string;
  session_count: number;
  last_session: string | null;
  rom_trend: ROMDataPoint[];
}

export interface ROMDataPoint {
  date: string;
  rom_before: number;
  rom_after: number;
}

export interface VitalsData {
  heart_rate: number;
  hrv_rmssd: number;
  breath_rate: number;
  nervous_system_state: 'stressed' | 'balanced' | 'recovered';
  confidence: number;
  mock?: boolean;
}

export interface VitalsDelta {
  before: VitalsData;
  after: VitalsData;
  hr_delta: number;
  hrv_delta: number;
  br_delta: number;
  rom_before: number;
  rom_after: number;
  rom_delta: number;
}

export interface PoseAsymmetry {
  shoulder_asymmetry: 'left_elevated' | 'right_elevated' | 'balanced';
  hip_asymmetry: 'left_drop' | 'right_drop' | 'balanced';
  confidence_score: number;
  suggested_sun_zone: string;
  suggested_moon_zone: string;
}

export interface BodyMapIntake {
  body_area: string;
  pain_level: number;
  session_goal: 'recovery' | 'muscle_activation' | 'muscle_relaxation' | 'parasympathetic_activation';
}

export interface PadPlacement {
  pad_id: string;
  pad_type: 'sun' | 'moon';
  body_location: string;
  flow_direction: 'clockwise' | 'anticlockwise' | 'push' | 'pull';
  sequence_order: number;
  purpose: string;
}

export interface MultiPadProtocol {
  pads: PadPlacement[];
  flow_narrative: string;
  total_devices: number;
  session_type: string;
  intensity: 'low' | 'moderate' | 'high';
  duration_minutes: number;
  practitioner_rationale: string;
}

export interface ProtocolRecommendation {
  sun_pad_placement: string;
  moon_pad_placement: string;
  intensity: 'low' | 'moderate' | 'high';
  duration_minutes: number;
  modality_focus: string;
  practitioner_rationale: string;
  multi_pad?: MultiPadProtocol;
  mqtt_payload?: Record<string, unknown>;
}

export interface DayActivity {
  name: string;
  duration: string;
  instructions: string;
  focus_area: string;
}

export interface DayRoutine {
  day: number;
  activities: DayActivity[];
}

export interface HomeRoutine {
  days: DayRoutine[];
  key_message: string;
  next_session_recommendation: string;
}

export interface PipelineResult {
  session_id: string;
  patient_state: Record<string, unknown>;
  protocol: ProtocolRecommendation;
  routine: HomeRoutine;
}

export type SessionStage =
  | 'vitalscan_before'
  | 'bodymap'
  | 'flowscan'
  | 'generating'
  | 'protocol'
  | 'active'
  | 'vitalscan_after'
  | 'sharecard'
  | 'complete';
