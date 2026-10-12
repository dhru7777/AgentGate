const $ = (s) => document.querySelector(s);
const state = { mode: "search", brain: "maplelabs", bundle: "starter", modes: {}, brains: {}, prices: {}, running: false, seen: new Set(), canControl: false, approveId: 0, settled: new Set(), last402Path: "" };
const PURPOSE = { training: "Training", search: "Search", user: "User search", unidentified: "Unidentified" };

const BRAND = {
  openai: { label: "ChatGPT", sub: "OpenAI" },
  anthropic: { label: "Claude", sub: "Anthropic" },
  maplelabs: { label: "MapleLabsBot", sub: "our own script, no model" },
};

function pickLabel(id) {
  if (id === "openai") return "ChatGPT";
  if (id === "anthropic") return "Claude";
  return "MapleLabsBot";
}
function pickWhy(id, cfg) {
  if (id === "maplelabs") return "MapleLabsBot";
  const b = cfg.brains[id];
  return b && b.available ? `live model, ${b.model}` : "needs an API key on the server";
}

async function init() {
  const cfg = await (await fetch("/api/config")).json();
  state.modes = cfg.modes;
  state.brains = cfg.brains;
  state.prices = cfg.prices;
  state.canControl = cfg.canControl; state.canRead = cfg.canRead;
  state.canPay = cfg.canPay;
  state.requiresPolicyKey = cfg.requiresPolicyKey;

  $("#site").textContent = cfg.site.replace("https://", "");
  $("#iframePath").textContent = cfg.site.replace("https://", "");
  // Fix: show the live blog right away instead of leaving the pane blank until the first message.
  $("#siteFrame").src = cfg.site;

  $("#modes").innerHTML = Object.entries(cfg.modes)
    .map(([id, m]) => `<button class="mode" role="tab" type="button" data-id="${id}">${m.label}</button>`)
    .join("");
  $("#modes").addEventListener("click", (e) => { const b = e.target.closest(".mode"); if (b) setMode(b.dataset.id); });

  $("#brains").innerHTML = ["maplelabs", "openai", "anthropic"]
    .map((id) => {
      const b = cfg.brains[id];
      const disabled = !b.available;
      return `<button class="pick" data-brain="${id}" type="button" title="${pickWhy(id, cfg)}" ${disabled ? "disabled" : ""}>${pickLabel(id)}</button>`;
    })
    .join("");
  $("#brains").addEventListener("click", (e) => { const b = e.target.closest(".pick"); if (b && !b.disabled) setBrain(b.dataset.brain); });

  $("#suggest").innerHTML = ["What is x402?", "Explain ERC-8004", "Why is double spending a problem?", "What do you think of liquid staking?"]
    .map((s) => `<button type="button">${s}</button>`)
    .join("");
  $("#suggest").addEventListener("click", (e) => { if (e.target.tagName === "BUTTON") { $("#q").value = e.target.textContent; $("#q").focus(); } });

  $("#bundles").innerHTML = ["starter", "full"]
    .map((id) => {
      const t = cfg.prices.train[id];
      const size = t.postCap >= 999 ? "every post" : `up to ${t.postCap} posts`;
      return `<button class="bundle-opt" type="button" data-bundle="${id}"><b>${t.label}</b><span>$${t.usd.toFixed(2)} &middot; ${size} &middot; ${cfg.prices.train.hours}h access</span></button>`;
    })
    .join("");
  $("#bundles").addEventListener("click", (e) => { const b = e.target.closest(".bundle-opt"); if (b) setBundle(b.dataset.bundle); });
  setBundle("starter");

  $("#form").addEventListener("submit", (e) => { e.preventDefault(); send(); });
  $("#trainForm").addEventListener("submit", (e) => { e.preventDefault(); train(); });
  $("#policy").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && state.canControl) setPolicy(b.dataset.mode); });
  $("#dotsBtn").addEventListener("click", () => { $("#dotsMenu").hidden = !$("#dotsMenu").hidden; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".brand")) $("#dotsMenu").hidden = true; });
  document.querySelectorAll(".max-btn").forEach((b) => b.addEventListener("click", () => toggleMax(b.dataset.pane)));

  try {
    const paid = await (await fetch("/api/settlements")).json();
    for (const row of paid.settlements || []) if (row.path) state.settled.add(pathKey(row.path));
  } catch { /* settlements are optional until the first approval */ }
  setMode("search");
  setBrain("maplelabs");
  loadPolicy();
  loadPlaces();
  pollLog();
  setInterval(() => { if (!document.hidden) pollLog(); }, 20000);
  initWallets(cfg.wallets);
}

