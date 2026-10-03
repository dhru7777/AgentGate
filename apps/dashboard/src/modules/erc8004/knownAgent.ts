import type { Identity } from "../../types";

/** ERC-8004 agent #1810 on Monad testnet. https://testnet.8004scan.io/agents/monad-testnet/1810 */
export const KNOWN_INVOICE_AGENT = {
  agentId: 1810,
  name: "Invoice Agent",
  wallet: "0x74882c29b00c0b427D2f901adA897DcCa850b219",
  owner: "0x74882c29b00c0b427D2f901adA897DcCa850b219",
} as const;

export function knownInvoiceIdentity(serviceId: string): Identity {
  return {
    agentId: KNOWN_INVOICE_AGENT.agentId,
    name: KNOWN_INVOICE_AGENT.name,
    claimedAs: "Your agent",
    wallet: KNOWN_INVOICE_AGENT.wallet,
    owner: KNOWN_INVOICE_AGENT.owner,
    status: "verified",
    reputation: null,
    services: [serviceId],
  };
}
