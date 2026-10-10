// MapleLabsBot demo API, ported from server.mjs to run as a Netlify Edge Function (Deno).
// Same logic as the local Node server: two modes (Search, Train), three brains
// (MapleLabsBot's own script, ChatGPT, Claude), a simulated demo wallet, and a
// snapshot-based training bundle. See server.mjs for the fuller commentary; this
// file only changes how env vars, static-ish helpers and the HTTP layer are read.
//
// @ts-nocheck (Deno-only globals: Deno.env, EdgeFunction config. Not type-checked by tsc.)

import type { Config } from "https://edge.netlify.com";
import SNAPSHOT from "../../data/snapshot.js";

const SITE = (Deno.env.get("SITE") || "https://dheeraj-work.netlify.app").replace(/\/$/, "");
const ADMIN_KEY = Deno.env.get("ADMIN_KEY") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5";
// Protects only the policy-change endpoint (Free/Charge/Block), not the chat itself, so
// anyone can try the bot, but only someone with this phrase can rewrite the live paywall rule.
const DEMO_POLICY_KEY = Deno.env.get("DEMO_POLICY_KEY") || "";
const RULE_ID = "maplelabs";
const POLITE_DELAY_MS = 350;

// Monad testnet, same chain and USDC contract apps/dashboard already uses (chain/monad.ts).
// Only ever read here (balances), never signed with. The actual send is a separate script
// the operator runs themselves, see wallet/send.mjs.
const MONAD_RPC = Deno.env.get("MONAD_RPC_URL") || "https://testnet-rpc.monad.xyz";
const MONAD_EXPLORER = "https://testnet.monadvision.com";
const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
// Public address only. Never put a private key in an env var this function reads.
const BUYER_ADDRESS = Deno.env.get("BUYER_WALLET_ADDRESS") || "";
const SELLER_ADDRESS = Deno.env.get("SELLER_WALLET_ADDRESS") || "0xC90AC2b557088c50264de70969D71419311636c1";

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(MONAD_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || "RPC error");
  return body.result;
}

async function walletBalances(address: string) {
  if (!address) return null;
  const [monWei, usdcRaw] = await Promise.all([
    rpcCall("eth_getBalance", [address, "latest"]),
    rpcCall("eth_call", [{ to: MONAD_USDC, data: "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0") }, "latest"]),
  ]);
  return {
    address,
    mon: (Number(BigInt(monWei)) / 1e18).toFixed(4),
    usdc: (Number(BigInt(usdcRaw || "0x0")) / 1e6).toFixed(2),
    explorer: `${MONAD_EXPLORER}/address/${address}`,
  };
}

const PRICES = {
  search: { perPage: 0.01, unit: "USDC", note: "simulated, per page read" },
  train: {
    starter: { usd: 0.15, label: "Starter bundle", postCap: 10 },
    full: { usd: 0.4, label: "Full archive bundle", postCap: 999 },
    hours: 48,
  },
};

const MODES = {
  search: { label: "Search", token: "MapleLabsBot-Search", why: "Look something up, for a search index or to answer one question" },
  train: { label: "Train", token: "MapleLabsBot-Train", why: "Collect a bundle of posts to train on" },
};

function ua(mode: string, brand: string, model: string | null) {
  const tag = brand === "openai" ? `brain=openai:${model}` : brand === "anthropic" ? `brain=anthropic:${model}` : "brain=script";
  return `Mozilla/5.0 (compatible; ${MODES[mode].token}/1.0; ${tag}) +https://github.com/dhru7777/AgentGate`;
}

function modelFromUa(uaString: string) {
  const m = (uaString || "").match(/brain=([^)]+)/);
  if (!m) return "";
  const value = m[1];
  if (value === "script") return "MapleLabsBot script";
  const sep = value.indexOf(":");
  if (sep < 0) return value;
  const vendor = value.slice(0, sep);
  const model = value.slice(sep + 1);
  const label = vendor === "openai" ? "ChatGPT" : vendor === "anthropic" ? "Claude" : vendor;
  return `${label} (${model})`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseRobots(text: string) {
  const groups: { agents: string[]; rules: { type: string; path: string }[] }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      if (current) current.rules.push({ type: key, path: value });
      lastWasAgent = false;
    } else if (key === "sitemap") {
      sitemaps.push(value);
    } else lastWasAgent = false;
  }
  return { groups, sitemaps };
}

