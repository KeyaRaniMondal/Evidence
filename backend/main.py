
from app.server import app  # noqa: F401  (uvicorn looks for `app` in this module)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)