from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./face_library.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class UserRole(str, enum.Enum):
    TALENT = "talent"
    BRAND = "brand"
    AGENT = "agent"


class LicenseStatus(str, enum.Enum):
    PENDING = "pending"
    NEGOTIATING = "negotiating"
    COMPLIANCE_CHECK = "compliance_check"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


class RiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    company = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TalentProfile(Base):
    __tablename__ = "talent_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    bio = Column(Text, nullable=True)
    categories = Column(String, nullable=True)  # comma-separated allowed categories
    restricted_categories = Column(String, nullable=True)  # comma-separated blocked categories
    min_price_per_use = Column(Float, default=100.0)
    max_license_duration_days = Column(Integer, default=365)
    allow_ai_training = Column(Boolean, default=False)
    allow_video_generation = Column(Boolean, default=True)
    allow_image_generation = Column(Boolean, default=True)
    geo_restrictions = Column(String, nullable=True)  # comma-separated country codes to block
    geo_scope = Column(String, default="global")  # uk | eu | global
    approval_mode = Column(String, default="manual")  # auto | manual
    portfolio_description = Column(Text, nullable=True)
    avatar_url = Column(String, nullable=True)
    watermark_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User")


class BrandProfile(Base):
    __tablename__ = "brand_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    company_name = Column(String, nullable=False)
    industry = Column(String, nullable=True)
    website = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User")


class LicenseRequest(Base):
    __tablename__ = "license_requests"
    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brand_profiles.id"), nullable=False)
    talent_id = Column(Integer, ForeignKey("talent_profiles.id"), nullable=False)
    status = Column(String, default=LicenseStatus.PENDING.value)
    use_case = Column(Text, nullable=False)
    campaign_description = Column(Text, nullable=True)
    desired_duration_days = Column(Integer, default=30)
    desired_regions = Column(String, nullable=True)
    content_type = Column(String, default="image")  # image, video, both
    exclusivity = Column(Boolean, default=False)

    # Agent-populated fields
    proposed_price = Column(Float, nullable=True)
    risk_score = Column(String, nullable=True)
    risk_details = Column(Text, nullable=True)
    negotiation_notes = Column(Text, nullable=True)
    compliance_notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    brand = relationship("BrandProfile")
    talent = relationship("TalentProfile")


class Contract(Base):
    __tablename__ = "contracts"
    id = Column(Integer, primary_key=True, index=True)
    license_id = Column(Integer, ForeignKey("license_requests.id"), nullable=False)
    contract_text = Column(Text, nullable=False)
    generated_by = Column(String, default="contract_agent")
    model_used = Column(String, nullable=True)
    uk_law_compliant = Column(Boolean, default=True)
    ip_clauses = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    license = relationship("LicenseRequest")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    license_id = Column(Integer, ForeignKey("license_requests.id"), nullable=True)
    agent_name = Column(String, nullable=False)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    model_used = Column(String, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
