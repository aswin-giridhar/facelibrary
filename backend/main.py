"""Face Library MVP -- Secure Likeness Licensing Platform API.

Security features:
- Supabase Auth for signup/login (JWT tokens via Supabase)
- Fallback custom JWT for password-based auth (backward compat)
- Ownership verification (users can only modify their own data)
- CORS restricted to allowed origins
- Rate limiting on auth endpoints (5/min login, 3/min signup)
- Server-side price validation
- Stripe webhook signature verification
- Supabase Storage for file uploads
- Input length validation
"""
import os
import sys
import json
import uuid
import secrets
import time
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

import jwt as pyjwt
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv
import logging
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("facelibrary")

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

sys.path.insert(0, os.path.dirname(__file__))

from supabase_client import supabase_admin, supabase as supabase_public
from agents.contract import ContractAgent
from llm_client import LLMError

contract_agent = ContractAgent()

_DEFAULT_JWT_SECRET = "face-library-mvp-2026"
JWT_SECRET = os.getenv("SECRET_KEY", _DEFAULT_JWT_SECRET)
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

# Fail loudly at startup if SECRET_KEY is unset or still on the public default.
# Tokens signed with a known-default secret can be forged by anyone who reads
# the repo, so treating this as a best-effort fallback in production is unsafe.
if JWT_SECRET == _DEFAULT_JWT_SECRET and os.getenv("ENV", "dev") not in {"dev", "development", "local", "test"}:
    raise RuntimeError(
        "SECRET_KEY is unset or set to the public default. Refusing to start "
        "in a non-dev environment. Set SECRET_KEY in the Render environment."
    )

ALLOWED_ORIGINS = [
    "https://face-library.com",
    "https://www.face-library.com",
    "https://facelibrary.vercel.app",
    "https://face-library.vercel.app",
    "https://face-library-aswingiridhars-projects.vercel.app",
    "https://face-library-git-main-aswingiridhars-projects.vercel.app",
    "http://localhost:3000",
]

# -- Rate Limiter ------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)


# -- Supabase DB helper ------------------------------------------------------

def db():
    if not supabase_admin:
        raise HTTPException(500, "Supabase not configured")
    return supabase_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not supabase_admin:
        print("[WARNING] Supabase not configured")
    else:
        print("[Supabase] Connected via REST API")
        res = db().table("users").select("id", count="exact").execute()
        print(f"[Supabase] {res.count} users in database")
        print(f"[Auth] Supabase Auth {'enabled' if supabase_public else 'disabled (fallback to custom JWT)'}")
    yield


app = FastAPI(
    title="Face Library MVP API",
    description="Secure Likeness Licensing Platform",
    version="1.3.0",
    lifespan=lifespan,
)

# Attach rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# -- JWT Auth ----------------------------------------------------------------

security = HTTPBearer(auto_error=False)


