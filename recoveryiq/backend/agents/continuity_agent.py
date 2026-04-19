import json

try:
    import anthropic
except ImportError:
    anthropic = None

client = anthropic.Anthropic() if anthropic else None

CONTINUITY_SYSTEM = """
You are a post-session recovery continuity planner for Hydrawav3.
Generate personalized 7-day home wellness routines.

CRITICAL: Frame everything as wellness support, not medical advice.
Use: "supports mobility", "encourages recovery", "helps maintain gains"
Never use: "treats", "cures", "rehabilitates"

Output ONLY valid JSON. No preamble. No markdown fences.
"""

CONTINUITY_PROMPT = """
Completed session data:
Patient state: {state_json}
Protocol used: {protocol_json}

Generate a 7-day home wellness routine as JSON:
{{
  "days": [
    {{
      "day": 1,
      "activities": [
        {{
          "name": "activity name",
          "duration": "X minutes",
          "instructions": "clear, simple instructions in 1-2 sentences",
          "focus_area": "body area"
        }}
      ]
    }}
  ],
  "key_message": "one sentence summary for the patient",
  "next_session_recommendation": "what to focus on in next Hydrawav3 session"
}}

Keep each day to 2-3 activities. Total daily time: 10-15 minutes max.
"""

def run_continuity(patient_state: dict, protocol: dict) -> dict:
    try:
        if client is None:
            raise RuntimeError("Anthropic SDK unavailable")
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=CONTINUITY_SYSTEM,
            messages=[{
                "role": "user",
                "content": CONTINUITY_PROMPT.format(
                    state_json=json.dumps(patient_state, indent=2),
                    protocol_json=json.dumps(protocol, indent=2)
                )
            }]
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        print(f"Continuity agent error: {e}")
        focus = patient_state.get("focus_area", "the treated area")
        return {
            "days": [
                {"day": i, "activities": [
                    {"name": "Gentle mobility stretch", "duration": "5 minutes", "instructions": f"Slowly move {focus} through its comfortable range of motion. Stop if you feel sharp discomfort.", "focus_area": focus},
                    {"name": "Deep breathing", "duration": "3 minutes", "instructions": "Inhale for 4 counts, hold for 4, exhale for 6. Supports nervous system recovery.", "focus_area": "nervous system"},
                ]}
                for i in range(1, 8)
            ],
            "key_message": f"Gentle daily movement supports your {focus} recovery gains from today's session.",
            "next_session_recommendation": f"Continue focusing on {focus} mobility with progressive intensity."
        }
