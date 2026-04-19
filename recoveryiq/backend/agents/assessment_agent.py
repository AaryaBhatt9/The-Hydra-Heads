import json

try:
    import anthropic
except ImportError:
    anthropic = None

client = anthropic.Anthropic() if anthropic else None

ASSESSMENT_SYSTEM = """
You are a wellness assessment synthesizer for Hydrawav3, a recovery technology platform.
Given patient intake data and optional pose scan results, produce a structured wellness
summary to guide session personalization.

CRITICAL LANGUAGE RULES - always follow:
- Use: supports, recovery, wellness, mobility, movement, tension, restriction
- Never use: diagnoses, treats, cures, clinical, medical, pain condition

Output ONLY valid JSON. No preamble, no explanation, no markdown fences.
"""

ASSESSMENT_PROMPT = """
Patient intake data:
{intake_json}

Produce a structured patient wellness state as JSON with this exact schema:
{{
  "primary_focus_areas": ["string"],
  "secondary_areas": ["string"],
  "recovery_goal": "string",
  "session_type": "parasympathetic_activation | muscle_relaxation | muscle_activation | recovery | pain_management_support",
  "tension_pattern": "string",
  "contraindication_flag": false,
  "wellness_summary": "string (2 sentences, practitioner-facing)"
}}
"""

def run_assessment(intake_data: dict) -> dict:
    try:
        if client is None:
            raise RuntimeError("Anthropic SDK unavailable")
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=ASSESSMENT_SYSTEM,
            messages=[{
                "role": "user",
                "content": ASSESSMENT_PROMPT.format(intake_json=json.dumps(intake_data, indent=2))
            }]
        )
        text = response.content[0].text.strip()
        # Remove markdown fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        print(f"Assessment agent error: {e}")
        return {
            "primary_focus_areas": [intake_data.get("focus_area", "general")],
            "secondary_areas": [],
            "recovery_goal": "Reduce tension and improve mobility",
            "session_type": intake_data.get("session_type", "recovery"),
            "tension_pattern": "Localized tension in primary focus area",
            "contraindication_flag": False,
            "wellness_summary": "Patient presents with localized tension. Session focused on mobility support and recovery."
        }