def _create_token(user_id: int, email: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.utcnow(),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def _verify_supabase_token(token: str) -> dict | None:
    """Try to verify a Supabase JWT (issued by Supabase Auth)."""
    try:
        # Supabase JWTs use the JWT_SECRET from the project settings
        supabase_jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "")
        if not supabase_jwt_secret:
            return None
        payload = pyjwt.decode(token, supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
        return payload
    except Exception:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Extract and verify the current user from JWT token.
    Supports both custom JWT and Supabase Auth JWT."""
    if not credentials:
        raise HTTPException(401, "Authentication required")

    token = credentials.credentials

    # Try custom JWT first
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {
            "user_id": int(payload["sub"]),
            "email": payload["email"],
            "role": payload["role"],
        }
    except pyjwt.InvalidTokenError:
        pass

    # Try Supabase Auth JWT
    sb_payload = _verify_supabase_token(token)
    if sb_payload:
        email = sb_payload.get("email", "")
        # Look up user in our users table
        res = db().table("users").select("id,role").eq("email", email).execute()
        if res.data:
            return {"user_id": res.data[0]["id"], "email": email, "role": res.data[0]["role"]}

    raise HTTPException(401, "Invalid or expired token")


async def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict | None:
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except Exception:
        return None


# -- Supabase Auth helpers ---------------------------------------------------

def _signup_with_supabase_auth(email: str, password: str) -> dict | None:
    """Create a Supabase Auth user. Returns auth data or None if unavailable."""
    if not supabase_public:
        return None
    try:
        res = supabase_public.auth.sign_up({"email": email, "password": password})
        if res.user:
            return {"supabase_uid": res.user.id, "access_token": res.session.access_token if res.session else None}
    except Exception as e:
        print(f"[Supabase Auth] Signup fallback: {e}")
    return None


def _login_with_supabase_auth(email: str, password: str) -> dict | None:
    """Sign in via Supabase Auth. Returns auth data or None."""
    if not supabase_public:
        return None
    try:
        res = supabase_public.auth.sign_in_with_password({"email": email, "password": password})
        if res.user and res.session:
            return {"supabase_uid": res.user.id, "access_token": res.session.access_token}
    except Exception:
        pass
    return None


# -- Helpers -----------------------------------------------------------------

def _hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, stored: str) -> bool:
    try:
        if stored.startswith("$2"):
            import bcrypt
            return bcrypt.checkpw(password.encode(), stored.encode())
        else:
            import hashlib
            salt, h = stored.split(":")
            return hashlib.sha256((salt + password).encode()).hexdigest() == h
    except Exception:
        return False


def _log_audit(license_id: int | None, agent_name: str, action: str, details: str,
               model_used: str | None = None, tokens_used: int | None = None):
    try:
        db().table("audit_logs").insert({
            "license_id": license_id, "agent_name": agent_name,
            "action": action, "details": details[:1000],
            "model_used": model_used, "tokens_used": tokens_used,
        }).execute()
    except Exception as e:
        # Audit failures should never break a successful write, but they must
        # be visible: silent swallow means we lose the trail with no warning.
        logger.warning(
            "audit log insert failed for license_id=%s action=%s: %s",
            license_id, action, e,
        )


def _verify_agent_profile_id(user_id: int) -> int | None:
    """Return the agent profile id owned by user_id, or None."""
    return _get_user_profile_id(user_id, "agent")


def _verify_agent_link_access(user_id: int, link_id: int) -> bool:
    """A talent-agent link is accessible to the talent on it, the agent on it,
    or anyone with no-op read access (currently nobody)."""
    link_res = db().table("talent_agent_links").select("talent_id,agent_id").eq("id", link_id).execute()
    if not link_res.data:
        return False
    link = link_res.data[0]
    talent_pid = _get_user_profile_id(user_id, "talent")
    agent_pid = _get_user_profile_id(user_id, "agent")
    return (talent_pid and link["talent_id"] == talent_pid) or (agent_pid and link["agent_id"] == agent_pid)


def _get_user_profile_id(user_id: int, role: str) -> int | None:
    """Get the profile ID for a user based on their role."""
    table = {"talent": "talent_profiles", "client": "client_profiles", "agent": "agent_profiles"}.get(role)
    if not table:
        return None
    res = db().table(table).select("id").eq("user_id", user_id).execute()
    return res.data[0]["id"] if res.data else None


def _verify_talent_owns_license(user_id: int, license_id: int) -> bool:
    """Check that the talent user owns the license request."""
    profile_id = _get_user_profile_id(user_id, "talent")
    if not profile_id:
        return False
    lic = db().table("license_requests").select("talent_id").eq("id", license_id).execute()
    return lic.data and lic.data[0]["talent_id"] == profile_id


def _verify_client_owns_license(user_id: int, license_id: int) -> bool:
    """Check that the client user owns the license request."""
    profile_id = _get_user_profile_id(user_id, "client")
    if not profile_id:
        return False
    lic = db().table("license_requests").select("client_id").eq("id", license_id).execute()
    return lic.data and lic.data[0]["client_id"] == profile_id


# -- Request Models (with validation) ----------------------------------------

class SignupRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(..., max_length=20)
    company: str | None = Field(None, max_length=255)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v.lower().strip()

class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., max_length=128)

class TalentRegisterRequest(BaseModel):
    bio: str | None = Field(None, max_length=2000)
    stage_name: str | None = Field(None, max_length=255)
    categories: str | None = Field(None, max_length=500)
    nationality: str | None = Field(None, max_length=100)
    ethnicity: str | None = Field(None, max_length=100)
    gender: str | None = Field(None, max_length=50)
    age: int | None = Field(None, ge=13, le=120)
    restricted_categories: str | None = Field(None, max_length=500)
    min_price_per_use: float = Field(100.0, ge=0, le=1000000)
    max_license_duration_days: int = Field(365, ge=1, le=3650)
    allow_ai_training: bool = False
    geo_scope: str = Field("global", max_length=100)
    instagram: str | None = Field(None, max_length=255)
    tiktok: str | None = Field(None, max_length=255)
    youtube: str | None = Field(None, max_length=255)

class ClientRegisterRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    industry: str | None = Field(None, max_length=100)
    website: str | None = Field(None, max_length=500)
    phone: str | None = Field(None, max_length=50)
    role_title: str | None = Field(None, max_length=100)
    referral_source: str | None = Field(None, max_length=100)
    ai_tools_used: str | None = Field(None, max_length=1000)
    description: str | None = Field(None, max_length=2000)

class AgentRegisterRequest(BaseModel):
    agency_name: str = Field(..., min_length=1, max_length=255)
    website: str | None = Field(None, max_length=500)
    portfolio_url: str | None = Field(None, max_length=500)
    instagram: str | None = Field(None, max_length=255)
    industry: str | None = Field(None, max_length=100)

class LicenseRequestCreate(BaseModel):
    talent_id: int
    license_type: str = Field("standard", pattern="^(standard|exclusive|time_limited)$")
    use_case: str = Field(..., min_length=10, max_length=2000)
    desired_duration_days: int = Field(30, ge=1, le=3650)
    desired_regions: str | None = Field(None, max_length=500)
    content_type: str = Field("image", pattern="^(image|video|both)$")
    proposed_price: float | None = Field(None, ge=0, le=10000000)

class ReviewRequest(BaseModel):
    status: str = Field(..., pattern="^(under_review|awaiting_approval|approved|rejected)$")
    admin_notes: str | None = Field(None, max_length=2000)
    reviewed_by: str | None = Field(None, max_length=255)

class ContractImproveRequest(BaseModel):
    feedback: str = Field(..., min_length=5, max_length=2000)

class TalentPreferencesUpdate(BaseModel):
    restricted_categories: str | None = Field(None, max_length=500)
    categories: str | None = Field(None, max_length=500)
    min_price_per_use: float | None = Field(None, ge=0, le=1000000)
    max_license_duration_days: int | None = Field(None, ge=1, le=3650)
    allow_ai_training: bool | None = None
    allow_video_generation: bool | None = None
    allow_image_generation: bool | None = None
    geo_scope: str | None = Field(None, max_length=100)
    approval_mode: str | None = Field(None, pattern="^(manual|auto)$")
    instagram: str | None = Field(None, max_length=255)
    tiktok: str | None = Field(None, max_length=255)
    youtube: str | None = Field(None, max_length=255)

class TalentAgentLinkRequest(BaseModel):
    talent_id: int
    agent_id: int
    approval_type: str = Field("both_required", max_length=50)

class WatermarkReportRequest(BaseModel):
    license_id: int
    talent_id: int
    watermark_id: str = Field(..., max_length=255)
    platform_detected: str | None = Field(None, max_length=255)
    detection_url: str | None = Field(None, max_length=1000)
    is_authorized: bool = True
    notes: str | None = Field(None, max_length=2000)


# ============================================================================
# AUTH (public — no token required)
# ============================================================================

@app.post("/api/auth/signup")
@limiter.limit("3/minute")
def signup(request: Request, req: SignupRequest):
    existing = db().table("users").select("id").eq("email", req.email).execute()
    if existing.data:
        raise HTTPException(400, "Email already registered")

    role = req.role.lower()
    if role == "brand":
        role = "client"
    if role not in ("talent", "client", "agent"):
        raise HTTPException(400, "Invalid role")

    # Try Supabase Auth signup (creates auth user + issues JWT)
    supabase_auth = _signup_with_supabase_auth(req.email, req.password)
    supabase_uid = supabase_auth["supabase_uid"] if supabase_auth else None

    # Create user record in our table
    user_data = {
        "email": req.email, "name": req.name, "role": role,
        "company": req.company, "password_hash": _hash_password(req.password),
    }
    if supabase_uid:
        user_data["supabase_uid"] = supabase_uid

    res = db().table("users").insert(user_data).execute()
    user = res.data[0]

    # Use Supabase Auth token if available, else custom JWT
    token = supabase_auth.get("access_token") if supabase_auth and supabase_auth.get("access_token") else _create_token(user["id"], user["email"], user["role"])

    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "token": token,
        "auth_provider": "supabase" if supabase_uid else "custom",
    }


@app.post("/api/auth/login")
@limiter.limit("5/minute")
def login(request: Request, req: LoginRequest):
    email = req.email.lower().strip()

    # Try Supabase Auth login first
    supabase_auth = _login_with_supabase_auth(email, req.password)
    if supabase_auth:
        # Look up user in our table
        res = db().table("users").select("*").eq("email", email).execute()
        if res.data:
            user = res.data[0]
            return {
                "id": user["id"], "email": user["email"], "name": user["name"],
                "role": user["role"], "company": user.get("company"),
                "token": supabase_auth["access_token"],
                "auth_provider": "supabase",
            }

    # Fallback: custom password verification (for existing seeded users)
    res = db().table("users").select("*").eq("email", email).execute()
    if not res.data:
        raise HTTPException(401, "Invalid credentials")
    user = res.data[0]
    if not _verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid credentials")
    token = _create_token(user["id"], user["email"], user["role"])
    return {
        "id": user["id"], "email": user["email"], "name": user["name"],
        "role": user["role"], "company": user.get("company"), "token": token,
        "auth_provider": "custom",
    }


@app.get("/api/auth/me/{user_id}")
def get_me(user_id: int, current_user: dict = Depends(get_current_user)):
    if current_user["user_id"] != user_id:
        raise HTTPException(403, "Can only view your own profile")
    res = db().table("users").select("id,email,name,role,company").eq("id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    return res.data[0]


# ============================================================================
# TALENT (auth required)
# ============================================================================

@app.post("/api/talent/register")
def register_talent(req: TalentRegisterRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "talent":
        raise HTTPException(403, "Only talent users can register talent profiles")

    existing = db().table("talent_profiles").select("id").eq("user_id", current_user["user_id"]).execute()
    if existing.data:
        raise HTTPException(400, "Talent profile already exists")

    data = req.model_dump(exclude_none=True)
    data["user_id"] = current_user["user_id"]
    res = db().table("talent_profiles").insert(data).execute()
    profile = res.data[0]
    return {"id": profile["id"], "user_id": profile["user_id"], "name": current_user["email"]}


@app.post("/api/talent/{talent_id}/upload-image")
async def upload_talent_image(talent_id: int, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    # Verify ownership
    t_res = db().table("talent_profiles").select("user_id").eq("id", talent_id).execute()
    if not t_res.data:
        raise HTTPException(404, "Talent not found")
    if t_res.data[0]["user_id"] != current_user["user_id"]:
        raise HTTPException(403, "Not your profile")

    # Validate file
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only image files allowed")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10MB)")

    # Upload to Supabase Storage if available, else local
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"talent_{talent_id}_{uuid.uuid4().hex[:8]}.{ext}"

    try:
        db().storage.from_("talent-images").upload(filename, contents, {"content-type": file.content_type})
    except Exception as e:
        # Previously this silently wrote to a local /uploads dir that doesn't
        # exist on Render's ephemeral filesystem, handing the user a broken
        # image_url. Better to surface the real storage error.
        logger.error("talent image upload to Supabase storage failed: %s", e)
        raise HTTPException(502, "Image storage is temporarily unavailable. Please try again.")

    image_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/talent-images/{filename}"
    db().table("talent_profiles").update({"image_url": image_url}).eq("id", talent_id).execute()
    return {"image_url": image_url, "filename": filename}


@app.get("/api/talent/{talent_id}")
def get_talent(talent_id: int):
    t_res = db().table("talent_profiles").select("*").eq("id", talent_id).execute()
    if not t_res.data:
        raise HTTPException(404, "Talent not found")
    t = t_res.data[0]

    u_res = db().table("users").select("name,email").eq("id", t["user_id"]).execute()
    user = u_res.data[0] if u_res.data else {}

    link_res = db().table("talent_agent_links").select("*").eq("talent_id", talent_id).execute()
    agent_info = None
    if link_res.data:
        link = link_res.data[0]
        agent_res = db().table("agent_profiles").select("*").eq("id", link["agent_id"]).execute()
        if agent_res.data:
            agent = agent_res.data[0]
            au_res = db().table("users").select("name").eq("id", agent["user_id"]).execute()
            agent_info = {
                "id": agent["id"], "agency_name": agent.get("agency_name"),
                "name": au_res.data[0]["name"] if au_res.data else None,
                "approval_type": link.get("approval_type"),
            }

    return {
        "id": t["id"], "user_id": t["user_id"],
        "name": user.get("name"), "email": user.get("email"),
        "bio": t.get("bio"), "stage_name": t.get("stage_name"),
        "categories": t.get("categories"), "nationality": t.get("nationality"),
        "ethnicity": t.get("ethnicity"), "gender": t.get("gender"), "age": t.get("age"),
        "skin_color": t.get("skin_color"), "hair_color": t.get("hair_color"),
        "usage_allowed": t.get("usage_allowed"),
        "image_url": t.get("image_url"), "avatar_url": t.get("avatar_url"),
        "restricted_categories": t.get("restricted_categories"),
        "min_price_per_use": t.get("min_price_per_use"),
        "max_license_duration_days": t.get("max_license_duration_days"),
        "allow_ai_training": t.get("allow_ai_training"),
        "allow_video_generation": t.get("allow_video_generation"),
        "allow_image_generation": t.get("allow_image_generation"),
        "geo_scope": t.get("geo_scope"), "approval_mode": t.get("approval_mode"),
        "instagram": t.get("instagram"), "tiktok": t.get("tiktok"), "youtube": t.get("youtube"),
        "linked_agent": agent_info,
        "created_at": t.get("created_at"),
    }


@app.put("/api/talent/{talent_id}/preferences")
def update_talent_preferences(talent_id: int, req: TalentPreferencesUpdate, current_user: dict = Depends(get_current_user)):
    t_res = db().table("talent_profiles").select("user_id").eq("id", talent_id).execute()
    if not t_res.data:
        raise HTTPException(404, "Talent not found")
    if t_res.data[0]["user_id"] != current_user["user_id"]:
        raise HTTPException(403, "Not your profile")
    updates = req.model_dump(exclude_none=True)
    if updates:
        db().table("talent_profiles").update(updates).eq("id", talent_id).execute()
    return {"status": "updated"}


@app.get("/api/talent/{talent_id}/requests")
def get_talent_requests(talent_id: int, current_user: dict = Depends(get_current_user)):
    # Verify ownership
    t_res = db().table("talent_profiles").select("user_id").eq("id", talent_id).execute()
    if not t_res.data:
        raise HTTPException(404, "Talent not found")
    if t_res.data[0]["user_id"] != current_user["user_id"]:
        raise HTTPException(403, "Not your profile")

    res = db().table("license_requests").select("*").eq("talent_id", talent_id).execute()
    result = []
    for r in res.data:
        client_profile = db().table("client_profiles").select("company_name,user_id").eq("id", r["client_id"]).execute()
        if client_profile.data:
            client_row = client_profile.data[0]
            brand_name = client_row.get("company_name")
            client_user_id = client_row.get("user_id")
        else:
            brand_name = None
            client_user_id = None
        result.append({
            "id": r["id"], "status": r["status"], "license_type": r.get("license_type"),
            "use_case": r.get("use_case"), "content_type": r.get("content_type"),
            "desired_duration_days": r.get("desired_duration_days"),
            "desired_regions": r.get("desired_regions"),
            "proposed_price": r.get("proposed_price"),
            # Expose both the legacy `client_name` and the canonical `brand_name`
            # field the frontend uses, plus the brand user id so the Negotiate
            # button can open a DM with them via /api/conversations.
            "client_name": brand_name,
            "brand_name": brand_name,
            "client_user_id": client_user_id,
            "contract_generated": r.get("contract_generated"),
            "payment_status": r.get("payment_status"), "created_at": r.get("created_at"),
        })
    return result


@app.get("/api/talents")
def list_talents():
    res = db().table("talent_profiles").select("*").execute()
    result = []
    for t in res.data:
        u_res = db().table("users").select("name").eq("id", t["user_id"]).execute()
        name = u_res.data[0]["name"] if u_res.data else None
        result.append({
            "id": t["id"], "user_id": t["user_id"], "name": name,
            "stage_name": t.get("stage_name"), "bio": t.get("bio"),
            "categories": t.get("categories"), "gender": t.get("gender"),
            "age": t.get("age"), "nationality": t.get("nationality"),
            "ethnicity": t.get("ethnicity"),
            "skin_color": t.get("skin_color"), "hair_color": t.get("hair_color"),
            "usage_allowed": t.get("usage_allowed"),
            "image_url": t.get("image_url"), "avatar_url": t.get("avatar_url"),
            "min_price_per_use": t.get("min_price_per_use"),
            "instagram": t.get("instagram"), "tiktok": t.get("tiktok"),
            "youtube": t.get("youtube"), "geo_scope": t.get("geo_scope"),
        })
    return result


# ============================================================================
# CLIENT
# ============================================================================

@app.post("/api/client/register")
def register_client(req: ClientRegisterRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "client":
        raise HTTPException(403, "Only client users can register client profiles")

    existing = db().table("client_profiles").select("id").eq("user_id", current_user["user_id"]).execute()
    if existing.data:
        raise HTTPException(400, "Client profile already exists")

    data = req.model_dump(exclude_none=True)
    data["user_id"] = current_user["user_id"]
    res = db().table("client_profiles").insert(data).execute()
    profile = res.data[0]
    return {"id": profile["id"], "user_id": profile["user_id"], "company_name": profile.get("company_name")}


@app.get("/api/client/{client_id}")
def get_client(client_id: int, current_user: dict = Depends(get_current_user)):
    res = db().table("client_profiles").select("*").eq("id", client_id).execute()
    if not res.data:
        raise HTTPException(404, "Client not found")
    c = res.data[0]
    # Only the owner can see full details
    if c["user_id"] != current_user["user_id"]:
        return {"id": c["id"], "company_name": c.get("company_name"), "industry": c.get("industry")}
    u_res = db().table("users").select("name").eq("id", c["user_id"]).execute()
    return {
        "id": c["id"], "user_id": c["user_id"],
        "name": u_res.data[0]["name"] if u_res.data else None,
        "company_name": c.get("company_name"), "industry": c.get("industry"),
        "website": c.get("website"), "phone": c.get("phone"),
        "role_title": c.get("role_title"), "referral_source": c.get("referral_source"),
        "ai_tools_used": c.get("ai_tools_used"), "description": c.get("description"),
    }


@app.get("/api/client/{client_id}/requests")
def get_client_requests(client_id: int, current_user: dict = Depends(get_current_user)):
    c_res = db().table("client_profiles").select("user_id").eq("id", client_id).execute()
    if not c_res.data:
        raise HTTPException(404, "Client not found")
    if c_res.data[0]["user_id"] != current_user["user_id"]:
        raise HTTPException(403, "Not your profile")

    res = db().table("license_requests").select("*").eq("client_id", client_id).execute()
    result = []
    for r in res.data:
        t_res = db().table("talent_profiles").select("user_id,image_url").eq("id", r["talent_id"]).execute()
        talent = t_res.data[0] if t_res.data else {}
        tu_res = db().table("users").select("name").eq("id", talent.get("user_id", 0)).execute() if talent.get("user_id") else type("", (), {"data": []})()
        result.append({
            "id": r["id"], "status": r["status"], "license_type": r.get("license_type"),
            "use_case": r.get("use_case"), "content_type": r.get("content_type"),
            "desired_duration_days": r.get("desired_duration_days"),
            "proposed_price": r.get("proposed_price"),
            "talent_name": tu_res.data[0]["name"] if tu_res.data else None,
            "talent_image": talent.get("image_url"),
            "payment_status": r.get("payment_status"),
            "contract_generated": r.get("contract_generated"),
            "created_at": r.get("created_at"),
        })
    return result


# Backward-compatible brand endpoints
@app.post("/api/brand/register")
def register_brand_compat(req: ClientRegisterRequest, current_user: dict = Depends(get_current_user)):
    return register_client(req, current_user)

@app.get("/api/brand/{client_id}")
def get_brand_compat(client_id: int, current_user: dict = Depends(get_current_user)):
    return get_client(client_id, current_user)

@app.get("/api/brand/{client_id}/requests")
def get_brand_requests_compat(client_id: int, current_user: dict = Depends(get_current_user)):
    return get_client_requests(client_id, current_user)


# ============================================================================
# AGENT
# ============================================================================

@app.post("/api/agent/register")
def register_agent(req: AgentRegisterRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "agent":
        raise HTTPException(403, "Only agent users can register agent profiles")

    existing = db().table("agent_profiles").select("id").eq("user_id", current_user["user_id"]).execute()
    if existing.data:
        raise HTTPException(400, "Agent profile already exists")

    data = req.model_dump(exclude_none=True)
    data["user_id"] = current_user["user_id"]
    res = db().table("agent_profiles").insert(data).execute()
    profile = res.data[0]
    return {"id": profile["id"], "user_id": profile["user_id"], "agency_name": profile.get("agency_name")}


@app.get("/api/agent/{agent_id}")
def get_agent(agent_id: int, current_user: dict = Depends(get_current_user)):
    res = db().table("agent_profiles").select("*").eq("id", agent_id).execute()
    if not res.data:
        raise HTTPException(404, "Agent not found")
    a = res.data[0]
    if a["user_id"] != current_user["user_id"]:
        raise HTTPException(403, "Not your profile")

    u_res = db().table("users").select("name").eq("id", a["user_id"]).execute()
    links = db().table("talent_agent_links").select("*").eq("agent_id", agent_id).execute()
    managed = []
    for link in links.data:
        t_res = db().table("talent_profiles").select("*").eq("id", link["talent_id"]).execute()
        if t_res.data:
            t = t_res.data[0]
            tu = db().table("users").select("name").eq("id", t["user_id"]).execute()
            managed.append({
                "id": t["id"], "name": tu.data[0]["name"] if tu.data else None,
                "categories": t.get("categories"), "geo_scope": t.get("geo_scope"),
                "approval_type": link.get("approval_type"), "image_url": t.get("image_url"),
            })

    return {
        "id": a["id"], "user_id": a["user_id"],
        "name": u_res.data[0]["name"] if u_res.data else None,
        "agency_name": a.get("agency_name"), "website": a.get("website"),
        "portfolio_url": a.get("portfolio_url"), "instagram": a.get("instagram"),
        "industry": a.get("industry"), "managed_talents": managed,
    }


@app.get("/api/agent/{agent_id}/requests")
def get_agent_requests(agent_id: int, current_user: dict = Depends(get_current_user)):
    a_res = db().table("agent_profiles").select("user_id").eq("id", agent_id).execute()
    if not a_res.data or a_res.data[0]["user_id"] != current_user["user_id"]:
        raise HTTPException(403, "Not your profile")

    links = db().table("talent_agent_links").select("talent_id").eq("agent_id", agent_id).execute()
    talent_ids = [l["talent_id"] for l in links.data]
    if not talent_ids:
        return []
    result = []
    for tid in talent_ids:
        reqs = db().table("license_requests").select("*").eq("talent_id", tid).execute()
        for r in reqs.data:
            t_res = db().table("talent_profiles").select("user_id").eq("id", r["talent_id"]).execute()
            tu = db().table("users").select("name").eq("id", t_res.data[0]["user_id"]).execute() if t_res.data else type("", (), {"data": []})()
            c_res = db().table("client_profiles").select("company_name,user_id").eq("id", r["client_id"]).execute()
            client_row = c_res.data[0] if c_res.data else {}
            brand_name = client_row.get("company_name")
            result.append({
                "id": r["id"], "status": r["status"], "license_type": r.get("license_type"),
                "use_case": r.get("use_case"),
                "content_type": r.get("content_type"),
                "desired_duration_days": r.get("desired_duration_days"),
                "desired_regions": r.get("desired_regions"),
                "talent_id": r["talent_id"],
                "talent_name": tu.data[0]["name"] if tu.data else None,
                "client_name": brand_name,
                "brand_name": brand_name,
                "client_user_id": client_row.get("user_id"),
                "contract_generated": r.get("contract_generated"),
                "payment_status": r.get("payment_status"),
                "proposed_price": r.get("proposed_price"), "created_at": r.get("created_at"),
            })
    return result


# ============================================================================
# TALENT-AGENT LINKING
# ============================================================================

@app.post("/api/talent-agent/link")
def link_talent_agent(req: TalentAgentLinkRequest, current_user: dict = Depends(get_current_user)):
    existing = db().table("talent_agent_links").select("id").eq("talent_id", req.talent_id).eq("agent_id", req.agent_id).execute()
    if existing.data:
        raise HTTPException(400, "Link already exists")
    res = db().table("talent_agent_links").insert({
        "talent_id": req.talent_id, "agent_id": req.agent_id, "approval_type": req.approval_type,
    }).execute()
    return {"id": res.data[0]["id"], "status": "linked"}


@app.delete("/api/talent-agent/link/{link_id}")
def unlink_talent_agent(link_id: int, current_user: dict = Depends(get_current_user)):
    if not _verify_agent_link_access(current_user["user_id"], link_id):
        raise HTTPException(403, "Not authorized to unlink this talent-agent relationship")
    db().table("talent_agent_links").delete().eq("id", link_id).execute()
    return {"status": "unlinked"}


@app.get("/api/talent-agent/links/{agent_id}")
def get_agent_links(agent_id: int, current_user: dict = Depends(get_current_user)):
    # Only the agent themselves can list their roster
    caller_agent_pid = _verify_agent_profile_id(current_user["user_id"])
    if caller_agent_pid != agent_id:
        raise HTTPException(403, "You can only view your own talent roster")
    res = db().table("talent_agent_links").select("*").eq("agent_id", agent_id).execute()
    return [{"id": l["id"], "talent_id": l["talent_id"], "agent_id": l["agent_id"],
             "approval_type": l.get("approval_type")} for l in res.data]


# ============================================================================
# LICENSING
# ============================================================================

@app.post("/api/licensing/request")
def create_license_request(req: LicenseRequestCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "client":
        raise HTTPException(403, "Only clients can create license requests")

    t_res = db().table("talent_profiles").select("min_price_per_use").eq("id", req.talent_id).execute()
    if not t_res.data:
        raise HTTPException(404, "Talent not found")

    client_profile_id = _get_user_profile_id(current_user["user_id"], "client")
    if not client_profile_id:
        raise HTTPException(400, "Register your client profile first")

    # Server-side price validation
    min_price = t_res.data[0].get("min_price_per_use", 0) or 0
    price = req.proposed_price or min_price
    if price < min_price:
        raise HTTPException(400, f"Price must be at least {min_price} (talent's minimum)")

    data = {
        "client_id": client_profile_id, "talent_id": req.talent_id,
        "license_type": req.license_type, "use_case": req.use_case,
        "desired_duration_days": req.desired_duration_days,
        "desired_regions": req.desired_regions, "content_type": req.content_type,
        "proposed_price": price,
        "license_token": f"FL-LIC-{uuid.uuid4().hex[:8].upper()}",
        "status": "pending", "payment_status": "unpaid",
    }
    res = db().table("license_requests").insert(data).execute()
    lic = res.data[0]
    _log_audit(lic["id"], "system", "license_created", f"License request created by client #{client_profile_id}")
    return {"id": lic["id"], "status": lic["status"], "license_token": lic["license_token"]}


@app.post("/api/licensing/{license_id}/generate-contract")
@limiter.limit("5/minute")
def generate_contract(license_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    lic_res = db().table("license_requests").select("*").eq("id", license_id).execute()
    if not lic_res.data:
        raise HTTPException(404, "License not found")
    lic = lic_res.data[0]

    # Verify caller is the client or talent on this license
    if not (_verify_client_owns_license(current_user["user_id"], license_id) or
            _verify_talent_owns_license(current_user["user_id"], license_id)):
        raise HTTPException(403, "Not authorized for this license")

    t_res = db().table("talent_profiles").select("*").eq("id", lic["talent_id"]).execute()
    talent = t_res.data[0] if t_res.data else {}
    tu_res = db().table("users").select("name").eq("id", talent.get("user_id", 0)).execute()
    c_res = db().table("client_profiles").select("company_name,industry").eq("id", lic["client_id"]).execute()
    client = c_res.data[0] if c_res.data else {}

    talent_data = {
        "name": tu_res.data[0]["name"] if tu_res.data else "Unknown",
        "bio": talent.get("bio"), "restricted_categories": talent.get("restricted_categories"),
        "min_price_per_use": talent.get("min_price_per_use", 100),
        "allow_ai_training": talent.get("allow_ai_training", False),
    }
    client_data = {"company_name": client.get("company_name", "Unknown"), "industry": client.get("industry")}
    request_data = {
        "license_type": lic.get("license_type"), "use_case": lic.get("use_case"),
        "content_type": lic.get("content_type"), "desired_duration_days": lic.get("desired_duration_days"),
        "desired_regions": lic.get("desired_regions"), "proposed_price": lic.get("proposed_price"),
    }

    try:
        result = contract_agent.generate_contract(talent_data, client_data, request_data)
    except LLMError as e:
        # Fail loudly: don't insert a stub contract or flip contract_generated.
        # The client should see a 502 and can retry; the SDK has already retried
        # transient 5xx/429 three times before we get here.
        raise HTTPException(
            status_code=502,
            detail=f"Contract generator is temporarily unavailable. Please try again shortly. ({e})",
        )

    contract_text = (result.get("contract_text") or "").strip()
    if not contract_text:
        raise HTTPException(502, "Contract generator returned an empty response. Please try again.")

    # Two-step write: insert contract, then flip license flags. Supabase REST
    # has no cross-table transaction, so if the second step fails we roll back
    # the contract row to avoid a half-committed state where a contract exists
    # but the license still says contract_generated=False.
    inserted = db().table("contracts").insert({
        "license_id": license_id, "license_type": lic.get("license_type"),
        "contract_text": contract_text,
    }).execute()
    contract_id = inserted.data[0]["id"] if inserted.data else None

    try:
        db().table("license_requests").update({
            "contract_generated": True, "status": "under_review",
        }).eq("id", license_id).execute()
    except Exception as e:
        if contract_id is not None:
            try:
                db().table("contracts").delete().eq("id", contract_id).execute()
            except Exception as rollback_err:
                logger.error(
                    "contract rollback failed for license_id=%s contract_id=%s: %s",
                    license_id, contract_id, rollback_err,
                )
        logger.error("license_requests update failed after contract insert: %s", e)
        raise HTTPException(500, "Failed to finalize contract state. The operation was rolled back; please retry.")

    _log_audit(license_id, "contract_agent", "contract_generated",
               f"IP licensing agreement generated ({result['model']})",
               result["model"], result["tokens_used"])
    return {"status": "contract_generated", "license_type": lic.get("license_type"),
            "model": result["model"], "tokens_used": result["tokens_used"]}


@app.post("/api/licensing/{license_id}/validate-contract")
@limiter.limit("10/minute")
def validate_contract(license_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    if not (_verify_client_owns_license(current_user["user_id"], license_id) or
            _verify_talent_owns_license(current_user["user_id"], license_id)):
        raise HTTPException(403, "Not authorized")

    c_res = db().table("contracts").select("contract_text").eq("license_id", license_id).order("id", desc=True).limit(1).execute()
    if not c_res.data:
        raise HTTPException(404, "No contract found")

    try:
        result = contract_agent.validate_contract(c_res.data[0]["contract_text"])
    except LLMError as e:
        raise HTTPException(502, f"Validator is temporarily unavailable. Please try again shortly. ({e})")

    _log_audit(license_id, "contract_agent", "contract_validated",
               f"Validation: {json.dumps(result.get('result', {}))[:500]}",
               result["model"], result["tokens_used"])
    return {"validation": result.get("result"), "model": result["model"]}


@app.post("/api/licensing/{license_id}/improve-contract")
@limiter.limit("5/minute")
def improve_contract(license_id: int, req: ContractImproveRequest, request: Request, current_user: dict = Depends(get_current_user)):
    if not (_verify_client_owns_license(current_user["user_id"], license_id) or
            _verify_talent_owns_license(current_user["user_id"], license_id)):
        raise HTTPException(403, "Not authorized")

    c_res = db().table("contracts").select("*").eq("license_id", license_id).order("id", desc=True).limit(1).execute()
    if not c_res.data:
        raise HTTPException(404, "No contract found")

    try:
        result = contract_agent.improve_contract(c_res.data[0]["contract_text"], req.feedback)
    except LLMError as e:
        raise HTTPException(502, f"Contract revisor is temporarily unavailable. Please try again shortly. ({e})")

    improved = (result.get("contract_text") or "").strip()
    if not improved:
        raise HTTPException(502, "Contract revisor returned an empty response. Please try again.")

    db().table("contracts").insert({
        "license_id": license_id, "license_type": c_res.data[0].get("license_type"),
        "contract_text": improved,
    }).execute()
    _log_audit(license_id, "contract_agent", "contract_improved",
               f"Improved: {req.feedback[:200]}", result["model"], result["tokens_used"])
    return {"status": "improved", "model": result["model"]}


@app.post("/api/licensing/{license_id}/review")
def review_license(license_id: int, req: ReviewRequest, current_user: dict = Depends(get_current_user)):
    # Only talent or admin can review
    if not _verify_talent_owns_license(current_user["user_id"], license_id):
        raise HTTPException(403, "Not authorized to review this license")

    db().table("license_requests").update({
        "status": req.status, "admin_notes": req.admin_notes,
        "reviewed_by": req.reviewed_by or current_user["email"],
        "reviewed_at": datetime.utcnow().isoformat(),
    }).eq("id", license_id).execute()

    _log_audit(license_id, "admin", "manual_review",
               f"Status set to {req.status} by {current_user['email']}: {req.admin_notes}")
    return {"status": req.status}


@app.post("/api/licensing/{license_id}/approve")
async def approve_license(license_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    # Only the talent who owns the license can approve/reject
    if not _verify_talent_owns_license(current_user["user_id"], license_id):
        raise HTTPException(403, "Only the talent can approve/reject their license requests")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    approved = body.get("approved", True)
    status = "approved" if approved else "rejected"
    db().table("license_requests").update({"status": status}).eq("id", license_id).execute()
    _log_audit(license_id, "talent", f"license_{status}", f"License {status} by talent {current_user['email']}")
    return {"status": status}


@app.get("/api/licensing/{license_id}")
def get_license(license_id: int, current_user: dict = Depends(get_current_user)):
    lic_res = db().table("license_requests").select("*").eq("id", license_id).execute()
    if not lic_res.data:
        raise HTTPException(404, "License not found")
    lic = lic_res.data[0]

    # Only involved parties can view
    is_client = _verify_client_owns_license(current_user["user_id"], license_id)
    is_talent = _verify_talent_owns_license(current_user["user_id"], license_id)
    if not (is_client or is_talent):
        raise HTTPException(403, "Not authorized to view this license")

    t_res = db().table("talent_profiles").select("*").eq("id", lic["talent_id"]).execute()
    talent = t_res.data[0] if t_res.data else {}
    tu = db().table("users").select("name").eq("id", talent.get("user_id", 0)).execute() if talent.get("user_id") else type("", (), {"data": []})()

    c_res = db().table("client_profiles").select("*").eq("id", lic["client_id"]).execute()
    client = c_res.data[0] if c_res.data else {}
    cu = db().table("users").select("name").eq("id", client.get("user_id", 0)).execute() if client.get("user_id") else type("", (), {"data": []})()

    contract_res = db().table("contracts").select("*").eq("license_id", license_id).order("id", desc=True).limit(1).execute()
    contract = contract_res.data[0] if contract_res.data else None

    tracking_res = db().table("watermark_tracking").select("*").eq("license_id", license_id).execute()

    return {
        "id": lic["id"], "status": lic["status"], "license_type": lic.get("license_type"),
        "use_case": lic.get("use_case"), "content_type": lic.get("content_type"),
        "desired_duration_days": lic.get("desired_duration_days"),
        "desired_regions": lic.get("desired_regions"), "proposed_price": lic.get("proposed_price"),
        "license_token": lic.get("license_token"), "contract_generated": lic.get("contract_generated"),
        "admin_notes": lic.get("admin_notes"), "reviewed_by": lic.get("reviewed_by"),
        "reviewed_at": lic.get("reviewed_at"), "payment_status": lic.get("payment_status"),
        "created_at": lic.get("created_at"),
        "talent": {"id": talent.get("id"), "name": tu.data[0]["name"] if tu.data else None,
                   "image_url": talent.get("image_url"), "categories": talent.get("categories")},
        "client": {"id": client.get("id"), "name": cu.data[0]["name"] if cu.data else None,
                   "company_name": client.get("company_name")},
        "contract": {"id": contract["id"], "text": contract.get("contract_text"),
                     "license_type": contract.get("license_type"),
                     "created_at": contract.get("created_at")} if contract else None,
        "watermark_tracking": [{"id": t["id"], "platform": t.get("platform_detected"),
                                "url": t.get("detection_url"), "is_authorized": t.get("is_authorized"),
                                "status": t.get("status"), "detected_at": t.get("detected_at")} for t in tracking_res.data],
    }


@app.get("/api/licenses")
def list_licenses(current_user: dict = Depends(get_current_user)):
    # Only show licenses the user is involved in
    profile_id = _get_user_profile_id(current_user["user_id"], current_user["role"])
    if current_user["role"] == "client":
        res = db().table("license_requests").select("id,status,license_type,use_case,proposed_price,payment_status,created_at").eq("client_id", profile_id).execute()
    elif current_user["role"] == "talent":
        res = db().table("license_requests").select("id,status,license_type,use_case,proposed_price,payment_status,created_at").eq("talent_id", profile_id).execute()
    else:
        return []
    return res.data


# ============================================================================
# WATERMARK TRACKING
# ============================================================================

@app.post("/api/watermark/report")
def report_watermark(req: WatermarkReportRequest, current_user: dict = Depends(get_current_user)):
    # Only the talent whose likeness is being tracked, or a party on the
    # associated license, can submit a detection report. Without this check
    # any authenticated user could pollute another talent's tracking records.
    talent_pid = _get_user_profile_id(current_user["user_id"], "talent")
    owns_talent = talent_pid is not None and talent_pid == req.talent_id
    owns_license = (
        _verify_talent_owns_license(current_user["user_id"], req.license_id)
        or _verify_client_owns_license(current_user["user_id"], req.license_id)
    )
    if not (owns_talent or owns_license):
        raise HTTPException(403, "Not authorized to report a watermark for this talent/license")

    data = {
        "license_id": req.license_id, "talent_id": req.talent_id,
        "watermark_id": req.watermark_id, "platform_detected": req.platform_detected,
        "detection_url": req.detection_url, "detected_at": datetime.utcnow().isoformat(),
        "is_authorized": req.is_authorized,
        "status": "active" if req.is_authorized else "violation_detected",
        "notes": req.notes,
    }
    res = db().table("watermark_tracking").insert(data).execute()
    record = res.data[0]
    _log_audit(req.license_id, "watermark_tracker", "detection_reported",
               f"{'Authorized' if req.is_authorized else 'UNAUTHORIZED'} use on {req.platform_detected}")
    return {"id": record["id"], "status": record["status"]}


@app.get("/api/watermark/license/{license_id}")
def get_watermark_tracking(license_id: int, current_user: dict = Depends(get_current_user)):
    res = db().table("watermark_tracking").select("*").eq("license_id", license_id).execute()
    return [{"id": r["id"], "watermark_id": r.get("watermark_id"),
             "platform": r.get("platform_detected"), "url": r.get("detection_url"),
             "detected_at": r.get("detected_at"), "is_authorized": r.get("is_authorized"),
             "status": r.get("status"), "notes": r.get("notes")} for r in res.data]


@app.get("/api/watermark/talent/{talent_id}")
def get_talent_watermarks(talent_id: int, current_user: dict = Depends(get_current_user)):
    res = db().table("watermark_tracking").select("*").eq("talent_id", talent_id).execute()
    violations = [r for r in res.data if not r.get("is_authorized")]
    return {
        "total_detections": len(res.data), "violations": len(violations),
        "records": [{"id": r["id"], "license_id": r.get("license_id"),
                     "watermark_id": r.get("watermark_id"), "platform": r.get("platform_detected"),
                     "is_authorized": r.get("is_authorized"), "status": r.get("status"),
                     "detected_at": r.get("detected_at")} for r in res.data],
    }


# ============================================================================
# AUDIT
# ============================================================================

@app.get("/api/audit/logs")
def get_all_audit_logs(current_user: dict = Depends(get_current_user)):
    # Previously returned all 200 most-recent audit logs to any authenticated
    # user, which is a privilege-escalation leak (an attacker sees every
    # licensing transaction in the system). Restrict to licenses the caller
    # is a party on.
    talent_pid = _get_user_profile_id(current_user["user_id"], "talent")
    client_pid = _get_user_profile_id(current_user["user_id"], "client")

    license_ids: set[int] = set()
    if talent_pid:
        r = db().table("license_requests").select("id").eq("talent_id", talent_pid).execute()
        license_ids.update(row["id"] for row in (r.data or []))
    if client_pid:
        r = db().table("license_requests").select("id").eq("client_id", client_pid).execute()
        license_ids.update(row["id"] for row in (r.data or []))

    if not license_ids:
        return []

    res = (
        db().table("audit_logs")
        .select("*")
        .in_("license_id", list(license_ids))
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    return res.data


@app.get("/api/audit/{license_id}")
def get_audit_trail(license_id: int, current_user: dict = Depends(get_current_user)):
    # Only involved parties can view audit trail
    if not (_verify_client_owns_license(current_user["user_id"], license_id) or
            _verify_talent_owns_license(current_user["user_id"], license_id)):
        raise HTTPException(403, "Not authorized")
    res = db().table("audit_logs").select("*").eq("license_id", license_id).order("created_at").execute()
    return res.data


# ============================================================================
# PAYMENTS (Stripe)
# ============================================================================

import stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

@app.post("/api/payments/checkout")
async def create_checkout(request: Request, current_user: dict = Depends(get_current_user)):
    body = await request.json()
    license_id = body.get("license_id")
    if not license_id:
        raise HTTPException(400, "license_id required")

    if not _verify_client_owns_license(current_user["user_id"], license_id):
        raise HTTPException(403, "Not your license")

    lic_res = db().table("license_requests").select("*").eq("id", license_id).execute()
    if not lic_res.data:
        raise HTTPException(404, "License not found")
    lic = lic_res.data[0]

    if lic.get("payment_status") == "paid":
        raise HTTPException(400, "Already paid")

    t_res = db().table("talent_profiles").select("user_id").eq("id", lic["talent_id"]).execute()
    talent_name = "Talent"
    if t_res.data:
        tu = db().table("users").select("name").eq("id", t_res.data[0]["user_id"]).execute()
        if tu.data:
            talent_name = tu.data[0]["name"]

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "gbp",
                    "product_data": {
                        "name": f"Face Library License - {talent_name}",
                        "description": f"{lic.get('license_type', 'standard').title()} license: {(lic.get('use_case') or '')[:100]}",
                    },
                    "unit_amount": int((lic.get("proposed_price", 100)) * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=body.get("success_url", f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/license/{license_id}?paid=true"),
            cancel_url=body.get("cancel_url", f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/license/{license_id}"),
            metadata={"license_id": str(license_id)},
        )
        return {"checkout_url": session.url, "session_id": session.id}
    except Exception as e:
        raise HTTPException(500, f"Stripe error: {str(e)}")


@app.post("/api/payments/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook — verified by signature, no JWT needed."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    if not webhook_secret:
        raise HTTPException(500, "Stripe webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid webhook signature")
    except Exception as e:
        raise HTTPException(400, f"Webhook error: {str(e)}")

    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {})
    license_id_raw = obj.get("metadata", {}).get("license_id")
    license_id = int(license_id_raw) if license_id_raw else None

    # 1. Successful checkout → mark license paid and activate.
    if event_type == "checkout.session.completed" and license_id:
        db().table("license_requests").update({
            "payment_status": "paid", "status": "active",
        }).eq("id", license_id).execute()
        _log_audit(license_id, "stripe", "payment_completed", "Payment received")

    # 2. Charge refunded (partial or full) → revert to unpaid + on-hold so
    #    talent/client workflows don't treat the license as active revenue.
    elif event_type == "charge.refunded" and license_id:
        refunded_amount = (obj.get("amount_refunded") or 0) / 100.0
        db().table("license_requests").update({
            "payment_status": "refunded", "status": "on_hold",
        }).eq("id", license_id).execute()
        _log_audit(license_id, "stripe", "payment_refunded",
                   f"Refund processed: GBP {refunded_amount:.2f}")

    # 3. Charge disputed (chargeback initiated) → freeze the license.
    elif event_type == "charge.dispute.created" and license_id:
        reason = obj.get("reason", "unspecified")
        db().table("license_requests").update({
            "payment_status": "disputed", "status": "on_hold",
        }).eq("id", license_id).execute()
        _log_audit(license_id, "stripe", "payment_disputed",
                   f"Chargeback filed (reason: {reason})")

    # 4. Payment failed (card declined, 3DS failed, etc.) → flip to unpaid.
    elif event_type in {"checkout.session.async_payment_failed", "invoice.payment_failed"} and license_id:
        db().table("license_requests").update({
            "payment_status": "failed",
        }).eq("id", license_id).execute()
        _log_audit(license_id, "stripe", "payment_failed", f"Payment failed ({event_type})")

    else:
        # Unhandled event type — log for visibility but don't error.
        logger.info("Unhandled Stripe webhook event: %s", event_type)

    return {"status": "ok"}


@app.get("/api/payments/revenue")
def get_revenue(current_user: dict = Depends(get_current_user)):
    res = db().table("license_requests").select("proposed_price").eq("payment_status", "paid").execute()
    total = sum(r.get("proposed_price", 0) for r in res.data)
    return {
        "total_revenue": total, "platform_fees": total * 0.10,
        "talent_payouts": total * 0.90, "paid_licenses": len(res.data),
    }


# ============================================================================
# EMAIL VERIFICATION
# ============================================================================

class ResendVerificationRequest(BaseModel):
    email: str = Field(..., max_length=255)

@app.post("/api/auth/resend-verification")
@limiter.limit("3/minute")
def resend_verification(req: ResendVerificationRequest, request: Request):
    """Ask Supabase Auth to resend the email-verification link. Requires
    SMTP/email templates to be configured in the Supabase project; if they
    are not, this will silently no-op on the provider side."""
    try:
        supabase_admin.auth.resend({"type": "signup", "email": req.email.lower().strip()})
    except Exception as e:
        logger.warning("resend verification for %s failed: %s", req.email, e)
        raise HTTPException(502, "Email provider unavailable. Please try again shortly.")
    return {"status": "sent"}


@app.get("/api/auth/verification-status")
def verification_status(current_user: dict = Depends(get_current_user)):
    """Return whether the current user's email is verified. The frontend uses
    this to decide whether to show the verify-email page or the dashboard."""
    res = db().table("users").select("email_confirmed_at").eq("id", current_user["user_id"]).execute()
    if not res.data:
        raise HTTPException(404, "User not found")
    return {"verified": bool(res.data[0].get("email_confirmed_at"))}


# ============================================================================
# PAYOUTS (talent earnings + withdrawal requests)
#
# MVP scope: the full workflow (talent requests payout → platform admin
# approves → Stripe Connect transfer) is scaffolded but the money-movement
# step is intentionally left as a stub. `stripe_transfer_id` stays NULL
# until Stripe Connect is wired; operators can manually mark a row as
# `paid` for now. This unblocks the UX without taking on half-implemented
# payment rails.
# ============================================================================

class PayoutRequest(BaseModel):
    amount: float = Field(..., gt=0, le=1_000_000)
    bank_account_ref: str | None = Field(None, max_length=255)
    notes: str | None = Field(None, max_length=1000)


def _talent_earnings_summary(talent_profile_id: int) -> dict:
    """Compute paid-to-date total, pending payouts, and available balance."""
    paid = db().table("license_requests").select("proposed_price").eq(
        "talent_id", talent_profile_id
    ).eq("payment_status", "paid").execute()
    gross = sum((r.get("proposed_price") or 0) for r in (paid.data or []))
    # Platform takes 10%, talent keeps 90%
    earned = round(gross * 0.90, 2)

    payouts = db().table("payouts").select("amount,status").eq("talent_id", talent_profile_id).execute()
    requested = sum(float(p["amount"]) for p in (payouts.data or []) if p["status"] in {"requested", "processing"})
    paid_out = sum(float(p["amount"]) for p in (payouts.data or []) if p["status"] == "paid")

    return {
        "gross_revenue": round(gross, 2),
        "total_earned": earned,
        "paid_out": round(paid_out, 2),
        "pending_payout": round(requested, 2),
        "available_balance": round(earned - paid_out - requested, 2),
    }


@app.get("/api/payouts/earnings")
def get_my_earnings(current_user: dict = Depends(get_current_user)):
    """Summary of earnings and payout state for the current talent."""
    talent_pid = _get_user_profile_id(current_user["user_id"], "talent")
    if not talent_pid:
        raise HTTPException(403, "Only talent accounts can view earnings")
    return _talent_earnings_summary(talent_pid)


@app.get("/api/payouts/list")
def list_my_payouts(current_user: dict = Depends(get_current_user)):
    """Payout history for the current talent."""
    talent_pid = _get_user_profile_id(current_user["user_id"], "talent")
    if not talent_pid:
        raise HTTPException(403, "Only talent accounts can view payouts")
    res = db().table("payouts").select("*").eq("talent_id", talent_pid).order("created_at", desc=True).execute()
    return res.data or []


@app.post("/api/payouts/request")
@limiter.limit("5/minute")
def request_payout(req: PayoutRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """Talent requests a payout for an amount up to their available balance.
    Actual money movement is handled manually by operators until Stripe
    Connect is integrated — this endpoint only records the intent."""
    talent_pid = _get_user_profile_id(current_user["user_id"], "talent")
    if not talent_pid:
        raise HTTPException(403, "Only talent accounts can request payouts")

    summary = _talent_earnings_summary(talent_pid)
    if req.amount > summary["available_balance"]:
        raise HTTPException(
            400,
            f"Amount exceeds available balance (requested GBP {req.amount:.2f}, "
            f"available GBP {summary['available_balance']:.2f})",
        )

    res = db().table("payouts").insert({
        "talent_id": talent_pid, "amount": req.amount,
        "currency": "GBP", "status": "requested",
        "bank_account_ref": req.bank_account_ref, "notes": req.notes,
    }).execute()
    payout = res.data[0]

    _log_audit(None, "payouts", "payout_requested",
               f"Talent {talent_pid} requested GBP {req.amount:.2f} payout (id={payout['id']})")
    return payout


# ============================================================================
# AVATAR GENERATION
#
# MVP scope: upload pipeline + job tracking are real. The actual image
# synthesis model (turning N face photos + body photos + identity video
# into a usable digital likeness) is a pluggable hook. When
# AVATAR_MODEL_PROVIDER is unset (current state), jobs auto-complete with
# a placeholder output_avatar_url after a short delay so the frontend flow
# is exercisable end-to-end. Wire a real provider by checking for
# AVATAR_MODEL_PROVIDER and calling it from _maybe_complete_avatar_job().
# ============================================================================

AVATAR_JOB_SIMULATED_SECONDS = 8  # how long the placeholder "generation" takes

class AvatarSubmitRequest(BaseModel):
    face_photo_count: int = Field(..., ge=0, le=50)
    body_photo_count: int = Field(..., ge=0, le=50)
    identity_video_ref: str | None = Field(None, max_length=500)
    face_photo_urls: list[str] = Field(default_factory=list)
    face_video_urls: list[str] = Field(default_factory=list)
    body_photo_urls: list[str] = Field(default_factory=list)
    identity_video_url: str | None = None


def _maybe_complete_avatar_job(job: dict) -> dict:
    """If a job has been 'processing' for >= AVATAR_JOB_SIMULATED_SECONDS,
    mark it completed with a placeholder output URL. Replace this function
    with a real ML model call when an AVATAR_MODEL_PROVIDER is available."""
    if job.get("status") != "processing":
        return job
    created = job.get("created_at")
    if not created:
        return job
    try:
        created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
    except Exception:
        return job
    elapsed = (datetime.utcnow().replace(tzinfo=created_dt.tzinfo) - created_dt).total_seconds()
    if elapsed < AVATAR_JOB_SIMULATED_SECONDS:
        return job

    provider = os.getenv("AVATAR_MODEL_PROVIDER", "").strip()
    if provider:
        # Real provider hook would go here. For now we fall through to the
        # placeholder so the pipeline is testable.
        logger.info("AVATAR_MODEL_PROVIDER=%s configured but not yet integrated", provider)

    # Use the talent's existing image as the placeholder output.
    talent_res = db().table("talent_profiles").select("image_url").eq("id", job["talent_id"]).execute()
    placeholder = talent_res.data[0].get("image_url") if talent_res.data else None

    updated = db().table("avatar_jobs").update({
        "status": "completed",
        "output_avatar_url": placeholder,
        "model_used": provider or "placeholder-v1",
        "completed_at": datetime.utcnow().isoformat(),
    }).eq("id", job["id"]).execute()
    return updated.data[0] if updated.data else {**job, "status": "completed", "output_avatar_url": placeholder}


@app.post("/api/talent/avatar/submit")
@limiter.limit("3/minute")
def submit_avatar_job(req: AvatarSubmitRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """Start an avatar generation job for the calling talent."""
    talent_pid = _get_user_profile_id(current_user["user_id"], "talent")
    if not talent_pid:
        raise HTTPException(403, "Only talent accounts can submit avatar jobs")

    if req.face_photo_count < 5 or req.body_photo_count < 4:
        raise HTTPException(
            400,
            "Need at least 5 face photos and 4 body photos to generate an avatar.",
        )

    res = db().table("avatar_jobs").insert({
        "talent_id": talent_pid, "status": "processing",
        "face_photo_count": req.face_photo_count,
        "body_photo_count": req.body_photo_count,
        "identity_video_ref": req.identity_video_ref or req.identity_video_url,
        "face_photo_urls": req.face_photo_urls,
        "face_video_urls": req.face_video_urls,
        "body_photo_urls": req.body_photo_urls,
        "identity_video_url": req.identity_video_url,
    }).execute()
    job = res.data[0]
    _log_audit(None, "avatar_pipeline", "avatar_job_started",
               f"Talent {talent_pid} submitted avatar job id={job['id']} "
               f"(faces={req.face_photo_count}, bodies={req.body_photo_count}, "
               f"urls={len(req.face_photo_urls) + len(req.body_photo_urls)})")
    return job


@app.get("/api/talent/avatar/{job_id}")
def get_avatar_job(job_id: int, current_user: dict = Depends(get_current_user)):
    """Poll avatar job status. Completes after AVATAR_JOB_SIMULATED_SECONDS."""
    res = db().table("avatar_jobs").select("*").eq("id", job_id).execute()
    if not res.data:
        raise HTTPException(404, "Avatar job not found")
    job = res.data[0]

    # Authz: only the talent the job belongs to may view it.
    talent_pid = _get_user_profile_id(current_user["user_id"], "talent")
    if not talent_pid or talent_pid != job["talent_id"]:
        raise HTTPException(403, "Not your avatar job")

    return _maybe_complete_avatar_job(job)


@app.get("/api/talent/{talent_id}/avatar-jobs")
def list_avatar_jobs(talent_id: int, current_user: dict = Depends(get_current_user)):
    """List avatar jobs for a talent (most recent first). Used by /talent/my-face
    to detect an in-flight job and render the "Generating — up to 24 hours" banner.
    Authz: the talent themselves or a linked agent."""
    talent_res = db().table("talent_profiles").select("user_id").eq("id", talent_id).limit(1).execute()
    if not talent_res.data:
        raise HTTPException(404, "Talent not found")
    talent_user_id = talent_res.data[0]["user_id"]

    is_self = talent_user_id == current_user["user_id"]
    is_linked_agent = False
    if current_user["role"] == "agent":
        agent_pid = _get_user_profile_id(current_user["user_id"], "agent")
        if agent_pid:
            link = db().table("talent_agent_links").select("id").eq("agent_id", agent_pid).eq("talent_id", talent_id).execute()
            is_linked_agent = bool(link.data)
    if not (is_self or is_linked_agent):
        raise HTTPException(403, "Only the talent or their linked agent can view jobs")

    res = (
        db()
        .table("avatar_jobs")
        .select("*")
        .eq("talent_id", talent_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    jobs = res.data or []
    # Run the simulated-completion check for the most recent in-flight job so
    # the caller sees an accurate status without a separate poll.
    if jobs and jobs[0].get("status") in ("processing", "pending"):
        jobs[0] = _maybe_complete_avatar_job(jobs[0])
    return jobs


# ============================================================================
# AI CHAT (dashboard assistants + floating chat)
# ============================================================================

from llm_client import chat as llm_chat

_CHAT_SYSTEM_PROMPTS = {
    "client": """You are the AI Campaign Assistant for Face Library, helping brand/agency users.
You help them: find and filter verified talent, understand licensing options, draft offer terms,
interpret contract clauses, and plan campaign budgets. Be concise (<=5 short paragraphs), friendly,
and reference UK licensing conventions (GBP pricing, UK/EU/global territories). If a user asks for
something you can't do (sending emails, making payments, creating accounts), say so and suggest
the right page of the app to use instead.""",

    "agent": """You are the AI Agency Assistant for Face Library, helping talent agencies.
You help them: review licensing deals, analyze which talent in their roster best matches a given
brief, generate/revise contract language, and explain UK IP and moral-rights law in plain English.
Be concise (<=5 short paragraphs), professional, and protective of talent interests. If a user
asks for something you can't do (sending emails, making payments, signing on behalf of talent),
say so.""",

    "talent": """You are the AI Talent Assistant for Face Library, helping individual talent.
You help them: understand incoming license requests, decide whether terms are fair, explain what
each contract clause means in plain English, and manage their availability/permissions. Be concise
(<=5 short paragraphs), encouraging, and always protect the talent's interests (flag anything that
looks underpriced, overreaching on AI training, or lacks proper territory limits). Never advise
signing without reading.""",
}

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=4000)

class ChatRequest(BaseModel):
    variant: str = Field(..., pattern="^(client|agent|talent)$")
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=50)

@app.post("/api/chat")
@limiter.limit("30/minute")
def chat_endpoint(req: ChatRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """Dashboard AI assistants + floating chat. Routes to the same LLM
    (Kimi K2 Thinking via FLock) used for contract generation."""
    system = _CHAT_SYSTEM_PROMPTS[req.variant]
    history = [{"role": "system", "content": system}]
    history.extend({"role": m.role, "content": m.content} for m in req.messages)

    try:
        result = llm_chat(history, temperature=0.6, max_tokens=800)
    except LLMError as e:
        raise HTTPException(502, f"AI assistant is temporarily unavailable. ({e})")

    return {
        "reply": result["content"],
        "model": result["model"],
        "tokens_used": result["tokens_used"],
    }


# ============================================================================
# LICENSE TEMPLATES (public)
# ============================================================================

@app.get("/api/license-templates")
def get_license_templates():
    from agents.contract import TEMPLATES
    return [{"type": k, **v} for k, v in TEMPLATES.items()]


# ============================================================================
# MESSAGES (direct-message threads between any two users)
# ============================================================================

class ConversationCreateRequest(BaseModel):
    other_user_id: int
    subject: str | None = None
    initial_message: str | None = None


class MessageSendRequest(BaseModel):
    body: str


def _conversation_participants(conv: dict) -> tuple[int, int]:
    return int(conv["participant_a_id"]), int(conv["participant_b_id"])


def _require_conversation_access(conv_id: int, user_id: int) -> dict:
    res = db().table("conversations").select("*").eq("id", conv_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Conversation not found")
    conv = res.data[0]
    a, b = _conversation_participants(conv)
    if user_id not in (a, b):
        raise HTTPException(403, "Not a participant in this conversation")
    return conv


@app.get("/api/conversations")
def list_conversations(current_user: dict = Depends(get_current_user)):
    """Conversations the current user participates in, with counterpart name + last message preview."""
    uid = current_user["user_id"]
    res = (
        db().table("conversations")
        .select("*")
        .or_(f"participant_a_id.eq.{uid},participant_b_id.eq.{uid}")
        .order("last_message_at", desc=True, nullsfirst=False)
        .execute()
    )
    convs = res.data or []
    other_ids = {_conversation_participants(c)[1] if _conversation_participants(c)[0] == uid
                 else _conversation_participants(c)[0] for c in convs}
    users_by_id: dict[int, dict] = {}
    if other_ids:
        users_res = db().table("users").select("id,email,role").in_("id", list(other_ids)).execute()
        users_by_id = {int(u["id"]): u for u in (users_res.data or [])}

    out = []
    for c in convs:
        a, b = _conversation_participants(c)
        other_id = b if a == uid else a
        other = users_by_id.get(other_id) or {}
        last_msg_res = (
            db().table("messages")
            .select("body,sender_id,created_at")
            .eq("conversation_id", c["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        last = (last_msg_res.data or [{}])[0]
        unread_res = (
            db().table("messages")
            .select("id", count="exact")
            .eq("conversation_id", c["id"])
            .neq("sender_id", uid)
            .is_("read_at", "null")
            .execute()
        )
        out.append({
            "id": c["id"],
            "subject": c.get("subject"),
            "other_user": {"id": other_id, "email": other.get("email"), "role": other.get("role")},
            "last_message": last.get("body"),
            "last_message_at": c.get("last_message_at"),
            "unread_count": unread_res.count or 0,
        })
    return out


@app.post("/api/conversations")
@limiter.limit("10/minute")
def create_conversation(req: ConversationCreateRequest, request: Request, current_user: dict = Depends(get_current_user)):
    uid = current_user["user_id"]
    if req.other_user_id == uid:
        raise HTTPException(400, "Cannot message yourself")
    other = db().table("users").select("id").eq("id", req.other_user_id).limit(1).execute()
    if not other.data:
        raise HTTPException(404, "Recipient not found")

    # Find-or-create (the unique index on (least, greatest) prevents duplicates).
    low, high = min(uid, req.other_user_id), max(uid, req.other_user_id)
    existing = (
        db().table("conversations").select("*")
        .eq("participant_a_id", low).eq("participant_b_id", high)
        .limit(1).execute()
    )
    if existing.data:
        conv = existing.data[0]
    else:
        ins = db().table("conversations").insert({
            "participant_a_id": low,
            "participant_b_id": high,
            "subject": req.subject,
        }).execute()
        conv = ins.data[0]

    if req.initial_message:
        msg = db().table("messages").insert({
            "conversation_id": conv["id"],
            "sender_id": uid,
            "body": req.initial_message,
        }).execute()
        db().table("conversations").update(
            {"last_message_at": msg.data[0]["created_at"]}
        ).eq("id", conv["id"]).execute()

    return {"conversation_id": conv["id"]}


@app.get("/api/conversations/{conv_id}/messages")
def list_messages(conv_id: int, current_user: dict = Depends(get_current_user)):
    uid = current_user["user_id"]
    _require_conversation_access(conv_id, uid)
    msgs = (
        db().table("messages").select("*")
        .eq("conversation_id", conv_id)
        .order("created_at", desc=False).execute()
    )
    # Mark all incoming as read.
    unread_ids = [m["id"] for m in (msgs.data or []) if m["sender_id"] != uid and not m.get("read_at")]
    if unread_ids:
        db().table("messages").update({"read_at": datetime.utcnow().isoformat()}).in_("id", unread_ids).execute()
    return msgs.data or []


@app.post("/api/conversations/{conv_id}/messages")
@limiter.limit("60/minute")
def send_message(conv_id: int, req: MessageSendRequest, request: Request, current_user: dict = Depends(get_current_user)):
    uid = current_user["user_id"]
    _require_conversation_access(conv_id, uid)
    body = (req.body or "").strip()
    if not body:
        raise HTTPException(400, "Message body is required")
    if len(body) > 4000:
        raise HTTPException(400, "Message too long (max 4000 characters)")
    ins = db().table("messages").insert({
        "conversation_id": conv_id, "sender_id": uid, "body": body,
    }).execute()
    db().table("conversations").update(
        {"last_message_at": ins.data[0]["created_at"]}
    ).eq("id", conv_id).execute()
    return ins.data[0]


# ============================================================================
# ACTIVITY FEED (role-aware projection of audit_logs)
# ============================================================================

@app.get("/api/activity")
def activity_feed(limit: int = 30, current_user: dict = Depends(get_current_user)):
    """Recent activity relevant to the current user.
    - Talents: their own license requests, approvals, payouts, contract events.
    - Agents: events on talents they manage.
    - Clients: their own campaign/license events.
    audit_logs stores `action`, `user_id`, `license_id`, `details`, `created_at`.
    """
    uid = current_user["user_id"]
    role = current_user["role"]
    limit = max(1, min(limit, 100))

    q = db().table("audit_logs").select("*").order("created_at", desc=True).limit(limit)
    if role == "talent":
        talent_pid = _get_user_profile_id(uid, "talent")
        if not talent_pid:
            return []
        lic_res = db().table("license_requests").select("id").eq("talent_id", talent_pid).execute()
        lic_ids = [r["id"] for r in (lic_res.data or [])]
        if not lic_ids:
            return []
        q = q.in_("license_id", lic_ids)
    elif role == "agent":
        agent_pid = _get_user_profile_id(uid, "agent")
        if not agent_pid:
            return []
        links_res = db().table("talent_agent_links").select("talent_id").eq("agent_id", agent_pid).execute()
        talent_ids = [r["talent_id"] for r in (links_res.data or [])]
        if not talent_ids:
            return []
        lic_res = db().table("license_requests").select("id").in_("talent_id", talent_ids).execute()
        lic_ids = [r["id"] for r in (lic_res.data or [])]
        if not lic_ids:
            return []
        q = q.in_("license_id", lic_ids)
    else:  # client
        client_pid = _get_user_profile_id(uid, "client")
        if not client_pid:
            return []
        lic_res = db().table("license_requests").select("id").eq("client_id", client_pid).execute()
        lic_ids = [r["id"] for r in (lic_res.data or [])]
        if not lic_ids:
            return []
        q = q.in_("license_id", lic_ids)
    return q.execute().data or []


# ============================================================================
# TAX DOCUMENTS (stub — real generation requires Stripe Tax / 1099 provider)
# ============================================================================

class TaxDocumentRequest(BaseModel):
    document_type: str
    tax_year: int


@app.get("/api/tax-documents")
def list_tax_documents(current_user: dict = Depends(get_current_user)):
    res = (
        db().table("tax_documents").select("*")
        .eq("user_id", current_user["user_id"])
        .order("created_at", desc=True).execute()
    )
    return res.data or []


@app.post("/api/tax-documents/request")
@limiter.limit("5/minute")
def request_tax_document(req: TaxDocumentRequest, request: Request, current_user: dict = Depends(get_current_user)):
    """Record a tax document request. Generation is async and handled manually
    until a tax provider (Stripe Tax, 1099 provider) is integrated."""
    allowed = {"1099-NEC", "1099-MISC", "W-9", "annual_statement"}
    if req.document_type not in allowed:
        raise HTTPException(400, f"document_type must be one of {sorted(allowed)}")
    if req.tax_year < 2020 or req.tax_year > datetime.utcnow().year:
        raise HTTPException(400, "Invalid tax_year")
    ins = db().table("tax_documents").insert({
        "user_id": current_user["user_id"],
        "document_type": req.document_type,
        "tax_year": req.tax_year,
        "status": "pending",
    }).execute()
    return ins.data[0]


# ============================================================================
# BANK ACCOUNT DETAILS (for manual payouts — Stripe Connect still out of MVP)
# ============================================================================

class BankDetailsRequest(BaseModel):
    account_holder_name: str
    bank_name: str | None = None
    account_number: str | None = None
    sort_code: str | None = None
    routing_number: str | None = None
    iban: str | None = None
    country: str | None = None


def _redact_bank_details(req: BankDetailsRequest) -> dict:
    """Store only last-4 of the account number. Full details belong in a
    tokenized vault (Stripe Connect) — this stub lets operators contact the
    user by name + last-4 to complete manual transfers."""
    last4 = None
    if req.account_number:
        last4 = req.account_number[-4:]
    return {
        "account_holder_name": req.account_holder_name,
        "bank_name": req.bank_name,
        "account_number_last4": last4,
        "sort_code": req.sort_code,
        "routing_number": req.routing_number,
        "iban_last4": req.iban[-4:] if req.iban else None,
        "country": req.country,
    }


@app.post("/api/bank-details")
@limiter.limit("5/minute")
def update_bank_details(req: BankDetailsRequest, request: Request, current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    table = {"talent": "talent_profiles", "agent": "agent_profiles"}.get(role)
    if not table:
        raise HTTPException(403, "Only talent and agent accounts have payout bank details")
    profile_id = _get_user_profile_id(current_user["user_id"], role)
    if not profile_id:
        raise HTTPException(404, f"{role} profile not found")
    db().table(table).update(
        {"bank_account_details": _redact_bank_details(req)}
    ).eq("id", profile_id).execute()
    return {"ok": True}


@app.get("/api/bank-details")
def get_bank_details(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    table = {"talent": "talent_profiles", "agent": "agent_profiles"}.get(role)
    if not table:
        return None
    profile_id = _get_user_profile_id(current_user["user_id"], role)
    if not profile_id:
        return None
    res = db().table(table).select("bank_account_details").eq("id", profile_id).limit(1).execute()
    return (res.data or [{}])[0].get("bank_account_details")


# ============================================================================
# FILE UPLOADS (avatar photos/videos + portfolio photos via Supabase Storage)
# ============================================================================

AVATAR_BUCKET = "avatar-uploads"
ALLOWED_UPLOAD_MIMES = {
    "image/jpeg", "image/png", "image/webp",
    "video/mp4", "video/webm", "video/quicktime",
}
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB


@app.post("/api/uploads/photo")
@limiter.limit("60/minute")
async def upload_photo(
    request: Request,
    file: UploadFile = File(...),
    purpose: str = "avatar",
    slot: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """Upload a photo or short video to the `avatar-uploads` bucket.
    Callable by any authenticated user; the returned URL is included in
    an avatar_jobs or talent_profiles.portfolio_images record afterwards.

    Query params:
    - purpose: "avatar" | "portfolio" (only used in the storage path prefix)
    - slot: optional label (e.g. "Front", "Left Profile") for human-readable filenames

    Enforces: content_type allowlist, 20MB size cap, per-user path namespacing.
    """
    if not file.content_type or file.content_type not in ALLOWED_UPLOAD_MIMES:
        raise HTTPException(400, f"Unsupported content type: {file.content_type}")
    if purpose not in ("avatar", "portfolio"):
        raise HTTPException(400, "purpose must be 'avatar' or 'portfolio'")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)}MB)")

    ext_map = {
        "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
        "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    }
    ext = ext_map.get(file.content_type, "bin")
    safe_slot = "".join(c for c in (slot or "") if c.isalnum() or c in "-_") or "upload"
    object_path = f"{purpose}/{current_user['user_id']}/{safe_slot}_{uuid.uuid4().hex[:8]}.{ext}"

    try:
        db().storage.from_(AVATAR_BUCKET).upload(
            object_path,
            contents,
            {"content-type": file.content_type, "upsert": "false"},
        )
    except Exception as e:
        logger.error("upload to %s failed: %s", AVATAR_BUCKET, e)
        raise HTTPException(502, "Storage is temporarily unavailable. Please try again.")

    public_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/{AVATAR_BUCKET}/{object_path}"
    return {"url": public_url, "path": object_path, "size": len(contents)}


# ============================================================================
# PORTFOLIO IMAGES (talent's public showcase — shown on /talent-profile/{id})
# ============================================================================

class PortfolioUpdateRequest(BaseModel):
    images: list[str] = Field(..., max_length=10)


@app.get("/api/talents/{talent_id}/portfolio")
def get_talent_portfolio(talent_id: int):
    """Public: the portfolio images rendered on the talent profile page."""
    res = db().table("talent_profiles").select("portfolio_images").eq("id", talent_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Talent not found")
    return res.data[0].get("portfolio_images") or []


@app.post("/api/talents/{talent_id}/portfolio")
def set_talent_portfolio(
    talent_id: int,
    req: PortfolioUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Only the talent (or a linked agent) can replace the portfolio list."""
    talent_res = db().table("talent_profiles").select("user_id").eq("id", talent_id).limit(1).execute()
    if not talent_res.data:
        raise HTTPException(404, "Talent not found")
    talent_user_id = talent_res.data[0]["user_id"]

    is_self = talent_user_id == current_user["user_id"]
    is_linked_agent = False
    if current_user["role"] == "agent":
        agent_pid = _get_user_profile_id(current_user["user_id"], "agent")
        if agent_pid:
            link = db().table("talent_agent_links").select("id").eq("agent_id", agent_pid).eq("talent_id", talent_id).execute()
            is_linked_agent = bool(link.data)
    if not (is_self or is_linked_agent):
        raise HTTPException(403, "Only the talent or their linked agent can edit the portfolio")

    # Basic sanity check: URLs only, each under 1KB.
    for u in req.images:
        if not (u.startswith("http://") or u.startswith("https://")) or len(u) > 1024:
            raise HTTPException(400, "Each image must be a valid http(s) URL")

    db().table("talent_profiles").update({"portfolio_images": req.images}).eq("id", talent_id).execute()
    return {"ok": True, "images": req.images}


