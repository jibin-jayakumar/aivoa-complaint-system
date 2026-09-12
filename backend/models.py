from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
from database import Base


class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(Integer, primary_key=True, index=True)
    complaint_source = Column(String(50), default="")
    customer_name = Column(String(255), default="")
    product_name = Column(String(255), default="")
    product_strength = Column(String(100), default="")
    batch_number = Column(String(100), default="")
    manufacturing_date = Column(String(50), default="")
    expiry_date = Column(String(50), default="")
    quantity_affected = Column(String(255), default="")
    complaint_type = Column(String(50), default="")
    complaint_date = Column(String(50), default="")
    complaint_description = Column(Text, default="")
    initial_severity = Column(String(50), default="")
    priority = Column(String(50), default="")
    created_at = Column(DateTime, default=datetime.utcnow)