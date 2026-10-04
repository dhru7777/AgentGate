import { createPublicClient, http } from "viem";
import { MONAD_TESTNET_REPUTATION_REGISTRY, monadTestnet } from "../chain/monad";

const reputationRegistryAbi = [
  {
    type: "function",
    name: "getClients",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "readAllFeedback",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "includeRevoked", type: "bool" },
    ],
    outputs: [
      { name: "clients", type: "address[]" },
      { name: "feedbackIndexes", type: "uint64[]" },
      { name: "values", type: "int128[]" },
      { name: "valueDecimals", type: "uint8[]" },
      { name: "tag1s", type: "string[]" },
      { name: "tag2s", type: "string[]" },
      { name: "revokedStatuses", type: "bool[]" },
    ],
  },
] as const;

export type AgentFeedback = {
  index: number;
  score: string;
  tag1: string;
  tag2: string;
  revoked: boolean;
};

export type AgentReputation = {
  count: number;
  average: string | null;
  entries: AgentFeedback[];
};

function client() {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(monadTestnet.rpcUrls.default.http[0]),
  });
}

function formatFixed(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const fraction = (abs % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}

export async function readAgentReputation(agentId: number): Promise<AgentReputation> {
  const chain = client();
  const clients = await chain.readContract({
    address: MONAD_TESTNET_REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "getClients",
    args: [BigInt(agentId)],
  });
  if (clients.length === 0) return { count: 0, average: null, entries: [] };

  const [count, summaryValue, summaryDecimals] = await chain.readContract({
    address: MONAD_TESTNET_REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "getSummary",
    args: [BigInt(agentId), [...clients], "", ""],
  });

  const feedback = await chain.readContract({
    address: MONAD_TESTNET_REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "readAllFeedback",
    args: [BigInt(agentId), [...clients], "", "", true],
  });

  const entries: AgentFeedback[] = feedback[1].map((index, i) => ({
    index: Number(index),
    score: formatFixed(feedback[2][i] ?? 0n, feedback[3][i] ?? 0),
    tag1: feedback[4][i] || "—",
    tag2: feedback[5][i] || "",
    revoked: feedback[6][i] ?? false,
  }));
  entries.sort((a, b) => b.index - a.index);

  return {
    count: Number(count),
    average: count > 0n ? formatFixed(summaryValue, summaryDecimals) : null,
    entries,
  };
}