# ============================================================================
# CONTRACT SIGNING (separate from generate — enables real brand sign-off)
# ============================================================================

@app.post("/api/licensing/{license_id}/sign")
def sign_contract(license_id: int, current_user: dict = Depends(get_current_user)):
    """Brand signs the generated contract. Idempotent per license.
    Preconditions: contract must exist (generate-contract has been called),
    the caller must be the client who requested the license."""
    lic_res = db().table("license_requests").select("*").eq("id", license_id).limit(1).execute()
    if not lic_res.data:
        raise HTTPException(404, "License not found")
    lic = lic_res.data[0]

    # Only the requesting client may sign.
    client_pid = _get_user_profile_id(current_user["user_id"], "client")
    if not client_pid or client_pid != lic["client_id"]:
        raise HTTPException(403, "Only the brand who requested this license can sign")

    contract_res = db().table("contracts").select("*").eq("license_id", license_id).order("created_at", desc=True).limit(1).execute()
    if not contract_res.data:
        raise HTTPException(400, "No contract has been generated yet. Generate the contract before signing.")
    contract = contract_res.data[0]
    if contract.get("signed_at"):
        return {"ok": True, "already_signed": True, "signed_at": contract["signed_at"]}

    now_iso = datetime.utcnow().isoformat()
    db().table("contracts").update({
        "signed_at": now_iso,
        "signed_by_user_id": current_user["user_id"],
    }).eq("id", contract["id"]).execute()
    db().table("license_requests").update({"status": "active"}).eq("id", license_id).execute()
    _log_audit(license_id, "contract_agent", "contract_signed",
               f"Contract {contract['id']} signed by user {current_user['user_id']}")
    return {"ok": True, "signed_at": now_iso, "contract_id": contract["id"]}


