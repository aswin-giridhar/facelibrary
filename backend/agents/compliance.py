"""Compliance & Risk Agent — Scans requests for risks and policy violations."""
from llm_client import chat_json


class ComplianceAgent:
    name = "compliance"

    SYSTEM_PROMPT = """You are the Compliance & Risk Agent for Face Library, a secure likeness licensing platform.

Your role is to assess risk and compliance for every licensing request. You must:

1. Check if the brand's use case conflicts with the talent's restricted categories
2. Assess geo/political risks for the target regions
3. Flag potentially harmful, misleading, or exploitative uses
4. Check for age-appropriateness of content
5. Verify the use case aligns with UK IP and data protection law (UK GDPR, Copyright Act 1988)
6. Score overall risk level

Risk categories to check:
- CONTENT_RISK: Adult, violent, political, controversial content
- BRAND_RISK: Brand reputation, industry controversies
- LEGAL_RISK: IP conflicts, jurisdictional issues, GDPR compliance
- ETHICAL_RISK: Deepfake concerns, consent issues, exploitation
- GEO_RISK: Sanctioned regions, political sensitivities

Respond in JSON format:
{
    "risk_level": "low" | "medium" | "high" | "critical",
    "overall_score": float (0-1, lower is safer),
    "risk_flags": [
        {
            "category": string,
            "severity": "low" | "medium" | "high" | "critical",
            "description": string,
            "recommendation": string
        }
    ],
    "compliance_checks": {
        "uk_gdpr_compliant": boolean,
        "ip_law_compliant": boolean,
        "content_appropriate": boolean,
        "geo_restrictions_respected": boolean,
        "talent_preferences_respected": boolean
    },
    "recommendation": "approve" | "approve_with_conditions" | "reject",
    "conditions": [string],
    "compliance_notes": string
}"""

    def run(self, talent_profile: dict, license_request: dict, brand_profile: dict) -> dict:
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": f"""Assess compliance and risk for this licensing request:

TALENT PREFERENCES:
- Restricted categories: {talent_profile.get('restricted_categories', 'None')}
- Geo restrictions: {talent_profile.get('geo_restrictions', 'None')}
- Allow AI training: {talent_profile.get('allow_ai_training', False)}
- Allow video: {talent_profile.get('allow_video_generation', True)}
- Allow image: {talent_profile.get('allow_image_generation', True)}

BRAND INFO:
- Company: {brand_profile.get('company_name', 'Unknown')}
- Industry: {brand_profile.get('industry', 'Unknown')}
- Website: {brand_profile.get('website', 'N/A')}

REQUEST DETAILS:
- Use case: {license_request.get('use_case', 'N/A')}
- Campaign: {license_request.get('campaign_description', 'N/A')}
- Content type: {license_request.get('content_type', 'image')}
- Target regions: {license_request.get('desired_regions', 'Global')}
- Duration: {license_request.get('desired_duration_days', 30)} days
- Exclusivity: {license_request.get('exclusivity', False)}

Perform a thorough risk and compliance assessment."""},
        ]

        result = chat_json(messages, model_tier="fast", temperature=0.2)
        return {
            "agent": self.name,
            "result": result.get("parsed"),
            "raw_response": result["content"],
            "model": result["model"],
            "tokens_used": result["tokens_used"],
        }
