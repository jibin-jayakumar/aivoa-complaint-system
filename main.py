from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="AIVOA Complaint API")


class ComplaintRequest(BaseModel):
    text: str


class ComplaintExtract(BaseModel):
    product_name: str
    batch_number: str
    customer: str
    complaint: str


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/complaints/analyze", response_model=ComplaintExtract)
def analyze_complaint(payload: ComplaintRequest):
    # Hardcoded for now — the AI will fill these in later
    return ComplaintExtract(
        product_name="Paracetamol 500mg",
        batch_number="PCT24051",
        customer="ABC Pharma",
        complaint="Broken tablets",
    )