// recommendationService.ts
// Serves FitStyle_recommendation_engine outputs with ZERO ML at runtime.
// The notebook (Colab, free) pre-computes outfits for every
// size x body-shape x occasion x season combination into
// data/recommendation_index.json. This module only looks those up and joins
// them with the LIVE catalogue (dbProducts, loaded from DynamoDB) so prices,
// stock, sizes and images are always current.

import fs from "fs";
import path from "path";

export type GarmentCategory = "Dress" | "Top" | "Bottom" | "Shoes" | "Outerwear" | "Accessory";
export const GARMENT_ORDER: GarmentCategory[] = ["Dress", "Top", "Bottom", "Outerwear", "Shoes", "Accessory"];

interface IndexItem { product_id: string; category: GarmentCategory; article_type?: string; color?: string; name?: string }
interface IndexOutfit {
  outfit_id: string;
  type: string;
  relative_match_score: number;
  recommendation_score: number;
  explanation?: { headline?: string; explanation?: string; why_this_one?: string };
  evidence?: Record<string, any>;
  items: IndexItem[];
}
interface IndexProfile {
  level: number;
  relaxed: string[];
  outfits: IndexOutfit[];
  pools: Record<string, { id: string; rel: number }[]>;
}
interface RecoIndex {
  meta: { image_ids?: string[]; [k: string]: any };
  profiles: Record<string, IndexProfile>;
}

export interface RecoProfile { size: string; bodyShape: string; occasion: string; season: string }

const INDEX_PATH = path.join(process.cwd(), "data", "recommendation_index.json");
let index: RecoIndex | null = null;
let imageIds = new Set<string>();

export function loadRecommendationIndex(): boolean {
  try {
    if (!fs.existsSync(INDEX_PATH)) {
      console.warn(`[Reco] ${INDEX_PATH} not found - recommendation endpoints will return 503 until it is added.`);
      return false;
    }
    index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as RecoIndex;
    imageIds = new Set((index.meta?.image_ids || []).map(String));
    console.log(`[Reco] Loaded ${Object.keys(index.profiles).length} profiles from recommendation_index.json`);
    return true;
  } catch (err) {
    console.error("[Reco] Failed to load recommendation index:", err);
    index = null;
    return false;
  }
}

export const isRecommendationIndexReady = () => index !== null;
/** Product ids whose thumbnail was uploaded to Supabase by the notebook export. */
export const hasCatalogImage = (id: string) => imageIds.has(String(id));

const BODY_SHAPES = ["pear", "hourglass", "apple", "rectangle", "inverted_triangle"];
const OCCASIONS = ["casual", "formal", "party", "interview", "wedding"];
const SEASONS = ["summer", "winter", "fall", "spring"];
const SIZES = ["S", "M", "L", "XL"];

export function currentSeason(date = new Date()): string {
  const m = date.getMonth(); // 0-11 (northern hemisphere)
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}

export function normalizeProfile(q: Record<string, any>): { profile?: RecoProfile; error?: string } {
  let size = String(q.size || "M").trim().toUpperCase();
  if (size === "XS") size = "S"; // catalogue has no XS stock
  if (size === "XXL") size = "XL";
  const bodyShape = String(q.bodyShape || "").trim().toLowerCase().replace(/\s+/g, "_");
  const occasion = String(q.occasion || "casual").trim().toLowerCase();
  const season = String(q.season || currentSeason()).trim().toLowerCase();
  if (!SIZES.includes(size)) return { error: `size must be one of ${SIZES.join(", ")}` };
  if (!BODY_SHAPES.includes(bodyShape)) return { error: `bodyShape must be one of ${BODY_SHAPES.join(", ")}` };
  if (!OCCASIONS.includes(occasion)) return { error: `occasion must be one of ${OCCASIONS.join(", ")}` };
  if (!SEASONS.includes(season)) return { error: `season must be one of ${SEASONS.join(", ")}` };
  return { profile: { size, bodyShape, occasion, season } };
}

export const profileKey = (p: RecoProfile) => `${p.size}|${p.bodyShape}|${p.occasion}|${p.season}`;

