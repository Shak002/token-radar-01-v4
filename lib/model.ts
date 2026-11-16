// Token Launch Radar — the value model (radar-5).
//
// One sealed snapshot in, one ranked board out. The board ranks protocols that
// record no token yet, by an implied value derived only from the snapshot's own
// figures. No protocol name is ever special-cased: the same function scores
// every row, and the dashboard states the formula in full.
//
// radar-5 changes the value model in one place, and it is the place the
// previous model was weakest: how the base value is set. radar-4 priced a
// protocol at TVL times its category's median market-cap/TVL. That multiple
// is the snapshot's own figure, but it is a blunt one: it prices a $2.7B
// curator at the same multiple as a $5M one, and the snapshot's own live
// tokens say that is wrong. Across the 128 live-token protocols in this
// snapshot, market cap grows with TVL to the power 0.52 — a protocol with
// ten times the TVL is worth about three times the token, not ten times.
// radar-4's top row, a $2.7B curator at $1.47B, is higher than all but a
// handful of live tokens, and those are exchange and bridge tokens whose
// recorded TVL does not capture what their token is worth. radar-5 keeps
// the category multiple and adds a second estimator, the size curve, and
// averages the two in log space, so neither the multiple's top-end inflation
// nor the curve's top-end compression decides a row alone.
//
//   estimator 1 — category multiple: the median market-cap/TVL of the
//     live-token protocols in the same category, shrunk toward the global
//     median with a prior of 4 protocols, clamped to 0.08..0.60. A category
//     with no live token in the snapshot uses the global median.
//   estimator 2 — size curve: an ordinary least-squares fit of
//     log10(market cap) on log10(TVL) across all live-token protocols,
//     plus a per-category offset. The offset is the shrunk mean of the
//     category's residuals — each residual winsorized to +/-1.0 in log10,
//     shrunk with a prior of 4, capped at +/-0.5 — so one protocol cannot
//     move its whole category. The winsorizing matters: this snapshot holds
//     one prediction-market token at 400x its TVL, and without it that one
//     row would have priced every prediction market 8.8x above the curve.
//     With it, the category's offset is +0.20, about 1.6x.
//   base  = 10 ^ (0.5 * log10(estimator 1) + 0.5 * log10(estimator 2))
//   growth    = clamp(change_7d, -50, 120) per cent
//   growthMult= 1 + (growth / 100) x GROWTH_WEIGHT (0.5: a protocol that
//                                                    grew 120% in a week
//                                                    earns 1.6x; one that
//                                                    fell 50% earns 0.75x)
//   maturity  = MATURITY_FLOOR + min(age, 1460)/1460 x MATURITY_RANGE
//                                                    (0.6..1.0: older, still
//                                                    tokenless protocols are
//                                                    closer to launch; age
//                                                    unknown: 365)
//   breadth   = 1 + BREADTH_STEP x min(chains - 1, 7)
//                                                    (each extra chain up to
//                                                    eight adds 3%: reach)
//   implied   = max(1, round(base x growthMult x maturity x breadth))
//
// The multipliers are deliberately small. They are the model's way of saying
// a protocol that is growing, old without a token, and on many chains is
// worth more than a flat one of the same size — but the size curve is the
// value, and the multipliers nudge it. The held-out check below says the
// nudges cost a little calibration on live tokens and are kept small on
// purpose.
//
// Checked, not just fitted: the model validates itself on the snapshot every
// time it runs. The 128 live-token protocols are split into five folds by
// slug order; the two estimators are fitted on four folds and scored on the
// fifth, five times over. The dashboard states the result. On this snapshot
// the full model predicts a held-out token's market cap with a median error
// of 0.57 in log10 (about 3.7x), 25% of held-out tokens within 2x, 41%
// within 3x; the base alone does 0.55 / 27% / 41%. The previous model, on
// the same folds, did 0.67 (about 4.7x), 22% and 35%. The check is honest
// about its limit: the snapshot's own live tokens span market-cap/TVL from
// 0.003 to 400, so no model of this size predicts a single token closely —
// what the check shows is that the calibration is real and the ranking is
// sound (about six of the ten biggest held-out tokens land in the model's
// top ten, eight or nine of the top twenty).
//
// The watchlist is the floor, never the ceiling: every watchlist slug is
// ranked, and the early radar adds every other rankable pre-token protocol,
// above or below the floor, with the most TVL — the early finds the radar
// exists to find. Live-token protocols are never ranked: the dashboard shows
// them apart, at the market's own value, so the board never mixes a model's
// claim with a price that already trades.
//
// Six rows stay out even though the snapshot records no token for them:
// DefiLlama records each as a product line of a protocol whose token already
// trades (PARENT_TOKEN_CHILDREN below). The snapshot carries no parent field,
// so that check — run once against DefiLlama's public protocol list on
// 2026-11-15 — is recorded here as data, with the parent and its token named.
// It touches eligibility only; no implied value is ever set by hand.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Weight of the (clamped) seven-day TVL change on the multiple. */
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  /** Maturity multiplier at age zero, and how much it grows by maturity_days. */
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  /** Age in days assumed when the snapshot carries no listing date. */
  unknown_age_days: number;
  /** Extra multiple per chain past the first, and the chain count it stops at. */
  breadth_step: number;
  breadth_max_chains: number;
  /** Pseudo-count of protocols pulling a category multiple toward the global median. */
  category_prior: number;
  /** The calibrated multiple never leaves this range. */
  base_multiple_floor: number;
  base_multiple_cap: number;
  /** Weight of the size curve in the log-average of the two base estimators (the rest is the category multiple). */
  blend_weight: number;
  /** Pseudo-count of protocols pulling a category's size-curve offset toward zero. */
  curve_prior: number;
  /** A category residual is clipped to +/- this many log10 before it is averaged. */
  residual_winsor: number;
  /** A category's size-curve offset never leaves +/- this many log10. */
  offset_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_step: 0.03,
  breadth_max_chains: 8,
  category_prior: 4,
  base_multiple_floor: 0.08,
  base_multiple_cap: 0.6,
  blend_weight: 0.5,
  curve_prior: 4,
  residual_winsor: 1.0,
  offset_cap: 0.5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-5';

