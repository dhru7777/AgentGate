import type { Identity, Rule, Service, Visit, VisitKind, Outcome } from "./types";

export const NOW = new Date("2026-10-01T21:00:00Z");

export const OWNER_ADDRESS = "0x6fE4d8c1a2B94e0d77c1a5b8e3F90214c6d80a11";

export const SERVICES: Service[] = [
  {
    id: "blog",
    name: "dheeraj.blog",
    origin: "https://dheeraj-work.netlify.app",
    payoutAddress: "0x91b2c4e7a0d35f1688c4ab91e70d25c3a8f14e02",
    ownershipAddress: "0x33aa10c9e4b27d80f15c6a91d2e70844b7c0d19e",
    verified: false,
  },
];

const CITIES = {
  austin: { city: "Austin", country: "United States", lat: 30.27, lon: -97.74 },
  london: { city: "London", country: "United Kingdom", lat: 51.51, lon: -0.13 },
  bengaluru: { city: "Bengaluru", country: "India", lat: 12.97, lon: 77.59 },
  singapore: { city: "Singapore", country: "Singapore", lat: 1.35, lon: 103.82 },
  berlin: { city: "Berlin", country: "Germany", lat: 52.52, lon: 13.41 },
  nyc: { city: "New York", country: "United States", lat: 40.71, lon: -74.01 },
  tokyo: { city: "Tokyo", country: "Japan", lat: 35.68, lon: 139.69 },
} as const;

type CityKey = keyof typeof CITIES;

const BLOG_PAGES = [
  "/2026/06/22/Understanding-ERC-8004.html",
  "/2026/06/08/Understanding-x402-Agent-Payments-on-Chain.html",
  "/2026/06/07/HTTP-402-to-x402-protocol.html",
  "/2026/09/15/Important-Pillar-of-Agentic-Payment-Infrastructure.html",
  "/2026/05/16/Capturing-Intent-and-Attention-in-Agentic-Payments.html",
  "/2026/05/26/Understanding-Agent-Client-Protocol.html",
];

const RESEARCH_PAGES = [
  "/papers/agent-payments.pdf",
  "/papers/erc-8004-notes.md",
  "/datasets/crawl-sample.csv",
];

const BASE_RULES: Rule[] = [
  { id: "anthropic", name: "Anthropic (Claude)", category: "AI Assistant", allowed: false, patterns: "claudebot,anthropic-ai,claude-web,claude", agentId: 1842 },
  { id: "openai", name: "OpenAI (ChatGPT & SearchGPT)", category: "AI Assistant", allowed: false, patterns: "gptbot,chatgpt-user,oai-searchbot,chatgpt,openai", agentId: null },
  { id: "google_search", name: "Google Search (Googlebot)", category: "Search Engine", allowed: true, patterns: "googlebot,google-inspectiontool", agentId: null },
  { id: "google_ai", name: "Google AI / Gemini Training (Google-Extended)", category: "AI Training", allowed: false, patterns: "google-extended", agentId: null },
  { id: "perplexity", name: "Perplexity AI", category: "AI Search", allowed: false, patterns: "perplexitybot,perplexity", agentId: 2201 },
  { id: "cohere", name: "Cohere AI", category: "AI Training", allowed: false, patterns: "cohere-ai,cohere", agentId: null },
  { id: "apple", name: "Apple (Applebot & Apple Intelligence)", category: "AI Assistant", allowed: true, patterns: "applebot-extended,applebot", agentId: null },
  { id: "meta", name: "Meta AI (LLaMA)", category: "AI Training", allowed: false, patterns: "meta-externalagent,facebookbot", agentId: null },
  { id: "bytedance", name: "ByteDance (Bytespider)", category: "AI Training", allowed: false, patterns: "bytespider", agentId: null },
  { id: "aggregators", name: "Aggregators (CCBot / Diffbot)", category: "Data Aggregators", allowed: false, patterns: "ccbot,diffbot,amazonbot,youbot", agentId: null },
  { id: "bing", name: "Bing Search (Bingbot)", category: "Search Engine", allowed: true, patterns: "bingbot", agentId: null },
  { id: "feed_protection", name: "Feed Protection (/feed.xml)", category: "RSS Protection", allowed: true, patterns: "", agentId: null },
];

export const RULE_GROUPS = [
  { title: "Assistants", ids: ["anthropic", "openai", "perplexity", "apple"] },
  { title: "Training", ids: ["google_ai", "meta", "bytedance", "aggregators", "cohere"] },
  { title: "Search", ids: ["google_search", "bing"] },
  { title: "Feed", ids: ["feed_protection"] },
];

export function defaultRules(serviceId: string): Rule[] {
  return BASE_RULES.map((rule) => ({
    ...rule,
    allowed: serviceId === "research" ? rule.category === "Search Engine" || rule.id === "feed_protection" : rule.allowed,
  }));
}

export const IDENTITIES: Identity[] = [
  {
    agentId: 1842,
    name: "Claude research agent",
    claimedAs: "ClaudeBot",
    wallet: "0x7c21a90e44b18d55f0aa3912c6e80d14b29f7710",
    owner: "0x4b0188aa12c90d33e71f5508a6c14d90ee2201ab",
    status: "verified",
    reputation: 92,
    services: ["blog", "research"],
  },
  {
    agentId: 2201,
    name: "Perplexity search agent",
    claimedAs: "PerplexityBot",
    wallet: "0x51ae09c4d80b22f7176aa04c8d190ee3310c88a4",
    owner: "0x9a10cc45d21e80b44f771290c6aa18d40e5519c2",
    status: "verified",
    reputation: 81,
    services: ["blog"],
  },
  {
    agentId: 441,
    name: "Research crawler",
    claimedAs: "AgentLedgerBot",
    wallet: "0xab90c14e552718d40f66aa0918c33d70e14b2208",
    owner: "0x6fE4d8c1a2B94e0d77c1a5b8e3F90214c6d80a11",
    status: "verified",
    reputation: 74,
    services: ["research"],
  },
  {
    agentId: null,
    name: "GPTBot",
    claimedAs: "GPTBot",
    wallet: null,
    owner: null,
    status: "claimed",
    reputation: null,
    services: ["blog", "research"],
  },
  {
    agentId: null,
    name: "Bytespider",
    claimedAs: "Bytespider",
    wallet: null,
    owner: null,
    status: "anonymous",
    reputation: null,
    services: ["blog"],
  },
];

