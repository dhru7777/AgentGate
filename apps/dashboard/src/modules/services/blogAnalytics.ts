import { defaultRules } from "../../data";
import type { Range, Rule, Summary, Visit } from "../../types";

/** Live blog analytics. The page lock is the current password on /analytics/. */
const ORIGIN = "https://dheeraj-work.netlify.app";
const VERIFIED_KEY = "agentledger.blogVerified";

export const LIVE_BLOG_ANALYTICS = `${ORIGIN}/analytics/`;

function accessKey(): string {
  return import.meta.env.VITE_BLOG_ANALYTICS_KEY || "1432";
}

export function blogIsVerified(): boolean {
  return localStorage.getItem(VERIFIED_KEY) === "1";
}

export function markBlogVerified() {
  localStorage.setItem(VERIFIED_KEY, "1");
}

type LivePayload = {
  ok?: boolean;
  error?: string;
  totalRequests: number;
  uniqueVisitors: number;
  aiAgentRequests: number;
  humanRequests: number;
  blogRequests: number;
  paymentRequired: number;
  paidRequests: number;
  revenueUsdc: number;
  goodVisitors: number;
  badVisitors: number;
  paidVisitors: number;
  topAgent: { name: string; count: number } | null;
  topBlog: { name: string; count: number } | null;
  series: Summary["series"];
  topAgents: { name: string; count: number }[];
  goodAgents: { name: string; count: number }[];
  badAgents: { name: string; count: number }[];
  paidAgents: { name: string; count: number }[];
  topPages: { name: string; count: number }[];
  places: { country: string; city: string; lat: number; lon: number; count: number }[];
  recent: {
    ts: string;
    path: string;
    kind: string;
    agent: string;
    status: number;
    lat?: number;
    lon?: number;
    country?: string;
    city?: string;
    durationMs?: number;
  }[];
  updatedAt?: string;
};

function dayLabel(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const SESSION_GAP_MS = 30 * 60 * 1000;

function measuredDuration(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Same client and place, split when requests are more than 30 minutes apart. */
function visitorKey(visit: Visit): string {
  return [visit.agent, visit.city, visit.country, visit.lat, visit.lon].join("|");
}

function withTimeSpent(visits: Visit[]): Visit[] {
  const groups = new Map<string, number[]>();
  visits.forEach((visit, index) => {
    if (visit.durationMs != null) return;
    const key = visitorKey(visit);
    const indexes = groups.get(key) ?? [];
    indexes.push(index);
    groups.set(key, indexes);
  });

  const durationMs = visits.map((visit) => visit.durationMs);
  for (const indexes of groups.values()) {
    const ordered = [...indexes].sort((a, b) => Date.parse(visits[a].ts) - Date.parse(visits[b].ts));
    let session: number[] = [];
    const close = () => {
      if (session.length < 2) {
        session = [];
        return;
      }
      const span = Date.parse(visits[session[session.length - 1]].ts) - Date.parse(visits[session[0]].ts);
      if (span >= 0) {
        for (const index of session) durationMs[index] = span;
      }
      session = [];
    };
    for (const index of ordered) {
      const previous = session[session.length - 1];
      if (previous != null && Date.parse(visits[index].ts) - Date.parse(visits[previous].ts) > SESSION_GAP_MS) close();
      session.push(index);
    }
    close();
  }

  return visits.map((visit, index) => ({ ...visit, durationMs: durationMs[index] }));
}

function toSummary(data: LivePayload): Summary {
  const recent = withTimeSpent(
    data.recent.map((row, index) => ({
      id: `${row.ts}-${index}`,
      serviceId: "blog",
      ts: row.ts,
      path: row.path,
      kind: row.kind,
      agent: row.agent,
      agentId: null,
      outcome: row.status === 402 ? "good" : "human",
      status: row.status,
      city: row.city || row.country || "",
      country: row.country || "",
      lat: row.lat ?? 0,
      lon: row.lon ?? 0,
      amountUsdc: 0,
      durationMs: measuredDuration(row.durationMs),
    })),
  );
  const status = new Map<string, number>();
  for (const row of recent) {
    const name = String(row.status);
    status.set(name, (status.get(name) ?? 0) + 1);
  }
  return {
    totalRequests: data.totalRequests,
    uniqueVisitors: data.uniqueVisitors,
    aiAgentRequests: data.aiAgentRequests,
    humanRequests: data.humanRequests,
    blogRequests: data.blogRequests,
    paymentRequired: data.paymentRequired,
    paidRequests: data.paidRequests,
    revenueUsdc: data.revenueUsdc,
    goodVisitors: data.goodVisitors,
    badVisitors: data.badVisitors,
    paidVisitors: data.paidVisitors,
    topAgent: data.topAgent,
    topBlog: data.topBlog,
    series: data.series.map((row) => ({ ...row, t: dayLabel(row.t) })),
    status: [...status.entries()].map(([name, count]) => ({ name, count })),
    topAgents: data.topAgents,
    goodAgents: data.goodAgents,
    badAgents: data.badAgents,
    paidAgents: data.paidAgents,
    topPages: data.topPages,
    places: data.places.map((place) => ({
      country: place.country,
      city: place.city || place.country,
      lat: place.lat,
      lon: place.lon,
      count: place.count,
    })),
    recent,
  };
}

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = encodeURIComponent(accessKey());
  const join = path.includes("?") ? "&" : "?";
  const response = await fetch(`${ORIGIN}${path}${join}auth=${auth}`, init);
  const data = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Analytics request failed");
  }
  return data;
}

export async function fetchBlogAnalytics(range: Range): Promise<Summary> {
  const data = await readJson<LivePayload>(`/api/analytics?range=${range}`);
  return toSummary(data);
}

export async function fetchBlogRules(): Promise<Rule[]> {
  const known = new Map(defaultRules("blog").map((rule) => [rule.id, rule.agentId]));
  const data = await readJson<{ rules: Rule[] }>("/api/bot-rules");
  return data.rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    category: rule.category,
    allowed: rule.allowed,
    patterns: rule.patterns ?? "",
    agentId: known.get(rule.id) ?? null,
  }));
}

export async function updateBlogRules(body: { id: string; allowed: boolean } | { action: string }): Promise<Rule[]> {
  const data = await readJson<{ rules: Rule[] }>("/api/bot-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": accessKey() },
    body: JSON.stringify(body),
  });
  const known = new Map(defaultRules("blog").map((rule) => [rule.id, rule.agentId]));
  return data.rules.map((rule) => ({
    ...rule,
    patterns: rule.patterns ?? "",
    agentId: known.get(rule.id) ?? rule.agentId ?? null,
  }));
}
