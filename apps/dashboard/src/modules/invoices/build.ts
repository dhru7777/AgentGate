import { scan8004AgentUrl } from "../chain/monad";
import { KNOWN_INVOICE_AGENT } from "../erc8004/knownAgent";
import type { AccessHit } from "../services/blogAnalytics";
import type { Rule } from "../../types";

export type InvoicePeriod = "3d" | "day" | "week" | "month";

/** Published price on https://dheeraj-work.netlify.app/llms.txt and the live HTTP 402 body. */
export const ACCESS_RATE_USDC = 0.01;

export const PAY_TO = "0x8873cD8D93D6FDee9d21F699723C90eeC783747e";

export const PAY_NETWORK = "Base";

export const TARIFF_URL = "https://dheeraj-work.netlify.app/llms.txt";

export const ROBOTS_URL = "https://dheeraj-work.netlify.app/robots.txt";

export const ISSUER = {
  name: KNOWN_INVOICE_AGENT.name,
  agentId: KNOWN_INVOICE_AGENT.agentId,
  wallet: KNOWN_INVOICE_AGENT.wallet,
  verifyUrl: scan8004AgentUrl(KNOWN_INVOICE_AGENT.agentId),
  site: "dheeraj.blog",
  origin: "https://dheeraj-work.netlify.app",
};

export type InvoiceLine = {
  id: string;
  ts: string;
  agent: string;
  path: string;
  status: number;
  durationMs: number | null;
  amountUsdc: number;
};

export type CompanyInvoice = {
  id: string;
  ruleId: string;
  company: string;
  category: string;
  patterns: string;
  robotsTxt: string;
  reason: string;
  periodLabel: string;
  range: InvoicePeriod;
  lines: InvoiceLine[];
  stoppedCount: number;
  amountUsdc: number;
  status: "pending" | "none";
  logNote: string;
  settlementNote: string;
};

export function formatUsdc(amount: number): string {
  return `${(Math.round(amount * 100) / 100).toFixed(2)} USDC`;
}

export function formatWhen(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return `${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

export function formatTimeSpent(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "Not recorded";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

/** Same Disallow lines the live robots.txt publishes for a gated company. */
export function robotsDisallow(patterns: string): string {
  return patterns
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((pattern) => {
      const name = pattern.charAt(0).toUpperCase() + pattern.slice(1);
      return `User-agent: ${name}\nDisallow: /`;
    })
    .join("\n\n");
}

function periodLabel(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "Access log";
  return `${from.toLocaleDateString("en-US", opts)} - ${to.toLocaleDateString("en-US", opts)} UTC`;
}

function invoiceId(ruleId: string, end: string, range: InvoicePeriod): string {
  const date = new Date(end);
  const stamp = Number.isNaN(date.getTime())
    ? "LOG"
    : `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `AG-${stamp}-${range.toUpperCase()}-${ruleId.toUpperCase()}`;
}

function matchRule(agent: string, rules: Rule[]): Rule | null {
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

function reasonFor(charged: number, stopped: number): string {
  if (charged > 0) {
    return "robots.txt disallows these agents. Each line below returned HTTP 200, so the page was delivered after Disallow. That is a pending charge. HTTP 402 means the paywall stopped the fetch, and those requests are not billed.";
  }
  if (stopped > 0) {
    return "robots.txt disallows these agents. Every logged request was stopped with HTTP 402, so the page was not delivered and nothing is pending.";
  }
  return "No requests from this company are in the access log for this period.";
}

export function buildCompanyInvoices(input: {
  rules: Rule[];
  hits: AccessHit[];
  periodStart: string;
  periodEnd: string;
  range: InvoicePeriod;
  totalRequests: number;
  revenueUsdc: number;
  logNote?: string;
}): CompanyInvoice[] {
  const disallowed = input.rules.filter((rule) => !rule.allowed && rule.patterns.trim());
  const charged = new Map<string, InvoiceLine[]>();
  const stopped = new Map<string, number>();
  for (const rule of disallowed) {
    charged.set(rule.id, []);
    stopped.set(rule.id, 0);
  }

  for (const hit of input.hits) {
    const rule = matchRule(hit.agent, input.rules);
    if (!rule || rule.allowed || !charged.has(rule.id)) continue;
    if (hit.status === 200) {
      charged.get(rule.id)?.push({
        id: hit.id,
        ts: hit.ts,
        agent: hit.agent,
        path: hit.path,
        status: hit.status,
        durationMs: hit.durationMs,
        amountUsdc: ACCESS_RATE_USDC,
      });
    } else if (hit.status === 402) {
      stopped.set(rule.id, (stopped.get(rule.id) ?? 0) + 1);
    }
  }

  const label = periodLabel(input.periodStart, input.periodEnd);
  const logNote = input.logNote ?? (input.hits.length < input.totalRequests
    ? `Itemized from ${input.hits.length.toLocaleString()} request rows returned for this period. The site stores ${input.totalRequests.toLocaleString()} requests in total. Rows that are no longer in the log are not billed.`
    : `Itemized from ${input.hits.length.toLocaleString()} request rows in this period.`);
  const settlementNote = input.revenueUsdc > 0
    ? `The site recorded ${formatUsdc(input.revenueUsdc)} in this period. Those payments are not tied to a company in the log, so this invoice stays pending.`
    : "No payment is recorded against this invoice.";

  return disallowed
    .map((rule) => {
      const lines = (charged.get(rule.id) ?? []).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
      const stoppedCount = stopped.get(rule.id) ?? 0;
      const amountUsdc = Math.round(lines.reduce((sum, line) => sum + line.amountUsdc, 0) * 100) / 100;
      return {
        id: invoiceId(rule.id, input.periodEnd, input.range),
        ruleId: rule.id,
        company: rule.name,
        category: rule.category,
        patterns: rule.patterns,
        robotsTxt: robotsDisallow(rule.patterns),
        reason: reasonFor(lines.length, stoppedCount),
        periodLabel: label,
        range: input.range,
        lines,
        stoppedCount,
        amountUsdc,
        status: amountUsdc > 0 ? "pending" as const : "none" as const,
        logNote,
        settlementNote,
      };
    })
    .sort((a, b) => b.amountUsdc - a.amountUsdc || b.lines.length - a.lines.length || a.company.localeCompare(b.company));
}

export function allowedCompanyNames(rules: Rule[]): string[] {
  return rules.filter((rule) => rule.allowed && rule.patterns.trim()).map((rule) => rule.name);
}