const short = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "not configured");

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable, ignore */ }
}

// Each wallet is a small $ button that opens a popover on click, closes on an outside click
// or a second click on the same button, same interaction as midnightx402's ui-demo.
function wirePopover(wrapId, btnId) {
  const wrap = $(`#${wrapId}`), btn = $(`#${btnId}`);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !wrap.classList.contains("open");
    document.querySelectorAll(".pop-wrap.open").forEach((w) => w.classList.remove("open"));
    if (willOpen) wrap.classList.add("open");
  });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".pop-wrap")) document.querySelectorAll(".pop-wrap.open").forEach((w) => w.classList.remove("open"));
});

function initWallets(wallets) {
  if (!wallets) return;
  state.wallets = wallets;
  $("#buyerWrap").hidden = false;
  $("#sellerWrap").hidden = false;
  wirePopover("buyerWrap", "buyerBtn");
  wirePopover("sellerWrap", "sellerBtn");

  $("#buyerAddr").textContent = short(wallets.buyer);
  $("#sellerAddr").textContent = short(wallets.seller);
  if (wallets.buyer) {
    $("#buyerAddr").onclick = () => copyText(wallets.buyer);
    $("#buyerExplorer").href = `${wallets.explorer}/address/${wallets.buyer}`;
    $("#buyerExplorer").hidden = false;
  }
  $("#sellerAddr").onclick = () => copyText(wallets.seller);
  $("#sellerExplorer").href = `${wallets.explorer}/address/${wallets.seller}`;
  $("#sellerExplorer").hidden = false;

  pollWallets();
  setInterval(() => { if (!document.hidden) pollWallets(); }, 30000);
}

function paintTx(id, txs, busy) {
  const el = $(`#${id}`);
  if (!el) return;
  if (busy && !(txs && txs.length)) {
    el.innerHTML = `<div class="tx-empty">Explorer is busy, retrying shortly</div>`;
    return;
  }
  if (txs == null) {
    el.innerHTML = `<div class="tx-empty">Looking up transfers…</div>`;
    return;
  }
  if (!txs.length) {
    el.innerHTML = `<div class="tx-empty">No USDC transfers yet</div>`;
    return;
  }
  el.innerHTML = txs.map((t) => {
    const out = t.direction === "out";
    const sign = out ? "\u2212" : "+";
    return `<a class="tx ${out ? "out" : "in"}" href="${esc(t.explorer)}" target="_blank" rel="noreferrer"><span class="amt">${sign}${esc(t.amount)} USDC</span><span>${esc(t.hash.slice(0, 6))}…${esc(t.hash.slice(-4))}</span></a>`;
  }).join("");
}

async function pollWallets() {
  try {
    const { buyer, seller } = await (await fetch("/api/wallets")).json();
    if (buyer) { $("#buyerUsdc").textContent = `${buyer.usdc} USDC`; $("#buyerMon").textContent = `${buyer.mon} MON`; paintTx("buyerTx", buyer.txs); }
    if (seller) { $("#sellerUsdc").textContent = `${seller.usdc} USDC`; $("#sellerMon").textContent = `${seller.mon} MON`; paintTx("sellerTx", seller.txs); }
    if ((buyer && buyer.txs == null) || (seller && seller.txs == null)) setTimeout(pollWallets, 2000);
  } catch { /* balances are a nice-to-have, ignore failures */ }
}

