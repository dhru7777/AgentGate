export type Range = "day" | "week" | "month";

export type ServiceView = "graphs" | "agents" | "pages" | "events" | "permissions";

export type AgentView = "all" | "compare" | "good" | "bad" | "paid";

export type Tab = "services" | "wallet" | "identity" | "invoices";

export type VisitKind = "human" | "ai" | "search";

export type Outcome = "human" | "search" | "good" | "bad" | "paid";

export type IdentityStatus = "verified" | "claimed" | "anonymous";

export type Service = {
  id: string;
  name: string;
  origin: string;
  payoutAddress: string;
  ownershipAddress: string;
  verified: boolean;
};

export type Visit = {
  id: string;
  serviceId: string;
  ts: string;
  path: string;
  kind: string;
  agent: string;
  agentId: number | null;
  outcome: Outcome;
  status: number;
  city: string;
  country: string;
  lat: number;
  lon: number;
  amountUsdc: number;
  /** Milliseconds on the site for this visit. Null when a single request is all we saw. */
  durationMs: number | null;
};

export type Rule = {
  id: string;
  name: string;
  category: string;
  allowed: boolean;
  patterns: string;
  agentId: number | null;
};

export type Identity = {
  agentId: number | null;
  name: string;
  claimedAs: string;
  wallet: string | null;
  owner: string | null;
  status: IdentityStatus;
  reputation: number | null;
  services: string[];
  registerTxHash?: string;
  agentURI?: string;
};

export type AgentWallet = {
  id: string;
  name: string;
  address: string;
  environmentId: string;
  spendCapUsdc: number;
  delegated: boolean;
  createdAt: string;
};

export type OwnerSession = {
  credentialId: string;
  ownerAddress: string;
};

export type Summary = {
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
  series: { t: string; requests: number; human: number; ai: number; blocked: number; paid: number }[];
  status: { name: string; count: number }[];
  topAgents: { name: string; count: number }[];
  goodAgents: { name: string; count: number }[];
  badAgents: { name: string; count: number }[];
  paidAgents: { name: string; count: number }[];
  topPages: { name: string; count: number }[];
  places: { country: string; city: string; lat: number; lon: number; count: number }[];
  recent: Visit[];
};

export type Invoice = {
  id: string;
  ts: string;
  serviceId: string;
  from: string;
  agentId: number | null;
  path: string;
  amountUsdc: number;
  txHash: string;
  indexed: "matched";
};
