import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, isMeraError, type PasskeyCredentialMetadata } from "@category-labs/mera";

const CREDENTIAL_KEY = "agentledger.passkey";

export function relyingParty() {
  return { id: window.location.hostname, name: "AgentLedger" };
}

export function loadCredential(): PasskeyCredentialMetadata | null {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PasskeyCredentialMetadata;
    if (!parsed.credentialId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCredential(credential: PasskeyCredentialMetadata) {
  localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({
    credentialId: credential.credentialId,
    transports: credential.transports,
  }));
}

/** One passkey. Creates it the first time, then asks for the same credential. Returns a fresh PRF output. */
export async function unlockPrf(): Promise<{ credential: PasskeyCredentialMetadata; prfOutput: Uint8Array }> {
  const rp = relyingParty();
  const existing = loadCredential();
  if (existing) {
    const result = await getPasskeyPrfOutput({ rpId: rp.id, credential: existing });
    const credential = { credentialId: result.credentialId, transports: existing.transports };
    saveCredential(credential);
    return { credential, prfOutput: result.prfOutput };
  }
  const created = await createPasskeyWithPrfOutput({
    rp,
    user: { name: "agentledger-owner", displayName: "AgentLedger owner" },
  });
  const credential = { credentialId: created.credentialId, transports: created.transports };
  saveCredential(credential);
  return { credential, prfOutput: created.prfOutput };
}

export function meraMessage(error: unknown): string {
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE") {
      return "This browser cannot produce a passkey PRF output. On desktop Chrome, save the passkey in Google Password Manager and try again.";
    }
    if (error.code === "PASSKEY_OPERATION_FAILED") {
      return "The passkey prompt was cancelled, or this browser blocked it.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
