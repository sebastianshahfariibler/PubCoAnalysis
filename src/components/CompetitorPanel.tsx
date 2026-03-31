"use client";

import { useState, useCallback } from "react";
import { CompanyInfo } from "@/types";
import AnalysisReport from "./AnalysisReport";

interface CompetitorPanelProps {
  company: CompanyInfo;
}

export default function CompetitorPanel({ company }: CompetitorPanelProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [text, setText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const runAnalysis = useCallback(async () => {
    setStatus("loading");
    setText("");
    setStatusMsg("Identifying competitors…");

    try {
      const response = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
              setStatusMsg(event.message);
            } else if (event.type === "text" && event.content) {
              setText((prev) => prev + event.content);
            } else if (event.type === "done") {
              setStatus("done");
            } else if (event.type === "error") {
              setStatusMsg(event.message ?? "An error occurred.");
              setStatus("error");
            }
          } catch {}
        }
      }

      if (status !== "error") setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Competitor analysis failed.";
      setStatusMsg(msg);
      setStatus("error");
    }
  }, [company, status]);

  if (status === "idle") {
    return (
      <div style={{ marginTop: 28, textAlign: "center" }}>
        <div
          style={{
            background: "#14141c",
            border: "1px dashed #2a2a38",
            borderRadius: 12,
            padding: "28px 20px",
          }}
        >
          <div
            style={{ fontSize: 13, color: "#606078", marginBottom: 14 }}
          >
            Compare {company.name} against its main public competitors
          </div>
          <button
            onClick={runAnalysis}
            style={{
              background: "linear-gradient(135deg, #1e3a6a, #1a1a50)",
              border: "1px solid #2a3a6a",
              borderRadius: 9,
              padding: "10px 24px",
              color: "#90c0ff",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background =
                "linear-gradient(135deg, #253d70, #20205a)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background =
                "linear-gradient(135deg, #1e3a6a, #1a1a50)")
            }
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6" />
            </svg>
            Run Competitor Analysis
          </button>
          <div
            style={{ fontSize: 11, color: "#404055", marginTop: 10 }}
          >
            AI-powered comparison using SEC EDGAR data • Takes ~30–60s
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ marginTop: 28 }}>
        <div
          style={{
            background: "#1c1414",
            border: "1px solid #3a2020",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f87171"
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span style={{ fontSize: 13, color: "#d08080" }}>{statusMsg}</span>
          <button
            onClick={() => {
              setStatus("idle");
              setText("");
            }}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "1px solid #3a2020",
              borderRadius: 6,
              padding: "4px 10px",
              color: "#a06060",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: "1px solid #1e1e28",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#60a5fa"
          strokeWidth="2"
        >
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6" />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#d0d0e8" }}>
          Competitor Analysis
        </span>
      </div>

      <AnalysisReport
        company={company}
        text={text}
        isStreaming={status === "loading"}
        statusMessage={statusMsg}
      />
    </div>
  );
}
