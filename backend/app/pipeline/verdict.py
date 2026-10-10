"""Own rule layer: the model proposes, this code decides what may be claimed."""
from .. import config
from ..schemas import ProposedObject, Finding, ChangeType, Status, Box


def _centre(b: Box):
    return ((b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2)


def decide(o: ProposedObject, view_overlap: float) -> Finding:
    c = o.proposed_change
    low_conf = o.match_confidence < config.MIN_MATCH_CONFIDENCE
    covered = o.other_view_covers_location and view_overlap >= 0.15

    if c in (ChangeType.removed, ChangeType.added):
        if not covered:
            where = "original location" if c == ChangeType.removed else "new location"
            return Finding(
                name=o.name, change=c, status=Status.not_verifiable,
                reason=f"The {where} is not covered comparably in the other photos, "
                       f"so '{c.value}' cannot be claimed.",
                extra_angle_request=f"Photograph the {where} of the {o.name} from "
                                    f"roughly the same angle as the other set.")
        if low_conf:
            return _uncertain(o, "Low confidence that this is a real add/remove.")
        return Finding(name=o.name, change=c, status=Status.supported,
                       reason=o.note or f"{o.name} {c.value}; location covered in both sets.")

    if c == ChangeType.moved:
        if not (o.before and o.after):
            return _uncertain(o, "Moved claim lacks a box in one of the sets.")
        (x1, y1), (x2, y2) = _centre(o.before), _centre(o.after)
        shift = ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5
        if low_conf:
            return _uncertain(o, "Not sure the two sightings are the same object.")
        if shift < config.MOVE_THRESHOLD:
            return Finding(name=o.name, change=ChangeType.unchanged, status=Status.supported,
                           reason="Displacement is within view-change tolerance.")
        return Finding(name=o.name, change=c, status=Status.supported,
                       reason=o.note or f"Centre shifted by {shift:.0f}/1000.")

    if c == ChangeType.unchanged:
        return Finding(name=o.name, change=c, status=Status.supported,
                       reason=o.note or "Present in both sets, no physical change.")

    return _uncertain(o, o.note or "Model could not decide.")


def _uncertain(o: ProposedObject, reason: str) -> Finding:
    return Finding(
        name=o.name, change=o.proposed_change, status=Status.uncertain, reason=reason,
        extra_angle_request=f"Take a close photo of the {o.name} and its surroundings "
                            f"from the same side in both sets.")