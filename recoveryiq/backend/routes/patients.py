from fastapi import APIRouter
from models.db import SessionLocal, Patient, Session as SessionModel

router = APIRouter()

@router.get("/")
async def list_patients():
    db = SessionLocal()
    try:
        patients = db.query(Patient).all()
        result = []
        for p in patients:
            sessions = db.query(SessionModel).filter(
                SessionModel.patient_id == p.id,
                SessionModel.status == "complete"
            ).order_by(SessionModel.date).all()
            result.append({
                "id": p.id,
                "name": p.name,
                "age": p.age,
                "condition": p.condition,
                "activity_level": p.activity_level,
                "session_count": len(sessions),
                "last_session": sessions[-1].date.isoformat() if sessions else None,
                "rom_trend": [
                    {"date": s.date.isoformat(), "rom_before": s.rom_before, "rom_after": s.rom_after}
                    for s in sessions if s.rom_before and s.rom_after
                ]
            })
        return result
    finally:
        db.close()

@router.get("/{patient_id}/history")
async def patient_history(patient_id: str):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        sessions = db.query(SessionModel).filter(
            SessionModel.patient_id == patient_id
        ).order_by(SessionModel.date.desc()).all()
        return {
            "patient": {
                "id": patient.id, "name": patient.name,
                "age": patient.age, "condition": patient.condition,
                "activity_level": patient.activity_level
            } if patient else None,
            "sessions": [
                {
                    "id": s.id, "date": s.date.isoformat(), "focus_area": s.focus_area,
                    "pain_level": s.pain_level, "status": s.status,
                    "rom_before": s.rom_before, "rom_after": s.rom_after,
                    "intensity": s.intensity, "duration_minutes": s.duration_minutes,
                    "sun_pad_placement": s.sun_pad_placement,
                    "moon_pad_placement": s.moon_pad_placement,
                    "protocol_rationale": s.protocol_rationale,
                    "before_vitals": {
                        "heart_rate": s.heart_rate,
                        "hrv_rmssd": s.hrv_rmssd,
                        "breath_rate": s.breath_rate,
                        "nervous_system_state": s.nervous_system_state,
                    },
                    "after_vitals": {
                        "heart_rate": s.after_heart_rate,
                        "hrv_rmssd": s.after_hrv_rmssd,
                        "breath_rate": s.after_breath_rate,
                        "nervous_system_state": s.after_nervous_system_state,
                    },
                    "home_routine": s.home_routine,
                }
                for s in sessions
            ]
        }
    finally:
        db.close()
