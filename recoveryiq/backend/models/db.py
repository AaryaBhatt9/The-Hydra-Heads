from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, ForeignKey, create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import uuid

SQLALCHEMY_DATABASE_URL = "sqlite:///./recoveryiq.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Patient(Base):
    __tablename__ = "patients"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    age = Column(Integer)
    condition = Column(String)
    activity_level = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class Session(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String, ForeignKey("patients.id"))
    date = Column(DateTime, default=datetime.utcnow)
    focus_area = Column(String)
    pain_level = Column(Integer)
    intake_notes = Column(String)
    heart_rate = Column(Float)
    hrv_rmssd = Column(Float)
    breath_rate = Column(Float)
    nervous_system_state = Column(String)
    pose_data = Column(JSON)
    sun_pad_placement = Column(String)
    moon_pad_placement = Column(String)
    intensity = Column(String)
    duration_minutes = Column(Integer)
    protocol_rationale = Column(String)
    mqtt_payload = Column(JSON)
    device_started = Column(String, default="false")
    rom_before = Column(Float)
    rom_after = Column(Float)
    home_routine = Column(JSON)
    after_heart_rate = Column(Float)
    after_hrv_rmssd = Column(Float)
    after_breath_rate = Column(Float)
    after_nervous_system_state = Column(String)
    status = Column(String, default="pending")

def ensure_sqlite_columns() -> None:
    inspector = inspect(engine)
    if "sessions" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("sessions")}
    missing_columns = {
        "after_heart_rate": "ALTER TABLE sessions ADD COLUMN after_heart_rate FLOAT",
        "after_hrv_rmssd": "ALTER TABLE sessions ADD COLUMN after_hrv_rmssd FLOAT",
        "after_breath_rate": "ALTER TABLE sessions ADD COLUMN after_breath_rate FLOAT",
        "after_nervous_system_state": "ALTER TABLE sessions ADD COLUMN after_nervous_system_state VARCHAR",
    }

    with engine.begin() as connection:
        for column_name, statement in missing_columns.items():
            if column_name not in existing_columns:
                connection.execute(text(statement))
