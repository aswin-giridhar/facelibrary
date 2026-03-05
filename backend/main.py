"""Face Library -- Secure Likeness Licensing Infrastructure API."""
import os
import sys
import hashlib
import secrets
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Add backend to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from models import (
    init_db, get_db, User, TalentProfile, BrandProfile,
    LicenseRequest, Contract, AuditLog, LicenseStatus,
)
from agents.orchestrator import OrchestratorAgent

orchestrator = OrchestratorAgent()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Face Library API",
    description="Secure Likeness Licensing Infrastructure -- Multi-Agent Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000"), "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- Pydantic Schemas ---------------------------------------------------------


class TalentRegisterRequest(BaseModel):
    email: str
    name: str
    bio: str | None = None
    categories: str | None = None
    restricted_categories: str | None = None
    min_price_per_use: float = 100.0
    max_license_duration_days: int = 365
    allow_ai_training: bool = False
    allow_video_generation: bool = True
    allow_image_generation: bool = True
    geo_restrictions: str | None = None
    portfolio_description: str | None = None


class BrandRegisterRequest(BaseModel):
    email: str
    name: str
    company_name: str
    industry: str | None = None
    website: str | None = None
    description: str | None = None


class LicenseRequestCreate(BaseModel):
    brand_id: int
    talent_id: int
    use_case: str
    campaign_description: str | None = None
    desired_duration_days: int = 30
    desired_regions: str | None = None
    content_type: str = "image"
    exclusivity: bool = False


class SearchRequest(BaseModel):
    query: str
    content_type: str | None = None
    max_price: float | None = None
    region: str | None = None


class LicenseApproval(BaseModel):
    approved: bool
    notes: str | None = None


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str  # talent | brand | agent
    company_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TalentPreferencesUpdate(BaseModel):
    categories: str | None = None
    restricted_categories: str | None = None
    geo_scope: str | None = None
    approval_mode: str | None = None
    min_price_per_use: float | None = None
    max_license_duration_days: int | None = None
    allow_ai_training: bool | None = None
    allow_video_generation: bool | None = None
    allow_image_generation: bool | None = None


# -- Auth helpers --------------------------------------------------------------


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{h}"


def _verify_password(password: str, stored: str) -> bool:
    if not stored or ":" not in stored:
        return False
    salt, h = stored.split(":", 1)
    return hashlib.sha256((salt + password).encode()).hexdigest() == h


def _get_profile_id(user: User, db: Session) -> int | None:
    if user.role == "talent":
        tp = db.query(TalentProfile).filter(TalentProfile.user_id == user.id).first()
        return tp.id if tp else None
    elif user.role == "brand":
        bp = db.query(BrandProfile).filter(BrandProfile.user_id == user.id).first()
        return bp.id if bp else None
    return None


def _user_response(user: User, profile_id: int | None) -> dict:
    return {
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "profile_id": profile_id,
    }


# -- Auth Endpoints ------------------------------------------------------------


@app.post("/api/auth/signup")
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")
    if req.role not in ("talent", "brand", "agent"):
        raise HTTPException(400, "Role must be talent, brand, or agent")

    user = User(
        email=req.email,
        name=req.name,
        role=req.role,
        password_hash=_hash_password(req.password),
    )
    db.add(user)
    db.flush()

    profile_id = None
    if req.role == "talent":
        profile = TalentProfile(user_id=user.id)
        db.add(profile)
        db.flush()
        profile_id = profile.id
    elif req.role == "brand":
        profile = BrandProfile(
            user_id=user.id,
            company_name=req.company_name or req.name,
        )
        db.add(profile)
        db.flush()
        profile_id = profile.id

    db.commit()
    return _user_response(user, profile_id)


@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(401, "Invalid email or password")
    if not user.password_hash:
        raise HTTPException(401, "Account has no password -- please re-register")
    if not _verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return _user_response(user, _get_profile_id(user, db))


