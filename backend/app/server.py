from fastapi import FastAPI

app = FastAPI(title="Evidence Backend")


@app.get("/health")
def health():
    return {"status": "ok"}