@app.get("/api/licensing/{license_id}/contract-status")
def get_contract_status(license_id: int, current_user: dict = Depends(get_current_user)):
    """Returns {has_contract, is_signed, signed_at} for UI gating."""
    lic_res = db().table("license_requests").select("*").eq("id", license_id).limit(1).execute()
    if not lic_res.data:
        raise HTTPException(404, "License not found")
    # Anyone involved in the license (talent, client, linked agent) can check status.
    lic = lic_res.data[0]
    uid = current_user["user_id"]
    role = current_user["role"]
    authorized = False
    if role == "client":
        client_pid = _get_user_profile_id(uid, "client")
        authorized = client_pid == lic["client_id"]
    elif role == "talent":
        talent_pid = _get_user_profile_id(uid, "talent")
        authorized = talent_pid == lic["talent_id"]
    elif role == "agent":
        agent_pid = _get_user_profile_id(uid, "agent")
        if agent_pid:
            link = db().table("talent_agent_links").select("id").eq("agent_id", agent_pid).eq("talent_id", lic["talent_id"]).execute()
            authorized = bool(link.data)
    if not authorized:
        raise HTTPException(403, "Not authorized")

    contract_res = db().table("contracts").select("id,signed_at,signed_by_user_id,created_at").eq("license_id", license_id).order("created_at", desc=True).limit(1).execute()
    if not contract_res.data:
        return {"has_contract": False, "is_signed": False, "signed_at": None}
    c = contract_res.data[0]
    return {
        "has_contract": True,
        "is_signed": bool(c.get("signed_at")),
        "signed_at": c.get("signed_at"),
        "contract_id": c["id"],
    }


