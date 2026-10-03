import { useState } from "react";
import { AgentPortrait } from "../components/AgentPortrait";
import { loadChainAgents } from "../modules/erc8004/directory";
import { knownInvoiceIdentity } from "../modules/erc8004/knownAgent";
import { AddAgentPanel } from "../screens/AddAgentPanel";
import { WalletProfile } from "../screens/WalletProfile";
import { serviceName } from "../summarize";
import type { Identity, Service } from "../types";

export function IdentityView({ services }: { services: Service[] }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "blog");
  const [selected, setSelected] = useState("");
  const [chainAgents, setChainAgents] = useState<Identity[]>(() => loadChainAgents());
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  const activeId = service?.id ?? serviceId;
  const activeName = service?.name ?? serviceName(activeId);
  const known = knownInvoiceIdentity(activeId);
  const extras = chainAgents.filter((agent) => agent.services.includes(activeId) && agent.agentId !== known.agentId);
  const rows = [known, ...extras];
  const current = rows.find((row) => row.name === selected) ?? rows[0];

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
          <div className="identity-side">
            <AgentPortrait name={current.name} agentId={current.agentId} />
            <WalletProfile
              name={current.name}
              address={current.wallet ?? ""}
              agentId={current.agentId}
              owner={current.owner}
              transactions={0}
            />
          </div>
        )}
      </div>
    </div>
  );
}
