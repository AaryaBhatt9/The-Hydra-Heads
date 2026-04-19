from pydantic import BaseModel
from typing import Optional, List

class VitalsData(BaseModel):
    heart_rate: float
    hrv_rmssd: float
    breath_rate: float
    nervous_system_state: str
    confidence: float
    mock: Optional[bool] = False

class IntakeData(BaseModel):
    patient_id: str
    focus_area: str
    pain_level: int
    session_type: str
    intake_notes: Optional[str] = ""
    pose_data: Optional[dict] = None
    vitals_data: Optional[VitalsData] = None

class MQTTPayload(BaseModel):
    mac: str
    sessionCount: int = 3
    sessionPause: int = 30
    sDelay: int = 0
    cycle1: int = 1
    cycle5: int = 1
    edgeCycleDuration: int = 9
    cycleRepetitions: List[int] = [6, 6, 3]
    cycleDurations: List[int] = [3, 3, 3]
    cyclePauses: List[int] = [3, 3, 3]
    pauseIntervals: List[int] = [3, 3, 3]
    leftFuncs: List[str] = ["leftColdBlue", "leftHotRed", "leftCold"]
    rightFuncs: List[str] = ["rightHotRed", "rightColdBlue", "rightHotRed"]
    pwmValues: dict = {"hot": [90, 90, 90], "cold": [250, 250, 250]}
    playCmd: int = 1
    led: int = 1
    hotDrop: int = 5
    coldDrop: int = 3
    vibMin: int = 15
    vibMax: int = 222
    totalDuration: int = 426

class PatientState(BaseModel):
    patient_id: str
    name: str
    age: int
    condition: str
    activity_level: str
    focus_area: str
    pain_level: int
    session_type: str
    intake_notes: str
    pose_asymmetry: Optional[dict] = None
    vitals: Optional[VitalsData] = None
    prior_sessions_count: int = 0

class ProtocolRecommendation(BaseModel):
    sun_pad_placement: str
    moon_pad_placement: str
    intensity: str
    duration_minutes: int
    modality_focus: str
    practitioner_rationale: str
    mqtt_payload: Optional[MQTTPayload] = None

class SessionLog(BaseModel):
    session_id: str
    patient_id: str
    protocol: ProtocolRecommendation
    rom_before: float
    rom_after: float

class DayActivity(BaseModel):
    name: str
    duration: str
    instructions: str
    focus_area: str

class DayRoutine(BaseModel):
    day: int
    activities: List[DayActivity]

class HomeRoutine(BaseModel):
    days: List[DayRoutine]
    key_message: str
    next_session_recommendation: str

class PipelineResponse(BaseModel):
    patient_state: PatientState
    protocol: ProtocolRecommendation
    routine: HomeRoutine

class DeviceStartRequest(BaseModel):
    session_id: str
    intensity: str
    session_type: str
    duration_minutes: int = 9
    mqtt_payload: Optional[dict] = None

class SessionCompletionRequest(BaseModel):
    rom_before: float
    rom_after: float
    after_vitals: Optional[VitalsData] = None
