/**
 * Trade.io - browser client.
 *
 * This imports the real game engine from src/core and runs it locally in the
 * browser: real bots, real price engine, real auction house. In Stage 2 the
 * engine moves to a server and this file swaps `game.tick()` for messages
 * arriving over a WebSocket. Everything below the render layer stays put.
 */

import { Game } from "../src/core/Game.js";
import { Player } from "../src/core/Player.js";
import { AggressiveBot, CautiousBot } from "../src/core/Bot.js";
import type { Company } from "../src/core/Company.js";
import type { CardType, Rarity } from "../src/core/Card.js";
import type { Listing } from "../src/core/AuctionHouse.js";

/* ------------------------------------------------------------------ world */

const TICK_MS = 1400;
const HISTORY_POINTS = 40;

const game = new Game();

game.registerCardType({ id: "fire-dragon", name: "Fire Dragon", rarity: "legendary" }, 500);
game.registerCardType({ id: "silver-knight", name: "Silver Knight", rarity: "rare" }, 40);
game.registerCardType({ id: "goblin", name: "Goblin", rarity: "common" }, 5);
game.registerCardType({ id: "tide-oracle", name: "Tide Oracle", rarity: "rare" }, 62);
game.registerCardType({ id: "copper-scout", name: "Copper Scout", rarity: "common" }, 9);

const you = new Player("you", "You", 2500);
game.addPlayer(you);
game.giveStartingCard(you, "silver-knight");
game.giveStartingCard(you, "goblin");

const botSetup: { name: string; kind: "aggressive" | "cautious"; cash: number }[] = [
  { name: "Rex", kind: "aggressive", cash: 1400 },
  { name: "Nova", kind: "aggressive", cash: 1100 },
  { name: "Sage", kind: "cautious", cash: 1600 },
  { name: "Miko", kind: "cautious", cash: 1200 },
  { name: "Juno", kind: "aggressive", cash: 900 },
];

botSetup.forEach((cfg, i) => {
  const p = new Player(`bot-${i}`, cfg.name, cfg.cash);
  game.addBot(cfg.kind === "aggressive" ? new AggressiveBot(p) : new CautiousBot(p));
  game.giveStartingCard(p, "goblin");
  game.giveStartingCard(p, "copper-scout");
  if (i % 2 === 0) game.giveStartingCard(p, "silver-knight");
  if (i === 0) game.giveStartingCard(p, "fire-dragon");
  if (i === 3) game.giveStartingCard(p, "tide-oracle");
});

game.stockMarket.foundCompany(game.players.get("bot-0")!, "Rex Salvage", 420);
game.stockMarket.foundCompany(game.players.get("bot-2")!, "Sage & Co.", 780);

/* --------------------------------------------------------------- utilities */

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compactMoney = (n: number): string =>
  n >= 10000 ? `$${(n / 1000).toFixed(1)}k` : money(n);

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const cardTypeById = new Map(game.cardTypes.map((c) => [c.id, c]));
const assetName = (assetId: string): string =>
  cardTypeById.get(assetId)?.name ?? game.stockMarket.getCompany(assetId)?.name ?? assetId;
const playerName = (playerId: string): string => game.players.get(playerId)?.name ?? playerId;

/** Price history per asset, sampled once per tick. Feeds the sparklines. */
const history = new Map<string, number[]>();

function sampleHistory(): void {
  const ids = [...game.cardTypes.map((c) => c.id), ...game.companies.map((c) => c.id)];
  for (const id of ids) {
    const series = history.get(id) ?? [];
    series.push(game.priceEngine.getPrice(id));
    if (series.length > HISTORY_POINTS) series.shift();
    history.set(id, series);
  }
}

/** Percentage change across the visible history window. */
function deltaPct(assetId: string): number {
  const series = history.get(assetId);
  if (!series || series.length < 2) return 0;
  const first = series[0];
  return first === 0 ? 0 : ((series[series.length - 1] - first) / first) * 100;
}

function direction(pct: number): "up" | "down" | "flat" {
  if (pct > 0.05) return "up";
  if (pct < -0.05) return "down";
  return "flat";
}

