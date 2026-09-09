import type { PriceEngine } from "./Market.js";
import type { Player } from "./Player.js";
import type { TradeLog } from "./Events.js";
import { type Company, createCompanyId } from "./Company.js";

const SHARES_PER_COMPANY = 1000;

/**
 * The stock market. Buying/selling doesn't need to find another player on
 * the other side of the trade - it trades directly against the price
 * engine (like an automated market maker). That's a deliberate simplification:
 * it guarantees any player or bot can always trade, which keeps the market
 * feeling alive even with few people online. The tradeoff is that share
 * count isn't strictly conserved between players; if we want a full
 * order-book (buyer matched to a specific seller) later, this is the class
 * that would change.
 */
export class StockMarket {
  private companies = new Map<string, Company>();

  constructor(
    private priceEngine: PriceEngine,
    private log?: TradeLog
  ) {}

  /** Founding a company costs `foundingCost` cash, which also sets share 1's price. */
  foundCompany(founder: Player, name: string, foundingCost: number): Company {
    if (foundingCost <= 0) throw new Error("Founding cost must be positive");
    if (founder.cash < foundingCost) {
      throw new Error(`${founder.name} needs $${foundingCost} to found a company, has $${founder.cash}`);
    }
    founder.cash -= foundingCost;

    const company: Company = {
      id: createCompanyId(),
      name,
      founderId: founder.id,
      totalShares: SHARES_PER_COMPANY,
    };
    this.companies.set(company.id, company);
    const startingPrice = foundingCost / SHARES_PER_COMPANY;
    this.priceEngine.register(company.id, startingPrice);
    founder.addShares(company.id, SHARES_PER_COMPANY);

    this.log?.record({
      kind: "company-founded",
      actorId: founder.id,
      assetId: company.id,
      quantity: SHARES_PER_COMPANY,
      price: startingPrice,
    });
    return company;
  }

  buyShares(buyer: Player, company: Company, quantity: number): void {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    const price = this.priceEngine.getPrice(company.id);
    const cost = price * quantity;
    if (buyer.cash < cost) {
      throw new Error(`${buyer.name} can't afford ${quantity} shares of ${company.name} ($${cost.toFixed(2)})`);
    }

    buyer.cash -= cost;
    buyer.addShares(company.id, quantity);
    this.priceEngine.recordTrade(company.id, "buy", quantity, 100);
    this.log?.record({ kind: "stock-buy", actorId: buyer.id, assetId: company.id, quantity, price });
  }

  sellShares(seller: Player, company: Company, quantity: number): void {
    if (quantity <= 0) throw new Error("Quantity must be positive");
    const price = this.priceEngine.getPrice(company.id);
    seller.removeShares(company.id, quantity);
    seller.cash += price * quantity;
    this.priceEngine.recordTrade(company.id, "sell", quantity, 100);
    this.log?.record({ kind: "stock-sell", actorId: seller.id, assetId: company.id, quantity, price });
  }

  getCompany(companyId: string): Company | undefined {
    return this.companies.get(companyId);
  }

  getCompanies(): Company[] {
    return [...this.companies.values()];
  }
}
