import { PriceEngine } from "./Market.js";
import { Player } from "./Player.js";
import { StockMarket } from "./StockMarket.js";
import { AuctionHouse } from "./AuctionHouse.js";
import { type CardType, createCardInstance } from "./Card.js";
import type { Company } from "./Company.js";
import type { Bot } from "./Bot.js";

/**
 * The whole game world: holds every player, the two markets, and the bots.
 * `tick()` is one step of simulated time - every bot gets a turn to act,
 * any auctions whose time is up get resolved, and prices settle a little.
 */
export class Game {
  readonly priceEngine = new PriceEngine();
  readonly players = new Map<string, Player>();
  readonly stockMarket = new StockMarket(this.priceEngine);
  readonly auctionHouse: AuctionHouse;
  readonly cardTypes: CardType[] = [];
  readonly bots: Bot[] = [];
  currentTick = 0;

  constructor() {
    this.auctionHouse = new AuctionHouse(this.priceEngine, this.players);
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player);
  }

  addBot(bot: Bot): void {
    this.addPlayer(bot.player);
    this.bots.push(bot);
  }

  registerCardType(cardType: CardType, startingPrice: number): void {
    this.cardTypes.push(cardType);
    this.priceEngine.register(cardType.id, startingPrice);
  }

  giveStartingCard(player: Player, cardTypeId: string): void {
    player.addCard(createCardInstance(cardTypeId));
  }

  get companies(): Company[] {
    return this.stockMarket.getCompanies();
  }

  /** Advance the world by one step. */
  tick(): void {
    this.currentTick += 1;
    for (const bot of this.bots) {
      try {
        bot.act({
          priceEngine: this.priceEngine,
          stockMarket: this.stockMarket,
          auctionHouse: this.auctionHouse,
          companies: this.companies,
          cardTypes: this.cardTypes,
          currentTick: this.currentTick,
        });
      } catch {
        // Bot tried something it couldn't afford, or nothing to act on - skip its turn.
      }
    }
    this.auctionHouse.resolveAuctions(this.currentTick);
    this.priceEngine.tick();
  }
}
