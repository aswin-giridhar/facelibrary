"""Talent Search Agent — AI-driven talent discovery for brands."""
from llm_client import chat_json
from models import TalentProfile, User, SessionLocal


class SearchAgent:
    name = "search"

    SYSTEM_PROMPT = """You are the Talent Search Agent for Face Library, a secure likeness licensing platform.

Your role is to help brands find the right talent for their campaigns. Given a brand's requirements and a list of available talent profiles, you must:

1. Rank talent by relevance to the brand's needs
2. Explain why each talent is a good or poor match
3. Flag any potential conflicts (restricted categories, geo limitations)
4. Suggest search refinements

Respond in JSON format:
{
    "ranked_results": [
        {
            "talent_id": int,
            "name": string,
            "match_score": float (0-1),
            "match_reasons": [string],
            "potential_conflicts": [string],
            "recommended": boolean
        }
    ],
    "search_summary": string,
    "refinement_suggestions": [string]
}"""

    def search(self, query: str, filters: dict = None) -> dict:
        """Search talents based on brand requirements."""
        db = SessionLocal()
        try:
            # Get all talent profiles with user info
            talents = db.query(TalentProfile, User).join(
                User, TalentProfile.user_id == User.id
            ).all()

            talent_list = []
            for tp, user in talents:
                talent_list.append({
                    "id": tp.id,
                    "name": user.name,
                    "bio": tp.bio or "No bio provided",
                    "categories": tp.categories or "General",
                    "restricted_categories": tp.restricted_categories or "None",
                    "min_price": tp.min_price_per_use,
                    "allows_video": tp.allow_video_generation,
                    "allows_image": tp.allow_image_generation,
                    "geo_restrictions": tp.geo_restrictions or "None",
                })

            if not talent_list:
                return {
                    "agent": self.name,
                    "result": {"ranked_results": [], "search_summary": "No talent profiles found.", "refinement_suggestions": ["Check back later as more talent join the platform."]},
                    "model": "none",
                    "tokens_used": 0,
                }

            messages = [
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": f"""Find the best talent matches for this brand request:

SEARCH QUERY: {query}

FILTERS: {filters or 'None specified'}

AVAILABLE TALENT:
{chr(10).join(f"- ID {t['id']}: {t['name']} | {t['bio']} | Categories: {t['categories']} | Min price: £{t['min_price']} | Video: {t['allows_video']} | Image: {t['allows_image']} | Geo restrictions: {t['geo_restrictions']}" for t in talent_list)}

Rank and evaluate each talent for this request."""},
            ]

            result = chat_json(messages, model_tier="fast", temperature=0.3)
            return {
                "agent": self.name,
                "result": result.get("parsed"),
                "raw_response": result["content"],
                "model": result["model"],
                "tokens_used": result["tokens_used"],
            }
        finally:
            db.close()
