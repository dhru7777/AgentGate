#!/usr/bin/env node
// Sends USDC on Monad testnet from the buyer wallet to the given recipient.
// The key stays in BUYER_WALLET_PRIVATE_KEY. The demo's Approve button calls the
// same transferUsdc() through POST /api/pay, and that route only pays the seller.
//
//   node wallet/send.mjs --to 0x... --amount 0.01
//   node wallet/send.mjs --to 0x... --amount 0.01 --dry-run

import { transferUsdc } from "./transfer.mjs";

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
  const result = await transferUsdc({ to, amount, dryRun });
  console.log("Monad testnet USDC transfer");
  console.log("  from  :", result.from, dryRun ? `(${result.usdc} USDC, ${result.mon} MON for gas)` : "");
  console.log("  to    :", result.to);
  console.log("  amount:", result.amount, "USDC");
  if (dryRun) {
    console.log("  --dry-run set, nothing signed or sent.");
    return;
  }
  console.log("  sent, tx:", result.txHash);
  console.log("  explorer:", result.explorer);
  console.log("  status  : success");
}

main().catch((err) => {
  console.error("Failed:", err.message || err);
  process.exit(1);
});
