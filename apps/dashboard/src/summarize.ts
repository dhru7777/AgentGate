import { IDENTITIES, NOW, SERVICES, VISITS } from "./data";
import type { Range, Summary, Visit } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export function rangeMs(range: Range): number {
  if (range === "day") return DAY;
  if (range === "week") return 7 * DAY;
  return 30 * DAY;
}

export function visitsInRange(serviceId: string, range: Range): Visit[] {
  const start = NOW.getTime() - rangeMs(range);
  return VISITS.filter((visit) => visit.serviceId === serviceId && new Date(visit.ts).getTime() >= start);
}

function tally(visits: Visit[], pick: (visit: Visit) => string | null): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const visit of visits) {
    const name = pick(visit);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function uniqueAgents(visits: Visit[]): number {
  return new Set(visits.map((visit) => visit.agent)).size;
}

function dayKey(ts: string, range: Range): string {
  const date = new Date(ts);
  if (range === "day") {
    return date.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function seriesFor(visits: Visit[], range: Range): Summary["series"] {
  const buckets = new Map<string, Summary["series"][number]>();
  const ordered: string[] = [];

  if (range === "day") {
    for (let hour = 0; hour < 24; hour += 1) {
      const label = new Date(Date.UTC(2026, 0, 1, hour)).toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" });
      ordered.push(label);
      buckets.set(label, { t: label, requests: 0, human: 0, ai: 0, blocked: 0, paid: 0 });
    }
  } else {
    const days = range === "week" ? 7 : 30;
    for (let ago = days - 1; ago >= 0; ago -= 1) {
      const date = new Date(NOW);
      date.setUTCDate(date.getUTCDate() - ago);
      const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      if (!buckets.has(label)) {
        ordered.push(label);
        buckets.set(label, { t: label, requests: 0, human: 0, ai: 0, blocked: 0, paid: 0 });
      }
    }
  }

  for (const visit of visits) {
    const key = dayKey(visit.ts, range);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.requests += 1;
    if (visit.kind === "human") bucket.human += 1;
    if (visit.kind === "ai") bucket.ai += 1;
    if (visit.status === 402) bucket.blocked += 1;
    if (visit.outcome === "paid") bucket.paid += 1;
  }

  return ordered.map((key) => buckets.get(key)!);
}

export function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? path;
  return last.replace(/\.html$/, "").replace(/[-_]/g, " ");
}

export function summarize(serviceId: string, range: Range): Summary {
  const recent = visitsInRange(serviceId, range).sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const agents = recent.filter((visit) => visit.kind === "ai");
  const good = agents.filter((visit) => visit.outcome === "good");
  const bad = agents.filter((visit) => visit.outcome === "bad");
  const paid = agents.filter((visit) => visit.outcome === "paid");
  const pages = recent.filter((visit) => visit.path.startsWith("/20") || visit.path.startsWith("/papers") || visit.path.startsWith("/datasets"));
  const topAgents = tally(agents, (visit) => visit.agent);
  const topPages = tally(pages, (visit) => shortPath(visit.path));
  const places = new Map<string, Summary["places"][number]>();
  for (const visit of recent) {
    const key = `${visit.country}|${visit.city}`;
    const current = places.get(key) ?? {
      country: visit.country,
      city: visit.city,
      lat: visit.lat,
      lon: visit.lon,
      count: 0,
    };
    current.count += 1;
    places.set(key, current);
  }

  const humanKeys = new Set(recent.filter((visit) => visit.kind === "human").map((visit) => visit.city));

  return {
    totalRequests: recent.length,
    uniqueVisitors: humanKeys.size + uniqueAgents(agents),
    aiAgentRequests: agents.length,
    humanRequests: recent.filter((visit) => visit.kind === "human").length,
    blogRequests: pages.length,
    paymentRequired: recent.filter((visit) => visit.status === 402).length,
    paidRequests: paid.length,
    revenueUsdc: paid.reduce((sum, visit) => sum + visit.amountUsdc, 0),
    goodVisitors: uniqueAgents(good),
    badVisitors: uniqueAgents(bad),
    paidVisitors: uniqueAgents(paid),
    topAgent: topAgents[0] ?? null,
    topBlog: topPages[0] ?? null,
    series: seriesFor(recent, range),
    status: tally(recent, (visit) => String(visit.status)),
    topAgents,
    goodAgents: tally(good, (visit) => visit.agent),
    badAgents: tally(bad, (visit) => visit.agent),
    paidAgents: tally(paid, (visit) => visit.agent),
    topPages,
    places: [...places.values()].sort((a, b) => b.count - a.count),
    recent,
  };
}

export function identitiesFor(serviceId: string | "all") {
  return IDENTITIES.filter((identity) => serviceId === "all" || identity.services.includes(serviceId));
}

export function serviceName(serviceId: string): string {
  return SERVICES.find((service) => service.id === serviceId)?.name ?? serviceId;
}

export function hitsFor(patterns: string, visits: Visit[]): number {
  if (!patterns) return 0;
  const parts = patterns.toLowerCase().split(",").map((part) => part.trim()).filter(Boolean);
  return visits.filter((visit) => parts.some((part) => visit.agent.toLowerCase().includes(part))).length;
}

export function robotsPreview(rules: { name: string; allowed: boolean; patterns: string }[], origin: string): string {
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const rule of rules) {
    if (!rule.patterns) continue;
    for (const pattern of rule.patterns.split(",")) {
      const trimmed = pattern.trim();
      if (!trimmed) continue;
      const name = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      const block = `User-agent: ${name}\n${rule.allowed ? "Allow" : "Disallow"}: /`;
      if (rule.allowed) allowed.push(block);
      else blocked.push(block);
    }
  }
  return `# AgentLedger\nUser-agent: *\nAllow: /\n\n${allowed.join("\n\n")}\n\n${blocked.join("\n\n")}\n\nSitemap: ${origin}/sitemap.xml`;
}
