import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { recoverMessageAddress, type Address } from "viem";
import { OWNER_KEY_INFO, purposeKey, serviceKeyInfo } from "./derive";
import { unlockPrf } from "./passkey";

export type VerifiedServiceKeys = {
  credentialId: string;
  ownerAddress: Address;
  payoutAddress: Address;
  ownershipAddress: Address;
};

function challengeFor(origin: string, name: string, nonce: string): string {
  return `AgentLedger verify service\norigin: ${origin}\nname: ${name}\nnonce: ${nonce}`;
}

/**
 * Unlocks the passkey, derives an ownership key for this service, signs a challenge,
 * and checks the recovered signer is that ownership address.
 */
export async function verifyServiceWithPasskey(input: { name: string; origin: string; slug: string }): Promise<VerifiedServiceKeys> {
  const { credential, prfOutput } = await unlockPrf();
  const ownershipKey = purposeKey(prfOutput, serviceKeyInfo(input.slug, "ownership"));
  try {
    const ownerAddress = addressOf(purposeKey(prfOutput, OWNER_KEY_INFO));
    const payoutKey = purposeKey(prfOutput, serviceKeyInfo(input.slug, "payout"));
    const payoutAddress = addressOf(payoutKey);
    payoutKey.fill(0);
    const ownershipAddress = addressOf(ownershipKey.slice());

    const nonce = crypto.randomUUID();
    const message = challengeFor(input.origin, input.name, nonce);
    const session = createSecp256k1SigningSession({ privateKey: ownershipKey });
    try {
      const account = toViemAccount(session);
      const signature = await account.signMessage({ message });
      const recovered = await recoverMessageAddress({ message, signature });
      if (recovered.toLowerCase() !== ownershipAddress.toLowerCase()) {
        throw new Error("Passkey signature did not match the ownership address for this service.");
      }
    } finally {
      session.end();
    }

    return { credentialId: credential.credentialId, ownerAddress, payoutAddress, ownershipAddress };
  } finally {
    ownershipKey.fill(0);
    prfOutput.fill(0);
  }
}

function addressOf(key: Uint8Array): Address {
  try {
    const session = createSecp256k1SigningSession({ privateKey: key });
    try {
      return toViemAccount(session).address;
    } finally {
      session.end();
    }
  } finally {
    key.fill(0);
  }
}

export async function unlockOwnerAccount(): Promise<{ credentialId: string; ownerAddress: Address }> {
  const { credential, prfOutput } = await unlockPrf();
  try {
    const key = purposeKey(prfOutput, OWNER_KEY_INFO);
    return { credentialId: credential.credentialId, ownerAddress: addressOf(key) };
  } finally {
    prfOutput.fill(0);
  }
}
