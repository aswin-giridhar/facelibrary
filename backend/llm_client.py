"""Unified LLM client wrapping FLock API (primary) and Z.AI GLM (secondary)."""
import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# FLock API client (OpenAI-compatible, open-source models)
flock_client = OpenAI(
    api_key=os.getenv("FLOCK_API_KEY", ""),
    base_url=os.getenv("FLOCK_BASE_URL", "https://api.flock.io/v1"),
    default_headers={"x-litellm-api-key": os.getenv("FLOCK_API_KEY", "")},
)

# Z.AI GLM client
zai_client = OpenAI(
    api_key=os.getenv("ZAI_API_KEY", ""),
    base_url=os.getenv("ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
) if os.getenv("ZAI_API_KEY") else None

# Model mappings
MODELS = {
    "fast": os.getenv("FLOCK_MODEL_FAST", "deepseek-v3.2"),
    "primary": os.getenv("FLOCK_MODEL_PRIMARY", "qwen3-30b-a3b-instruct-2507"),
    "reasoning": os.getenv("FLOCK_MODEL_REASONING", "qwen3-235b-a22b-thinking-2507"),
    "zai_primary": "glm-4-plus",
}


def chat(
    messages: list[dict],
    model_tier: str = "primary",
    temperature: float = 0.7,
    max_tokens: int = 2048,
    response_format: dict | None = None,
) -> dict:
    """Send a chat completion request to the appropriate LLM provider.

    Args:
        messages: List of message dicts with role/content
        model_tier: One of 'fast', 'primary', 'reasoning', 'zai_primary'
        temperature: Sampling temperature
        max_tokens: Maximum output tokens
        response_format: Optional JSON response format

    Returns:
        dict with 'content', 'model', 'tokens_used'
    """
    use_zai = model_tier.startswith("zai") and zai_client is not None
    client = zai_client if use_zai else flock_client
    model = MODELS.get(model_tier, MODELS["primary"])

    kwargs = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        kwargs["response_format"] = response_format

    try:
        response = client.chat.completions.create(**kwargs)
        content = response.choices[0].message.content
        usage = response.usage
        return {
            "content": content,
            "model": model,
            "tokens_used": usage.total_tokens if usage else 0,
            "provider": "zai" if use_zai else "flock",
        }
    except Exception as e:
        # Fallback: return error info but don't crash the agent pipeline
        return {
            "content": f"[LLM Error: {str(e)}]",
            "model": model,
            "tokens_used": 0,
            "provider": "error",
            "error": str(e),
        }


def chat_json(
    messages: list[dict],
    model_tier: str = "primary",
    temperature: float = 0.3,
    max_tokens: int = 2048,
) -> dict:
    """Chat completion that returns parsed JSON."""
    result = chat(
        messages=messages,
        model_tier=model_tier,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    content = result["content"]

    # Try to extract JSON from the response
    try:
        # Handle markdown code blocks
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        parsed = json.loads(content)
        result["parsed"] = parsed
    except (json.JSONDecodeError, IndexError):
        result["parsed"] = None

    return result
