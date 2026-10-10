# Metropolis submission

Hackathon form for AgentGate. Update this file every time a field is saved on the form. A box is checked only after it is saved there, not when the draft below is written.

- Deadline: **13 Oct 2026, 22:59 CDT**
- Last saved on the form: **3 Oct 2026, 22:44 UTC**
- Checklist on the form: **1 / 6**

## Checklist

- [x] Primary track
- [ ] Project details
- [ ] Project logo
- [ ] Live product
- [ ] Demo and pitch videos
- [ ] Bounty requirements

## Primary track

- [x] **Trust, Identity & AI Infrastructure**

One track. Bounties are added only after this stays selected.

## Project details

Give judges a clear introduction. Logo, name, and tagline sit in this section. The section stays incomplete until the description, audience, and GitHub link are saved.

### Logo

- [ ] Uploaded

Square or rectangular. PNG, JPG, or WEBP. Max 2 MB. At least 500 px. Up to 4 million pixels.

No logo file is in the repo yet.

### Name

- [x] **AgentGate** (9 / 120)

### Tagline

- [x] **Monetization Gateway for Frontier AI Agents Accessing Proprietary Data** (70 / 200)

### Description

- [ ] Saved on the form (0 / 8,000)

Describe the problem, the solution, and what makes it useful.

Draft, ready to paste (1,462 / 8,000):

```
AI agents read proprietary sites at scale, and the owner gets nothing. robots.txt asks crawlers to stay out. It does not enforce that, and it cannot charge them. Blocking the agent throws away the demand. Leaving the page open gives the content away.

A paywall that only returns HTTP 402 is no longer enough. CrawlPay, Agent402, and Cloudflare Pay Per Crawl already do a version of that. The owner still cannot answer which agent asked, whether it paid, which page earned the money, and which agents should be allowed, priced, or blocked.

AgentGate is the layer above the 402: identity, pricing, authorization, payment, delivery, receipt, and analytics.

The owner signs in with one passkey. That passkey derives a separate payout address and a separate ownership key for each site. There is no seed phrase and no browser extension. The agent has an onchain identity (ERC-8004 on Monad), so policy can tell a registered agent from an anonymous client. The owner sets the price and the allow or block rules per site. The agent pays in USDC. The visit is receipted, and the dashboard shows who came and what they paid.

The first property is the builder's own blog. Humans and agents already hit it. Agents that are not allowed receive HTTP 402. The dashboard is where the owner watches that traffic and settles access on Monad.

Cloudflare controls AI crawler access. AgentGate makes AI agent access programmable, identifiable, and economically settled onchain.
```

### First users

- [ ] Saved on the form (0 / 8,000)

Who are the first users, and how will you reach them?

Draft, ready to paste (697 / 8,000):

```
The first users are independent publishers who already have a site that agents read, and who want to get paid for that access without becoming a payments company.

The first property is the builder's own blog, dheeraj.blog (https://dheeraj-work.netlify.app). Humans pass a small proof of work. Agents that are not allowed receive HTTP 402. That site is how we see which agents show up and which pages they want.

We reach the next owners through the University of Toronto Blockchain Society and through builders in the Monad community who already run a blog, a docs site, or a small API. The offer is one origin they control: prove ownership with a passkey, set a price, and see which agents paid.
```

### GitHub

- [ ] Saved on the form

Public, or shared with `metropolis@hackathon.monad.xyz`.

Repo: `https://github.com/dhru7777/AgentGate`

The form still shows the placeholder `https://github.com/your-team/your-project`. Confirm the repo is public or shared before checking this box.

## Live product

- [ ] Product link saved

Must start with `https://`. Must run on Monad Mainnet or Testnet.

Link:

```
```

Known surfaces that are not this field yet:

- Blog gate: `https://dheeraj-work.netlify.app` (402 for agents that are not allowed; paid path is still USDC on Base)
- Dashboard: not deployed. Passkey owner login, ERC-8004 lookup, and Monad testnet balances run from this repo.

## Demo and pitch videos

- [ ] Demo video
- [ ] Pitch video
- [ ] Steps to try the product

### Demo video

Up to 3 minutes. YouTube, Loom, Vimeo, or another host. Show the working product, not slides or a code walkthrough.

```
```

### Pitch video

Up to 2 minutes. Introduce the team, the problem, and why you are building it.

```
```

### Steps to try the product

- [ ] Saved on the form (0 / 8,000)

Private to the team, judges, and organizers. Include any test login details.

Draft, not ready to paste until the product URL and test login exist:

```
1. Open the product link.
2. Create or unlock the owner passkey (Mera). No seed phrase. Desktop Chrome needs the passkey in Google Password Manager, iCloud Keychain, or 1Password. A passkey that stays in the local Chrome profile cannot return a PRF output.
3. Confirm the owner address on Monad testnet.
4. Open the built-in site dheeraj.blog and review live request analytics.
5. On Monad testnet, look up ERC-8004 agent 1810: https://testnet.8004scan.io/agents/monad-testnet/1810
6. As an agent, request a protected URL, pay the USDC requirement on Monad testnet, and open the receipt in the explorer.

Test login:
- Passkey: (add before recording)
- Agent wallet: (add before recording)
- Testnet USDC: (add faucet or balance note)
```

## Bounties

Selected sponsor bounties: **0 of 3 complete**.

- [ ] Monad Foundation — Best Community Team Project
- [ ] Dynamic — Best Use of Dynamic (1 of 2 on the form)
- [ ] Monad Foundation — Mera: One Passkey, Many Keys (1 of 2 on the form)

### Best Community Team Project

- [x] Community chosen: **University of Toronto Blockchain Society**
- [ ] Bounty marked complete on the form

### Best Use of Dynamic

Platform shows 1 of 2. The long answer and the link are still empty.

- [ ] Written answer (0 / 8,000)
- [ ] Link, starting with `https://`

Draft answer, not saved (499 / 8,000):

```
Dynamic is the wallet for the paying AI agent, not the site owner. The owner signs in with a Mera passkey. The agent holds testnet USDC in a Dynamic wallet and signs the payment when a protected URL returns HTTP 402.

The agent checks the price against its spend cap before it signs. It signs an EIP-3009 transferWithAuthorization, retries with the payment signature, and receives the page plus a receipt. The payment settles in USDC on Monad testnet, and the transaction is visible on the explorer.
```

Link:

```
```

### Mera: One Passkey, Many Keys

Platform shows 1 of 2. The two question prompts are not in the form export, so this file does not guess which half is done.

- [ ] Remaining Mera answer saved
- [ ] Remaining Mera link or second field saved

What the build has to show, from `instructions/04-BOUNTIES.md` and `docs/mera.md`:

- One passkey derives three keys: owner account, per-site payout, per-site ownership.
- Ownership signing is not a transfer.
- Only the credential id and public addresses are stored.
- The same passkey on a second device re-derives the same payout and ownership addresses.

## Optional promotion

Does not affect judging. Leave unchecked. These are optional.

- [ ] Promo clip, up to 30 seconds
- [ ] X link for the project

```
```

```
```

## Update log

| Date | What changed |
|---|---|
| 2026-10-03 | Created this file from the form. Track saved. Name and tagline saved. Community set to University of Toronto Blockchain Society. Description, audience, GitHub, logo, product link, both videos, try-steps, and all three bounties still open. |
