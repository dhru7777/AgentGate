import { useEffect, useState } from "react";
import { explorerAddressUrl, MONAD_RECEIVE_ADDRESS, MONAD_TESTNET_CAIP2 } from "../modules/chain/monad";
import { readMonadAccount, type MonadTx } from "../modules/wallet/etherscan";
import { shortAddress } from "../modules/wallet/format";
import { STRIPE_DEMO } from "../modules/wallet/stripeDemo";
import { ReceiveQr } from "./ReceiveQr";

type AccountTab = "monad" | "stripe";

export function WalletAccounts() {
  const address = MONAD_RECEIVE_ADDRESS;
  const [tab, setTab] = useState<AccountTab>("monad");
  const [mon, setMon] = useState("…");
  const [usdc, setUsdc] = useState("…");
  const [transactions, setTransactions] = useState<MonadTx[]>([]);
  const [error, setError] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    readMonadAccount(address)
      .then((account) => {
        if (cancel) return;
        setMon(account.mon);
        setUsdc(account.usdc);
        setTransactions(account.transactions);
      })
      .catch((reason: unknown) => {
        if (cancel) return;
        setError(reason instanceof Error ? reason.message : "Could not read the Monad account");
      });
    return () => {
      cancel = true;
    };
  }, [address]);

  return (
    <section className={`wallet-pop${tab === "stripe" ? " is-stripe" : ""}`}>
      <div className="wallet-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "monad"} className={tab === "monad" ? "is-active" : ""} onClick={() => setTab("monad")}>
          Monad
        </button>
        <button type="button" role="tab" aria-selected={tab === "stripe"} className={tab === "stripe" ? "is-active" : ""} onClick={() => setTab("stripe")}>
          Stripe
        </button>
      </div>
      {tab === "monad" && (
        <>
          <p className="wallet-pop-kicker">Monad testnet · {MONAD_TESTNET_CAIP2}</p>
          <div className="monad-card">
            <div className="monad-card-top">
              <span className="monad-word">monad</span>
              <a className="dynamic-mark" href="https://www.dynamic.xyz" target="_blank" rel="noreferrer">Powered by Dynamic</a>
            </div>
            <span className="rain-chip" />
            <span className="monad-balance">{mon} MON</span>
            <span className="rain-meta">
              <a href={explorerAddressUrl(address)} target="_blank" rel="noreferrer">{shortAddress(address)}</a>
              <span>{usdc} USDC</span>
            </span>
          </div>
          <button type="button" className="obs-btn-sm" onClick={() => setReceiveOpen(true)}>Receive</button>
          <p className="wallet-pop-kicker">Recent transactions (last 3)</p>
          {transactions.length === 0 ? <p className="tx-empty">No transactions yet</p> : (
            <ul className="monad-txs">
              {transactions.map((tx) => (
                <li key={tx.hash}>
                  <span>{tx.direction}</span>
                  <strong>{tx.amount}</strong>
                  <a href={tx.href} target="_blank" rel="noreferrer">{shortAddress(tx.hash)}</a>
                  <span>{tx.when}</span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="obs-meta">{error}</p>}
        </>
      )}
      {tab === "stripe" && (
        <>
          <p className="wallet-pop-kicker stripe-kicker">Stripe card</p>
          <div className="stripe-card" aria-hidden="true">
            <span className="stripe-word">stripe</span>
            <span className="rain-chip" />
            <span className="rain-number">●●●●  ●●●●  ●●●●  {STRIPE_DEMO.last4}</span>
            <span className="rain-meta"><span>Valid thru {STRIPE_DEMO.validThru}</span><span>{STRIPE_DEMO.holder}</span></span>
          </div>
          <div className="wallet-kv">
            <div><span>Balance</span><strong>${STRIPE_DEMO.balanceUsd.toFixed(2)}</strong></div>
            <div><span>Payouts</span><strong>${STRIPE_DEMO.payoutUsd.toFixed(2)}</strong></div>
          </div>
          <p className="wallet-pop-kicker">Recent transactions (last 3)</p>
          <p className="tx-empty">No transactions yet</p>
          <p className="obs-meta">{STRIPE_DEMO.note}</p>
        </>
      )}
      {receiveOpen && <ReceiveQr onClose={() => setReceiveOpen(false)} />}
    </section>
  );
}
