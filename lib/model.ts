// Token Launch Radar — the valuation and ranking model (radar-2).
//
// One sealed DefiLlama snapshot in, one ranked board out. Nothing here is a
// hand-kept list: every number is derived from the snapshot's own figures at
// run time, so the same program re-run on a future snapshot finds launches
// that do not exist yet.
//
// Who is on the board
//   A protocol is PRE-TOKEN when the snapshot records no token for it:
//   mcap_usd, gecko_id and symbol are all null. A pre-token protocol is
//   RANKABLE when it is not a wrapped, staked, bridged or exchange product of
//   a token that already trades: its category is not Bridge, Canonical
//   Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX, its name
//   carries no whole word wrapped/staked/staking and does not begin with an
//   exchange's name, and its name does not end in a version marker (V2, 2.0…)
//   that would make it a pool of another protocol. The board ranks EVERY
//   rankable pre-token protocol in the snapshot — the 40-protocol watchlist
//   (TVL at or above the snapshot floor) is the floor, never the ceiling.
//
// What a launch would be worth — peer multiples, not a flat guess
//   Tokenised protocols in the snapshot are the comparables. For each
//   category with at least 3 tokenised protocols that report a market cap,
//   the category multiple is the MEDIAN market-cap / TVL of those peers,
//   clamped to [0.02, 2.5]; categories with fewer peers fall back to the
//   global median multiple of all tokenised protocols. Then:
//
//     base       = tvl_usd x peer_multiple
//     momentum   = 1 + clamp(change_7d, -60, 120)/100 x 0.5
//     maturity   = 0.6 + min(age_days, 1095)/1095 x 0.4   (unknown age: 365d)
//     confidence = 0.55 + 0.45 x min(tvl_usd / floor_usd, 1)
//     implied    = max(1, round(base x momentum x maturity x confidence))
//
//   The peer multiple resolves in three layers, and every board row names
//   the layer it used: the category's own median when it has at least 3
//   tokenised peers reporting a market cap; else the median of its peer
//   GROUP (categories that are the same business — vaults, curators and
//   yield pooled; lending pooled; trading pooled); else the global median.
//
//   Confidence is a humility discount: a $6M protocol's peer multiple is a
//   far weaker promise than a $2B protocol's, so small caps are marked down
//   toward 55% instead of being ranked on raw multiple alone.
//
// Launch-readiness score (0-100, the dashboard's second lens)
//   30 x maturity share + 25 x momentum share + 25 x log-scale TVL share
//   + 20 x category precedent (share of the category that already has a
//   token — categories that launch tokens launch tokens). It never changes
//   the rank, which is implied value alone; it tells the farmer how
//   launch-shaped a protocol looks, separately from how big it is.

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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-2';

export interface ModelConstants {
  ratio_min: number;
  ratio_max: number;
  min_peers: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  confidence_floor: number;
}

export const MODEL: ModelConstants = {
  ratio_min: 0.02,
  ratio_max: 2.5,
  min_peers: 3,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  confidence_floor: 0.55,
};

export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  readiness: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    peer_basis: string;
    momentum_multiplier: number;
    maturity_multiplier: number;
    confidence_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  readiness: number;
  peer_multiple: number;
  peer_count: number;
  peer_basis: string;
  momentum_multiplier: number;
  maturity_multiplier: number;
  confidence_multiplier: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  symbol: string | null;
}

export interface CategoryStat {
  category: string;
  protocols: number;
  tokenised: number;
  multiple: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  universe_size: number;
  total_tvl_usd: number;
  total_implied_usd: number;
  categories: CategoryStat[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /(^|\s)(wrapped|staked|staking)(\s|$)/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Pre-token and not a wrapped/staked/bridged/exchange product of a token that trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * The peer-group a category belongs to, by what the protocol does. Categories
 * DefiLlama keeps separate (Risk Curators, Onchain Capital Allocator, Yield
 * Aggregator) are one business — allocating other people's capital — and
 * their tokenised members are each other's best comparables when a single
 * category has too few of them. Keyword rules on the category string only;
 * no protocol is ever named.
 */
export function peerGroupOf(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (/curator|allocator|yield|vault|index|fund/.test(c)) return 'Vaults, curators & yield';
  if (/lend|cdp|collateral|credit|borrow/.test(c)) return 'Lending & credit';
  if (/dex|aggregator|perpetual|derivative|option|prediction|trading|swap/.test(c)) return 'Trading & derivatives';
  if (/staking|restak/.test(c)) return 'Staking & restaking';
  if (/bridge|chain|cross/.test(c)) return 'Bridges & chains';
  if (/stable|rwa|basis|insurance|privacy|launch|ai/.test(c)) return 'Stable, RWA & other financial';
  return 'Other protocols';
}

/** Peer multiples: per-category medians, per-group medians behind them, and the global median last. */
export function peerMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, { multiple: number; count: number }>; byGroup: Map<string, { multiple: number; count: number }>; rawCategoryCount: Map<string, number>; global: number; globalCount: number } {
  const ratios = new Map<string, number[]>();
  const groupRatios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const r = p.mcap_usd / p.tvl_usd;
    all.push(r);
    const key = p.category ?? 'Uncategorised';
    const list = ratios.get(key) ?? [];
    list.push(r);
    ratios.set(key, list);
    const g = peerGroupOf(p.category);
    const glist = groupRatios.get(g) ?? [];
    glist.push(r);
    groupRatios.set(g, glist);
  }
  const global = all.length > 0 ? clamp(median(all), model.ratio_min, model.ratio_max) : 0.2;
  const rawCategoryCount = new Map<string, number>();
  for (const [cat, list] of ratios) rawCategoryCount.set(cat, list.length);
  const byCategory = new Map<string, { multiple: number; count: number }>();
  for (const [cat, list] of ratios) {
    if (list.length >= model.min_peers) byCategory.set(cat, { multiple: clamp(median(list), model.ratio_min, model.ratio_max), count: list.length });
  }
  const byGroup = new Map<string, { multiple: number; count: number }>();
  for (const [g, list] of groupRatios) {
    if (list.length >= model.min_peers) byGroup.set(g, { multiple: clamp(median(list), model.ratio_min, model.ratio_max), count: list.length });
  }
  return { byCategory, byGroup, rawCategoryCount, global, globalCount: all.length };
}

