"""LLM client for Face Library.

Uses OpenAI-compatible API (configurable provider). The OpenAI SDK handles
exponential-backoff retries on 408 / 409 / 429 / 5xx internally when
`max_retries` is set. Anything that still fails after those retries bubbles
up as `LLMError` so callers fail loudly instead of silently writing placeholder
"error" text into the database (previous behaviour left users with contracts
that literally read "[LLM Error: ...]").

Configurable via env: LLM_API_KEY, LLM_BASE_URL, LLM_MODEL.
"""
import os
import json
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


class LLMError(RuntimeError):
    """Raised when an LLM call fails after the SDK's built-in retries."""


client = OpenAI(
    api_key=os.getenv("LLM_API_KEY", os.getenv("FLOCK_API_KEY", "")),
    base_url=os.getenv("LLM_BASE_URL", os.getenv("FLOCK_BASE_URL", "https://api.flock.io/v1")),
    max_retries=3,
    timeout=60.0,
)

MODEL = os.getenv("LLM_MODEL", os.getenv("FLOCK_MODEL_FAST", "kimi-k2-thinking"))


def chat(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> dict:
    """Send a chat completion request.

    Returns dict with 'content', 'model', 'tokens_used'.
    Raises LLMError if the provider is unreachable or rejects the request
    after the SDK's built-in retries are exhausted.
    """
    use_model = model or MODEL

    try:
        response = client.chat.completions.create(
            model=use_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as e:
        raise LLMError(f"{type(e).__name__}: {e}") from e

    msg = response.choices[0].message
    usage = response.usage
    content = msg.content or ""

    if not content.strip():
        raise LLMError("LLM returned an empty response")

    return {
        "content": content,
        "model": use_model,
        "tokens_used": usage.total_tokens if usage else 0,
    }


def chat_json(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.3,
    max_tokens: int = 2048,
) -> dict:
    """Chat completion that returns parsed JSON. Raises LLMError on call failure.
    JSON parse failures are non-fatal — `parsed` will be None in that case.
    """
    result = chat(messages, model=model, temperature=temperature, max_tokens=max_tokens)
    content = result["content"]

    try:
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        result["parsed"] = json.loads(content)
    except (json.JSONDecodeError, IndexError):
        result["parsed"] = None

    return result