function verdictFor(robots: ReturnType<typeof parseRobots>, token: string, path: string) {
  const me = token.toLowerCase();
  let best: (typeof robots.groups)[number] | null = null;
  let bestLen = -1;
  for (const group of robots.groups) {
    for (const agent of group.agents) {
      const match = agent === "*" ? 0 : me.startsWith(agent) ? agent.length : -1;
      if (match > bestLen) { best = group; bestLen = match; }
    }
  }
  if (!best) return { allowed: true, rule: "no matching group" };
  let winner: { type: string; path: string } | null = null;
  for (const rule of best.rules) {
    if (!rule.path) continue;
    if (path.startsWith(rule.path) && (!winner || rule.path.length > winner.path.length || (rule.path.length === winner.path.length && rule.type === "allow"))) winner = rule;
  }
  return { allowed: !winner || winner.type === "allow", rule: winner ? `${winner.type === "allow" ? "Allow" : "Disallow"}: ${winner.path}` : "no matching rule" };
}

function slugOf(url: string) {
  return decodeURIComponent(new URL(url, SITE).pathname).replace(/\.html$/, "").split("/").pop()!.replace(/-/g, " ");
}
const STOP = new Set("what when where which that this with from have about does your would could should there their they them then than into over under between how why who the and for are you can tell explain say says said please".split(" "));
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const score = (text: string, q: string) => { const set = new Set(words(text)); return words(q).filter((w) => set.has(w)).length; };

function fetcher(mode: string, brand: string, model: string | null, emit: (ev: unknown) => void, stats: { requests: number; served: number; blocked: number }) {
  let n = 0;
  return async (path: string, kind: string, label?: string) => {
    const url = path.startsWith("http") ? path : SITE + path;
    if (new URL(url).origin !== SITE) throw new Error("MapleLabsBot only reads " + SITE);
    const t0 = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": ua(mode, brand, model), Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" }, redirect: "follow" });
    const body = await res.text();
    n += 1;
    stats.requests += 1;
    if (res.status === 200) stats.served += 1;
    if (res.status === 402) stats.blocked += 1;
    emit({ type: "step", n, label: label || kind, kind, path: new URL(url).pathname, status: res.status, ms: Date.now() - t0, bytes: body.length });
    await sleep(POLITE_DELAY_MS);
    return { status: res.status, body, url };
  };
}

function payForBundle(bundle: string) {
  const tier = PRICES.train[bundle] || PRICES.train.starter;
  return { ok: true, tier, charged: tier.usd, expiresAt: Date.now() + PRICES.train.hours * 3600 * 1000 };
}

function buildBundle(bundle: string, question: string) {
  const tier = PRICES.train[bundle] || PRICES.train.starter;
  let posts = SNAPSHOT.posts;
  if (question) posts = [...posts].sort((a, b) => score(b.title + " " + b.excerpts.join(" "), question) - score(a.title + " " + a.excerpts.join(" "), question));
  posts = posts.slice(0, tier.postCap);
  return {
    generatedAt: new Date().toISOString(),
    source: "Local snapshot of the blog's own Jekyll source files, not fetched around the live paywall.",
    site: SITE,
    bundle,
    expiresAt: new Date(Date.now() + PRICES.train.hours * 3600 * 1000).toISOString(),
    postCount: posts.length,
    posts,
  };
}

