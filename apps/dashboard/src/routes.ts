import type { AgentView, Range, ServiceView, Tab } from "./types";

/** One URL per page. The path says where you are, the query carries the time range and the service. */
export type Route = { tab: Tab; view: ServiceView; agentView: AgentView; serviceId: string; range: Range };

const VIEWS: ServiceView[] = ["graphs", "insights", "agents", "pages", "events", "permissions"];
const AGENT_VIEWS: AgentView[] = ["all", "compare", "good", "bad", "paid"];
const RANGES: Range[] = ["day", "week", "month"];
const TABS: Tab[] = ["observability", "services", "wallet", "identity", "invoices"];

export const DEFAULT_ROUTE: Route = { tab: "observability", view: "graphs", agentView: "all", serviceId: "blog", range: "week" };

export function parseRoute(pathname: string, search: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  const query = new URLSearchParams(search);
  const range = RANGES.find((item) => item === query.get("range")) ?? DEFAULT_ROUTE.range;
  const serviceId = query.get("service") || DEFAULT_ROUTE.serviceId;
  const tab = TABS.find((item) => item === parts[0]);
  if (!tab) return { ...DEFAULT_ROUTE, range };
  if (tab !== "observability") return { ...DEFAULT_ROUTE, tab, range, serviceId };
  const view = VIEWS.find((item) => item === parts[1]) ?? DEFAULT_ROUTE.view;
  const agentView = view === "agents" ? AGENT_VIEWS.find((item) => item === parts[2]) ?? "all" : "all";
  return { tab, view, agentView, serviceId, range };
}

export function buildPath(route: Route): string {
  let path = `/${route.tab}`;
  if (route.tab === "observability") {
    path += `/${route.view}`;
    if (route.view === "agents" && route.agentView !== "all") path += `/${route.agentView}`;
  }
  const query = new URLSearchParams();
  if (route.tab === "observability") {
    if (route.range !== DEFAULT_ROUTE.range) query.set("range", route.range);
    if (route.serviceId !== DEFAULT_ROUTE.serviceId) query.set("service", route.serviceId);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

const TITLES: Record<Tab, string> = {
  observability: "Observability",
  services: "Services",
  wallet: "Wallet",
  identity: "Identity",
  invoices: "Invoices",
};

export function titleFor(route: Route): string {
  const section = route.tab === "observability" ? `${TITLES.observability}, ${route.view}` : TITLES[route.tab];
  return `${section} | Agent Gate`;
}
