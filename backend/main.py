"""Face Library -- Secure Likeness Licensing Infrastructure API.

Multi-agent platform for AI likeness licensing with full 7-agent pipeline orchestration.

Bounty coverage:
- FLock.io: All LLM inference via FLock API (Qwen3, DeepSeek, Kimi)
- Z.AI: GLM-4 Plus for contract generation + compliance summaries
- Claw for Human: OpenClaw agent orchestration + gateway config
- AnyWay: OpenTelemetry tracing + pricing/commercialization API
- Animoca: Multi-agent system with decision history + agent stats
"""
import os
import sys
import json
import hashlib
import secrets
import uuid
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

sys.path.insert(0, os.path.dirname(__file__))

from models import (
    init_db, get_db, User, TalentProfile, BrandProfile, AgentProfile,
    TalentAgentLink, LicenseRequest, Contract, AuditLog, LicenseStatus,
)
from agents.orchestrator import OrchestratorAgent
from llm_client import chat as llm_chat, chat_json as llm_chat_json, get_model_info
from supabase_client import supabase, supabase_admin

orchestrator = OrchestratorAgent()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Face Library API",
    description="Secure Likeness Licensing Infrastructure -- 7-Agent Pipeline",
    version="2.0.0",
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
    instagram: str | None = None
    tiktok: str | None = None
    youtube: str | None = None
    has_agent: bool = False
    agent_email: str | None = None


class BrandRegisterRequest(BaseModel):
    email: str
    name: str
    company_name: str
    industry: str | None = None
    website: str | None = None
    description: str | None = None


class AgentRegisterRequest(BaseModel):
    email: str
    name: str
    agency_name: str
    website: str | None = None
    country: str | None = None
    team_size: str | None = None
    default_restricted_categories: str | None = None
    approval_workflow: str = "both_required"


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
    role: str
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
    instagram: str | None = None
    tiktok: str | None = None
    youtube: str | None = None
    has_agent: bool | None = None
    agent_email: str | None = None


class PricingEstimateRequest(BaseModel):
    content_type: str = "image"
    duration_days: int = 30
    regions: str = "UK"
    exclusivity: bool = False
    talent_min_price: float = 100.0


class OnboardingChatRequest(BaseModel):
    messages: list[dict]
    user_type: str = "talent"
    context: dict | None = None


class PhotoAnalyzeRequest(BaseModel):
    description: str = ""


class TalentAgentLinkRequest(BaseModel):
    talent_id: int
    agent_id: int
    approval_type: str = "both_required"


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
    elif user.role == "agent":
        ap = db.query(AgentProfile).filter(AgentProfile.user_id == user.id).first()
        return ap.id if ap else None
    return None


def _user_response(user: User, profile_id: int | None) -> dict:
    return {
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "profile_id": profile_id,
    }


def _sync_supabase_user(supabase_uid: str, email: str, name: str, role: str,
                         company_name: str | None, db: Session) -> User:
    user = db.query(User).filter(User.supabase_uid == supabase_uid).first()
    if user:
        return user
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.supabase_uid = supabase_uid
        db.commit()
        return user
    user = User(email=email, name=name, role=role, supabase_uid=supabase_uid)
    db.add(user)
    db.flush()
    if role == "talent":
        profile = TalentProfile(user_id=user.id)
        db.add(profile)
    elif role == "brand":
        profile = BrandProfile(user_id=user.id, company_name=company_name or name)
        db.add(profile)
    elif role == "agent":
        profile = AgentProfile(user_id=user.id, agency_name=company_name or name)
        db.add(profile)
    db.commit()
    return user


# -- Auth Endpoints -----------------------------------------------------------


@app.post("/api/auth/signup")
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    if req.role not in ("talent", "brand", "agent"):
        raise HTTPException(400, "Role must be talent, brand, or agent")

    if supabase:
        try:
            auth_res = supabase.auth.sign_up({
                "email": req.email,
                "password": req.password,
                "options": {
                    "data": {
                        "name": req.name,
                        "role": req.role,
                        "company_name": req.company_name,
                    }
                },
            })
            if auth_res.user:
                user = _sync_supabase_user(
                    auth_res.user.id, req.email, req.name, req.role, req.company_name, db
                )
                return {
                    **_user_response(user, _get_profile_id(user, db)),
                    "access_token": auth_res.session.access_token if auth_res.session else None,
                    "auth_provider": "supabase",
                }
            else:
                raise HTTPException(400, "Signup failed -- check email for confirmation link")
        except HTTPException:
            raise
        except Exception as e:
            error_msg = str(e)
            if "already registered" in error_msg.lower() or "already been registered" in error_msg.lower():
                raise HTTPException(400, "Email already registered")

    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

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
    elif req.role == "agent":
        profile = AgentProfile(
            user_id=user.id,
            agency_name=req.company_name or req.name,
        )
        db.add(profile)
        db.flush()
        profile_id = profile.id

    db.commit()
    return {**_user_response(user, profile_id), "access_token": None, "auth_provider": "local"}


