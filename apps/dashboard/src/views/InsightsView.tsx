import { BarChart, DoughnutChart, LineChart, StackedBarChart, TimelineChart, type TimelinePoint } from "../components/Charts";
import type { Rule, Summary, Visit } from "../types";

const AI_SOURCES = ["ChatGPT", "Claude", "Perplexity", "Gemini", "Copilot", "You.com", "Phind"];
const SESSION_GAP_MS = 30 * 60 * 1000;

const PURPOSE_LABEL: Record<string, string> = {
  training: "Training",
  search: "Search index",
  user: "Fetching for a person",
  unidentified: "Unidentified",
};

type Step = "robots" | "llms" | "sitemap" | "home" | "post" | "other";

const STEPS: { id: Step; label: string; color: string }[] = [
  { id: "robots", label: "robots.txt", color: "#7a4fc4" },
  { id: "llms", label: "llms.txt", color: "#007acc" },
  { id: "sitemap", label: "sitemap.xml", color: "#2a9d8f" },
  { id: "home", label: "Homepage", color: "#9aa5b1" },
  { id: "post", label: "Blog post", color: "#c45c26" },
  { id: "other", label: "Other page", color: "#d9b44a" },
];

function stepOf(path: string): Step {
  const p = path.toLowerCase();
  if (p === "/robots.txt") return "robots";
  if (p === "/llms.txt") return "llms";
  if (p.startsWith("/sitemap")) return "sitemap";
  if (p === "/" || p === "/index.html") return "home";
  if (/^\/\d{4}\/\d{2}\/\d{2}\//.test(p)) return "post";
  return "other";
}

/** Older rows have no purpose, so it is inferred from the agent name the same way the gate does. */
function purposeOf(row: Visit): string {
  if (row.purpose) return row.purpose;
  const text = `${row.agent} ${row.ua ?? ""}`;
  if (/gptbot|claudebot|anthropic-ai|google-extended|ccbot|bytespider|meta-externalagent|applebot-extended|cohere|diffbot|amazonbot/i.test(text)) return "training";
  if (/oai-searchbot|perplexitybot|googlebot|bingbot|duckduckbot|youbot|applebot|search/i.test(text)) return "search";
  if (/chatgpt-user|claude-user|claude-web|perplexity-user|cursor/i.test(text)) return "user";
  return "unidentified";
}

function ruleFor(agent: string, rules: Rule[]): Rule | null {
  const name = agent.toLowerCase();
  for (const rule of rules) {
    if (rule.name.toLowerCase() === name) return rule;
    const patterns = rule.patterns.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (patterns.some((p) => name.includes(p))) return rule;
  }
  return null;
}

const ANONYMOUS = /automated-browser|headless|curl|^go$|unknown|python|node|wget|^browser$/i;
const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");
const clock = (ts: string) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type Session = { agent: string; rows: Visit[]; purpose: string };

/** One client's visit: its requests in time order, split when it goes quiet for 30 minutes. */
function sessionsOf(rows: Visit[]): Session[] {
  const groups = new Map<string, Visit[]>();
  for (const row of rows) {
    const key = row.vid ? `${row.vid}|${row.agent}` : `${row.agent}|${row.city}|${row.country}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const out: Session[] = [];
  for (const list of groups.values()) {
    const ordered = [...list].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    let current: Visit[] = [];
    for (const row of ordered) {
      const last = current[current.length - 1];
      if (last && Date.parse(row.ts) - Date.parse(last.ts) > SESSION_GAP_MS) {
        out.push({ agent: current[0].agent, rows: current, purpose: purposeOf(current[0]) });
        current = [];
      }
      current.push(row);
    }
    if (current.length) out.push({ agent: current[0].agent, rows: current, purpose: purposeOf(current[0]) });
  }
  return out;
}

function Empty({ children }: { children: string }) {
  return <p className="obs-empty">{children}</p>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="obs-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Insights({ summary, rules }: { summary: Summary; rules: Rule[] }) {
  const rows = summary.recent;
  const humans = rows.filter((row) => row.kind === "human");
  const bots = rows.filter((row) => row.kind !== "human" && row.kind !== "preview_bot");
  const gateUpdated = rows.some((row) => row.vid !== undefined || row.purpose !== undefined || row.robots !== undefined || row.ref !== undefined);
  const robotsLogged = rows.some((row) => stepOf(row.path) === "robots");
  const other = Math.max(0, summary.totalRequests - summary.humanRequests - summary.aiAgentRequests);

  const bySource = new Map<string, number>();
  for (const row of humans) if (row.ref && AI_SOURCES.includes(row.ref)) bySource.set(row.ref, (bySource.get(row.ref) ?? 0) + 1);
  const fromAi = [...bySource.values()].reduce((a, b) => a + b, 0);

  const purposes = new Map<string, number>();
  for (const row of bots) purposes.set(purposeOf(row), (purposes.get(purposeOf(row)) ?? 0) + 1);

  const r402 = rows.filter((row) => row.status === 402);
  const who = new Map<string, number>();
  for (const row of r402) {
    const label = row.agent === "browser" ? "Browsers" : ANONYMOUS.test(row.agent) ? "Unidentified automation" : "Named AI bots";
    who.set(label, (who.get(label) ?? 0) + 1);
  }

  // Journeys
  const sessions = sessionsOf(bots).filter((session) => session.rows.length > 0);
  const readers = (step: Step) => new Set(bots.filter((row) => stepOf(row.path) === step).map((row) => row.agent));
  const agentsByVolume = [...bots.reduce((map, row) => map.set(row.agent, (map.get(row.agent) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .map(([agent]) => agent);

  const discoveryAgents = agentsByVolume.filter((agent) => bots.some((row) => row.agent === agent && ["robots", "llms", "sitemap"].includes(stepOf(row.path)))).slice(0, 12);
  const discoverySeries = (["robots", "llms", "sitemap"] as Step[]).map((step) => ({
    label: STEPS.find((item) => item.id === step)!.label,
    color: STEPS.find((item) => item.id === step)!.color,
    data: discoveryAgents.map((agent) => bots.filter((row) => row.agent === agent && stepOf(row.path) === step).length),
  }));

  const firstMove = new Map<Step, number>();
  for (const session of sessions) {
    const first = stepOf(session.rows[0].path);
    firstMove.set(first, (firstMove.get(first) ?? 0) + 1);
  }
  const positions = [0, 1, 2, 3, 4];
  const orderSeries = STEPS.map((step) => ({
    label: step.label,
    color: step.color,
    data: positions.map((index) => sessions.filter((session) => session.rows[index] && stepOf(session.rows[index].path) === step.id).length),
  })).filter((series) => series.data.some((n) => n > 0));

  const timelineAgents = agentsByVolume.slice(0, 14).reverse();
  const timeline: TimelinePoint[] = bots
    .filter((row) => timelineAgents.includes(row.agent))
    .map((row) => ({
      x: Date.parse(row.ts),
      y: timelineAgents.indexOf(row.agent),
      group: stepOf(row.path),
      blocked: row.status === 402,
      tip: [`${row.agent} · ${PURPOSE_LABEL[purposeOf(row)] ?? purposeOf(row)}`, `${clock(row.ts)} · ${row.path}`, row.status === 402 ? "Blocked with 402" : `Served ${row.status}`],
    }));

  // llms.txt and robots.txt behaviour, per agent
  const behaviour = agentsByVolume.map((agent) => {
    const mine = sessions.filter((session) => session.agent === agent);
    const posts = mine.flatMap((session) => session.rows).filter((row) => stepOf(row.path) === "post");
    const readLlms = mine.filter((session) => session.rows.some((row) => stepOf(row.path) === "llms"));
    const llmsThenPosts = readLlms.filter((session) => session.rows.some((row) => stepOf(row.path) === "post")).length;
    const llmsOnly = readLlms.length - llmsThenPosts;
    const skippedLlms = mine.filter((session) => !session.rows.some((row) => stepOf(row.path) === "llms") && session.rows.some((row) => stepOf(row.path) === "post")).length;
    const rule = ruleFor(agent, rules);
    const readRobots = mine.some((session) => session.rows.some((row) => stepOf(row.path) === "robots"));
    const blockedByRobots = rule ? !rule.allowed && !rule.charge : false;
    const ignoredRobots = blockedByRobots && posts.length > 0;
    return { agent, posts: posts.length, served: posts.filter((row) => row.status === 200).length, llmsThenPosts, llmsOnly, skippedLlms, readRobots, blockedByRobots, ignoredRobots };
  });
  const llmsRows = behaviour.filter((row) => row.llmsThenPosts + row.llmsOnly + row.skippedLlms > 0).slice(0, 12);
  const violators = behaviour.filter((row) => row.ignoredRobots);

  return (
    <>
      <div className="obs-kpis">
        <Kpi label="Humans" value={fmt(summary.humanRequests)} />
        <Kpi label="AI and bots" value={fmt(summary.aiAgentRequests)} />
        <Kpi label="Humans from AI tools" value={gateUpdated ? fmt(fromAi) : "–"} />
        <Kpi label="Read robots.txt" value={robotsLogged ? fmt(readers("robots").size) : "–"} />
        <Kpi label="Read llms.txt" value={fmt(readers("llms").size)} />
        <Kpi label="Read sitemap.xml" value={fmt(readers("sitemap").size)} />
      </div>

      <div className="obs-split">
        <div>
          <h2>Humans vs AI</h2>
          <div className="obs-chart obs-chart-sm">
            <DoughnutChart labels={["Humans", "AI and bots", "Other"]} values={[summary.humanRequests, summary.aiAgentRequests, other]} colors={["#007acc", "#c45c26", "#aaa"]} />
          </div>
          <p className="obs-meta">{pct(summary.humanRequests, summary.totalRequests)} human</p>
        </div>
        <div>
          <h2>Humans using AI tools</h2>
          {!gateUpdated ? (
            <Empty>Collecting</Empty>
          ) : fromAi === 0 ? (
            <Empty>None yet</Empty>
          ) : (
            <div className="obs-chart obs-chart-sm">
              <BarChart labels={[...bySource.keys()]} values={[...bySource.values()]} />
            </div>
          )}
        </div>
      </div>

      <h2>Humans and bots over time</h2>
      <div className="obs-chart">
        <LineChart
          labels={summary.series.map((row) => row.t)}
          datasets={[
            { label: "Humans", data: summary.series.map((row) => row.human), borderColor: "#007acc" },
            { label: "AI and bots", data: summary.series.map((row) => row.ai), borderColor: "#c45c26" },
          ]}
        />
      </div>

      <div className="obs-split">
        <div>
          <h2>Why bots visit</h2>
          {bots.length === 0 ? (
            <Empty>No bots</Empty>
          ) : (
            <div className="obs-chart obs-chart-sm">
              <DoughnutChart
                labels={[...purposes.keys()].map((key) => PURPOSE_LABEL[key] ?? key)}
                values={[...purposes.values()]}
                colors={["#c45c26", "#007acc", "#9bbc5a", "#888"]}
              />
            </div>
          )}
        </div>
        <div>
          <h2>Who got the 402</h2>
          {r402.length === 0 ? (
            <Empty>None</Empty>
          ) : (
            <div className="obs-chart obs-chart-sm">
              <BarChart labels={[...who.keys()]} values={[...who.values()]} />
            </div>
          )}
        </div>
      </div>

      <h2>Who reads robots.txt, llms.txt and sitemap.xml</h2>
      {discoveryAgents.length === 0 ? (
        <Empty>No reads yet</Empty>
      ) : (
        <div className="obs-chart">
          <StackedBarChart labels={discoveryAgents} series={discoverySeries} />
        </div>
      )}

      <h2>What they ask for first</h2>
      {sessions.length === 0 ? (
        <Empty>No bot visits</Empty>
      ) : (
        <>
          <div className="obs-kpis">
            {STEPS.filter((step) => firstMove.has(step.id)).map((step) => (
              <Kpi key={step.id} label={`First: ${step.label}`} value={`${fmt(firstMove.get(step.id) ?? 0)} of ${fmt(sessions.length)}`} />
            ))}
          </div>
          <div className="obs-chart">
            <StackedBarChart labels={positions.map((index) => `Step ${index + 1}`)} series={orderSeries} />
          </div>
        </>
      )}

      <h2>Every bot request, in time order</h2>
      {timeline.length === 0 ? (
        <Empty>No bot requests</Empty>
      ) : (
        <div className="obs-chart obs-chart-tall">
          <TimelineChart agents={timelineAgents} points={timeline} groups={STEPS.map((step) => ({ id: step.id, label: step.label, color: step.color }))} />
        </div>
      )}

      <h2>Read llms.txt, then took the content?</h2>
      {llmsRows.length === 0 ? (
        <Empty>No bot visits</Empty>
      ) : (
        <div className="obs-chart">
          <StackedBarChart
            labels={llmsRows.map((row) => row.agent)}
            series={[
              { label: "Read llms.txt, then asked for posts", data: llmsRows.map((row) => row.llmsThenPosts), color: "#c45c26" },
              { label: "Read llms.txt, left", data: llmsRows.map((row) => row.llmsOnly), color: "#9bbc5a" },
              { label: "Skipped llms.txt, asked for posts", data: llmsRows.map((row) => row.skippedLlms), color: "#444" },
            ]}
          />
        </div>
      )}

      <h2>Blocked in robots.txt, took the content anyway</h2>
      {!robotsLogged ? (
        <Empty>Collecting</Empty>
      ) : violators.length === 0 ? (
        <Empty>None</Empty>
      ) : (
        <table>
          <thead>
            <tr><th>Agent</th><th>Read robots.txt</th><th>Post requests</th><th>Served</th><th>First seen</th></tr>
          </thead>
          <tbody>
            {violators.map((row) => {
              const first = bots.filter((r) => r.agent === row.agent && stepOf(r.path) === "post").sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))[0];
              return (
                <tr key={row.agent}>
                  <td>{row.agent}</td>
                  <td>{row.readRobots ? "Yes" : "No"}</td>
                  <td>{fmt(row.posts)}</td>
                  <td>{fmt(row.served)}</td>
                  <td>{first ? clock(first.ts) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
