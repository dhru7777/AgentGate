import { useState } from "react";
import { identitiesFor, serviceName } from "../summarize";

export function IdentityView() {
  const rows = identitiesFor("all");
  const [selected, setSelected] = useState(rows[0]?.name ?? "");
  const current = rows.find((row) => row.name === selected) ?? rows[0];

  return (
    <div className="ledger-page">
      <header className="obs-top">
        <div>
          <h1>Identity</h1>
          <p className="obs-meta">ERC-8004 records for the agents that show up in the ledger.</p>
        </div>
      </header>
      <div className="ledger-split">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Id</th>
                <th>Status</th>
                <th>Reputation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className={current?.name === row.name ? "is-selected" : ""} onClick={() => setSelected(row.name)}>
                  <td>{row.name}</td>
                  <td>{row.agentId ? `#${row.agentId}` : "—"}</td>
                  <td>{row.status}</td>
                  <td>{row.reputation ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {current && (
          <aside className="ledger-card">
            <h2>{current.name}</h2>
            <dl className="ledger-dl">
              <div><dt>Claimed as</dt><dd>{current.claimedAs}</dd></div>
              <div><dt>Services</dt><dd>{current.services.map(serviceName).join(", ") || "—"}</dd></div>
              <div><dt>Wallet</dt><dd className="mono">{current.wallet ?? "None"}</dd></div>
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
}