@app.post("/api/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    if supabase:
        try:
            auth_res = supabase.auth.sign_in_with_password({
                "email": req.email,
                "password": req.password,
            })
            if auth_res.user and auth_res.session:
                meta = auth_res.user.user_metadata or {}
                name = meta.get("name", req.email.split("@")[0])
                role = meta.get("role", "talent")
                company = meta.get("company_name")
                user = _sync_supabase_user(auth_res.user.id, req.email, name, role, company, db)
                return {
                    **_user_response(user, _get_profile_id(user, db)),
                    "access_token": auth_res.session.access_token,
                    "auth_provider": "supabase",
                }
        except Exception:
            pass

    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(401, "Invalid email or password")
    if not user.password_hash:
        raise HTTPException(401, "Account has no password -- please re-register")
    if not _verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return {
        **_user_response(user, _get_profile_id(user, db)),
        "access_token": None,
        "auth_provider": "local",
    }


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
        instagram=req.instagram,
        tiktok=req.tiktok,
        youtube=req.youtube,
        has_agent=req.has_agent,
        agent_email=req.agent_email,
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

    # Get linked agent
    link = db.query(TalentAgentLink).filter(TalentAgentLink.talent_id == talent_id).first()
    agent_info = None
    if link:
        agent = db.query(AgentProfile).filter(AgentProfile.id == link.agent_id).first()
        agent_user = db.query(User).filter(User.id == agent.user_id).first() if agent else None
        if agent:
            agent_info = {
                "id": agent.id,
                "agency_name": agent.agency_name,
                "name": agent_user.name if agent_user else "",
                "approval_type": link.approval_type,
            }

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
        "instagram": profile.instagram,
        "tiktok": profile.tiktok,
        "youtube": profile.youtube,
        "has_agent": profile.has_agent,
        "agent_email": profile.agent_email,
        "linked_agent": agent_info,
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
            "instagram": tp.instagram,
            "tiktok": tp.tiktok,
            "youtube": tp.youtube,
        }
        for tp, u in talents
    ]


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
            "license_token": lr.license_token,
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
            "license_token": lr.license_token,
            "orchestration_status": lr.orchestration_status,
            "has_contract": contract is not None,
            "payment_status": lr.payment_status,
            "created_at": lr.created_at.isoformat(),
        })
    return results


# -- Agent Profile Endpoints ---------------------------------------------------