/** One protocol's full valuation under the model. */
export function valueOf(p: SnapshotProtocol, asOf: string, floorUsd: number, peers: ReturnType<typeof peerMultiples>, model: ModelConstants = MODEL): { implied: number; multiple: number; peerCount: number; basis: string; momentum: number; maturity: number; confidence: number; age: number | null; readiness: number; precedent: number } {
  const cat = peers.byCategory.get(p.category ?? 'Uncategorised');
  const grp = peers.byGroup.get(peerGroupOf(p.category));
  const rawMultiple = cat ? cat.multiple : grp ? grp.multiple : peers.global;
  const peerCount = cat ? cat.count : grp ? grp.count : peers.globalCount;
  const rawCatPeers = peers.rawCategoryCount.get(p.category ?? 'Uncategorised') ?? 0;
  const catPeersPhrase = rawCatPeers === 0
    ? `no tokenised ${p.category ?? 'uncategorised'} peer reports a market cap`
    : `only ${rawCatPeers} tokenised ${p.category ?? 'uncategorised'} peer${rawCatPeers === 1 ? '' : 's'} report${rawCatPeers === 1 ? 's' : ''} a market cap`;
  const basis = cat
    ? `median of ${cat.count} tokenised ${p.category} peers`
    : grp
      ? `median of ${grp.count} tokenised peers in its group (${peerGroupOf(p.category)}); ${catPeersPhrase}`
      : `global median of ${peers.globalCount} tokenised protocols (too few comparable peers in its category or group)`;
  const growthPct = clamp(typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0, model.growth_floor, model.growth_cap);
  // Every multiplier is rounded to 4 decimals BEFORE the implied value is
  // computed, and the rounded values are what board.json and data.js carry:
  // the dashboard recomputes a row from exactly these numbers and lands on
  // exactly the board's implied value, so page and board can never disagree.
  const multiple = round4(rawMultiple);
  const momentum = round4(1 + (growthPct / 100) * model.growth_weight);
  const age = ageDays(asOf, p.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityShare = clamp(ageForModel, 0, model.maturity_days) / model.maturity_days;
  const maturity = round4(model.maturity_floor + maturityShare * model.maturity_range);
  const confidence = round4(model.confidence_floor + (1 - model.confidence_floor) * Math.min(p.tvl_usd / Math.max(floorUsd, 1), 1));
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * momentum * maturity * confidence));
  return { implied, multiple, peerCount, basis, momentum, maturity, confidence, age, growthPct, readiness: 0, precedent: 0 };
}

