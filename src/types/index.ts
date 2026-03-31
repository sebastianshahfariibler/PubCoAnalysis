export interface CompanyInfo {
  cik: string;
  name: string;
  ticker: string;
}

export interface AnalysisRecord {
  id: string;
  company: CompanyInfo;
  timestamp: number;
  analysis: string;
}

export interface EarningsRelease {
  date: string;
  period: string;
  form: string;
  text: string;
}

export interface FinancialPeriod {
  period: string;
  end: string;
  value: number;
  form: string;
}

export interface FinancialSummary {
  revenue: FinancialPeriod[];
  netIncome: FinancialPeriod[];
  operatingIncome: FinancialPeriod[];
  grossProfit: FinancialPeriod[];
  eps: FinancialPeriod[];
  cash: FinancialPeriod[];
  totalDebt: FinancialPeriod[];
}

export interface SSEEvent {
  type: "text" | "error" | "done" | "meta";
  content?: string;
  message?: string;
  meta?: Record<string, unknown>;
}
