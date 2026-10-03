# How Agent Gate uses Mera

Mera (`@category-labs/mera`) turns one passkey into the site owner's keys. The passkey never becomes a seed phrase, and the derived private keys are not saved. The browser asks the authenticator for a 32-byte PRF output, the dashboard stretches that output into a separate key for each job, uses the key, then wipes it.

This is the owner side of the product. Agent wallets are a different system. Do not use Mera as the paying agent's wallet.

## What you should build

Judges are looking for one passkey that produces many keys, with nothing secret stored, and the same addresses coming back on a second device.

Do these three derivations from a single PRF output:

| Purpose | Info string in this repo | What it is for |
|---|---|---|
| Owner account | `agentledger/v1/owner` | The address shown when the wallet unlocks |
| Payout | `agentledger/v1/service/<slug>/payout` | Where USDC for that site is sent |
| Ownership | `agentledger/v1/service/<slug>/ownership` | Signs the proof that this person controls the site |

The ownership key must sign a challenge. Recover the signer and require it to equal the ownership address. That signature is not a transfer.

Then sign in on a second device with the same synced passkey, derive the addresses again, and show that they match. That cross-device check is the piece judges record. This repo derives the keys and unlocks the wallet. It does not yet have that second-device screen.

## What this repo does

The code lives in `apps/dashboard/src/modules/mera/`.

1. `passkey.ts` creates the passkey on the first visit with `createPasskeyWithPrfOutput`. Later visits call `getPasskeyPrfOutput` with the saved credential. `localStorage` keeps `credentialId` and `transports` only.
2. `derive.ts` runs HKDF-SHA256 over the PRF output. Salt is `agentledger`. The info string is the purpose above, plus a retry suffix until the 32 bytes are a valid secp256k1 key.
3. `verifyService.ts` unlocks the passkey, derives the three addresses, signs `AgentLedger verify service` plus the site origin, name, and a nonce, and checks the recovered signer. Signing uses `createSecp256k1SigningSession` and `toViemAccount`. `session.end()` runs when the signature is done. The PRF output and key bytes are zeroed with `fill(0)`.

The Wallet tab calls `unlockOwnerAccount()`. That is the path you can click today: Create passkey, then the owner address appears, and Lock hides the balances again.

`verifyServiceWithPasskey` is what adding a site should call. `ServiceGate.tsx` does that. The Services tab currently marks dheeraj.blog verified without asking for the passkey, so the ownership signature is not on that button yet. Wire that screen to `verifyServiceWithPasskey` before you demo "each site gets its own payout address."

## How to do it

Run the dashboard on `localhost` or HTTPS. The passkey is bound to `window.location.hostname`. Changing the host later means creating the passkey again.

Desktop Chrome only returns a PRF output for a passkey saved in Google Password Manager. A passkey that stays in the local Chrome profile throws `PRF_UNAVAILABLE`. The wallet screen already says that. iCloud Keychain and 1Password also work. Handle `PASSKEY_OPERATION_FAILED` when the person cancels the prompt.

Sequence for a new owner:

1. Call `createPasskeyWithPrfOutput` once. Store the credential id.
2. From `prfOutput`, derive the owner address and show it. Do not write the output or the private key anywhere.
3. For each site, derive payout and ownership with that site's slug in the info string.
4. Sign a challenge with the ownership key. Check the recovered address. End the signing session.
5. Zero every `Uint8Array` you derived.
6. On the next visit, call `getPasskeyPrfOutput` with the stored credential. The addresses must match.

Same passkey and same slug always produce the same addresses. A different slug produces a different payout address and a different ownership key. That is the whole "one passkey, many keys" result.

## What not to do

Do not log the PRF output, the derived key, or a mnemonic. Do not send those bytes to the server. The server can store the credential id and the public addresses.

Do not keep a signing session open after the signature. Call `session.end()`.

Do not reuse one key for payout and ownership. The address that receives money and the key that proves control of the site stay separate.
