import { defineChain } from "viem";

/** Monad testnet, same chain midnightx402 uses for ERC-8004 and USDC. */
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "MonadVision", url: "https://testnet.monadvision.com" },
  },
  testnet: true,
});

export const MONAD_TESTNET_CHAIN_ID = monadTestnet.id;
export const MONAD_TESTNET_CAIP2 = "eip155:10143" as const;

export const MONAD_TESTNET_IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
export const MONAD_TESTNET_REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;

export const AGENT_REGISTRY_CAIP10 =
  `eip155:${MONAD_TESTNET_CHAIN_ID}:${MONAD_TESTNET_IDENTITY_REGISTRY}` as const;

export const explorerTxUrl = (tx: string) => `https://testnet.monadvision.com/tx/${tx}`;
export const explorerAddressUrl = (address: string) => `https://testnet.monadvision.com/address/${address}`;
export const scan8004AgentUrl = (agentId: string | number) =>
  `https://testnet.8004scan.io/agents/monad-testnet/${agentId}`;

export const MONAD_CHAIN_PARAMS = {
  chainId: "0x279f",
  chainName: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadvision.com"],
};
