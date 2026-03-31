import {
  CompanyInfo,
  EarningsRelease,
  FinancialSummary,
  FinancialPeriod,
} from "@/types";

const EDGAR_DATA = "https://data.sec.gov";
const EDGAR_ARCHIVES = "https://www.sec.gov/Archives/edgar/data";
const HEADERS = {
  "User-Agent": "PubCoAnalysis/1.0 research@pubcoanalysis.com",
  Accept: "application/json",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Company Search ────────────────────────────────────────────────────────────

interface RawTicker {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickersCache: CompanyInfo[] | null = null;
let tickersFetchedAt = 0;

export async function searchCompanies(query: string): Promise<CompanyInfo[]> {
  // Refresh cache every 24 hours
  if (!tickersCache || Date.now() - tickersFetchedAt > 86_400_000) {
    const res = await fetch(
      "https://www.sec.gov/files/company_tickers.json",
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error("Failed to fetch company list");
    const raw: Record<string, RawTicker> = await res.json();
    tickersCache = Object.values(raw).map((c) => ({
      cik: String(c.cik_str),
      name: c.title,
      ticker: c.ticker,
    }));
    tickersFetchedAt = Date.now();
  }

  const q = query.trim().toLowerCase();
  if (!q) return [];

  const exact: CompanyInfo[] = [];
  const startsWith: CompanyInfo[] = [];
  const contains: CompanyInfo[] = [];

  for (const c of tickersCache) {
    const nameLower = c.name.toLowerCase();
    const tickerLower = c.ticker.toLowerCase();
    if (tickerLower === q || nameLower === q) {
      exact.push(c);
    } else if (tickerLower.startsWith(q) || nameLower.startsWith(q)) {
      startsWith.push(c);
    } else if (tickerLower.includes(q) || nameLower.includes(q)) {
      contains.push(c);
    }
    if (exact.length + startsWith.length + contains.length >= 50) break;
  }

  return [...exact, ...startsWith, ...contains].slice(0, 12);
}

// ── EDGAR Submissions ─────────────────────────────────────────────────────────

function padCIK(cik: string): string {
  return cik.padStart(10, "0");
}

interface Submissions {
  name: string;
  sic: string;
  sicDescription: string;
  tickers: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      items: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

async function getSubmissions(cik: string): Promise<Submissions> {
  const res = await fetch(
    `${EDGAR_DATA}/submissions/CIK${padCIK(cik)}.json`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`EDGAR submissions error: ${res.status}`);
  return res.json();
}

// ── Document Text ─────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchDocument(
  cik: string,
  accessionNumber: string,
  primaryDoc: string
): Promise<string> {
  const accNo = accessionNumber.replace(/-/g, "");
  const url = `${EDGAR_ARCHIVES}/${cik}/${accNo}/${primaryDoc}`;
  const res = await fetch(url, {
    headers: { "User-Agent": HEADERS["User-Agent"] },
  });
  if (!res.ok) return "";
  const text = await res.text();
  // Plain text files don't need stripping
  if (!primaryDoc.match(/\.(htm|html)$/i)) return text.slice(0, 15000);
  return stripHtml(text).slice(0, 15000);
}

// ── Earnings Releases ─────────────────────────────────────────────────────────

async function collectFilings(
  cik: string,
  recent: Submissions["filings"]["recent"],
  predicate: (form: string, items: string) => boolean,
  limit: number,
  existing: EarningsRelease[]
): Promise<EarningsRelease[]> {
  const results: EarningsRelease[] = [...existing];
  for (let i = 0; i < recent.form.length && results.length < limit; i++) {
    const form = recent.form[i];
    const items = recent.items[i] ?? "";
    if (!predicate(form, items)) continue;
    const accNo = recent.accessionNumber[i];
    const primaryDoc = recent.primaryDocument[i];
    if (!primaryDoc) continue;
    // Skip duplicates by accession number
    if (results.some((r) => r.date === recent.filingDate[i] && r.form === form)) continue;
    try {
      const text = await fetchDocument(cik, accNo, primaryDoc);
      if (text.length > 200) {
        results.push({
          date: recent.filingDate[i],
          period: recent.reportDate[i] ?? recent.filingDate[i],
          form,
          text,
        });
      }
      await sleep(150);
    } catch {
      // skip
    }
  }
  return results;
}

export async function getEarningsReleases(
  cik: string
): Promise<EarningsRelease[]> {
  const subs = await getSubmissions(cik);
  const { recent } = subs.filings;

  // Pass 1: 8-K / 8-K/A with item 2.02 (Results of Operations — best source)
  let results = await collectFilings(
    cik, recent,
    (form, items) => (form === "8-K" || form === "8-K/A") && items.includes("2.02"),
    4, []
  );

  // Pass 2: 8-K / 8-K/A with item 7.01 (Regulation FD — transcripts & supplemental)
  if (results.length < 4) {
    results = await collectFilings(
      cik, recent,
      (form, items) => (form === "8-K" || form === "8-K/A") && items.includes("7.01"),
      4, results
    );
  }

  // Pass 3: 10-Q (quarterly reports with full MD&A)
  if (results.length < 4) {
    results = await collectFilings(
      cik, recent,
      (form) => form === "10-Q",
      4, results
    );
  }

  // Pass 4: 10-K (annual reports) if still under 4
  if (results.length < 4) {
    results = await collectFilings(
      cik, recent,
      (form) => form === "10-K" || form === "10-K/A",
      4, results
    );
  }

  // Sort by date descending, cap at 4
  return results
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
}

// ── Financial Summary ─────────────────────────────────────────────────────────

interface XBRLUnits {
  USD?: Array<{ end: string; val: number; form: string; frame?: string }>;
  "USD/shares"?: Array<{
    end: string;
    val: number;
    form: string;
    frame?: string;
  }>;
}

function extractQuarterly(
  units: XBRLUnits | undefined,
  n = 8
): FinancialPeriod[] {
  const arr = units?.USD ?? units?.["USD/shares"] ?? [];
  // Filter for quarterly (10-Q) and annual (10-K) instant values
  const filtered = arr
    .filter((d) => d.form === "10-Q" || d.form === "10-K")
    .sort((a, b) => b.end.localeCompare(a.end));

  // De-duplicate by period end date
  const seen = new Set<string>();
  const deduped: FinancialPeriod[] = [];
  for (const d of filtered) {
    if (!seen.has(d.end)) {
      seen.add(d.end);
      deduped.push({ period: d.frame ?? d.end, end: d.end, value: d.val, form: d.form });
    }
    if (deduped.length >= n) break;
  }
  return deduped;
}

export async function getFinancialSummary(
  cik: string
): Promise<FinancialSummary> {
  const res = await fetch(
    `${EDGAR_DATA}/api/xbrl/companyfacts/CIK${padCIK(cik)}.json`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`XBRL error: ${res.status}`);
  const facts = await res.json();
  const g = facts?.facts?.["us-gaap"] ?? {};

  return {
    revenue: extractQuarterly(
      g["Revenues"]?.units ??
        g["RevenueFromContractWithCustomerExcludingAssessedTax"]?.units ??
        g["SalesRevenueNet"]?.units ??
        g["RevenueFromContractWithCustomerIncludingAssessedTax"]?.units
    ),
    netIncome: extractQuarterly(g["NetIncomeLoss"]?.units),
    operatingIncome: extractQuarterly(g["OperatingIncomeLoss"]?.units),
    grossProfit: extractQuarterly(g["GrossProfit"]?.units),
    eps: extractQuarterly(
      g["EarningsPerShareDiluted"]?.units ??
        g["EarningsPerShareBasic"]?.units
    ),
    cash: extractQuarterly(
      g["CashAndCashEquivalentsAtCarryingValue"]?.units ??
        g["CashCashEquivalentsAndShortTermInvestments"]?.units
    ),
    totalDebt: extractQuarterly(
      g["LongTermDebt"]?.units ?? g["DebtAndCapitalLeaseObligations"]?.units
    ),
  };
}

// ── Format Financial Table ────────────────────────────────────────────────────

function fmt(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return `$${val.toFixed(2)}`;
}

export function formatFinancialSummary(fs: FinancialSummary): string {
  const periods = fs.revenue.map((r) => r.end).slice(0, 6);
  if (periods.length === 0) return "Financial data not available.";

  const getVal = (arr: FinancialPeriod[], end: string) =>
    arr.find((r) => r.end === end)?.value;

  const rows = periods.map((end) => {
    const rev = getVal(fs.revenue, end);
    const ni = getVal(fs.netIncome, end);
    const oi = getVal(fs.operatingIncome, end);
    const gp = getVal(fs.grossProfit, end);
    const eps = getVal(fs.eps, end);
    const cash = getVal(fs.cash, end);

    const grossMargin =
      rev && gp ? `${((gp / rev) * 100).toFixed(1)}%` : "N/A";

    return (
      `| ${end} | ${rev ? fmt(rev) : "N/A"} | ${ni ? fmt(ni) : "N/A"} | ` +
      `${oi ? fmt(oi) : "N/A"} | ${grossMargin} | ${eps ? `$${eps.toFixed(2)}` : "N/A"} | ${cash ? fmt(cash) : "N/A"} |`
    );
  });

  return [
    "| Period | Revenue | Net Income | Op. Income | Gross Margin | EPS | Cash |",
    "|--------|---------|------------|------------|--------------|-----|------|",
    ...rows,
  ].join("\n");
}

export async function getCompanyInfo(
  cik: string
): Promise<{ sic: string; sicDescription: string; name: string }> {
  const subs = await getSubmissions(cik);
  return {
    sic: subs.sic,
    sicDescription: subs.sicDescription,
    name: subs.name,
  };
}
