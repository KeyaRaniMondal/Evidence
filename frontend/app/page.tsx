"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeSets,
  checkHealth,
  evidenceSrc,
  type Finding,
  type Report,
} from "../lib/api";

const MAX_PER_SET = 3;
const DEFAULT_BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

function usePreviews(files: File[]): string[] {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

function changeBadge(change: string): string {
  switch (change) {
    case "added":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
    case "removed":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200";
    case "moved":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200";
    case "unchanged":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  }
}

function PickSet({
  title,
  hint,
  files,
  onPick,
  onRemove,
  inputId,
}: {
  title: string;
  hint: string;
  files: File[];
  onPick: (picked: File[]) => void;
  onRemove: (index: number) => void;
  inputId: string;
}) {
  const previews = usePreviews(files);
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
        <span
          className={`text-xs font-mono ${files.length > MAX_PER_SET ? "text-rose-600" : "text-zinc-500"}`}
        >
          {files.length} / {MAX_PER_SET}
        </span>
      </div>
      <p className="mb-3 text-xs text-zinc-500">{hint}</p>
      <label
        htmlFor={inputId}
        className="block cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 transition hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
      >
        Drop or click to add photos (up to {MAX_PER_SET})
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (picked.length) onPick(picked);
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[i]}
                alt={`${title} photo ${i + 1}`}
                className="aspect-square w-full rounded-lg object-cover"
              />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {title === "Before" ? "B" : "A"}
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${title} photo ${i + 1}`}
                className="absolute top-1 right-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceFigure({ label, b64 }: { label: string; b64?: string | null }) {
  const src = evidenceSrc(b64);
  if (!src) {
    return (
      <figure className="flex-1">
        <div className="flex aspect-square items-center justify-center rounded-lg bg-zinc-100 p-3 text-center text-xs text-zinc-500 dark:bg-zinc-800">
          {label} view not available
          <br />
          (out of frame / hidden)
        </div>
        <figcaption className="mt-1 text-center font-mono text-[11px] text-zinc-500">
          {label}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className="flex-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${label} evidence crop`}
        className="aspect-square w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
      />
      <figcaption className="mt-1 text-center font-mono text-[11px] text-zinc-500">
        {label}
      </figcaption>
    </figure>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">{finding.name}</h4>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${changeBadge(finding.change)}`}
        >
          {finding.change}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {finding.status}
        </span>
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{finding.reason}</p>
      {finding.extra_angle_request && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          📷 Needed: {finding.extra_angle_request}
        </p>
      )}
      {finding.evidence ? (
        <div className="mt-3 flex gap-2">
          <EvidenceFigure label="Before" b64={finding.evidence.before_b64} />
          <EvidenceFigure label="After" b64={finding.evidence.after_b64} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">
          No evidence crop — object visible in both sets with no isolated change region.
        </p>
      )}
    </article>
  );
}

