# Trade.io

A live multiplayer trading game. Two markets, both with prices that move from
real trading activity:

- **Auction house** — collectible cards with rarity, sold at a fixed price or
  by auction.
- **Stock market** — companies any player can found. Founding costs cash, and
  that cash sets the opening share price.

Bots trade on both markets so it stays alive when few people are online.

## Run it

```bash
npm install     # one time
npm run web     # build + serve the app at http://localhost:5173
```

Or run the engine on its own, printing to the terminal:

```bash
npm start
```

## How it's put together

```
src/core/          The game engine - no UI, no server, just the rules
  Market.ts        Price engine: buys push price up, sells push it down
  Card.ts          Card types (priced) and card instances (owned)
  Company.ts       Player-founded companies
  Player.ts        Cash, cards, shares
  AuctionHouse.ts  Fixed-price listings and bidding
  StockMarket.ts   Founding companies, buying/selling shares
  Bot.ts           Aggressive and Cautious personalities
  Events.ts        Trade log - what the UI reads, and what the server will broadcast
  Game.ts          The world, and one tick of simulated time

web/               The client
  index.html       App shell
  styles.css       Design tokens and components
  app.ts           Renders the engine; see web/DESIGN.md for the design system

scripts/serve.mjs  Zero-dependency static server for local dev
```

Right now `web/app.ts` runs the engine **locally in your browser** — real bots,
real prices, no server needed. In the next stage the engine moves to a server and
the client swaps `game.tick()` for messages arriving over a WebSocket. Everything
below the render layer stays where it is.
