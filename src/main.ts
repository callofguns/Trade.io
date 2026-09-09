import { Game } from "./core/Game.js";
import { Player } from "./core/Player.js";
import { AggressiveBot, CautiousBot } from "./core/Bot.js";

const game = new Game();

// --- Card types (name, rarity, starting price) ---
game.registerCardType({ id: "fire-dragon", name: "Fire Dragon", rarity: "legendary" }, 500);
game.registerCardType({ id: "goblin", name: "Goblin", rarity: "common" }, 5);
game.registerCardType({ id: "silver-knight", name: "Silver Knight", rarity: "rare" }, 40);

// --- Bots, each with a personality and starting cash ---
const botConfigs: { name: string; make: (p: Player) => AggressiveBot | CautiousBot; cash: number }[] = [
  { name: "Rex (Aggressive)", make: (p) => new AggressiveBot(p), cash: 1000 },
  { name: "Nova (Aggressive)", make: (p) => new AggressiveBot(p), cash: 800 },
  { name: "Sage (Cautious)", make: (p) => new CautiousBot(p), cash: 1000 },
  { name: "Miko (Cautious)", make: (p) => new CautiousBot(p), cash: 900 },
];

botConfigs.forEach((cfg, i) => {
  const player = new Player(`bot-${i}`, cfg.name, cfg.cash);
  game.addBot(cfg.make(player));
  // Give each bot a couple of starter cards so there's something to trade early on.
  game.giveStartingCard(player, "goblin");
  game.giveStartingCard(player, "silver-knight");
});

// --- One bot founds a company to seed the stock market ---
const founder = game.players.get("bot-0")!;
const company = game.stockMarket.foundCompany(founder, "Rex Industries", 300);
console.log(
  `${founder.name} founded ${company.name} at $${game.priceEngine.getPrice(company.id).toFixed(2)}/share\n`
);

// --- Run the simulation ---
const TICKS = 30;
for (let t = 1; t <= TICKS; t++) {
  game.tick();
}

console.log(`=== After ${TICKS} ticks ===\n`);

console.log("-- Card prices --");
for (const cardType of game.cardTypes) {
  console.log(`  ${cardType.name} (${cardType.rarity}): $${game.priceEngine.getPrice(cardType.id).toFixed(2)}`);
}

console.log("\n-- Stock prices --");
for (const c of game.companies) {
  console.log(`  ${c.name}: $${game.priceEngine.getPrice(c.id).toFixed(2)}/share`);
}

console.log("\n-- Player standings --");
for (const player of game.players.values()) {
  const shareSummary =
    [...player.shares.entries()]
      .filter(([, qty]) => qty > 0)
      .map(([companyId, qty]) => `${qty} sh. of ${companyId}`)
      .join(", ") || "none";
  console.log(`  ${player.name}: $${player.cash.toFixed(2)} cash, ${player.cards.length} cards, shares: ${shareSummary}`);
}
