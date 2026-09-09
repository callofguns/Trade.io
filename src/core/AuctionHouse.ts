import type { PriceEngine } from "./Market.js";
import type { Player } from "./Player.js";
import type { TradeLog } from "./Events.js";
import type { CardInstance } from "./Card.js";

interface FixedListing {
  kind: "fixed";
  id: string;
  cardTypeId: string;
  cardInstanceId: string;
  sellerId: string;
  price: number;
}

interface AuctionListing {
  kind: "auction";
  id: string;
  cardTypeId: string;
  cardInstanceId: string;
  sellerId: string;
  minBid: number;
  closesAtTick: number;
  bids: { bidderId: string; amount: number }[];
}

export type Listing = FixedListing | AuctionListing;

let listingCounter = 0;

/**
 * Where players trade cards. Two ways to sell:
 *  - Fixed price: name a price, first buyer to accept it gets the card.
 *  - Auction: name a minimum bid and a closing tick; highest bidder wins
 *    when time's up (bidding just means "add an offer to a list" - nothing
 *    happens until the auction closes).
 *
 * Every completed sale reports back to the price engine, so recent trading
 * activity is what actually moves a card type's market price.
 */
export class AuctionHouse {
  private listings = new Map<string, Listing>();

  constructor(
    private priceEngine: PriceEngine,
    private players: Map<string, Player>,
    private log?: TradeLog
  ) {}

  listFixedPrice(seller: Player, card: CardInstance, price: number): string {
    seller.removeCard(card.id);
    listingCounter += 1;
    const id = `listing-${listingCounter}`;
    this.listings.set(id, {
      kind: "fixed",
      id,
      cardTypeId: card.typeId,
      cardInstanceId: card.id,
      sellerId: seller.id,
      price,
    });
    this.log?.record({ kind: "card-listed", actorId: seller.id, assetId: card.typeId, quantity: 1, price });
    return id;
  }

  listForAuction(seller: Player, card: CardInstance, minBid: number, closesAtTick: number): string {
    seller.removeCard(card.id);
    listingCounter += 1;
    const id = `listing-${listingCounter}`;
    this.listings.set(id, {
      kind: "auction",
      id,
      cardTypeId: card.typeId,
      cardInstanceId: card.id,
      sellerId: seller.id,
      minBid,
      closesAtTick,
      bids: [],
    });
    this.log?.record({ kind: "card-listed", actorId: seller.id, assetId: card.typeId, quantity: 1, price: minBid });
    return id;
  }

  buyFixed(buyer: Player, listingId: string): void {
    const listing = this.listings.get(listingId);
    if (!listing || listing.kind !== "fixed") throw new Error(`No fixed listing ${listingId}`);
    if (buyer.cash < listing.price) throw new Error(`${buyer.name} can't afford ${listing.price}`);

    const seller = this.players.get(listing.sellerId);
    if (!seller) throw new Error(`Unknown seller ${listing.sellerId}`);

    buyer.cash -= listing.price;
    seller.cash += listing.price;
    buyer.addCard({ id: listing.cardInstanceId, typeId: listing.cardTypeId });

    this.priceEngine.recordTrade(listing.cardTypeId, "buy", 1);
    this.log?.record({
      kind: "card-sold",
      actorId: buyer.id,
      assetId: listing.cardTypeId,
      quantity: 1,
      price: listing.price,
    });
    this.listings.delete(listingId);
  }

  placeBid(bidder: Player, listingId: string, amount: number): void {
    const listing = this.listings.get(listingId);
    if (!listing || listing.kind !== "auction") throw new Error(`No auction listing ${listingId}`);
    if (amount < listing.minBid) throw new Error(`Bid below minimum of ${listing.minBid}`);
    if (bidder.cash < amount) throw new Error(`${bidder.name} can't afford a bid of ${amount}`);
    listing.bids.push({ bidderId: bidder.id, amount });
  }

  /** Call once per tick - closes any auctions whose time is up. */
  resolveAuctions(currentTick: number): void {
    for (const listing of [...this.listings.values()]) {
      if (listing.kind !== "auction" || currentTick < listing.closesAtTick) continue;

      const winner = listing.bids.reduce<{ bidderId: string; amount: number } | null>(
        (best, bid) => (!best || bid.amount > best.amount ? bid : best),
        null
      );

      if (winner) {
        const buyer = this.players.get(winner.bidderId);
        const seller = this.players.get(listing.sellerId);
        if (buyer && seller) {
          buyer.cash -= winner.amount;
          seller.cash += winner.amount;
          buyer.addCard({ id: listing.cardInstanceId, typeId: listing.cardTypeId });
          this.priceEngine.recordTrade(listing.cardTypeId, "buy", 1);
          this.log?.record({
            kind: "card-sold",
            actorId: buyer.id,
            assetId: listing.cardTypeId,
            quantity: 1,
            price: winner.amount,
          });
        }
      } else {
        // No bids came in - card goes back to the seller, unsold.
        const seller = this.players.get(listing.sellerId);
        seller?.addCard({ id: listing.cardInstanceId, typeId: listing.cardTypeId });
      }
      this.listings.delete(listing.id);
    }
  }

  getListing(listingId: string): Listing | undefined {
    return this.listings.get(listingId);
  }

  getListings(): Listing[] {
    return [...this.listings.values()];
  }
}
