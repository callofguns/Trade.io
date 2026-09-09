import type { CardInstance } from "./Card.js";

/**
 * A player (human or bot - bots just have code deciding their moves instead
 * of a person). Holds the one thing every player has: cash, cards, shares.
 */
export class Player {
  readonly id: string;
  name: string;
  cash: number;
  cards: CardInstance[] = [];
  /** companyId -> number of shares held */
  shares: Map<string, number> = new Map();

  constructor(id: string, name: string, startingCash: number) {
    this.id = id;
    this.name = name;
    this.cash = startingCash;
  }

  addCard(card: CardInstance): void {
    this.cards.push(card);
  }

  removeCard(cardId: string): CardInstance {
    const idx = this.cards.findIndex((c) => c.id === cardId);
    if (idx === -1) throw new Error(`${this.name} does not own card ${cardId}`);
    return this.cards.splice(idx, 1)[0];
  }

  addShares(companyId: string, quantity: number): void {
    this.shares.set(companyId, (this.shares.get(companyId) ?? 0) + quantity);
  }

  removeShares(companyId: string, quantity: number): void {
    const current = this.shares.get(companyId) ?? 0;
    if (current < quantity) {
      throw new Error(`${this.name} only has ${current} shares of ${companyId}, tried to sell ${quantity}`);
    }
    this.shares.set(companyId, current - quantity);
  }
}