@app.get("/api/auth/me/{user_id}")
def get_me(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    return _user_response(user, _get_profile_id(user, db))


# -- Talent Endpoints ----------------------------------------------------------


@app.post("/api/talent/register")
def register_talent(req: TalentRegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

    user = User(email=req.email, name=req.name, role="talent")
    db.add(user)
    db.flush()

    profile = TalentProfile(
        user_id=user.id,
        bio=req.bio,
        categories=req.categories,
        restricted_categories=req.restricted_categories,
        min_price_per_use=req.min_price_per_use,
        max_license_duration_days=req.max_license_duration_days,
        allow_ai_training=req.allow_ai_training,
        allow_video_generation=req.allow_video_generation,
        allow_image_generation=req.allow_image_generation,
        geo_restrictions=req.geo_restrictions,
        portfolio_description=req.portfolio_description,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    return {"id": profile.id, "user_id": user.id, "name": user.name, "message": "Talent registered successfully"}


@app.get("/api/talent/{talent_id}")
def get_talent(talent_id: int, db: Session = Depends(get_db)):
    profile = db.query(TalentProfile).filter(TalentProfile.id == talent_id).first()
    if not profile:
        raise HTTPException(404, "Talent not found")
    user = db.query(User).filter(User.id == profile.user_id).first()
    return {
        "id": profile.id,
        "name": user.name,
        "email": user.email,
        "bio": profile.bio,
        "categories": profile.categories,
        "restricted_categories": profile.restricted_categories,
        "min_price_per_use": profile.min_price_per_use,
        "max_license_duration_days": profile.max_license_duration_days,
        "allow_ai_training": profile.allow_ai_training,
        "allow_video_generation": profile.allow_video_generation,
        "allow_image_generation": profile.allow_image_generation,
        "geo_restrictions": profile.geo_restrictions,
        "geo_scope": profile.geo_scope,
        "approval_mode": profile.approval_mode,
        "portfolio_description": profile.portfolio_description,
    }


@app.get("/api/talents")
def list_talents(db: Session = Depends(get_db)):
    talents = db.query(TalentProfile, User).join(User, TalentProfile.user_id == User.id).all()
    return [
        {
            "id": tp.id,
            "name": u.name,
            "bio": tp.bio,
            "categories": tp.categories,
            "min_price_per_use": tp.min_price_per_use,
            "geo_scope": tp.geo_scope,
            "approval_mode": tp.approval_mode,
            "allow_video_generation": tp.allow_video_generation,
            "allow_image_generation": tp.allow_image_generation,
        }
        for tp, u in talents
    ]


# -- Talent Dashboard Endpoints ------------------------------------------------


@app.put("/api/talent/{talent_id}/preferences")
def update_talent_preferences(talent_id: int, req: TalentPreferencesUpdate, db: Session = Depends(get_db)):
    profile = db.query(TalentProfile).filter(TalentProfile.id == talent_id).first()
    if not profile:
        raise HTTPException(404, "Talent not found")
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)
    return {"message": "Preferences updated", "id": profile.id}


@app.get("/api/talent/{talent_id}/requests")
def get_talent_requests(talent_id: int, db: Session = Depends(get_db)):
    requests = (
        db.query(LicenseRequest)
        .filter(LicenseRequest.talent_id == talent_id)
        .order_by(LicenseRequest.created_at.desc())
        .all()
    )
    results = []
    for lr in requests:
        brand = db.query(BrandProfile).filter(BrandProfile.id == lr.brand_id).first()
        results.append({
            "id": lr.id,
            "status": lr.status,
            "brand_name": brand.company_name if brand else "Unknown",
            "use_case": lr.use_case,
            "content_type": lr.content_type,
            "desired_duration_days": lr.desired_duration_days,
            "desired_regions": lr.desired_regions,
            "proposed_price": lr.proposed_price,
            "risk_score": lr.risk_score,
            "created_at": lr.created_at.isoformat(),
        })
    return results


# -- Brand Endpoints -----------------------------------------------------------


@app.post("/api/brand/register")
def register_brand(req: BrandRegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

    user = User(email=req.email, name=req.name, role="brand")
    db.add(user)
    db.flush()

    profile = BrandProfile(
        user_id=user.id,
        company_name=req.company_name,
        industry=req.industry,
        website=req.website,
        description=req.description,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    return {"id": profile.id, "user_id": user.id, "company": req.company_name, "message": "Brand registered successfully"}


@app.get("/api/brand/{brand_id}")
def get_brand(brand_id: int, db: Session = Depends(get_db)):
    profile = db.query(BrandProfile).filter(BrandProfile.id == brand_id).first()
    if not profile:
        raise HTTPException(404, "Brand not found")
    user = db.query(User).filter(User.id == profile.user_id).first()
    return {
        "id": profile.id,
        "name": user.name,
        "company_name": profile.company_name,
        "industry": profile.industry,
        "website": profile.website,
        "description": profile.description,
    }


# -- Brand Dashboard Endpoints -------------------------------------------------


@app.get("/api/brand/{brand_id}/requests")
def get_brand_requests(brand_id: int, db: Session = Depends(get_db)):
    requests = (
        db.query(LicenseRequest)
        .filter(LicenseRequest.brand_id == brand_id)
        .order_by(LicenseRequest.created_at.desc())
        .all()
    )
    results = []
    for lr in requests:
        talent = db.query(TalentProfile).filter(TalentProfile.id == lr.talent_id).first()
        talent_user = db.query(User).filter(User.id == talent.user_id).first() if talent else None
        contract = db.query(Contract).filter(Contract.license_id == lr.id).first()
        results.append({
            "id": lr.id,
            "status": lr.status,
            "talent_name": talent_user.name if talent_user else "Unknown",
            "talent_id": lr.talent_id,
            "use_case": lr.use_case,
            "content_type": lr.content_type,
            "desired_duration_days": lr.desired_duration_days,
            "desired_regions": lr.desired_regions,
            "proposed_price": lr.proposed_price,
            "risk_score": lr.risk_score,
            "negotiation_notes": lr.negotiation_notes,
            "compliance_notes": lr.compliance_notes,
            "has_contract": contract is not None,
            "created_at": lr.created_at.isoformat(),
        })
    return results


# -- Licensing Endpoints -------------------------------------------------------


@app.post("/api/licensing/request")
def create_license_request(req: LicenseRequestCreate, db: Session = Depends(get_db)):
    talent = db.query(TalentProfile).filter(TalentProfile.id == req.talent_id).first()
    if not talent:
        raise HTTPException(404, "Talent not found")
    brand = db.query(BrandProfile).filter(BrandProfile.id == req.brand_id).first()
    if not brand:
        raise HTTPException(404, "Brand not found")

    license_req = LicenseRequest(
        brand_id=req.brand_id,
        talent_id=req.talent_id,
        use_case=req.use_case,
        campaign_description=req.campaign_description,
        desired_duration_days=req.desired_duration_days,
        desired_regions=req.desired_regions,
        content_type=req.content_type,
        exclusivity=req.exclusivity,
        status=LicenseStatus.PENDING.value,
    )
    db.add(license_req)
    db.commit()
    db.refresh(license_req)

    return {"id": license_req.id, "status": license_req.status, "message": "License request created"}


@app.post("/api/licensing/{license_id}/process")
def process_license(license_id: int, db: Session = Depends(get_db)):
    """Trigger the multi-agent pipeline to process a license request."""
    license_req = db.query(LicenseRequest).filter(LicenseRequest.id == license_id).first()
    if not license_req:
        raise HTTPException(404, "License request not found")

    talent = db.query(TalentProfile).filter(TalentProfile.id == license_req.talent_id).first()
    talent_user = db.query(User).filter(User.id == talent.user_id).first()
    brand = db.query(BrandProfile).filter(BrandProfile.id == license_req.brand_id).first()

    talent_profile = {
        "name": talent_user.name,
        "bio": talent.bio,
        "min_price_per_use": talent.min_price_per_use,
        "max_license_duration_days": talent.max_license_duration_days,
        "allow_ai_training": talent.allow_ai_training,
        "allow_video_generation": talent.allow_video_generation,
        "allow_image_generation": talent.allow_image_generation,
        "restricted_categories": talent.restricted_categories,
        "geo_restrictions": talent.geo_restrictions,
    }

    brand_profile = {
        "company_name": brand.company_name,
        "industry": brand.industry,
        "website": brand.website,
    }

    license_data = {
        "id": license_req.id,
        "use_case": license_req.use_case,
        "campaign_description": license_req.campaign_description,
        "desired_duration_days": license_req.desired_duration_days,
        "desired_regions": license_req.desired_regions,
        "content_type": license_req.content_type,
        "exclusivity": license_req.exclusivity,
    }

    license_req.status = LicenseStatus.NEGOTIATING.value
    db.commit()

    result = orchestrator.process_license_request(talent_profile, brand_profile, license_data)

    for stage in result.get("stages", []):
        if stage["stage"] == "negotiation" and stage["result"].get("result"):
            nr = stage["result"]["result"]
            license_req.proposed_price = nr.get("proposed_price")
            license_req.negotiation_notes = nr.get("negotiation_notes", "")

        if stage["stage"] == "compliance" and stage["result"].get("result"):
            cr = stage["result"]["result"]
            license_req.risk_score = cr.get("risk_level", "unknown")
            license_req.compliance_notes = cr.get("compliance_notes", "")
            license_req.risk_details = str(cr.get("risk_flags", []))

        if stage["stage"] == "contract" and stage["result"].get("contract_text"):
            contract = Contract(
                license_id=license_req.id,
                contract_text=stage["result"]["contract_text"],
                generated_by="contract_agent",
                model_used=stage["result"].get("model", ""),
                uk_law_compliant=True,
            )
            db.add(contract)

    license_req.status = result.get("final_status", LicenseStatus.AWAITING_APPROVAL.value)
    license_req.updated_at = datetime.utcnow()
    db.commit()

    return {
        "license_id": license_id,
        "status": license_req.status,
        "pipeline_result": result,
    }


@app.get("/api/licensing/{license_id}")
def get_license(license_id: int, db: Session = Depends(get_db)):
    lr = db.query(LicenseRequest).filter(LicenseRequest.id == license_id).first()
    if not lr:
        raise HTTPException(404, "License not found")

    talent = db.query(TalentProfile).filter(TalentProfile.id == lr.talent_id).first()
    talent_user = db.query(User).filter(User.id == talent.user_id).first()
    brand = db.query(BrandProfile).filter(BrandProfile.id == lr.brand_id).first()

    contract = db.query(Contract).filter(Contract.license_id == lr.id).first()

    return {
        "id": lr.id,
        "status": lr.status,
        "talent": {"id": talent.id, "name": talent_user.name},
        "brand": {"id": brand.id, "company": brand.company_name},
        "use_case": lr.use_case,
        "campaign_description": lr.campaign_description,
        "content_type": lr.content_type,
        "desired_duration_days": lr.desired_duration_days,
        "desired_regions": lr.desired_regions,
        "exclusivity": lr.exclusivity,
        "proposed_price": lr.proposed_price,
        "risk_score": lr.risk_score,
        "risk_details": lr.risk_details,
        "negotiation_notes": lr.negotiation_notes,
        "compliance_notes": lr.compliance_notes,
        "contract": {
            "id": contract.id,
            "text": contract.contract_text,
            "model_used": contract.model_used,
            "generated_at": contract.created_at.isoformat(),
        } if contract else None,
        "created_at": lr.created_at.isoformat(),
        "updated_at": lr.updated_at.isoformat() if lr.updated_at else None,
    }


@app.post("/api/licensing/{license_id}/approve")
def approve_license(license_id: int, approval: LicenseApproval, db: Session = Depends(get_db)):
    lr = db.query(LicenseRequest).filter(LicenseRequest.id == license_id).first()
    if not lr:
        raise HTTPException(404, "License not found")

    if approval.approved:
        lr.status = LicenseStatus.ACTIVE.value
    else:
        lr.status = LicenseStatus.REJECTED.value

    lr.updated_at = datetime.utcnow()
    db.commit()

    orchestrator.audit.log(
        license_id, "talent", "license_decision",
        f"{'Approved' if approval.approved else 'Rejected'}: {approval.notes or 'No notes'}",
    )

    return {"license_id": license_id, "status": lr.status, "approved": approval.approved}


@app.get("/api/licenses")
def list_licenses(db: Session = Depends(get_db)):
    licenses = db.query(LicenseRequest).order_by(LicenseRequest.created_at.desc()).all()
    results = []
    for lr in licenses:
        talent = db.query(TalentProfile).filter(TalentProfile.id == lr.talent_id).first()
        talent_user = db.query(User).filter(User.id == talent.user_id).first()
        brand = db.query(BrandProfile).filter(BrandProfile.id == lr.brand_id).first()
        results.append({
            "id": lr.id,
            "status": lr.status,
            "talent_name": talent_user.name,
            "brand_name": brand.company_name,
            "use_case": lr.use_case,
            "proposed_price": lr.proposed_price,
            "risk_score": lr.risk_score,
            "created_at": lr.created_at.isoformat(),
        })
    return results


# -- Search Endpoints ----------------------------------------------------------


@app.post("/api/talent/search")
def search_talent(req: SearchRequest):
    filters = {}
    if req.content_type:
        filters["content_type"] = req.content_type
    if req.max_price:
        filters["max_price"] = req.max_price
    if req.region:
        filters["region"] = req.region

    result = orchestrator.search_talent(req.query, filters)
    return result


# -- Agent & Audit Endpoints ---------------------------------------------------


@app.get("/api/agents/status")
def agents_status():
    """Get status of all agents in the system."""
    stats = orchestrator.audit.get_system_stats()
    return {
        "agents": [
            {"name": "Negotiator Agent", "role": "Dynamic pricing & licensing terms", "provider": "FLock (Qwen3)"},
            {"name": "Compliance Agent", "role": "Risk assessment & policy enforcement", "provider": "FLock (DeepSeek)"},
            {"name": "Contract Agent", "role": "UK-law-compliant IP contract generation", "provider": "Z.AI (GLM) / FLock"},
            {"name": "Audit Agent", "role": "Transaction logging & usage monitoring", "provider": "Local"},
            {"name": "Search Agent", "role": "AI-driven talent discovery", "provider": "FLock (DeepSeek)"},
            {"name": "Orchestrator", "role": "Multi-agent pipeline coordination", "provider": "Local"},
        ],
        "stats": stats,
    }


@app.get("/api/audit/logs")
def get_all_audit_logs(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()
    results = []
    for log in logs:
        license_context = None
        if log.license_id:
            lr = db.query(LicenseRequest).filter(LicenseRequest.id == log.license_id).first()
            if lr:
                talent = db.query(TalentProfile).filter(TalentProfile.id == lr.talent_id).first()
                talent_user = db.query(User).filter(User.id == talent.user_id).first() if talent else None
                brand = db.query(BrandProfile).filter(BrandProfile.id == lr.brand_id).first()
                license_context = {
                    "talent_name": talent_user.name if talent_user else "Unknown",
                    "brand_name": brand.company_name if brand else "Unknown",
                    "use_case": lr.use_case,
                    "status": lr.status,
                }
        results.append({
            "id": log.id,
            "license_id": log.license_id,
            "agent_name": log.agent_name,
            "action": log.action,
            "details": log.details,
            "model_used": log.model_used,
            "tokens_used": log.tokens_used,
            "license_context": license_context,
            "created_at": log.created_at.isoformat(),
        })
    return results


@app.get("/api/audit/{license_id}")
def get_audit_trail(license_id: int):
    trail = orchestrator.audit.get_license_audit_trail(license_id)
    return {"license_id": license_id, "audit_trail": trail}


# -- Health Check --------------------------------------------------------------


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "Face Library API",
        "version": "1.0.0",
        "agents": 6,
        "providers": ["FLock (Qwen3, DeepSeek)", "Z.AI (GLM)"],
    }
