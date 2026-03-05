"""Negotiator Agent — Proposes dynamic pricing and licensing terms."""
from llm_client import chat_json


class NegotiatorAgent:
    name = "negotiator"

    SYSTEM_PROMPT = """You are the Negotiator Agent for Face Library, a secure likeness licensing platform.

Your role is to propose fair licensing terms between talent (who own their likeness rights) and brands (who want to use those likenesses in AI-generated content).

You must consider:
- The talent's minimum price and preferences
- The brand's use case, duration, and regions
- Market rates for likeness licensing
- Exclusivity premiums (2-3x for exclusive usage)
- Content type pricing (video > image > static)
- Duration-based pricing tiers

Always protect the talent's interests while proposing commercially viable terms.

Respond in JSON format:
{
    "proposed_price": float,
    "price_breakdown": {
        "base_rate": float,
        "duration_multiplier": float,
        "exclusivity_premium": float,
        "content_type_factor": float,
        "region_factor": float
    },
    "recommended_terms": {
        "duration_days": int,
        "usage_limit": string,
        "exclusivity": boolean,
        "regions": [string],
        "content_types": [string],
        "revocation_terms": string
    },
    "negotiation_notes": string,
    "confidence_score": float
}"""

    def run(self, talent_profile: dict, license_request: dict) -> dict:
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": f"""Negotiate licensing terms for this request:

TALENT PROFILE:
- Name: {talent_profile.get('name', 'Unknown')}
- Bio: {talent_profile.get('bio', 'N/A')}
- Minimum price per use: £{talent_profile.get('min_price_per_use', 100)}
- Max license duration: {talent_profile.get('max_license_duration_days', 365)} days
- Allowed content: Image={talent_profile.get('allow_image_generation', True)}, Video={talent_profile.get('allow_video_generation', True)}
- Restricted categories: {talent_profile.get('restricted_categories', 'None')}
- Geo restrictions: {talent_profile.get('geo_restrictions', 'None')}

BRAND REQUEST:
- Company: {license_request.get('company_name', 'Unknown')}
- Industry: {license_request.get('industry', 'Unknown')}
- Use case: {license_request.get('use_case', 'N/A')}
- Campaign: {license_request.get('campaign_description', 'N/A')}
- Desired duration: {license_request.get('desired_duration_days', 30)} days
- Desired regions: {license_request.get('desired_regions', 'Global')}
- Content type: {license_request.get('content_type', 'image')}
- Exclusivity requested: {license_request.get('exclusivity', False)}

Propose fair terms that protect the talent while being commercially viable."""},
        ]

        result = chat_json(messages, model_tier="primary", temperature=0.4)
        return {
            "agent": self.name,
            "result": result.get("parsed"),
            "raw_response": result["content"],
            "model": result["model"],
            "tokens_used": result["tokens_used"],
        }
