const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

export type AccountPayload = { monWei: string; usdcRaw: string; transactions: unknown[]; usdcTransfers: unknown[] };

const USDC_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MONAD_RPC = "https://testnet-rpc.monad.xyz";

const cache = new Map<string, { at: number; body: AccountPayload }>();
const inflight = new Map<string, Promise<AccountPayload>>();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function etherscan(key: string, params: Record<string, string>): Promise<unknown> {
  const search = new URLSearchParams({ chainid: "10143", apikey: key, ...params });
  let last = "Etherscan request failed";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.etherscan.io/v2/api?${search}`);
    const body = (await response.json()) as { status?: string; message?: string; result?: unknown };
    if (body.status === "0" && typeof body.result === "string") {
      last = body.result;
      if (/rate limit/i.test(body.result)) {
        await wait(1100);
        continue;
      }
      throw new Error(body.result);
    }
    return body.result;
  }
  throw new Error(last);
}

export function readAddress(value: string | null | undefined): string | null {
  const address = value ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : null;
}

type LogRow = { transactionHash?: string; topics?: string[]; data?: string; blockNumber?: string };

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(MONAD_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result;
}

// Monad only answers eth_getLogs for a 100-block span. Walk back until the last
// three USDC transfers for this address show up. Etherscan's tokentx is tried
// first because one call covers history the short window would miss.
async function usdcLogs(address: string): Promise<LogRow[]> {
  const latest = BigInt(String(await rpc("eth_blockNumber", [])));
  const pad = "0x" + address.slice(2).toLowerCase().padStart(64, "0");
  const logs: LogRow[] = [];
  for (let i = 0; i < 120 && new Set(logs.map((log) => log.transactionHash)).size < 3; i += 1) {
    const end = latest - BigInt(i * 100);
    if (end < 0n) break;
    const start = end > 99n ? end - 99n : 0n;
    const range = { address: USDC, fromBlock: `0x${start.toString(16)}`, toBlock: `0x${end.toString(16)}` };
    const [outgoing, incoming] = await Promise.all([
      rpc("eth_getLogs", [{ ...range, topics: [USDC_TRANSFER_TOPIC, pad] }]).catch(() => []),
      rpc("eth_getLogs", [{ ...range, topics: [USDC_TRANSFER_TOPIC, null, pad] }]).catch(() => []),
    ]);
    logs.push(...(Array.isArray(outgoing) ? outgoing : []), ...(Array.isArray(incoming) ? incoming : []));
    if (logs.length < 3) await wait(40);
  }
  return logs;
}

function transfersFromLogs(address: string, logs: LogRow[]) {
  const pad = address.slice(2).toLowerCase();
  const seen = new Set<string>();
  return logs.flatMap((log) => {
    const hash = log.transactionHash;
    if (!hash || seen.has(hash) || !log.topics || log.topics.length < 3) return [];
    seen.add(hash);
    const from = `0x${log.topics[1].slice(-40)}`;
    const to = `0x${log.topics[2].slice(-40)}`;
    return [{
      hash,
      from,
      to,
      value: String(BigInt(log.data || "0x0")),
      tokenDecimal: "6",
      tokenSymbol: "USDC",
      blockNumber: String(BigInt(log.blockNumber || "0x0")),
      timeStamp: String(Math.floor(Date.now() / 1000)),
    }];
  }).sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber)).slice(0, 3).map((row) => ({
    ...row,
    directionHint: row.from.slice(2).toLowerCase() === pad ? "out" : "in",
  }));
}

export async function loadMonadAccount(key: string, address: string): Promise<AccountPayload> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < 30_000) return hit.body;
  const pending = inflight.get(address);
  if (pending) return pending;
  const job = (async () => {
    const monWei = await etherscan(key, { module: "account", action: "balance", address, tag: "latest" });
    const usdcRaw = await etherscan(key, {
      module: "account",
      action: "tokenbalance",
      contractaddress: USDC,
      address,
      tag: "latest",
    });
    const tokenTxs = await etherscan(key, {
      module: "account",
      action: "tokentx",
      contractaddress: USDC,
      address,
      page: "1",
      offset: "10",
      sort: "desc",
    }).catch(() => []);
    const indexed = Array.isArray(tokenTxs)
      ? tokenTxs.filter((tx) => String((tx as { tokenSymbol?: string }).tokenSymbol || "USDC").toUpperCase() === "USDC").slice(0, 10)
      : [];
    const usdcTransfers = indexed.length ? indexed : transfersFromLogs(address, await usdcLogs(address));
    const body: AccountPayload = {
      monWei: String(monWei ?? "0"),
      usdcRaw: String(usdcRaw ?? "0"),
      transactions: [],
      usdcTransfers,
    };
    cache.set(address, { at: Date.now(), body });
    return body;
  })().finally(() => inflight.delete(address));
  inflight.set(address, job);
  return job;
}