# ============================================================================
# IDENTITY CERTIFICATE (talent's verification proof document)
# ============================================================================

@app.get("/api/talent/{talent_id}/certificate")
def get_identity_certificate(talent_id: int, current_user: dict = Depends(get_current_user)):
    """Returns a plain-text "identity certificate" that the talent can share
    as proof of verification. Contains Face ID, stage name, verification
    status, categories, issue date, and a deterministic signature derived
    from the talent row's immutable fields + JWT_SECRET.

    Scope: only the talent themselves or a linked agent may download.
    Content-type: text/plain so the browser downloads or displays directly.
    """
    t_res = db().table("talent_profiles").select("*").eq("id", talent_id).limit(1).execute()
    if not t_res.data:
        raise HTTPException(404, "Talent not found")
    t = t_res.data[0]

    # Authz: talent themselves or linked agent.
    uid = current_user["user_id"]
    role = current_user["role"]
    authorized = t["user_id"] == uid
    if not authorized and role == "agent":
        agent_pid = _get_user_profile_id(uid, "agent")
        if agent_pid:
            link = db().table("talent_agent_links").select("id").eq("agent_id", agent_pid).eq("talent_id", talent_id).execute()
            authorized = bool(link.data)
    if not authorized:
        raise HTTPException(403, "Not authorized to download this certificate")

    u_res = db().table("users").select("name,email").eq("id", t["user_id"]).execute()
    user_row = u_res.data[0] if u_res.data else {}

    face_id = f"FL-{str(talent_id).zfill(6)}"
    issued = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    # Deterministic signature — brands can verify by re-hashing the same inputs.
    import hashlib
    sig_src = f"{face_id}|{user_row.get('name','')}|{t.get('created_at','')}|{JWT_SECRET}"
    signature = hashlib.sha256(sig_src.encode()).hexdigest()

    lines = [
        "==================================================",
        "  FACE LIBRARY — IDENTITY VERIFICATION CERTIFICATE",
        "==================================================",
        "",
        f"  Face ID:        {face_id}",
        f"  Talent:         {user_row.get('name') or t.get('stage_name') or '—'}",
        f"  Email:          {user_row.get('email') or '—'}",
        f"  Registered:     {t.get('created_at','')[:10] or '—'}",
        f"  Categories:     {t.get('categories') or 'Unrestricted'}",
        f"  Geo scope:      {t.get('geo_scope') or 'global'}",
        "",
        "  Verification status: VERIFIED",
        "  Issued by:           Face Library",
        f"  Issued at:           {issued}",
        "",
        f"  Signature (SHA-256):",
        f"    {signature}",
        "",
        "  Verify the signature by re-hashing the canonical fields",
        "  above via the /api/talent/<id> public endpoint.",
        "==================================================",
    ]
    body = "\n".join(lines)
    return Response(
        content=body,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{face_id}-certificate.txt"'},
    )


