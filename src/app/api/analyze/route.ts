import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getEarningsReleases,
  getTranscripts,
  getFinancialSummary,
  formatFinancialSummary,
  getCompanyInfo,
} from "@/lib/edgar";
import { CompanyInfo, TabName, AnalysisMeta } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minute timeout for Vercel

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type CompanyMeta = CompanyInfo & { sic?: string; sicDescription?: string };

const CONFIDENCE_BLOCK = `

---

Finally, end your response with this block (always last):

### CONFIDENCE ASSESSMENT
- **Score:** [High / Medium / Low]
- **Basis:** [One sentence — reference the number of periods, source types (transcript vs press release vs 10-Q), and any notable data gaps]
- **Watch-outs:** [2–3 specific claims in your analysis a reader should independently verify]`;

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildEarningsPrompt(
  company: CompanyMeta,
  transcripts: Awaited<ReturnType<typeof getTranscripts>>,
  releases: Awaited<ReturnType<typeof getEarningsReleases>>,
  tabContext?: { financials?: string }
): string {
  // Prefer transcripts, fall back to earnings releases
  const docs = transcripts.length > 0 ? transcripts : releases;

  if (docs.length === 0) {
    return `No earnings call documents found for ${company.name} (${company.ticker ?? "N/A"}). Respond with exactly: "No earnings call data found for ${company.name} in SEC EDGAR."`;
  }

  const docSections = docs
    .map(
      (r, i) =>
        `### Document ${i + 1}: ${r.form} — Period: ${r.period} | Filed: ${r.date}${r.isTranscript ? " [TRANSCRIPT]" : ""}\n\n${r.text.slice(0, 8000)}\n`
    )
    .join("\n---\n\n");

  const financialContext = tabContext?.financials
    ? `\n\n---\n\n## FINANCIAL CONTEXT (from Financial Filing tab — use only to cross-reference, do not repeat)\n\n${tabContext.financials.slice(0, 2000)}\n\n---\n`
    : "";

  return `You are a behavioral finance analyst. Analyze these earnings call documents for ${company.name} (${company.ticker ?? "N/A"}).

**Style rules:**
- 600–750 words maximum (excluding the confidence block)
- Spell out every acronym in full the first time it appears, e.g. "Earnings Per Share (EPS)"
- No filler phrases ("it is worth noting", "in conclusion", etc.)
- Only reference data that actually appears in the documents below — do not speculate
- Use direct quotes (in quotation marks) to support observations

## COMPANY: ${company.name} (${company.ticker ?? "N/A"})
Industry: ${company.sicDescription ?? "N/A"} (Standard Industrial Classification (SIC): ${company.sic ?? "N/A"})
${financialContext}
---

## EARNINGS DOCUMENTS (${docs.length} periods)

${docSections}

---

## REPORT STRUCTURE

### 1. COMMUNICATION PROFILE PER PERIOD
One paragraph per period. Note: management tone, confidence signals, hedge language, and notable phrasing choices.

### 2. BEHAVIORAL MARKERS
Bullet list of notable linguistic patterns with direct quotes. For each marker, state what it likely signals strategically.

### 3. STRATEGIC SIGNALS FROM LANGUAGE
3–5 bullets: What is management revealing (or concealing) through word choice, topic emphasis, and framing?

### 4. LANGUAGE EVOLUTION
How has communication style shifted across periods? Topics that appeared then disappeared? New vocabulary introduced? What does the trajectory suggest?${CONFIDENCE_BLOCK}`;
}

