"use client";

import { CompanyInfo } from "@/types";

interface AnalysisReportProps {
  company: CompanyInfo | null;
  text: string;
  isStreaming: boolean;
  statusMessage?: string;
}

// Minimal markdown renderer (no external deps)
function renderMarkdown(text: string): React.ReactNode[] {
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
    const body = rows.slice(2); // skip separator row
    nodes.push(
      <div
        key={key++}
        style={{ overflowX: "auto", margin: "12px 0" }}
      >
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

  function inlineFormat(text: string): React.ReactNode {
    // Handle **bold**, *italic*, `code`, and footnotes [¹]
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
        return (
          <em key={i} style={{ color: "#a8a8c0" }}>
            {part.slice(1, -1)}
          </em>
        );
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table detection
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

    // H2
    if (line.startsWith("## ")) {
      const title = line.slice(3);
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
          {inlineFormat(title)}
        </h2>
      );
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      const title = line.slice(4);
      nodes.push(
        <h3
          key={key++}
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#d0d0e8",
            margin: "18px 0 6px",
          }}
        >
          {inlineFormat(title)}
        </h3>
      );
      continue;
    }

    // H4
    if (line.startsWith("#### ")) {
      nodes.push(
        <h4
          key={key++}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#c0c0d8",
            margin: "12px 0 4px",
          }}
        >
          {inlineFormat(line.slice(5))}
        </h4>
      );
      continue;
    }

    // Blockquote
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

    // Horizontal rule
    if (line.trim() === "---" || line.trim() === "***") {
      nodes.push(
        <hr
          key={key++}
          style={{ border: "none", borderTop: "1px solid #1e1e2a", margin: "16px 0" }}
        />
      );
      continue;
    }

    // Unordered list
    if (line.match(/^[-*+] /)) {
      nodes.push(
        <div
          key={key++}
          style={{
            display: "flex",
            gap: 8,
            padding: "2px 0",
            fontSize: 13.5,
            color: "#c0c0d0",
            lineHeight: 1.65,
          }}
        >
          <span style={{ color: "#404060", flexShrink: 0, marginTop: 2 }}>
            •
          </span>
          <span>{inlineFormat(line.replace(/^[-*+] /, ""))}</span>
        </div>
      );
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\. /);
    if (numMatch) {
      nodes.push(
        <div
          key={key++}
          style={{
            display: "flex",
            gap: 8,
            padding: "2px 0",
            fontSize: 13.5,
            color: "#c0c0d0",
            lineHeight: 1.65,
          }}
        >
          <span
            style={{
              color: "#505070",
              flexShrink: 0,
              minWidth: 18,
              textAlign: "right",
            }}
          >
            {numMatch[1]}.
          </span>
          <span>{inlineFormat(line.replace(/^\d+\. /, ""))}</span>
        </div>
      );
      continue;
    }

    // Regular paragraph
    nodes.push(
      <p
        key={key++}
        style={{
          fontSize: 13.5,
          color: "#b8b8cc",
          lineHeight: 1.7,
          margin: "3px 0",
        }}
      >
        {inlineFormat(line)}
      </p>
    );
  }

  flushTable();
  return nodes;
}

export default function AnalysisReport({
  company,
  text,
  isStreaming,
  statusMessage,
}: AnalysisReportProps) {
  if (!company) return null;

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
          <span
            style={{
              color: "#60a5fa",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            {company.ticker}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e0e0f0" }}>
            {company.name}
          </div>
          <div style={{ fontSize: 12, color: "#606078", marginTop: 2 }}>
            SEC EDGAR • CIK {company.cik}
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
            Analyzing…
          </div>
        )}
      </div>

      {/* Status message while loading */}
      {isStreaming && statusMessage && !text && (
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
            {statusMessage}
          </div>
        </div>
      )}

      {/* Analysis content */}
      {text && (
        <div
          style={{
            background: "#14141c",
            border: "1px solid #2a2a38",
            borderRadius: 12,
            padding: "24px 28px",
          }}
        >
          <div className={isStreaming ? "streaming-cursor" : ""}>
            {renderMarkdown(text)}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
