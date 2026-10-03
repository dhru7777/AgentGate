const USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";

export type AccountPayload = { monWei: string; usdcRaw: string; transactions: unknown[] };

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
    const transactions = await etherscan(key, {
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: "3",
      sort: "desc",
    }).catch(() => []);
    const body: AccountPayload = {
      monWei: String(monWei ?? "0"),
      usdcRaw: String(usdcRaw ?? "0"),
      transactions: Array.isArray(transactions) ? transactions : [],
    };
    cache.set(address, { at: Date.now(), body });
    return body;
  })().finally(() => inflight.delete(address));
  inflight.set(address, job);
  return job;
}
