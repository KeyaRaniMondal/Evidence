import time
from contextlib import contextmanager
from . import config


class RunMetrics:
    def __init__(self):
        self.t0 = time.perf_counter()
        self.calls = []  # one entry per model call, including retries
        self.stages = {}

    @contextmanager
    def stage(self, name: str):
        s = time.perf_counter()
        try:
            yield
        finally:
            self.stages[name] = round(time.perf_counter() - s, 3)

    def log_call(self, latency_s, tokens_in, tokens_out, ok, attempt):
        self.calls.append({
            "latency_s": round(latency_s, 3), "tokens_in": tokens_in,
            "tokens_out": tokens_out, "ok": ok, "attempt": attempt,
        })

    def summary(self) -> dict:
        tin = sum(c["tokens_in"] for c in self.calls)
        tout = sum(c["tokens_out"] for c in self.calls)
        cost = tin / 1e6 * config.PRICE_IN_PER_M + tout / 1e6 * config.PRICE_OUT_PER_M
        return {
            "total_s": round(time.perf_counter() - self.t0, 3),
            "stages_s": self.stages,
            "model": config.VISION_MODEL,
            "model_calls": len(self.calls),
            "retries": sum(1 for c in self.calls if c["attempt"] > 1),
            "tokens_in": tin, "tokens_out": tout,
            "est_cost_usd_paid_equivalent": round(cost, 6),
            "price_assumption": {
                "in_per_M": config.PRICE_IN_PER_M,
                "out_per_M": config.PRICE_OUT_PER_M,
                "checked": config.PRICE_DATE,
            },
            "calls": self.calls,
        }