function ResultSection({
  title,
  description,
  findings,
  empty,
}: {
  title: string;
  description: string;
  findings: Finding[];
  empty: string;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-base font-semibold">
          {title}{" "}
          <span className="font-mono text-sm text-zinc-500">({findings.length})</span>
        </h3>
      </div>
      <p className="mb-3 text-xs text-zinc-500">{description}</p>
      {findings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
          {empty}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {findings.map((f, i) => (
            <FindingCard key={`${f.name}-${i}`} finding={f} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND);
  const [health, setHealth] = useState<
    { state: "idle" | "checking" | "ok" | "fail"; model?: string; error?: string }
  >({ state: "idle" });
  const [before, setBefore] = useState<File[]>([]);
  const [after, setAfter] = useState<File[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const addFiles = useCallback(
    (side: "before" | "after", picked: File[]) => {
      setReport(null);
      setError(null);
      const images = picked.filter((f) => f.type.startsWith("image/"));
      if (images.length !== picked.length) {
        setError("Only image files are accepted — non-images were skipped.");
      }
      const setter = side === "before" ? setBefore : setAfter;
      setter((prev) => [...prev, ...images].slice(0, MAX_PER_SET));
    },
    [],
  );

  const removeAt = useCallback((side: "before" | "after", index: number) => {
    setReport(null);
    (side === "before" ? setBefore : setAfter)((prev) =>
      prev.filter((_, i) => i !== index),
    );
  }, []);

  const valid =
    before.length >= 1 &&
    before.length <= MAX_PER_SET &&
    after.length >= 1 &&
    after.length <= MAX_PER_SET;

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setElapsed((s) => s + 0.1), 100);
    return () => clearInterval(t);
  }, [loading]);

  const onCheckHealth = useCallback(async () => {
    setHealth({ state: "checking" });
    try {
      const h = await checkHealth(backendUrl);
      setHealth({ state: "ok", model: h.model ?? "unknown" });
    } catch (e) {
      setHealth({ state: "fail", error: e instanceof Error ? e.message : String(e) });
    }
  }, [backendUrl]);

  // Health is checked on demand via the button (avoids set-state-in-effect).
  // Run once manually if desired — no auto effect here.

  const onAnalyze = useCallback(async () => {
    if (!valid || loading) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setElapsed(0);
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const r = await analyzeSets(backendUrl, before, after, ctrl.signal);
      setReport(r);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [valid, loading, backendUrl, before, after]);

  const onReset = useCallback(() => {
    abortRef.current?.abort();
    setBefore([]);
    setAfter([]);
    setReport(null);
    setError(null);
    setLoading(false);
  }, []);

  const metrics = useMemo(() => report?.metrics ?? null, [report]);

  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">
            Room Evidence — before / after diff
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            Upload 1–3 “before” and 1–3 “after” photos of the same small scene.
            The backend matches up to 5 salient objects and reports{" "}
            <em>added / removed / moved</em> with paired evidence crops.
            Lighting or viewpoint changes alone are never reported as physical
            changes; hidden or out-of-frame objects are{" "}
            <em>not verifiable</em>, not “removed”. No manual labeling needed.
          </p>
        </header>

        <section className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end dark:border-zinc-800 dark:bg-zinc-950">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium">Backend URL</span>
            <input
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value.trim() || DEFAULT_BACKEND)}
              className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-zinc-700"
              placeholder="http://127.0.0.1:8000"
            />
          </label>
          <button
            type="button"
            onClick={onCheckHealth}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {health.state === "checking" ? "Checking…" : "Check health"}
          </button>
          <div className="text-xs" role="status">
            {health.state === "ok" && (
              <span className="text-emerald-600">
                ● backend ok{health.model ? ` · ${health.model}` : ""}
              </span>
            )}
            {health.state === "fail" && (
              <span className="text-rose-600" title={health.error}>
                ● backend unreachable — start it with `python -m uvicorn main:app`
              </span>
            )}
            {health.state === "checking" && <span className="text-zinc-500">● …</span>}
            {health.state === "idle" && <span className="text-zinc-500">● unknown</span>}
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <PickSet
            title="Before"
            hint="Original state — 1 to 3 photos, same desk/room."
            files={before}
            inputId="before-files"
            onPick={(p) => addFiles("before", p)}
            onRemove={(i) => removeAt("before", i)}
          />
          <PickSet
            title="After"
            hint="Changed state — 1 to 3 photos. Try a different light or angle."
            files={after}
            inputId="after-files"
            onPick={(p) => addFiles("after", p)}
            onRemove={(i) => removeAt("after", i)}
          />
        </div>

        {!valid && (
          <p className="text-sm text-zinc-500">
            Add at least one photo to each set (max {MAX_PER_SET} per set) to run
            the comparison.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!valid || loading}
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-300"
          >
            {loading ? `Analyzing… ${elapsed.toFixed(1)}s` : "Compare sets"}
          </button>
          {(before.length > 0 || after.length > 0 || report || error) && (
            <button
              type="button"
              onClick={onReset}
              disabled={loading}
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Clear
            </button>
          )}
          {loading && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="text-sm text-zinc-500 underline"
            >
              Cancel
            </button>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
            <p className="font-semibold">Analysis failed</p>
            <p className="mt-1 font-mono text-xs break-words whitespace-pre-wrap">{error}</p>
            <p className="mt-2 text-xs">
              Is the backend running? <code>cd backend && .venv\Scripts\python.exe -m uvicorn main:app</code>
            </p>
          </div>
        )}

        {report && (
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-2 text-base font-semibold">Summary</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950">
                  <dt className="text-xs text-zinc-500">Supported</dt>
                  <dd className="font-mono text-lg font-bold">{report.supported.length}</dd>
                </div>
                <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950">
                  <dt className="text-xs text-zinc-500">Uncertain</dt>
                  <dd className="font-mono text-lg font-bold">{report.uncertain.length}</dd>
                </div>
                <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800">
                  <dt className="text-xs text-zinc-500">Not verifiable</dt>
                  <dd className="font-mono text-lg font-bold">{report.not_verifiable.length}</dd>
                </div>
                <div className="rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800">
                  <dt className="text-xs text-zinc-500">Unchanged</dt>
                  <dd className="font-mono text-lg font-bold">{report.unchanged.length}</dd>
                </div>
              </dl>
              {metrics && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-zinc-600 sm:grid-cols-4 dark:text-zinc-400">
                  <div>time: <b>{metrics.total_s ?? "?"}s</b></div>
                  <div>model calls: <b>{metrics.model_calls ?? "?"}</b></div>
                  <div>
                    cost: <b>${metrics.est_cost_usd_paid_equivalent ?? "?"}</b>
                  </div>
                  <div>
                    view overlap: <b>{metrics.view_overlap ?? "?"}</b>
                  </div>
                  <div className="col-span-2">
                    tokens: <b>{metrics.tokens_in ?? "?"} in / {metrics.tokens_out ?? "?"} out</b>
                  </div>
                  <div className="col-span-2">
                    model: <b>{String(metrics.model ?? "?")}</b>
                  </div>
                  {metrics.stages_s && (
                    <div className="col-span-2">
                      stages: <b>{JSON.stringify(metrics.stages_s)}</b>
                    </div>
                  )}
                </dl>
              )}
            </section>

            <ResultSection
              title="✅ Supported changes"
              description="Confident claims backed by comparable coverage in both sets, each with a paired before/after crop."
              findings={report.supported}
              empty="No supported changes — either nothing moved or nothing could be verified."
            />
            <ResultSection
              title="❓ Uncertain — needs another angle"
              description="Low-confidence matches. Take the requested close-up from the same side in both states."
              findings={report.uncertain}
              empty="No uncertain matches."
            />
            <ResultSection
              title="🚫 Not verifiable"
              description="The other set doesn't show the location comparably (hidden, occluded, out of frame). Not claimed as removed/added."
              findings={report.not_verifiable}
              empty="Everything claimed was covered in both views."
            />
            <ResultSection
              title="➖ Unchanged"
              description="Present in both sets with no physical change (lighting/viewpoint differences ignored). No crop stored."
              findings={report.unchanged}
              empty="No confirmed-unchanged objects."
            />
          </div>
        )}

        <footer className="text-xs text-zinc-500">
          Scope: small room / desk scenes, ≤5 objects, add / remove / move only — no
          damage valuation. Video not required.
        </footer>
      </main>
    </div>
  );
}