function buildFinancialsPrompt(
  company: CompanyMeta,
  releases: Awaited<ReturnType<typeof getEarningsReleases>>,
  financialTable: string,
  hasData: boolean
): string {
  if (!hasData) {
    return `No financial data found for ${company.name} (${company.ticker ?? "N/A"}) in SEC EDGAR. Respond with exactly: "No financial data found for ${company.name} in SEC EDGAR."`;
  }

  const releaseSections = releases
    .map(
      (r, i) =>
        `### Filing ${i + 1}: ${r.form} — Period: ${r.period} | Filed: ${r.date}\n\n${r.text.slice(0, 6000)}\n`
    )
    .join("\n---\n\n");

  return `You are a senior equity analyst. Provide quantitative financial analysis for ${company.name} (${company.ticker ?? "N/A"}).

**Style rules:**
- 500–650 words maximum
- Spell out every acronym in full the first time it appears
- No filler phrases
- Only reference data from the provided filings and financial table
- If a metric is unavailable, write "N/A"

## COMPANY: ${company.name} (${company.ticker ?? "N/A"})
Industry: ${company.sicDescription ?? "N/A"} (SIC: ${company.sic ?? "N/A"})

---

## FINANCIAL SUMMARY TABLE

${financialTable}

---

## FILING EXCERPTS (${releases.length} periods)

${releaseSections}

---

## REPORT STRUCTURE

### 1. FINANCIAL SNAPSHOT
3–4 bullet points: key metrics as of the most recent period and their trend direction.

### 2. REVENUE AND PROFITABILITY TRENDS
Quarterly progression, margin trajectory, acceleration or deceleration signals.

### 3. GUIDANCE VS. ACTUALS
For each period with prior guidance visible in the filings:
- ✅ **MET:** [promise] → [actual]
- ⚠️ **MISSED:** [promise] → [actual] [¹]

Footnotes:
> [¹] "exact quote" — [Filing date]

If no comparable periods: "Insufficient data for comparison."

### 4. BALANCE SHEET AND CAPITAL ALLOCATION
Cash trends, debt levels, buybacks, dividends, and investment signals from the data.

### 5. KEY RISK FLAGS
2–3 specific quantitative concerns from the data only.${CONFIDENCE_BLOCK}`;
}

function buildThemesPrompt(
  company: CompanyMeta,
  transcripts: Awaited<ReturnType<typeof getTranscripts>>,
  releases: Awaited<ReturnType<typeof getEarningsReleases>>,
  tabContext?: { earnings?: string }
): string {
  // Combine transcripts and releases, de-duplicate by date, prefer transcripts
  const allDocs = [...transcripts];
  for (const r of releases) {
    if (!allDocs.some((d) => d.date === r.date)) allDocs.push(r);
  }
  allDocs.sort((a, b) => b.date.localeCompare(a.date));
  const docs = allDocs.slice(0, 8);

  if (docs.length === 0) {
    return `No documents found for ${company.name}. Respond with exactly: "No data available for theme tracking."`;
  }

  const docSections = docs
    .map(
      (r, i) =>
        `### Document ${i + 1}: ${r.form} — Period: ${r.period} | Filed: ${r.date}\n\n${r.text.slice(0, 5000)}\n`
    )
    .join("\n---\n\n");

  const periodLabels = docs.map((d) => d.period).join(" | ");

  const earningsContext = tabContext?.earnings
    ? `\n\n---\n\n## EARNINGS CALLS ANALYSIS (already completed — use to cross-reference themes, do not repeat verbatim)\n\n${tabContext.earnings.slice(0, 3000)}\n\n---\n`
    : "";

  return `You are a strategic communications analyst. Identify and track key management narrative themes across earnings periods for ${company.name} (${company.ticker ?? "N/A"}).

**Style rules:**
- 400–550 words maximum (excluding the confidence block)
- Use tables where helpful — they are strongly preferred for the theme inventory
- No filler phrases
- Only reference themes from the provided documents
- Be specific: name actual themes management discusses (e.g. "AI integration", "margin expansion", "supply chain normalization")

## COMPANY: ${company.name} (${company.ticker ?? "N/A"})
Periods covered (newest first): ${periodLabels}
${earningsContext}
---

## EARNINGS DOCUMENTS (${docs.length} periods)

${docSections}

---

## REPORT STRUCTURE

### 1. THEME INVENTORY TABLE
Track the main themes across all periods. Column headers should be the actual period dates.
Use these symbols:
- ● = Emphasized
- ◐ = Mentioned briefly
- ○ = Absent
- ↑ = Intensifying
- ↓ = Fading

| Theme | [Period 1] | [Period 2] | [Period 3] | [Period 4] | Trajectory |
|-------|-----------|-----------|-----------|-----------|------------|

### 2. EMERGING THEMES
Themes introduced in the 1–2 most recent periods. What new narratives is management establishing?

### 3. DROPPED THEMES
Topics prominent early that have since diminished or disappeared. What is management moving away from?

### 4. PERSISTENT THEMES
Core narratives appearing consistently across all periods — management's stable long-term story.

### 5. STRATEGIC NARRATIVE SHIFT
One paragraph: how has the overall narrative evolved from the earliest to the most recent period?${CONFIDENCE_BLOCK}`;
}

// ── Streaming helper ──────────────────────────────────────────────────────────

