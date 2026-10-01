import { useMemo, useState } from "react";
import { BarChart, DoughnutChart, LineChart } from "../components/Charts";
import { RequestMap } from "../components/RequestMap";
import { RULE_GROUPS } from "../data";
import { hitsFor, robotsPreview, shortPath, summarize } from "../summarize";
import type { AgentView, Range, Rule, Service, ServiceView, Summary } from "../types";

const fmt = (value: number) => value.toLocaleString();
const money = (value: number) => `$${value.toFixed(2)}`;

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

function Graphs({ summary }: { summary: Summary }) {
  const labels = summary.series.map((row) => row.t);
  return (
    <>
      <Kpis summary={summary} />
      <RequestMap places={summary.places} total={summary.recent.length} />
      <h2>Traffic</h2>
      <div className="obs-chart">
        <LineChart
          labels={labels}
          datasets={[
            { label: "Requests", data: summary.series.map((row) => row.requests), borderColor: "#333" },
            { label: "Human", data: summary.series.map((row) => row.human), borderColor: "#007acc" },
            { label: "AI", data: summary.series.map((row) => row.ai), borderColor: "#c45c26" },
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
            { label: "402 blocked", data: summary.series.map((row) => row.blocked), borderColor: "#c45c26" },
            { label: "Paid", data: summary.series.map((row) => row.paid), borderColor: "#9bbc5a" },
          ]}
        />
      </div>
    </>
  );
}

function Agents({ summary, view, onView }: { summary: Summary; view: AgentView; onView: (view: AgentView) => void }) {
  const tabs: { id: AgentView; label: string }[] = [
    { id: "all", label: "All Agents" },
    { id: "compare", label: "Good vs Bad Agents" },
    { id: "good", label: `Good Agents (${fmt(summary.goodVisitors)})` },
    { id: "bad", label: `Bad Agents (${fmt(summary.badVisitors)})` },
    { id: "paid", label: `Paid Agents (${fmt(summary.paidVisitors)})` },
  ];
  return (
    <>
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
              colors={["#10b981", "#ef4444", "#007acc"]}
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

function Events({ summary }: { summary: Summary }) {
  const [kind, setKind] = useState("all");
  const [agent, setAgent] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const kinds = [...new Set(summary.recent.map((event) => event.kind))].sort();
  const agents = [...new Set(summary.recent.map((event) => event.agent))].sort();
  const statuses = [...new Set(summary.recent.map((event) => String(event.status)))].sort();
  const q = query.toLowerCase().trim();
  const filtered = summary.recent.filter((event) => {
    if (kind !== "all" && event.kind !== kind) return false;
    if (agent !== "all" && event.agent !== agent) return false;
    if (status !== "all" && String(event.status) !== status) return false;
    if (!q) return true;
    const hay = `${event.path} ${event.kind} ${event.agent} ${event.status} ${event.city} ${event.country}`.toLowerCase();
    return hay.includes(q);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);

  return (
    <>
      <p className="obs-lead">{fmt(filtered.length)} of {fmt(summary.recent.length)} requests.</p>
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
  onToggle: (id: string, allowed: boolean) => void;
  onAction: (action: "allow_all" | "block_all_ai" | "reset") => void;
}) {
  const [toast, setToast] = useState("");
  const preview = useMemo(() => robotsPreview(rules, origin), [rules, origin]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <>
      <p className="obs-lead">
        On means the agent reads for free. Off means HTTP 402. Each assistant is keyed by its ERC-8004 id when one is registered. A name with no id stays claimed, never verified.
      </p>
      <div className="obs-perm-actions">
        <button type="button" className="obs-btn-sm" onClick={() => { onAction("allow_all"); flash("All allowed"); }}>Allow all</button>
        <button type="button" className="obs-btn-sm" onClick={() => { onAction("block_all_ai"); flash("AI gated"); }}>Gate AI</button>
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
                    <span className={`obs-rule-status ${rule.allowed ? "is-allowed" : "is-gated"}`}>{rule.allowed ? "On" : "Off"}</span>
                    <label className="obs-switch">
                      <input
                        type="checkbox"
                        checked={rule.allowed}
                        onChange={(event) => {
                          onToggle(rule.id, event.target.checked);
                          flash(`${rule.name}: ${event.target.checked ? "free" : "gated"}`);
                        }}
                      />
                      <span className="obs-slider" />
                    </label>
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
  onService,
  view,
  onView,
  agentView,
  onAgentView,
  range,
  onRange,
  rules,
  onToggle,
  onAction,
}: {
  services: Service[];
  serviceId: string;
  onService: (id: string) => void;
  view: ServiceView;
  onView: (view: ServiceView) => void;
  agentView: AgentView;
  onAgentView: (view: AgentView) => void;
  range: Range;
  onRange: (range: Range) => void;
  rules: Rule[];
  onToggle: (id: string, allowed: boolean) => void;
  onAction: (action: "allow_all" | "block_all_ai" | "reset") => void;
}) {
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  const summary = useMemo(() => summarize(service?.id ?? "blog", range), [service, range]);
  if (!service) return null;
  const titles: Record<ServiceView, string> = {
    graphs: "Observability",
    agents: "Agents",
    pages: "Pages",
    events: "Events",
    permissions: "Permissions",
  };
  const nav: { id: ServiceView; label: string }[] = [
    { id: "graphs", label: "Graphs" },
    { id: "agents", label: "Agents" },
    { id: "pages", label: "Pages" },
    { id: "events", label: "Events" },
    { id: "permissions", label: "Permissions" },
  ];

  return (
    <div className="obs">
      <aside className="obs-nav">
        <p className="obs-brand">Services</p>
        <div className="obs-nav-tabs">
          {services.map((item) => (
            <button key={item.id} type="button" className={item.id === service.id ? "is-active" : ""} onClick={() => onService(item.id)}>
              {item.name}
            </button>
          ))}
        </div>
        <p className="obs-brand obs-brand-gap">Analytics</p>
        <div className="obs-nav-tabs">
          {nav.map((item) => (
            <button key={item.id} type="button" className={view === item.id ? "is-active" : ""} onClick={() => onView(item.id)}>
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
      </aside>
      <main className="obs-main">
        <div className="obs-top">
          <div>
            <h1>{titles[view]}</h1>
            <p className="obs-meta">{service.origin}</p>
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
        {view === "agents" && <Agents summary={summary} view={agentView} onView={onAgentView} />}
        {view === "pages" && <Pages summary={summary} />}
        {view === "events" && <Events summary={summary} />}
        {view === "permissions" && (
          <Permissions rules={rules} summary={summary} origin={service.origin} onToggle={onToggle} onAction={onAction} />
        )}
      </main>
    </div>
  );
}