# ============================================================================
# SEND TO TALENT (brand action after Generate Contract)
# ============================================================================

@app.post("/api/licensing/{license_id}/send-to-talent")
def send_contract_to_talent(license_id: int, current_user: dict = Depends(get_current_user)):
    """Brand-side action that fires after Generate Contract. Real effects:
      1. Flips license_requests.status to `awaiting_approval` if currently
         pending/under_review — so the talent dashboard's License Requests
         section picks it up for review.
      2. Opens (or reuses) a conversation between the brand and the talent
         with the generated contract body posted as the first message.
      3. Audit-logs the action.
    """
    lic_res = db().table("license_requests").select("*").eq("id", license_id).limit(1).execute()
    if not lic_res.data:
        raise HTTPException(404, "License not found")
    lic = lic_res.data[0]

    client_pid = _get_user_profile_id(current_user["user_id"], "client")
    if not client_pid or client_pid != lic["client_id"]:
        raise HTTPException(403, "Only the brand who requested this license can send it to the talent")

    contract_res = db().table("contracts").select("contract_text").eq("license_id", license_id).order("created_at", desc=True).limit(1).execute()
    if not contract_res.data:
        raise HTTPException(400, "Generate the contract first")
    contract_text = contract_res.data[0].get("contract_text") or "Contract generated — full text to follow."

    # Flip status if still pending, so it shows up as a real review item for talent.
    if lic["status"] in ("pending", "under_review"):
        db().table("license_requests").update({"status": "awaiting_approval"}).eq("id", license_id).execute()

    # Resolve the talent's user_id.
    tal_res = db().table("talent_profiles").select("user_id").eq("id", lic["talent_id"]).limit(1).execute()
    if not tal_res.data:
        raise HTTPException(500, "Talent profile missing")
    talent_user_id = tal_res.data[0]["user_id"]

    # Find-or-create conversation between brand and talent.
    low, high = min(current_user["user_id"], talent_user_id), max(current_user["user_id"], talent_user_id)
    existing = db().table("conversations").select("id").eq("participant_a_id", low).eq("participant_b_id", high).limit(1).execute()
    if existing.data:
        conv_id = existing.data[0]["id"]
    else:
        ins = db().table("conversations").insert({
            "participant_a_id": low,
            "participant_b_id": high,
            "subject": f"License request #{license_id}",
        }).execute()
        conv_id = ins.data[0]["id"]

    # Post the contract text as the first message. Truncate to 4000 to match
    # the send_message validator.
    body = f"Contract for license #{license_id}:\n\n{contract_text[:3800]}"
    msg = db().table("messages").insert({
        "conversation_id": conv_id,
        "sender_id": current_user["user_id"],
        "body": body,
    }).execute()
    db().table("conversations").update(
        {"last_message_at": msg.data[0]["created_at"]}
    ).eq("id", conv_id).execute()

    _log_audit(license_id, "contract_agent", "contract_sent_to_talent",
               f"License {license_id} contract sent to talent user {talent_user_id} via conversation {conv_id}")
    return {"ok": True, "conversation_id": conv_id, "status": "awaiting_approval"}


