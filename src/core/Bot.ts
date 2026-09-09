import type { Player } from "./Player.js";
import type { PriceEngine } from "./Market.js";
import type { StockMarket } from "./StockMarket.js";
import type { AuctionHouse } from "./AuctionHouse.js";
import type { Company } from "./Company.js";
import type { CardType } from "./Card.js";

/** Everything a bot is allowed to see/touch when it's deciding what to do. */
export interface WorldSnapshot {
  priceEngine: PriceEngine;
  stockMarket: StockMarket;
  auctionHouse: AuctionHouse;
  companies: Company[];
  cardTypes: CardType[];
  currentTick: number;
}

/** Every bot personality just has to implement `act` - one turn of decisions. */
export abstract class Bot {
  constructor(public player: Player) {}
  abstract act(world: WorldSnapshot): void;

  /** Shared card-trading behavior every personality can reuse (with a different appetite). */
  protected tradeCards(world: WorldSnapshot, buyChance: number, sellChance: number): void {
    for (const listing of world.auctionHouse.getListings()) {
      if (listing.kind !== "fixed" || listing.sellerId === this.player.id) continue;
      if (this.player.cash >= listing.price && Math.random() < buyChance) {
        world.auctionHouse.buyFixed(this.player, listing.id);
      }
    }

    if (this.player.cards.length > 0 && Math.random() < sellChance) {
      const card = this.player.cards[Math.floor(Math.random() * this.player.cards.length)];
      const price = world.priceEngine.getPrice(card.typeId);
      world.auctionHouse.listFixedPrice(this.player, card, price);
    }
  }
}

/** Buys into hyped (rising) stocks and rare cards quickly, doesn't wait for a good price. */
export class AggressiveBot extends Bot {
  act(world: WorldSnapshot): void {
    for (const company of world.companies) {
      if (company.founderId === this.player.id) continue;
      const price = world.priceEngine.getPrice(company.id);
      const affordableQty = Math.floor((this.player.cash * 0.3) / price);
      if (affordableQty > 0 && Math.random() < 0.5) {
        world.stockMarket.buyShares(this.player, company, Math.max(1, Math.floor(affordableQty * 0.5)));
      }
    }
    this.tradeCards(world, /* buyChance */ 0.5, /* sellChance */ 0.03);
  }
}

/** Waits for prices to dip before buying, sells early to lock in gains. */
export class CautiousBot extends Bot {
  private stockEntryPrice = new Map<string, number>();

  act(world: WorldSnapshot): void {
    for (const company of world.companies) {
      if (company.founderId === this.player.id) continue;
      const price = world.priceEngine.getPrice(company.id);
      const entryPrice = this.stockEntryPrice.get(company.id);

      if (entryPrice && price > entryPrice * 1.1) {
        // Up 10%+ since we bought in - take the profit.
        const owned = this.player.shares.get(company.id) ?? 0;
        if (owned > 0) {
          world.stockMarket.sellShares(this.player, company, owned);
          this.stockEntryPrice.delete(company.id);
        }
      } else if (!entryPrice && Math.random() < 0.1) {
        // Occasionally test the water with a small buy.
        const qty = Math.floor((this.player.cash * 0.05) / price);
        if (qty > 0) {
          world.stockMarket.buyShares(this.player, company, qty);
          this.stockEntryPrice.set(company.id, price);
        }
      }
    }
    this.tradeCards(world, /* buyChance */ 0.15, /* sellChance */ 0.08);
  }
}
