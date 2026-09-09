/**
 * A running log of everything that happens in the market.
 *
 * Right now the UI reads this to show a live activity feed. In Stage 2 the
 * server will read the same log to broadcast events to every connected
 * player - which is why the markets report *events* rather than drawing
 * anything themselves.
 *
 * Events store ids, not display names. Whoever renders them decides how to
 * word things; the engine stays dumb about presentation.
 */

export type TradeEventKind =
  | "stock-buy"
  | "stock-sell"
  | "card-sold"
  | "card-listed"
  | "company-founded";

export interface TradeEvent {
  tick: number;
  kind: TradeEventKind;
  actorId: string;
  assetId: string;
  quantity: number;
  /** Price per unit at the moment of the trade. */
  price: number;
}

const MAX_EVENTS = 300;

export class TradeLog {
  private events: TradeEvent[] = [];
  private currentTick = 0;

  setTick(tick: number): void {
    this.currentTick = tick;
  }

  record(event: Omit<TradeEvent, "tick">): void {
    this.events.push({ ...event, tick: this.currentTick });
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  /** Most recent events first. */
  recent(limit = 40): TradeEvent[] {
    return this.events.slice(-limit).reverse();
  }

  get size(): number {
    return this.events.length;
  }
}
