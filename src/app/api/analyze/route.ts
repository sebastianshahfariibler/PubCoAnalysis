import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getEarningsReleases,
  getFinancialSummary,
  formatFinancialSummary,
  getCompanyInfo,
} from "@/lib/edgar";
import { CompanyInfo } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minute timeout for Vercel

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildPrompt(
  company: CompanyInfo & { sic?: string; sicDescription?: string },
  releases: Awaited<ReturnType<typeof getEarningsReleases>>,
  financialTable: string
): string {
  const releaseSections = releases
    .map(
      (r, i) =>
        `### Filing ${i + 1}: ${r.form} — Period: ${r.period} | Filed: ${r.date}\n\n${r.text.slice(0, 10000)}\n`
    )
    .join("\n---\n\n");

  const noReleases =
    releases.length === 0
      ? "No earnings press releases found in EDGAR for this company."
      : "";

  return `You are a senior equity research analyst preparing a comprehensive strategic assessment report.

## COMPANY: ${company.name} (${company.ticker}) | CIK: ${company.cik}
Industry: ${company.sicDescription ?? "N/A"} (SIC: ${company.sic ?? "N/A"})

---

## SECTION A: EARNINGS RELEASES & FILINGS (Last ${releases.length} Periods)
${noReleases}
${releaseSections}

---

## SECTION B: FINANCIAL PERFORMANCE SUMMARY

${financialTable}

---

## YOUR ANALYSIS ASSIGNMENT

Please provide a rigorous, specific analysis covering the following four sections. Be analytical, cite specific numbers, and reference actual language from the filings above.

### 1. EARNINGS TONE & SENTIMENT ANALYSIS

For each filing period above:
- Rate management tone: **Confident / Cautious / Defensive / Mixed**
- Identify the 2-3 dominant themes/priorities emphasized
- Note key linguistic patterns: hedging language, forward-looking qualifiers, emphasis shifts vs. prior periods
- Flag any notable changes in tone from period to period
- Quote specific language where it reveals intent or confidence

### 2. STRATEGIC HYPOTHESIS

Based on patterns across all filings and financial data:
- What is management's apparent 2-3 year strategic direction?
- What are the key strategic bets (products, markets, capabilities)?
- How does capital allocation (cash position, debt, investments implied by opex trends) signal priorities?
- What competitive positioning is management signaling?
- What is the company **not** talking about that may be significant?

### 3. PROMISES VS. ACTUALS — DISCREPANCY ANALYSIS

For each period with a subsequent period to compare against:
- List specific forward guidance, targets, or promises made in the filing
- State what the following period's data actually showed
- For each discrepancy, use this format:

  ⚠️ **DISCREPANCY:** "[What was promised]" → Actual: [what happened] [¹]

Where [¹] is a footnote. Compile all footnotes at the end of this section as:
> [¹] Exact quote: "..." — [Filing date / period]

If guidance was met or exceeded, note: ✅ **MET:** [promise] → [actual result]

### 4. EXECUTION CAPABILITY ASSESSMENT

- **Overall Execution Grade:** A / B+ / B / C+ / C / D (with brief justification)
- **Management Credibility Score:** X/10 — based on guidance accuracy track record
- **Guidance Reliability:** How consistently does management's guidance prove accurate?
- **Execution Strengths:** 2-3 specific areas where management consistently delivers
- **Execution Risks:** 2-3 specific concerns about execution gaps or credibility
- **Strategic Capability vs. Ambition:** Is the organization demonstrating the capability to execute its stated strategy?

---

Format your response with clear markdown headers (##, ###). Use **bold** for key findings. Be specific and quantitative wherever possible. A high-quality response will reference actual numbers and quotes from the filings above.`;
}

export async function POST(request: NextRequest) {
  const body = await request.json() as CompanyInfo;
  const { cik, name, ticker } = body;

  if (!cik || !name) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Missing company info" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      try {
        send({ type: "status", message: "Fetching company data from SEC EDGAR…" });

        // Fetch in parallel to save time
        const [earningsReleases, financialSummary, companyMeta] =
          await Promise.allSettled([
            getEarningsReleases(cik),
            getFinancialSummary(cik),
            getCompanyInfo(cik),
          ]);

        const releases =
          earningsReleases.status === "fulfilled" ? earningsReleases.value : [];
        const financials =
          financialSummary.status === "fulfilled"
            ? financialSummary.value
            : null;
        const meta =
          companyMeta.status === "fulfilled" ? companyMeta.value : null;

        const financialTable = financials
          ? formatFinancialSummary(financials)
          : "Financial data not available for this company.";

        const company = {
          cik,
          name,
          ticker,
          sic: meta?.sic,
          sicDescription: meta?.sicDescription,
        };

        send({
          type: "status",
          message: `Found ${releases.length} filings. Running AI analysis…`,
        });

        const prompt = buildPrompt(company, releases, financialTable);

        // Stream Claude response
        const claudeStream = await anthropic.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 8000,
          thinking: { type: "adaptive" },
          messages: [{ role: "user", content: prompt }],
        });

        for await (const chunk of claudeStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            send({ type: "text", content: chunk.delta.text });
          }
        }

        send({ type: "done" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Analysis failed";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
