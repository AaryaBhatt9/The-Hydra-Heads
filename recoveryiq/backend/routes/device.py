from fastapi import APIRouter, HTTPException
from services.mqtt import send_mqtt_command, stop_device, pause_device, build_mqtt_payload
from models.db import SessionLocal, Session as SessionModel
from models.schemas import DeviceStartRequest

router = APIRouter()

@router.post("/start")
async def start_session_on_device(request: DeviceStartRequest):
    payload = request.mqtt_payload or build_mqtt_payload(
        request.intensity,
        request.session_type,
        request.duration_minutes,
    )
    result = send_mqtt_command(payload)

    db = SessionLocal()
    try:
        session = db.query(SessionModel).filter(SessionModel.id == request.session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        session.mqtt_payload = payload
        session.device_started = "true" if result.get("success") else "false"
        session.status = "active" if result.get("success") else session.status
        db.commit()
    finally:
        db.close()

    return {**result, "payload_sent": payload}

@router.post("/stop")
async def stop_session_on_device():
    return stop_device()

@router.post("/pause")
async def pause_session_on_device():
    return pause_device()
