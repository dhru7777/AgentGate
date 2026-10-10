// USDC transfer on Monad testnet, buyer wallet to a recipient.
// The buyer key is read from BUYER_WALLET_PRIVATE_KEY (env or a gitignored .env.local).
// It is never logged and never returned. Callers decide the recipient; the demo API
// only ever passes the configured seller address.

import { createWalletClient, createPublicClient, http, parseUnits, formatUnits, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* optional file */ }
}
loadEnv(join(HERE, ".env.local"));
loadEnv(join(HERE, "..", ".env.local"));

export const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
export const MONAD_EXPLORER = "https://testnet.monadvision.com";
export const MAX_USDC = "1";

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: MONAD_EXPLORER } },
  testnet: true,
});

const USDC_ABI = [
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];

function buyerAccount() {
  const raw = process.env.BUYER_WALLET_PRIVATE_KEY || "";
  if (!raw) {
    const err = new Error("BUYER_WALLET_PRIVATE_KEY is not set on the server. Nothing was sent.");
    err.status = 503;
    throw err;
  }
  const account = privateKeyToAccount(raw.startsWith("0x") ? raw : `0x${raw}`);
  const expected = (process.env.BUYER_WALLET_ADDRESS || "").trim();
  if (expected && account.address.toLowerCase() !== expected.toLowerCase()) {
    const err = new Error("BUYER_WALLET_PRIVATE_KEY does not match BUYER_WALLET_ADDRESS. Nothing was sent.");
    err.status = 503;
    throw err;
  }
  return account;
}

export function paymentReady() {
  return Boolean(process.env.BUYER_WALLET_PRIVATE_KEY);
}

export async function transferUsdc({ to, amount, dryRun = false }) {
  if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) {
    const err = new Error("Seller address is missing or not a valid address.");
    err.status = 400;
    throw err;
  }
  let value;
  try { value = parseUnits(String(amount), 6); } catch {
    const err = new Error("Amount must be a number of USDC, for example 0.01.");
    err.status = 400;
    throw err;
  }
  const max = parseUnits(MAX_USDC, 6);
  if (value <= 0n || value > max) {
    const err = new Error(`Amount must be greater than 0 and at most ${MAX_USDC} USDC.`);
    err.status = 400;
    throw err;
  }

  const account = buyerAccount();
  const rpc = process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpc) });
  const [fromBalance, mon] = await Promise.all([
    publicClient.readContract({ address: MONAD_USDC, abi: USDC_ABI, functionName: "balanceOf", args: [account.address] }),
    publicClient.getBalance({ address: account.address }),
  ]);
  if (fromBalance < value) {
    const err = new Error(`Buyer wallet only has ${formatUnits(fromBalance, 6)} USDC.`);
    err.status = 400;
    throw err;
  }
  if (mon === 0n) {
    const err = new Error("Buyer wallet has 0 MON, so it cannot pay gas.");
    err.status = 400;
    throw err;
  }

  const preview = {
    from: account.address,
    to,
    amount: formatUnits(value, 6),
    usdc: formatUnits(fromBalance, 6),
    mon: formatUnits(mon, 18),
  };
  if (dryRun) return { ...preview, dryRun: true };

  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http(rpc) });
  const gas = await publicClient.estimateContractGas({
    address: MONAD_USDC,
    abi: USDC_ABI,
    functionName: "transfer",
    args: [to, value],
    account,
  });
  const hash = await walletClient.writeContract({
    address: MONAD_USDC,
    abi: USDC_ABI,
    functionName: "transfer",
    args: [to, value],
    gas: (gas * 120n) / 100n,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    const err = new Error("The transaction was mined and reverted. No USDC moved.");
    err.status = 502;
    throw err;
  }
  return {
    from: account.address,
    to,
    amount: formatUnits(value, 6),
    txHash: hash,
    explorer: `${MONAD_EXPLORER}/tx/${hash}`,
  };
}
