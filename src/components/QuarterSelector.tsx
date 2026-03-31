"use client";

interface QuarterSelectorProps {
  value: number;
  onChange: (quarters: number) => void;
}

const OPTIONS = [2, 4, 6, 8];

export default function QuarterSelector({ value, onChange }: QuarterSelectorProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginTop: 16,
      }}
    >
      <span style={{ fontSize: 12, color: "#505068", marginRight: 4 }}>
        Quarters to analyze:
      </span>
      {OPTIONS.map((q) => (
        <button
          key={q}
          onClick={() => onChange(q)}
          style={{
            background: value === q ? "#1a2a4a" : "#14141e",
            border: `1px solid ${value === q ? "#3b82f6" : "#2a2a3a"}`,
            borderRadius: 6,
            padding: "4px 12px",
            color: value === q ? "#60a5fa" : "#606080",
            fontSize: 12,
            fontWeight: value === q ? 700 : 400,
            cursor: "pointer",
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => {
            if (value !== q) {
              e.currentTarget.style.borderColor = "#3a3a5a";
              e.currentTarget.style.color = "#9090b8";
            }
          }}
          onMouseLeave={(e) => {
            if (value !== q) {
              e.currentTarget.style.borderColor = "#2a2a3a";
              e.currentTarget.style.color = "#606080";
            }
          }}
        >
          {q}Q
        </button>
      ))}
    </div>
  );
}
