import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/lib/edgar";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  if (q.length < 1) {
    return NextResponse.json([]);
  }

  try {
    const results = await searchCompanies(q);
    return NextResponse.json(results);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Search failed. Please try again." },
      { status: 500 }
    );
  }
}
