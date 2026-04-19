from models.db import SessionLocal, engine, Base, Patient, Session as SessionModel
from datetime import datetime

MOCK_PATIENTS = [
    {"id": "patient-001", "name": "Maria Gonzalez", "age": 42, "condition": "IT band tightness, right hip restriction", "activity_level": "high"},
    {"id": "patient-002", "name": "James Chen", "age": 55, "condition": "Chronic left shoulder tension, post-adjustment", "activity_level": "moderate"},
    {"id": "patient-003", "name": "Elena Vasquez", "age": 34, "condition": "Lower back tightness, stress-related tension", "activity_level": "moderate"},
]

MOCK_SESSIONS = [
    {"patient_id": "patient-001", "focus_area": "right hip", "pain_level": 6, "sun_pad_placement": "Right hip", "moon_pad_placement": "Lower back", "intensity": "moderate", "duration_minutes": 9, "rom_before": 32.0, "rom_after": 44.0, "status": "complete", "date": "2026-04-04T14:20:00"},
    {"patient_id": "patient-001", "focus_area": "right hip", "pain_level": 4, "sun_pad_placement": "Right hip", "moon_pad_placement": "Lower back", "intensity": "moderate", "duration_minutes": 9, "rom_before": 38.0, "rom_after": 50.0, "status": "complete", "date": "2026-04-11T14:15:00"},
    {"patient_id": "patient-002", "focus_area": "left shoulder", "pain_level": 5, "sun_pad_placement": "Left shoulder", "moon_pad_placement": "Upper back", "intensity": "low", "duration_minutes": 9, "rom_before": 40.0, "rom_after": 52.0, "status": "complete", "date": "2026-04-10T10:00:00"},
    {"patient_id": "patient-003", "focus_area": "lower back", "pain_level": 7, "sun_pad_placement": "Lower back", "moon_pad_placement": "Upper back", "intensity": "low", "duration_minutes": 9, "rom_before": 28.0, "rom_after": 41.0, "status": "complete", "date": "2026-04-12T11:30:00"},
]

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Patient).count() > 0:
            return
        for p in MOCK_PATIENTS:
            db.add(Patient(**p))
        db.commit()
        for s in MOCK_SESSIONS:
            session_data = dict(s)
            date_str = session_data.pop("date")
            session_data["date"] = datetime.fromisoformat(date_str)
            db.add(SessionModel(**session_data))
        db.commit()
        print("Database seeded with mock data.")
    finally:
        db.close()
