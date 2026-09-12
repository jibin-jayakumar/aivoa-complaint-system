import os
import json
from datetime import date
from typing import TypedDict

from dotenv import load_dotenv
from fastapi import HTTPException
from groq import Groq
from langgraph.graph import StateGraph, START, END

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


class ExtractionState(TypedDict):
    raw_text: str
    extracted: dict
    final: dict
    error: str


FIELDS = [
    "complaint_source", "customer_name", "product_name", "product_strength",
    "batch_number", "manufacturing_date", "expiry_date", "quantity_affected",
    "complaint_type", "complaint_date", "complaint_description",
    "initial_severity", "priority",
]

DEFAULTS = {
    "complaint_source": "Distributor",
    "customer_name": "Unknown Customer",
    "product_name": "Unknown Product",
    "product_strength": "Not specified",
    "batch_number": "Not specified",
    "manufacturing_date": "Not specified",
    "expiry_date": "Not specified",
    "quantity_affected": "Not specified",
    "complaint_type": "Quality",
    "complaint_date": "",
    "complaint_description": "No description provided",
    "initial_severity": "Medium",
    "priority": "Normal",
}


def _build_system_prompt() -> str:
    today = date.today().isoformat()
    return (
        "You are a pharmaceutical Quality Management System (QMS) assistant. "
        "Extract complaint information from the user's text and return ONLY valid JSON. "
        f"Today's date is {today}.\n\n"
        "Return exactly these 13 keys. Every key must have a string value — never empty.\n\n"
        "- complaint_source: the CHANNEL through which the complaint arrived. "
        "MUST be exactly one of: Email, Phone, Letter, Distributor, Field Alert, Regulatory, Other. "
        "This is NEVER a person's name or company name. "
        "Default to Distributor if the channel is not stated.\n"
        "- customer_name: the reporter name. Example: 'Sun Pharma reported...' → customer_name is 'Sun Pharma'. "
        "Default to Unknown Customer.\n"
        "- product_name: product name without strength. Default to Unknown Product.\n"
        "- product_strength: strength/grade like 500mg, IP, BP. Default to Not specified.\n"
        "- batch_number: batch or lot number. Default to Not specified.\n"
        "- manufacturing_date: YYYY-MM-DD. Default to Not specified.\n"
        "- expiry_date: YYYY-MM-DD. Default to Not specified.\n"
        "- quantity_affected: e.g. 3 out of 12 cartons. Default to Not specified.\n"
        "- complaint_type: one of Quality, Packaging, Labeling, Efficacy, Adverse Event, Contamination, Other. "
        "Infer from context. Never empty.\n"
        "- complaint_date: YYYY-MM-DD when complaint was received. Default to today.\n"
        "- complaint_description: concise description of the issue. Default to No description provided.\n"
        "- initial_severity: one of Low, Medium, High, Critical. Infer from context. Never empty.\n"
        "- priority: one of Low, Normal, High, Urgent. Infer from severity. Never empty.\n\n"
        "Rules:\n"
        "1. Return pure JSON only — no markdown, no code fences, no explanation.\n"
        "2. Every value must be a non-empty string.\n"
        "3. Prefer explicit text over defaults.\n"
        "4. Normalize all dates to YYYY-MM-DD."
    )


def extract_node(state: ExtractionState) -> ExtractionState:
    """Node 1: call Groq to extract structured data from raw text."""
    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "system", "content": _build_system_prompt()},
                {"role": "user", "content": state["raw_text"]},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        content = response.choices[0].message.content
        state["extracted"] = json.loads(content)
    except json.JSONDecodeError:
        state["error"] = "LLM returned invalid JSON"
        state["extracted"] = {}
    except Exception as e:
        state["error"] = str(e)
        state["extracted"] = {}
    return state


def validate_node(state: ExtractionState) -> ExtractionState:
    """Node 2: enforce defaults and normalize fields."""
    if state.get("error"):
        state["final"] = {}
        return state

    data = state.get("extracted", {}) or {}

    if not data.get("complaint_date"):
        data["complaint_date"] = date.today().isoformat()

    for field in FIELDS:
        value = data.get(field, "")
        if not value or not isinstance(value, str) or not value.strip():
            data[field] = DEFAULTS.get(field, "Not specified")

    state["final"] = {f: data[f] for f in FIELDS}
    return state


graph_builder = StateGraph(ExtractionState)
graph_builder.add_node("extract", extract_node)
graph_builder.add_node("validate", validate_node)
graph_builder.add_edge(START, "extract")
graph_builder.add_edge("extract", "validate")
graph_builder.add_edge("validate", END)

extraction_graph = graph_builder.compile()


def run_extraction_graph(text: str) -> dict:
    result = extraction_graph.invoke(
        {"raw_text": text, "extracted": {}, "final": {}, "error": ""}
    )

    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])

    return result["final"]