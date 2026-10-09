import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-2.5-flash")
PRICE_IN_PER_M = float(os.getenv("PRICE_IN_PER_M", "0"))
PRICE_OUT_PER_M = float(os.getenv("PRICE_OUT_PER_M", "0"))
PRICE_DATE = os.getenv("PRICE_DATE", "unset")
MAX_IMAGE_EDGE = int(os.getenv("MAX_IMAGE_EDGE", "1280"))

MAX_PHOTOS_PER_SET = 3
MAX_OBJECTS = 5

# Verdict thresholds 
MIN_MATCH_CONFIDENCE = 0.6
MOVE_THRESHOLD = 60  # on a 0-1000 scale: centre displacement counted as "moved"