function fixedQuote() {
  if (state.mode === "train") {
    const tier = (state.prices.train && state.prices.train[state.bundle]) || { usd: 0.15, label: "Starter bundle" };
    return { amount: Number(tier.usd).toFixed(2), label: tier.label };
  }
  const page = state.prices.search ? state.prices.search.perPage : 0.01;
  return { amount: Number(page).toFixed(2), label: "Pay per use" };
}

// A 402 shows this card before any USDC moves. Approve asks the server to send that
// amount on Monad from the buyer wallet to the configured seller. The key never
// reaches this page. Decline sends nothing.
function approvalCardHtml() {
  const id = `ap${++state.approveId}`;
  const quote = fixedQuote();
  const to = (state.wallets && state.wallets.seller) || "";
  const ready = state.canPay ? "" : `<div class="approve-note">The server has no buyer key yet, so Approve cannot send.</div>`;
  return `<div class="approve-card" id="${id}" data-path="${esc(state.last402Path || "")}">
    <div class="approve-status">$${esc(quote.amount)} USDC on Monad, to ${short(to)}</div>
    <div class="muted">Pay this, or not?</div>
    ${ready}
    <div class="approve-row">
      <button class="approve-yes" onclick="approvePay('${id}','${esc(quote.amount)}')">Approve</button>
      <button class="approve-no" onclick="declinePay('${id}')">Decline</button>
    </div>
  </div>`;
}

async function openPaidPost(path, amount) {
  try {
    const res = await fetch("/api/post?path=" + encodeURIComponent(path || ""));
    const post = await res.json();
    if (res.ok && post.found) {
      const body = (post.excerpts || []).map((p) => `<p>${esc(p)}</p>`).join("");
      return `<b>${esc(post.title)}</b>${body}`;
    }
  } catch { /* the receipt above still stands */ }
  return `<b>Paid $${esc(amount)}.</b>`;
}

window.approvePay = async (id, amount) => {
  const card = document.getElementById(id);
  if (!card || card.dataset.sending === "1") return;
  card.dataset.sending = "1";
  card.classList.add("resolved");
  const status = card.querySelector(".approve-status");
  status.textContent = "Sending…";
  const btns = [$("#buyerBtn"), $("#sellerBtn")].filter(Boolean);
  btns.forEach((b) => b.classList.add("flash"));
  setTimeout(() => btns.forEach((b) => b.classList.remove("flash")), 2000);
  if (!amount) {
    status.textContent = "Not sent";
    card.insertAdjacentHTML("beforeend", `<div class="approve-note">No amount on this 402.</div>`);
    return;
  }
  try {
    const res = await fetch("/api/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount, path: card.dataset.path || state.last402Path || "" }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Payment failed");
    const paidPath = data.path || card.dataset.path || state.last402Path;
    if (paidPath) state.settled.add(pathKey(paidPath));
    document.querySelectorAll(".badge.s402, .node.s402").forEach((el) => {
      el.classList.remove("s402");
      el.classList.add("s200");
    });
    status.textContent = `Paid $${esc(data.amount)}.`;
    card.querySelector(".muted").textContent = "";
    card.insertAdjacentHTML("beforeend", `<div class="approve-note"><a href="${esc(data.explorer)}" target="_blank" rel="noreferrer">MonadVision</a></div>`);
    const opened = await openPaidPost(paidPath, data.amount);
    const msg = card.closest(".msg");
    const answer = msg && msg.querySelector(".answer");
    if (answer) answer.innerHTML = opened;
    else card.insertAdjacentHTML("afterend", `<div class="answer">${opened}</div>`);
    pollWallets();
  } catch (err) {
    status.textContent = "Not sent";
    card.insertAdjacentHTML("beforeend", `<div class="approve-note">${esc(err.message || "Payment failed")}</div>`);
  }
};

