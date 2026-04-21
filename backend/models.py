"""Face Library MVP -- Database Models.

Tables:
- User: Authentication accounts (talent, client, agent roles)
- TalentProfile: Likeness profile with photo upload, preferences, social links
- ClientProfile: Client/advertiser company profiles (renamed from Brand)
- AgentProfile: Talent agency profiles
- TalentAgentLink: Many-to-many link between talents and their agents
- LicenseRequest: Client-to-talent licensing requests with manual review workflow
- Contract: AI-generated UK-law-compliant licensing contracts
- AuditLog: Audit trail for platform actions
- WatermarkTracking: Tracks watermarked content usage across platforms
"""
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import enum
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./face_library.db")

# Support Supabase Postgres pooler URLs (postgres:// -> postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# -- Enums -------------------------------------------------------------------

class UserRole(str, enum.Enum):
    TALENT = "talent"
    CLIENT = "client"
    AGENT = "agent"


class LicenseStatus(str, enum.Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


class LicenseType(str, enum.Enum):
    """Three basic licensing categories for MVP."""
    STANDARD = "standard"
    EXCLUSIVE = "exclusive"
    TIME_LIMITED = "time_limited"


class ApprovalType(str, enum.Enum):
    TALENT_ONLY = "talent_only"
    AGENT_ONLY = "agent_only"
    BOTH_REQUIRED = "both_required"


# -- Core Tables -------------------------------------------------------------

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)  # talent, client, agent
    company = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)
    supabase_uid = Column(String, unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TalentProfile(Base):
    __tablename__ = "talent_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Basic info
    bio = Column(Text, nullable=True)
    stage_name = Column(String, nullable=True)
    categories = Column(String, nullable=True)  # e.g. "Influencer,Model,Actor"
    nationality = Column(String, nullable=True)
    ethnicity = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    age = Column(Integer, nullable=True)

    # Photo / likeness
    image_url = Column(String, nullable=True)  # Uploaded face photo (Supabase Storage)
    avatar_url = Column(String, nullable=True)

    # Licensing preferences
    restricted_categories = Column(String, nullable=True)
    min_price_per_use = Column(Float, default=100.0)
    max_license_duration_days = Column(Integer, default=365)
    allow_ai_training = Column(Boolean, default=False)
    allow_video_generation = Column(Boolean, default=True)
    allow_image_generation = Column(Boolean, default=True)
    geo_restrictions = Column(String, nullable=True)
    geo_scope = Column(String, default="global")
    approval_mode = Column(String, default="manual")

    # Social media links
    instagram = Column(String, nullable=True)
    tiktok = Column(String, nullable=True)
    youtube = Column(String, nullable=True)

    # Agency representation
    has_agent = Column(Boolean, default=False)
    agent_email = Column(String, nullable=True)

    # Watermark
    watermark_id = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User")


class ClientProfile(Base):
    """Client/advertiser company profile (renamed from BrandProfile)."""
    __tablename__ = "client_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    company_name = Column(String, nullable=False)
    industry = Column(String, nullable=True)
    website = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    role_title = Column(String, nullable=True)  # CEO/Founder, Creative Director, etc.
    referral_source = Column(String, nullable=True)  # Google, Social media, etc.
    ai_tools_used = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User")


class AgentProfile(Base):
    __tablename__ = "agent_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    agency_name = Column(String, nullable=False)
    website = Column(String, nullable=True)
    portfolio_url = Column(String, nullable=True)
    instagram = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    country = Column(String, nullable=True)
    default_restricted_categories = Column(String, nullable=True)
    approval_workflow = Column(String, default="both_required")
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User")


class TalentAgentLink(Base):
    __tablename__ = "talent_agent_links"
    id = Column(Integer, primary_key=True, index=True)
    talent_id = Column(Integer, ForeignKey("talent_profiles.id"), nullable=False)
    agent_id = Column(Integer, ForeignKey("agent_profiles.id"), nullable=False)
    approval_type = Column(String, default=ApprovalType.BOTH_REQUIRED.value)
    created_at = Column(DateTime, default=datetime.utcnow)
    talent = relationship("TalentProfile")
    agent = relationship("AgentProfile")


# -- Licensing ---------------------------------------------------------------

class LicenseRequest(Base):
    """A client's request to license a talent's likeness. Supports manual review workflow."""
    __tablename__ = "license_requests"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("client_profiles.id"), nullable=False)
    talent_id = Column(Integer, ForeignKey("talent_profiles.id"), nullable=False)

    # Request details
    status = Column(String, default=LicenseStatus.PENDING.value)
    license_type = Column(String, default=LicenseType.STANDARD.value)
    use_case = Column(Text, nullable=False)
    campaign_description = Column(Text, nullable=True)
    desired_duration_days = Column(Integer, default=30)
    desired_regions = Column(String, nullable=True)
    content_type = Column(String, default="image")
    exclusivity = Column(Boolean, default=False)

    # Pricing
    proposed_price = Column(Float, nullable=True)

    # Contract agent output
    contract_generated = Column(Boolean, default=False)
    contract_notes = Column(Text, nullable=True)

    # Manual review fields
    admin_notes = Column(Text, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    # Payment (Stripe)
    payment_status = Column(String, default="unpaid")
    stripe_session_id = Column(String, nullable=True)

    # License token
    license_token = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    client = relationship("ClientProfile")
    talent = relationship("TalentProfile")


class Contract(Base):
    """AI-generated UK-law-compliant licensing contract."""
    __tablename__ = "contracts"
    id = Column(Integer, primary_key=True, index=True)
    license_id = Column(Integer, ForeignKey("license_requests.id"), nullable=False)
    license_type = Column(String, default=LicenseType.STANDARD.value)
    contract_text = Column(Text, nullable=False)
    generated_by = Column(String, default="contract_agent")
    model_used = Column(String, nullable=True)
    uk_law_compliant = Column(Boolean, default=True)
    ip_clauses = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    license = relationship("LicenseRequest")


# -- Audit & Watermark Tracking ----------------------------------------------

class AuditLog(Base):
    """Audit trail for platform actions."""
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    license_id = Column(Integer, ForeignKey("license_requests.id"), nullable=True)
    agent_name = Column(String, nullable=False)
    action = Column(String, nullable=False)
    details = Column(Text, nullable=True)
    model_used = Column(String, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class WatermarkTracking(Base):
    """Tracks watermarked content usage across platforms.

    Placeholder for integration with watermark tracing technology partner.
    Records where licensed content has been detected and whether usage is authorized.
    """
    __tablename__ = "watermark_tracking"
    id = Column(Integer, primary_key=True, index=True)
    license_id = Column(Integer, ForeignKey("license_requests.id"), nullable=False)
    talent_id = Column(Integer, ForeignKey("talent_profiles.id"), nullable=False)
    watermark_id = Column(String, nullable=False)

    # Detection details
    platform_detected = Column(String, nullable=True)  # e.g. "Instagram", "TikTok", "Website"
    detection_url = Column(String, nullable=True)
    detected_at = Column(DateTime, nullable=True)
    is_authorized = Column(Boolean, default=True)

    # Status
    status = Column(String, default="active")  # active, violation_detected, resolved
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    license = relationship("LicenseRequest")
    talent = relationship("TalentProfile")


def init_db():
    Base.metadata.create_all(bind=engine)


def seed_demo_data():
    """Populate DB with demo data if empty. Skips if data already exists (e.g. Supabase)."""
    import hashlib
    import secrets

    def _hash(password: str) -> str:
        """Hash for local SQLite. Supabase uses bcrypt via pgcrypto."""
        try:
            import bcrypt
            return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        except ImportError:
            salt = secrets.token_hex(16)
            h = hashlib.sha256((salt + password).encode()).hexdigest()
            return f"{salt}:{h}"

    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("[Seed] Data already exists, skipping seed.")
            return

        demo_pw = _hash("demo123")
        test_pw = _hash("test")

        # --- Users ---
        talent_user = User(
            email="emma@demo.test", name="Emma Clarke", role="talent",
            password_hash=demo_pw,
        )
        client_user = User(
            email="james@luxbrand.test", name="James Wilson", role="client",
            company="LuxFashion UK",
            password_hash=_hash("demo123"),
        )
        talent_user2 = User(
            email="marcus@demo.test", name="Marcus Chen", role="talent",
            password_hash=_hash("demo123"),
        )
        # Test credentials (matching Figma prototype)
        test_talent = User(
            email="test@gmail.com", name="Olga Bonny", role="talent",
            password_hash=test_pw,
        )
        test_agent = User(
            email="agent@gmail.com", name="Demo Agent", role="agent",
            company="Demo Agency",
            password_hash=_hash("test"),
        )
        test_brand = User(
            email="brand@gmail.com", name="Nike Brand Studio", role="client",
            company="Nike Brand Studio",
            password_hash=_hash("test"),
        )
        db.add_all([talent_user, client_user, talent_user2, test_talent, test_agent, test_brand])
        db.flush()

        # --- Talent Profiles ---
        talent1 = TalentProfile(
            user_id=talent_user.id,
            bio="Award-winning fashion model and digital creator with 10+ years of experience.",
            stage_name="Emma Clarke",
            categories="Model,Fashion,Beauty",
            nationality="British",
            gender="Female",
            age=30,
            restricted_categories="Alcohol,Gambling,Political",
            min_price_per_use=5000.0,
            max_license_duration_days=365,
            allow_ai_training=False,
            geo_scope="global",
            approval_mode="manual",
            avatar_url="/emma-clarke.webp",
            instagram="@emmaclarke",
            tiktok="@emmaclarke_official",
        )
        talent2 = TalentProfile(
            user_id=talent_user2.id,
            bio="Professional athlete and fitness influencer. Former Olympic sprinter.",
            stage_name="Marcus Chen",
            categories="Sports,Influencer",
            nationality="British",
            gender="Male",
            age=28,
            restricted_categories="Alcohol,Gambling,Tobacco",
            min_price_per_use=3500.0,
            max_license_duration_days=180,
            allow_ai_training=False,
            geo_scope="UK,EU",
            approval_mode="manual",
            avatar_url="/marcus-chen.webp",
            instagram="@marcuschen",
            youtube="@MarcusChenFitness",
        )
        # Test talent profile
        test_talent_profile = TalentProfile(
            user_id=test_talent.id,
            bio="Fashion and beauty talent based in London. Available for AI campaigns.",
            stage_name="Olga Bonny",
            categories="Model,Fashion,Beauty",
            nationality="British",
            gender="Female",
            age=26,
            restricted_categories="Alcohol,Gambling",
            min_price_per_use=500.0,
            max_license_duration_days=365,
            allow_ai_training=False,
            geo_scope="global",
            approval_mode="manual",
            instagram="@olgabonny",
        )
        db.add_all([talent1, talent2, test_talent_profile])
        db.flush()

        # Test agent profile
        test_agent_profile = AgentProfile(
            user_id=test_agent.id,
            agency_name="Demo Agency",
            industry="Fashion",
            portfolio_url="https://demoagency.com",
            instagram="@demoagency",
        )
        db.add(test_agent_profile)
        db.flush()

        # --- Client Profile ---
        client = ClientProfile(
            user_id=client_user.id,
            company_name="LuxFashion UK",
            industry="Fashion",
            website="https://luxfashion.example.com",
            role_title="Creative Director",
            referral_source="Google",
            description="Premium British fashion house specialising in sustainable luxury wear.",
        )
        # Test brand/client profile
        test_client = ClientProfile(
            user_id=test_brand.id,
            company_name="Nike Brand Studio",
            industry="Sportswear & Lifestyle",
            website="https://nike.com",
            role_title="CEO / Founder",
            referral_source="Google",
            description="Global sportswear and lifestyle brand.",
        )
        db.add_all([client, test_client])
        db.flush()

        # --- License Request (demo) ---
        license1 = LicenseRequest(
            client_id=client.id,
            talent_id=talent1.id,
            status="awaiting_approval",
            license_type="standard",
            use_case="Summer 2026 luxury fashion campaign — digital ads and social media.",
            content_type="image",
            desired_duration_days=90,
            desired_regions="UK, EU",
            proposed_price=6750.0,
            contract_generated=True,
            payment_status="unpaid",
            license_token="FL-LIC-001",
        )
        db.add(license1)
        db.flush()

        # --- Contract ---
        contract = Contract(
            license_id=license1.id,
            license_type="standard",
            contract_text="""INTELLECTUAL PROPERTY LICENSING AGREEMENT

THIS AGREEMENT is made on the date of digital execution between:

LICENSOR: Emma Clarke ("the Talent")
LICENSEE: LuxFashion UK ("the Client")

1. DEFINITIONS AND INTERPRETATION
"Licensed Material" means the AI-generated likeness of the Talent.
"Permitted Use" means digital advertising and social media content.
"Territory" means United Kingdom and European Union member states.
"License Period" means 90 calendar days from the Effective Date.

2. GRANT OF LICENSE
The Licensor grants to the Licensee a non-exclusive, non-transferable license to use the Licensed Material for the Permitted Use within the Territory for the License Period.

3. CONSIDERATION
The Licensee shall pay the Licensor the sum of GBP 6,750 inclusive of platform fees.

4. INTELLECTUAL PROPERTY RIGHTS
All intellectual property rights in the Talent's likeness remain vested in the Licensor.

5. AI TRAINING RESTRICTION
The Licensed Material shall NOT be used for training AI models or machine learning systems.

6. DATA PROTECTION (GDPR)
Both parties shall comply with the UK GDPR and the Data Protection Act 2018.

7. CONTENT RESTRICTIONS
The Licensed Material shall not be used in connection with: alcohol, gambling, political campaigns, tobacco, or any content that may bring the Talent into disrepute.

8. MORAL RIGHTS
The Licensor asserts their moral rights under Chapter IV of the Copyright, Designs and Patents Act 1988.

9. TERMINATION
Either party may terminate with 30 days written notice. Upon termination, the Licensee shall cease all use within 14 days.

10. DISPUTE RESOLUTION
Any dispute shall be governed by the laws of England and Wales.

Executed as a digital agreement through the Face Library platform.
""",
            generated_by="contract_agent",
            # NOTE: This is a hardcoded seed contract (template below). It was
            # never actually generated by an LLM, so don't claim a model name.
            model_used="seeded-template-v1",
            uk_law_compliant=True,
            ip_clauses="Sections 4, 5, 8: IP retention, AI training restriction, moral rights",
        )
        db.add(contract)

        # --- Audit Logs ---
        audit_entries = [
            ("system", "license_created", "License #1 created by LuxFashion UK for Emma Clarke"),
            ("contract_agent", "contract_generated", "IP licensing agreement generated"),
            ("system", "awaiting_approval", "License sent to talent for approval"),
        ]
        for agent, action, details in audit_entries:
            db.add(AuditLog(
                license_id=license1.id,
                agent_name=agent,
                action=action,
                details=details,
            ))

        db.commit()
        print("[Seed] Demo data: 6 users, 3 talents, 2 clients, 1 agent, 1 license, 1 contract")
    except Exception as e:
        db.rollback()
        print(f"[Seed] Error: {e}")
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
