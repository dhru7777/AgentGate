import type { Rule, Visit } from "../../types";

export type AnomalyKind = "disallowed-served" | "allowed-blocked";

export type Anomaly = {
  id: string;
  ts: string;
  agent: string;
  path: string;
  status: number;
  rule: string;
  purpose: string;
  kind: AnomalyKind;
};

export type RobotsRow = {
  id: string;
  name: string;
  access: "allowed" | "disallowed";
  purpose: string;
  robotsFetches: number;
  pageRequests: number;
};

function isRobotsPath(path: string): boolean {
  const name = path.toLowerCase().split("?")[0];
  return name === "/robots.txt" || name.endsWith("/robots.txt");
}

function bestRule(agent: string, rules: Rule[]): Rule | null {
  const name = agent.toLowerCase();
  let best: { rule: Rule; length: number } | null = null;
  for (const rule of rules) {
    for (const raw of rule.patterns.split(",")) {
      const pattern = raw.trim().toLowerCase();
      if (!pattern || !name.includes(pattern)) continue;
      if (!best || pattern.length > best.length) best = { rule, length: pattern.length };
    }
  }
  return best?.rule ?? null;
}

function purposeForRule(rule: Rule): string {
  if (rule.id === "openai") return "maybe · training or search";
  if (rule.category === "AI Training" || rule.category === "Data Aggregators") return "maybe · training";
  if (rule.category === "AI Search" || rule.category === "Search Engine") return "search";
  if (rule.category === "AI Assistant") return "maybe · assistant";
  return "maybe";
}

function purposeFor(agent: string, rule: Rule): string {
  const name = agent.toLowerCase();
  if (name.includes("gptbot")) return "training";
  if (name.includes("oai-search") || name.includes("perplexity") || rule.category === "Search Engine" || rule.category === "AI Search") {
    return "search";
  }
  if (name.includes("chatgpt-user") || name.includes("claude-web")) return "maybe · live fetch";
  if (rule.category === "AI Training" || rule.category === "Data Aggregators") return "maybe · training";
  if (rule.category === "AI Assistant") return "maybe · assistant";
  return "maybe";
}

export function findAnomalies(visits: Visit[], rules: Rule[]): Anomaly[] {
  const rows: Anomaly[] = [];
  for (const visit of visits) {
    if (isRobotsPath(visit.path)) continue;
    const rule = bestRule(visit.agent, rules);
    if (!rule) continue;
    const servedDespiteDisallow = !rule.allowed && visit.status === 200;
    const blockedDespiteAllow = rule.allowed && visit.status === 402;
    if (!servedDespiteDisallow && !blockedDespiteAllow) continue;
    rows.push({
      id: visit.id,
      ts: visit.ts,
      agent: visit.agent,
      path: visit.path,
      status: visit.status,
      rule: rule.name,
      purpose: purposeFor(visit.agent, rule),
      kind: servedDespiteDisallow ? "disallowed-served" : "allowed-blocked",
    });
  }
  rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return rows;
}

export function robotsTable(visits: Visit[], rules: Rule[]): RobotsRow[] {
  return rules
    .filter((rule) => rule.patterns.trim())
    .map((rule) => {
      const matched = visits.filter((visit) => bestRule(visit.agent, rules)?.id === rule.id);
      return {
        id: rule.id,
        name: rule.name,
        access: rule.allowed ? "allowed" : "disallowed",
        purpose: purposeForRule(rule),
        robotsFetches: matched.filter((visit) => isRobotsPath(visit.path)).length,
        pageRequests: matched.filter((visit) => !isRobotsPath(visit.path)).length,
      };
    });
}
