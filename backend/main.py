import os
import json
from datetime import date
from io import BytesIO

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from pypdf import PdfReader
from docx import Document
from sqlalchemy.orm import Session

from database import engine, Base, get_db
from models import Complaint
from graph import run_extraction_graph

load_dotenv()

app = FastAPI(title="AIVOA Complaint API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

Base.metadata.create_all(bind=engine)


class ComplaintRequest(BaseModel):
    text: str


class ComplaintExtract(BaseModel):
    complaint_source: str = ""
    customer_name: str = ""
    product_name: str = ""
    product_strength: str = ""
    batch_number: str = ""
    manufacturing_date: str = ""
    expiry_date: str = ""
    quantity_affected: str = ""
    complaint_type: str = ""
    complaint_date: str = ""
    complaint_description: str = ""
    initial_severity: str = ""
    priority: str = ""


class ComplaintSaved(ComplaintExtract):
    id: int
    created_at: str


class UpdateRequest(BaseModel):
    current_form: dict
    instruction: str


class UpdateResponse(BaseModel):
    updates: dict
    message: str


VALID_FIELDS = {
    "complaint_source", "customer_name", "product_name", "product_strength",
    "batch_number", "manufacturing_date", "expiry_date", "quantity_affected",
    "complaint_type", "complaint_date", "complaint_description",
    "initial_severity", "priority",
}


def run_extraction(text: str) -> ComplaintExtract:
    try:
        data = run_extraction_graph(text)
        return ComplaintExtract(**data)
    except Exception as e:
        today = date.today().isoformat()
        defaults = {
            "complaint_source": "Distributor",
            "customer_name": "Unknown Customer",
            "product_name": "Unknown Product",
            "product_strength": "Not specified",
            "batch_number": "Not specified",
            "manufacturing_date": "Not specified",
            "expiry_date": "Not specified",
            "quantity_affected": "Not specified",
            "complaint_type": "Quality",
            "complaint_date": today,
            "complaint_description": f"Extraction failed: {str(e)[:100]}. Please retry or enter manually.",
            "initial_severity": "Medium",
            "priority": "Normal",
        }
        return ComplaintExtract(**defaults)

def extract_text_from_file(filename: str, content: bytes) -> str:
    name = filename.lower()

    if name.endswith(".pdf"):
        reader = PdfReader(BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    if name.endswith(".docx"):
        doc = Document(BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs)

    if name.endswith(".txt") or name.endswith(".eml"):
        return content.decode("utf-8", errors="ignore")

    raise HTTPException(
        status_code=400,
        detail="Unsupported file type. Please upload PDF, DOCX, or TXT.",
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/complaints/analyze", response_model=ComplaintExtract)
def analyze_complaint(payload: ComplaintRequest):
    return run_extraction(payload.text)


@app.post("/complaints/upload", response_model=ComplaintExtract)
async def upload_complaint(file: UploadFile = File(...)):
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    text = extract_text_from_file(file.filename or "", content)

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text found in the file. Scanned/image PDFs are not supported.",
        )

    return run_extraction(text)


@app.post("/complaints", response_model=ComplaintSaved)
def save_complaint(payload: ComplaintExtract, db: Session = Depends(get_db)):
    complaint = Complaint(**payload.model_dump())
    db.add(complaint)
    db.commit()
    db.refresh(complaint)

    return ComplaintSaved(
        id=complaint.id,
        created_at=complaint.created_at.isoformat(),
        complaint_source=complaint.complaint_source,
        customer_name=complaint.customer_name,
        product_name=complaint.product_name,
        product_strength=complaint.product_strength,
        batch_number=complaint.batch_number,
        manufacturing_date=complaint.manufacturing_date,
        expiry_date=complaint.expiry_date,
        quantity_affected=complaint.quantity_affected,
        complaint_type=complaint.complaint_type,
        complaint_date=complaint.complaint_date,
        complaint_description=complaint.complaint_description,
        initial_severity=complaint.initial_severity,
        priority=complaint.priority,
    )


@app.get("/complaints", response_model=list[ComplaintSaved])
def list_complaints(db: Session = Depends(get_db)):
    complaints = db.query(Complaint).order_by(Complaint.id.desc()).all()
    return [
        ComplaintSaved(
            id=c.id,
            created_at=c.created_at.isoformat() if c.created_at else "",
            complaint_source=c.complaint_source,
            customer_name=c.customer_name,
            product_name=c.product_name,
            product_strength=c.product_strength,
            batch_number=c.batch_number,
            manufacturing_date=c.manufacturing_date,
            expiry_date=c.expiry_date,
            quantity_affected=c.quantity_affected,
            complaint_type=c.complaint_type,
            complaint_date=c.complaint_date,
            complaint_description=c.complaint_description,
            initial_severity=c.initial_severity,
            priority=c.priority,
        )
        for c in complaints
    ]


@app.post("/complaints/update-field", response_model=UpdateResponse)
def update_field(payload: UpdateRequest):
    current = payload.current_form
    instruction = payload.instruction

    system_prompt = (
        "You are a pharmaceutical QMS assistant helping edit an existing complaint form. "
        "The user will provide the current form values and an instruction to change them. "
        "Return ONLY a JSON object with the fields that should be updated.\n\n"
        "Available fields: complaint_source, customer_name, product_name, product_strength, "
        "batch_number, manufacturing_date, expiry_date, quantity_affected, complaint_type, "
        "complaint_date, complaint_description, initial_severity, priority.\n\n"
        "Rules:\n"
        "1. Return ONLY the fields that the instruction asks to change — do not include unchanged fields.\n"
        "2. Use the exact field names from the list above.\n"
        "3. If the instruction is ambiguous or asks for something not in the form, return an empty object {} "
        "and explain why in the 'message' field.\n"
        "4. Return pure JSON with exactly two keys: 'updates' (an object) and 'message' (a short string).\n"
        "5. The 'message' should be a short confirmation, e.g. 'Updated batch number to PCT24052.' "
        "If no changes were made, explain why in 'message'.\n"
    )

    user_content = (
        f"Current form values:\n{json.dumps(current, indent=2)}\n\n"
        f"Instruction: {instruction}"
    )

    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )

    content = response.choices[0].message.content

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="LLM returned invalid JSON")

    updates = data.get("updates", {})
    message = data.get("message", "Update applied.")

    if not isinstance(updates, dict):
        updates = {}

    updates = {k: v for k, v in updates.items() if k in VALID_FIELDS}

    return UpdateResponse(updates=updates, message=message)