# Agent Gate Design System

Read this before changing anything visual. The goal is one quiet, consistent
look: warm paper, dark ink, one deep green accent, serif type. If a change needs
something this document does not cover, extend the document in the same commit.

## Principles

1. Restraint. Few colours, few weights, no decoration that carries no meaning.
2. Paper and ink. Pages read like a ledger: cream ground, hairline rules, text first.
3. One accent. Deep green marks what is active, linked or primary. Nothing else competes.
4. Flat. No gradients on surfaces, no heavy shadows. Depth comes from rules and tone.
5. Muted semantics. Status colours are earthy, never saturated.

## Tokens

All tokens live in `:root` at the top of `src/styles.css`. Never hardcode a hex
value in CSS. Use `var(--token)`.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f4efe6` | Page background |
| `--surface` | `#fbf8f2` | Cards, header, sidebar, inputs |
| `--wash` | `#efe9dc` | Code blocks, quiet fills, stripe panel |
| `--wash-hover` | `#e8e1d1` | Hover on nav and rows |
| `--rule` | `#d9cfbc` | Borders on controls and cards |
| `--rule-soft` | `#e6dfd0` | Row dividers, table lines |
| `--ink` | `#26221c` | Body text, headings, primary buttons |
| `--ink-soft` | `#5b5347` | Secondary text, descriptions |
| `--ink-faint` | `#8a8071` | Labels, captions, placeholders, disabled |
| `--accent` | `#2f4a3a` | Links, active nav, focus, selected state |
| `--accent-wash` | `#e4e9dd` | Background of active or selected items |
| `--brass` | `#8c6d3a` | Secondary data series, small ornament |
| `--positive` | `#4f6b4a` | Allowed, paid, verified |
| `--negative` | `#8a3a32` | Gated, blocked, destructive |
| `--warn` | `#a06a2c` | Pending |
| `--deep` | `#1c1915` | Dark panels: globe, modals, code |
| `--on-dark` / `--on-dark-soft` | `#f4efe6` / `#bdb4a3` | Text on `--deep` |

Exceptions, kept literal on purpose: the QR code and its centre mark stay pure
white so scanners read them, and the Stripe and Monad cards use their own muted
tints because they depict third-party products.

## Typography

| Role | Face | Notes |
|---|---|---|
| Display (`--display`) | Cormorant Garamond | h1, h2, h3, big numbers, the invoice title |
| Body (`--body`) | EB Garamond | Everything else, 18px base |
| Mono | `ui-monospace, Menlo` | Addresses, hashes, robots.txt only |

- Loaded from Google Fonts in `index.html`; Georgia is the fallback.
- Headings are regular weight (400 to 500). Do not bold headings.
- Scale: h1 1.6rem, h2 1.1rem, body 1rem, secondary 0.95rem, caption 0.82rem.
- Labels: 0.72 to 0.75rem, uppercase, letter-spacing 0.04 to 0.08em, `--ink-faint`.
- Numbers in tables and KPIs use `font-variant-numeric: tabular-nums`.
- Charts and canvas text use the same families (`Charts.tsx`, `AgentPortrait.tsx`).

## Layout and spacing

- Spacing steps: 4, 8, 12, 16, 24, 40px (rem where the file already uses rem).
- Page content padding `1.25rem 1.75rem`; sidebar 220px; content max-width 1100px (invoice 1240px).
- Dividers are 1px hairlines in `--rule-soft`. Prefer a line over a box.
- One radius: `--radius` (3px). Pills (999px) only for filter chips and toggles.
- Breakpoint: 800px. The sidebar becomes a top strip and grids collapse to one column.

## Components

- **Header and nav**: `--surface`, bottom hairline. Active item is `--accent` on `--accent-wash`.
- **Cards** (`.ledger-card`, `.wallet-pop`): `--surface`, 1px `--rule-soft` border, `--radius`, no shadow.
- **Buttons**: default is outlined (`--rule` border, `--ink` text). Primary is solid `--ink` with `--on-dark` text. Destructive hover turns `--negative`.
- **Links**: `--accent`, underline on hover.
- **Inputs**: `--surface`, `--rule` border, `--radius`, 0.95rem text.
- **Tables**: no zebra, no outer border, `--rule-soft` row lines, header in label style. Selected row uses `--accent-wash`.
- **KPI tiles**: label above (label style), value in `--display`.
- **Status text**: colour only, uppercase 0.75rem. Verified and allowed use `--positive`, claimed uses `--accent`, anonymous uses `--ink-faint`, gated and blocked use `--negative`, pending uses `--warn`.
- **Toggle**: `--rule` off, `--positive` on.
- **Dark panels** (globe, receive sheet, code): `--deep` ground, `--on-dark` text. These are the only dark areas.
- **Invoice paper**: `--surface` with a hairline border and a faint shadow, like a printed sheet.

## Charts

Series colours, in order: `#2f4a3a` green, `#26221c` ink, `#8c6d3a` brass, `#8a8071` grey, `#6f8466` sage.
Semantic pairs: allowed `#4f6b4a`, blocked `#8a3a32`, human `#2f4a3a`, AI `#8c6d3a`.
No gradients, no fills heavier than the line.

## Motion

Short and rare. 200 to 300ms ease for toggles and the analytics reveal. No bounce, no parallax.

## Voice

Plain sentences, sentence case, no emojis, no exclamation marks. Labels name the thing ("Requests", "Paid"). Errors say what failed and what to do.

## Checklist for a change

- Colours come from tokens (or the chart list above).
- Headings use `--display`, everything else `--body`.
- New borders are 1px hairlines; new corners use `--radius`.
- No new shadow, gradient or accent colour without updating this file.
- Check it at 800px width and under.
