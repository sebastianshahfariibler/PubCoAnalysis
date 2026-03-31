"use client";

import { useState, useCallback, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import SearchBar from "@/components/SearchBar";
import AnalysisReport from "@/components/AnalysisReport";
import CompetitorPanel from "@/components/CompetitorPanel";
import { AnalysisRecord, CompanyInfo } from "@/types";

// localStorage helpers (safe for SSR)
function loadHistory(): AnalysisRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("esa_history") ?? "[]");
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
  | { kind: "analyzing"; company: CompanyInfo; text: string; statusMsg: string }
  | { kind: "viewing"; record: AnalysisRecord };

export default function Home() {
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const [mode, setMode] = useState<AppMode>({ kind: "idle" });
  const [showSidebar, setShowSidebar] = useState(true);

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleCompanySelect = useCallback(async (company: CompanyInfo) => {
    setMode({ kind: "analyzing", company, text: "", statusMsg: "Connecting to SEC EDGAR…" });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

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
            };

            if (event.type === "status" && event.message) {
              setMode((prev) =>
                prev.kind === "analyzing"
                  ? { ...prev, statusMsg: event.message! }
                  : prev
              );
            } else if (event.type === "text" && event.content) {
              fullText += event.content;
              const captured = fullText;
              setMode((prev) =>
                prev.kind === "analyzing"
                  ? { ...prev, text: captured }
                  : prev
              );
            } else if (event.type === "done") {
              const record: AnalysisRecord = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                company,
                timestamp: Date.now(),
                analysis: fullText,
              };
              setHistory((prev) => {
                const updated = [record, ...prev];
                saveHistory(updated);
                return updated;
              });
              setMode({ kind: "viewing", record });
            } else if (event.type === "error") {
              setMode({
                kind: "analyzing",
                company,
                text: fullText,
                statusMsg: `Error: ${event.message ?? "Unknown error"}`,
              });
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
  }, []);

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

  const currentText =
    mode.kind === "analyzing"
      ? mode.text
      : mode.kind === "viewing"
      ? mode.record.analysis
      : "";

  const isStreaming = mode.kind === "analyzing";

  const statusMsg =
    mode.kind === "analyzing" ? mode.statusMsg : undefined;

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

          {/* Idle state: show search */}
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

              <AnalysisReport
                company={currentCompany}
                text={currentText}
                isStreaming={isStreaming}
                statusMessage={statusMsg}
              />

              {/* Competitor analysis button — only after streaming is done */}
              {mode.kind === "viewing" && (
                <CompetitorPanel company={mode.record.company} />
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
