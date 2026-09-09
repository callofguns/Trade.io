/** A player-founded company listed on the stock market. */
export interface Company {
  id: string;
  name: string;
  founderId: string;
  /** Fixed at founding for simplicity - Stage 1 doesn't model issuing new shares. */
  totalShares: number;
}

let companyCounter = 0;

export function createCompanyId(): string {
  companyCounter += 1;
  return `company-${companyCounter}`;
}
