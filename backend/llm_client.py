"""Unified LLM client wrapping FLock API (primary), Z.AI GLM (secondary),
and OpenRouter (fallback for Z.AI GLM models).

Bounty coverage:
- FLock.io: All open-source model inference via FLock API
- Z.AI: GLM models for contract generation and compliance summaries
  (direct Z.AI API -> OpenRouter GLM fallback)
- AnyWay: OpenTelemetry tracing on every LLM call
"""
import os
import json
from openai import OpenAI
from dotenv import load_dotenv
from tracing import trace_llm_call, record_llm_result

load_dotenv()

# -- FLock API client (OpenAI-compatible, open-source models) -----------------

flock_client = OpenAI(
    api_key=os.getenv("FLOCK_API_KEY", ""),
    base_url=os.getenv("FLOCK_BASE_URL", "https://api.flock.io/v1"),
    default_headers={"x-litellm-api-key": os.getenv("FLOCK_API_KEY", "")},
)

# -- Z.AI GLM client (direct) ------------------------------------------------

zai_client = OpenAI(
    api_key=os.getenv("ZAI_API_KEY", ""),
    base_url=os.getenv("ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
) if os.getenv("ZAI_API_KEY") else None

# -- OpenRouter client (fallback for Z.AI GLM models) ------------------------

openrouter_client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY", ""),
    base_url="https://openrouter.ai/api/v1",
) if os.getenv("OPENROUTER_API_KEY") else None

# -- Model mappings (all 5 FLock models + Z.AI + OpenRouter GLM) --------------

# OpenRouter GLM model mapping (used when Z.AI direct API fails)
# GLM-4.5 via OpenRouter with reasoning disabled (thinking=off)
OPENROUTER_GLM_MODELS = {
    "glm-4-plus": "z-ai/glm-4.5",
    "glm-4-plus-128k": "z-ai/glm-4.5",
}

MODELS = {
    # FLock models (Bounty 1: FLock.io)
    "fast": os.getenv("FLOCK_MODEL_FAST", "deepseek-v3.2"),
    "primary": os.getenv("FLOCK_MODEL_PRIMARY", "qwen3-30b-a3b-instruct-2507"),
    "reasoning": os.getenv("FLOCK_MODEL_REASONING", "qwen3-235b-a22b-thinking-2507"),
    "creative": os.getenv("FLOCK_MODEL_CREATIVE", "qwen3-235b-a22b-instruct-2507"),
    "longctx": os.getenv("FLOCK_MODEL_LONGCTX", "kimi-k2.5"),
    # Z.AI models (Bounty 2: Z.AI) — tried via direct API first, then OpenRouter
    "zai_primary": "glm-4-plus",
}

# Track which provider each model tier maps to
MODEL_PROVIDERS = {
    "fast": "flock",
    "primary": "flock",
    "reasoning": "flock",
    "creative": "flock",
    "longctx": "flock",
    "zai_primary": "zai",
}


def _call_llm(client, model: str, messages: list[dict], temperature: float,
               max_tokens: int, response_format: dict | None,
               is_openrouter_glm: bool = False) -> dict:
    """Low-level LLM call. Returns raw response dict or raises on failure."""
    kwargs = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        kwargs["response_format"] = response_format
    # Disable thinking/reasoning for OpenRouter GLM models
    if is_openrouter_glm:
        kwargs["extra_body"] = {"reasoning": {"effort": "none"}}
    response = client.chat.completions.create(**kwargs)
    msg = response.choices[0].message
    content = msg.content
    # Fallback: some GLM thinking models put output in reasoning field
    if not content and hasattr(msg, "reasoning") and msg.reasoning:
        content = msg.reasoning
    usage = response.usage
    return {
        "content": content,
        "model": model,
        "tokens_used": usage.total_tokens if usage else 0,
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
    }


def chat(
    messages: list[dict],
    model_tier: str = "primary",
    temperature: float = 0.7,
    max_tokens: int = 2048,
    response_format: dict | None = None,
    agent_name: str = "",
) -> dict:
    """Send a chat completion request to the appropriate LLM provider.

    For Z.AI model tiers, the fallback chain is:
      1. Z.AI direct API (glm-4-plus)
      2. OpenRouter GLM model (z-ai/glm-4.5)
      3. FLock reasoning model (qwen3-235b)

    Args:
        messages: List of message dicts with role/content
        model_tier: One of 'fast', 'primary', 'reasoning', 'creative', 'longctx', 'zai_primary'
        temperature: Sampling temperature
        max_tokens: Maximum output tokens
        response_format: Optional JSON response format
        agent_name: Name of the calling agent (for tracing)

    Returns:
        dict with 'content', 'model', 'tokens_used', 'provider'
    """
    is_zai_tier = model_tier.startswith("zai")
    model = MODELS.get(model_tier, MODELS["primary"])

    # Build the provider chain for Z.AI tiers: zai_direct -> openrouter -> flock
    if is_zai_tier:
        providers = []
        if zai_client is not None:
            providers.append(("zai", zai_client, model))
        if openrouter_client is not None:
            or_model = OPENROUTER_GLM_MODELS.get(model, "z-ai/glm-4.5")
            providers.append(("openrouter_glm", openrouter_client, or_model))
        # Final fallback: FLock reasoning
        providers.append(("flock_glm_fallback", flock_client, MODELS["reasoning"]))
    else:
        providers = [("flock", flock_client, model)]

    last_error = None
    for provider, client, use_model in providers:
        with trace_llm_call(use_model, provider, agent_name) as span:
            try:
                is_or_glm = provider == "openrouter_glm"
                raw = _call_llm(client, use_model, messages, temperature,
                                max_tokens, response_format,
                                is_openrouter_glm=is_or_glm)
                result = {**raw, "provider": provider}
                record_llm_result(span, result)
                if provider != providers[0][0]:
                    print(f"[LLM] {agent_name}: {model_tier} served by {provider} ({use_model})")
                return result
            except Exception as e:
                last_error = str(e)
                span.set_attribute("llm.fallback_reason", last_error)
                print(f"[LLM] {agent_name}: {provider}/{use_model} failed: {last_error}")
                continue

    # All providers failed
    result = {
        "content": f"[LLM Error: all providers failed. Last: {last_error}]",
        "model": model,
        "tokens_used": 0,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "provider": "error",
        "error": last_error,
    }
    return result


def chat_json(
    messages: list[dict],
    model_tier: str = "primary",
    temperature: float = 0.3,
    max_tokens: int = 2048,
    agent_name: str = "",
) -> dict:
    """Chat completion that returns parsed JSON."""
    result = chat(
        messages=messages,
        model_tier=model_tier,
        temperature=temperature,
        max_tokens=max_tokens,
        agent_name=agent_name,
    )
    content = result["content"]

    # Try to extract JSON from the response
    try:
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        parsed = json.loads(content)
        result["parsed"] = parsed
    except (json.JSONDecodeError, IndexError):
        result["parsed"] = None

    return result


def get_model_info() -> list[dict]:
    """Return info about all configured models for the agents dashboard."""
    models = []
    for tier, model_id in MODELS.items():
        provider = MODEL_PROVIDERS.get(tier, "unknown")
        if provider == "zai":
            available = (zai_client is not None) or (openrouter_client is not None)
        else:
            available = True
        models.append({
            "tier": tier,
            "model_id": model_id,
            "provider": provider,
            "available": available,
            "fallback": "openrouter_glm" if provider == "zai" and openrouter_client is not None else None,
        })
    return models