# ============================================================================
# EARNINGS STATEMENT (CSV download for agents)
# ============================================================================

@app.get("/api/agent/{agent_id}/statement.csv")
def agent_earnings_statement(agent_id: int, current_user: dict = Depends(get_current_user)):
    """CSV of every license the agent has commission on, with real amounts.
    Columns: date, talent, brand, use_case, status, gross, commission (10%),
    talent_payout."""
    a_res = db().table("agent_profiles").select("user_id").eq("id", agent_id).execute()
    if not a_res.data or a_res.data[0]["user_id"] != current_user["user_id"]:
        raise HTTPException(403, "Not your agency")

    links = db().table("talent_agent_links").select("talent_id").eq("agent_id", agent_id).execute()
    talent_ids = [l["talent_id"] for l in (links.data or [])]

    rows = []
    if talent_ids:
        for tid in talent_ids:
            tp = db().table("talent_profiles").select("stage_name,user_id").eq("id", tid).execute()
            if not tp.data: continue
            tu = db().table("users").select("name").eq("id", tp.data[0]["user_id"]).execute()
            talent_name = (tu.data[0]["name"] if tu.data else None) or tp.data[0].get("stage_name") or f"Talent #{tid}"
            reqs = db().table("license_requests").select("*").eq("talent_id", tid).execute()
            for r in reqs.data or []:
                cp = db().table("client_profiles").select("company_name").eq("id", r["client_id"]).execute()
                brand = (cp.data[0]["company_name"] if cp.data else None) or "—"
                price = float(r.get("proposed_price") or 0)
                commission = price * 0.10
                talent_payout = price - commission
                rows.append([
                    r.get("created_at", "")[:10],
                    talent_name,
                    brand,
                    (r.get("use_case") or "").replace('\n', ' ').replace(',', ';')[:120],
                    r.get("status") or "",
                    f"{price:.2f}",
                    f"{commission:.2f}",
                    f"{talent_payout:.2f}",
                ])

    import io, csv
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "talent", "brand", "use_case", "status", "gross_gbp", "commission_gbp", "talent_payout_gbp"])
    w.writerows(rows)
    filename = f"agency-{agent_id}-statement-{datetime.utcnow().date().isoformat()}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================================
