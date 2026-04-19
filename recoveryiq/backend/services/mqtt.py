import requests
import json
import os

HYDRAWAV3_API_BASE = os.getenv("HYDRAWAV3_API_BASE", "https://app.hydrawav3.studio")
HYDRAWAV3_USERNAME = os.getenv("HYDRAWAV3_USERNAME", "annierae")
HYDRAWAV3_PASSWORD = os.getenv("HYDRAWAV3_PASSWORD", "anniesturm")
DEVICE_MAC = os.getenv("HYDRAWAV3_DEVICE_MAC", "74:4D:BD:A0:A3:EC")
MOCK_DEVICE = os.getenv("HYDRAWAV3_MOCK_DEVICE", "true") == "true"

_cached_token = None

def get_access_token() -> str:
    global _cached_token
    if _cached_token:
        return _cached_token
    response = requests.post(
        f"{HYDRAWAV3_API_BASE}/api/v1/auth/login",
        json={"username": HYDRAWAV3_USERNAME, "password": HYDRAWAV3_PASSWORD, "rememberMe": True}
    )
    response.raise_for_status()
    data = response.json()
    token = data.get("JWT_ACCESS_TOKEN", "").replace("Bearer ", "")
    _cached_token = token
    return token

def build_mqtt_payload(intensity: str, session_type: str, duration_minutes: int = 9) -> dict:
    intensity_map = {
        "low":      {"hotDrop": 3, "coldDrop": 2, "vibMin": 10, "vibMax": 150},
        "moderate": {"hotDrop": 5, "coldDrop": 3, "vibMin": 15, "vibMax": 222},
        "high":     {"hotDrop": 8, "coldDrop": 5, "vibMin": 20, "vibMax": 300},
    }
    params = intensity_map.get(intensity, intensity_map["moderate"])
    if session_type in ("muscle_activation", "parasympathetic_activation"):
        left_funcs = ["leftHotRed", "leftColdBlue", "leftHotRed"]
        right_funcs = ["rightHotRed", "rightColdBlue", "rightHotRed"]
    else:
        left_funcs = ["leftColdBlue", "leftHotRed", "leftCold"]
        right_funcs = ["rightHotRed", "rightColdBlue", "rightHotRed"]
    return {
        "mac": DEVICE_MAC,
        "sessionCount": 3,
        "sessionPause": 30,
        "sDelay": 0,
        "cycle1": 1,
        "cycle5": 1,
        "edgeCycleDuration": 9,
        "cycleRepetitions": [6, 6, 3],
        "cycleDurations": [3, 3, 3],
        "cyclePauses": [3, 3, 3],
        "pauseIntervals": [3, 3, 3],
        "leftFuncs": left_funcs,
        "rightFuncs": right_funcs,
        "pwmValues": {"hot": [90, 90, 90], "cold": [250, 250, 250]},
        "playCmd": 1,
        "led": 1,
        "hotDrop": params["hotDrop"],
        "coldDrop": params["coldDrop"],
        "vibMin": params["vibMin"],
        "vibMax": params["vibMax"],
        "totalDuration": duration_minutes * 60,
    }

def send_mqtt_command(payload_dict: dict) -> dict:
    if MOCK_DEVICE:
        print(f"[MOCK MQTT] playCmd={payload_dict.get('playCmd')}, hotDrop={payload_dict.get('hotDrop')}, coldDrop={payload_dict.get('coldDrop')}")
        return {"success": True, "mock": True}
    try:
        token = get_access_token()
        stringified_payload = json.dumps(payload_dict)
        response = requests.post(
            f"{HYDRAWAV3_API_BASE}/api/v1/mqtt/publish",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            json={"topic": "HydraWav3Pro/config", "payload": stringified_payload},
            timeout=10
        )
        response.raise_for_status()
        return {"success": True}
    except Exception as e:
        global _cached_token
        _cached_token = None
        return {"success": False, "error": str(e)}

def stop_device() -> dict:
    if MOCK_DEVICE:
        print("[MOCK MQTT] Stop command")
        return {"success": True, "mock": True}
    token = get_access_token()
    payload = json.dumps({"mac": DEVICE_MAC, "playCmd": 3})
    r = requests.post(f"{HYDRAWAV3_API_BASE}/api/v1/mqtt/publish",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"topic": "HydraWav3Pro/config", "payload": payload})
    return {"success": r.ok}

def pause_device() -> dict:
    if MOCK_DEVICE:
        return {"success": True, "mock": True}
    token = get_access_token()
    payload = json.dumps({"mac": DEVICE_MAC, "playCmd": 2})
    requests.post(f"{HYDRAWAV3_API_BASE}/api/v1/mqtt/publish",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"topic": "HydraWav3Pro/config", "payload": payload})
    return {"success": True}
