/**
 * The price engine - the shared "brain" behind both the card market and the
 * stock market. Neither market invents its own pricing rules; they both just
 * tell this engine "a trade happened" and ask it "what's the price now?".
 *
 * The model, in plain English:
 *  - Every buy nudges the price up a bit; every sell nudges it down a bit.
 *  - A bigger trade nudges price more than a small one, but we cap how much
 *    a single trade can move things, so one big order can't send a price to
 *    the moon (or to zero) in one shot.
 *  - Between trades, price drifts slowly back toward its recent baseline, so
 *    a price only keeps climbing if buying pressure *keeps happening* - it
 *    doesn't coast forever off one old trade.
 */

export type TradeSide = "buy" | "sell";

export interface PriceEngineOptions {
  /** How strongly a single trade moves the price. Higher = more volatile market. */
  sensitivity?: number;
  /** Max fraction a single trade can move the price by (e.g. 0.08 = 8%). */
  maxImpactPerTrade?: number;
  /** How fast price drifts back toward its baseline each tick (0-1, small = slow). */
  meanReversionRate?: number;
}

interface AssetState {
  price: number;
  /** A slow-moving average the price gets gently pulled toward over time. */
  baseline: number;
}

export class PriceEngine {
  private assets = new Map<string, AssetState>();
  private sensitivity: number;
  private maxImpactPerTrade: number;
  private meanReversionRate: number;

  constructor(options: PriceEngineOptions = {}) {
    this.sensitivity = options.sensitivity ?? 0.15;
    this.maxImpactPerTrade = options.maxImpactPerTrade ?? 0.08;
    this.meanReversionRate = options.meanReversionRate ?? 0.01;
  }

  /** Register a new tradable thing (a card type, or a company) with its starting price. */
  register(assetId: string, startingPrice: number): void {
    if (!this.assets.has(assetId)) {
      this.assets.set(assetId, { price: startingPrice, baseline: startingPrice });
    }
  }

  has(assetId: string): boolean {
    return this.assets.has(assetId);
  }

  getPrice(assetId: string): number {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error(`Unknown asset: ${assetId}`);
    return asset.price;
  }

  /**
   * Tell the engine a trade happened, so it can move the price.
   * `quantity` is how many units traded. `liquidity` is a rough measure of
   * "how much normal volume this asset sees" - a bigger number means the
   * same trade quantity moves the price less (think: a popular stock vs.
   * a barely-traded one).
   */
  recordTrade(assetId: string, side: TradeSide, quantity: number, liquidity = 10): void {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error(`Unknown asset: ${assetId}`);

    const direction = side === "buy" ? 1 : -1;
    let impact = direction * this.sensitivity * (quantity / liquidity);
    impact = Math.max(-this.maxImpactPerTrade, Math.min(this.maxImpactPerTrade, impact));

    asset.price = Math.max(0.01, asset.price * (1 + impact));
  }

  /** Call once per game tick to apply the slow drift back toward baseline. */
  tick(): void {
    for (const asset of this.assets.values()) {
      asset.price += (asset.baseline - asset.price) * this.meanReversionRate;
      asset.baseline += (asset.price - asset.baseline) * 0.1;
    }
  }
}
