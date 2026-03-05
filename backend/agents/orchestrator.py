"""Agent Orchestrator — Coordinates the multi-agent licensing pipeline."""
from .negotiator import NegotiatorAgent
from .compliance import ComplianceAgent
from .contract import ContractAgent
from .audit import AuditAgent
from .search import SearchAgent


class OrchestratorAgent:
    """Orchestrates the full licensing pipeline across all agents.

    Pipeline flow:
    1. Brand submits license request
    2. Compliance Agent assesses risk
    3. If risk acceptable → Negotiator Agent proposes terms
    4. If terms proposed → Contract Agent generates agreement
    5. All steps logged by Audit Agent
    6. Result returned for talent approval
    """

    def __init__(self):
        self.negotiator = NegotiatorAgent()
        self.compliance = ComplianceAgent()
        self.contract = ContractAgent()
        self.audit = AuditAgent()
        self.search = SearchAgent()

    def process_license_request(
        self, talent_profile: dict, brand_profile: dict, license_request: dict
    ) -> dict:
        """Run the full licensing pipeline."""
        license_id = license_request.get("id")
        pipeline_results = {
            "license_id": license_id,
            "stages": [],
            "final_status": "pending",
        }

        # Stage 1: Compliance Check
        self.audit.log(license_id, "orchestrator", "pipeline_started",
                       f"Processing license request from {brand_profile.get('company_name')}")

        compliance_result = self.compliance.run(talent_profile, license_request, brand_profile)
        self.audit.log(license_id, "compliance", "risk_assessment_complete",
                       str(compliance_result.get("result", {})),
                       compliance_result.get("model", ""), compliance_result.get("tokens_used", 0))

        pipeline_results["stages"].append({
            "stage": "compliance",
            "status": "complete",
            "result": compliance_result,
        })

        # Check if compliance recommends rejection
        cr = compliance_result.get("result", {})
        if cr and cr.get("recommendation") == "reject":
            pipeline_results["final_status"] = "rejected_compliance"
            self.audit.log(license_id, "orchestrator", "pipeline_rejected",
                           f"Rejected by compliance: {cr.get('compliance_notes', 'Risk too high')}")
            return pipeline_results

        # Stage 2: Negotiation
        negotiation_result = self.negotiator.run(talent_profile, license_request)
        self.audit.log(license_id, "negotiator", "terms_proposed",
                       str(negotiation_result.get("result", {})),
                       negotiation_result.get("model", ""), negotiation_result.get("tokens_used", 0))

        pipeline_results["stages"].append({
            "stage": "negotiation",
            "status": "complete",
            "result": negotiation_result,
        })

        # Stage 3: Contract Generation
        contract_result = self.contract.run(
            talent_profile, brand_profile, negotiation_result, compliance_result
        )
        self.audit.log(license_id, "contract", "contract_generated",
                       f"Contract generated using {contract_result.get('model')}",
                       contract_result.get("model", ""), contract_result.get("tokens_used", 0))

        pipeline_results["stages"].append({
            "stage": "contract",
            "status": "complete",
            "result": {
                "contract_text": contract_result.get("contract_text", ""),
                "model": contract_result.get("model", ""),
                "provider": contract_result.get("provider", ""),
            },
        })

        # Pipeline complete — awaiting talent approval
        pipeline_results["final_status"] = "awaiting_approval"
        self.audit.log(license_id, "orchestrator", "pipeline_complete",
                       "All stages complete. Awaiting talent approval.")

        return pipeline_results

    def search_talent(self, query: str, filters: dict = None) -> dict:
        """Search for talent using the Search Agent."""
        result = self.search.search(query, filters)
        self.audit.log(None, "search", "talent_search",
                       f"Search query: {query}", result.get("model", ""), result.get("tokens_used", 0))
        return result
