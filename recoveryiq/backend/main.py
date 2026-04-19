from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import patients, sessions, pipeline
from routes.vitals import router as vitals_router
from routes.device import router as device_router
from models.db import Base, engine, ensure_sqlite_columns
from seed import seed_database

Base.metadata.create_all(bind=engine)
ensure_sqlite_columns()
seed_database()

app = FastAPI(title="RecoveryIQ API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients.router, prefix="/api/patients")
app.include_router(sessions.router, prefix="/api/sessions")
app.include_router(pipeline.router, prefix="/api/pipeline")
app.include_router(vitals_router, prefix="/api/vitals")
app.include_router(device_router, prefix="/api/device")

@app.get("/")
async def root():
    return {"status": "RecoveryIQ API running", "version": "1.0.0"}
