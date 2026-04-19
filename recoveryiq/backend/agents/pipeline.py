from typing import TypedDict, Optional
from .assessment_agent import run_assessment
from .protocol_agent import run_protocol
from .continuity_agent import run_continuity

try:
    from langgraph.graph import StateGraph, END
except ImportError:
    StateGraph = None
    END = None

class RecoveryState(TypedDict):
    intake_data: dict
    patient_state: Optional[dict]
    protocol: Optional[dict]
    routine: Optional[dict]
    error: Optional[str]

def assessment_node(state: RecoveryState) -> RecoveryState:
    result = run_assessment(state["intake_data"])
    return {**state, "patient_state": result}

def protocol_node(state: RecoveryState) -> RecoveryState:
    result = run_protocol(state["patient_state"])
    return {**state, "protocol": result}

def continuity_node(state: RecoveryState) -> RecoveryState:
    result = run_continuity(state["patient_state"], state["protocol"])
    return {**state, "routine": result}

class FallbackPipeline:
    def invoke(self, state: RecoveryState) -> RecoveryState:
        assessed = assessment_node(state)
        with_protocol = protocol_node(assessed)
        return continuity_node(with_protocol)

if StateGraph is None:
    recovery_pipeline = FallbackPipeline()
else:
    workflow = StateGraph(RecoveryState)
    workflow.add_node("assess", assessment_node)
    workflow.add_node("recommend", protocol_node)
    workflow.add_node("plan", continuity_node)

    workflow.set_entry_point("assess")
    workflow.add_edge("assess", "recommend")
    workflow.add_edge("recommend", "plan")
    workflow.add_edge("plan", END)

    recovery_pipeline = workflow.compile()