function at(daysAgo: number, hour: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, 12, 0, 0);
  return d.toISOString();
}

let seq = 0;

function visit(input: {
  daysAgo: number;
  hour: number;
  serviceId: string;
  path: string;
  kind: VisitKind;
  agent: string;
  agentId: number | null;
  outcome: Outcome;
  status: number;
  city: CityKey;
  amountUsdc?: number;
}): Visit {
  seq += 1;
  const place = CITIES[input.city];
  return {
    id: `v${seq}`,
    serviceId: input.serviceId,
    ts: at(input.daysAgo, input.hour),
    path: input.path,
    kind: input.kind,
    agent: input.agent,
    agentId: input.agentId,
    outcome: input.outcome,
    status: input.status,
    city: place.city,
    country: place.country,
    lat: place.lat,
    lon: place.lon,
    amountUsdc: input.amountUsdc ?? 0,
    durationMs: null,
  };
}

function buildVisits(): Visit[] {
  const rows: Visit[] = [];
  const humanCities: CityKey[] = ["austin", "london", "bengaluru", "nyc", "berlin", "singapore", "tokyo"];

  for (let day = 0; day < 30; day += 1) {
    const page = BLOG_PAGES[day % BLOG_PAGES.length];
    rows.push(
      visit({
        daysAgo: day,
        hour: 14,
        serviceId: "blog",
        path: page,
        kind: "human",
        agent: "Reader",
        agentId: null,
        outcome: "human",
        status: 200,
        city: humanCities[day % humanCities.length],
      }),
    );
    if (day % 2 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 16,
          serviceId: "blog",
          path: BLOG_PAGES[(day + 2) % BLOG_PAGES.length],
          kind: "human",
          agent: "Reader",
          agentId: null,
          outcome: "human",
          status: 200,
          city: humanCities[(day + 3) % humanCities.length],
        }),
      );
    }
    if (day % 2 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 9,
          serviceId: "blog",
          path: page,
          kind: "ai",
          agent: "ClaudeBot",
          agentId: 1842,
          outcome: "good",
          status: 402,
          city: "london",
        }),
      );
    }
    if (day % 3 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 11,
          serviceId: "blog",
          path: BLOG_PAGES[(day + 1) % BLOG_PAGES.length],
          kind: "ai",
          agent: "GPTBot",
          agentId: null,
          outcome: "bad",
          status: 200,
          city: "nyc",
        }),
      );
    }
    if (day % 4 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 8,
          serviceId: "blog",
          path: "/llms.txt",
          kind: "search",
          agent: "Googlebot",
          agentId: null,
          outcome: "search",
          status: 200,
          city: "nyc",
        }),
      );
    }
    if (day % 5 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 18,
          serviceId: "blog",
          path: page,
          kind: "ai",
          agent: "PerplexityBot",
          agentId: 2201,
          outcome: "paid",
          status: 200,
          city: "singapore",
          amountUsdc: 0.01,
        }),
      );
    }
    if (day % 6 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 19,
          serviceId: "blog",
          path: BLOG_PAGES[(day + 4) % BLOG_PAGES.length],
          kind: "ai",
          agent: "ClaudeBot",
          agentId: 1842,
          outcome: "paid",
          status: 200,
          city: "london",
          amountUsdc: 0.01,
        }),
      );
    }
    if (day % 7 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 12,
          serviceId: "blog",
          path: page,
          kind: "ai",
          agent: "Bytespider",
          agentId: null,
          outcome: "bad",
          status: 200,
          city: "tokyo",
        }),
      );
    }

    if (day % 2 === 1) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 15,
          serviceId: "research",
          path: RESEARCH_PAGES[day % RESEARCH_PAGES.length],
          kind: "human",
          agent: "Reader",
          agentId: null,
          outcome: "human",
          status: 200,
          city: "bengaluru",
        }),
      );
    }
    if (day % 3 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 10,
          serviceId: "research",
          path: RESEARCH_PAGES[day % RESEARCH_PAGES.length],
          kind: "ai",
          agent: "AgentLedgerBot",
          agentId: 441,
          outcome: "paid",
          status: 200,
          city: "berlin",
          amountUsdc: 0.05,
        }),
      );
    }
    if (day % 4 === 1) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 13,
          serviceId: "research",
          path: RESEARCH_PAGES[(day + 1) % RESEARCH_PAGES.length],
          kind: "ai",
          agent: "GPTBot",
          agentId: null,
          outcome: "good",
          status: 402,
          city: "nyc",
        }),
      );
    }
    if (day % 8 === 0) {
      rows.push(
        visit({
          daysAgo: day,
          hour: 17,
          serviceId: "research",
          path: RESEARCH_PAGES[0],
          kind: "ai",
          agent: "ClaudeBot",
          agentId: 1842,
          outcome: "paid",
          status: 200,
          city: "london",
          amountUsdc: 0.05,
        }),
      );
    }
  }

  return rows;
}

export const VISITS: Visit[] = buildVisits();

export function serviceById(id: string): Service {
  const found = SERVICES.find((service) => service.id === id);
  if (!found) return SERVICES[0];
  return found;
}
