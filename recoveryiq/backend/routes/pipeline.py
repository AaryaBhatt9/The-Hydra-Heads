from fastapi import APIRouter, HTTPException
from models.schemas import IntakeData, SessionCompletionRequest
from agents.pipeline import recovery_pipeline
from models.db import SessionLocal, Patient, Session as SessionModel
from services.mqtt import build_mqtt_payload

router = APIRouter()

@router.post("/run")
async def run_pipeline(intake: IntakeData):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.id == intake.patient_id).first()
        prior_sessions = db.query(SessionModel).filter(
            SessionModel.patient_id == intake.patient_id,
            SessionModel.status == "complete"
        ).count()
    finally:
        db.close()

    if not patient:
        return {"error": "Patient not found"}

    initial_state = {
        "intake_data": {
            **intake.dict(),
            "patient_name": patient.name,
            "patient_age": patient.age,
            "patient_condition": patient.condition,
            "activity_level": patient.activity_level,
            "prior_sessions_count": prior_sessions
        },
        "patient_state": None,
        "protocol": None,
        "routine": None,
        "error": None
    }

    result = recovery_pipeline.invoke(initial_state)
    protocol = result["protocol"]
    session_type = (
        protocol.get("multi_pad", {}).get("session_type")
        or result["patient_state"].get("session_type")
        or intake.session_type
    )
    mqtt_payload = protocol.get("mqtt_payload") or build_mqtt_payload(
        protocol.get("intensity", "moderate"),
        session_type,
        protocol.get("duration_minutes", 9),
    )
    protocol["mqtt_payload"] = mqtt_payload

    db = SessionLocal()
    try:
        new_session = SessionModel(
            patient_id=intake.patient_id,
            focus_area=intake.focus_area,
            pain_level=intake.pain_level,
            intake_notes=intake.intake_notes or "",
            pose_data=intake.pose_data,
            sun_pad_placement=protocol.get("sun_pad_placement", ""),
            moon_pad_placement=protocol.get("moon_pad_placement", ""),
            intensity=protocol.get("intensity", "moderate"),
            duration_minutes=protocol.get("duration_minutes", 9),
            protocol_rationale=protocol.get("practitioner_rationale", ""),
            mqtt_payload=mqtt_payload,
            home_routine=result["routine"],
            status="pending"
        )
        if intake.vitals_data:
            new_session.heart_rate = intake.vitals_data.heart_rate
            new_session.hrv_rmssd = intake.vitals_data.hrv_rmssd
            new_session.breath_rate = intake.vitals_data.breath_rate
            new_session.nervous_system_state = intake.vitals_data.nervous_system_state
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        session_id = new_session.id
    finally:
        db.close()

    return {
        "session_id": session_id,
        "patient_state": result["patient_state"],
        "protocol": protocol,
        "routine": result["routine"]
    }

@router.post("/complete/{session_id}")
async def complete_session(session_id: str, payload: SessionCompletionRequest):
    db = SessionLocal()
    try:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        session.rom_before = payload.rom_before
        session.rom_after = payload.rom_after
        session.status = "complete"

        if payload.after_vitals:
            session.after_heart_rate = payload.after_vitals.heart_rate
            session.after_hrv_rmssd = payload.after_vitals.hrv_rmssd
            session.after_breath_rate = payload.after_vitals.breath_rate
            session.after_nervous_system_state = payload.after_vitals.nervous_system_state

        db.commit()

        return {
            "status": "complete",
            "rom_delta": payload.rom_after - payload.rom_before,
            "session_id": session_id,
        }
    finally:
        db.close()