function isPurchasable(product: any, size: string): boolean {
  if (!product || product.inStock === false) return false;
  if (typeof product.quantity === "number" && product.quantity <= 0) return false;
  const sizes = String(product.size || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return sizes.length === 0 || sizes.includes(size);
}

function productMap(products: any[]) {
  const map = new Map<string, any>();
  for (const p of products) map.set(String(p.id), p);
  return map;
}

export function buildRecommendations(profile: RecoProfile, products: any[]) {
  if (!index) return { status: 503 as const, error: "Recommendation index not built yet" };
  const entry = index.profiles[profileKey(profile)];
  if (!entry) return { status: 404 as const, error: "No recommendations for this profile" };

  const byId = productMap(products);
  const outfits: any[] = [];
  for (const o of entry.outfits) {
    const items: any[] = [];
    let ok = true;
    for (const it of o.items) {
      const p = byId.get(String(it.product_id));
      if (!isPurchasable(p, profile.size)) { ok = false; break; }
      items.push({ ...p, size: profile.size, availableSizes: p.size, garmentCategory: it.category, articleType: it.article_type || "" });
    }
    if (!ok || items.length === 0) continue; // drop outfits whose pieces are gone / out of stock
    items.sort((a, b) => GARMENT_ORDER.indexOf(a.garmentCategory) - GARMENT_ORDER.indexOf(b.garmentCategory));
    outfits.push({
      id: o.outfit_id,
      type: o.type,
      matchScore: o.relative_match_score,
      score: o.recommendation_score,
      explanation: o.explanation || null,
      items,
    });
  }
  outfits.forEach((o, i) => { o.rank = i + 1; });
  return { status: 200 as const, body: { profile, level: entry.level, relaxed: entry.relaxed, outfits } };
}

export function buildAlternatives(profile: RecoProfile, category: string, products: any[], limit = 40) {
  if (!index) return { status: 503 as const, error: "Recommendation index not built yet" };
  const entry = index.profiles[profileKey(profile)];
  if (!entry) return { status: 404 as const, error: "No recommendations for this profile" };
  const pool = entry.pools?.[category];
  if (!pool) return { status: 200 as const, body: { category, items: [] } };
  const byId = productMap(products);
  const items = pool
    .map((r) => ({ p: byId.get(String(r.id)), rel: r.rel }))
    .filter((x) => isPurchasable(x.p, profile.size))
    .slice(0, limit)
    .map((x) => ({ ...x.p, size: profile.size, availableSizes: x.p.size, garmentCategory: category, relevance: x.rel }));
  return { status: 200 as const, body: { category, items } };
}

// ---------------------------------------------------------------- explanation

const NEUTRALS = new Set(["black", "white", "grey", "gray", "navy", "navy blue", "beige", "brown", "tan", "cream", "off white"]);

export function describeColourRelationship(colours: string[]): string {
  const cs = colours.map((c) => c.toLowerCase()).filter(Boolean);
  if (cs.length < 2) return "single statement piece";
  const neutral = cs.filter((c) => NEUTRALS.has(c)).length;
  return neutral >= cs.length - 1 ? "mostly neutral tones" : "mixed color palette";
}

export function templateExplanation(items: any[], profile: RecoProfile) {
  const cats = items.map((i) => `${i.colour} ${String(i.garmentCategory).toLowerCase()}`);
  const rel = describeColourRelationship(items.map((i) => i.colour || ""));
  const shape = profile.bodyShape.replace("_", " ");
  return {
    headline: rel === "mostly neutral tones" ? "Clean, neutral-led look" : "Colour-considered look",
    explanation:
      `Built for a ${profile.occasion} ${profile.season} occasion from ${cats.join(", ")}. ` +
      `The colours form a ${rel}, and every piece is available in your size (${profile.size}). ` +
      `The silhouettes were ranked with your ${shape} shape in mind.`,
    why_this_one: "Updated to match the exact pieces currently selected.",
  };
}

const explainCache = new Map<string, any>();

export async function explainOutfit(profile: RecoProfile, productIds: string[], products: any[]) {
  const byId = productMap(products);
  const items = productIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((p: any) => ({ ...p, garmentCategory: p.garmentCategory || "Top" }));
  if (items.length === 0) return null;

  const key = `${profileKey(profile)}#${items.map((i) => i.id).sort().join(",")}`;
  if (explainCache.has(key)) return explainCache.get(key);

  // Pre-computed evidence only applies when the outfit is exactly one of the model's picks.
  let modelEvidence: Record<string, any> | undefined;
  let modelExplanation: any;
  const entry = index?.profiles[profileKey(profile)];
  const wanted = items.map((i) => i.id).sort().join(",");
  for (const o of entry?.outfits || []) {
    if (o.items.map((i) => String(i.product_id)).sort().join(",") === wanted) {
      modelEvidence = o.evidence; modelExplanation = o.explanation;
    }
  }

  const evidence = {
    user: { size: profile.size, body_shape: profile.bodyShape, occasion: profile.occasion, season: profile.season },
    items: items.map((i) => ({ category: i.garmentCategory, color: i.colour, name: i.name })),
    color_relationship: describeColourRelationship(items.map((i) => i.colour || "")),
    model_evidence: modelEvidence || null,
    outfit_origin: modelEvidence ? "ranked by the recommendation model" : "customised by the shopper after the model's pick",
  };

  const fallback = modelExplanation?.explanation ? modelExplanation : templateExplanation(items, profile);
  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_1;
  let result = fallback;

  if (groqKey) {
    const prompt =
      "You write a short, natural justification for an outfit. A separate deterministic system chose it - you only explain it.\n" +
      "Rules:\n- Use ONLY the evidence JSON below.\n" +
      "- Do not invent fabric, material, fit, neckline, texture, comfort, price or brand.\n" +
      "- Do not state raw numeric scores.\n" +
      "- No certainty language ('definitely', 'perfect for your body', 'guaranteed').\n" +
      "- For body shape say the cut 'aligns with the requested silhouette preference'.\n" +
      "- If outfit_origin says customised, acknowledge it was adjusted by the shopper.\n" +
      "- 2-3 sentences. Mention the occasion and colour relationship.\n\n" +
      `Evidence:\n${JSON.stringify(evidence)}\n\n` +
      'Return ONLY JSON with keys: headline (max 8 words), explanation, why_this_one (one short sentence).';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.6,
          response_format: { type: "json_object" },
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data: any = await resp.json();
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
        if (parsed.explanation && !/\b0\.\d{2,}\b/.test(parsed.explanation)) {
          result = {
            headline: String(parsed.headline || fallback.headline || "").slice(0, 80),
            explanation: String(parsed.explanation),
            why_this_one: String(parsed.why_this_one || fallback.why_this_one || ""),
          };
        }
      }
    } catch (err) {
      console.warn("[Reco] Groq explanation failed, using fallback:", (err as Error).message);
    }
  }

  if (explainCache.size > 2000) explainCache.clear();
  explainCache.set(key, result);
  return result;
}
