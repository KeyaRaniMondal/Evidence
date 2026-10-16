# from fastapi import FastAPI

# app = FastAPI(title="Evidence Backend")


# @app.get("/health")
# def health():
#     return {"status": "ok"}


from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from . import config
from .pipeline.run import analyze_sets
from .schemas import Report

app = FastAPI(title="room-diff")
app.add_middleware(CORSMiddleware, allow_origins=["https://evidence-emls.onrender.com/","http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"ok": True, "model": config.VISION_MODEL}


@app.post("/analyze", response_model=Report)
async def analyze(before: list[UploadFile] = File(...), after: list[UploadFile] = File(...)):
    for name, s in (("before", before), ("after", after)):
        if not 1 <= len(s) <= config.MAX_PHOTOS_PER_SET:
            raise HTTPException(400, f"'{name}' needs 1-{config.MAX_PHOTOS_PER_SET} photos")
    try:
        b = [await f.read() for f in before]
        a = [await f.read() for f in after]
        return analyze_sets(b, a)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    except Exception as e:
        raise HTTPException(422, f"Could not process images: {e}")