/** How many pre-token protocols outside the watchlist the early radar carries, by TVL, above or below the floor. */
export const EARLY_ROWS = 220;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Folds in the held-out check. */
export const VALIDATION_FOLDS = 5;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  /** Where the row comes from: the house watchlist, or an early find above or below its floor. */
  origin: 'watchlist' | 'early-above' | 'early-below';
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    /** Live-token protocols in this category the multiple was shrunk from (0: the global median was used). */
    category_live_n: number;
    /** The two base estimators and their log-average, before the multipliers. */
    median_value_usd: number;
    curve_value_usd: number;
    base_value_usd: number;
    /** The category's size-curve offset in log10 (0: the curve as fitted). */
    curve_offset: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page builds farm plans from board.json's steps. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  origin: 'watchlist' | 'early-above' | 'early-below';
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_multiple: number;
  category_live_n: number;
  median_value_usd: number;
  curve_value_usd: number;
  base_value_usd: number;
  curve_offset: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One calibrated category multiple, for the dashboard's model page. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  live_n: number;
}

/** One fitted category offset on the size curve, for the dashboard's model page. */
export interface CategoryOffset {
  category: string;
  /** The offset in log10: 10^offset is the factor the curve is moved by. */
  offset: number;
  live_n: number;
}

/** The held-out check's result, computed from the snapshot every run. */
export interface ValidationResult {
  /** Live-token protocols the check scored. */
  n: number;
  folds: number;
  /** Median |log10(predicted / actual)| over held-out tokens, full model. */
  median_abs_log10: number;
  /** The same, as a factor: 10^median_abs_log10. */
  median_abs_factor: number;
  /** Share of held-out tokens predicted within 2x of their real market cap, full model. */
  within_2x: number;
  /** Share within 3x, full model. */
  within_3x: number;
  /** Median log10(predicted / actual): near zero means the model is unbiased. */
  bias_log10: number;
  /** Spearman rank correlation of predicted vs actual market cap, full model. */
  spearman: number;
  /** Share of the ten biggest held-out tokens that land in the model's top ten, averaged over folds. */
  precision_at_10: number;
  /** Share of the twenty biggest held-out tokens that land in the model's top twenty, averaged over folds. */
  precision_at_20: number;
  /** The same median |log10| for the base alone, without the multipliers. */
  base_median_abs_log10: number;
  /** The same within-2x share for the base alone. */
  base_within_2x: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  early_above_floor: number;
  early_below_floor: number;
  live_size: number;
  /** Median market-cap/TVL across the snapshot's live-token protocols. */
  global_median_multiple: number;
  /** The size curve's fit: log10(market cap) = intercept + slope x log10(TVL). */
  size_curve: { intercept: number; slope: number };
  /** The calibrated multiple per category, sorted by category name. */
  category_multiples: CategoryMultiple[];
  /** The fitted size-curve offset per category, sorted by category name. */
  category_offsets: CategoryOffset[];
  /** The held-out check, computed from this snapshot. */
  validation: ValidationResult;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The middle value of a sorted array, or the lower middle of an even one. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** The mean of an array, or 0 for an empty one. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The live-token protocols of a snapshot: they already trade, so they are the model's training set, never its board. */
export function liveProtocols(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

/**
 * The calibration the model scores against, fitted from the snapshot's own
 * live-token protocols:
 *  - the global median market-cap/TVL, and one shrunk multiple per category
 *    that has a live token: (n / (n + prior)) x category median +
 *    (prior / (n + prior)) x global median, clamped to the model's floor
 *    and cap, so a category seen once cannot set the price on its own;
 *  - the size curve: log10(market cap) = intercept + slope x log10(TVL),
 *    fitted by least squares over all live tokens, plus one offset per
 *    category: the shrunk mean of that category's residuals, each residual
 *    clipped to +/-residual_winsor before averaging, shrunk with
 *    curve_prior, and capped at +/-offset_cap. Categories with no live
 *    token are absent from both maps and fall back to the global median
 *    (for the multiple) and to no offset (for the curve) at scoring time.
 */
export interface Calibration {
  globalMedian: number;
  byCategory: Map<string, { multiple: number; liveN: number; rawMedian: number }>;
  curveIntercept: number;
  curveSlope: number;
  curveOffsets: Map<string, { offset: number; liveN: number; rawMean: number }>;
}

export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  return calibrateProtocols(liveProtocols(snapshot), model);
}

/** The same fit, over an explicit list of live-token protocols (the held-out check fits on four fifths). */
export function calibrateProtocols(
  live: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): Calibration {
  const globalMedian = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const ratios = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '(uncategorised)';
    const list = ratios.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    ratios.set(key, list);
  }
  const byCategory = new Map<string, { multiple: number; liveN: number; rawMedian: number }>();
  for (const [category, values] of [...ratios.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const raw = median(values);
    const weight = values.length / (values.length + model.category_prior);
    const shrunk = weight * raw + (1 - weight) * globalMedian;
    const multiple = Math.min(model.base_multiple_cap, Math.max(model.base_multiple_floor, shrunk));
    byCategory.set(category, { multiple, liveN: values.length, rawMedian: raw });
  }
  // The size curve: least squares on log10(market cap) against log10(TVL).
  const xs = live.map((p) => Math.log10(p.tvl_usd));
  const ys = live.map((p) => Math.log10(p.mcap_usd!));
  const meanX = mean(xs);
  const meanY = mean(ys);
  const slope =
    xs.reduce((acc, x, i) => acc + (x - meanX) * (ys[i]! - meanY), 0) /
    xs.reduce((acc, x) => acc + (x - meanX) * (x - meanX), 0);
  const intercept = meanY - slope * meanX;
  const residuals = new Map<string, number[]>();
  for (const p of live) {
    const raw = Math.log10(p.mcap_usd!) - (intercept + slope * Math.log10(p.tvl_usd));
    const clipped = Math.min(model.residual_winsor, Math.max(-model.residual_winsor, raw));
    const key = p.category ?? '(uncategorised)';
    const list = residuals.get(key) ?? [];
    list.push(clipped);
    residuals.set(key, list);
  }
  const curveOffsets = new Map<string, { offset: number; liveN: number; rawMean: number }>();
  for (const [category, values] of [...residuals.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const rawMean = mean(values);
    const weight = values.length / (values.length + model.curve_prior);
    const offset = Math.min(model.offset_cap, Math.max(-model.offset_cap, weight * rawMean));
    curveOffsets.set(category, { offset, liveN: values.length, rawMean });
  }
  return { globalMedian, byCategory, curveIntercept: intercept, curveSlope: slope, curveOffsets };
}

/** A category's calibrated multiple: its own shrunk median, or the global median when the snapshot has no live token in it. */
export function categoryMultiple(
  category: string | null,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { multiple: number; liveN: number } {
  const hit = calibration.byCategory.get(category ?? '(uncategorised)');
  if (hit === undefined) {
    return {
      multiple: Math.min(model.base_multiple_cap, Math.max(model.base_multiple_floor, calibration.globalMedian)),
      liveN: 0,
    };
  }
  return { multiple: hit.multiple, liveN: hit.liveN };
}

/** A category's size-curve offset in log10, or 0 when the snapshot has no live token in it. */
export function curveOffset(
  category: string | null,
  calibration: Calibration,
): { offset: number; liveN: number } {
  const hit = calibration.curveOffsets.get(category ?? '(uncategorised)');
  if (hit === undefined) return { offset: 0, liveN: 0 };
  return { offset: hit.offset, liveN: hit.liveN };
}

/** The three multipliers, shared by the scorer and the held-out check. */
export function multipliers(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains - 1);
  const breadthMult = 1 + model.breadth_step * extraChains;
  return { growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The base value of one protocol: the log-average of the two estimators, before the multipliers. */
export function baseValue(
  protocol: SnapshotProtocol,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { medianValue: number; curveValue: number; base: number; baseMultiple: number; categoryLiveN: number; curveOffsetValue: number } {
  const { multiple: baseMultiple, liveN: categoryLiveN } = categoryMultiple(protocol.category, calibration, model);
  const medianValue = Math.max(1, protocol.tvl_usd * baseMultiple);
  const { offset: curveOffsetValue } = curveOffset(protocol.category, calibration);
  const curveValue = Math.max(
    1,
    10 ** (calibration.curveIntercept + calibration.curveSlope * Math.log10(protocol.tvl_usd) + curveOffsetValue),
  );
  const w = model.blend_weight;
  const base = 10 ** (w * Math.log10(curveValue) + (1 - w) * Math.log10(medianValue));
  return { medianValue, curveValue, base, baseMultiple, categoryLiveN, curveOffsetValue };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): {
  implied: number;
  baseMultiple: number;
  categoryLiveN: number;
  medianValue: number;
  curveValue: number;
  baseValue: number;
  curveOffset: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const b = baseValue(protocol, calibration, model);
  const m = multipliers(protocol, asOf, model);
  const implied = Math.max(1, Math.round(b.base * m.growthMult * m.maturityMult * m.breadthMult));
  return {
    implied,
    baseMultiple: b.baseMultiple,
    categoryLiveN: b.categoryLiveN,
    medianValue: b.medianValue,
    curveValue: b.curveValue,
    baseValue: b.base,
    curveOffset: b.curveOffsetValue,
    growthPct: m.growthPct,
    growthMult: m.growthMult,
    maturityMult: m.maturityMult,
    breadthMult: m.breadthMult,
    age: m.age,
  };
}

/**
 * The held-out check: the live-token protocols, sorted by slug and split
 * into VALIDATION_FOLDS folds, are scored five times over — each time the
 * two estimators are fitted on four folds and the fifth is predicted, with
 * the full model and with the base alone. Deterministic: the same snapshot
 * always gives the same numbers. The check is a calibration check, not a
 * proof: it says how well the model predicts tokens that already trade, so
 * the board's claims about tokens that do not exist yet are grounded in
 * something measured.
 */
export function validateCalibration(snapshot: Snapshot, model: ModelConstants = MODEL): ValidationResult {
  const live = [...liveProtocols(snapshot)].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const folds = VALIDATION_FOLDS;
  const absErr: number[] = [];
  const absErrBase: number[] = [];
  const bias: number[] = [];
  let within2 = 0;
  let within3 = 0;
  let within2Base = 0;
  let prec10Sum = 0;
  let prec20Sum = 0;
  let prec10Folds = 0;
  let prec20Folds = 0;
  for (let f = 0; f < folds; f++) {
    const test = live.filter((_, i) => i % folds === f);
    const train = live.filter((_, i) => i % folds !== f);
    if (test.length === 0 || train.length === 0) continue;
    const cal = calibrateProtocols(train, model);
    const scored = test.map((p) => {
      const b = baseValue(p, cal, model);
      const m = multipliers(p, snapshot.as_of, model);
      return {
        slug: p.slug,
        actual: p.mcap_usd!,
        predicted: Math.max(1, b.base * m.growthMult * m.maturityMult * m.breadthMult),
        base: Math.max(1, b.base),
      };
    });
    for (const s of scored) {
      const err = Math.log10(s.predicted / s.actual);
      absErr.push(Math.abs(err));
      bias.push(err);
      if (Math.abs(err) <= Math.log10(2)) within2++;
      if (Math.abs(err) <= Math.log10(3)) within3++;
      const errBase = Math.log10(s.base / s.actual);
      absErrBase.push(Math.abs(errBase));
      if (Math.abs(errBase) <= Math.log10(2)) within2Base++;
    }
    const topPred = new Set(
      [...scored].sort((a, b) => b.predicted - a.predicted).slice(0, 10).map((s) => s.slug),
    );
    const topActual = new Set(
      [...scored].sort((a, b) => b.actual - a.actual).slice(0, 10).map((s) => s.slug),
    );
    prec10Sum += [...topPred].filter((s) => topActual.has(s)).length / Math.min(10, scored.length);
    prec10Folds++;
    const topPred20 = new Set(
      [...scored].sort((a, b) => b.predicted - a.predicted).slice(0, 20).map((s) => s.slug),
    );
    const topActual20 = new Set(
      [...scored].sort((a, b) => b.actual - a.actual).slice(0, 20).map((s) => s.slug),
    );
    prec20Sum += [...topPred20].filter((s) => topActual20.has(s)).length / Math.min(20, scored.length);
    prec20Folds++;
  }
  const n = absErr.length;
  const medAbs = median(absErr);
  const medAbsBase = median(absErrBase);
  // Spearman rank correlation over all held-out predictions.
  const all = live.map((p) => p);
  const scoredAll: { predicted: number; actual: number }[] = [];
  for (let f = 0; f < folds; f++) {
    const test = all.filter((_, i) => i % folds === f);
    const train = all.filter((_, i) => i % folds !== f);
    if (test.length === 0 || train.length === 0) continue;
    const cal = calibrateProtocols(train, model);
    for (const p of test) {
      const b = baseValue(p, cal, model);
      const m = multipliers(p, snapshot.as_of, model);
      scoredAll.push({ predicted: Math.max(1, b.base * m.growthMult * m.maturityMult * m.breadthMult), actual: p.mcap_usd! });
    }
  }
  const spearman = rankCorrelation(
    scoredAll.map((s) => s.predicted),
    scoredAll.map((s) => s.actual),
  );
  return {
    n,
    folds,
    median_abs_log10: round4(medAbs),
    median_abs_factor: round4(10 ** medAbs),
    within_2x: n === 0 ? 0 : round4(within2 / n),
    within_3x: n === 0 ? 0 : round4(within3 / n),
    bias_log10: round4(median(bias)),
    spearman: round4(spearman),
    precision_at_10: prec10Folds === 0 ? 0 : round4(prec10Sum / prec10Folds),
    precision_at_20: prec20Folds === 0 ? 0 : round4(prec20Sum / prec20Folds),
    base_median_abs_log10: round4(medAbsBase),
    base_within_2x: n === 0 ? 0 : round4(within2Base / n),
  };
}

/** Spearman rank correlation of two equal-length arrays. */
function rankCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const ranks = (v: number[]): number[] => {
    const order = v.map((_, i) => i).sort((a, b) => v[a]! - v[b]!);
    const r = new Array<number>(n);
    for (let pos = 0; pos < n; pos++) r[order[pos]!] = pos + 1;
    return r;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A name that marks a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories that are a wrapped, bridged or exchange product rather than a protocol of their own. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchanges whose name at the start of a protocol name marks a product of that exchange. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not a wrapped/bridged/exchange product, not a versioned pool, and not a product line of a protocol whose token already trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (PARENT_TOKEN_CHILDREN.has(p.slug)) return false;
  return true;
}

/**
 * Product lines DefiLlama records under a parent protocol whose token already
 * trades, so they are not protocols still waiting on a launch of their own —
 * the same rule the house used to draw the watchlist, applied where the
 * snapshot's own fields cannot see it (the snapshot carries no parent field).
 * Verified 2026-11-15 against DefiLlama's public protocol list
 * (api.llama.fi/protocols): solv-strategies under Solv (SOLV), ipor-fusion
 * under IPOR (IPOR), usdcx and circle-gateway under Circle (USDC),
 * gmx-solana under GMX (GMX), boros under Pendle (PENDLE). Eligibility only;
 * the value model never reads this set, and no implied value is set by hand.
 */
const PARENT_TOKEN_CHILDREN = new Set([
  'solv-strategies',
  'ipor-fusion',
  'usdcx',
  'circle-gateway',
  'gmx-solana',
  'boros',
]);

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is ranked, whatever its
  // own record says — the house's rule already filtered it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, above or below
  // the watchlist floor, by TVL, capped. The floor never hid a big launch:
  // a $2.7B curator the list leaves out is a better find than a $5M one
  // below it. Never a replacement for a watchlist row.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    origin: snapshot.watchlist.includes(s.p.slug)
      ? 'watchlist'
      : s.p.tvl_usd >= snapshot.floor_usd
        ? 'early-above'
        : 'early-below',
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: round4(s.baseMultiple),
      category_live_n: s.categoryLiveN,
      median_value_usd: Math.round(s.medianValue),
      curve_value_usd: Math.round(s.curveValue),
      base_value_usd: Math.round(s.baseValue),
      curve_offset: round4(s.curveOffset),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The weekly qualifying action for the protocol's category, sized to the farm's capital. */
function weeklyActionFor(p: SnapshotProtocol, weekly: number): string {
  const c = (p.category ?? '').toLowerCase();
  const amt = `$${weekly}`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `supply or borrow ${amt} more, or repay ${amt} of the loan, so the position moves every week`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return `swap ${amt} through the pool or add ${amt} of liquidity, then leave it in place`;
  if (c.includes('bridge')) return `bridge ${amt} to the other side and use it in one app there`;
  if (c.includes('staking') || c.includes('restak')) return `stake ${amt} more, or claim the rewards and re-stake them`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `open and close one small hedged position of about ${amt}`;
  if (c.includes('prediction')) return `place one market position of about ${amt}`;
  if (c.includes('curator') || c.includes('allocator'))
    return `deposit ${amt} into a vault or rebalance one vault position by ${amt}`;
  if (c.includes('stable')) return `mint, deposit or redeem ${amt} of the stable asset`;
  if (c.includes('rwa')) return `mint or transfer ${amt} of the yield asset`;
  if (c.includes('insurance')) return `top up the cover by ${amt}`;
  if (c.includes('basis')) return `check the vault funding and top up or rebalance ${amt}`;
  if (c.includes('liquidity manager')) return `check the vault range and rebalance ${amt} if it moved`;
  if (c.includes('cedefi')) return `check the vault balance and compound or top up ${amt}`;
  if (c.includes('btc')) return `check the BTC position and claim or top up ${amt}`;
  if (c.includes('governance')) return `vote in the week's governance round, or top up the vault by ${amt}`;
  if (c.includes('payment')) return `make one payment of about ${amt} through it`;
  if (c.includes('card')) return `spend about ${amt} through the card`;
  if (c.includes('otc')) return `adjust one listing by ${amt}`;
  if (c.includes('index')) return `check the index rebalance and top up ${amt}`;
  if (c.includes('chain')) return `make one transaction of about ${amt} in an app on the chain`;
  if (c.includes('farm')) return `claim the farm rewards and re-stake ${amt} of them`;
  return `make one deposit, swap or vote of about ${amt}`;
}

/**
 * The one thing that ruins this category's farm: the guardrail that belongs
 * in the plan itself, not in a footnote. It is the same rule for every
 * protocol in the category, never a judgement about one name.
 */
function qualifierFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return 'Keep the borrow below 40% of the supply, so a price dip cannot liquidate the farm wallet.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    return 'Stay in the pair the app lists first; if the pool uses a narrow range, check it weekly so it does not sit out of range.';
  if (c.includes('perpetual') || c.includes('derivative'))
    return 'Keep leverage at 2x or less and the margin in USDC, so one wick cannot wipe the position.';
  if (c.includes('staking') || c.includes('restak'))
    return 'Keep the receipt token in the same wallet as the stake; moving it to another wallet can break the trail.';
  if (c.includes('bridge'))
    return 'Bridge in one direction per week and use the funds on the other side; bridging straight back looks like wash activity.';
  if (c.includes('curator') || c.includes('allocator'))
    return 'Pick one vault and stay in it; hopping vaults every week splits the activity across positions.';
  if (c.includes('stable') || c.includes('rwa') || c.includes('basis'))
    return 'Hold the asset itself rather than its receipt in a second protocol, so the position stays in this protocol\'s books.';
  if (c.includes('prediction'))
    return 'Bet on markets you can price, not every market; one resolved position a week beats ten open ones.';
  if (c.includes('card') || c.includes('payment'))
    return 'Spend on real purchases, not on sending money to yourself; self-payments are the first thing a filter flags.';
  if (c.includes('insurance'))
    return 'Keep the policy active for the whole hold, not just the week you buy it.';
  return 'Keep the whole position in the one farming wallet, from deposit to claim.';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  let action: string;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    action = `Supply $${capital} of USDC to ${name} on ${chain}, borrow no more than 40% of it, and keep the position open.`;
  else if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm'))
    action = `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, in the pair the app lists first, and keep the position open.`;
  else if (c.includes('bridge'))
    action = `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in an app on the other side.`;
  else if (c.includes('staking') || c.includes('restak'))
    action = `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  else if (c.includes('perpetual') || c.includes('derivative'))
    action = `Deposit $${capital} of USDC as margin on ${name} and open one small hedge, no more than 2x leverage.`;
  else if (c.includes('prediction'))
    action = `Fund $${capital} on ${name} and place one market position of at most $${Math.max(10, Math.floor(capital / 5))}.`;
  else if (c.includes('curator') || c.includes('allocator'))
    action = `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  else if (c.includes('stable'))
    action = `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  else if (c.includes('rwa'))
    action = `Mint $${capital} of the protocol's yield asset on ${chain} and hold it in the farming wallet.`;
  else if (c.includes('insurance'))
    action = `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  else if (c.includes('basis'))
    action = `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and hold the vault position.`;
  else if (c.includes('liquidity manager'))
    action = `Deposit $${capital} into a ${name} managed-liquidity vault on ${chain} and keep the vault shares in the same wallet.`;
  else if (c.includes('cedefi'))
    action = `Deposit $${capital} of USDC into ${name}'s CeDeFi vault on ${chain} and keep the position open.`;
  else if (c.includes('btc'))
    action = `Deposit $${capital} of BTC into ${name} on ${chain} and keep the receipt in the farming wallet.`;
  else if (c.includes('governance'))
    action = `Deposit $${capital} of USDC into ${name}'s incentive vault on ${chain} and vote in one governance round.`;
  else if (c.includes('payment'))
    action = `Fund $${capital} on ${name} on ${chain} and make one payment through it.`;
  else if (c.includes('card'))
    action = `Load $${capital} onto a ${name} card on ${chain} and spend a little through it.`;
  else if (c.includes('otc'))
    action = `Place $${capital} of USDC in one ${name} OTC listing on ${chain} and keep the listing open.`;
  else if (c.includes('index'))
    action = `Buy $${capital} of the ${name} index on ${chain} and hold the index tokens.`;
  else if (c.includes('chain'))
    action = `Bridge $${capital} of USDC to ${chain} through its canonical bridge, then use it in one app on ${chain}.`;
  else if (c.includes('farm'))
    action = `Deposit $${capital} of USDC into ${name}'s farm on ${chain} and keep the position open.`;
  else action = `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  // A protocol on more than one chain rewards a second position: the same
  // wallet, the same size split, on the second chain the snapshot lists.
  if (p.chains.length > 1) {
    action += ` The protocol also runs on ${p.chains[1]}; a second position there, with half the capital, counts as separate activity.`;
  }
  return `${action} ${qualifierFor(p)}`;
}

/**
 * What one DeFi transaction costs in gas on a chain, in US dollars — a rough
 * public figure per chain, never per protocol, so a Solana farm does not pay
 * Ethereum's gas in its plan. Every chain the board's rows name is priced
 * here; a chain the table does not name costs $2, deliberately high, so an
 * unknown chain's plan overstates its cost rather than understating it.
 */
const GAS_USD: Record<string, number> = {
  Ethereum: 6,
  Solana: 0.01,
  Base: 0.05,
  Arbitrum: 0.1,
  Optimism: 0.05,
  Binance: 0.3,
  Avalanche: 0.3,
  Polygon: 0.05,
  'zkSync Era': 0.1,
  Linea: 0.05,
  Scroll: 0.1,
  Mantle: 0.05,
  Blast: 0.05,
  Sei: 0.05,
  Sui: 0.02,
  Aptos: 0.02,
  Starknet: 0.1,
  Berachain: 0.05,
  Sonic: 0.05,
  'Hyperliquid L1': 0.01,
  Tron: 1,
  Bitcoin: 2,
  Monad: 0.05,
  Unichain: 0.05,
  Ink: 0.05,
  'Plume Mainnet': 0.05,
  Katana: 0.05,
  'Robinhood Chain': 0.05,
  Arc: 0.05,
  Flare: 0.1,
  Tempo: 0.05,
  Stable: 0.05,
  'World Chain': 0.05,
  Celo: 0.05,
  xDai: 0.05,
  Fantom: 0.1,
  Cronos: 0.1,
  Kava: 0.1,
  TON: 0.1,
  Near: 0.02,
  Stellar: 0.01,
  Ripple: 0.01,
  Cardano: 0.3,
  Polkadot: 0.1,
  Cosmos: 0.05,
  Injective: 0.02,
  Corn: 0.05,
  Morph: 0.05,
  Plasma: 0.02,
  BOB: 0.05,
  Fluent: 0.05,
  Citrea: 0.05,
  Mezo: 0.05,
  Pharos: 0.05,
  Etherlink: 0.05,
  Bittensor: 0.05,
  'Bittensor EVM': 0.05,
  'XRPL EVM': 0.05,
  Hemi: 0.05,
  Bitlayer: 0.1,
  CORE: 0.05,
  BSquared: 0.05,
  RSK: 0.05,
  Provenance: 0.05,
  TAC: 0.05,
  Rayls: 0.05,
  'Babylon Genesis': 0.05,
  Algorand: 0.01,
  Noble: 0.02,
  Sophon: 0.05,
  'Elysium Kinetiq': 0.05,
  Peaq: 0.02,
  MegaETH: 0.01,
  Pulse: 0.05,
  Soneium: 0.05,
  Fraxtal: 0.05,
  Mode: 0.05,
  'BOT Chain': 0.05,
  Telos: 0.02,
  MetalL2: 0.05,
  ZetaChain: 0.05,
  Lisk: 0.05,
  Manta: 0.05,
  Zcash: 0.05,
  Doge: 0.1,
  Litecoin: 0.05,
  Story: 0.05,
  'X Layer': 0.05,
  Aleo: 0.05,
  XION: 0.02,
  Nibiru: 0.02,
  Metis: 0.05,
  Zircuit: 0.05,
  Filecoin: 0.1,
  ApeChain: 0.05,
  Taiko: 0.05,
  zkLink: 0.05,
  Evmos: 0.05,
  ThunderCore: 0.02,
  'Polygon zkEVM': 0.05,
  Astar: 0.05,
  Moonbeam: 0.05,
  Saga: 0.02,
  Ronin: 0.05,
  RISE: 0.02,
  Op_Bnb: 0.05,
  Hibachi: 0.05,
  'Reya Network': 0.05,
  Qubic: 0.02,
  Goat: 0.05,
  Flow: 0.02,
  Proton: 0.02,
  Strato: 0.05,
  Klaytn: 0.05,
  Plume: 0.05,
  'Bifrost Network': 0.05,
  HeLa: 0.05,
  ZIGChain: 0.05,
  Stacks: 0.1,
  Swellchain: 0.05,
  Canton: 0.05,
};

/** The gas for one transaction on `chain`, as a dollar string. */
function gasFor(chain: string): string {
  const usd = GAS_USD[chain] ?? 2;
  return `$${usd < 1 ? usd.toFixed(2) : String(usd)}`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. Every step names what it
 * costs and how long it takes; the second step carries the category's
 * guardrail, the third names the weekly amount, and the fifth names when to
 * claim and where a claim link must come from.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weekly = Math.max(10, Math.floor(capital / 5));
  const action = actionFor(p, capital, chain);
  const weeklyAction = weeklyActionFor(p, weekly);
  const gas = gasFor(chain);
  return [
    {
      text: `Use a fresh wallet that holds only the $${capital} you plan to farm, and keep its seed phrase offline on paper, never in a chat or a screenshot.`,
      cost: `about ${gas} of gas for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week: ${weeklyAction}.`,
      cost: `about ${gas} of gas a week, plus the $${weekly} you move`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and check the protocol's own points or rewards page once a week; if a quest or task board appears, do that week's task the same day.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `After ${hold} days, open the points or rewards page from a link the protocol itself publishes on its own site or docs, and claim only there — a real claim costs gas only, and a claim link from a direct message, a reply or an ad is a scam.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, farm steps included so the page needs no second source. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    origin: row.origin,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_multiple: row.model.base_multiple,
    category_live_n: row.model.category_live_n,
    median_value_usd: row.model.median_value_usd,
    curve_value_usd: row.model.curve_value_usd,
    base_value_usd: row.model.base_value_usd,
    curve_offset: row.model.curve_offset,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.origin !== 'watchlist');
  const calibration = calibrate(snapshot, model);
  const validation = validateCalibration(snapshot, model);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early.length,
    early_above_floor: early.filter((r) => r.origin === 'early-above').length,
    early_below_floor: early.filter((r) => r.origin === 'early-below').length,
    live_size: live.length,
    global_median_multiple: round4(calibration.globalMedian),
    size_curve: { intercept: round4(calibration.curveIntercept), slope: round4(calibration.curveSlope) },
    category_multiples: [...calibration.byCategory.entries()]
      .map(([category, v]) => ({ category, multiple: round4(v.multiple), live_n: v.liveN }))
      .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)),
    category_offsets: [...calibration.curveOffsets.entries()]
      .map(([category, v]) => ({ category, offset: round4(v.offset), live_n: v.liveN }))
      .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)),
    validation,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
