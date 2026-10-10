import { formatUnits } from "viem";
import { explorerTxUrl } from "../chain/monad";

export type MonadTx = {
  hash: string;
  href: string;
  direction: "in" | "out";
  amount: string;
  amountNumber: number;
  when: string;
  timeMs: number;
  from: string;
};

export type MonadAccount = {
  mon: string;
  usdc: string;
  transactions: MonadTx[];
};

type RawTx = {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  timeStamp?: string;
  tokenDecimal?: string;
};

function units(raw: string, decimals: number, places: number): string {
  try {
    return Number(formatUnits(BigInt(raw), decimals)).toFixed(places);
  } catch {
    return (0).toFixed(places);
  }
}

function when(stamp: string | undefined): string {
  const seconds = Number(stamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Date(seconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export async function readMonadAccount(address: string): Promise<MonadAccount> {
  const response = await fetch(`/api/monad-account?address=${address}`);
  const body = (await response.json()) as {
    error?: string;
    monWei?: string;
    usdcRaw?: string;
    usdcTransfers?: RawTx[];
  };
  if (!response.ok || body.error) throw new Error(body.error ?? "Could not read the Monad account");
  const account = address.toLowerCase();
  const transactions = (body.usdcTransfers ?? []).slice(0, 3).flatMap((tx) => {
    if (!tx.hash) return [];
    const decimals = Number(tx.tokenDecimal ?? "6");
    const amountNumber = Number(units(tx.value ?? "0", Number.isFinite(decimals) ? decimals : 6, 2));
    const seconds = Number(tx.timeStamp);
    return [{
      hash: tx.hash,
      href: explorerTxUrl(tx.hash),
      direction: tx.to?.toLowerCase() === account ? "in" as const : "out" as const,
      amount: `${amountNumber.toFixed(2)} USDC`,
      amountNumber,
      when: when(tx.timeStamp),
      timeMs: Number.isFinite(seconds) ? seconds * 1000 : Date.now(),
      from: tx.from ?? "",
    }];
  });
  return {
    mon: units(body.monWei ?? "0", 18, 4),
    usdc: units(body.usdcRaw ?? "0", 6, 2),
    transactions,
  };
}
