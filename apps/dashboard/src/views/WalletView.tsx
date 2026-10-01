export function WalletView() {
  return (
    <div className="ledger-page">
      <header className="obs-top">
        <div>
          <h1>Wallet</h1>
          <p className="obs-meta">One passkey for the owner. One wallet for each agent.</p>
        </div>
      </header>
      <section className="ledger-card">
        <h2>Owner account</h2>
        <p className="obs-lead">
          The owner passkey is separate from the agent that gets paid. Creating the account comes next.
        </p>
      </section>
    </div>
  );
}
