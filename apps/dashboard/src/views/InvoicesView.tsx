import { useEffect, useMemo, useState } from "react";
import { fetchBlogAccessLog, fetchBlogRules, type BlogAccessLog } from "../modules/services/blogAnalytics";
import {
  ACCESS_RATE_USDC,
  ISSUER,
  ROBOTS_URL,
  TARIFF_URL,
  allowedCompanyNames,
  buildCompanyInvoices,
  formatTimeSpent,
  formatUsdc,
  formatWhen,
  type CompanyInvoice,
  type InvoicePeriod,
} from "../modules/invoices/build";
import { invoicePdf } from "../modules/invoices/pdf";
import type { Range, Rule } from "../types";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function downloadInvoice(invoice: CompanyInvoice) {
  const blob = invoicePdf(invoice);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${invoice.id}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

function InvoicePaper({ invoice }: { invoice: CompanyInvoice }) {
  return (
    <article className="invoice-paper" aria-label={`Invoice ${invoice.id}`}>
      <header className="invoice-paper-top">
        <div>
          <h2>Invoice</h2>
          <p className="mono">{invoice.id}</p>
        </div>
        <span className={invoice.status === "pending" ? "invoice-badge is-pending" : "invoice-badge is-clear"}>
          {invoice.status === "pending" ? "Pending" : "Nothing due"}
        </span>
      </header>
      <p className="invoice-fine">Period: {invoice.periodLabel}</p>
      <div className="invoice-parties">
        <div>
          <span>From</span>
          <strong>{ISSUER.name}</strong>
          <p>ERC-8004 #{ISSUER.agentId} on Monad testnet</p>
          <p><a href={ISSUER.verifyUrl}>Verified on 8004scan</a></p>
          <p className="mono">{ISSUER.wallet}</p>
          <p>For {ISSUER.site}</p>
        </div>
        <div>
          <span>To</span>
          <strong>{invoice.company}</strong>
          <p>{invoice.category}</p>
        </div>
      </div>
      <h3>Reason</h3>
      <p>{invoice.reason}</p>
      <p className="invoice-fine">
        <a href={ROBOTS_URL}>robots.txt</a>
      </p>
      <pre className="invoice-robots">{invoice.robotsTxt}</pre>
      <h3>Billing summary</h3>
      <p className="invoice-fine">
        {ACCESS_RATE_USDC.toFixed(2)} USDC per page delivered with HTTP 200 while disallowed.{" "}
        <a href={TARIFF_URL}>Published tariff</a>
      </p>
      {invoice.lines.length === 0 ? (
        <p>No delivered pages in this period.</p>
      ) : (
        <ul className="invoice-lines-doc">
          {invoice.lines.map((line) => (
            <li key={line.id}>
              <div>
                <strong>{formatWhen(line.ts)}</strong>
                <span>{formatUsdc(line.amountUsdc)}</span>
              </div>
              <p>{line.agent} · HTTP {line.status}</p>
              <p className="invoice-path">{line.path}</p>
              <p className="invoice-reason">Time spent: {formatTimeSpent(line.durationMs)}</p>
            </li>
          ))}
        </ul>
      )}
      {invoice.stoppedCount > 0 && (
        <p className="invoice-fine">
          {invoice.stoppedCount} {invoice.stoppedCount === 1 ? "request was" : "requests were"} stopped with HTTP 402. Not charged.
        </p>
      )}
      <div className="invoice-total">
        <span>Amount due</span>
        <strong>{formatUsdc(invoice.amountUsdc)}</strong>
      </div>
    </article>
  );
}

export function InvoicesView() {
  const [period, setPeriod] = useState<InvoicePeriod>("3d");
  const [ruleId, setRuleId] = useState("anthropic");
  const [log, setLog] = useState<BlogAccessLog | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError("");
    const queryRange: Range = period === "3d" ? "week" : period;
    Promise.all([fetchBlogAccessLog(queryRange), fetchBlogRules()])
      .then(([nextLog, nextRules]) => {
        if (cancel) return;
        setLog(nextLog);
        setRules(nextRules);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "Could not load the access log.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [period]);

  const windowed = useMemo(() => {
    if (!log) return null;
    if (period !== "3d") {
      return {
        hits: log.hits,
        start: log.since,
        end: log.updatedAt,
        total: log.totalRequests,
        revenue: log.revenueUsdc,
      };
    }
    const endMs = Date.now();
    const startMs = endMs - THREE_DAYS_MS;
    const hits = log.hits.filter((hit) => {
      const at = Date.parse(hit.ts);
      return Number.isFinite(at) && at >= startMs && at <= endMs;
    });
    return {
      hits,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      total: hits.length,
      revenue: 0,
    };
  }, [log, period]);

  const invoices = useMemo(() => {
    if (!windowed) return [];
    return buildCompanyInvoices({
      rules,
      hits: windowed.hits,
      periodStart: windowed.start,
      periodEnd: windowed.end,
      range: period,
      totalRequests: windowed.total,
      revenueUsdc: windowed.revenue,
      logNote: period === "3d" ? "Covers the last 3 days. Only HTTP 200 deliveries are charged." : undefined,
    });
  }, [windowed, rules, period]);

  const selected = invoices.find((invoice) => invoice.ruleId === ruleId) ?? invoices[0] ?? null;
  const pending = invoices.filter((invoice) => invoice.status === "pending");
  const totalPending = Math.round(pending.reduce((sum, invoice) => sum + invoice.amountUsdc, 0) * 100) / 100;
  const allowed = allowedCompanyNames(rules);

  return (
    <div className="ledger-page invoice-page">
      <header className="obs-top">
        <div>
          <h1>Invoices</h1>
          <p className="obs-meta">
            Bills from {ISSUER.name} #{ISSUER.agentId} to companies whose agents are disallowed in robots.txt.
            HTTP 200 means the page was delivered and the invoice is pending.
            HTTP 402 means the paywall stopped the fetch, so it is not charged.
            {allowed.length > 0 ? ` Allowed, and not invoiced: ${allowed.join(", ")}.` : ""}
          </p>
        </div>
      </header>

      {error && <p className="obs-lock-error">{error}</p>}
      {loading && <p className="obs-meta">Loading the access log…</p>}

      {!loading && !error && (
        <div className="invoice-split">
          <div>
            <div className="obs-event-filters">
              <label>
                Period
                <select value={period} onChange={(event) => setPeriod(event.target.value as InvoicePeriod)}>
                  <option value="3d">Last 3 days</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
              <label>
                To
                <select value={selected?.ruleId ?? ""} onChange={(event) => setRuleId(event.target.value)}>
                  {invoices.map((invoice) => (
                    <option key={invoice.ruleId} value={invoice.ruleId}>
                      {invoice.company}{invoice.amountUsdc > 0 ? ` — ${formatUsdc(invoice.amountUsdc)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="obs-btn-sm is-primary"
                disabled={!selected}
                onClick={() => { if (selected) downloadInvoice(selected); }}
              >
                Download PDF
              </button>
            </div>
            {selected && (
              <>
                <p className="obs-lead">
                  {selected.lines.length === 0
                    ? `${selected.company} has no delivered pages in this log.`
                    : `${selected.lines.length} delivered ${selected.lines.length === 1 ? "page" : "pages"} from ${selected.company}. Pending ${formatUsdc(selected.amountUsdc)}.`}
                  {selected.stoppedCount > 0 ? ` ${selected.stoppedCount} stopped at HTTP 402.` : ""}
                </p>
                {selected.lines.length > 0 && (
                  <div className="table-wrap invoice-activity">
                    <table>
                      <thead>
                        <tr>
                          <th>Date and time</th>
                          <th>Access</th>
                          <th>Time spent</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.lines.map((line) => (
                          <tr key={line.id}>
                            <td>{formatWhen(line.ts)}</td>
                            <td>
                              {line.agent} · HTTP {line.status}
                              <span className="invoice-path">{line.path}</span>
                            </td>
                            <td>{formatTimeSpent(line.durationMs)}</td>
                            <td>{formatUsdc(line.amountUsdc)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="invoice-side">
            {selected && <InvoicePaper invoice={selected} />}
            <section className="invoice-balances">
              <h2>Pending</h2>
              {pending.length === 0 ? (
                <p className="obs-meta">No pending invoices. A disallowed agent has to receive HTTP 200 before a balance appears.</p>
              ) : (
                <ul>
                  {pending.map((invoice) => (
                    <li key={invoice.id}>
                      <button type="button" className="deck-link" onClick={() => setRuleId(invoice.ruleId)}>
                        {invoice.company}
                      </button>
                      <span>{formatUsdc(invoice.amountUsdc)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="invoice-total">
                <span>Total pending</span>
                <strong>{formatUsdc(totalPending)}</strong>
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
