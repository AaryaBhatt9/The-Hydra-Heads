from fastapi import APIRouter
from models.db import SessionLocal, Session as SessionModel

router = APIRouter()

@router.get("/{session_id}")
async def get_session(session_id: str):
    db = SessionLocal()
    try:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            return {"error": "Session not found"}
        return {
            "id": session.id,
            "patient_id": session.patient_id,
            "date": session.date.isoformat(),
            "focus_area": session.focus_area,
            "pain_level": session.pain_level,
            "intake_notes": session.intake_notes,
            "status": session.status,
            "rom_before": session.rom_before,
            "rom_after": session.rom_after,
            "intensity": session.intensity,
            "duration_minutes": session.duration_minutes,
            "sun_pad_placement": session.sun_pad_placement,
            "moon_pad_placement": session.moon_pad_placement,
            "protocol_rationale": session.protocol_rationale,
            "mqtt_payload": session.mqtt_payload,
            "device_started": session.device_started,
            "pose_data": session.pose_data,
            "before_vitals": {
                "heart_rate": session.heart_rate,
                "hrv_rmssd": session.hrv_rmssd,
                "breath_rate": session.breath_rate,
                "nervous_system_state": session.nervous_system_state,
            },
            "after_vitals": {
                "heart_rate": session.after_heart_rate,
                "hrv_rmssd": session.after_hrv_rmssd,
                "breath_rate": session.after_breath_rate,
                "nervous_system_state": session.after_nervous_system_state,
            },
            "home_routine": session.home_routine,
        }
    finally:
        db.close()
