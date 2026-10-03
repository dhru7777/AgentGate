import { useState } from "react";
import { loadCredential, meraMessage } from "../modules/mera/passkey";
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
          <p className="obs-meta">A Mera passkey opens this wallet. Balances stay hidden until it succeeds.</p>
        </div>
      </header>

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