// ---------- scripted fallback (MapleLabsBot's own script, no model) ----------
async function runScripted({ mode, question, respectRobots, bundleChoice }: RunOpts, emit: (ev: unknown) => void) {
  const m = MODES[mode];
  const stats = { requests: 0, served: 0, blocked: 0 };
  const step = fetcher(mode, "maplelabs", null, emit, stats);
  const scriptName = mode === "train" ? "MapleLabsBot's training script" : "MapleLabsBot's search script";
  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token, brain: `${scriptName}, a fixed sequence, no model call`, brand: "maplelabs" });

  const robotsRes = await step("/robots.txt", "robots", "robots.txt");
  const robots = parseRobots(robotsRes.body);
  const verdict = verdictFor(robots, m.token, "/2026/");
  emit({ type: "decision", text: verdict.allowed ? `robots.txt allows ${m.token} (${verdict.rule})` : `robots.txt disallows ${m.token} (${verdict.rule})`, allowed: verdict.allowed });
  if (!verdict.allowed && respectRobots) {
    emit({ type: "answer", text: `robots.txt tells ${m.token} to stay out, so I stopped before asking for any post. Nothing was charged.`, sources: [] });
    emit({ type: "done", mode, ...stats });
    return;
  }
  if (!verdict.allowed) emit({ type: "decision", text: "Ignoring robots.txt, the demo's checkbox is off. The site should log this as a violation.", allowed: false, violation: true });

  await step("/llms.txt", "llms", "llms.txt");
  const siteRes = await step("/sitemap.xml", "sitemap", "sitemap.xml");
  const urls = [...siteRes.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1].trim()).filter((u) => /\/\d{4}\/\d{2}\/\d{2}\//.test(u));
  emit({ type: "decision", text: `${urls.length} posts in the sitemap`, allowed: true });

  if (mode === "train") {
    const pick = urls[0];
    const r = pick ? await step(new URL(pick).pathname, "post", "post") : null;
    if (r && r.status === 402) {
      let terms: { pay?: { amount?: string; network?: string } } = {};
      try { terms = JSON.parse(r.body); } catch { /* ignore */ }
      emit({ type: "payment", price: terms.pay?.amount, network: terms.pay?.network });
      const tier = bundleChoice || "starter";
      const paid = payForBundle(tier);
      emit({ type: "paid", tier: paid.tier.label, charged: paid.charged, hours: PRICES.train.hours });
      const bundle = buildBundle(tier, question);
      emit({ type: "bundle", bundle });
      emit({ type: "answer", text: `Paid the demo wallet for the ${paid.tier.label} (simulated, $${paid.charged}). Delivered ${bundle.postCount} posts as a 48 hour training bundle, built from a local snapshot, not fetched around the live paywall.`, sources: [] });
      emit({ type: "done", mode, ...stats });
      return;
    }
  }

  const ranked = urls.map((u) => ({ u, s: score(slugOf(u), question) })).sort((a, b) => b.s - a.s);
  const pick = ranked[0]?.u;
  const r = pick ? await step(new URL(pick).pathname, "post", "post") : null;
  if (r && r.status === 200) {
    const title = r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || pick;
    emit({ type: "answer", text: `Read "${title}". This script just fetches, it does not summarize. Pick ChatGPT or Claude as the brain for a real read-and-answer.`, sources: [{ url: pick, title }] });
  } else if (r && r.status === 402) {
    let terms: { pay?: { amount?: string; network?: string } } = {};
    try { terms = JSON.parse(r.body); } catch { /* ignore */ }
    emit({ type: "payment", price: terms.pay?.amount, network: terms.pay?.network });
    emit({ type: "answer", text: `The site answered HTTP 402, it wants ${terms.pay?.amount || "a payment"} on ${terms.pay?.network || "Base"}. Search mode has no wallet for a single lookup, so I stopped.`, sources: [] });
  } else {
    emit({ type: "answer", text: "No posts to read for that question.", sources: [] });
  }
  emit({ type: "done", mode, ...stats });
}

// ---------- real agent loop (either vendor) ----------
function toolsFor(mode: string) {
  const all = [
    {
      name: "read_url",
      description: "Fetch a path on the site as MapleLabsBot and get back its status code and text. Use this for /robots.txt, /llms.txt, /sitemap.xml, and post URLs you find in the sitemap. You can only read this one site.",
      input_schema: { type: "object", properties: { path: { type: "string", description: "A path like /robots.txt or /2026/06/08/some-post.html" } }, required: ["path"] },
    },
    {
      name: "pay_for_training_bundle",
      description: "Only use this in Train mode, only after a post you asked for came back as HTTP 402, and only if the operator's respect-robots.txt setting did not already stop you. Pays a simulated demo wallet for a bundle and returns it. This never touches the real site's paywall, it is a stand-in for a paid export.",
      input_schema: { type: "object", properties: { bundle: { type: "string", enum: ["starter", "full"], description: "starter = up to 10 posts, full = the whole archive" } }, required: ["bundle"] },
    },
    {
      name: "finish",
      description: "End the run with your final answer for the person who asked, and which page URLs, if any, you actually read and are citing.",
      input_schema: { type: "object", properties: { answer: { type: "string" }, sources: { type: "array", items: { type: "string" } } }, required: ["answer"] },
    },
  ];
  return mode === "train" ? all : all.filter((t) => t.name !== "pay_for_training_bundle");
}