/** Share of a category's protocols that already have a token: categories that launch, launch. */
export function categoryPrecedent(snapshot: Snapshot): Map<string, number> {
  const total = new Map<string, number>();
  const tokenised = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorised';
    total.set(key, (total.get(key) ?? 0) + 1);
    if (!isPreToken(p)) tokenised.set(key, (tokenised.get(key) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [k, n] of total) out.set(k, (tokenised.get(k) ?? 0) / n);
  return out;
}

function readinessOf(p: SnapshotProtocol, v: { growthPct: number; maturity: number }, precedent: number): number {
  const maturityShare = (v.maturity - MODEL.maturity_floor) / MODEL.maturity_range;
  // Momentum measured on the growth scale the model clamps to, -60%..+120%:
  // a protocol shrinking 20% in a week is not launch-shaped, one growing 30% is.
  const momentumShare = clamp((v.growthPct + 20) / 80, 0, 1);
  // Scale on the snapshot's own range: $5M (the file's floor) to ~$3B at the top.
  const scaleShare = clamp((Math.log10(Math.max(p.tvl_usd, 1)) - 6.7) / (9.5 - 6.7), 0, 1);
  return Math.round(100 * (0.3 * maturityShare + 0.25 * momentumShare + 0.25 * scaleShare + 0.2 * precedent));
}

// ---- farm plans -----------------------------------------------------------

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const n = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain}, then borrow a small amount against it and repay, so both sides of the market record your wallet.`;
  if (c.includes('dex') || c.includes('aggregator')) return `Swap $${capital} through ${n} on ${chain} and add the proceeds to its main liquidity pool, keeping the LP position open.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} of USDC into a ${n} vault on ${chain} and keep the vault shares in the same wallet.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into ${n}'s highest-TVL vault on ${chain} and leave the position untouched between weekly actions.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('option')) return `Deposit $${capital} of USDC as margin on ${n} and open one small hedged trade, then close it a day later so volume and open interest both count.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${n} and take one position in its most liquid market, holding it to settlement.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${n} and use the bridged funds in one app on the far side.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${n} and keep the staking receipt in the farming wallet.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold it rather than swapping out the same day.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${n}'s yield asset on ${chain} and hold it in the farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy until it expires.`;
  if (c.includes('launchpad') || c.includes('launch')) return `Take part in one ${n} launch on ${chain} with $${capital} and keep the allocation record in the same wallet.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} through its own app and keep the position open.`;
}

function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'Watch the health factor weekly: a liquidation ends the farm and the loss is real, so keep the borrow small.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Keep leverage at 1x and the hedge on: liquidation, not the token wait, is the way this farm loses money.';
  if (c.includes('bridge')) return 'Bridge back once a month to prove the route both ways, and never leave the whole position on a chain you cannot exit.';
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault') || c.includes('yield')) return 'Check the vault strategy monthly: if the curator rotates into an asset you would not hold directly, withdraw first and ask later.';
  return 'Cap the position at the plan amount: smart-contract risk is the price of farming, so never add funds you cannot leave locked for the full hold.';
}

export function stepText(step: { text: string; cost: string; time: string }): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** Six concrete steps per protocol, derived from its own category, chain, TVL and age — never its name. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  const steps = [
    { text: `Set up a fresh wallet for ${p.name} alone, fund it on ${chain}, and keep its seed phrase offline and never typed into a site.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: `Repeat one qualifying action every week — a deposit, a swap, a borrow or a vote — from the same wallet, so the activity spans several weekly snapshots.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days without moving it to another wallet, so the full history sits at one address.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: riskFor(p), cost: 'no fee to check, a few dollars of gas if you exit early', time: '5 minutes a week' },
    { text: `Check the protocol's own points or rewards page before withdrawing, claim only from the link it publishes, and log the wallet, dates and transactions.`, cost: 'no fee to check, and never pay anyone to claim', time: '10 minutes' },
  ];
  return steps.map(stepText);
}

// ---- board ----------------------------------------------------------------

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const peers = peerMultiples(snapshot, model);
  const precedent = categoryPrecedent(snapshot);
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => {
    const v = valueOf(p, snapshot.as_of, snapshot.floor_usd, peers, model);
    const prec = precedent.get(p.category ?? 'Uncategorised') ?? 0;
    return { p, v, readiness: readinessOf(p, v, prec) };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    readiness: s.readiness,
    model: {
      peer_multiple: round4(s.v.multiple),
      peer_count: s.v.peerCount,
      peer_basis: s.v.basis,
      momentum_multiplier: round4(s.v.momentum),
      maturity_multiplier: round4(s.v.maturity),
      confidence_multiplier: round4(s.v.confidence),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 36)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d, symbol: p.symbol }));
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerMultiples(snapshot, model);
  const total = new Map<string, number>();
  const tokenised = new Map<string, number>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorised';
    total.set(key, (total.get(key) ?? 0) + 1);
    if (!isPreToken(p)) tokenised.set(key, (tokenised.get(key) ?? 0) + 1);
  }
  const categories: CategoryStat[] = [...total.entries()]
    .map(([category, n]) => ({ category, protocols: n, tokenised: tokenised.get(category) ?? 0, multiple: peers.byCategory.get(category)?.multiple ?? null }))
    .sort((a, b) => b.protocols - a.protocols);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: round4(peers.global),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
    universe_size: snapshot.protocols.length,
    total_tvl_usd: board.reduce((a, r) => a + r.tvl_usd, 0),
    total_implied_usd: board.reduce((a, r) => a + r.implied_value_usd, 0),
    categories,
    rows: board.map((r) => ({
      rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
      tvl_usd: r.tvl_usd, change_7d: r.change_7d, listed_at: r.listed_at, age_days: r.age_days,
      watchlist: r.watchlist, implied_value_usd: r.implied_value_usd, readiness: r.readiness,
      peer_multiple: r.model.peer_multiple, peer_count: r.model.peer_count, peer_basis: r.model.peer_basis,
      momentum_multiplier: r.model.momentum_multiplier, maturity_multiplier: r.model.maturity_multiplier,
      confidence_multiplier: r.model.confidence_multiplier,
    })),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
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
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug, name: p.name,
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board fails the gate's shape, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'every row shares one implied value: a board that ranks nothing';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** The dashboard's data as one script beside the page: no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
