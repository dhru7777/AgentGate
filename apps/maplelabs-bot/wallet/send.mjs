#!/usr/bin/env node
// Sends USDC on Monad testnet from your Buyer wallet to the given recipient.
//
// Follows the same role split as this project's own acp-demo: the buyer's private key is read
// from an env var, never typed into code, never sent anywhere except signing locally with viem.
// Nothing in this script, or anywhere in the AgentGate repo, runs this for you automatically.
// You run it yourself, after reading what it's about to do:
//
//   BUYER_WALLET_PRIVATE_KEY=0x... node wallet/send.mjs --to 0xC90AC2b557088c50264de70969D71419311636c1 --amount 0.01
//
// Or put BUYER_WALLET_PRIVATE_KEY in wallet/.env.local (gitignored, loaded automatically) and
// just run: node wallet/send.mjs --to <address> --amount <usdc>
//
// --dry-run prints what would happen (from address, to, amount, current balance) without
// signing or sending anything, useful to sanity-check before a real run.

import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
try {
  for (const line of readFileSync(join(HERE, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env.local, that's fine, use real env vars instead */ }

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [process.env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  testnet: true,
});

const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const USDC_DECIMALS = 6;
const USDC_ABI = [
  { name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];

function args() {
  const out = { dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--to") out.to = argv[++i];
    else if (argv[i] === "--amount") out.amount = argv[++i];
    else if (argv[i] === "--dry-run") out.dryRun = true;
  }
  return out;
}

async function main() {
  const { to, amount, dryRun } = args();
  if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) throw new Error("Usage: node send.mjs --to 0x... --amount 0.01 [--dry-run]. --to is missing or not a valid address.");
  if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) throw new Error("--amount must be a positive number of USDC, e.g. 0.01");

  const key = process.env.BUYER_WALLET_PRIVATE_KEY;
  if (!key) throw new Error("Set BUYER_WALLET_PRIVATE_KEY (env var or wallet/.env.local). This script never asks for it any other way, and never logs it.");
  const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);

  const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
  const value = parseUnits(amount, USDC_DECIMALS);
  const [fromBalance, mon] = await Promise.all([
    publicClient.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [account.address] }),
    publicClient.getBalance({ address: account.address }),
  ]);

  console.log("Monad testnet USDC transfer");
  console.log("  from  :", account.address, `(${formatUnits(fromBalance, USDC_DECIMALS)} USDC, ${formatUnits(mon, 18)} MON for gas)`);
  console.log("  to    :", to);
  console.log("  amount:", amount, "USDC");

  if (fromBalance < value) throw new Error(`Buyer wallet only has ${formatUnits(fromBalance, USDC_DECIMALS)} USDC, less than the ${amount} requested.`);
  if (mon === 0n) throw new Error("Buyer wallet has 0 MON, there is nothing to pay gas with. Fund it from a Monad testnet faucet first.");

  if (dryRun) {
    console.log("  --dry-run set, nothing signed or sent.");
    return;
  }

  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http() });
  const hash = await walletClient.writeContract({ address: USDC, abi: USDC_ABI, functionName: "transfer", args: [to, value] });
  console.log("  sent, tx:", hash);
  console.log("  explorer:", `https://testnet.monadvision.com/tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("  status  :", receipt.status);
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
