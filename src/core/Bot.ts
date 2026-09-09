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

  /**
   * Shared card-trading behavior every personality can reuse, dialed by a
   * different appetite per personality. `bidMultiple` is how far above (or
   * below) market price this bot is willing to bid in an auction.
   */
  protected tradeCards(
    world: WorldSnapshot,
    buyChance: number,
    sellChance: number,
    bidMultiple: number
  ): void {
    for (const listing of world.auctionHouse.getListings()) {
      if (listing.sellerId === this.player.id) continue;

      if (listing.kind === "fixed") {
        if (this.player.cash >= listing.price && Math.random() < buyChance) {
          world.auctionHouse.buyFixed(this.player, listing.id);
        }
        continue;
      }

      // Open auction: bid market price x this bot's appetite, if it can afford it.
      if (Math.random() < buyChance * 0.6) {
        const bid = world.priceEngine.getPrice(listing.cardTypeId) * bidMultiple;
        if (bid >= listing.minBid && this.player.cash >= bid) {
          world.auctionHouse.placeBid(this.player, listing.id, bid);
        }
      }
    }

    if (this.player.cards.length > 0 && Math.random() < sellChance) {
      const card = this.player.cards[Math.floor(Math.random() * this.player.cards.length)];
      const price = world.priceEngine.getPrice(card.typeId);
      // Most sales are quick fixed-price flips; sometimes it's worth running
      // an auction and letting bidders fight over it.
      if (Math.random() < 0.35) {
        world.auctionHouse.listForAuction(this.player, card, price * 0.8, world.currentTick + 5);
      } else {
        world.auctionHouse.listFixedPrice(this.player, card, price);
      }
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
    this.tradeCards(world, /* buyChance */ 0.5, /* sellChance */ 0.05, /* bidMultiple */ 1.15);
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
    this.tradeCards(world, /* buyChance */ 0.15, /* sellChance */ 0.1, /* bidMultiple */ 0.92);
  }
}