// Retry with exponential backoff on overloaded errors, fall back to Sonnet
const MODELS = ["claude-opus-4-6", "claude-sonnet-4-6"] as const;
const MAX_RETRIES = 4;

async function streamSection(
  section: TabName,
  prompt: string,
  send: (event: object) => void
): Promise<void> {
  send({ type: "section_start", section });

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // After 2 failed attempts on Opus, switch to Sonnet
    const model = attempt >= 2 ? MODELS[1] : MODELS[0];

    try {
      const claudeStream = await anthropic.messages.stream({
        model,
        max_tokens: 3000,
        thinking: { type: "adaptive" },
        messages: [{ role: "user", content: prompt }],
      });

      for await (const chunk of claudeStream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          send({ type: "text", content: chunk.delta.text, section });
        }
      }

      send({ type: "section_done", section });
      return; // success
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isOverloaded =
        msg.includes("overloaded") || msg.includes("529") || msg.includes("529");

      if (!isOverloaded) throw err; // non-retryable error

      // Exponential backoff: 2s, 4s, 8s, 16s
      const delay = 2000 * Math.pow(2, attempt);
      send({
        type: "status",
        message: `API busy — retrying in ${delay / 1000}s (${attempt + 1}/${MAX_RETRIES})…`,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CompanyInfo & {
    quarters?: number;
    section?: TabName;
    tabContext?: { earnings?: string; financials?: string; themes?: string };
  };
  const { cik, name, ticker } = body;
  const quarters = Math.min(Math.max(body.quarters ?? 4, 2), 8);
  const sectionOnly = body.section ?? null;
  const tabContext = body.tabContext ?? {};

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
        send({ type: "status", message: "Fetching SEC EDGAR data…" });

        // Fetch all data sources in parallel
        const [transcriptResult, releasesResult, financialsResult, metaResult] =
          await Promise.allSettled([
            getTranscripts(cik, quarters),
            getEarningsReleases(cik, quarters),
            getFinancialSummary(cik),
            getCompanyInfo(cik),
          ]);

        const transcripts =
          transcriptResult.status === "fulfilled" ? transcriptResult.value : [];
        const releases =
          releasesResult.status === "fulfilled" ? releasesResult.value : [];
        const financials =
          financialsResult.status === "fulfilled" ? financialsResult.value : null;
        const meta =
          metaResult.status === "fulfilled" ? metaResult.value : null;

        const financialTable = financials
          ? formatFinancialSummary(financials, quarters)
          : "Financial data not available for this company.";

        const company: CompanyMeta = {
          cik,
          name,
          ticker,
          sic: meta?.sic,
          sicDescription: meta?.sicDescription,
        };

        const hasFinancialData =
          releases.length > 0 ||
          financialTable !== "Financial data not available for this company.";

        // Emit metadata so the client can show which periods were analyzed
        const metaPayload: AnalysisMeta = {
          transcripts: transcripts.map((r) => ({
            date: r.date,
            period: r.period,
            form: r.form,
            isTranscript: r.isTranscript ?? false,
          })),
          releases: releases.map((r) => ({
            date: r.date,
            period: r.period,
            form: r.form,
          })),
        };
        send({ type: "meta", meta: metaPayload });

        send({
          type: "status",
          message: `Found ${transcripts.length} transcript(s), ${releases.length} filing(s). Running analysis…`,
        });

        const earningsPrompt = buildEarningsPrompt(company, transcripts, releases, tabContext);
        const financialsPrompt = buildFinancialsPrompt(company, releases, financialTable, hasFinancialData);
        const themesPrompt = buildThemesPrompt(company, transcripts, releases, tabContext);

        if (sectionOnly === "earnings") {
          send({ type: "status", message: "Refreshing earnings calls analysis…" });
          await streamSection("earnings", earningsPrompt, send);
        } else if (sectionOnly === "financials") {
          send({ type: "status", message: "Refreshing financial filing analysis…" });
          await streamSection("financials", financialsPrompt, send);
        } else if (sectionOnly === "themes") {
          send({ type: "status", message: "Refreshing theme tracker…" });
          await streamSection("themes", themesPrompt, send);
        } else {
          // Full analysis — all three sections
          send({ type: "status", message: "Analyzing earnings calls…" });
          await streamSection("earnings", earningsPrompt, send);

          send({ type: "status", message: "Analyzing financial filings…" });
          await streamSection("financials", financialsPrompt, send);

          send({ type: "status", message: "Tracking themes across periods…" });
          await streamSection("themes", themesPrompt, send);
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