/** Direction is carried by a glyph and a sign, never by colour alone. */
function deltaLabel(pct: number): string {
  const dir = direction(pct);
  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
  return dir === "flat" ? glyph : `${glyph} ${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function sparkPath(series: number[] | undefined): string {
  if (!series || series.length < 2) return "";
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  return series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * 68;
      const y = 22 - ((v - min) / span) * 20;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const rarityColor: Record<Rarity, string> = {
  common: "var(--common)",
  rare: "var(--rare)",
  legendary: "var(--legendary)",
};

function netWorth(): number {
  let total = you.cash;
  for (const [companyId, qty] of you.shares) {
    if (qty > 0) total += game.priceEngine.getPrice(companyId) * qty;
  }
  for (const card of you.cards) total += game.priceEngine.getPrice(card.typeId);
  return total;
}

/* -------------------------------------------------------------- certificate */

interface CertRefs {
  root: HTMLButtonElement;
  price: HTMLElement;
  delta: HTMLElement;
  spark: SVGPathElement;
  meta: HTMLElement;
  lastPrice: number;
}

function buildCert(opts: {
  name: string;
  metaHtml: string;
  foil: string;
  onOpen: () => void;
  ariaLabel: string;
}): CertRefs {
  const root = document.createElement("button");
  root.className = "cert";
  root.type = "button";
  root.style.setProperty("--foil", opts.foil);
  root.setAttribute("aria-label", opts.ariaLabel);
  root.innerHTML = `
    <span class="cert__main">
      <span class="cert__name"></span>
      <span class="cert__meta"></span>
    </span>
    <span class="cert__spark">
      <svg class="spark" viewBox="0 0 68 24" preserveAspectRatio="none" aria-hidden="true"><path/></svg>
    </span>
    <span class="cert__side">
      <span class="num cert__price"></span>
      <span class="cert__delta"></span>
    </span>`;
  (root.querySelector(".cert__name") as HTMLElement).textContent = opts.name;
  (root.querySelector(".cert__meta") as HTMLElement).innerHTML = opts.metaHtml;
  root.addEventListener("click", opts.onOpen);

  return {
    root,
    price: root.querySelector(".cert__price") as HTMLElement,
    delta: root.querySelector(".cert__delta") as HTMLElement,
    spark: root.querySelector(".spark path") as SVGPathElement,
    meta: root.querySelector(".cert__meta") as HTMLElement,
    lastPrice: 0,
  };
}

/** Updates only the values that change - no re-parsing HTML on every tick. */
function refreshCert(refs: CertRefs, assetId: string, metaHtml?: string): void {
  const price = game.priceEngine.getPrice(assetId);
  const pct = deltaPct(assetId);
  const dir = direction(pct);

  if (refs.lastPrice && price !== refs.lastPrice) {
    const moved = price > refs.lastPrice ? "up" : "down";
    refs.price.dataset.flash = moved;
    window.setTimeout(() => delete refs.price.dataset.flash, 200);
  }
  refs.lastPrice = price;

  refs.price.textContent = money(price);
  refs.delta.textContent = deltaLabel(pct);
  refs.delta.dataset.dir = dir;
  refs.spark.setAttribute("d", sparkPath(history.get(assetId)));
  refs.spark.style.stroke =
    dir === "up" ? "var(--jade)" : dir === "down" ? "var(--ember)" : "var(--bone-mute)";
  if (metaHtml !== undefined) refs.meta.innerHTML = metaHtml;
}

/* ----------------------------------------------------------------- market */

const marketList = el("market-list");
const marketRefs = new Map<string, CertRefs>();

function companyMeta(company: Company): string {
  const owned = you.shares.get(company.id) ?? 0;
  return owned > 0
    ? `<span>You hold ${owned}</span>`
    : `<span>Founded by ${playerName(company.founderId)}</span>`;
}

function syncMarket(): void {
  for (const company of game.companies) {
    if (!marketRefs.has(company.id)) {
      const refs = buildCert({
        name: company.name,
        metaHtml: companyMeta(company),
        foil: "var(--brass)",
        ariaLabel: `${company.name}, trade shares`,
        onOpen: () => openStockSheet(company),
      });
      marketRefs.set(company.id, refs);
      marketList.insertBefore(refs.root, foundCta);
    }
    refreshCert(marketRefs.get(company.id)!, company.id, companyMeta(company));
  }
  el("market-note").textContent = `${game.companies.length} listed`;
}

const foundCta = document.createElement("button");
foundCta.className = "found-cta";
foundCta.type = "button";
foundCta.innerHTML = `<span><strong>Found a company</strong><span>Your capital sets the opening share price</span></span><span class="num" aria-hidden="true">+</span>`;
foundCta.addEventListener("click", openFoundSheet);

/* ------------------------------------------------------------------ cards */

const cardsList = el("cards-list");
const cardRefs = new Map<string, CertRefs>();

function listingsFor(cardTypeId: string): Listing[] {
  return game.auctionHouse.getListings().filter((l) => l.cardTypeId === cardTypeId);
}

function cardMeta(card: CardType): string {
  const listings = listingsFor(card.id).length;
  const owned = you.cards.filter((c) => c.typeId === card.id).length;
  // Two facts, never three - the sheet carries the detail.
  const second = owned > 0 ? `You own ${owned}` : listings ? `${listings} listed` : "None listed";
  return `<span class="cert__rarity">${card.rarity}</span>
    <span class="cert__dot">&bull;</span><span>${second}</span>`;
}

function syncCards(): void {
  for (const card of game.cardTypes) {
    if (!cardRefs.has(card.id)) {
      const refs = buildCert({
        name: card.name,
        metaHtml: cardMeta(card),
        foil: rarityColor[card.rarity],
        ariaLabel: `${card.name}, ${card.rarity}, view listings`,
        onOpen: () => openCardSheet(card),
      });
      cardRefs.set(card.id, refs);
      cardsList.append(refs.root);
    }
    refreshCert(cardRefs.get(card.id)!, card.id, cardMeta(card));
  }
  const open = game.auctionHouse.getListings().length;
  el("cards-note").textContent = open === 1 ? "1 open listing" : `${open} open listings`;
}

/* --------------------------------------------------------------- holdings */

function syncHoldings(): void {
  const body = el("holdings-body");
  const shares = [...you.shares.entries()].filter(([, qty]) => qty > 0);
  const cards = you.cards;

  const cardRows = new Map<string, number>();
  for (const c of cards) cardRows.set(c.typeId, (cardRows.get(c.typeId) ?? 0) + 1);

  el("holdings-note").textContent = `${shares.length} ${shares.length === 1 ? "company" : "companies"}, ${cards.length} cards`;

  if (!shares.length && !cards.length) {
    body.innerHTML = `<div class="empty"><strong>Nothing held yet</strong>Buy a card in the auction house, or take a stake in a company.</div>`;
    return;
  }

  const shareRows = shares
    .map(([companyId, qty]) => {
      const value = game.priceEngine.getPrice(companyId) * qty;
      return `<div class="row">
        <span class="row__label">
          <span class="row__name">${assetName(companyId)}</span>
          <span class="row__sub">${qty} shares at ${money(game.priceEngine.getPrice(companyId))}</span>
        </span>
        <span class="row__value num">${money(value)}</span>
      </div>`;
    })
    .join("");

  const cardRowsHtml = [...cardRows.entries()]
    .map(([typeId, qty]) => {
      const type = cardTypeById.get(typeId)!;
      const value = game.priceEngine.getPrice(typeId) * qty;
      return `<div class="row">
        <span class="row__label">
          <span class="row__name">${type.name}${qty > 1 ? ` &times;${qty}` : ""}</span>
          <span class="row__sub" style="color:${rarityColor[type.rarity]}">${type.rarity}</span>
        </span>
        <span class="row__value num">${money(value)}</span>
      </div>`;
    })
    .join("");

  body.innerHTML = `
    <div class="row">
      <span class="row__label"><span class="row__name">Cash</span><span class="row__sub">Ready to trade</span></span>
      <span class="row__value num" style="color:var(--brass)">${money(you.cash)}</span>
    </div>
    ${shares.length ? `<span class="eyebrow" style="display:block;margin:var(--s5) 0 var(--s2)">Shares</span>${shareRows}` : ""}
    ${cards.length ? `<span class="eyebrow" style="display:block;margin:var(--s5) 0 var(--s2)">Cards</span>${cardRowsHtml}` : ""}`;
}

/* --------------------------------------------------------------- activity */

function syncActivity(): void {
  const events = game.log.recent(40);
  const body = el("activity-body");

  if (!events.length) {
    body.innerHTML = `<div class="empty"><strong>Quiet so far</strong>Bots are sizing up the market. Trades will show up here.</div>`;
    return;
  }

  body.innerHTML = events
    .map((e) => {
      const who = playerName(e.actorId);
      const what = assetName(e.assetId);
      let dir: "up" | "down" | "new" = "up";
      let glyph = "▲";
      let text = "";

      switch (e.kind) {
        case "stock-buy":
          text = `<b>${who}</b> bought ${e.quantity} shares of <b>${what}</b>`;
          break;
        case "stock-sell":
          dir = "down"; glyph = "▼";
          text = `<b>${who}</b> sold ${e.quantity} shares of <b>${what}</b>`;
          break;
        case "card-sold":
          text = `<b>${who}</b> won <b>${what}</b>`;
          break;
        case "card-listed":
          dir = "down"; glyph = "▼";
          text = `<b>${who}</b> listed <b>${what}</b>`;
          break;
        case "company-founded":
          dir = "new"; glyph = "◆";
          text = `<b>${who}</b> founded <b>${what}</b>`;
          break;
      }

      return `<div class="feed__item" data-dir="${dir}">
        <span class="feed__glyph" aria-hidden="true">${glyph}</span>
        <span class="feed__text">${text}</span>
        <span class="feed__amount num">${compactMoney(e.price)}</span>
      </div>`;
    })
    .join("");
}

/* ------------------------------------------------------------------ sheet */

const scrim = el("scrim");
const sheet = el("sheet");
let lastFocused: HTMLElement | null = null;

function openSheet(html: string): void {
  lastFocused = document.activeElement as HTMLElement;
  sheet.innerHTML = `<div class="sheet__grip" aria-hidden="true"></div>${html}`;
  scrim.hidden = false;
  sheet.hidden = false;
  // Next frame, so the transition has a start state to animate from.
  requestAnimationFrame(() => {
    scrim.dataset.open = "true";
    sheet.dataset.open = "true";
    (sheet.querySelector<HTMLElement>("[data-autofocus]") ?? sheet).focus?.();
  });
}

function closeSheet(): void {
  delete scrim.dataset.open;
  delete sheet.dataset.open;
  window.setTimeout(() => {
    scrim.hidden = true;
    sheet.hidden = true;
    sheet.innerHTML = "";
  }, 280);
  lastFocused?.focus();
}

scrim.addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !sheet.hidden) closeSheet();
});

/* Swipe down to dismiss - the gesture people already expect from a sheet. */
let touchStartY = 0;
sheet.addEventListener("touchstart", (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
sheet.addEventListener("touchend", (e) => {
  if (sheet.scrollTop <= 0 && e.changedTouches[0].clientY - touchStartY > 90) closeSheet();
}, { passive: true });

let toastTimer = 0;
function toast(message: string, tone: "ok" | "error" = "ok"): void {
  const t = el("toast");
  t.textContent = message;
  t.dataset.tone = tone;
  t.dataset.open = "true";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => delete t.dataset.open, 2600);
}

function confirmAndClose(title: string, detail: string): void {
  sheet.innerHTML = `
    <div class="sheet__grip" aria-hidden="true"></div>
    <div class="done">
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r="26"/>
        <path d="M17 29l8 8 15-16"/>
      </svg>
      <span class="done__title">${title}</span>
      <span class="done__sub">${detail}</span>
    </div>`;
  window.setTimeout(closeSheet, 900);
}

/* ----------------------------------------------------------- stock sheet */

function openStockSheet(company: Company): void {
  const price = game.priceEngine.getPrice(company.id);
  const owned = you.shares.get(company.id) ?? 0;
  const pct = deltaPct(company.id);

  openSheet(`
    <div class="sheet__head">
      <h2 class="sheet__title" id="sheet-title" tabindex="-1" data-autofocus>${company.name}</h2>
      <p class="sheet__sub">Founded by ${playerName(company.founderId)} &middot; you hold ${owned} ${owned === 1 ? "share" : "shares"}</p>
      <div class="sheet__price">
        <span class="num">${money(price)}</span>
        <span class="cert__delta" data-dir="${direction(pct)}">${deltaLabel(pct)}</span>
      </div>
    </div>

    <div class="sheet__section">
      <span class="eyebrow">Shares</span>
      <div class="stepper">
        <button type="button" data-step="-1" aria-label="Fewer shares">&minus;</button>
        <input id="qty" type="number" inputmode="numeric" value="10" min="1" aria-label="Number of shares">
        <button type="button" data-step="1" aria-label="More shares">+</button>
      </div>
      <div class="quick">
        <button type="button" data-qty="10">10</button>
        <button type="button" data-qty="50">50</button>
        <button type="button" data-qty="100">100</button>
        <button type="button" data-qty="max">Max</button>
      </div>
    </div>

    <div class="sheet__section">
      <div class="preview">
        <span class="preview__line"><span>Price per share</span><strong class="num">${money(price)}</strong></span>
        <span class="preview__line"><span>Your cash</span><strong class="num">${money(you.cash)}</strong></span>
        <span class="preview__line preview__line--total"><span>Total</span><strong class="num" id="total">${money(price * 10)}</strong></span>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn--buy" id="do-buy">Buy</button>
      <button class="btn btn--sell" id="do-sell" ${owned ? "" : "disabled"}>Sell</button>
    </div>`);

  const qtyInput = sheet.querySelector<HTMLInputElement>("#qty")!;
  const total = sheet.querySelector<HTMLElement>("#total")!;

  const readQty = (): number => Math.max(1, Math.floor(Number(qtyInput.value) || 1));
  const sync = (): void => { total.textContent = money(game.priceEngine.getPrice(company.id) * readQty()); };

  qtyInput.addEventListener("input", sync);
  sheet.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) =>
    b.addEventListener("click", () => {
      qtyInput.value = String(Math.max(1, readQty() + Number(b.dataset.step)));
      sync();
    })
  );
  sheet.querySelectorAll<HTMLButtonElement>("[data-qty]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = game.priceEngine.getPrice(company.id);
      qtyInput.value = b.dataset.qty === "max" ? String(Math.max(1, Math.floor(you.cash / p))) : b.dataset.qty!;
      sync();
    })
  );

  sheet.querySelector("#do-buy")!.addEventListener("click", () => {
    const qty = readQty();
    try {
      game.stockMarket.buyShares(you, company, qty);
      confirmAndClose("Bought", `${qty} ${qty === 1 ? "share" : "shares"} of ${company.name}`);
      toast(`Bought ${qty} ${qty === 1 ? "share" : "shares"} of ${company.name}`);
      renderAll();
    } catch {
      toast("Not enough cash for that many shares", "error");
    }
  });

  sheet.querySelector("#do-sell")!.addEventListener("click", () => {
    const qty = Math.min(readQty(), you.shares.get(company.id) ?? 0);
    try {
      game.stockMarket.sellShares(you, company, qty);
      confirmAndClose("Sold", `${qty} ${qty === 1 ? "share" : "shares"} of ${company.name}`);
      toast(`Sold ${qty} ${qty === 1 ? "share" : "shares"} of ${company.name}`);
      renderAll();
    } catch {
      toast("You don't hold that many shares", "error");
    }
  });
}

/* ------------------------------------------------------------ card sheet */

function openCardSheet(card: CardType): void {
  const price = game.priceEngine.getPrice(card.id);
  const pct = deltaPct(card.id);
  const listings = listingsFor(card.id);
  const yours = you.cards.filter((c) => c.typeId === card.id);

  const listingHtml = listings.length
    ? listings
        .map((l) => {
          const isAuction = l.kind === "auction";
          const amount = isAuction
            ? Math.max(l.minBid, ...l.bids.map((b) => b.amount), 0)
            : l.price;
          const label = isAuction
            ? `${l.bids.length ? `${l.bids.length} ${l.bids.length === 1 ? "bid" : "bids"}` : "No bids"} &middot; closes tick ${l.closesAtTick}`
            : `Listed by ${playerName(l.sellerId)}`;
          return `<button class="listing" type="button" data-listing="${l.id}" data-kind="${l.kind}">
            <span>
              <span class="num">${money(amount)}</span>
              <span class="listing__who">${label}</span>
            </span>
            <span class="listing__tag">${isAuction ? "Bid" : "Buy"}</span>
          </button>`;
        })
        .join("")
    : `<div class="empty"><strong>Nothing listed</strong>Wait for a seller, or list one of your own.</div>`;

  openSheet(`
    <div class="sheet__head">
      <h2 class="sheet__title" id="sheet-title" tabindex="-1" data-autofocus>${card.name}</h2>
      <p class="sheet__sub sheet__sub--rarity" style="color:${rarityColor[card.rarity]}">${card.rarity}</p>
      <div class="sheet__price">
        <span class="num">${money(price)}</span>
        <span class="cert__delta" data-dir="${direction(pct)}">${deltaLabel(pct)}</span>
      </div>
    </div>

    <div class="sheet__section">
      <span class="eyebrow">Open listings</span>
      ${listingHtml}
    </div>

    ${yours.length ? `<div class="sheet__section">
      <span class="eyebrow">You own ${yours.length}</span>
      <div class="actions">
        <button class="btn btn--quiet" id="list-fixed">Sell at ${money(price)}</button>
        <button class="btn btn--brass" id="list-auction">Auction it</button>
      </div>
    </div>` : ""}`);

  sheet.querySelectorAll<HTMLButtonElement>("[data-listing]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.listing!;
      try {
        if (b.dataset.kind === "fixed") {
          game.auctionHouse.buyFixed(you, id);
          confirmAndClose("Bought", card.name);
          toast(`${card.name} is yours`);
        } else {
          const listing = game.auctionHouse.getListing(id);
          if (listing?.kind !== "auction") return;
          const top = Math.max(listing.minBid, ...listing.bids.map((x) => x.amount), 0);
          const bid = top * 1.05;
          game.auctionHouse.placeBid(you, id, bid);
          confirmAndClose("Bid placed", `${money(bid)} on ${card.name}`);
          toast(`Bid ${money(bid)} on ${card.name}`);
        }
        renderAll();
      } catch {
        toast("Not enough cash for that", "error");
      }
    })
  );

  sheet.querySelector("#list-fixed")?.addEventListener("click", () => {
    game.auctionHouse.listFixedPrice(you, yours[0], game.priceEngine.getPrice(card.id));
    confirmAndClose("Listed", `${card.name} at ${money(game.priceEngine.getPrice(card.id))}`);
    toast(`${card.name} listed`);
    renderAll();
  });

  sheet.querySelector("#list-auction")?.addEventListener("click", () => {
    const minBid = game.priceEngine.getPrice(card.id) * 0.8;
    game.auctionHouse.listForAuction(you, yours[0], minBid, game.currentTick + 5);
    confirmAndClose("Auction open", `${card.name} from ${money(minBid)}`);
    toast(`${card.name} up for auction`);
    renderAll();
  });
}

/* ----------------------------------------------------------- found sheet */

function openFoundSheet(): void {
  openSheet(`
    <div class="sheet__head">
      <h2 class="sheet__title" id="sheet-title">Found a company</h2>
      <p class="sheet__sub">Your capital buys 1,000 shares. Put in more, and each share opens higher.</p>
    </div>

    <div class="sheet__section">
      <div class="field">
        <label for="co-name">Company name</label>
        <input id="co-name" type="text" maxlength="28" placeholder="e.g. Harbour Metals" data-autofocus autocomplete="off">
        <span class="field__hint" id="name-hint">Up to 28 characters.</span>
      </div>
    </div>

    <div class="sheet__section">
      <div class="field">
        <label for="co-capital">Starting capital</label>
        <input id="co-capital" type="number" inputmode="decimal" value="500" min="100" step="50">
        <span class="field__hint" id="cap-hint">You have ${money(you.cash)} available.</span>
      </div>
      <div class="preview" style="margin-top:var(--s3)">
        <span class="preview__line"><span>Opening share price</span><strong class="num" id="open-price">$0.50</strong></span>
        <span class="preview__line preview__line--total"><span>Cash after founding</span><strong class="num" id="cash-after">${money(you.cash - 500)}</strong></span>
      </div>
    </div>

    <button class="btn btn--brass btn--block" id="do-found">Found company</button>`);

  const nameInput = sheet.querySelector<HTMLInputElement>("#co-name")!;
  const capInput = sheet.querySelector<HTMLInputElement>("#co-capital")!;
  const capHint = sheet.querySelector<HTMLElement>("#cap-hint")!;
  const nameHint = sheet.querySelector<HTMLElement>("#name-hint")!;
  const openPrice = sheet.querySelector<HTMLElement>("#open-price")!;
  const cashAfter = sheet.querySelector<HTMLElement>("#cash-after")!;
  const submit = sheet.querySelector<HTMLButtonElement>("#do-found")!;

  /* Inline validation that teaches the mechanic: the opening share price
     updates as you type, so the cost/price link is visible before you commit. */
  let nameTouched = false;

  const validate = (): boolean => {
    const capital = Number(capInput.value) || 0;
    const named = nameInput.value.trim().length > 0;
    let ok = true;

    if (capital < 100) {
      capHint.textContent = "Minimum capital is $100.";
      capHint.dataset.state = "error";
      capInput.setAttribute("aria-invalid", "true");
      ok = false;
    } else if (capital > you.cash) {
      capHint.textContent = `That's more than your ${money(you.cash)}.`;
      capHint.dataset.state = "error";
      capInput.setAttribute("aria-invalid", "true");
      ok = false;
    } else {
      capHint.textContent = `You have ${money(you.cash)} available.`;
      delete capHint.dataset.state;
      capInput.removeAttribute("aria-invalid");
    }

    if (!named) {
      // Only prompt once they've actually interacted - an empty form isn't an error.
      nameHint.textContent = nameTouched ? "Give your company a name." : "Up to 28 characters.";
      nameHint.dataset.state = nameTouched ? "error" : "";
      ok = false;
    } else {
      nameHint.textContent = "Up to 28 characters.";
      delete nameHint.dataset.state;
    }

    openPrice.textContent = money(capital / 1000);
    cashAfter.textContent = money(Math.max(0, you.cash - capital));
    submit.disabled = !ok;
    return ok;
  };

  nameInput.addEventListener("input", () => { nameTouched = true; validate(); });
  nameInput.addEventListener("blur", () => { nameTouched = true; validate(); });
  capInput.addEventListener("input", validate);
  validate();

  submit.addEventListener("click", () => {
    if (!validate()) return;
    const capital = Number(capInput.value);
    const company = game.stockMarket.foundCompany(you, nameInput.value.trim(), capital);
    history.set(company.id, [game.priceEngine.getPrice(company.id)]);
    confirmAndClose("Listed", `${company.name} opens at ${money(game.priceEngine.getPrice(company.id))}`);
    toast(`${company.name} is live on the market`);
    renderAll();
  });
}

