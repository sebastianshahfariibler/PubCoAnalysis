"use client";

import { useState, useCallback, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import SearchBar from "@/components/SearchBar";
import QuarterSelector from "@/components/QuarterSelector";
import TabView from "@/components/TabView";
import { AnalysisRecord, AnalysisTabs, CompanyInfo, TabName } from "@/types";

// localStorage helpers (safe for SSR)
function loadHistory(): AnalysisRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem("esa_history") ?? "[]") as Array<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    // Migrate old records that stored analysis as a plain string
    return raw.map((r) => {
      if (typeof r.analysis === "string" && !r.tabs) {
        return {
          id: r.id,
          company: r.company,
          timestamp: r.timestamp,
          quarters: 4,
          tabs: { earnings: r.analysis, financials: "", themes: "" } as AnalysisTabs,
        } as AnalysisRecord;
      }
      return r as AnalysisRecord;
    });
  } catch {
    return [];
  }
}

function saveHistory(records: AnalysisRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("esa_history", JSON.stringify(records.slice(0, 50)));
  } catch {}
}

type AppMode =
  | { kind: "idle" }
  | {
      kind: "analyzing";
      company: CompanyInfo;
      quarters: number;
      tabs: Partial<AnalysisTabs>;
      currentSection: TabName | null;
      streamingText: string;
      statusMsg: string;
    }
  | { kind: "viewing"; record: AnalysisRecord };

