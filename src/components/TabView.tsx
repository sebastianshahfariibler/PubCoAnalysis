"use client";

import { useState, useEffect, useRef } from "react";
import { CompanyInfo, AnalysisTabs, TabName } from "@/types";
import CompetitorPanel from "./CompetitorPanel";

type TabViewTab = TabName | "competitive";

interface TabViewProps {
  company: CompanyInfo;
  tabs: Partial<AnalysisTabs>;
  currentSection: TabName | null;
  streamingText: string;
  isStreaming: boolean;
  statusMessage?: string;
  quarters: number;
}

const TAB_CONFIG: { id: TabViewTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "earnings",
    label: "Earnings Calls",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "financials",
    label: "Financial Filing",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
  },
  {
    id: "themes",
    label: "Theme Tracker",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M3 12h3M18 12h3M12 3v3M12 18v3" />
        <path d="m5.64 5.64 2.12 2.12M16.24 16.24l2.12 2.12M5.64 18.36l2.12-2.12M16.24 7.76l2.12-2.12" />
      </svg>
    ),
  },
  {
    id: "competitive",
    label: "Competitive Analysis",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6" />
      </svg>
    ),
  },
];

// ── Minimal markdown renderer ─────────────────────────────────────────────────

function inlineFormat(text: string): React.ReactNode {
  const parts = text.split(
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[\u00B9\u00B2\u00B3\d]+\])/
  );
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ color: "#e0e0f0", fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i} style={{ color: "#a8a8c0" }}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          style={{
            background: "#1e1e2a",
            border: "1px solid #2a2a3a",
            borderRadius: 3,
            padding: "1px 5px",
            fontSize: "0.85em",
            color: "#82c0ff",
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderMarkdown(text: string, isStreaming: boolean): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let tableBuffer: string[] = [];

  function flushTable() {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer.map((row) =>
      row
        .split("|")
        .filter((_, i, a) => i > 0 && i < a.length - 1)
        .map((c) => c.trim())
    );
    const headers = rows[0] ?? [];
    const body = rows.slice(2);
    nodes.push(
      <div key={key++} style={{ overflowX: "auto", margin: "12px 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    background: "#1e1e28",
                    padding: "7px 12px",
                    textAlign: "left",
                    color: "#d0d0e8",
                    fontWeight: 600,
                    fontSize: 12.5,
                    borderBottom: "2px solid #2a2a3a",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "6px 12px",
                      fontSize: 12.5,
                      color: "#b8b8cc",
                      borderBottom: "1px solid #1e1e2a",
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      tableBuffer.push(line);
      continue;
    } else if (tableBuffer.length > 0) {
      flushTable();
    }

    if (!line.trim()) {
      nodes.push(<div key={key++} style={{ height: 6 }} />);
      continue;
    }
    if (line.startsWith("## ")) {
      nodes.push(
        <h2
          key={key++}
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#f0f0fa",
            margin: "28px 0 10px",
            paddingBottom: 8,
            borderBottom: "1px solid #1e1e2e",
            letterSpacing: "0.01em",
          }}
        >
          {inlineFormat(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      nodes.push(
        <h3
          key={key++}
          style={{ fontSize: 14, fontWeight: 600, color: "#d0d0e8", margin: "18px 0 6px" }}
        >
          {inlineFormat(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith("#### ")) {
      nodes.push(
        <h4
          key={key++}
          style={{ fontSize: 13, fontWeight: 600, color: "#c0c0d8", margin: "12px 0 4px" }}
        >
          {inlineFormat(line.slice(5))}
        </h4>
      );
      continue;
    }
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote
          key={key++}
          style={{
            borderLeft: "3px solid #3b4a6b",
            margin: "8px 0",
            padding: "6px 14px",
            background: "#13131c",
            borderRadius: "0 6px 6px 0",
            color: "#9090b8",
            fontStyle: "italic",
            fontSize: 13,
          }}
        >
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
      continue;
    }
    if (line.trim() === "---" || line.trim() === "***") {
      nodes.push(
        <hr key={key++} style={{ border: "none", borderTop: "1px solid #1e1e2a", margin: "16px 0" }} />
      );
      continue;
    }
    if (line.match(/^[-*+] /)) {
      nodes.push(
        <div
          key={key++}
          style={{ display: "flex", gap: 8, padding: "2px 0", fontSize: 13.5, color: "#c0c0d0", lineHeight: 1.65 }}
        >
          <span style={{ color: "#404060", flexShrink: 0, marginTop: 2 }}>•</span>
          <span>{inlineFormat(line.replace(/^[-*+] /, ""))}</span>
        </div>
      );
      continue;
    }
    const numMatch = line.match(/^(\d+)\. /);
    if (numMatch) {
      nodes.push(
        <div
          key={key++}
          style={{ display: "flex", gap: 8, padding: "2px 0", fontSize: 13.5, color: "#c0c0d0", lineHeight: 1.65 }}
        >
          <span style={{ color: "#505070", flexShrink: 0, minWidth: 18, textAlign: "right" }}>
            {numMatch[1]}.
          </span>
          <span>{inlineFormat(line.replace(/^\d+\. /, ""))}</span>
        </div>
      );
      continue;
    }
    nodes.push(
      <p key={key++} style={{ fontSize: 13.5, color: "#b8b8cc", lineHeight: 1.7, margin: "3px 0" }}>
        {inlineFormat(line)}
      </p>
    );
  }

  flushTable();

  // Streaming cursor on last element
  if (isStreaming && nodes.length > 0) {
    nodes.push(
      <span
        key="cursor"
        style={{
          display: "inline-block",
          width: 2,
          height: "1em",
          background: "#3b82f6",
          marginLeft: 2,
          verticalAlign: "text-bottom",
          animation: "blink 0.8s step-end infinite",
        }}
      />
    );
  }

  return nodes;
}

// ── Tab content ───────────────────────────────────────────────────────────────

function TabContent({
  tabId,
  tabs,
  currentSection,
  streamingText,
  isStreaming,
  statusMessage,
  company,
}: {
  tabId: TabViewTab;
  tabs: Partial<AnalysisTabs>;
  currentSection: TabName | null;
  streamingText: string;
  isStreaming: boolean;
  statusMessage?: string;
  company: CompanyInfo;
}) {
  if (tabId === "competitive") {
    return <CompetitorPanel key={company.cik} company={company} />;
  }

  const isCurrentlyStreaming = currentSection === tabId;
  const completedText = tabs[tabId as TabName] ?? "";
  const displayText = isCurrentlyStreaming ? streamingText : completedText;
  const showStreaming = isCurrentlyStreaming && isStreaming;

  if (!displayText && !isCurrentlyStreaming) {
    // Not started yet
    const isPending = isStreaming;
    return (
      <div
        style={{
          background: "#14141c",
          border: "1px solid #2a2a38",
          borderRadius: 12,
          padding: "40px 20px",
          textAlign: "center",
        }}
      >
        {isPending ? (
          <div style={{ color: "#404058", fontSize: 13 }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2a2a48"
              strokeWidth="2"
              style={{ display: "block", margin: "0 auto 10px" }}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            Analysis queued — will appear shortly
          </div>
        ) : (
          <div style={{ color: "#404058", fontSize: 13 }}>No data available</div>
        )}
      </div>
    );
  }

  // Show loading state while streaming starts for this section
  if (isCurrentlyStreaming && !displayText) {
    return (
      <div
        style={{
          background: "#14141c",
          border: "1px solid #2a2a38",
          borderRadius: 10,
          padding: "20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            color: "#808098",
            fontSize: 13.5,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          {statusMessage ?? "Analyzing…"}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#14141c",
        border: "1px solid #2a2a38",
        borderRadius: 12,
        padding: "24px 28px",
      }}
    >
      {renderMarkdown(displayText, showStreaming)}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TabView({
  company,
  tabs,
  currentSection,
  streamingText,
  isStreaming,
  statusMessage,
  quarters,
}: TabViewProps) {
  const [activeTab, setActiveTab] = useState<TabViewTab>("earnings");
  const userSelectedRef = useRef(false);

  // Auto-follow the currently streaming section unless user manually picked a tab
  useEffect(() => {
    if (currentSection && !userSelectedRef.current) {
      setActiveTab(currentSection);
    }
  }, [currentSection]);

  // Reset user selection on new analysis
  useEffect(() => {
    userSelectedRef.current = false;
    setActiveTab("earnings");
  }, [company.cik]);

  function handleTabClick(tab: TabViewTab) {
    userSelectedRef.current = true;
    setActiveTab(tab);
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Company header */}
      <div
        style={{
          background: "#14141c",
          border: "1px solid #2a2a38",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #1a3a6a, #1a1a3a)",
            border: "1px solid #2a3a5a",
            borderRadius: 10,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#60a5fa", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>
            {company.ticker}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0f0" }}>
            {company.name}
          </div>
          <div style={{ fontSize: 12, color: "#606078", marginTop: 2 }}>
            SEC EDGAR • CIK {company.cik} • {quarters}Q analysis
          </div>
        </div>
        {isStreaming && (
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#60a5fa",
              fontSize: 12,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: "#3b82f6",
                borderRadius: "50%",
                animation: "pulse 1.2s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            {statusMessage ?? "Analyzing…"}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 16,
          background: "#0f0f16",
          border: "1px solid #1e1e2a",
          borderRadius: 10,
          padding: 4,
        }}
      >
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.id;
          const isDone =
            tab.id !== "competitive" && !!tabs[tab.id as TabName];
          const isRunning = currentSection === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 10px",
                background: isActive ? "#1a1a28" : "transparent",
                border: isActive ? "1px solid #2a2a3a" : "1px solid transparent",
                borderRadius: 7,
                color: isActive ? "#d0d0f0" : "#606080",
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = "#9090b8";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = "#606080";
              }}
            >
              <span style={{ color: isActive ? "#60a5fa" : "inherit" }}>
                {tab.icon}
              </span>
              {tab.label}
              {isRunning && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    background: "#3b82f6",
                    borderRadius: "50%",
                    animation: "pulse 1.2s ease-in-out infinite",
                    flexShrink: 0,
                  }}
                />
              )}
              {isDone && !isRunning && (
                <span
                  style={{
                    width: 5,
                    height: 5,
                    background: "#22c55e",
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <TabContent
        tabId={activeTab}
        tabs={tabs}
        currentSection={currentSection}
        streamingText={streamingText}
        isStreaming={isStreaming}
        statusMessage={statusMessage}
        company={company}
      />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