window.declinePay = (id) => {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.add("resolved");
  const status = card.querySelector(".approve-status");
  if (status) status.textContent = "Declined";
};

function toggleMax(pane) {
  const current = document.body.dataset.max;
  if (current === pane) delete document.body.dataset.max;
  else document.body.dataset.max = pane;
  document.querySelectorAll(".max-btn").forEach((b) => {
    const on = document.body.dataset.max === b.dataset.pane;
    b.classList.toggle("is-max", on);
    b.title = on ? "Restore" : "Maximize";
    b.setAttribute("aria-label", on ? "Restore" : "Maximize this pane");
  });
}

// Search is a conversation with a chosen brain. Train is a one-shot crawl run by the script,
// ending in a bundle download, so it gets a form and a log instead of a chat.
function setMode(id) {
  state.mode = id;
  document.querySelectorAll(".mode").forEach((b) => {
    b.classList.toggle("on", b.dataset.id === id);
    b.setAttribute("aria-selected", b.dataset.id === id);
  });
  $("#modeWhy").textContent = state.modes[id].why;
  const chat = document.querySelector(".chat");
  chat.dataset.mode = id;
  chat.dataset.brain = id === "train" ? "maplelabs" : state.brain;
  $("#brainTag").textContent = brainTag();
}
function setBundle(id) {
  state.bundle = id;
  document.querySelectorAll(".bundle-opt").forEach((b) => b.classList.toggle("on", b.dataset.bundle === id));
}
const brainTag = () => (state.brain === "maplelabs" ? "" : pickWhy(state.brain, { brains: state.brains }));
function setBrain(id) {
  state.brain = id;
  document.querySelectorAll(".pick").forEach((b) => b.classList.toggle("on", b.dataset.brain === id));
  $("#brainTag").textContent = brainTag();
  // The pane itself darkens toward whichever brand is currently picked. Past messages keep
  // the theme they were sent under regardless, this only changes the chrome going forward.
  document.querySelector(".chat").dataset.brain = id;
}

async function loadPolicy() { paintPolicy((await (await fetch("/api/policy")).json()).mode || "charge"); }
function paintPolicy(mode) {
  document.querySelectorAll("#policy button").forEach((b) => { b.classList.toggle("on", b.dataset.mode === mode); b.disabled = !state.canControl; });
  const MODE_TEXT = { free: "robots.txt allows it. Posts are served.", charge: "robots.txt allows it. Posts answer HTTP 402 until paid.", block: "robots.txt disallows it. A bot that obeys never asks for a post." };
  $("#policyHint").textContent = !state.canControl
    ? (MODE_TEXT[mode] || MODE_TEXT.charge) + " Read-only in this preview."
    : mode === "free" ? "robots.txt allows it. Posts are served."
    : mode === "charge" ? "robots.txt allows it. Posts answer HTTP 402 until paid."
    : "robots.txt disallows it. A bot that obeys never asks for a post.";
}
function policyKeyHeader() {
  if (!state.requiresPolicyKey) return {};
  let key = sessionStorage.getItem("maplelabs.policyKey");
  if (!key) {
    key = prompt("Changing the live Free/Charge/Block policy needs the demo key. Ask the site owner for it.") || "";
    sessionStorage.setItem("maplelabs.policyKey", key);
  }
  return { "x-demo-key": key };
}

async function setPolicy(mode) {
  paintPolicy(mode);
  setRunning(true);
  $("#policyHint").textContent = "Applying on the live site, this can take up to a minute.";
  const r = await (await fetch("/api/policy", { method: "POST", headers: policyKeyHeader(), body: JSON.stringify({ mode }) })).json();
  setRunning(false);
  if (r.error) {
    sessionStorage.removeItem("maplelabs.policyKey");
    $("#policyHint").textContent = r.error;
    return;
  }
  paintPolicy(r.mode);
  if (!r.applied) $("#policyHint").textContent = "Saved, but the site has not picked it up yet. Try again in a few seconds.";
}

