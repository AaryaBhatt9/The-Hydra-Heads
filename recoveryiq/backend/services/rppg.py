import base64

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import numpy as np
except ImportError:
    np = None

try:
    from scipy import signal
    from scipy.fft import fft, fftfreq
except ImportError:
    signal = None
    fft = None
    fftfreq = None

def scientific_stack_available() -> bool:
    return all(module is not None for module in (cv2, np, signal, fft, fftfreq))

def decode_base64_frames(frames_b64: list) -> list:
    if not scientific_stack_available():
        return []
    frames = []
    for f in frames_b64:
        try:
            img_data = base64.b64decode(f.split(',')[1] if ',' in f else f)
            nparr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is not None:
                frames.append(frame)
        except Exception:
            continue
    return frames

def extract_green_signal(frames: list):
    if np is None:
        return []
    signals = []
    for frame in frames:
        h, w = frame.shape[:2]
        face_region = frame[:h//3, w//4:3*w//4]
        signals.append(np.mean(face_region[:, :, 1]))
    return np.array(signals)

def compute_heart_rate(raw, fps: float = 30.0) -> dict:
    if not scientific_stack_available():
        return {"heart_rate": 72.0, "confidence": 0.3}
    if len(raw) < 10:
        return {"heart_rate": 72.0, "confidence": 0.3}
    nyq = fps / 2
    b, a = signal.butter(4, [0.7/nyq, 4.0/nyq], btype='band')
    filtered = signal.filtfilt(b, a, signal.detrend(raw))
    freqs = fftfreq(len(filtered), d=1.0/fps)
    fft_vals = np.abs(fft(filtered))
    mask = (freqs >= 0.7) & (freqs <= 4.0)
    if not np.any(mask):
        return {"heart_rate": 72.0, "confidence": 0.3}
    peak_freq = freqs[mask][np.argmax(fft_vals[mask])]
    confidence = float(np.max(fft_vals[mask]) / (np.sum(fft_vals[mask]) + 1e-9))
    return {"heart_rate": round(float(peak_freq * 60), 1), "confidence": round(min(confidence, 1.0), 2)}

def compute_hrv(raw, fps: float = 30.0) -> float:
    if not scientific_stack_available():
        return 35.0
    if len(raw) < 10:
        return 35.0
    nyq = fps / 2
    b, a = signal.butter(4, [0.7/nyq, 4.0/nyq], btype='band')
    filtered = signal.filtfilt(b, a, signal.detrend(raw))
    peaks, _ = signal.find_peaks(filtered, distance=int(fps*0.4), height=np.std(filtered)*0.5)
    if len(peaks) < 3:
        return 35.0
    rr = np.diff(peaks) / fps * 1000
    return round(float(np.clip(np.sqrt(np.mean(np.diff(rr)**2)), 5, 150)), 1)

def compute_breath_rate(raw, fps: float = 30.0) -> float:
    if not scientific_stack_available():
        return 15.0
    if len(raw) < 10:
        return 15.0
    nyq = fps / 2
    b, a = signal.butter(4, [0.15/nyq, 0.5/nyq], btype='band')
    filtered = signal.filtfilt(b, a, signal.detrend(raw))
    freqs = fftfreq(len(filtered), d=1.0/fps)
    fft_vals = np.abs(fft(filtered))
    mask = (freqs >= 0.15) & (freqs <= 0.5)
    if not np.any(mask):
        return 15.0
    return round(float(freqs[mask][np.argmax(fft_vals[mask])] * 60), 1)

def classify_nervous_system(hr: float, hrv: float) -> str:
    if hrv < 20 or hr > 90:
        return "stressed"
    elif hrv > 50 and hr < 75:
        return "recovered"
    return "balanced"

def process_vitals_from_frames(frames_b64: list, fps: float = 30.0) -> dict:
    try:
        if not scientific_stack_available():
            raise ValueError("Scientific stack unavailable")
        frames = decode_base64_frames(frames_b64)
        if len(frames) < 10:
            raise ValueError(f"Need 10+ frames, got {len(frames)}")
        green = extract_green_signal(frames)
        hr_result = compute_heart_rate(green, fps)
        hrv = compute_hrv(green, fps)
        br = compute_breath_rate(green, fps)
        return {
            "heart_rate": hr_result["heart_rate"],
            "hrv_rmssd": hrv,
            "breath_rate": br,
            "nervous_system_state": classify_nervous_system(hr_result["heart_rate"], hrv),
            "confidence": hr_result["confidence"],
            "frames_processed": len(frames)
        }
    except Exception as e:
        print(f"rPPG error: {e} - using mock vitals")
        return {"heart_rate": 74.0, "hrv_rmssd": 38.0, "breath_rate": 16.0,
                "nervous_system_state": "balanced", "confidence": 0.72,
                "frames_processed": 0, "mock": True}
