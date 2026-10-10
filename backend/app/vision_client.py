"""Single entry point for the vision model. Swap providers here only."""
import time
from pathlib import Path
from google import genai
from google.genai import types

from . import config
from .schemas import LLMResult
from .metrics import RunMetrics

PROMPT = (Path(__file__).parent / "prompts" / "compare_v1.txt").read_text()
_client = None


def _get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


def propose_changes(before: list[bytes], after: list[bytes],
                    metrics: RunMetrics, max_attempts: int = 2) -> LLMResult:
    parts = [f"BEFORE set: {len(before)} image(s), then AFTER set: {len(after)} image(s)."]
    for img in before + after:
        parts.append(types.Part.from_bytes(data=img, mime_type="image/jpeg"))
    parts.append(PROMPT)

    last_err = None
    for attempt in range(1, max_attempts + 1):
        t = time.perf_counter()
        try:
            resp = _get_client().models.generate_content(
                model=config.VISION_MODEL,
                contents=parts,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=LLMResult,
                    temperature=0,
                ),
            )
            u = resp.usage_metadata
            metrics.log_call(time.perf_counter() - t,
                             u.prompt_token_count or 0,
                             u.candidates_token_count or 0, True, attempt)
            return LLMResult.model_validate_json(resp.text)
        except Exception as e:  # network, rate limit, bad JSON
            metrics.log_call(time.perf_counter() - t, 0, 0, False, attempt)
            last_err = e
            time.sleep(1.5 * attempt)
    raise RuntimeError(f"Vision model failed after {max_attempts} attempts: {last_err}")