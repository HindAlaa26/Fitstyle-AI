import { Product, GarmentCategory } from "../types";
import { authFetch } from "./authFetch";

export type RecoItem = Product & { garmentCategory: GarmentCategory; articleType?: string };

export interface RecoExplanation {
  headline?: string;
  explanation?: string;
  why_this_one?: string;
}

export interface RecoOutfit {
  id: string;
  rank: number;
  type: string;
  matchScore: number;
  score: number;
  explanation: RecoExplanation | null;
  items: RecoItem[];
}

export interface RecoProfileParams {
  size: string;
  bodyShape: string; // "Pear" or "inverted_triangle" - the server normalises both
  occasion: string;  // "Casual" | "Formal" | "Party" | "Wedding" | "Interview"
  season?: string;   // optional - server defaults to the current season
}

export interface RecoResponse {
  profile: { size: string; bodyShape: string; occasion: string; season: string };
  level: number;      // 0 = exact match, 1 = season relaxed, 2 = season + usage relaxed
  relaxed: string[];
  outfits: RecoOutfit[];
}

/** The catalogue has no XS/XXL stock - same mapping the server applies. */
export const toCatalogSize = (size: string): string => {
  const s = String(size || "M").trim().toUpperCase();
  return s === "XS" ? "S" : s === "XXL" ? "XL" : s;
};

const toQuery = (p: RecoProfileParams) => {
  const q = new URLSearchParams({ size: p.size, bodyShape: p.bodyShape, occasion: p.occasion });
  if (p.season) q.set("season", p.season);
  return q;
};

async function readError(res: Response): Promise<string> {
  try { return (await res.json()).error || `Request failed (${res.status})`; } catch { return `Request failed (${res.status})`; }
}

export async function fetchRecommendations(p: RecoProfileParams): Promise<RecoResponse> {
  const res = await authFetch(`/api/recommendations?${toQuery(p)}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchAlternatives(p: RecoProfileParams, category: GarmentCategory): Promise<RecoItem[]> {
  const q = toQuery(p);
  q.set("category", category);
  const res = await authFetch(`/api/recommendations/alternatives?${q}`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()).items as RecoItem[];
}

export async function fetchExplanation(p: RecoProfileParams, productIds: string[]): Promise<RecoExplanation> {
  const res = await authFetch(`/api/recommendations/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...p, productIds }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