/* ------------------------------------------------------------------ tape */

function syncTape(): void {
  const tape = el("tape");
  const movers = [...game.cardTypes.map((c) => c.id), ...game.companies.map((c) => c.id)]
    .map((id) => ({ id, pct: deltaPct(id) }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 8);

  tape.innerHTML = movers
    .map(
      (m) => `<span class="tape__chip" data-dir="${direction(m.pct)}">
        ${assetName(m.id)} <span class="num">${deltaLabel(m.pct)}</span>
      </span>`
    )
    .join("");
}

/* ------------------------------------------------------------------ tabs */

let activeTab = "market";
const startingWorth = netWorth();

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab!;
    document.querySelectorAll(".tab").forEach((t) => t.removeAttribute("aria-current"));
    tab.setAttribute("aria-current", "page");
    document.querySelectorAll<HTMLElement>(".view").forEach((v) => {
      v.dataset.active = String(v.id === `view-${activeTab}`);
    });
    renderAll();
  })
);

/* ----------------------------------------------------------------- theme */

const themeToggle = el<HTMLButtonElement>("theme-toggle");
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
  document.documentElement.dataset.theme = next;
  themeToggle.setAttribute("aria-label", next === "night" ? "Switch to day market" : "Switch to night market");
  document.querySelector('meta[name="theme-color"]')!.setAttribute("content", next === "night" ? "#0A1618" : "#F2EBDB");
});

/* ------------------------------------------------------------ render loop */

function renderAll(): void {
  el("networth").textContent = money(netWorth());
  el("cash").textContent = money(you.cash);

  const changePct = ((netWorth() - startingWorth) / startingWorth) * 100;
  const deltaEl = el("networth-delta");
  deltaEl.textContent = `${deltaLabel(changePct)} this session`;
  deltaEl.style.color =
    direction(changePct) === "up" ? "var(--jade)" : direction(changePct) === "down" ? "var(--ember)" : "var(--bone-dim)";

  syncTape();
  // Only the visible view does DOM work; the rest waits until it's shown.
  if (activeTab === "market") syncMarket();
  if (activeTab === "cards") syncCards();
  if (activeTab === "holdings") syncHoldings();
  if (activeTab === "activity") syncActivity();
}

// Seed a little history so sparklines have a shape on first paint.
for (let i = 0; i < 6; i++) {
  game.tick();
  sampleHistory();
}

marketList.innerHTML = "";
marketList.append(foundCta);
renderAll();

window.setInterval(() => {
  game.tick();
  sampleHistory();
  renderAll();
}, TICK_MS);
