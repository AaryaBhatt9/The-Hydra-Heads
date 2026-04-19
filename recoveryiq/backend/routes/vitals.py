from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from services.rppg import process_vitals_from_frames

router = APIRouter()

class VitalsRequest(BaseModel):
    frames: List[str]
    fps: float = 30.0

@router.post("/analyze")
async def analyze_vitals(request: VitalsRequest):
    return process_vitals_from_frames(request.frames, request.fps)
