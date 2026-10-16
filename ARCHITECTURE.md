# Room Evidence — Complete Architecture & Working Procedure

This file explains the whole project: what it does, how the pieces fit,
how input images flow through the system, how before/after comparison works,
and how to run it. Read top to bottom for the full procedure.

## 1. What the project does

A user uploads **two photo sets of the same small scene** (desk / small room):

- **Before set:** 1–3 photos, original state.
- **After set:** 1–3 photos, changed state.

The system returns a **concise, evidence-backed report** of what physically
changed. The user never types descriptions or labels — the backend detects,
matches, and verifies changes automatically.

Supported claims only:

| Claim | Meaning |
|---|---|
| `added` | Absent in before, present in after, and the location is comparably visible in both |
| `removed` | Present in before, absent in after, and the location is comparably visible in both |
| `moved` | Same object is in a clearly different place (centre shift ≥ threshold) |
| `unchanged` | Present in both, no physical change (lighting/viewpoint differences ignored) |

Deliberately **out of scope**: damage valuation, building inspection,
arbitrary object labelling, video (photos are sufficient).

Two anti-false-positive rules are load-bearing:

1. **Lighting/viewpoint change ≠ physical change.** Never invented.
2. **Hidden / out-of-frame ≠ removed.** If the other set does not show the
   location from a comparable angle, the result is `not_verifiable`
   (with a request for a better angle), never `removed`/`added`.

## 2. Tech stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI (`backend/app/server.py`), Uvicorn (`backend/main.py`), Pydantic v2 (`schemas.py`) |
| Vision | Google Gemini via `google-genai` SDK (`vision_client.py`), model default `gemini-2.5-flash` |
| Image processing | Pillow (load/resize/crop/JPEG), OpenCV headless + NumPy (lighting normalisation, ORB view-overlap) |
| Frontend | Next.js 16 App Router + React 19 (`frontend/app/page.tsx`), Tailwind v4, no extra UI deps |
| Contract | `POST /analyze` multipart (`before`, `after`) → `Report` JSON; `GET /health` |

## 3. Repository layout and file roles

```text
Evidence/
├── ARCHITECTURE.md            ← this file
├── testImages/                ← sample before/after screenshots for manual testing
├── backend/
│   ├── main.py                ← uvicorn entry; re-exports `app` from app.server
│   ├── requirements.txt       ← fastapi, uvicorn[standard], python-multipart,
│   │                             pydantic, pillow, opencv-python-headless,
│   │                             numpy, google-genai, python-dotenv
│   ├── .env                   ← GEMINI_API_KEY, VISION_MODEL, PRICE_*, MAX_IMAGE_EDGE
│   └── app/
│       ├── server.py          ← FastAPI app: CORS, GET /health, POST /analyze
│       ├── schemas.py         ← Pydantic contracts (Box, ProposedObject,
│       │                         LLMResult, EvidencePair, Finding, Report)
│       ├── config.py          ← env + constants (MAX_PHOTOS_PER_SET=3,
│       │                         MAX_OBJECTS=5, MIN_MATCH_CONFIDENCE=0.6,
│       │                         MOVE_THRESHOLD=60)
│       ├── metrics.py         ← RunMetrics: per-stage timing, token/cost accounting
│       ├── vision_client.py   ← sole Gemini caller; loads prompts/compare.txt,
│       │                         structured JSON output, 2 attempts with backoff
│       ├── prompts/compare.txt← the exact instruction text sent to the model
│       └── pipeline/
│           ├── run.py         ← orchestrator: preprocess → vision_model →
│           │                     verdict_and_evidence → Report
│           ├── preprocess.py  ← resize, JPEG encode, CLAHE lighting normalise,
│           │                     ORB+RANSAC view-overlap score
│           ├── verdict.py     ← deterministic rule layer: proposal → Finding
│           └── evidence.py    ← padded box crops → base64 JPEG evidence pairs
└── frontend/
    ├── app/page.tsx           ← entire UI: upload, health, analyze, report render
    ├── app/layout.tsx         ← title/metadata + fonts + globals.css
    └── lib/api.ts             ← TS types + checkHealth() + analyzeSets() +
                                  evidenceSrc() (base64 → data URL)
```

## 4. Data contracts (the shape everything agrees on)

Coordinates use a **0–1000 normalised box**: `{ image, ymin, xmin, ymax, xmax }`,
where `image` is the index **inside its own set** (0–2).

The vision model proposes (`LLMResult.objects`, ≤5 after truncation):

```json
{
  "name": "blue mug",
  "before": { "image": 0, "ymin": 100, "xmin": 200, "ymax": 400, "xmax": 450 },
  "after": null,
  "proposed_change": "removed",
  "match_confidence": 0.85,
  "other_view_covers_location": true,
  "note": "why the model thinks so"
}
```

The backend decides (`Finding`) and the frontend renders it:

```json
{
  "name": "blue mug",
  "change": "removed",
  "status": "supported",
  "reason": "…",
  "extra_angle_request": "… (only when uncertain / not_verifiable)",
  "evidence": { "before_b64": "<jpeg base64>", "after_b64": "<jpeg base64>" }
}
```

The final `Report` has exactly four buckets plus metrics:

```json
{ "supported": [], "uncertain": [], "not_verifiable": [], "unchanged": [], "metrics": {} }
```

## 5. Complete working procedure (end to end)

### Step 0 — Start both servers

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app          # → http://127.0.0.1:8000
cd ..\frontend
node node_modules/next/dist/bin/next dev                # → http://localhost:3000
```

### Step 1 — User picks input images (frontend, `PickSet` in `page.tsx`)

- Two pickers: **Before** and **After**. Each accepts `image/*`, `multiple`.
- Client rule: keep only `file.type.startsWith("image/")`, cap at
  `MAX_PER_SET = 3` via `[...prev, ...images].slice(0, 3)`.
- Previews use `URL.createObjectURL` (`usePreviews`) and are revoked on change.
- The **Compare sets** button enables only when both sides have 1–3 files.
- Optional **Check health** calls `GET {backend}/health` → `{ ok, model }`;
  CORS on the backend allows `http://localhost:3000` and `http://127.0.0.1:3000`.

How to photograph (to satisfy the task's controlled scene):

1. One small desk/room scene, up to 5 salient movable objects.
2. Take 1–3 before photos.
3. Move one object, add one object, change lighting/viewpoint, hide one object
   in the second view (occluded or out of frame).
4. Take 1–3 after photos. Also keep a no-change pair (same scene, only
   lighting differs) to check for false positives.

### Step 2 — Upload (frontend `lib/api.ts → analyzeSets`)

```ts
const form = new FormData();
for (const f of before) form.append("before", f, f.name);
for (const f of after) form.append("after", f, f.name);
await fetch(`${backend}/analyze`, { method: "POST", body: form, signal });
```

Field names **`before` / `after`** must match the FastAPI parameters exactly.
An `AbortController` powers Cancel; an elapsed timer is shown while waiting.

### Step 3 — Request validation (backend `server.py → analyze`)

- Each side must have `1 <= len <= MAX_PHOTOS_PER_SET (3)`, else **400**.
- Files are read to bytes (`await f.read()`), then `analyze_sets(b, a)`.
- `RuntimeError` (vision failure) → **502**; any other processing error → **422**.

### Step 4 — Pipeline stage 1: preprocess (`pipeline/run.py` + `preprocess.py`)

Timed as `metrics.stage("preprocess")`:

1. `load_resized`: EXIF-transpose → RGB → thumbnail to `MAX_IMAGE_EDGE`
   (default 1280). Keeps cost/pixels bounded, preserves aspect.
2. `estimate_view_overlap`: for every before×after pair, grayscale → ORB-1500
   keypoints → Hamming cross-matched descriptors → `findHomography(RANSAC)`
   inlier ratio. The **max** over pairs is `overlap` (0–1). It independently
   checks the model's `other_view_covers_location` claim later.
3. Images are JPEG-encoded (`quality=88`) for the model call.

### Step 5 — Pipeline stage 2: vision proposal (`vision_client.py` + `prompts/compare.txt`)

Timed as `metrics.stage("vision_model")`. Single provider entry point
(swap providers only here):

1. Contents = text header (`BEFORE set: N image(s), then AFTER set: …`) +
   all before JPEGs + all after JPEGs + the `compare.txt` prompt.
2. `generate_content` with `response_mime_type="application/json"`,
   `response_schema=LLMResult`, `temperature=0`, up to **2 attempts** with
   `sleep(1.5 × attempt)` backoff. Each attempt is logged
   (`latency_s, tokens_in, tokens_out, ok, attempt`).
3. Response text is validated as `LLMResult` (Pydantic). Total failure raises
   `RuntimeError` → HTTP 502.

Prompt rules (summary): ≤5 movable objects; lighting/shadow/exposure/angle
are **not** changes; `removed`/`added` require the *other* set to show that
spot comparably (else `other_view_covers_location=false`); `moved` needs same
identity; lower `match_confidence` when unsure; box `null` when not visible;
never invent objects; JSON only.

### Step 6 — Pipeline stage 3: verdict + evidence (`verdict.py`, `evidence.py`)

Timed as `metrics.stage("verdict_and_evidence")`. Only the first
`MAX_OBJECTS (5)` proposals are kept. The model **proposes**, this code
**decides** (`verdict.decide(obj, overlap)`):

- `added`/`removed`: needs `covered = other_view_covers_location AND
  overlap >= 0.15`. If not covered → `not_verifiable` + `extra_angle_request`
  ("photograph the original/new location from roughly the same angle").
  If covered but `match_confidence < 0.6` → `uncertain`. Else `supported`.
- `moved`: needs boxes in **both** sets; centre-shift
  `sqrt(dx²+dy²)` on the 0–1000 scale must be `>= MOVE_THRESHOLD (60)`,
  else it is `unchanged/supported` ("within view-change tolerance").
  Low confidence → `uncertain`.
- `unchanged` → `supported`, **no evidence crop stored** (deliberate: nothing
  isolated to show; `run.py` skips `make_pair` for this case).
- `unclear` / fallthrough → `uncertain` + close-up request.

Evidence (`evidence.make_pair`): for each non-unchanged finding, crop the
referenced image (`box.image`) with 8% padding, after CLAHE lighting
normalisation, encode to JPEG base64. Either side may be `null` (object not
visible there). If both are missing, `evidence` is `null`.

### Step 7 — Metrics (`metrics.py`)

`RunMetrics.summary()` returns per-set cost/time:

- `total_s`, `stages_s { preprocess, vision_model, verdict_and_evidence }`
- `model`, `model_calls`, `retries`, `tokens_in/out`
- `est_cost_usd_paid_equivalent = in/1e6×PRICE_IN + out/1e6×PRICE_OUT`
- `price_assumption { in_per_M, out_per_M, checked }`
- plus `view_overlap` added by `run.py`. Prices come from `.env`
  (currently `0.0 / YYYY-MM-DD` placeholder — update with real pricing).

### Step 8 — Report rendering (frontend `page.tsx` + `api.ts`)

On 200 the frontend stores the `Report` and renders:

1. **Summary**: four bucket counts + `time`, `model calls`, `cost $`,
   `view overlap`, `tokens in/out`, `model`, `stages`.
2. **✅ Supported** — confident, coverage-checked, each with paired
   before/after crops (or a "not available / out of frame" tile per side).
3. **❓ Uncertain** — low-confidence matches + amber `extra_angle_request`
   ("take a close photo … from the same side in both sets").
4. **🚫 Not verifiable** — hidden/occluded/out-of-frame; explicitly *not*
   claimed as removed/added.
5. **➖ Unchanged** — no physical change; "no evidence crop" note.
6. **Clear** resets files/report/error; **Cancel** aborts the fetch.

Base64 crops become `<img src="data:image/jpeg;base64,…">` via `evidenceSrc()`.

## 6. Worked example (maps to the task's required scene)

Before: mug centre, notebook left, lamp on, daylight, angles B1–B2.
After: mug shifted right (**moved**), new pen added (**added**), lamp off /
warm light (**unchanged** — lighting only), notebook hidden behind box and its
old spot out of frame (**not_verifiable**, *not* "removed").

Expected report: `supported = [mug:moved + crop pair, pen:added + pair]`,
`unchanged = [lamp]`, `not_verifiable = [notebook + angle request]`,
`uncertain = []` unless a match is genuinely ambiguous. The no-change
lighting-only pair should yield `supported=[]`, `unchanged=[…]` — the false-positive check.

## 7. Errors and edge cases

| Symptom | Cause → fix |
|---|---|
| `ModuleNotFoundError: app.server` / `app.metrics` | Run from `backend/` with the venv python; keep `metrics.py` name and `prompts/compare.txt` path |
| Backend unreachable in UI | Start uvicorn on `:8000`; check health button; CORS covers both localhost and 127.0.0.1 origins |
| 400 `'before' needs 1-3 photos` | Upload 1–3 per side (frontend already enforces) |
| 422 `Could not process images` | Corrupt/non-image bytes slipped through; re-export as JPEG/PNG |
| 502 vision failed after 2 attempts | Bad `GEMINI_API_KEY`, quota/network, or bad JSON — retry; backoff is 1.5s/3s |
| `overlap` near 0 | Views barely share content — expect `not_verifiable`; re-shoot from a closer angle |
| `shift < 60` but object "moved a little" | Correctly reported `unchanged` — small shifts are within viewpoint tolerance |

## 8. Configuration knobs

`backend/.env`: `GEMINI_API_KEY`, `VISION_MODEL`, `MAX_IMAGE_EDGE`,
`PRICE_IN_PER_M`, `PRICE_OUT_PER_M`, `PRICE_DATE`.
`backend/app/config.py`: `MAX_PHOTOS_PER_SET=3`, `MAX_OBJECTS=5`,
`MIN_MATCH_CONFIDENCE=0.6`, `MOVE_THRESHOLD=60`.
`frontend`: `NEXT_PUBLIC_BACKEND_URL` (default `http://127.0.0.1:8000`).

## 9. Known limits / next steps

- Pricing is a placeholder (`0.0`, `YYYY-MM-DD`) — fill in real per-model
  prices before quoting costs.
- `unchanged` findings carry no crops by design; add "same-spot" thumbnails
  only if evaluators want visual proof of no-change.
- Single vision call per set; for flaky networks consider a third retry or
  cached fallback. Video input is intentionally not implemented.
