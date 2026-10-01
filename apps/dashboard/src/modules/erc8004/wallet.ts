import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { MONAD_CHAIN_PARAMS, monadTestnet } from "../chain/monad";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function getEthereum(): EthereumProvider | null {
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return provider ?? null;
}

async function ensureMonad(provider: EthereumProvider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_CHAIN_PARAMS.chainId }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [MONAD_CHAIN_PARAMS],
    });
  }
}

export async function connectMonadWallet(): Promise<{ address: Address; walletClient: WalletClient }> {
  const provider = getEthereum();
  if (!provider) {
    throw new Error("No wallet found in this browser. A wallet that can add Monad testnet has to sign the registration.");
  }
  await ensureMonad(provider);
  const walletClient = createWalletClient({ chain: monadTestnet, transport: custom(provider) });
  const [address] = await walletClient.requestAddresses();
  if (!address) throw new Error("The wallet did not return an account.");
  return { address, walletClient };
}
