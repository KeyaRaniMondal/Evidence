from .. import config, vision_client
from ..metrics import RunMetrics
from ..schemas import Report, Status, ChangeType
from . import preprocess as pp, verdict, evidence


def analyze_sets(before_raw: list[bytes], after_raw: list[bytes]) -> Report:
    m = RunMetrics()

    with m.stage("preprocess"):
        before = [pp.load_resized(b) for b in before_raw]
        after = [pp.load_resized(b) for b in after_raw]
        # overlap between best-matching before/after pair
        overlap = max(pp.estimate_view_overlap(b, a) for b in before for a in after)

    with m.stage("vision_model"):
        res = vision_client.propose_changes(
            [pp.to_jpeg(i) for i in before], [pp.to_jpeg(i) for i in after], m)

    buckets = {"supported": [], "uncertain": [], "not_verifiable": [], "unchanged": []}
    with m.stage("verdict_and_evidence"):
        for o in res.objects[:config.MAX_OBJECTS]:
            f = verdict.decide(o, overlap)
            if f.change == ChangeType.unchanged and f.status == Status.supported:
                buckets["unchanged"].append(f)
                continue
            f.evidence = evidence.make_pair(before, after, o.before, o.after)
            buckets[f.status.value].append(f)

    return Report(**buckets, metrics={**m.summary(), "view_overlap": round(overlap, 3)})