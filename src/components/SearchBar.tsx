"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CompanyInfo } from "@/types";

interface SearchBarProps {
  onCompanySelect: (company: CompanyInfo) => void;
}

export default function SearchBar({ onCompanySelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}`
      );
      const data: CompanyInfo[] = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setShowDropdown(true);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchResults(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchResults]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  function handleSelect(company: CompanyInfo) {
    setQuery(company.name);
    setShowDropdown(false);
    setActiveIndex(-1);
    onCompanySelect(company);
  }

  return (
    <div
      ref={containerRef}
      style={{
        maxWidth: 600,
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* Hero text */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            width: 56,
            height: 56,
            background: "linear-gradient(135deg, #1a3a6a, #1e1e40)",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            border: "1px solid #2a3a5a",
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="1.8"
          >
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "#e8e8f8",
            margin: "0 0 8px",
          }}
        >
          Earnings Strategy Analyzer
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#70708a",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          Search any US public company to analyze its last 4 earnings filings,
          <br />
          financial performance, and strategic execution.
        </p>
      </div>

      {/* Search input */}
      <div style={{ position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: "#505068",
          }}
        >
          {isLoading ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                animation: "spin 0.8s linear infinite",
              }}
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          placeholder="Search by company name or ticker (e.g. Apple, AAPL)"
          autoComplete="off"
          autoFocus
          style={{
            width: "100%",
            padding: "14px 14px 14px 44px",
            background: "#18181e",
            border: "1.5px solid #2a2a38",
            borderRadius: 12,
            color: "#e8e8f8",
            fontSize: 15,
            outline: "none",
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = "#3a3a58")
          }
          onMouseLeave={(e) => {
            if (document.activeElement !== e.currentTarget) {
              e.currentTarget.style.borderColor = "#2a2a38";
            }
          }}
          onFocusCapture={(e) =>
            (e.currentTarget.style.borderColor = "#3b82f6")
          }
          onBlurCapture={(e) =>
            (e.currentTarget.style.borderColor = "#2a2a38")
          }
        />

        {/* Autocomplete dropdown */}
        {showDropdown && results.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              background: "#18181e",
              border: "1px solid #2a2a38",
              borderRadius: 10,
              overflow: "hidden",
              zIndex: 50,
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            {results.map((company, i) => (
              <div
                key={company.cik}
                onMouseDown={() => handleSelect(company)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  background: activeIndex === i ? "#1e1e2e" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderBottom:
                    i < results.length - 1
                      ? "1px solid #1e1e28"
                      : "none",
                  transition: "background 0.1s",
                }}
              >
                <span
                  style={{
                    background: "#1a2a4a",
                    color: "#60a5fa",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 5,
                    letterSpacing: "0.04em",
                    minWidth: 42,
                    textAlign: "center",
                    flexShrink: 0,
                  }}
                >
                  {company.ticker}
                </span>
                <span
                  style={{
                    fontSize: 13.5,
                    color: activeIndex === i ? "#e8e8f8" : "#c0c0d8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {company.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#404055",
                    marginLeft: "auto",
                    flexShrink: 0,
                  }}
                >
                  CIK {company.cik}
                </span>
              </div>
            ))}
          </div>
        )}

        {showDropdown && !isLoading && query.length > 1 && results.length === 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              background: "#18181e",
              border: "1px solid #2a2a38",
              borderRadius: 10,
              padding: "16px 14px",
              textAlign: "center",
              color: "#505068",
              fontSize: 13,
              zIndex: 50,
            }}
          >
            No companies found for &ldquo;{query}&rdquo;
          </div>
        )}
      </div>

      {/* Tips */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginTop: 16,
          flexWrap: "wrap",
        }}
      >
        {["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"].map((ticker) => (
          <button
            key={ticker}
            onClick={() => {
              setQuery(ticker);
              fetchResults(ticker);
            }}
            style={{
              background: "#1a1a28",
              border: "1px solid #2a2a3a",
              borderRadius: 6,
              padding: "4px 10px",
              color: "#8080a8",
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#3b82f6";
              e.currentTarget.style.color = "#60a5fa";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#2a2a3a";
              e.currentTarget.style.color = "#8080a8";
            }}
          >
            {ticker}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