const BRAND_LINE = {
  openai: "You are being run by an OpenAI model for this test.",
  anthropic: "You are being run by an Anthropic model for this test.",
};

function systemPrompt({ mode, brand, respectRobots, question }: { mode: string; brand: string; respectRobots: boolean; question: string }) {
  const m = MODES[mode];
  const priceLine = mode === "train"
    ? `Train pricing (simulated demo money, not real): ${PRICES.train.starter.label} $${PRICES.train.starter.usd} (up to ${PRICES.train.starter.postCap} posts), ${PRICES.train.full.label} $${PRICES.train.full.usd} (the whole archive), both valid ${PRICES.train.hours} hours.`
    : `Search pricing, simulated and informational only, you have no wallet for a single lookup: $${PRICES.search.perPage} ${PRICES.search.unit} per page.`;
  return `You are MapleLabsBot, running in ${m.label} mode (${m.why}). Your User-Agent token is ${m.token}. ${BRAND_LINE[brand] || ""} You are a test crawler built to demonstrate AgentGate's paywall to someone evaluating it, so behave the way a real, well-behaved crawler would: check robots.txt before you fetch anything else, decide what to do next yourself based on what you actually find, and do not follow a fixed script.

The operator's respect-robots.txt switch is currently ${respectRobots ? "ON, meaning if robots.txt disallows you for post URLs, you must stop and not request any post." : "OFF, meaning you may ignore a Disallow for this test run, but say plainly that you are doing so."}

${priceLine}

The person asked: "${question}"

Work the way a careful crawler should: read /robots.txt first. Then use your judgment, read /llms.txt if it seems useful, read /sitemap.xml to find posts, and read whichever post(s) best fit the question (in Train mode, read more broadly, in Search mode, usually one or two is enough). If a post answers with HTTP 402 and you decide to pay (Train mode only, and only if you're not stopped by robots.txt), use pay_for_training_bundle. Before each tool call, say one short sentence in plain first-person language about what you're about to check and why, as ordinary message text alongside the call, the way you would narrate a thought out loud in a real conversation, not a log line. When you have what you need, or you are stopped, call finish with a short, honest answer, including saying so plainly if you were blocked or paid.`;
}

type RunOpts = { mode: string; brain?: string; question: string; respectRobots: boolean; bundleChoice?: string };