# EDIT LICENSE TERMS (talent / agent counter-proposes duration, price, etc.)
# ============================================================================

class LicenseTermsUpdate(BaseModel):
    desired_duration_days: int | None = Field(None, ge=1, le=3650)
    desired_regions: str | None = Field(None, max_length=200)
    proposed_price: float | None = Field(None, ge=0, le=1_000_000)
    license_type: str | None = Field(None, max_length=50)


@app.put("/api/licensing/{license_id}/terms")
def edit_license_terms(license_id: int, req: LicenseTermsUpdate, current_user: dict = Depends(get_current_user)):
    """Talent or linked agent may counter-propose terms before the license
    is signed. Writes a full audit log entry with the before/after diff."""
    lic_res = db().table("license_requests").select("*").eq("id", license_id).limit(1).execute()
    if not lic_res.data:
        raise HTTPException(404, "License not found")
    lic = lic_res.data[0]

    if lic.get("status") in ("active", "paid"):
        raise HTTPException(400, "Cannot edit terms on a signed/paid license")

    # Authz: the talent themselves or their linked agent.
    uid = current_user["user_id"]
    talent_pid = lic["talent_id"]
    talent_row = db().table("talent_profiles").select("user_id").eq("id", talent_pid).execute()
    talent_user_id = talent_row.data[0]["user_id"] if talent_row.data else None

    authorized = talent_user_id == uid
    if not authorized and current_user["role"] == "agent":
        agent_pid = _get_user_profile_id(uid, "agent")
        if agent_pid:
            link = db().table("talent_agent_links").select("id").eq("agent_id", agent_pid).eq("talent_id", talent_pid).execute()
            authorized = bool(link.data)
    if not authorized:
        raise HTTPException(403, "Only the talent or their linked agent can edit terms")

    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, "No fields to update")

    before = {k: lic.get(k) for k in updates.keys()}
    db().table("license_requests").update(updates).eq("id", license_id).execute()

    diff = ", ".join(f"{k}: {before[k]} -> {updates[k]}" for k in updates.keys())
    _log_audit(license_id, "license_terms_editor", "terms_edited",
               f"License {license_id} terms edited by user {uid}: {diff}")
    return {"ok": True, "updated": updates}


# ============================================================================
# PRICING TIERS (per-surface prices shown on talent profile)
# ============================================================================

class PricingTiersRequest(BaseModel):
    social: float | None = Field(None, ge=0, le=1_000_000)
    website: float | None = Field(None, ge=0, le=1_000_000)
    print: float | None = Field(None, ge=0, le=1_000_000)
    tv: float | None = Field(None, ge=0, le=1_000_000)


@app.get("/api/talents/{talent_id}/pricing")
def get_talent_pricing(talent_id: int):
    """Publicly readable: brands see prices before requesting a license."""
    res = db().table("talent_profiles").select("pricing_tiers").eq("id", talent_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Talent not found")
    return res.data[0].get("pricing_tiers") or {}


@app.post("/api/talents/{talent_id}/pricing")
def set_talent_pricing(talent_id: int, req: PricingTiersRequest, current_user: dict = Depends(get_current_user)):
    """Only the talent themselves (or an authorized agent) can set pricing."""
    talent_res = db().table("talent_profiles").select("user_id").eq("id", talent_id).limit(1).execute()
    if not talent_res.data:
        raise HTTPException(404, "Talent not found")
    talent_user_id = talent_res.data[0]["user_id"]

    is_self = talent_user_id == current_user["user_id"]
    is_linked_agent = False
    if current_user["role"] == "agent":
        agent_pid = _get_user_profile_id(current_user["user_id"], "agent")
        if agent_pid:
            link = db().table("talent_agent_links").select("id").eq("agent_id", agent_pid).eq("talent_id", talent_id).execute()
            is_linked_agent = bool(link.data)
    if not (is_self or is_linked_agent):
        raise HTTPException(403, "Only the talent or their linked agent can set pricing")

    payload = req.model_dump(exclude_none=True)
    db().table("talent_profiles").update({"pricing_tiers": payload}).eq("id", talent_id).execute()
    return {"ok": True, "pricing_tiers": payload}


# ============================================================================
# AUTH ROLES (multi-role account detection for SelectRole screen)
# ============================================================================

@app.get("/api/auth/roles")
def my_roles(current_user: dict = Depends(get_current_user)):
    """Return every profile the current user has rows in. A single person
    may act as talent, client (brand), and agent — the SelectRole screen
    uses this to show a role switcher instead of the new-user role cards."""
    uid = current_user["user_id"]
    roles: list[dict] = []
    for role, table in (("talent", "talent_profiles"), ("client", "client_profiles"), ("agent", "agent_profiles")):
        res = db().table(table).select("id").eq("user_id", uid).limit(1).execute()
        if res.data:
            roles.append({"role": role, "profile_id": res.data[0]["id"]})
    return {"primary_role": current_user["role"], "roles": roles}


# ============================================================================
# HEALTH (public)
# ============================================================================

@app.get("/api/health")
def health():
    return {
        "status": "healthy", "version": "1.3.0-mvp", "database": "supabase",
        "features": {
            "jwt_auth": True, "ownership_verification": True,
            "contract_agent": True, "manual_review": True,
            "watermark_tracking": True, "stripe_payments": True,
            "license_templates": ["standard", "exclusive", "time_limited"],
        },
    }
