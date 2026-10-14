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
    purpose?: string;
    ref?: string;
    robots?: string;
    vid?: string;
    ua?: string;
  }[];
  updatedAt?: string;
  since?: string;
};

export type AccessHit = {
  id: string;
  ts: string;
  path: string;
  agent: string;
  status: number;
  durationMs: number | null;
};

export type BlogAccessLog = {
  since: string;
  updatedAt: string;
  totalRequests: number;
  revenueUsdc: number;
  hits: AccessHit[];
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


/** The owner's own test traffic. Left out of every number the dashboard shows. */
export const TEST_TRAFFIC_NOTE = "test traffic from Cursor and today's MapleLabsBot testing excluded";

type LiveRow = LivePayload["recent"][number];

// Everything MapleLabsBot sent during today's build-and-test session, before this was deployed.
// Only a fixed cutoff, not "MapleLabsBot" as a whole: once real visitors (judges, etc.) start
// using the live demo, that traffic is real and should show up in the dashboard like any other.
const TEST_SESSION_END = Date.parse("2026-10-10T02:52:20.000Z");

function isTestRow(row: LiveRow): boolean {
  // Cursor is the owner's own testing tool. The "verify" probes are the demo checking a policy
  // change went live. Filtering by city (e.g. Austin) was tried earlier and removed, 481 of the
  // blog's 500 most recent rows were tagged Austin and most of those were real traffic, not the
  // owner's testing, excluding a whole city was far too broad and hid real data.
  if (row.agent === "Cursor" || /maplelabsbot-verify/i.test(row.ua ?? "")) return true;
  const isMapleLabsBot = row.agent === "MapleLabsBot" || /maplelabsbot/i.test(row.ua ?? "");
  return isMapleLabsBot && Date.parse(row.ts) <= TEST_SESSION_END;
}

function pageKey(path: string): string {
  const clean = path.toLowerCase().replace(/\.html$/, "");
  return clean.length > 1 ? clean.replace(/\/$/, "") : clean;
}

function dropCounts(list: { name: string; count: number }[], remove: Map<string, number>): { name: string; count: number }[] {
  return list
    .filter((item) => item.name !== "Cursor")
    .map((item) => ({ ...item, count: item.count - (remove.get(item.name) ?? 0) }))
    .filter((item) => item.count > 0);
}

/** Totals come from the server, so test rows are subtracted from them using the rows we can see. */
function withoutTestTraffic(data: LivePayload): LivePayload {
  const test = data.recent.filter(isTestRow);
  if (test.length === 0) return { ...data, topAgents: dropCounts(data.topAgents, new Map()) };
  const byAgent = new Map<string, number>();
  const byPage = new Map<string, number>();
  const byDay = new Map<string, { requests: number; human: number; ai: number }>();
  for (const row of test) {
    byAgent.set(row.agent, (byAgent.get(row.agent) ?? 0) + 1);
    byPage.set(pageKey(row.path), (byPage.get(pageKey(row.path)) ?? 0) + 1);
    const day = row.ts.slice(0, 10);
    const entry = byDay.get(day) ?? { requests: 0, human: 0, ai: 0 };
    entry.requests += 1;
    if (row.kind === "human") entry.human += 1;
    if (row.kind === "ai_agent") entry.ai += 1;
    byDay.set(day, entry);
  }
  const count = (match: (row: LiveRow) => boolean) => test.filter(match).length;
  const isPost = (row: LiveRow) => /^\/\d{4}\/\d{2}\/\d{2}\//.test(row.path);
  return {
    ...data,
    totalRequests: Math.max(0, data.totalRequests - test.length),
    aiAgentRequests: Math.max(0, data.aiAgentRequests - count((row) => row.kind === "ai_agent")),
    humanRequests: Math.max(0, data.humanRequests - count((row) => row.kind === "human")),
    blogRequests: Math.max(0, data.blogRequests - count(isPost)),
    paymentRequired: Math.max(0, data.paymentRequired - count((row) => row.status === 402)),
    topAgents: dropCounts(data.topAgents, byAgent),
    goodAgents: dropCounts(data.goodAgents, new Map()),
    badAgents: dropCounts(data.badAgents, new Map()),
    paidAgents: dropCounts(data.paidAgents, new Map()),
    topPages: data.topPages
      .map((page) => ({ ...page, count: page.count - (byPage.get(pageKey(page.name)) ?? 0) }))
      .filter((page) => page.count > 0),
    places: data.places
      .map((place) => ({ ...place, count: place.count - test.filter((row) => (row.city || row.country) === place.city).length }))
      .filter((place) => place.count > 0),
    series: data.series.map((row) => {
      const gone = byDay.get(row.t);
      return gone
        ? { ...row, requests: Math.max(0, row.requests - gone.requests), human: Math.max(0, row.human - gone.human), ai: Math.max(0, row.ai - gone.ai) }
        : row;
    }),
    recent: data.recent.filter((row) => !isTestRow(row)),
  };
}

function toSummary(raw: LivePayload): Summary {
  const data = withoutTestTraffic(raw);
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
      purpose: row.purpose,
      ref: row.ref,
      robots: row.robots,
      vid: row.vid,
      ua: row.ua,
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

const CACHE_MS = 60_000;

function cached<T>(path: string): T | null {
  try {
    const raw = sessionStorage.getItem(`agentledger.read:${path}`);
    if (!raw) return null;
    const hit = JSON.parse(raw) as { at: number; data: T };
    return Date.now() - hit.at < CACHE_MS ? hit.data : null;
  } catch {
    return null;
  }
}

function remember(path: string, data: unknown) {
  try {
    sessionStorage.setItem(`agentledger.read:${path}`, JSON.stringify({ at: Date.now(), data }));
  } catch { /* storage is optional */ }
}

function forget() {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith("agentledger.read:")) sessionStorage.removeItem(key);
  } catch { /* storage is optional */ }
}

