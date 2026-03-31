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
  financialTable: string,
  hasData: boolean
): string {
  if (!hasData) {
    return `The user requested an earnings analysis for ${company.name} (${company.ticker}), but no filings or financial data could be retrieved from the U.S. Securities and Exchange Commission (SEC) EDGAR database for this company. Please respond with exactly: "No data found for ${company.name} (${company.ticker}) in SEC EDGAR. This may be a non-US listed company or the data may not be available."`;
  }

  const releaseSections = releases
    .map(
      (r, i) =>
        `### Filing ${i + 1}: ${r.form} — Period: ${r.period} | Filed: ${r.date}\n\n${r.text.slice(0, 8000)}\n`
    )
    .join("\n---\n\n");

  return `You are a senior equity analyst. Write a concise but rigorous report on ${company.name} (${company.ticker}).

**Style rules:**
- Total response: 500–750 words maximum
- Spell out every acronym in full the first time it appears, e.g. "Earnings Per Share (EPS)"
- No filler phrases ("it is worth noting", "in conclusion", etc.)
- Only reference data that actually appears in the filings below — do not speculate or fill gaps
- If a section has insufficient data, write "Insufficient data" for that section only

## COMPANY: ${company.name} (${company.ticker})
Industry: ${company.sicDescription ?? "N/A"} (Standard Industrial Classification (SIC): ${company.sic ?? "N/A"})

---

## FILINGS (${releases.length} periods)

${releaseSections}

---

## FINANCIAL SUMMARY

${financialTable}

---

## REPORT STRUCTURE

### 1. TONE SNAPSHOT
One sentence per filing period. Format: **[Period] — [Confident/Cautious/Defensive/Mixed]:** key theme + one direct quote if available.

### 2. STRATEGIC HYPOTHESIS
3–5 bullet points. What is management betting on over the next 2–3 years? Reference specific initiatives, markets, or capital allocation signals from the filings.

### 3. PROMISES VS. ACTUALS
For each period that has a subsequent period to compare against, list guidance given then show what happened:
- ✅ **MET:** [promise] → [actual]
- ⚠️ **MISSED:** [promise] → [actual] [¹]

Footnotes at end of section:
> [¹] "exact quote" — [Filing date]

If no comparable periods exist, write "Insufficient data for comparison."

### 4. EXECUTION ASSESSMENT
- **Grade:** A/B/C/D with one-sentence rationale
- **Management Credibility:** X/10
- **Key strength:** one line
- **Key risk:** one line`;
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

        const hasData =
          releases.length > 0 ||
          financialTable !== "Financial data not available for this company.";

        send({
          type: "status",
          message: hasData
            ? `Found ${releases.length} filing(s). Running AI analysis…`
            : "No filings found. Returning no-data response…",
        });

        const prompt = buildPrompt(company, releases, financialTable, hasData);

        // Stream Claude response
        const claudeStream = await anthropic.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 4000,
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