async function anthropicCall(messages: unknown[], system: string, mode: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 6000, thinking: { type: "adaptive" }, output_config: { effort: "high" }, system, tools: toolsFor(mode), messages }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runAgent({ mode, question, respectRobots }: RunOpts, emit: (ev: unknown) => void) {
  const m = MODES[mode];
  const stats = { requests: 0, served: 0, blocked: 0 };
  const step = fetcher(mode, "anthropic", ANTHROPIC_MODEL, emit, stats);
  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token, brain: `live call to ${ANTHROPIC_MODEL} (Anthropic)`, brand: "anthropic" });

  const system = systemPrompt({ mode, brand: "anthropic", respectRobots, question });
  const messages: unknown[] = [{ role: "user", content: question }];
  let blockedByRobots = false;

  for (let turn = 0; turn < 10; turn++) {
    const resp = await anthropicCall(messages, system, mode);
    messages.push({ role: "assistant", content: resp.content });
    for (const block of resp.content) {
      if (block.type === "thinking" && block.thinking) emit({ type: "thinking", text: block.thinking });
    }
    const toolUses = resp.content.filter((b: { type: string }) => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = resp.content.find((b: { type: string }) => b.type === "text")?.text || "(no answer)";
      emit({ type: "answer", text, sources: [] });
      break;
    }
    for (const block of resp.content) {
      if (block.type === "text" && block.text) emit({ type: "aside", text: block.text });
    }
    const results = [];
    for (const call of toolUses) {
      let result: string;
      if (call.name === "read_url") {
        const path = call.input.path;
        if (path === "/robots.txt") {
          const r = await step(path, "robots", "robots.txt");
          const robots = parseRobots(r.body);
          const verdict = verdictFor(robots, m.token, "/2026/");
          emit({ type: "decision", text: verdict.allowed ? `robots.txt allows ${m.token} (${verdict.rule})` : `robots.txt disallows ${m.token} (${verdict.rule})`, allowed: verdict.allowed });
          if (!verdict.allowed && respectRobots) blockedByRobots = true;
          result = `HTTP ${r.status}\n${r.body.slice(0, 2500)}`;
        } else {
          const kind = path === "/llms.txt" ? "llms" : path.startsWith("/sitemap") ? "sitemap" : /^\/\d{4}\//.test(path) ? "post" : "other";
          if (kind === "post" && blockedByRobots) {
            result = "Refused locally: robots.txt disallowed this bot and the operator's switch says to respect it. Do not request any more posts.";
          } else {
            const r = await step(path, kind, kind === "post" ? "post" : path.replace("/", ""));
            if (r.status === 402) {
              let terms = {};
              try { terms = JSON.parse(r.body); } catch { /* ignore */ }
              emit({ type: "payment", price: terms.pay?.amount, network: terms.pay?.network, payTo: terms.pay?.payTo });
            }
            result = `HTTP ${r.status}\n${r.body.slice(0, 2500)}`;
          }
        }
      } else if (call.name === "pay_for_training_bundle") {
        if (mode !== "train" || blockedByRobots) {
          result = "Refused: payment is only available in Train mode and only when robots.txt did not stop you.";
        } else {
          const tier = call.input.bundle === "full" ? "full" : "starter";
          const paid = payForBundle(tier);
          const bundle = buildBundle(tier, question);
          emit({ type: "paid", tier: paid.tier.label, charged: paid.charged, hours: PRICES.train.hours });
          emit({ type: "bundle", bundle });
          const titles = bundle.posts.map((p) => `- ${p.title}`).join("\n");
          result = `Paid (simulated demo wallet): ${paid.tier.label}, $${paid.charged}, valid ${PRICES.train.hours}h. Bundle delivered: ${bundle.postCount} posts, built from a local snapshot of the site's own source files, not fetched around the paywall. Titles in the bundle:\n${titles}\n\nMention the payment plainly in your final answer, and you may summarize or reference what's in this list, but you do not have the full text of these posts, do not invent details beyond a title.`;
        }
      } else if (call.name === "finish") {
        emit({ type: "answer", text: call.input.answer, sources: (call.input.sources || []).map((url: string) => ({ url, title: url })) });
        emit({ type: "done", mode, ...stats });
        return;
      } else {
        result = "Unknown tool.";
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: String(result) });
    }
    messages.push({ role: "user", content: results });
  }
  emit({ type: "done", mode, ...stats });
}

