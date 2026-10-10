import base64
from typing import Optional
from PIL import Image
from ..schemas import Box, EvidencePair
from .preprocess import to_jpeg, normalize_lighting


def _crop(img: Image.Image, b: Box, pad: float = 0.08) -> Image.Image:
    w, h = img.size
    x0 = max(0, (b.xmin / 1000 - pad) * w); x1 = min(w, (b.xmax / 1000 + pad) * w)
    y0 = max(0, (b.ymin / 1000 - pad) * h); y1 = min(h, (b.ymax / 1000 + pad) * h)
    return img.crop((int(x0), int(y0), int(x1), int(y1)))


def _enc(img: Image.Image) -> str:
    return base64.b64encode(to_jpeg(img)).decode()


def make_pair(before_imgs, after_imgs, bb: Optional[Box], ab: Optional[Box]) -> Optional[EvidencePair]:
    def one(imgs, box):
        if box is None or box.image >= len(imgs):
            return None
        return _enc(_crop(normalize_lighting(imgs[box.image]), box))
    pair = EvidencePair(before_b64=one(before_imgs, bb), after_b64=one(after_imgs, ab))
    return pair if (pair.before_b64 or pair.after_b64) else None