export default function Home() {
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const [mode, setMode] = useState<AppMode>({ kind: "idle" });
  const [showSidebar, setShowSidebar] = useState(true);
  const [quarters, setQuarters] = useState(4);

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleCompanySelect = useCallback(
    async (company: CompanyInfo) => {
      setMode({
        kind: "analyzing",
        company,
        quarters,
        tabs: {},
        currentSection: null,
        streamingText: "",
        statusMsg: "Connecting to SEC EDGAR…",
      });

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...company, quarters }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        if (!response.body) throw new Error("No response stream");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Local vars to accumulate section text across closures
        let currentSection: TabName | null = null;
        let sectionText = "";
        const completedTabs: Partial<AnalysisTabs> = {};

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                content?: string;
                message?: string;
                section?: TabName;
              };

              if (event.type === "status" && event.message) {
                setMode((prev) =>
                  prev.kind === "analyzing"
                    ? { ...prev, statusMsg: event.message! }
                    : prev
                );
              } else if (event.type === "section_start" && event.section) {
                currentSection = event.section;
                sectionText = "";
                setMode((prev) =>
                  prev.kind === "analyzing"
                    ? { ...prev, currentSection: event.section!, streamingText: "" }
                    : prev
                );
              } else if (event.type === "text" && event.content) {
                sectionText += event.content;
                const captured = sectionText;
                setMode((prev) =>
                  prev.kind === "analyzing"
                    ? { ...prev, streamingText: captured }
                    : prev
                );
              } else if (event.type === "section_done" && currentSection) {
                completedTabs[currentSection] = sectionText;
                const snapshot = { ...completedTabs };
                setMode((prev) =>
                  prev.kind === "analyzing"
                    ? { ...prev, tabs: snapshot, streamingText: "", currentSection: null }
                    : prev
                );
                currentSection = null;
                sectionText = "";
              } else if (event.type === "done") {
                const record: AnalysisRecord = {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  company,
                  timestamp: Date.now(),
                  quarters,
                  tabs: {
                    earnings: completedTabs.earnings ?? "",
                    financials: completedTabs.financials ?? "",
                    themes: completedTabs.themes ?? "",
                  },
                };
                setHistory((prev) => {
                  const updated = [record, ...prev];
                  saveHistory(updated);
                  return updated;
                });
                setMode({ kind: "viewing", record });
              } else if (event.type === "error") {
                setMode((prev) =>
                  prev.kind === "analyzing"
                    ? { ...prev, statusMsg: `Error: ${event.message ?? "Unknown error"}` }
                    : prev
                );
              }
            } catch {}
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Analysis failed";
        setMode((prev) =>
          prev.kind === "analyzing"
            ? { ...prev, statusMsg: `Error: ${message}` }
            : prev
        );
      }
    },
    [quarters]
  );

  function handleSelectRecord(record: AnalysisRecord) {
    setMode({ kind: "viewing", record });
  }

  function handleNew() {
    setMode({ kind: "idle" });
  }

  function handleDelete(id: string) {
    setHistory((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      saveHistory(updated);
      return updated;
    });
    if (mode.kind === "viewing" && mode.record.id === id) {
      setMode({ kind: "idle" });
    }
  }

  const currentCompany =
    mode.kind === "analyzing"
      ? mode.company
      : mode.kind === "viewing"
      ? mode.record.company
      : null;

  const isStreaming = mode.kind === "analyzing";

  const selectedId =
    mode.kind === "viewing" ? mode.record.id : undefined;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#0c0c0e",
        overflow: "hidden",
      }}
    >
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setShowSidebar((v) => !v)}
        style={{
          display: "none",
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 100,
          background: "#18181e",
          border: "1px solid #2a2a38",
          borderRadius: 8,
          padding: "8px",
          cursor: "pointer",
          color: "#c0c0d8",
        }}
        className="sidebar-toggle"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>

      {/* Sidebar */}
      {showSidebar && (
        <Sidebar
          analyses={history}
          selectedId={selectedId}
          onSelect={handleSelectRecord}
          onNew={handleNew}
          onDelete={handleDelete}
        />
      )}

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}>
          {/* Check for missing API key */}
          {typeof window !== "undefined" &&
            !process.env.NEXT_PUBLIC_HAS_API_KEY && (
              <div
                style={{
                  background: "#1c1814",
                  border: "1px solid #3a3020",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 20,
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  fontSize: 13,
                  color: "#c0a070",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <span>
                  Set your{" "}
                  <code
                    style={{
                      background: "#2a2010",
                      padding: "1px 5px",
                      borderRadius: 3,
                    }}
                  >
                    ANTHROPIC_API_KEY
                  </code>{" "}
                  in <code style={{ background: "#2a2010", padding: "1px 5px", borderRadius: 3 }}>.env.local</code> to enable AI analysis.
                  See <code style={{ background: "#2a2010", padding: "1px 5px", borderRadius: 3 }}>.env.example</code> for setup instructions.
                </span>
              </div>
            )}

          {/* Idle state: show search + quarter selector */}
          {mode.kind === "idle" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "calc(100vh - 120px)",
              }}
            >
              <div style={{ width: "100%" }}>
                <SearchBar onCompanySelect={handleCompanySelect} />
                <QuarterSelector value={quarters} onChange={setQuarters} />
              </div>
            </div>
          )}

          {/* Analyzing or viewing */}
          {mode.kind !== "idle" && currentCompany && (
            <>
              {/* Back / new button */}
              {!isStreaming && (
                <div style={{ marginBottom: 20 }}>
                  <button
                    onClick={handleNew}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#6060a0",
                      cursor: "pointer",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 0",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#9090c0")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "#6060a0")
                    }
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    New analysis
                  </button>
                </div>
              )}

              {mode.kind === "analyzing" && (
                <TabView
                  company={currentCompany}
                  tabs={mode.tabs}
                  currentSection={mode.currentSection}
                  streamingText={mode.streamingText}
                  isStreaming={true}
                  statusMessage={mode.statusMsg}
                  quarters={mode.quarters}
                />
              )}

              {mode.kind === "viewing" && (
                <TabView
                  company={currentCompany}
                  tabs={mode.record.tabs}
                  currentSection={null}
                  streamingText=""
                  isStreaming={false}
                  quarters={mode.record.quarters}
                />
              )}
            </>
          )}
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .sidebar-toggle { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