function openaiTools(mode: string) {
  return toolsFor(mode).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

async function openaiCall(messages: unknown[], system: string, mode: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, max_completion_tokens: 4096, reasoning_effort: "high", messages: [{ role: "system", content: system }, ...messages], tools: openaiTools(mode) }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runOpenAIAgent({ mode, question, respectRobots }: RunOpts, emit: (ev: unknown) => void) {
  const m = MODES[mode];
  const stats = { requests: 0, served: 0, blocked: 0 };
  const step = fetcher(mode, "openai", OPENAI_MODEL, emit, stats);
  emit({ type: "start", mode, label: m.label, why: m.why, token: m.token, brain: `live call to ${OPENAI_MODEL} (OpenAI)`, brand: "openai" });

  const system = systemPrompt({ mode, brand: "openai", respectRobots, question });
  const messages: unknown[] = [{ role: "user", content: question }];
  let blockedByRobots = false;

  for (let turn = 0; turn < 10; turn++) {
    const resp = await openaiCall(messages, system, mode);
    const msg = resp.choices?.[0]?.message;
    if (!msg) throw new Error("OpenAI returned no message");
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    const calls = msg.tool_calls || [];
    if (calls.length === 0) {
      emit({ type: "answer", text: msg.content || "(no answer)", sources: [] });
      break;
    }
    if (typeof msg.content === "string" && msg.content.trim()) emit({ type: "aside", text: msg.content });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }
      let result: string;
      if (call.function.name === "read_url") {
        const path = args.path as string;
        if (path === "/robots.txt") {
          const r = await step(path, "robots", "robots.txt");
          const robots = parseRobots(r.body);
          const verdict = verdictFor(robots, m.token, "/2026/");
          emit({ type: "decision", text: verdict.allowed ? `robots.txt allows ${m.token} (${verdict.rule})` : `robots.txt disallows ${m.token} (${verdict.rule})`, allowed: verdict.allowed });
          if (!verdict.allowed && respectRobots) blockedByRobots = true;
          result = `HTTP ${r.status}\n${r.body.slice(0, 2500)}`;
        } else {
          const kind = path === "/llms.txt" ? "llms" : path.startsWith("/sitemap") ? "sitemap" : /^\/\d{4}\//.test(path) ? "post" : "other";
          if (kind === "post" && blockedByRobots) {
            result = "Refused locally: robots.txt disallowed this bot and the operator's switch says to respect it. Do not request any more posts.";
          } else {
            const r = await step(path, kind, kind === "post" ? "post" : path.replace("/", ""));
            if (r.status === 402) {
              let terms = {};
              try { terms = JSON.parse(r.body); } catch { /* ignore */ }
              emit({ type: "payment", price: terms.pay?.amount, network: terms.pay?.network, payTo: terms.pay?.payTo });
            }
            result = `HTTP ${r.status}\n${r.body.slice(0, 2500)}`;
          }
        }
      } else if (call.function.name === "pay_for_training_bundle") {
        if (mode !== "train" || blockedByRobots) {
          result = "Refused: payment is only available in Train mode and only when robots.txt did not stop you.";
        } else {
          const tier = args.bundle === "full" ? "full" : "starter";
          const paid = payForBundle(tier);
          const bundle = buildBundle(tier, question);
          emit({ type: "paid", tier: paid.tier.label, charged: paid.charged, hours: PRICES.train.hours });
          emit({ type: "bundle", bundle });
          const titles = bundle.posts.map((p) => `- ${p.title}`).join("\n");
          result = `Paid (simulated demo wallet): ${paid.tier.label}, $${paid.charged}, valid ${PRICES.train.hours}h. Bundle delivered: ${bundle.postCount} posts, built from a local snapshot of the site's own source files, not fetched around the paywall. Titles in the bundle:\n${titles}\n\nMention the payment plainly in your final answer, and you may summarize or reference what's in this list, but you do not have the full text of these posts, do not invent details beyond a title.`;
        }
      } else if (call.function.name === "finish") {
        emit({ type: "answer", text: args.answer, sources: ((args.sources as string[]) || []).map((url) => ({ url, title: url })) });
        emit({ type: "done", mode, ...stats });
        return;
      } else {
        result = "Unknown tool.";
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: String(result) });
    }
  }
  emit({ type: "done", mode, ...stats });
}

async function run(opts: RunOpts, emit: (ev: unknown) => void) {
  if (!MODES[opts.mode]) throw new Error("Unknown mode");
  const brain = opts.brain === "openai" || opts.brain === "anthropic" ? opts.brain : "maplelabs";
  if (brain === "openai") {
    if (OPENAI_KEY) return runOpenAIAgent(opts, emit);
    emit({ type: "decision", text: "No OPENAI_API_KEY on this server, running MapleLabsBot's own script instead.", allowed: true });
  } else if (brain === "anthropic") {
    if (ANTHROPIC_KEY) return runAgent(opts, emit);
    emit({ type: "decision", text: "No ANTHROPIC_API_KEY on this server, running MapleLabsBot's own script instead.", allowed: true });
  }
  await runScripted(opts, emit);
}

