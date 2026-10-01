import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { bytesToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const SALT = utf8ToBytes("agentledger");

function asHex(bytes: Uint8Array): Hex {
  return bytesToHex(bytes);
}

/** HKDF purpose key. Retries the info suffix until the result is a valid secp256k1 scalar. */
export function purposeKey(prf: Uint8Array, info: string): Uint8Array {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const key = hkdf(sha256, prf, SALT, utf8ToBytes(`${info}/${attempt}`), 32);
    try {
      privateKeyToAccount(asHex(key));
      return key;
    } catch {
      key.fill(0);
    }
  }
  throw new Error("Could not derive a signing key from this passkey.");
}

export function addressForPurpose(prf: Uint8Array, info: string): Address {
  const key = purposeKey(prf, info);
  try {
    return privateKeyToAccount(asHex(key)).address;
  } finally {
    key.fill(0);
  }
}

export function serviceKeyInfo(slug: string, purpose: "payout" | "ownership"): string {
  return `agentledger/v1/service/${slug}/${purpose}`;
}

export const OWNER_KEY_INFO = "agentledger/v1/owner";
