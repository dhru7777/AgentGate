import { useMemo, useState } from "react";
import { explorerTxUrl, scan8004AgentUrl } from "../modules/chain/monad";
import { loadChainAgents } from "../modules/erc8004/directory";
import { AddAgentPanel } from "../screens/AddAgentPanel";
import { invoicesFor, serviceName } from "../summarize";
import type { Identity, IdentityStatus, Service } from "../types";

const COPY: Record<IdentityStatus, string> = {
  verified: "Registered on ERC-8004. This agent issues the invoices for the service.",
  claimed: "Named for this service. Register it on Monad to give it an id.",
  anonymous: "No registered id",
};

function draftAgent(serviceId: string, label: string): Identity {
  return {
    agentId: null,
    name: `${label} invoice agent`,
    claimedAs: "Your agent",
    wallet: null,
    owner: null,
    status: "claimed",
    reputation: null,
    services: [serviceId],
  };
}

export function IdentityView({ services }: { services: Service[] }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "blog");
  const [selected, setSelected] = useState("");
  const [chainAgents, setChainAgents] = useState<Identity[]>(() => loadChainAgents());
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  const activeId = service?.id ?? serviceId;
  const activeName = service?.name ?? serviceName(activeId);
  const registered = chainAgents.filter((agent) => agent.services.includes(activeId));
  const rows = registered.length ? registered : [draftAgent(activeId, activeName)];
  const current = rows.find((row) => row.name === selected) ?? rows[0];
  const billedTo = useMemo(() => {
    const names = invoicesFor(activeId).map((invoice) => invoice.from);
    return [...new Set(names)];
  }, [activeId]);

  return (
    <div className="ledger-page">
      <header className="obs-top">
        <div>
          <h1>Identity</h1>
          <p className="obs-meta">
            Your agent on ERC-8004. It produces the invoices for one service. The company bots it bills — Claude, GPTBot, and the rest — stay on Invoices as who was charged.
          </p>
        </div>
        <label className="ledger-select">
          Service
          <select value={activeId} onChange={(event) => { setServiceId(event.target.value); setSelected(""); }}>
            {services.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
      </header>
      <AddAgentPanel
        key={activeId}
        serviceId={activeId}
        serviceName={activeName}
        onChange={(agents) => { setChainAgents(agents); if (agents[0]) setSelected(agents[0].name); }}
      />
      <div className="ledger-split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Your agent</th>
                <th>Service</th>
                <th>Id</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.name}
                  className={current?.name === row.name ? "is-selected" : ""}
                  onClick={() => setSelected(row.name)}
                >
                  <td>{row.name}</td>
                  <td>{row.services.map(serviceName).join(", ")}</td>
                  <td>{row.agentId ? `#${row.agentId}` : "—"}</td>
                  <td><span className={`status status-${row.status}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {current && (
          <aside className="ledger-card">
            <h2>{current.name}</h2>
            <p className="obs-lead">{COPY[current.status]}</p>
            <dl className="ledger-dl">
              <div><dt>Role</dt><dd>Writes invoices for {activeName}</dd></div>
              <div><dt>Bills</dt><dd>{billedTo.length ? billedTo.join(", ") : "No paid invoices for this service yet"}</dd></div>
              <div><dt>ERC-8004</dt><dd>{current.agentId ? `#${current.agentId}` : "Unregistered"}</dd></div>
              <div><dt>Wallet</dt><dd className="mono">{current.wallet ?? "Connect a wallet to register"}</dd></div>
              <div><dt>Owner</dt><dd className="mono">{current.owner ?? "Set when you register"}</dd></div>
              <div><dt>Chain</dt><dd>Monad testnet · 10143</dd></div>
              {current.agentId !== null && (
                <div><dt>Registry</dt><dd><a href={scan8004AgentUrl(current.agentId)} target="_blank" rel="noreferrer">8004scan #{current.agentId}</a></dd></div>
              )}
              {current.registerTxHash && (
                <div><dt>Registration</dt><dd><a href={explorerTxUrl(current.registerTxHash)} target="_blank" rel="noreferrer">{current.registerTxHash.slice(0, 10)}…</a></dd></div>
              )}
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
}
