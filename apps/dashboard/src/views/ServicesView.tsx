import { useMemo, useState } from "react";
import { BarChart, DoughnutChart, LineChart } from "../components/Charts";
import { RequestMap } from "../components/RequestMap";
import { Insights } from "./InsightsView";
import { RULE_GROUPS } from "../data";
import { findAnomalies, robotsTable } from "../modules/services/anomalies";
import { hitsFor, robotsPreview, shortPath, summarize } from "../summarize";
import type { AgentView, Range, Rule, RuleMode, Service, ServiceView, Summary, Visit } from "../types";

const fmt = (value: number) => value.toLocaleString();
const money = (value: number) => `$${value.toFixed(2)}`;

function formatTimeSpent(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function Kpis({ summary }: { summary: Summary }) {
  const items: [string, string][] = [
    ["Total requests", fmt(summary.totalRequests)],
    ["Unique visitors", fmt(summary.uniqueVisitors)],
    ["AI agent requests", fmt(summary.aiAgentRequests)],
    ["Human requests", fmt(summary.humanRequests)],
    ["Blog requests", fmt(summary.blogRequests)],
    ["HTTP 402", fmt(summary.paymentRequired)],
    ["Paid requests", fmt(summary.paidRequests)],
    ["Revenue", money(summary.revenueUsdc)],
    ["Good agents", fmt(summary.goodVisitors)],
    ["Bad agents", fmt(summary.badVisitors)],
    ["Paid after 402", fmt(summary.paidVisitors)],
  ];
  return (
    <div className="obs-kpis">
      {items.map(([label, value]) => (
        <div className="obs-kpi" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function CountTable({ rows, a, b }: { rows: { name: string; count: number }[]; a: string; b: string }) {
  if (!rows.length) return <p className="obs-empty">None in this range.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{a}</th>
            <th>{b}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{fmt(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentAnomalies({ summary, rules }: { summary: Summary; rules: Rule[] }) {
  const anomalies = useMemo(() => findAnomalies(summary.recent, rules), [summary.recent, rules]);
  const robots = useMemo(() => robotsTable(summary.recent, rules), [summary.recent, rules]);
  const served = anomalies.filter((row) => row.kind === "disallowed-served").length;
  const blocked = anomalies.filter((row) => row.kind === "allowed-blocked").length;
  const robotsSeen = robots.reduce((sum, row) => sum + row.robotsFetches, 0);
  return (
    <>
      {anomalies.length > 0 && (
        <p className="anomaly-alert" role="status">
          {anomalies.length} {anomalies.length === 1 ? "anomaly" : "anomalies"} in this range.
          A disallowed bot received a page, or an allowed bot was blocked.
        </p>
      )}
      <h2>Anomalies</h2>
      <div className="obs-chart obs-chart-sm">
        <BarChart labels={["Disallowed, page sent", "Allowed, blocked"]} values={[served, blocked]} />
      </div>
      {anomalies.length === 0 ? (
        <p className="obs-empty">No anomaly in the stored events.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Bot</th>
                <th>Purpose</th>
                <th>Path</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.ts).toLocaleString()}</td>
                  <td>{row.agent}</td>
                  <td>{row.purpose}</td>
                  <td title={row.path}>{shortPath(row.path)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>robots.txt</h2>
      <p className="obs-lead">
        {robotsSeen === 0
          ? "No robots.txt fetch is in this log. A fetch would show here as its own event, marked allowed or disallowed."
          : `${fmt(robotsSeen)} robots.txt ${robotsSeen === 1 ? "fetch is" : "fetches are"} in this log.`}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bot</th>
              <th>Rule</th>
              <th>Purpose</th>
              <th>robots.txt</th>
              <th>Other requests</th>
            </tr>
          </thead>
          <tbody>
            {robots.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.access}</td>
                <td>{row.purpose}</td>
                <td>{row.robotsFetches === 0 ? "not recorded" : fmt(row.robotsFetches)}</td>
                <td>{fmt(row.pageRequests)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Graphs({ summary }: { summary: Summary }) {
  const labels = summary.series.map((row) => row.t);
  return (
    <>
      <Kpis summary={summary} />
      <RequestMap places={summary.places} visits={summary.recent} total={summary.recent.length} />
      <h2>Traffic</h2>
      <div className="obs-chart">
        <LineChart
          labels={labels}
          datasets={[
            { label: "Requests", data: summary.series.map((row) => row.requests), borderColor: "#26221c" },
            { label: "Human", data: summary.series.map((row) => row.human), borderColor: "#2f4a3a" },
            { label: "AI", data: summary.series.map((row) => row.ai), borderColor: "#8c6d3a" },
          ]}
        />
      </div>
      <div className="obs-split">
        <div>
          <h2>Human vs AI</h2>
          <div className="obs-chart obs-chart-sm">
            <DoughnutChart labels={["Human", "AI"]} values={[summary.humanRequests, summary.aiAgentRequests]} />
          </div>
        </div>
        <div>
          <h2>Status</h2>
          <div className="obs-chart obs-chart-sm">
            <DoughnutChart
              labels={summary.status.map((row) => row.name)}
              values={summary.status.map((row) => row.count)}
            />
          </div>
        </div>
      </div>
      <h2>402 paywall vs paid</h2>
      <div className="obs-chart">
        <LineChart
          labels={labels}
          datasets={[
            { label: "402 blocked", data: summary.series.map((row) => row.blocked), borderColor: "#8a3a32" },
            { label: "Paid", data: summary.series.map((row) => row.paid), borderColor: "#6f8466" },
          ]}
        />
      </div>
    </>
  );
}

function Agents({ summary, rules, view, onView }: { summary: Summary; rules: Rule[]; view: AgentView; onView: (view: AgentView) => void }) {
  const tabs: { id: AgentView; label: string }[] = [
    { id: "all", label: "All Agents" },
    { id: "compare", label: "Good vs Bad Agents" },
    { id: "good", label: `Good Agents (${fmt(summary.goodVisitors)})` },
    { id: "bad", label: `Bad Agents (${fmt(summary.badVisitors)})` },
    { id: "paid", label: `Paid Agents (${fmt(summary.paidVisitors)})` },
  ];
  return (
    <>
      <AgentAnomalies summary={summary} rules={rules} />
      <div className="obs-highlights">
        <div>
          <span>Top agent</span>
          <strong>{summary.topAgent ? `${summary.topAgent.name} · ${fmt(summary.topAgent.count)}` : "—"}</strong>
        </div>
      </div>
      <div className="obs-subtabs">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={view === tab.id ? "is-active" : ""} onClick={() => onView(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      {view === "compare" && (
        <>
          <p className="obs-lead">
            Good agents hit HTTP 402 and stopped. Bad agents were gated but still fetched the page. Paid agents stopped at 402, paid USDC on Monad, and came back with a receipt.
          </p>
          <div className="obs-kpis">
            <div className="obs-kpi"><span>Good (stopped at 402)</span><strong>{fmt(summary.goodVisitors)}</strong></div>
            <div className="obs-kpi"><span>Bad (bypassed 402)</span><strong>{fmt(summary.badVisitors)}</strong></div>
            <div className="obs-kpi"><span>Paid after stopping</span><strong>{fmt(summary.paidVisitors)}</strong></div>
          </div>
          <div className="obs-chart obs-chart-sm">
            <DoughnutChart
              labels={["Good", "Bad", "Paid"]}
              values={[summary.goodVisitors, summary.badVisitors, summary.paidVisitors]}
              colors={["#4f6b4a", "#8a3a32", "#2f4a3a"]}
            />
          </div>
          <h2>Good agents</h2>
          <CountTable rows={summary.goodAgents} a="Agent" b="Visitors" />
          <h2>Bad agents</h2>
          <CountTable rows={summary.badAgents} a="Agent" b="Visitors" />
          <h2>Paid agents</h2>
          <CountTable rows={summary.paidAgents} a="Agent" b="Visitors" />
        </>
      )}
      {view === "good" && (
        <>
          <p className="obs-lead">Good agents hit HTTP 402 Payment Required and stopped.</p>
          <CountTable rows={summary.goodAgents} a="Agent" b="Visitors" />
        </>
      )}
      {view === "bad" && (
        <>
          <p className="obs-lead">Bad agents were gated by HTTP 402 but still fetched the page without paying.</p>
          <CountTable rows={summary.badAgents} a="Agent" b="Visitors" />
        </>
      )}
      {view === "paid" && (
        <>
          <p className="obs-lead">Paid agents stopped at HTTP 402, paid USDC on Monad, and returned with a receipt.</p>
          <CountTable rows={summary.paidAgents} a="Agent" b="Visitors" />
        </>
      )}
      {view === "all" && (
        <>
          <p className="obs-lead">Agent traffic for this service. Open Good vs Bad to see who honored the paywall.</p>
          <div className="obs-kpis">
            <div className="obs-kpi"><span>Good agents</span><strong>{fmt(summary.goodVisitors)}</strong></div>
            <div className="obs-kpi"><span>Bad agents</span><strong>{fmt(summary.badVisitors)}</strong></div>
            <div className="obs-kpi"><span>Paid after 402</span><strong>{fmt(summary.paidVisitors)}</strong></div>
          </div>
          <div className="obs-chart">
            <BarChart
              labels={summary.topAgents.slice(0, 12).map((row) => row.name)}
              values={summary.topAgents.slice(0, 12).map((row) => row.count)}
            />
          </div>
          <CountTable rows={summary.topAgents} a="Agent" b="Requests" />
        </>
      )}
    </>
  );
}

function Pages({ summary }: { summary: Summary }) {
  return (
    <>
      <div className="obs-highlights">
        <div>
          <span>Top page</span>
          <strong>{summary.topBlog ? `${summary.topBlog.name} · ${fmt(summary.topBlog.count)}` : "—"}</strong>
        </div>
      </div>
      <p className="obs-lead">What they actually opened. These paths are the pages agents pay for.</p>
      <div className="obs-chart">
        <BarChart
          labels={summary.topPages.slice(0, 12).map((row) => row.name)}
          values={summary.topPages.slice(0, 12).map((row) => row.count)}
        />
      </div>
      <CountTable rows={summary.topPages} a="Page" b="Requests" />
    </>
  );
}

// Individual request rows for this range were evicted before the flood was caught
// (confirmed unrecoverable). Only the daily totals in summary.series survived.
// summary.series labels are pre-formatted ("Oct 3") with no year, so matched literally.
const GAP_DAY_LABELS = new Set(["Oct 3", "Oct 4", "Oct 5", "Oct 6", "Oct 7", "Oct 8", "Oct 9"]);

function eventSignature(event: Visit): string {
  return `${event.kind}|${event.agent}|${event.status}|${event.path}`;
}

// Collapses a run of consecutive, same-signature requests (same kind/agent/status/path,
// back to back in time) down to the first and last of that run. Display-only — never
// touches the underlying stored data. A burst (e.g. a retry loop) becomes 2 rows instead
// of hundreds; genuinely distinct requests are all still shown.
function dedupeForDisplay(events: Visit[]): { rows: Visit[]; collapsedAway: number } {
  const byTimeAsc = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const kept: Visit[] = [];
  let collapsedAway = 0;
  let i = 0;
  while (i < byTimeAsc.length) {
    let j = i;
    while (j + 1 < byTimeAsc.length && eventSignature(byTimeAsc[j + 1]) === eventSignature(byTimeAsc[i])) j++;
    kept.push(byTimeAsc[i]);
    if (j > i) {
      kept.push(byTimeAsc[j]);
      collapsedAway += j - i - 1;
    }
    i = j + 1;
  }
  kept.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return { rows: kept, collapsedAway };
}

function Events({ summary }: { summary: Summary }) {
  const [kind, setKind] = useState("all");
  const [agent, setAgent] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const { rows: visible, collapsedAway } = useMemo(() => dedupeForDisplay(summary.recent), [summary.recent]);
  const kinds = [...new Set(visible.map((event) => event.kind))].sort();
  const agents = [...new Set(visible.map((event) => event.agent))].sort();
  const statuses = [...new Set(visible.map((event) => String(event.status)))].sort();
  const q = query.toLowerCase().trim();
  const filtered = visible.filter((event) => {
    if (kind !== "all" && event.kind !== kind) return false;
    if (agent !== "all" && event.agent !== agent) return false;
    if (status !== "all" && String(event.status) !== status) return false;
    if (!q) return true;
    const hay = `${event.path} ${event.kind} ${event.agent} ${event.status} ${event.city} ${event.country} ${formatTimeSpent(event.durationMs)}`.toLowerCase();
    return hay.includes(q);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const gapDays = summary.series.filter((row) => GAP_DAY_LABELS.has(row.t));

  return (
    <>
      <p className="obs-lead">
        {fmt(filtered.length)} of {fmt(visible.length)} requests.
        {collapsedAway > 0 ? ` ${fmt(collapsedAway)} repeat requests (same kind, client, status and path back to back) collapsed to their first and last occurrence.` : ""}
      </p>
      {gapDays.length > 0 && (
        <div className="obs-gap-note">
          <p className="obs-empty">
            No individual request rows survive for Oct 3–9 (evicted before the flood was caught), {fmt(gapDays.reduce((sum, row) => sum + row.requests, 0))} requests total. Daily totals for that window:
          </p>
          <div className="obs-chart">
            <BarChart labels={gapDays.map((row) => row.t)} values={gapDays.map((row) => row.requests)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Day</th><th>Requests</th><th>Human</th><th>AI</th></tr>
              </thead>
              <tbody>
                {gapDays.map((row) => (
                  <tr key={row.t}>
                    <td>{row.t}</td>
                    <td>{fmt(row.requests)}</td>
                    <td>{fmt(row.human)}</td>
                    <td>{fmt(row.ai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="obs-event-filters">
        <label>
          Kind
          <select value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }}>
            <option value="all">All</option>
            {kinds.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Client
          <select value={agent} onChange={(event) => { setAgent(event.target.value); setPage(1); }}>
            <option value="all">All</option>
            {agents.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">All</option>
            {statuses.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="obs-event-search">
          Search
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Path, agent, city" />
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="obs-empty">No events match these filters.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Path</th>
                <th>Client</th>
                <th>Status</th>
                <th>Place</th>
                <th title="How long this client stayed, from their first request in the visit to the last. Visits reset after 30 minutes of quiet. A single request has no time spent.">Time spent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.ts).toLocaleString()}</td>
                  <td title={event.path}>{shortPath(event.path)}</td>
                  <td>{event.agent}{event.agentId ? ` #${event.agentId}` : ""}</td>
                  <td>{event.status}</td>
                  <td>{event.city}</td>
                  <td>{formatTimeSpent(event.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="obs-pager">
        <button type="button" className="obs-page" disabled={current === 1} onClick={() => setPage(current - 1)}>Prev</button>
        <span className="obs-pager-meta">Page {current} of {pages}</span>
        <button type="button" className="obs-page" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button>
      </div>
    </>
  );
}

function Permissions({
  rules,
  summary,
  origin,
  onToggle,
  onAction,
}: {
  rules: Rule[];
  summary: Summary;
  origin: string;
  onToggle: (id: string, mode: RuleMode) => void;
  onAction: (action: "allow_all" | "block_all_ai" | "charge_ai" | "reset") => void;
}) {
  const [toast, setToast] = useState("");
  const preview = useMemo(() => robotsPreview(rules, origin), [rules, origin]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <>
      <div className="obs-perm-actions">
        <button type="button" className="obs-btn-sm" onClick={() => { onAction("allow_all"); flash("All allowed"); }}>Allow all</button>
        <button type="button" className="obs-btn-sm" onClick={() => { onAction("charge_ai"); flash("AI set to charge"); }}>Charge AI</button>
        <button type="button" className="obs-btn-sm" onClick={() => { onAction("block_all_ai"); flash("AI blocked"); }}>Block AI</button>
        <button type="button" className="obs-btn-sm" onClick={() => { onAction("reset"); flash("Reset"); }}>Reset</button>
        {toast && <span className="obs-toast">{toast}</span>}
      </div>
      {RULE_GROUPS.map((group) => {
        const groupRules = rules.filter((rule) => group.ids.includes(rule.id));
        if (!groupRules.length) return null;
        return (
          <section key={group.title}>
            <h3 className="obs-rule-group-title">{group.title}</h3>
            {groupRules.map((rule) => {
              const hits = hitsFor(rule.patterns, summary.recent);
              return (
                <div className="obs-rule-card" key={rule.id}>
                  <div className="obs-rule-left">
                    <p className="obs-rule-name">{rule.name}</p>
                    <span className="obs-agent-id">{rule.agentId ? `ERC-8004 #${rule.agentId}` : "No ERC-8004 id"}</span>
                    {hits > 0 && <span className="obs-rule-hits">{fmt(hits)} hits</span>}
                  </div>
                  <div className="obs-rule-right">
                    <div className="obs-mode" role="group" aria-label={`${rule.name} access`}>
                      {(["free", "charge", "block"] as RuleMode[]).map((mode) => {
                        const current: RuleMode = rule.allowed ? "free" : rule.charge ? "charge" : "block";
                        return (
                          <button
                            key={mode}
                            type="button"
                            className={`obs-mode-btn is-${mode}${current === mode ? " is-active" : ""}`}
                            onClick={() => {
                              if (current === mode) return;
                              onToggle(rule.id, mode);
                              flash(`${rule.name}: ${mode}`);
                            }}
                          >
                            {mode === "free" ? "Free" : mode === "charge" ? "Charge" : "Block"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
      <details className="obs-robots-card">
        <summary>Dynamic robots.txt preview</summary>
        <pre className="obs-robots-code">{preview}</pre>
      </details>
    </>
  );
}

export function ServicesView({
  services,
  serviceId,
  onBack,
  view,
  onView,
  agentView,
  onAgentView,
  range,
  onRange,
  rules,
  onToggle,
  onAction,
  liveSummary,
  liveLoading,
  liveError,
  onVerify,
}: {
  services: Service[];
  serviceId: string;
  onBack: () => void;
  view: ServiceView;
  onView: (view: ServiceView) => void;
  agentView: AgentView;
  onAgentView: (view: AgentView) => void;
  range: Range;
  onRange: (range: Range) => void;
  rules: Rule[];
  onToggle: (id: string, mode: RuleMode) => void;
  onAction: (action: "allow_all" | "block_all_ai" | "charge_ai" | "reset") => void;
  liveSummary: Summary | null;
  liveLoading: boolean;
  liveError: string;
  onVerify: () => void;
}) {
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  const generated = useMemo(
    () => (service && service.id !== "blog" ? summarize(service.id, range) : null),
    [service, range],
  );
  const summary = service?.id === "blog" ? liveSummary : generated;
  if (!service) return null;
  const titles: Record<ServiceView, string> = {
    graphs: "Observability",
    insights: "Insights",
    agents: "Agents",
    pages: "Pages",
    events: "Events",
    permissions: "Permissions",
  };
  const nav: { id: ServiceView; label: string }[] = [
    { id: "graphs", label: "Graphs" },
    { id: "insights", label: "Insights" },
    { id: "agents", label: "Agents" },
    { id: "pages", label: "Pages" },
    { id: "events", label: "Events" },
    { id: "permissions", label: "Permissions" },
  ];

  const live = service.id === "blog";

  return (
    <div className={`obs${service.verified && summary ? " analytics-pop" : ""}`}>
      <aside className="obs-nav">
        <button type="button" className="deck-back" onClick={onBack}>Services</button>
        <p className="obs-brand">{service.name}</p>
        {service.verified && live && (
          <>
        <p className="obs-brand obs-brand-gap">Analytics</p>
        <div className="obs-nav-tabs">
          {nav.map((item) => (
            <button key={item.id} type="button" data-tab={item.id} className={view === item.id ? "is-active" : ""} onClick={() => onView(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {view === "agents" && (
          <div className="obs-nav-sub">
            {([
              ["all", "All Agents"],
              ["compare", "Good vs Bad"],
              ["good", "Good (Stopped)"],
              ["bad", "Bad (Bypassed)"],
              ["paid", "Paid (Returned)"],
            ] as [AgentView, string][]).map(([id, label]) => (
              <button key={id} type="button" className={agentView === id ? "is-active" : ""} onClick={() => onAgentView(id)}>
                {label}
              </button>
            ))}
          </div>
        )}
          </>
        )}
      </aside>
      <main className="obs-main">
        {!service.verified && (
          <div className="ledger-card">
            <h2>Verify service</h2>
            <p className="obs-lead">
              {service.name} uses the live dashboard at {live ? "dheeraj-work.netlify.app/analytics" : service.origin}. Verify it and that dashboard opens here.
            </p>
            <button type="button" className="obs-lock-submit" onClick={onVerify} disabled={liveLoading}>
              {liveLoading ? "Opening dashboard…" : "Verify service"}
            </button>
            {liveError && <p className="obs-lock-error">{liveError}</p>}
          </div>
        )}
        {live && service.verified && !summary && (
          <p className="obs-meta">{liveError || (liveLoading ? "Loading the live dashboard…" : "Waiting for analytics.")}</p>
        )}
        {service.verified && !live && (
          <div className="ledger-card">
            <h2>{service.name}</h2>
            <p className="obs-lead">This site is saved. Its observability deck opens once the site is connected the way dheeraj.blog is.</p>
          </div>
        )}
        {service.verified && live && summary && (
          <>
        <div className="obs-top">
          <div>
            <h1>{titles[view]}</h1>
          </div>
          <div className="obs-filters">
            {([
              ["day", "Day"],
              ["week", "Week"],
              ["month", "30 days"],
            ] as [Range, string][]).map(([id, label]) => (
              <button key={id} type="button" className={range === id ? "is-active" : ""} onClick={() => onRange(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {view === "graphs" && <Graphs summary={summary} />}
        {view === "insights" && <Insights summary={summary} rules={rules} />}
        {view === "agents" && <Agents summary={summary} rules={rules} view={agentView} onView={onAgentView} />}
        {view === "pages" && <Pages summary={summary} />}
        {view === "events" && <Events summary={summary} />}
        {view === "permissions" && (
          <Permissions rules={rules} summary={summary} origin={service.origin} onToggle={onToggle} onAction={onAction} />
        )}
          </>
        )}
      </main>
    </div>
  );
}
