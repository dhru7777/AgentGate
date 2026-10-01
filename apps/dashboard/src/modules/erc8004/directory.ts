import type { Identity } from "../../types";

const STORAGE_KEY = "agentledger.chainAgents";

export function loadChainAgents(): Identity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Identity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberChainAgent(agent: Identity): Identity[] {
  const next = [agent, ...loadChainAgents().filter((item) => item.agentId !== agent.agentId || item.name !== agent.name)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
