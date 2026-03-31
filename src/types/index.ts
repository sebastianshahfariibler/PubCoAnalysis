export interface CompanyInfo {
  cik: string;
  name: string;
  ticker: string;
}

export type TabName = "earnings" | "financials" | "themes";

export interface AnalysisTabs {
  earnings: string;
  financials: string;
  themes: string;
}

export interface DocRef {
  date: string;
  period: string;
  form: string;
  isTranscript?: boolean;
}

export interface AnalysisMeta {
  transcripts: DocRef[];
  releases: DocRef[];
}

export interface AnalysisRecord {
  id: string;
  company: CompanyInfo;
  timestamp: number;
  quarters: number;
  tabs: AnalysisTabs;
  meta?: AnalysisMeta;
}

export interface EarningsRelease {
  date: string;
  period: string;
  form: string;
  text: string;
  isTranscript?: boolean;
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
  type: "text" | "error" | "done" | "status" | "section_start" | "section_done" | "meta";
  content?: string;
  message?: string;
  section?: TabName;
  meta?: AnalysisMeta;
}
