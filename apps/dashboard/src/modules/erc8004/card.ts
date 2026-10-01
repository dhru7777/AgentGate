import type { Address } from "viem";
import { AGENT_REGISTRY_CAIP10, MONAD_TESTNET_CAIP2 } from "../chain/monad";

export type AgentCard = {
  type: string;
  name: string;
  description: string;
  services: Array<{ name: string; endpoint: string }>;
  registrations: Array<{ agentId: number; agentRegistry: string }>;
  supportedTrust: string[];
  x402Support: boolean;
  capabilities: string[];
  walletAddress: Address;
};

export function buildAgentCard(input: {
  name: string;
  description: string;
  walletAddress: Address;
  agentId?: number;
}): AgentCard {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: input.name,
    description: input.description,
    services: [{ name: "x402-pay", endpoint: `${MONAD_TESTNET_CAIP2}:${input.walletAddress}` }],
    registrations:
      input.agentId === undefined ? [] : [{ agentId: input.agentId, agentRegistry: AGENT_REGISTRY_CAIP10 }],
    supportedTrust: ["reputation"],
    x402Support: true,
    capabilities: ["x402-payments"],
    walletAddress: input.walletAddress,
  };
}

export function agentUriFromCard(card: AgentCard): string {
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/json;base64,${btoa(binary)}`;
}
