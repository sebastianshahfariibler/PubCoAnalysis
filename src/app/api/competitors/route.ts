import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  searchCompanies,
  getEarningsReleases,
  getFinancialSummary,
  formatFinancialSummary,
} from "@/lib/edgar";
import { CompanyInfo } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Step 1: Ask Claude to name competitors, then we fetch their data
async function identifyCompetitors(company: CompanyInfo): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `List the 3 most direct publicly-traded competitors of ${company.name} (ticker: ${company.ticker}). Return ONLY a JSON array of ticker symbols, nothing else. Example: ["MSFT","GOOGL","META"]`,
      },
    ],
  });

  const text =
    response.content.find((b) => b.type === "text")?.text ?? "[]";
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    const tickers: unknown[] = JSON.parse(match[0]);
    return tickers.filter((t): t is string => typeof t === "string").slice(0, 3);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json() as CompanyInfo;
  const { cik, name, ticker } = body;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      try {
        send({ type: "status", message: "Identifying main competitors…" });

        const competitorTickers = await identifyCompetitors({ cik, name, ticker });

        if (competitorTickers.length === 0) {
          send({ type: "error", message: "Could not identify competitors." });
          controller.close();
          return;
        }

        send({
          type: "status",
          message: `Found competitors: ${competitorTickers.join(", ")}. Fetching their data…`,
        });

        // Resolve tickers to CIKs
        const competitorData: Array<{
          company: CompanyInfo;
          financialTable: string;
          releases: Awaited<ReturnType<typeof getEarningsReleases>>;
        }> = [];

        for (const ct of competitorTickers) {
          const matches = await searchCompanies(ct);
          const match = matches.find(
            (m) => m.ticker.toUpperCase() === ct.toUpperCase()
          );
          if (!match) continue;

          send({
            type: "status",
            message: `Fetching data for ${match.name}…`,
          });

          const [relResult, finResult] = await Promise.allSettled([
            getEarningsReleases(match.cik),
            getFinancialSummary(match.cik),
          ]);

          const releases =
            relResult.status === "fulfilled" ? relResult.value : [];
          const financials =
            finResult.status === "fulfilled" ? finResult.value : null;
          const financialTable = financials
            ? formatFinancialSummary(financials)
            : "Financial data unavailable.";

          competitorData.push({ company: match, financialTable, releases });
        }

        if (competitorData.length === 0) {
          send({ type: "error", message: "Could not fetch competitor data." });
          controller.close();
          return;
        }

        send({ type: "status", message: "Running comparative analysis…" });

        const compSections = competitorData
          .map(
            (c) =>
              `### ${c.company.name} (${c.company.ticker})\n\n**Financial Summary:**\n${c.financialTable}\n\n**Recent Filings Excerpt:**\n${c.releases[0]?.text?.slice(0, 4000) ?? "No recent filings found."}`
          )
          .join("\n\n---\n\n");

        const prompt = `You are a senior equity analyst conducting a competitive intelligence analysis.

## PRIMARY COMPANY: ${name} (${ticker})

## COMPETITORS ANALYZED:
${compSections}

---

## COMPARATIVE ANALYSIS ASSIGNMENT

Please provide a structured competitive analysis covering:

### 1. RELATIVE FINANCIAL PERFORMANCE
Compare the primary company vs. competitors across key metrics (revenue growth, margins, profitability). Who is winning financially and why?

### 2. STRATEGIC DIFFERENTIATION
Based on the filings:
- How does each company's stated strategy differ?
- What unique advantages does each appear to be building?
- Where are strategies converging or diverging?

### 3. COMPETITIVE POSITIONING
- Who appears best positioned for the next 12-24 months?
- What are the key competitive threats to ${name}?
- Where does ${name} have defensible advantages?

### 4. MANAGEMENT QUALITY COMPARISON
Based on tone, guidance accuracy, and execution signals from their filings, how does ${name}'s management compare to competitors?

### 5. SUMMARY VERDICT
A brief 2-3 sentence investment-style summary of how ${name} stacks up against these competitors.

Use markdown formatting with clear headers. Be specific and reference numbers from the data above.`;

        const claudeStream = await anthropic.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 6000,
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
          error instanceof Error ? error.message : "Competitor analysis failed";
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
