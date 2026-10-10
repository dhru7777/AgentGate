const $ = (s) => document.querySelector(s);
const state = { mode: "search", modes: {}, prices: {}, running: false, seen: new Set(), canControl: false };
const PURPOSE = { training: "Training", search: "Search", user: "User search", unidentified: "Unidentified" };

function brainLabelFor(mode) {
  const b = state.brains[mode];
  return b ? `live · ${b.model} (${b.vendor === "openai" ? "OpenAI" : "Anthropic"})` : "scripted fallback (no API key)";
}

async function init() {
  const cfg = await (await fetch("/api/config")).json();
  state.modes = cfg.modes; state.prices = cfg.prices; state.canControl = cfg.canControl; state.brains = cfg.brains;
  $("#site").textContent = cfg.site.replace("https://", "");
  $("#iframePath").textContent = cfg.site.replace("https://", "");
  $("#brainTag").textContent = brainLabelFor(state.mode);
  $("#modes").innerHTML = Object.entries(cfg.modes).map(([id, m]) => `<button class="mode" data-id="${id}"><b>${m.label}</b><span>${m.why}</span></button>`).join("");
  $("#modes").addEventListener("click", (e) => { const b = e.target.closest(".mode"); if (b) setMode(b.dataset.id); });
  $("#suggest").innerHTML = ["What is x402?", "Explain ERC-8004", "Why is double spending a problem?", "What do you think of liquid staking?"].map((s) => `<button type="button">${s}</button>`).join("");
  $("#suggest").addEventListener("click", (e) => { if (e.target.tagName === "BUTTON") { $("#q").value = e.target.textContent; $("#q").focus(); } });
  $("#form").addEventListener("submit", (e) => { e.preventDefault(); send(); });
  $("#policy").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && state.canControl) setPolicy(b.dataset.mode); });
  $("#dotsBtn").addEventListener("click", () => { $("#dotsMenu").hidden = !$("#dotsMenu").hidden; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".brand")) $("#dotsMenu").hidden = true; });
  setMode("search"); loadPolicy(); pollLog(); setInterval(pollLog, 2500);
}

function setMode(id) {
  state.mode = id;
  document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
  $("#brainTag").textContent = brainLabelFor(id);
}

async function loadPolicy() { paintPolicy((await (await fetch("/api/policy")).json()).mode); }
function paintPolicy(mode) {
  document.querySelectorAll("#policy button").forEach((b) => { b.classList.toggle("on", b.dataset.mode === mode); b.disabled = !state.canControl; });
  $("#policyHint").textContent = !state.canControl ? "Start the server with ADMIN_KEY to switch the policy here."
    : mode === "free" ? "robots.txt allows it. Posts are served." : mode === "charge" ? "robots.txt allows it. Posts answer HTTP 402 until paid." : "robots.txt disallows it. A bot that obeys never asks for a post.";
}
async function setPolicy(mode) {
  paintPolicy(mode);
  state.running = true; $("#send").disabled = true;
  $("#policyHint").textContent = "Applying on the live site… this can take up to a minute.";
  const r = await (await fetch("/api/policy", { method: "POST", body: JSON.stringify({ mode }) })).json();
  state.running = false; $("#send").disabled = false;
  paintPolicy(r.mode);
  if (!r.applied) $("#policyHint").textContent = "Saved, but the site has not picked it up yet. Try again in a few seconds.";
}

function add(html, cls) { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; $("#thread").append(d); $("#thread").scrollTop = 1e9; return d; }
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const cls = (s) => (s === 200 ? "s200" : s === 402 ? "s402" : "sx");

function beam(label) {
  const b = $("#beam"); $("#beamLabel").textContent = label;
  b.classList.remove("active"); void b.offsetWidth; b.classList.add("active");
}

function navigateSite(path) {
  const site = $("#site").textContent;
  $("#iframePath").textContent = site + path;
  $("#siteFrame").src = "https://" + site + path;
}

