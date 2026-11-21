# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/k10mei1997/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/k10mei1997/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of the protocol universe (758 protocols), finds every protocol that still records **no token** and is not a wrapped, staked or bridged product of one that trades, and ranks all **198** of them by what their launch would be worth — each with a concrete farm plan. The 40-protocol watchlist (TVL ≥ $50M, no token) is the floor, never the ceiling: 158 ranked protocols sit below it.

## The value model (radar-2)

No hardcoded names, no flat multiple. Tokenised protocols in the same snapshot are the comparables:

- **Peer multiple** — median market-cap / TVL of tokenised peers, resolved in three layers, and every row names the layer it used: (1) its own category (≥3 peers reporting a market cap), (2) its peer group (categories that are the same business pooled — vaults/curators/yield, lending, trading, staking, bridges), (3) the global median.
- **Momentum** — `1 + clamp(change_7d, −60, +120)/100 × 0.5`
- **Maturity** — `0.6 + min(age_days, 1095)/1095 × 0.4` (unknown age counts as 365 days)
- **Confidence** — `0.55 + 0.45 × min(TVL / $50M floor, 1)`: small protocols are marked down instead of ranked on a thin multiple alone.

`implied = TVL × peer_multiple × momentum × maturity × confidence`

A separate **readiness score (0–100)** — 30% maturity, 25% momentum, 25% log-scale TVL, 20% category precedent — tells the farmer how launch-shaped a protocol looks. It never changes the rank.

## What it hands in

- `board.json` — 198 ranked rows, the whole watchlist covered, each with its implied value, its full model breakdown (multiple, peer count and basis, all multipliers) and a 6-step farm plan with costs and times.
- `dashboard/` — a static page that renders with no network: spotlight cards for the top 5, a sortable board, search plus category / chain / tier filters, a detail view for every protocol (valuation equation recomputed in the page, readiness, farm plan, risk note), the live-token protocols set aside with their real market caps, and the method with its category multiples.
- `screenshots/` — the board, a protocol detail view and a filtered view, rendered in Chromium.
- `dossier.json` — built by `vendor/makefun-board.ts`, the kit's library, byte for byte.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18 or later, standard library only. In the grader's container the snapshot is mounted at `/input/snapshot.json` and output goes to `/output`. Open `out/dashboard/index.html` in a browser to use the radar.

## Licence

MIT — see `LICENSE`. `vendor/makefun-board.ts` is make.fun's library, shipped unmodified as the bounty requires.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
