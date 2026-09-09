export type Rarity = "common" | "rare" | "legendary";

/**
 * A *type* of card, e.g. "Fire Dragon". This is the thing that has a
 * market price - every physical copy of "Fire Dragon" shares one price,
 * the same way every share of "Apple" shares one price.
 */
export interface CardType {
  id: string;
  name: string;
  rarity: Rarity;
}

/** One physical card a player actually owns - an instance of a CardType. */
export interface CardInstance {
  id: string;
  typeId: string;
}

let cardInstanceCounter = 0;

export function createCardInstance(typeId: string): CardInstance {
  cardInstanceCounter += 1;
  return { id: `card-${cardInstanceCounter}`, typeId };
}