// Reads are cached for a minute, so opening the landing page again does not ask the blog again.
async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const isRead = !init || !init.method || init.method === "GET";
  if (isRead) {
    const hit = cached<T>(path);
    if (hit) return hit;
  } else {
    forget();
  }
  const auth = encodeURIComponent(accessKey());
  const join = path.includes("?") ? "&" : "?";
  const response = await fetch(`${ORIGIN}${path}${join}auth=${auth}`, init);
  const data = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Analytics request failed");
  }
  if (isRead) remember(path, data);
  return data;
}

export async function fetchBlogAnalytics(range: Range): Promise<Summary> {
  const data = await readJson<LivePayload>(`/api/analytics?range=${range}`);
  return toSummary(data);
}

/** Request rows the blog still has for this period. Invoices are built from these, not from sample visits. */
export async function fetchBlogAccessLog(range: Range): Promise<BlogAccessLog> {
  const data = withoutTestTraffic(await readJson<LivePayload>(`/api/analytics?range=${range}`));
  return {
    since: data.since ?? "",
    updatedAt: data.updatedAt ?? "",
    totalRequests: data.totalRequests,
    revenueUsdc: data.revenueUsdc,
    hits: data.recent.map((row, index) => ({
      id: `${row.ts}-${index}-${row.path}`,
      ts: row.ts,
      path: row.path,
      agent: row.agent,
      status: row.status,
      durationMs: measuredDuration(row.durationMs),
    })),
  };
}

export async function fetchBlogRules(): Promise<Rule[]> {
  const known = new Map(defaultRules("blog").map((rule) => [rule.id, rule.agentId]));
  const data = await readJson<{ rules: Rule[] }>("/api/bot-rules");
  return data.rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    category: rule.category,
    allowed: rule.allowed,
    charge: rule.charge === true && !rule.allowed,
    patterns: rule.patterns ?? "",
    agentId: known.get(rule.id) ?? null,
  }));
}

export async function updateBlogRules(body: { id: string; allowed: boolean; charge?: boolean } | { action: string }): Promise<Rule[]> {
  const data = await readJson<{ rules: Rule[] }>("/api/bot-rules", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": accessKey() },
    body: JSON.stringify(body),
  });
  const known = new Map(defaultRules("blog").map((rule) => [rule.id, rule.agentId]));
  return data.rules.map((rule) => ({
    ...rule,
    charge: rule.charge === true && !rule.allowed,
    patterns: rule.patterns ?? "",
    agentId: known.get(rule.id) ?? rule.agentId ?? null,
  }));
}