@app.post("/api/agent/register")
def register_agent(req: AgentRegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(400, "Email already registered")

    user = User(email=req.email, name=req.name, role="agent")
    db.add(user)
    db.flush()

    profile = AgentProfile(
        user_id=user.id,
        agency_name=req.agency_name,
        website=req.website,
        country=req.country,
        team_size=req.team_size,
        default_restricted_categories=req.default_restricted_categories,
        approval_workflow=req.approval_workflow,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    return {"id": profile.id, "user_id": user.id, "agency": req.agency_name, "message": "Agent registered successfully"}


@app.get("/api/agent/{agent_id}")
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    profile = db.query(AgentProfile).filter(AgentProfile.id == agent_id).first()
    if not profile:
        raise HTTPException(404, "Agent not found")
    user = db.query(User).filter(User.id == profile.user_id).first()

    # Get managed talents
    links = db.query(TalentAgentLink).filter(TalentAgentLink.agent_id == agent_id).all()
    managed_talents = []
    for link in links:
        talent = db.query(TalentProfile).filter(TalentProfile.id == link.talent_id).first()
        talent_user = db.query(User).filter(User.id == talent.user_id).first() if talent else None
        if talent and talent_user:
            managed_talents.append({
                "id": talent.id,
                "name": talent_user.name,
                "geo_scope": talent.geo_scope,
                "approval_type": link.approval_type,
                "categories": talent.categories,
            })

    return {
        "id": profile.id,
        "name": user.name,
        "email": user.email,
        "agency_name": profile.agency_name,
        "website": profile.website,
        "country": profile.country,
        "team_size": profile.team_size,
        "default_restricted_categories": profile.default_restricted_categories,
        "approval_workflow": profile.approval_workflow,
        "managed_talents": managed_talents,
    }


@app.get("/api/agent/{agent_id}/requests")
def get_agent_requests(agent_id: int, db: Session = Depends(get_db)):
    """Get license requests for all talents managed by this agent."""
    links = db.query(TalentAgentLink).filter(TalentAgentLink.agent_id == agent_id).all()
    talent_ids = [link.talent_id for link in links]
    if not talent_ids:
        return []

    requests = (
        db.query(LicenseRequest)
        .filter(LicenseRequest.talent_id.in_(talent_ids))
        .order_by(LicenseRequest.created_at.desc())
        .all()
    )
    results = []
    for lr in requests:
        talent = db.query(TalentProfile).filter(TalentProfile.id == lr.talent_id).first()
        talent_user = db.query(User).filter(User.id == talent.user_id).first() if talent else None
        brand = db.query(BrandProfile).filter(BrandProfile.id == lr.brand_id).first()
        results.append({
            "id": lr.id,
            "status": lr.status,
            "talent_name": talent_user.name if talent_user else "Unknown",
            "brand_name": brand.company_name if brand else "Unknown",
            "use_case": lr.use_case,
            "content_type": lr.content_type,
            "desired_duration_days": lr.desired_duration_days,
            "proposed_price": lr.proposed_price,
            "created_at": lr.created_at.isoformat(),
        })
    return results


# -- Talent-Agent Linking ------------------------------------------------------


@app.post("/api/talent-agent/link")
def link_talent_agent(req: TalentAgentLinkRequest, db: Session = Depends(get_db)):
    talent = db.query(TalentProfile).filter(TalentProfile.id == req.talent_id).first()
    if not talent:
        raise HTTPException(404, "Talent not found")
    agent = db.query(AgentProfile).filter(AgentProfile.id == req.agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    existing = db.query(TalentAgentLink).filter(
        TalentAgentLink.talent_id == req.talent_id,
        TalentAgentLink.agent_id == req.agent_id,
    ).first()
    if existing:
        raise HTTPException(400, "Link already exists")

    link = TalentAgentLink(
        talent_id=req.talent_id,
        agent_id=req.agent_id,
        approval_type=req.approval_type,
    )
    db.add(link)
    talent.has_agent = True
    db.commit()
    db.refresh(link)

    return {"id": link.id, "talent_id": req.talent_id, "agent_id": req.agent_id, "message": "Linked successfully"}


@app.delete("/api/talent-agent/link/{link_id}")
def unlink_talent_agent(link_id: int, db: Session = Depends(get_db)):
    link = db.query(TalentAgentLink).filter(TalentAgentLink.id == link_id).first()
    if not link:
        raise HTTPException(404, "Link not found")
    talent = db.query(TalentProfile).filter(TalentProfile.id == link.talent_id).first()
    db.delete(link)
    remaining = db.query(TalentAgentLink).filter(TalentAgentLink.talent_id == link.talent_id).count()
    if talent and remaining == 0:
        talent.has_agent = False
    db.commit()
    return {"message": "Unlinked successfully"}


@app.get("/api/talent-agent/links/{agent_id}")
def get_agent_links(agent_id: int, db: Session = Depends(get_db)):
    links = db.query(TalentAgentLink).filter(TalentAgentLink.agent_id == agent_id).all()
    results = []
    for link in links:
        talent = db.query(TalentProfile).filter(TalentProfile.id == link.talent_id).first()
        talent_user = db.query(User).filter(User.id == talent.user_id).first() if talent else None
        results.append({
            "id": link.id,
            "talent_id": link.talent_id,
            "talent_name": talent_user.name if talent_user else "Unknown",
            "approval_type": link.approval_type,
            "geo_scope": talent.geo_scope if talent else "global",
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
    """Trigger the 7-agent pipeline to process a license request."""
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
        "geo_scope": talent.geo_scope,
        "approval_mode": talent.approval_mode,
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
    license_req.orchestration_status = "in_progress"
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
            license_req.compliance_notes = (
                stage["result"].get("executive_summary")
                or cr.get("compliance_notes", "")
            )
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

        if stage["stage"] == "license_token" and stage["result"].get("license_token"):
            license_req.license_token = stage["result"]["license_token"]

        if stage["stage"] == "gen_orchestrator" and stage.get("status") == "complete":
            gen_prompt = stage["result"].get("details", {}).get("generated_prompt", "")
            license_req.gen_prompt = gen_prompt

        if stage["stage"] == "fingerprint" and stage.get("status") == "complete":
            fp_id = stage["result"].get("details", {}).get("fingerprint_id", "")
            license_req.fingerprint_id = fp_id

        if stage["stage"] == "web3_contract" and stage.get("status") == "complete":
            license_req.web3_contract = json.dumps(stage["result"].get("details", {}))

    license_req.status = result.get("final_status", LicenseStatus.AWAITING_APPROVAL.value)
    license_req.orchestration_status = "completed" if result["final_status"] != "rejected_compliance" else "failed"
    license_req.updated_at = datetime.utcnow()
    db.commit()

    return {
        "license_id": license_id,
        "status": license_req.status,
        "orchestration_status": license_req.orchestration_status,
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
        "license_token": lr.license_token,
        "orchestration_status": lr.orchestration_status,
        "fingerprint_id": lr.fingerprint_id,
        "gen_prompt": lr.gen_prompt,
        "web3_contract": lr.web3_contract,
        "contract": {
            "id": contract.id,
            "text": contract.contract_text,
            "model_used": contract.model_used,
            "generated_at": contract.created_at.isoformat(),
        } if contract else None,
        "payment_status": lr.payment_status,
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
        if not lr.license_token:
            lr.license_token = str(uuid.uuid4())
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
            "license_token": lr.license_token,
            "orchestration_status": lr.orchestration_status,
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


# -- Pricing API ---------------------------------------------------------------


@app.post("/api/pricing/estimate")
def pricing_estimate(req: PricingEstimateRequest):
    base_rate = max(req.talent_min_price, 100.0)
    content_factors = {"image": 1.0, "video": 2.5, "both": 3.0}
    content_mult = content_factors.get(req.content_type, 1.0)
    if req.duration_days <= 7:
        duration_mult = 1.0
    elif req.duration_days <= 30:
        duration_mult = 0.8
    elif req.duration_days <= 90:
        duration_mult = 0.6
    elif req.duration_days <= 365:
        duration_mult = 0.4
    else:
        duration_mult = 0.3
    region_lower = req.regions.lower()
    if "global" in region_lower:
        region_mult = 3.0
    elif "eu" in region_lower or "europe" in region_lower:
        region_mult = 2.0
    else:
        region_mult = 1.0
    exclusivity_mult = 2.5 if req.exclusivity else 1.0
    estimated_price = round(
        base_rate * content_mult * (req.duration_days * duration_mult) * region_mult * exclusivity_mult / 30,
        2,
    )
    return {
        "estimated_price": estimated_price,
        "currency": "GBP",
        "breakdown": {
            "base_rate": base_rate,
            "content_type_factor": content_mult,
            "duration_factor": duration_mult,
            "region_factor": region_mult,
            "exclusivity_factor": exclusivity_mult,
        },
        "parameters": {
            "content_type": req.content_type,
            "duration_days": req.duration_days,
            "regions": req.regions,
            "exclusivity": req.exclusivity,
        },
        "note": "This is an algorithmic estimate. Run the full agent pipeline for AI-negotiated pricing.",
    }


# -- SDG Impact Endpoint -------------------------------------------------------


@app.get("/api/sdg/impact")
def sdg_impact(db: Session = Depends(get_db)):
    total_talents = db.query(TalentProfile).count()
    total_brands = db.query(BrandProfile).count()
    total_licenses = db.query(LicenseRequest).count()
    approved_licenses = db.query(LicenseRequest).filter(
        LicenseRequest.status.in_(["active", "approved"])
    ).count()
    rejected_licenses = db.query(LicenseRequest).filter(
        LicenseRequest.status.in_(["rejected", "rejected_compliance"])
    ).count()

    from sqlalchemy import func
    avg_price = db.query(func.avg(LicenseRequest.proposed_price)).filter(
        LicenseRequest.proposed_price.isnot(None)
    ).scalar() or 0

    return {
        "sdg_alignment": [
            {
                "sdg": "SDG 8",
                "title": "Decent Work and Economic Growth",
                "description": "Creating fair economic opportunities for creators whose likenesses are used in AI",
                "metrics": {
                    "creators_protected": total_talents,
                    "fair_deals_completed": approved_licenses,
                    "average_creator_compensation_gbp": round(avg_price, 2),
                },
            },
            {
                "sdg": "SDG 10",
                "title": "Reduced Inequalities",
                "description": "Ensuring individual creators have the same IP protection as large corporations",
                "metrics": {
                    "individual_creators_registered": total_talents,
                    "brands_held_accountable": total_brands,
                    "unfair_requests_blocked": rejected_licenses,
                },
            },
            {
                "sdg": "SDG 16",
                "title": "Peace, Justice and Strong Institutions",
                "description": "Building transparent, auditable licensing infrastructure with UK law compliance",
                "metrics": {
                    "total_licenses_audited": total_licenses,
                    "uk_law_compliant_contracts": approved_licenses,
                    "audit_trail_entries": db.query(AuditLog).count(),
                },
            },
        ],
        "platform_stats": {
            "total_talents": total_talents,
            "total_brands": total_brands,
            "total_licenses": total_licenses,
            "approval_rate": round(approved_licenses / max(total_licenses, 1) * 100, 1),
        },
    }


# -- Agent & Audit Endpoints ---------------------------------------------------


@app.get("/api/agents/status")
def agents_status():
    stats = orchestrator.audit.get_system_stats()
    agent_stats = orchestrator.audit.get_agent_stats()
    models = get_model_info()

    return {
        "agents": [
            {"name": "Compliance & Risk Agent", "id": "compliance", "role": "Risk assessment & policy enforcement", "provider": "FLock (DeepSeek V3.2) + Z.AI (GLM-4 Plus)", "models": ["deepseek-v3.2", "glm-4-plus"], "sdg": ["SDG 10", "SDG 16"]},
            {"name": "Pricing Negotiator Agent", "id": "negotiator", "role": "Dynamic pricing & licensing terms", "provider": "FLock (Qwen3 235B)", "models": ["qwen3-235b-a22b-instruct-2507"], "sdg": ["SDG 8", "SDG 10"]},
            {"name": "IP Contract Agent", "id": "contract", "role": "UK-law-compliant IP contract generation", "provider": "Z.AI (GLM-4 Plus) / FLock (Qwen3 235B)", "models": ["glm-4-plus", "qwen3-235b-a22b-thinking-2507"], "sdg": ["SDG 16"]},
            {"name": "Avatar Generation Agent", "id": "gen_orchestrator", "role": "Avatar prompt generation for Z.AI", "provider": "FLock (DeepSeek V3.2)", "models": ["deepseek-v3.2"], "sdg": ["SDG 8"]},
            {"name": "Likeness Fingerprint Agent", "id": "fingerprint", "role": "Unauthorized use detection & scanning", "provider": "FLock (DeepSeek V3.2)", "models": ["deepseek-v3.2"], "sdg": ["SDG 16"]},
            {"name": "Web3 Rights Agent", "id": "web3_contract", "role": "Blockchain IP rights (ERC-721)", "provider": "Local (Animoca Integration)", "models": [], "sdg": ["SDG 16"]},
            {"name": "Talent Discovery Agent", "id": "search", "role": "AI-driven talent discovery", "provider": "FLock (DeepSeek V3.2)", "models": ["deepseek-v3.2"], "sdg": ["SDG 8", "SDG 10"]},
            {"name": "Audit & Logging Agent", "id": "audit", "role": "Transaction logging & usage monitoring", "provider": "Local (SQLite)", "models": [], "sdg": ["SDG 16"]},
            {"name": "Pipeline Orchestrator", "id": "orchestrator", "role": "7-agent pipeline coordination", "provider": "Local", "models": [], "sdg": ["SDG 8", "SDG 10", "SDG 16"]},
        ],
        "stats": stats,
        "agent_stats": agent_stats,
        "models": models,
    }


@app.get("/api/agents/decisions")
def agent_decisions():
    decisions = orchestrator.audit.get_decision_history(limit=50)
    return {"decisions": decisions, "total": len(decisions)}


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


# -- Onboarding Chat Endpoints ------------------------------------------------


ONBOARDING_SYSTEM_PROMPTS = {
    "talent": (
        "You are the Face Library onboarding assistant for talent/creators. "
        "You help them set up their profile so brands can license their likeness safely. "
        "You are warm, professional, and concise. Guide them through: age, location, "
        "photo upload, profile description review, social media connection, "
        "ad category restrictions (Alcohol, Smoking, Gambling, Adult, Political, Fur, Lingerie), "
        "agency representation check, and terms acceptance. "
        "Keep responses short (1-3 sentences). Use a friendly tone. "
        "When they provide their age/location, acknowledge it and move to the next step. "
        "If they ask questions about the platform, briefly explain that Face Library "
        "protects their likeness rights and lets them earn from AI-generated content."
    ),
    "brand": (
        "You are the Face Library onboarding assistant for advertisers/brands. "
        "You help them set up campaigns and find the perfect talent for AI-generated ads. "
        "Guide them through: welcome, campaign brief (upload or describe), "
        "geographic scope (UK/EU/Global), license duration, "
        "channels (organic social, paid social, website, TV, OOH, print), "
        "talent search preferences (age, look, vibe), "
        "and license request setup. "
        "Be professional but approachable. Keep responses short (1-3 sentences). "
        "Ask about their campaign goals, target audience, content type (image/video), "
        "budget range, and preferred talent characteristics."
    ),
    "agent": (
        "You are the Face Library onboarding assistant for talent agencies. "
        "You help them set up their agency profile and manage talent onboarding. "
        "Guide them through: agency info (name, website, country), team size, "
        "talent onboarding approach, default content restrictions "
        "(Alcohol, Smoking, Gambling, Adult, Political, Fur, Lingerie), "
        "contract template upload, and approval workflow setup "
        "(talent_only, agent_only, both_required). "
        "Be professional and efficient. Keep responses short (1-3 sentences). "
        "Help them understand how Face Library protects their talent roster."
    ),
}


@app.post("/api/chat/onboarding")
def onboarding_chat(req: OnboardingChatRequest):
    system_prompt = ONBOARDING_SYSTEM_PROMPTS.get(req.user_type, ONBOARDING_SYSTEM_PROMPTS["talent"])

    if req.context:
        context_str = ", ".join(f"{k}: {v}" for k, v in req.context.items() if v)
        if context_str:
            system_prompt += f"\n\nUser context: {context_str}"

    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.messages[-10:]:
        role = msg.get("role", "user")
        if role in ("bot", "assistant"):
            role = "assistant"
        messages.append({"role": role, "content": msg.get("content", "")})

    result = llm_chat(
        messages=messages,
        model_tier="fast",
        temperature=0.7,
        max_tokens=256,
        agent_name="onboarding_assistant",
    )

    return {
        "response": result["content"],
        "model": result["model"],
        "provider": result["provider"],
    }


@app.post("/api/talent/analyze-photo")
def analyze_photo(req: PhotoAnalyzeRequest):
    prompt = (
        "Generate a concise profile description for a talent/model on a likeness licensing platform. "
        "Return ONLY valid JSON with exactly these 4 fields: hair, eyes, style, vibe. "
        "Each value should be 1-2 words. "
    )
    if req.description:
        prompt += f'The person describes themselves as: "{req.description}". '
    else:
        prompt += "No description provided -- generate plausible, diverse defaults. "

    prompt += 'Example: {"hair": "Blonde", "eyes": "Blue", "style": "Natural", "vibe": "Friendly"}'

    result = llm_chat_json(
        messages=[
            {"role": "system", "content": "You are a profile description generator. Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        model_tier="fast",
        temperature=0.8,
        max_tokens=128,
        agent_name="photo_analyzer",
    )

    description = result.get("parsed")
    if not description:
        description = {"hair": "Brown", "eyes": "Brown", "style": "Natural", "vibe": "Confident"}

    return {
        "description": description,
        "model": result["model"],
        "provider": result["provider"],
    }


# -- OpenClaw Config Endpoint --------------------------------------------------


@app.get("/api/openclaw/config")
def openclaw_config():
    """Serve the OpenClaw gateway configuration for this agent system."""
    config_path = os.path.join(os.path.dirname(__file__), "..", "agents", "openclaw.json")
    try:
        with open(config_path) as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(404, "OpenClaw config not found")


# -- Telegram Bot Webhook (Multi-channel for FLock bounty) --------------------


class TelegramUpdate(BaseModel):
    update_id: int
    message: dict | None = None


@app.post("/api/telegram/webhook")
def telegram_webhook(update: TelegramUpdate, db: Session = Depends(get_db)):
    """Handle Telegram bot messages for multi-channel access.

    Supported commands:
    /start - Welcome message
    /search <query> - Search for talent
    /status <license_id> - Check license status
    /agents - List available AI agents
    /help - Show available commands
    """
    TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    msg = update.message
    if not msg or "text" not in msg:
        return {"ok": True}

    chat_id = msg["chat"]["id"]
    text = msg["text"].strip()
    reply = ""

    if text.startswith("/start"):
        reply = (
            "Welcome to Face Library Bot!\n\n"
            "I'm your AI-powered likeness licensing assistant. "
            "I can help you search for talent, check license status, and more.\n\n"
            "Commands:\n"
            "/search <query> - Search for talent\n"
            "/status <license_id> - Check license status\n"
            "/agents - View AI agent system\n"
            "/help - Show this message"
        )

    elif text.startswith("/search"):
        query = text.replace("/search", "").strip()
        if not query:
            reply = "Usage: /search <description>\nExample: /search female model, fashion, UK-based"
        else:
            result = orchestrator.search_talent(query)
            matches = result.get("details", {}).get("matches", [])
            if matches:
                reply = f"Found {len(matches)} talent(s):\n\n"
                for m in matches[:5]:
                    reply += f"• {m.get('name', 'Unknown')} - Score: {m.get('relevance_score', 'N/A')}\n"
            else:
                reply = f"No talent found for: {query}\nTry a different search."

    elif text.startswith("/status"):
        parts = text.split()
        if len(parts) < 2 or not parts[1].isdigit():
            reply = "Usage: /status <license_id>\nExample: /status 1"
        else:
            lid = int(parts[1])
            lr = db.query(LicenseRequest).filter(LicenseRequest.id == lid).first()
            if lr:
                talent = db.query(TalentProfile).filter(TalentProfile.id == lr.talent_id).first()
                talent_user = db.query(User).filter(User.id == talent.user_id).first() if talent else None
                brand = db.query(BrandProfile).filter(BrandProfile.id == lr.brand_id).first()
                reply = (
                    f"License #{lr.id}\n"
                    f"Status: {lr.status}\n"
                    f"Talent: {talent_user.name if talent_user else 'Unknown'}\n"
                    f"Brand: {brand.company_name if brand else 'Unknown'}\n"
                    f"Use Case: {lr.use_case}\n"
                    f"Price: {'£' + str(lr.proposed_price) if lr.proposed_price else 'Pending'}\n"
                    f"Risk: {lr.risk_score or 'Pending'}"
                )
            else:
                reply = f"License #{lid} not found."

    elif text.startswith("/agents"):
        reply = (
            "Face Library AI Agents (9):\n\n"
            "1. Compliance & Risk - DeepSeek V3.2 + GLM-4.5\n"
            "2. Pricing Negotiator - Qwen3 235B\n"
            "3. IP Contract - GLM-4.5 (Z.AI)\n"
            "4. Avatar Generation - DeepSeek V3.2\n"
            "5. Likeness Fingerprint - DeepSeek V3.2\n"
            "6. Web3 Rights - Polygon/ERC-721\n"
            "7. Talent Discovery - DeepSeek V3.2\n"
            "8. Audit & Logging - Local\n"
            "9. Pipeline Orchestrator - Coordinates all"
        )

    elif text.startswith("/help"):
        reply = (
            "Face Library Bot Commands:\n\n"
            "/search <query> - Search for talent\n"
            "/status <license_id> - Check license status\n"
            "/agents - View AI agent system\n"
            "/help - Show this message\n\n"
            "Web: https://face-library.vercel.app\n"
            "API: https://face-library.onrender.com/docs"
        )

    else:
        # Free-text query: treat as talent search
        result = orchestrator.search_talent(text)
        matches = result.get("details", {}).get("matches", [])
        if matches:
            reply = f"Talent search for '{text}':\n\n"
            for m in matches[:3]:
                reply += f"• {m.get('name', 'Unknown')} - {m.get('relevance_score', 'N/A')}\n"
            reply += "\nUse /help for all commands."
        else:
            reply = f"I didn't understand that. Use /help to see available commands."

    # Send reply back to Telegram
    if TELEGRAM_TOKEN and reply:
        import httpx
        try:
            httpx.post(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
                json={"chat_id": chat_id, "text": reply, "parse_mode": "Markdown"},
                timeout=10,
            )
        except Exception:
            pass  # Non-blocking: don't fail the webhook if Telegram send fails

    return {"ok": True, "reply": reply}


@app.post("/api/telegram/setup")
def telegram_setup_webhook():
    """Register the Telegram webhook URL with Telegram's API."""
    TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not TELEGRAM_TOKEN:
        return {"error": "TELEGRAM_BOT_TOKEN not set"}

    webhook_url = os.getenv("BACKEND_URL", "https://face-library.onrender.com")
    import httpx
    resp = httpx.post(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook",
        json={"url": f"{webhook_url}/api/telegram/webhook"},
        timeout=10,
    )
    return resp.json()


# -- Stripe Payments (Anyway Bounty: Commercialization) -----------------------


class CheckoutRequest(BaseModel):
    license_id: int
    success_url: str = "https://face-library.vercel.app/brand/dashboard"
    cancel_url: str = "https://face-library.vercel.app/brand/dashboard"


@app.post("/api/payments/checkout")
def create_checkout_session(req: CheckoutRequest, db: Session = Depends(get_db)):
    """Create a Stripe Checkout session for a license payment.

    This is the commercialization endpoint for the Anyway bounty.
    Brands pay for approved licenses through Stripe Connect.
    """
    STRIPE_KEY = os.getenv("STRIPE_SECRET_KEY", "")
    if not STRIPE_KEY:
        raise HTTPException(503, "Stripe not configured")

    lr = db.query(LicenseRequest).filter(LicenseRequest.id == req.license_id).first()
    if not lr:
        raise HTTPException(404, "License not found")
    if not lr.proposed_price:
        raise HTTPException(400, "License has no proposed price yet. Run the agent pipeline first.")

    talent = db.query(TalentProfile).filter(TalentProfile.id == lr.talent_id).first()
    talent_user = db.query(User).filter(User.id == talent.user_id).first() if talent else None
    brand = db.query(BrandProfile).filter(BrandProfile.id == lr.brand_id).first()

    import stripe
    stripe.api_key = STRIPE_KEY

    # Platform fee: 10% of license price
    platform_fee = int(lr.proposed_price * 10)  # 10% in pence
    license_amount = int(lr.proposed_price * 100)  # Full amount in pence

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "gbp",
                "product_data": {
                    "name": f"Likeness License #{lr.id}",
                    "description": (
                        f"License for {talent_user.name if talent_user else 'talent'}'s likeness. "
                        f"Use case: {lr.use_case}. Duration: {lr.desired_duration_days} days. "
                        f"Content: {lr.content_type}."
                    ),
                },
                "unit_amount": license_amount,
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=req.success_url + f"?payment=success&license_id={lr.id}",
        cancel_url=req.cancel_url + f"?payment=cancelled&license_id={lr.id}",
        metadata={
            "license_id": str(lr.id),
            "talent_id": str(lr.talent_id),
            "brand_id": str(lr.brand_id),
            "platform": "face-library",
            "platform_fee_pence": str(platform_fee),
        },
    )

    orchestrator.audit.log(
        lr.id, "payment", "checkout_created",
        f"Stripe checkout session created: {session.id} for £{lr.proposed_price}",
    )

    return {
        "checkout_url": session.url,
        "session_id": session.id,
        "amount_gbp": lr.proposed_price,
        "platform_fee_gbp": round(lr.proposed_price * 0.1, 2),
        "talent_payout_gbp": round(lr.proposed_price * 0.9, 2),
    }


@app.post("/api/payments/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events for payment completion."""
    STRIPE_KEY = os.getenv("STRIPE_SECRET_KEY", "")
    WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    if not STRIPE_KEY:
        raise HTTPException(503, "Stripe not configured")

    import stripe
    stripe.api_key = STRIPE_KEY

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        if WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)
        else:
            event = json.loads(payload)
    except Exception:
        raise HTTPException(400, "Invalid webhook payload")

    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        license_id = session.get("metadata", {}).get("license_id")
        if license_id:
            db = next(get_db())
            lr = db.query(LicenseRequest).filter(LicenseRequest.id == int(license_id)).first()
            if lr:
                lr.payment_status = "paid"
                lr.stripe_session_id = session.get("id", "")
                lr.updated_at = datetime.utcnow()
                db.commit()

                orchestrator.audit.log(
                    int(license_id), "payment", "payment_completed",
                    f"Payment received: £{session.get('amount_total', 0) / 100:.2f}",
                )

    return {"received": True}


@app.get("/api/payments/revenue")
def get_revenue(db: Session = Depends(get_db)):
    """Revenue dashboard for Anyway bounty commercialization tracking."""
    from sqlalchemy import func

    total_revenue = db.query(func.sum(LicenseRequest.proposed_price)).filter(
        LicenseRequest.status.in_(["active", "approved"]),
        LicenseRequest.proposed_price.isnot(None),
    ).scalar() or 0

    paid_count = db.query(LicenseRequest).filter(
        LicenseRequest.status.in_(["active", "approved"]),
        LicenseRequest.proposed_price.isnot(None),
    ).count()

    platform_fees = round(total_revenue * 0.1, 2)
    talent_payouts = round(total_revenue * 0.9, 2)

    return {
        "total_revenue_gbp": round(total_revenue, 2),
        "platform_fees_gbp": platform_fees,
        "talent_payouts_gbp": talent_payouts,
        "total_transactions": paid_count,
        "fee_rate": "10%",
        "payment_provider": "Stripe Connect",
        "currency": "GBP",
    }


# -- Health Check --------------------------------------------------------------


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "Face Library API",
        "version": "2.0.0",
        "agents": 9,
        "pipeline": "7-step (Compliance -> Negotiator -> Contract -> Gen -> Fingerprint -> Web3 -> Audit)",
        "providers": ["FLock (Qwen3, DeepSeek, Kimi)", "Z.AI (GLM-4.5 via OpenRouter)"],
        "bounties": ["FLock.io", "Z.AI", "Claw for Human", "AnyWay", "Animoca"],
        "tracing": "Anyway SDK (OpenTelemetry)",
        "channels": ["Web (Next.js)", "REST API", "Telegram Bot"],
        "commercialization": "Stripe Connect",
        "openclaw": "/api/openclaw/config",
    }