function add(html, cls) { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; $("#thread").append(d); $("#thread").scrollTop = 1e9; return d; }
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const pathKey = (p) => {
  try { return new URL(p, "https://local").pathname; } catch { return p || ""; }
};
const cls = (s, path) => (s === 200 || (s === 402 && path && state.settled.has(pathKey(path))) ? "s200" : s === 402 ? "s402" : "sx");

function beam(label) {
  const b = $("#beam"); $("#beamLabel").textContent = label;
  b.classList.remove("active"); void b.offsetWidth; b.classList.add("active");
}
function navigateSite(path) {
  const site = $("#site").textContent;
  $("#iframePath").textContent = site + path;
  $("#siteFrame").src = "https://" + site + path;
}

function avatarFor(brand) {
  if (brand === "openai") return `<span class="avatar"></span>`;
  if (brand === "anthropic") return `<span class="avatar"></span>`;
  return `<span class="avatar">M</span>`;
}

function setRunning(on) {
  state.running = on;
  $("#send").disabled = on;
  $("#trainGo").disabled = on;
  $("#trainGo").textContent = on ? "Crawling..." : "Start crawl";
}

async function send() {
  const q = $("#q").value.trim(); if (!q || state.running) return;
  $("#q").value = "";
  add(esc(q), "msg me");
  await run($("#thread"), { mode: "search", brain: state.brain, question: q });
  $("#q").focus();
}

async function train() {
  if (state.running) return;
  $("#trainLog").innerHTML = "";
  await run($("#trainLog"), { mode: "train", brain: "maplelabs", question: $("#topic").value.trim(), bundleChoice: state.bundle });
}

