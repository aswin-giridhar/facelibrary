"""IP Contract Generation Agent — Generates legally-compliant licensing contracts."""
from llm_client import chat


class ContractAgent:
    name = "contract"

    SYSTEM_PROMPT = """You are the IP Contract Generation Agent for Face Library, a secure likeness licensing platform.

Your role is to generate legally-compliant licensing contracts for the use of a person's likeness in AI-generated content. All contracts must be aligned with UK legal frameworks including:

- UK Copyright, Designs and Patents Act 1988
- UK GDPR (Data Protection Act 2018)
- The right to one's own image under UK common law
- Consumer Rights Act 2015
- Electronic Commerce Regulations 2002

Generate a complete, professional licensing contract that includes:

1. PARTIES — Licensor (talent) and Licensee (brand) details
2. DEFINITIONS — Key terms (Likeness, Licensed Content, Territory, etc.)
3. GRANT OF LICENSE — Scope, duration, exclusivity, permitted uses
4. RESTRICTIONS — What the licensee cannot do
5. COMPENSATION — Fee structure, payment terms
6. INTELLECTUAL PROPERTY — IP ownership, moral rights
7. DATA PROTECTION — GDPR compliance, data processing
8. WARRANTIES & REPRESENTATIONS — Both parties' guarantees
9. TERMINATION — Conditions for early termination, revocation rights
10. LIABILITY — Limitation of liability, indemnification
11. DISPUTE RESOLUTION — Governing law (England & Wales), jurisdiction
12. GENERAL PROVISIONS — Entire agreement, amendments, notices

The contract should be professional but clear, protecting both parties' interests with special emphasis on the talent's likeness rights.

Output the full contract text, formatted with proper legal document structure."""

    def run(self, talent_profile: dict, brand_profile: dict, negotiation_result: dict, compliance_result: dict) -> dict:
        # Prefer Z.AI for contract generation if available, else use FLock reasoning model
        model_tier = "zai_primary" if True else "reasoning"  # Will fallback gracefully

        conditions = ""
        if compliance_result and compliance_result.get("result"):
            cr = compliance_result["result"]
            conditions = f"""
COMPLIANCE CONDITIONS:
- Risk level: {cr.get('risk_level', 'unknown')}
- Recommendation: {cr.get('recommendation', 'N/A')}
- Conditions: {', '.join(cr.get('conditions', []))}"""

        negotiation_terms = ""
        if negotiation_result and negotiation_result.get("result"):
            nr = negotiation_result["result"]
            terms = nr.get("recommended_terms", {})
            negotiation_terms = f"""
AGREED TERMS:
- Price: £{nr.get('proposed_price', 'TBD')}
- Duration: {terms.get('duration_days', 30)} days
- Exclusivity: {terms.get('exclusivity', False)}
- Regions: {', '.join(terms.get('regions', ['United Kingdom']))}
- Content types: {', '.join(terms.get('content_types', ['image']))}
- Usage limit: {terms.get('usage_limit', 'Unlimited within license period')}
- Revocation: {terms.get('revocation_terms', 'Standard 30-day notice')}"""

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": f"""Generate a licensing contract for the following arrangement:

LICENSOR (TALENT):
- Name: {talent_profile.get('name', '[TALENT NAME]')}
- Bio: {talent_profile.get('bio', 'N/A')}

LICENSEE (BRAND):
- Company: {brand_profile.get('company_name', '[BRAND NAME]')}
- Industry: {brand_profile.get('industry', 'N/A')}
- Website: {brand_profile.get('website', 'N/A')}

USE CASE:
- Description: {brand_profile.get('use_case', 'AI-generated marketing content')}
- Content type: {brand_profile.get('content_type', 'image')}
{negotiation_terms}
{conditions}

Generate a complete, enforceable licensing contract under the laws of England and Wales."""},
        ]

        result = chat(messages, model_tier=model_tier, temperature=0.3, max_tokens=4096)

        # Fallback to FLock if Z.AI fails
        if result.get("error") and model_tier == "zai_primary":
            result = chat(messages, model_tier="reasoning", temperature=0.3, max_tokens=4096)

        return {
            "agent": self.name,
            "contract_text": result["content"],
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "provider": result.get("provider", "unknown"),
        }