// ---------- site policy and gate log (needs ADMIN_KEY) ----------
async function siteJson(path: string, init: RequestInit = {}) {
  const res = await fetch(SITE + path + (path.includes("?") ? "&" : "?") + "auth=" + encodeURIComponent(ADMIN_KEY), { ...init, headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json", ...(init.headers || {}) } });
  return res.json();
}
const modeOf = (r: { allowed: boolean; charge?: boolean }) => (r.allowed ? "free" : r.charge ? "charge" : "block");

async function waitUntilLive(mode: string) {
  const probe = { headers: { "User-Agent": "Mozilla/5.0 (compatible; MapleLabsBot-Verify/1.0; +https://github.com/dhru7777/AgentGate)" } };
  const started = Date.now();
  while (Date.now() - started < 25_000) {
    try {
      const robots = parseRobots(await (await fetch(`${SITE}/robots.txt?cb=${Date.now()}`, probe)).text());
      const disallowed = !verdictFor(robots, "MapleLabsBot-Verify", "/2026/").allowed;
      if (mode === "block") { if (disallowed) return true; }
      else if (!disallowed) {
        const post = await fetch(`${SITE}/2026/06/22/Understanding-ERC-8004.html?cb=${Date.now()}`, probe);
        if ((mode === "charge" && post.status === 402) || (mode === "free" && post.status === 200)) return true;
      }
    } catch { /* keep trying */ }
    await sleep(4000);
  }
  return false;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname === "/api/config") {
    const brains = {
      openai: { available: Boolean(OPENAI_KEY), model: OPENAI_MODEL },
      anthropic: { available: Boolean(ANTHROPIC_KEY), model: ANTHROPIC_MODEL },
      maplelabs: { available: true, model: null },
    };
    return json({
      site: SITE, modes: MODES, prices: PRICES, canControl: Boolean(ADMIN_KEY), requiresPolicyKey: Boolean(DEMO_POLICY_KEY), brains,
      wallets: { buyer: BUYER_ADDRESS || null, seller: SELLER_ADDRESS, chain: "Monad Testnet", explorer: MONAD_EXPLORER },
    });
  }

  if (pathname === "/api/wallets") {
    const [buyer, seller] = await Promise.all([walletBalances(BUYER_ADDRESS), walletBalances(SELLER_ADDRESS)]);
    return json({ buyer, seller });
  }

  if (pathname === "/api/policy" && req.method === "GET") {
    if (!ADMIN_KEY) return json({ mode: null });
    const data = await siteJson("/api/bot-rules");
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    return json({ mode: rule ? modeOf(rule) : null });
  }

  if (pathname === "/api/policy" && req.method === "POST") {
    if (!ADMIN_KEY) return json({ error: "ADMIN_KEY not set" }, 403);
    if (DEMO_POLICY_KEY && req.headers.get("x-demo-key") !== DEMO_POLICY_KEY) return json({ error: "Wrong or missing demo key for changing the live policy." }, 401);
    const body = await req.json();
    const mode = body.mode;
    if (!["free", "charge", "block"].includes(mode)) return json({ error: "bad mode" }, 400);
    const data = await siteJson("/api/bot-rules", { method: "POST", body: JSON.stringify({ id: RULE_ID, allowed: mode === "free", charge: mode === "charge" }) });
    const rule = (data.rules || []).find((r) => r.id === RULE_ID);
    const applied = await waitUntilLive(mode);
    return json({ mode: rule ? modeOf(rule) : null, applied });
  }

  if (pathname === "/api/log") {
    if (!ADMIN_KEY) return json({ rows: [] });
    const data = await siteJson("/api/analytics?range=week");
    const rows = (data.recent || [])
      .filter((r) => (/maplelabsbot/i.test(r.ua || "") || r.agent === "MapleLabsBot") && !/verify/i.test(r.ua || ""))
      .slice(0, 40)
      .map((r) => ({ ...r, model: modelFromUa(r.ua) }));
    return json({ rows });
  }

  if (pathname === "/api/run" && req.method === "POST") {
    const body = await req.json();
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const emit = (ev: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        try {
          await run({ mode: body.mode, brain: body.brain, question: String(body.question || "").slice(0, 300), respectRobots: body.respectRobots !== false, bundleChoice: body.bundleChoice }, emit);
        } catch (err) {
          emit({ type: "error", text: err instanceof Error ? err.message : String(err) });
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
  }

  return json({ error: "not found" }, 404);
};

export const config: Config = { path: "/api/*" };
