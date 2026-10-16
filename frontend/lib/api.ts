export type ChangeType = "added" | "removed" | "moved" | "unchanged" | "unclear";

export interface EvidencePair {
  before_b64?: string | null;
  after_b64?: string | null;
}

export interface Finding {
  name: string;
  change: ChangeType;
  status: string;
  reason: string;
  extra_angle_request?: string | null;
  evidence?: EvidencePair | null;
}

export interface ReportMetrics {
  total_s?: number;
  stages_s?: Record<string, number>;
  model?: string;
  model_calls?: number;
  retries?: number;
  tokens_in?: number;
  tokens_out?: number;
  est_cost_usd_paid_equivalent?: number;
  view_overlap?: number;
  price_assumption?: Record<string, number | string>;
  [k: string]: unknown;
}

export interface Report {
  supported: Finding[];
  uncertain: Finding[];
  not_verifiable: Finding[];
  unchanged: Finding[];
  metrics: ReportMetrics;
}

export async function checkHealth(baseUrl: string): Promise<{ ok: boolean; model?: string }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function analyzeSets(
  baseUrl: string,
  before: File[],
  after: File[],
  signal?: AbortSignal,
): Promise<Report> {
  const form = new FormData();
  for (const f of before) form.append("before", f, f.name);
  for (const f of after) form.append("after", f, f.name);
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/analyze`, {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? JSON.stringify(j);
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* keep statusText */
      }
    }
    throw new Error(`Analyze failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as Report;
}

export function evidenceSrc(b64?: string | null): string | null {
  if (!b64) return null;
  if (b64.startsWith("data:")) return b64;
  return `data:image/jpeg;base64,${b64}`;
}
