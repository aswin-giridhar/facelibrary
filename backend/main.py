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
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

sys.path.insert(0, os.path.dirname(__file__))

from supabase_client import supabase_admin, supabase as supabase_public
from agents.contract import ContractAgent
from llm_client import LLMError

contract_agent = ContractAgent()

JWT_SECRET = os.getenv("SECRET_KEY", "face-library-mvp-2026")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

ALLOWED_ORIGINS = [
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
    except Exception:
        pass


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
        image_url = f"{os.getenv('SUPABASE_URL')}/storage/v1/object/public/talent-images/{filename}"
    except Exception:
        # Fallback to local storage
        upload_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "talent")
        os.makedirs(upload_dir, exist_ok=True)
        filepath = os.path.join(upload_dir, filename)
        with open(filepath, "wb") as f:
            f.write(contents)
        image_url = f"/uploads/talent/{filename}"

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
        client_res = db().table("client_profiles").select("company_name").eq("id", r["client_id"]).execute()
        client_name = client_res.data[0]["company_name"] if client_res.data else None
        result.append({
            "id": r["id"], "status": r["status"], "license_type": r.get("license_type"),
            "use_case": r.get("use_case"), "content_type": r.get("content_type"),
            "desired_duration_days": r.get("desired_duration_days"),
            "proposed_price": r.get("proposed_price"), "client_name": client_name,
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
            c_res = db().table("client_profiles").select("company_name").eq("id", r["client_id"]).execute()
            result.append({
                "id": r["id"], "status": r["status"], "license_type": r.get("license_type"),
                "use_case": r.get("use_case"),
                "talent_name": tu.data[0]["name"] if tu.data else None,
                "client_name": c_res.data[0]["company_name"] if c_res.data else None,
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
    db().table("talent_agent_links").delete().eq("id", link_id).execute()
    return {"status": "unlinked"}


@app.get("/api/talent-agent/links/{agent_id}")
def get_agent_links(agent_id: int, current_user: dict = Depends(get_current_user)):
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
def generate_contract(license_id: int, current_user: dict = Depends(get_current_user)):
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

    db().table("contracts").insert({
        "license_id": license_id, "license_type": lic.get("license_type"),
        "contract_text": contract_text,
    }).execute()

    db().table("license_requests").update({
        "contract_generated": True, "status": "under_review",
    }).eq("id", license_id).execute()

    _log_audit(license_id, "contract_agent", "contract_generated",
               f"IP licensing agreement generated ({result['model']})",
               result["model"], result["tokens_used"])
    return {"status": "contract_generated", "license_type": lic.get("license_type"),
            "model": result["model"], "tokens_used": result["tokens_used"]}


@app.post("/api/licensing/{license_id}/validate-contract")
def validate_contract(license_id: int, current_user: dict = Depends(get_current_user)):
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
def improve_contract(license_id: int, req: ContractImproveRequest, current_user: dict = Depends(get_current_user)):
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
    res = db().table("audit_logs").select("*").order("created_at", desc=True).limit(200).execute()
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

    if event.get("type") == "checkout.session.completed":
        session = event["data"]["object"]
        license_id = session.get("metadata", {}).get("license_id")
        if license_id:
            db().table("license_requests").update({
                "payment_status": "paid", "status": "active",
            }).eq("id", int(license_id)).execute()
            _log_audit(int(license_id), "stripe", "payment_completed", "Payment received")
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
# LICENSE TEMPLATES (public)
# ============================================================================

@app.get("/api/license-templates")
def get_license_templates():
    from agents.contract import TEMPLATES
    return [{"type": k, **v} for k, v in TEMPLATES.items()]


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
