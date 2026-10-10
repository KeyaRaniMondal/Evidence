import io
import cv2
import numpy as np
from PIL import Image, ImageOps
from .. import config


def load_resized(raw: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((config.MAX_IMAGE_EDGE, config.MAX_IMAGE_EDGE))
    return img


def to_jpeg(img: Image.Image, quality: int = 88) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def normalize_lighting(img: Image.Image) -> Image.Image:
    """CLAHE on the L channel: reduces exposure differences before crops are compared."""
    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
    out = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2RGB)
    return Image.fromarray(out)


def estimate_view_overlap(a: Image.Image, b: Image.Image) -> float:
    """Rough 0-1 score of how much two photos show the same scene (ORB + RANSAC inlier ratio).
    Used as an independent check on the model's 'other_view_covers_location' claim."""
    ga = cv2.cvtColor(np.array(a), cv2.COLOR_RGB2GRAY)
    gb = cv2.cvtColor(np.array(b), cv2.COLOR_RGB2GRAY)
    orb = cv2.ORB_create(1500)
    ka, da = orb.detectAndCompute(ga, None)
    kb, db = orb.detectAndCompute(gb, None)
    if da is None or db is None or len(ka) < 12 or len(kb) < 12:
        return 0.0
    matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(da, db)
    if len(matches) < 12:
        return 0.0
    pa = np.float32([ka[m.queryIdx].pt for m in matches])
    pb = np.float32([kb[m.trainIdx].pt for m in matches])
    _, mask = cv2.findHomography(pa, pb, cv2.RANSAC, 5.0)
    if mask is None:
        return 0.0
    return float(mask.sum()) / max(len(matches), 1)