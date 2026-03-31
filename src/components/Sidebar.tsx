"use client";

import { AnalysisRecord } from "@/types";

interface SidebarProps {
  analyses: AnalysisRecord[];
  selectedId?: string;
  onSelect: (record: AnalysisRecord) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function Sidebar({
  analyses,
  selectedId,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  return (
    <aside
      style={{
        width: 264,
        minWidth: 264,
        background: "#111114",
        borderRight: "1px solid #1e1e28",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 14px 12px",
          borderBottom: "1px solid #1e1e28",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
          >
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#e0e0f0",
              letterSpacing: "0.02em",
            }}
          >
            Strategy Analyzer
          </span>
        </div>
        <button
          onClick={onNew}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: "#1e1e2c",
            border: "1px solid #2a2a3a",
            borderRadius: 8,
            color: "#c0c0d8",
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "#25253a")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "#1e1e2c")
          }
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Analysis
        </button>
      </div>

      {/* History list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {analyses.length === 0 ? (
          <div
            style={{
              padding: "32px 12px",
              textAlign: "center",
              color: "#555565",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ margin: "0 auto 8px", display: "block", opacity: 0.4 }}
            >
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
            </svg>
            No analyses yet.
            <br />
            Search for a company to begin.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {analyses.map((rec) => (
              <div
                key={rec.id}
                onClick={() => onSelect(rec)}
                style={{
                  padding: "9px 10px",
                  borderRadius: 7,
                  cursor: "pointer",
                  background:
                    selectedId === rec.id ? "#1e1e30" : "transparent",
                  border:
                    selectedId === rec.id
                      ? "1px solid #2e2e48"
                      : "1px solid transparent",
                  transition: "all 0.12s",
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
                onMouseEnter={(e) => {
                  if (selectedId !== rec.id) {
                    e.currentTarget.style.background = "#171722";
                  }
                  // Show delete button
                  const btn = e.currentTarget.querySelector(
                    ".delete-btn"
                  ) as HTMLElement | null;
                  if (btn) btn.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  if (selectedId !== rec.id) {
                    e.currentTarget.style.background = "transparent";
                  }
                  const btn = e.currentTarget.querySelector(
                    ".delete-btn"
                  ) as HTMLElement | null;
                  if (btn) btn.style.opacity = "0";
                }}
              >
                {/* Ticker badge */}
                <div
                  style={{
                    background: "#1a2a4a",
                    color: "#60a5fa",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    letterSpacing: "0.05em",
                    minWidth: 36,
                    textAlign: "center",
                    marginTop: 1,
                    flexShrink: 0,
                  }}
                >
                  {rec.company.ticker}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color:
                        selectedId === rec.id ? "#e0e0f8" : "#c0c0d8",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {rec.company.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#606075",
                      marginTop: 2,
                    }}
                  >
                    {timeAgo(rec.timestamp)}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(rec.id);
                  }}
                  style={{
                    opacity: 0,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#505065",
                    padding: "2px 3px",
                    borderRadius: 4,
                    transition: "all 0.12s",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#f87171";
                    e.currentTarget.style.background = "#2a1515";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#505065";
                    e.currentTarget.style.background = "none";
                  }}
                  title="Delete"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid #1e1e28",
          fontSize: 11,
          color: "#404050",
          textAlign: "center",
        }}
      >
        {analyses.length > 0 && `${analyses.length} saved • `}Stored locally
      </div>
    </aside>
  );
}
