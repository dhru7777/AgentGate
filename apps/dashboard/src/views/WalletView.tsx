import { useEffect, useState } from "react";
import { explorerAddressUrl, MONAD_RECEIVE_ADDRESS } from "../modules/chain/monad";
import { loadCredential, meraMessage } from "../modules/mera/passkey";
import { readMonadAccount } from "../modules/wallet/etherscan";
import type { OwnerSession } from "../types";
import { WalletAccounts } from "../screens/WalletAccounts";

export function WalletView({
  owner,
  onUnlock,
  onLock,
}: {
  owner: OwnerSession | null;
  onUnlock: () => Promise<void>;
  onLock: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const hasPasskey = loadCredential() !== null;
  const [publicUsdc, setPublicUsdc] = useState("…");

  // The receiving address and its USDC are public on chain, so they show before the passkey.
  useEffect(() => {
    if (owner) return;
    let cancel = false;
    readMonadAccount(MONAD_RECEIVE_ADDRESS)
      .then((account) => { if (!cancel) setPublicUsdc(`${account.usdc} USDC`); })
      .catch(() => { if (!cancel) setPublicUsdc("unavailable"); });
    return () => { cancel = true; };
  }, [owner]);

  async function unlock() {
    setBusy(true);
    setNotice("");
    setNoticeError(false);
    try {
      await onUnlock();
    } catch (error) {
      setNotice(meraMessage(error));
      setNoticeError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ledger-page">
      <header className="obs-top">
        <div>
          <h1>Wallet</h1>
          <p className="obs-meta">Agents pay the receiving address below. A Mera passkey opens the full wallet.</p>
        </div>
      </header>

      {!owner && (
        <section className="ledger-card">
          <h2>Receiving address</h2>
          <p className="obs-lead">Every paid 402 settles here in USDC on Monad testnet.</p>
          <div className="obs-kpis">
            <div className="obs-kpi"><span>Address</span><strong className="mono"><a href={explorerAddressUrl(MONAD_RECEIVE_ADDRESS)} target="_blank" rel="noreferrer">{MONAD_RECEIVE_ADDRESS}</a></strong></div>
            <div className="obs-kpi"><span>USDC balance</span><strong>{publicUsdc}</strong></div>
          </div>
        </section>
      )}

      {!owner && (
        <section className="ledger-card">
          <h2>Mera passkey</h2>
          <p className="obs-lead">
            This passkey is how you open the wallet. It is not the address that receives USDC.
          </p>
          <button type="button" className="obs-lock-submit" onClick={unlock} disabled={busy}>
            {busy ? "Waiting for passkey…" : hasPasskey ? "Unlock with passkey" : "Create passkey"}
          </button>
          {notice && <p className={noticeError ? "obs-lock-error" : "obs-toast"}>{notice}</p>}
        </section>
      )}

      {owner && (
        <>
          <WalletAccounts />
          <section className="ledger-card">
            <h2>Opened with your passkey</h2>
            <p className="obs-lead">Mera derived this owner address for this session. Locking hides the balances again.</p>
            <div className="obs-kpis">
              <div className="obs-kpi"><span>Owner</span><strong className="mono">{owner.ownerAddress}</strong></div>
            </div>
            <button type="button" className="obs-btn-sm" onClick={onLock}>Lock wallet</button>
          </section>
        </>
      )}
    </div>
  );
}