async function send() {
  const q = $("#q").value.trim(); if (!q || state.running) return;
  $("#q").value = ""; state.running = true; $("#send").disabled = true;
  add(esc(q), "msg me");
  const brainLabel = $("#brainTag").textContent;
  const bot = add(`<span class="tag">${state.modes[state.mode].label}<span class="brain">· ${esc(brainLabel)}</span></span><div class="steps"></div>`, "msg bot");
  const steps = bot.querySelector(".steps");
  document.querySelectorAll(".node").forEach((n) => (n.className = "node skip"));
  let req = 0, ok = 0, blocked = 0;
  const res = await fetch("/api/run", { method: "POST", body: JSON.stringify({ mode: state.mode, question: q, respectRobots: $("#respect").checked }) });
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop();
    for (const p of parts) {
      if (!p.startsWith("data: ")) continue;
      const ev = JSON.parse(p.slice(6));
      if (ev.type === "step") {
        req++; if (ev.status === 200) ok++; if (ev.status === 402) blocked++;
        steps.insertAdjacentHTML("beforeend", `<div class="step"><span class="badge ${cls(ev.status)}">${ev.status}</span><span>${esc(ev.label)}</span><code>${esc(ev.path.length > 42 ? ev.path.slice(0, 42) + "…" : ev.path)} · ${ev.ms}ms</code></div>`);
        const node = document.querySelector(`.node[data-k="${ev.kind}"]`); if (node) node.className = "node " + cls(ev.status);
        $("#kReq").textContent = req; $("#kOk").textContent = ok; $("#kBlock").textContent = blocked;
        beam(ev.path); navigateSite(ev.path);
      } else if (ev.type === "decision") {
        steps.insertAdjacentHTML("beforeend", `<div class="note ${ev.violation || ev.allowed === false ? "warn" : ""}">${esc(ev.text)}</div>`);
      } else if (ev.type === "payment") {
        steps.insertAdjacentHTML("beforeend", `<div class="pay"><b>HTTP 402 Payment Required</b>${ev.price ? `<br>${esc(ev.price)} on ${esc(ev.network || "")}` : ""}</div>`);
      } else if (ev.type === "paid") {
        steps.insertAdjacentHTML("beforeend", `<div class="paid"><b>Paid (simulated demo wallet)</b><br>${esc(ev.tier)} · $${ev.charged} · valid ${ev.hours}h</div>`);
      } else if (ev.type === "bundle") {
        const b = ev.bundle;
        const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        steps.insertAdjacentHTML("beforeend", `<div class="bundle">${b.postCount} posts · expires ${new Date(b.expiresAt).toLocaleString()}<br><span class="muted">${esc(b.source)}</span><br><a class="dl" href="${url}" download="maplelabs-bundle-${b.bundle}.json">Download bundle.json</a></div>`);
      } else if (ev.type === "answer") {
        bot.insertAdjacentHTML("beforeend", `<div class="answer">${esc(ev.text)}${(ev.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a>`).join("")}</div>`);
      } else if (ev.type === "error") {
        bot.insertAdjacentHTML("beforeend", `<div class="answer">${esc(ev.text)}</div>`);
      }
      $("#thread").scrollTop = 1e9;
    }
  }
  state.running = false; $("#send").disabled = false; $("#q").focus(); pollLog();
}

async function pollLog() {
  try {
    const { rows } = await (await fetch("/api/log")).json();
    if (!state.canControl) { $("#logState").textContent = "needs ADMIN_KEY"; return; }
    $("#logState").textContent = rows.length ? `${rows.length} recent` : "nothing yet";
    const body = $("#log tbody"); const first = state.seen.size === 0;
    body.innerHTML = rows.map((r) => {
      const id = r.ts + r.path; const fresh = !first && !state.seen.has(id); state.seen.add(id);
      const robots = r.robots ? `<span class="pill ${r.robots === "allowed" ? "s200" : "s402"}">${r.robots}</span>` : "";
      return `<tr class="${fresh ? "fresh" : ""}"><td>${new Date(r.ts).toLocaleTimeString()}</td><td>${PURPOSE[r.purpose] || r.purpose || ""}</td><td title="${esc(r.path)}">${esc(r.path)}</td><td><span class="pill ${cls(r.status)}">${r.status}</span></td><td>${robots}</td></tr>`;
    }).join("");
  } catch { $("#logState").textContent = "offline"; }
}
init();
