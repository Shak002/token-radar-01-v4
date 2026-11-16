# Token Launch Radar v3 — model radar-5

Build for make.fun competition `token-radar-01` (account @najj02x).
Closes 2026-12-14 10:00 UTC. Do not submit from here — the main agent submits.

## What changed vs v2 (radar-4)

radar-4 priced a protocol at TVL × its category's median market-cap/TVL.
That prices a $2.7B curator at the same multiple as a $5M one, and the
snapshot's own live tokens say that is wrong: market cap grows with TVL to
the power 0.52. radar-5 averages two estimators in log space:

1. the category multiple (as v2: shrunk median, prior 4, clamped 0.08–0.60);
2. the size curve: least squares of log10(market cap) on log10(TVL) over all
   live-token protocols, plus a per-category offset (residuals winsorized to
   ±1.0 log10, shrunk with prior 4, capped at ±0.5).

Multipliers are softer than v2's: growth 0.5 (was 1.0), maturity 0.6–1.0
(was 0.45–1.05), breadth 0.03/chain (was 0.05).

The model validates itself on the snapshot every run (5-fold held out over
the 128 live-token protocols; see `lib/model.ts` `validateCalibration` and
the dashboard's "Checked, not just fitted" section).

## Held-out validation (5-fold, same splits, n=128 live tokens)

| model | median |log10| | within 2× | within 3× | Spearman | prec@10 | prec@20 |
|---|---:|---:|---:|---:|---:|---:|
| v2 radar-4 | 0.674 (×4.7) | 21.9% | 35.2% | 0.394 | 0.58 | 0.82 |
| v3 radar-5 full | 0.571 (×3.7) | 25.0% | 41.4% | 0.387 | 0.62 | 0.84 |
| v3 radar-5 base only | 0.550 (×3.5) | 26.6% | 41.4% | 0.398 | 0.62 | 0.81 |

## Board (same snapshot, same 192 rows as v2)

- Top 1: Steakhouse Financial $418.3M (v2: $1.47B) — same rank order as v2,
  values 2–3.5× lower and inside the range the snapshot's own live tokens
  occupy ($250M–$2.6B at the top).
- Top-40: 29 watchlist / 10 early-above / 1 lifted early find (re7-labs #34,
  as in v2; ultrayield-curator #45, just outside the top 40).
- Rows 192 (40 watchlist, 16 early-above, 136 early-below), farm steps all
  20–600 chars, deterministic: two runs byte-identical.
- Screenshots: 1-board 163,912 B, 2-detail 265,986 B, 3-filtered 162,780 B.

## Repo

- Init-first: kit `init` ran in this repo before any code was written;
  anchor `makefun anchor 0187ba22430361f870e0f1b2a975343945688c3e round 33983622`
  (commit 0187ba2) appears in the build session's tool results before the
  first counted write, so `thinking_fresh` should pass, not note.
- HEAD: see `git log`. Run: `node main.ts --input <snapshot.json> --output <dir>`
  (Node 22, stdlib only). Screenshots: `shot-tools/take-radar-v3-shots.mjs`
  against the served output dir.

## Notes for the submitter

- Kit copy used is level 13; the site is at level 14. Use a fresh kit
  (https://make.fun/c/token-radar-01/kit) for `check`/`submit`.
- Bundle the v1 + v2 builder sessions too (radar builder 45767432,
  radar-3 6babdf53, coordinator 3f6f1d1f) — any line copied from v1/v2 only
  counts toward `thinking_reproduces` through those sessions. The farm-plan
  generator and gas table are largely carried over from v2; the model,
  dashboard copy and detail view are substantially re-authored in this repo.
- Do NOT submit a snapshot another account already submitted.
