import json

try:
    import anthropic
except ImportError:
    anthropic = None

client = anthropic.Anthropic() if anthropic else None

PROTOCOL_SYSTEM = """
You are a Hydrawav3 protocol recommendation engine.

DEVICE KNOWLEDGE:
- Sun pad (red/warm) = heating, circulation support, muscle activation
- Moon pad (blue/cool) = cooling, calming, recovery support, nervous system down-regulation
- Multiple pads create a directional FLUID FLOW PATH through the body toward lymph nodes
- Clockwise rotation = pushes fluid outward/upward
- Anticlockwise rotation = pulls fluid inward/downward

HRV INTERPRETATION:
- HRV < 20ms or HR > 90 bpm = stressed -> LOW intensity, Moon pads first
- HRV 20-50ms = balanced -> MODERATE intensity, balanced Sun/Moon
- HRV > 50ms and HR < 75 = recovered -> HIGH intensity ok, Sun pads can lead

Output ONLY valid JSON. No preamble. No markdown fences.
"""

PROTOCOL_PROMPT = """
Patient wellness state:
{state_json}

Recommend a Hydrawav3 multi-pad protocol as JSON:
{{
  "sun_pad_placement": "primary sun pad location",
  "moon_pad_placement": "primary moon pad location",
  "intensity": "low | moderate | high",
  "duration_minutes": 9,
  "modality_focus": "thermal | photobiomodulation | vibro_acoustic | balanced",
  "practitioner_rationale": "2-3 sentences. Wellness language only.",
  "multi_pad": {{
    "total_devices": 1,
    "flow_narrative": "Plain English description of fluid movement path.",
    "session_type": "recovery | activation | relaxation | parasympathetic_activation",
    "intensity": "low | moderate | high",
    "duration_minutes": 9,
    "practitioner_rationale": "same rationale",
    "pads": [
      {{
        "pad_id": "sun_1",
        "pad_type": "sun",
        "body_location": "specific location e.g. Right hip",
        "flow_direction": "clockwise | anticlockwise | push | pull",
        "sequence_order": 1,
        "purpose": "one phrase describing purpose"
      }},
      {{
        "pad_id": "moon_1",
        "pad_type": "moon",
        "body_location": "specific location e.g. Lower back",
        "flow_direction": "clockwise | anticlockwise | push | pull",
        "sequence_order": 2,
        "purpose": "one phrase describing purpose"
      }}
    ]
  }}
}}
"""

def run_protocol(patient_state: dict) -> dict:
    try:
        if client is None:
            raise RuntimeError("Anthropic SDK unavailable")
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            system=PROTOCOL_SYSTEM,
            messages=[{
                "role": "user",
                "content": PROTOCOL_PROMPT.format(state_json=json.dumps(patient_state, indent=2))
            }]
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        print(f"Protocol agent error: {e}")
        focus = patient_state.get("focus_area", "lower back")
        return {
            "sun_pad_placement": focus.title(),
            "moon_pad_placement": "Lower back",
            "intensity": "moderate",
            "duration_minutes": 9,
            "modality_focus": "balanced",
            "practitioner_rationale": f"Protocol supports mobility recovery in the {focus} region using balanced thermal modulation.",
            "multi_pad": {
                "total_devices": 1,
                "flow_narrative": f"Fluid moves from {focus} toward the lower back and kidney region, supporting natural lymphatic drainage.",
                "session_type": "recovery",
                "intensity": "moderate",
                "duration_minutes": 9,
                "practitioner_rationale": f"Protocol supports mobility recovery in the {focus} region.",
                "pads": [
                    {"pad_id": "sun_1", "pad_type": "sun", "body_location": focus.title(), "flow_direction": "anticlockwise", "sequence_order": 1, "purpose": "mobilizes fluid from restriction point"},
                    {"pad_id": "moon_1", "pad_type": "moon", "body_location": "Lower back", "flow_direction": "clockwise", "sequence_order": 2, "purpose": "guides fluid toward lymph node region"}
                ]
            }
        }