async function run(target, { mode: modeAtSend, brain: brainAtSend, question: q, bundleChoice }) {
  setRunning(true);
  const bot = document.createElement("div");
  bot.className = `msg bot brand-${brainAtSend}`;
  target.append(bot);
  bot.innerHTML = `
    <div class="bot-head">${avatarFor(brainAtSend)}<span class="who">${BRAND[brainAtSend].label}</span><span class="who-sub">&middot; ${esc(BRAND[brainAtSend].sub)} &middot; ${esc(state.modes[modeAtSend].label)}</span></div>
    <div class="steps"></div>
  `;
  const steps = bot.querySelector(".steps");
  document.querySelectorAll(".node").forEach((n) => (n.className = "node skip"));
  let req = 0, ok = 0, blocked = 0;
  const put = (parent, html) => { parent.insertAdjacentHTML("beforeend", html); return parent.lastElementChild; };
  const hold = async (el, also) => {
    document.querySelectorAll(".focus").forEach((n) => n.classList.remove("focus"));
    if (el && !el.classList.contains("approve-card")) el.classList.add("focus");
    if (also) also.classList.add("focus");
    const yes = document.querySelector(".approve-card:not(.resolved) .approve-yes");
    if (yes) yes.classList.add("focus");
    const shown = el || also;
    if (shown) shown.scrollIntoView({ block: "nearest" });
    await new Promise((r) => setTimeout(r, 1700));
  };

  const res = await fetch("/api/run", { method: "POST", body: JSON.stringify({ mode: modeAtSend, brain: brainAtSend, question: q, bundleChoice, respectRobots: $("#respect").checked }) });
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop();
    for (const p of parts) {
      if (!p.startsWith("data: ")) continue;
      const ev = JSON.parse(p.slice(6));
      let shown = null;
      let node = null;
      if (ev.type === "step") {
        req++; if (ev.status === 200) ok++; if (ev.status === 402) { blocked++; state.last402Path = ev.path; }
        shown = put(steps, `<div class="step"><span class="badge ${cls(ev.status, ev.path)}">${ev.status}</span><span>${esc(ev.label)}</span><code>${esc(ev.path.length > 42 ? ev.path.slice(0, 42) + "..." : ev.path)}</code></div>`);
        node = document.querySelector(`.node[data-k="${ev.kind}"]`);
        if (node) node.className = "node " + cls(ev.status, ev.path);
        $("#kReq").textContent = req; $("#kOk").textContent = ok; $("#kBlock").textContent = blocked;
        beam(ev.path); navigateSite(ev.path);
      } else if (ev.type === "decision") {
        shown = put(steps, `<div class="note ${ev.violation || ev.allowed === false ? "warn" : ""}">${esc(ev.text)}</div>`);
      } else if (ev.type === "aside" || ev.type === "thinking" || ev.type === "answer" || ev.type === "error") {
        if (ev.type === "answer" && ev.text === "Approve to open it.") { /* the Approve button is the ask */ }
        else {
          const bit = ev.type === "answer"
            ? `${esc(ev.text)}${(ev.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a>`).join("")}`
            : esc(ev.type === "thinking" && ev.text.length > 240 ? ev.text.slice(0, 240) + "..." : ev.text);
          if (!bot.querySelector(".chat-bubble")) put(bot, `<div class="chat-bubble answer"></div>`);
          const bubble = bot.querySelector(".chat-bubble");
          bubble.insertAdjacentHTML("beforeend", `<p>${bit}</p>`);
          shown = bubble;
        }
      } else if (ev.type === "payment") {
        shown = put(bot, approvalCardHtml());
      } else if (ev.type === "paid") {
        shown = put(bot, `<div class="paid">${esc(ev.tier)} · $${ev.charged} · ${ev.hours}h</div>`);
      } else if (ev.type === "bundle") {
        const b = ev.bundle;
        const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        shown = put(bot, `<div class="bundle">${b.postCount} posts<br><a class="dl" href="${url}" download="maplelabs-bundle-${b.bundle}.json">Download bundle.json</a></div>`);
      }
      if (shown) await hold(shown, node);
    }
  }
  setRunning(false); pollLog();
  // Each step is logged to the blog in the background, after its response already
  // went out - polling once right when the run ends can race ahead of the last
  // write and show one row short. A second poll a moment later catches it.
  setTimeout(pollLog, 1800);
}

async function loadPlaces() {
  try {
    const { places } = await (await fetch("/api/places")).json();
    if (window.globeSyncPlaces) window.globeSyncPlaces(places);
  } catch { /* the gate log still draws whatever it has */ }
}

async function pollLog() {
  try {
    const { rows } = await (await fetch("/api/log")).json();
    if (!state.canRead) { $("#logState").textContent = "off in this preview"; return; }
    $("#logState").textContent = rows.length ? `${rows.length} recent` : "nothing yet";
    const body = $("#log tbody"); const first = state.seen.size === 0;
    body.innerHTML = rows.map((r) => {
      const id = r.ts + r.path; const fresh = !first && !state.seen.has(id); state.seen.add(id);
      const robots = r.robots ? `<span class="pill ${r.robots === "allowed" ? "s200" : "s402"}">${r.robots}</span>` : "";
      const statusClass = cls(r.status, r.path);
      return `<tr class="${fresh ? "fresh" : ""}"><td>${new Date(r.ts).toLocaleTimeString()}</td><td>${esc(r.model || "")}</td><td>${PURPOSE[r.purpose] || r.purpose || ""}</td><td title="${esc(r.path)}">${esc(r.path)}</td><td><span class="pill ${statusClass}">${r.status}</span></td><td>${robots}</td></tr>`;
    }).join("");
    if (window.globeSyncRows) window.globeSyncRows(rows);
  } catch { $("#logState").textContent = "offline"; }
}

init();
