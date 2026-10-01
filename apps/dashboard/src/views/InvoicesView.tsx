import { useMemo, useState } from "react";
import { SERVICES } from "../data";
import { invoicesFor, serviceName, shortPath } from "../summarize";

export function InvoicesView() {
  const [serviceId, setServiceId] = useState<string | "all">("all");
  const invoices = useMemo(() => invoicesFor(serviceId), [serviceId]);
  const total = invoices.reduce((sum, invoice) => sum + invoice.amountUsdc, 0);

  return (
    <div className="ledger-page">
      <header className="obs-top">
        <div>
          <h1>Invoices</h1>
          <p className="obs-meta">USDC received at each service’s payout address. Paid rows are the ones Envio indexes from Monad.</p>
        </div>
        <label className="ledger-select">
          Service
          <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            <option value="all">All services</option>
            {SERVICES.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </label>
      </header>
      <div className="obs-kpis">
        <div className="obs-kpi"><span>Payments</span><strong>{invoices.length.toLocaleString()}</strong></div>
        <div className="obs-kpi"><span>Received</span><strong>${total.toFixed(2)}</strong></div>
        <div className="obs-kpi"><span>Asset</span><strong>USDC</strong></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>From</th>
              <th>Service</th>
              <th>Page</th>
              <th>USDC</th>
              <th>Transaction</th>
              <th>Index</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{new Date(invoice.ts).toLocaleString()}</td>
                <td>{invoice.from}{invoice.agentId ? ` #${invoice.agentId}` : ""}</td>
                <td>{serviceName(invoice.serviceId)}</td>
                <td title={invoice.path}>{shortPath(invoice.path)}</td>
                <td>${invoice.amountUsdc.toFixed(2)}</td>
                <td className="mono">{invoice.txHash.slice(0, 10)}…{invoice.txHash.slice(-4)}</td>
                <td>{invoice.indexed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
