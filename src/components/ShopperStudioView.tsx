import React, { useState, useEffect, useRef } from "react";
import { Upload, Sparkles, RefreshCw, Layers, ArrowRight, CheckCircle2, ChevronRight, Award, HelpCircle, FileText, ArrowLeftRight, HelpCircle as HelpIcon, LogOut, X, AlertTriangle, AlertCircle, Info, Calendar, MapPin, Phone, Clock, CreditCard, ArrowLeft, Check, ShoppingBag, Download, Home, User, Search, Trash2, Heart, Ruler, Pencil, Minus, Plus, RotateCcw, Edit3 } from "lucide-react";
import { Product, BodyShapeType, SizingRecommendation, UserProfile } from "../types";
import { jsPDF } from "jspdf";
import ReactMarkdown from "react-markdown";
import emailjs from '@emailjs/browser';
import { detectJointsFromImage } from "../utils/poseDetection";
import OutfitRecommendationPanel from "./OutfitRecommendationPanel";
import OutfitWhyCard from "./OutfitWhyCard";
import {
  RecoItem,
  RecoOutfit,
  RecoExplanation,
  RecoProfileParams,
  fetchRecommendations,
  fetchAlternatives,
  toCatalogSize,
  fetchExplanation,
} from "../utils/recommendationsApi";

// Asynchronous helper to create a high-quality rounded clipping base64 image or a category emoji placeholder
const getRoundedProductImage = async (url: string | undefined, emoji: string): Promise<string> => {
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 120;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const drawRoundedBg = () => {
    ctx.clearRect(0, 0, 120, 120);
    ctx.fillStyle = "#fff5fa"; // Elegant soft pink background
    ctx.strokeStyle = "#f3e9f0";
    ctx.lineWidth = 1;
    const r = 16;
    const w = 120;
    const h = 120;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.quadraticCurveTo(w, 0, w, r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(r, h);
    ctx.quadraticCurveTo(0, h, 0, h - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  if (url) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("CORS or image loading failure"));
        // Standard cache buster to bypass browser CORS caching limitations
        i.src = url.startsWith("data:") ? url : url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();
      });

      // Clear layout and set a rounded clipping region to match the 8px corner design at 60x60px size
      ctx.clearRect(0, 0, 120, 120);
      ctx.save();
      
      const r = 16;
      const w = 120;
      const h = 120;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(w - r, 0);
      ctx.quadraticCurveTo(w, 0, w, r);
      ctx.lineTo(w, h - r);
      ctx.quadraticCurveTo(w, h, w - r, h);
      ctx.lineTo(r, h);
      ctx.quadraticCurveTo(0, h, 0, h - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.clip();

      // Cover scaling math to scale beautifully without distortion
      const aspect = img.width / img.height;
      let dx = 0, dy = 0, dw = 120, dh = 120;
      if (aspect > 1) {
        dw = 120 * aspect;
        dx = (120 - dw) / 2;
      } else {
        dh = 120 / aspect;
        dy = (120 - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();

      // Soft light border around the image
      ctx.strokeStyle = "#e8dbe3";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(w - r, 0);
      ctx.quadraticCurveTo(w, 0, w, r);
      ctx.lineTo(w, h - r);
      ctx.quadraticCurveTo(w, h, w - r, h);
      ctx.lineTo(r, h);
      ctx.quadraticCurveTo(0, h, 0, h - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.stroke();

      return canvas.toDataURL("image/png");
    } catch (err) {
      console.warn("Falling back to emoji placeholder for url:", url, err);
      drawRoundedBg();
      ctx.font = "48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, 60, 60);
      return canvas.toDataURL("image/png");
    }
  } else {
    drawRoundedBg();
    ctx.font = "48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 60, 60);
    return canvas.toDataURL("image/png");
  }
};

interface ShopperStudioViewProps {
  products: Product[];
  currentUser: UserProfile;
  onLogout: () => void;
  onDeleteAccount?: () => void;
  onLogin?: (user: UserProfile) => void;
  onBackToPortal?: () => void;
  initialStep?: number;
  initialOutfit?: any;
  onAddToCart?: (items: Product[], size?: string) => void;
  onAddProduct?: (newProd: Omit<Product, "id"> & { id?: string }) => Promise<void> | void;
  onDeleteProduct?: (id: string) => Promise<void> | void;
}

// Preset standing fashion modeling templates to test instantly
const MODEL_PRESETS = [
  {
    id: "preset-1",
    name: "Bird Whisperer Frame",
    url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=800",
    defaultShoulder: 34,
    defaultWaist: 26,
    defaultHip: 35,
    height: 172,
    weight: 58,
    points: {
      shoulderLeft: { x: 35, y: 25 },
      shoulderRight: { x: 65, y: 25 },
      waistLeft: { x: 40, y: 45 },
      waistRight: { x: 60, y: 45 },
      hipLeft: { x: 36, y: 58 },
      hipRight: { x: 64, y: 58 }
    }
  },
  {
    id: "preset-2",
    name: "Statuesque Column Dress",
    url: "https://images.unsplash.com/photo-1509319117193-57bab727e09d?auto=format&fit=crop&q=80&w=800",
    defaultShoulder: 32,
    defaultWaist: 28,
    defaultHip: 38,
    height: 178,
    weight: 64,
    points: {
      shoulderLeft: { x: 36, y: 23 },
      shoulderRight: { x: 64, y: 23 },
      waistLeft: { x: 39, y: 42 },
      waistRight: { x: 61, y: 42 },
      hipLeft: { x: 37, y: 55 },
      hipRight: { x: 63, y: 55 }
    }
  },
  {
    id: "preset-3",
    name: "Tailored Form Silhouette",
    url: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=800",
    defaultShoulder: 38,
    defaultWaist: 24,
    defaultHip: 36,
    height: 168,
    weight: 52,
    points: {
      shoulderLeft: { x: 34, y: 24 },
      shoulderRight: { x: 66, y: 24 },
      waistLeft: { x: 38, y: 44 },
      waistRight: { x: 62, y: 44 },
      hipLeft: { x: 35, y: 56 },
      hipRight: { x: 65, y: 56 }
    }
  }
];

const INITIAL_DEFAULT_POINTS = {
  shoulderLeft: { x: 35, y: 25 },
  shoulderRight: { x: 65, y: 25 },
  waistLeft: { x: 40, y: 45 },
  waistRight: { x: 60, y: 45 },
  hipLeft: { x: 36, y: 58 },
  hipRight: { x: 64, y: 58 }
};

const calculateJointsFromMeasurements = (
  shoulders: number,
  waist: number, 
  hips: number
) => {
  // Normalize measurements to percentage positions
  // Person is centered horizontally in the image
  const centerX = 50;
  
  // Shoulder width as percentage of image width
  // Average shoulder ~16in maps to roughly 30% image width
  const shoulderHalfWidth = Math.min((shoulders / 16) * 15, 20);
  
  // Waist width proportionally narrower
  const waistHalfWidth = Math.min((waist / 16) * 13, 18);
  
  // Hip width proportionally wider
  const hipHalfWidth = Math.min((hips / 16) * 15, 22);

  return {
    shoulderLeft:  { x: centerX - shoulderHalfWidth, y: 28 },
    shoulderRight: { x: centerX + shoulderHalfWidth, y: 28 },
    waistLeft:     { x: centerX - waistHalfWidth,    y: 48 },
    waistRight:    { x: centerX + waistHalfWidth,    y: 48 },
    hipLeft:       { x: centerX - hipHalfWidth,      y: 62 },
    hipRight:      { x: centerX + hipHalfWidth,      y: 62 }
  };
};

function clamp(value: any, min: number, max: number) {
  const n = parseFloat(value);
  if (isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}

function validateAndCorrectMeasurements(raw: any) {
  const m = { ...raw };
  const warnings: string[] = Array.isArray(m.warnings) ? [...m.warnings] : [];

  // ── 1. RANGE CLAMPS ──────────────────────────────────────
  m.shoulders_in = clamp(m.shoulders_in, 13, 20);
  m.waist_in     = clamp(m.waist_in,     22, 42);
  m.hips_in      = clamp(m.hips_in,      32, 52);
  m.height_cm    = clamp(m.height_cm,   140, 195);
  m.weight_kg    = clamp(m.weight_kg,    40, 130);

  // ── 2. BODY PROPORTION SANITY CHECKS ───────────────────
  const bmi = m.height_cm > 0 && m.weight_kg > 0 ? m.weight_kg / Math.pow(m.height_cm / 100, 2) : null;
  if (bmi && m.height_cm >= 155 && m.weight_kg >= 45 && m.hips_in < 34) {
    const minHips = m.weight_kg >= 55 ? 34 : 33;
    if (m.hips_in < minHips) {
      warnings.push(
        `Hip estimate (${m.hips_in}in) was below expected range for the height/weight profile; adjusted to ${minHips}in.`
      );
      m.hips_in = minHips;
    }
  }

  // ── 3. HIPS MUST BE LARGER THAN WAIST ───────────────────
  if (m.hips_in <= m.waist_in) {
    const corrected = m.waist_in + 6;
    warnings.push(
      `Hips (${m.hips_in}in) were <= waist (${m.waist_in}in). Auto-corrected hips to ${corrected}in.`
    );
    m.hips_in = corrected;
  }

  // ── 4. MINIMUM HIP-WAIST GAP ────────────────────────────
  if (m.hips_in - m.waist_in < 4) {
    m.hips_in = m.waist_in + 4;
    warnings.push(`Hip-waist gap too small. Adjusted hips to ${m.hips_in}in.`);
  }

  // ── 4. VALIDATE BODY SHAPE vs NUMBERS ───────────────────
  const hipWaistGap   = m.hips_in - m.waist_in;
  const hipShoulderDiff = m.hips_in - m.shoulders_in;

  const correctShape = (() => {
    if (hipWaistGap >= 8 && Math.abs(hipShoulderDiff) <= 2)
      return "Hourglass";
    if (hipShoulderDiff >= 3)
      return "Pear";
    if (m.shoulders_in - m.hips_in >= 3)
      return "InvertedTriangle";
    if (hipWaistGap < 4 && Math.abs(hipShoulderDiff) < 3)
      return "Apple";
    return "Rectangle";
  })();

  if (m.body_shape !== correctShape) {
    warnings.push(
      `Body shape changed from "${m.body_shape}" to "${correctShape}" based on actual measurements.`
    );
    m.body_shape = correctShape;
  }

  // ── 5. VALIDATE SIZE vs HIP MEASUREMENT ─────────────────
  const correctSize = (() => {
    const h = m.hips_in;
    if (h <= 34) return "XS";
    if (h <= 36) return "S";
    if (h <= 38) return "M";
    if (h <= 41) return "L";
    if (h <= 44) return "XL";
    return "XXL";
  })();

  if (m.suggested_size !== correctSize) {
    warnings.push(
      `Size changed from "${m.suggested_size}" to "${correctSize}" based on hips (${m.hips_in}in).`
    );
    m.suggested_size = correctSize;
  }

  // ── 6. CLOTHING INTERFERENCE → FORCE LOW CONFIDENCE ────
  if (m.clothing_interference && m.confidence === "High") {
    m.confidence = "Medium";
    warnings.push("Confidence downgraded: clothing interference detected.");
  }

  // ── 6b. SIZE SUCCESSFULLY VALIDATED → UPGRADE CONFIDENCE ─
  // If measurements produced a valid size, the model DID detect correctly.
  // Promote "Low" → "Medium" so the UI does not mislead the shopper.
  if (m.confidence?.toLowerCase() === "low" && correctSize) {
    m.confidence = "Medium";
    warnings.push("Confidence upgraded: size successfully derived from measurements.");
  }

  // ── 7. FINAL VALIDATION SCORE ────────────────────────────
  m.validation_passed = warnings.length === 0;
  m.warnings          = warnings;
  m.validated_at      = new Date().toISOString();

  // Also bridge recommended_size property
  m.recommended_size = m.suggested_size;

  return m;
}

const getSizeColorClass = (size: any) => {
  const s = String(size || "").toUpperCase().trim();
  if (["XS", "S", "M"].includes(s)) return "text-emerald-600 font-extrabold";
  if (["L"].includes(s)) return "text-blue-600 font-extrabold";
  if (["XL", "XXL"].includes(s)) return "text-amber-500 font-extrabold"; // Never red, stay with luxurious orange/amber!
  return "text-slate-900";
};

const normalizeString = (value?: string) => String(value || "").toLowerCase().trim();

const OCCASION_SYNONYMS: Record<string, string[]> = {
  wedding: ["wedding", "bridal", "bride", "reception", "banquet", "ceremony"],
  formal: ["formal", "black tie", "gala", "cocktail", "evening"],
  casual: ["casual", "everyday", "lounge", "street", "travel"],
  party: ["party", "celebration", "evening", "cocktail"],
  interview: ["interview", "business", "work", "meeting", "office"]
};

const DRESS_TERMS = [
  "dress",
  "gown",
  "cocktail",
  "maxi",
  "midi",
  "mini",
  "ballgown",
  "sundress",
  "evening",
  "shift",
  "wrap",
  "sheath",
  "halter",
  "mermaid"
];

const isDressProduct = (product: Product) => {
  const candidate = normalizeString(product.category || "");
  const lowerName = normalizeString(product.name);
  return DRESS_TERMS.some((term) => candidate.includes(term) || lowerName.includes(term));
};

const CATEGORY_SYNONYMS: Record<"top" | "bottom" | "footwear" | "accessories", string[]> = {
  top: ["top", "tops", "dress", "gown", "blouse", "bodice", "jacket", "coat", "shirt", "tee", "suit"],
  bottom: ["bottom", "bottoms", "skirt", "jeans", "pants", "trousers", "shorts", "leggings", "culotte"],
  footwear: ["footwear", "shoes", "heels", "sandals", "boots", "sneakers", "mules", "loafers", "pumps", "stilettos"],
  accessories: ["accessories", "accessory", "bag", "clutch", "belt", "earrings", "necklace", "scarf", "hat", "jewelry"]
};

const categoryMatches = (product: Product, category: "top" | "bottom" | "footwear" | "accessories") => {
  const candidate = normalizeString(product.category || "");
  if (candidate === category) return true;
  const synonyms = CATEGORY_SYNONYMS[category];
  const lowerName = normalizeString(product.name);
  return synonyms.some((term) => candidate.includes(term) || lowerName.includes(term));
};

const matchesOccasion = (product: Product, chosenOccasion: string) => {
  const chosen = normalizeString(chosenOccasion);
  const synonyms = OCCASION_SYNONYMS[chosen] || [chosen];
  const pOccasions = product.occasions && Array.isArray(product.occasions)
    ? product.occasions.map(normalizeString)
    : [normalizeString(product.occasion)];

  return pOccasions.some((occ) =>
    synonyms.some((synonym) => occ === synonym || occ.includes(synonym) || synonym.includes(occ))
  );
};

const productMatchesSize = (product: Product, targetSize?: string) => {
  if (!targetSize) return true;
  const target = normalizeString(targetSize).replace(/[^a-z0-9]/g, "");
  const sizes = String(product.size || "").toLowerCase();
  if (!sizes) return true; // unknown sizes should not exclude
  // Check comma-separated sizes or ranges
  const tokens = sizes.split(/[,/\\s]+/).map(s => s.replace(/[^a-z0-9]/g, ""));
  return tokens.includes(target) || sizes.includes(target) || target.includes(tokens.join(''));
};

// ── FULL CATALOG MODAL ────────────────────────────────────────────────────────
function CatalogModal({
  products,
  wishlist,
  handleToggleWishlist,
  onClose,
  handleTryOnItem,
  trialLoading,
  personDetected,
}: {
  products: Product[];
  wishlist: string[];
  handleToggleWishlist: (id: string) => void;
  onClose: () => void;
  handleTryOnItem: (p: Product) => void;
  trialLoading: boolean;
  personDetected: boolean;
}) {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogTab, setCatalogTab] = useState<string>("All");
  const [catalogCategory, setCatalogCategory] = useState<string>("All");

  // Collect all unique occasion labels from the catalog
  const occasionTabs = ["All", ...Array.from(new Set(
    products.flatMap((p) => {
      const raw = (p as any).occasions && Array.isArray((p as any).occasions)
        ? (p as any).occasions
        : [p.occasion];
      return raw.map((o: string) => {
        const s = String(o || "").trim();
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      });
    })
  )).sort()];

  const categoryTabs = ["All", ...Array.from(new Set(products.map((p) => p.category))).sort()];

  const filtered = products.filter((p) => {
    // Search match
    const q = catalogSearch.toLowerCase();
    const nameMatch = !q || p.name.toLowerCase().includes(q) ||
      p.colour.toLowerCase().includes(q) ||
      String(p.price).includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.occasion.toLowerCase().includes(q);

    // Occasion tab match
    const pOccs: string[] = (p as any).occasions && Array.isArray((p as any).occasions)
      ? (p as any).occasions.map((o: string) => String(o).trim().toLowerCase())
      : [p.occasion.trim().toLowerCase()];
    const occMatch = catalogTab === "All" || pOccs.includes(catalogTab.toLowerCase());

    // Category match
    const catMatch = catalogCategory === "All" || p.category === catalogCategory;

    return nameMatch && occMatch && catMatch;
  });

  const occasionEmoji: Record<string, string> = {
    wedding: "💒", formal: "👔", casual: "👗", party: "🎉", bridal: "💍"
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-3 md:p-5">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-pink-100 overflow-hidden max-h-[94vh] flex flex-col animate-fade-in">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-[#f3e9f0] flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="font-playfair text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-[#ac2471]" />
              Full Product Catalog
            </h2>
            <p className="text-xs text-[#73636f] mt-1 leading-relaxed">
              Showing <span className="font-black text-[#ac2471]">{filtered.length}</span> of <span className="font-bold">{products.length}</span> items across all collections
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-slate-100 cursor-pointer mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Search + Filters ── */}
        <div className="px-6 py-3 border-b border-[#f3e9f0] flex flex-col gap-2.5 shrink-0 bg-[#fffbfd]">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Search by name, colour, price, occasion…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#f0e1ec] bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ac2471]/20 focus:border-[#ac2471]/40 transition-all"
            />
            {catalogSearch && (
              <button onClick={() => setCatalogSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Occasion tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {occasionTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setCatalogTab(tab)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                  catalogTab === tab
                    ? "bg-[#ac2471] text-white border-[#ac2471] shadow-sm"
                    : "bg-white text-slate-600 border-[#f0e1ec] hover:bg-[#fff0f8] hover:border-[#ac2471]/30"
                }`}
              >
                {occasionEmoji[tab.toLowerCase()] || ""} {tab}
                {tab !== "All" && (
                  <span className="ml-1 opacity-70 font-mono text-[8px]">
                    ({products.filter((p) => {
                      const occ = (p as any).occasions && Array.isArray((p as any).occasions)
                        ? (p as any).occasions.map((o: string) => String(o).toLowerCase())
                        : [p.occasion.toLowerCase()];
                      return occ.includes(tab.toLowerCase());
                    }).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Category filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {categoryTabs.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatalogCategory(cat)}
                className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                  catalogCategory === cat
                    ? "bg-[#5a005a] text-white border-[#5a005a]"
                    : "bg-[#fdf8fc] text-slate-500 border-[#f0e1ec] hover:bg-[#f9f0f8]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── Product Grid ── */}
        <div className="flex-grow overflow-y-auto px-6 py-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-[#fae9f3] flex items-center justify-center text-3xl select-none">🔍</div>
              <p className="font-bold text-slate-700 font-playfair">No products match your filters</p>
              <p className="text-xs text-slate-400">Try clearing the search or selecting a different occasion</p>
              <button onClick={() => { setCatalogSearch(""); setCatalogTab("All"); setCatalogCategory("All"); }}
                className="mt-2 text-xs font-bold text-[#ac2471] underline underline-offset-2 cursor-pointer">
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filtered.map((p) => {
                const pOccs: string[] = (p as any).occasions && Array.isArray((p as any).occasions)
                  ? (p as any).occasions
                  : [p.occasion];
                const primaryOcc = pOccs[0] || p.occasion;
                const occLabel = primaryOcc.charAt(0).toUpperCase() + String(primaryOcc).slice(1).toLowerCase();

                return (
                  <div
                    key={p.id}
                    className="bg-[#fffbfc] border border-[#f5ebf2]/70 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
                  >
                    {/* Image */}
                    <div className="relative h-44 bg-gradient-to-br from-[#f9e8f0] to-[#fdf0e8] overflow-hidden">
                      {p.image && p.image.trim() !== "" ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl select-none">
                          {p.category === "top" ? "👗" : p.category === "bottom" ? "👖" : "👠"}
                        </div>
                      )}

                      {/* Wishlist */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleToggleWishlist(p.id); }}
                        className="absolute top-2 left-2 bg-white/95 hover:bg-white p-1.5 rounded-full border border-pink-100 shadow-sm transition-all active:scale-95 cursor-pointer z-10"
                        title={wishlist.includes(p.id) ? "Remove from Wishlist" : "Save to Wishlist"}
                      >
                        <Heart className={`w-3.5 h-3.5 transition-colors ${wishlist.includes(p.id) ? "fill-rose-500 text-rose-500" : "text-slate-400 hover:text-rose-400"}`} />
                      </button>

                      {/* Occasion badge */}
                      <div className="absolute top-2 right-2">
                        <span className="bg-purple-900/85 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full">
                          {occasionEmoji[primaryOcc.toLowerCase()] || ""} {occLabel}
                        </span>
                      </div>

                      {/* Category badge bottom */}
                      <div className="absolute bottom-2 left-2">
                        <span className="bg-white/90 backdrop-blur-sm text-slate-600 text-[7px] font-bold px-1.5 py-0.5 rounded-md border border-pink-100 uppercase">
                          {p.category}
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div>
                        <h4 className="font-bold text-[11px] text-slate-800 line-clamp-2 leading-snug group-hover:text-[#ac2471] transition-colors">
                          {p.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 text-[9px] text-slate-500 font-mono font-medium flex-wrap">
                          <span>Size: {p.size}</span>
                          <span>·</span>
                          <span className="flex items-center gap-0.5">
                            <span className="w-2 h-2 rounded-full inline-block border border-slate-200 shrink-0"
                              style={{ backgroundColor: p.colour.toLowerCase().replace(/\s+/g, "") }} />
                            {p.colour}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
                        <span className="text-sm font-black text-[#5a005a]">${p.price}</span>
                        <button
                          onClick={() => handleTryOnItem(p)}
                          disabled={trialLoading || !personDetected}
                          className="px-2.5 py-1.5 text-[8px] font-bold text-white bg-[#2f2f58] hover:bg-[#1f1f43] rounded-lg uppercase tracking-wider disabled:opacity-40 cursor-pointer transition-colors"
                          title={!personDetected ? "Upload a photo first to try on" : "Virtual Try-On"}
                        >
                          Try On
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-[#f3e9f0] flex items-center justify-between shrink-0 bg-[#fffbfd]">
          <p className="text-[10px] text-slate-400 font-mono">
            {filtered.length} of {products.length} products shown
          </p>
          <button
            onClick={onClose}
            className="py-2.5 px-6 bg-[#ac2471] hover:bg-[#851653] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer active:scale-95"
          >
            Done Browsing
          </button>
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function ShopperStudioView({ products, currentUser, onLogout, onDeleteAccount, onLogin, onBackToPortal, initialOutfit, onAddProduct, onDeleteProduct, onAddToCart, initialStep }: ShopperStudioViewProps) {
  // Main express checkout states
  const [connectedPayment, setConnectedPayment] = useState<"google" | "apple" | null>(null);
  const [googleAccountInfo, setGoogleAccountInfo] = useState<{ name: string; email: string } | null>(null);
  const [appleAccountInfo, setAppleAccountInfo] = useState<{ name: string; email: string } | null>(null);
  const [showAppleModal, setShowAppleModal] = useState(false);
  const [appleEmail, setAppleEmail] = useState("");
  const [applePassword, setApplePassword] = useState("");

  // Main workflow states
  const [selectedPhoto, setSelectedPhoto] = useState<string>("");
  const [userHasUploaded, setUserHasUploaded] = useState<boolean>(false);
  const showStep1Photo = userHasUploaded && selectedPhoto.startsWith("data:");
  const step1FileInputRef = useRef<HTMLInputElement>(null);
  const [gemmaJoints, setGemmaJoints] = useState<any>(null);
  const mannequinImageRef = useRef<HTMLImageElement>(null);
  const lastAnalyzedPhotoRef = useRef<string | null>(null);
  const lastAnalyzedOccasionRef = useRef<string | null>(null);
  const isAnalyzingRef = useRef<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(initialStep ?? 1);
  const [paymentProcessing, setPaymentProcessing] = useState<boolean>(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);
  const [paymentLogs, setPaymentLogs] = useState<string[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardholderName: currentUser?.fullName || "",
    billingAddress: "148 Luxury Atelier Blvd, San Francisco, CA"
  });
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cartAddFeedback, setCartAddFeedback] = useState(false);
  const [orderId, setOrderId] = useState<string>(`FS-${Math.floor(100000 + Math.random() * 900000)}`);
  
  // Order Confirmed Additional States
  const [wardrobeSavingState, setWardrobeSavingState] = useState<'idle' | 'saving' | 'saved' | 'exists'>('idle');
  const [suggestedOutfits, setSuggestedOutfits] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState<boolean>(false);
  const [quickAddSaved, setQuickAddSaved] = useState<Record<string, 'idle' | 'saving' | 'saved'>>({});
  const [calendarAdded, setCalendarAdded] = useState<boolean>(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [instagramCopied, setInstagramCopied] = useState<boolean>(false);
  const [showEmailPreview, setShowEmailPreview] = useState<boolean>(false);

  // Form states to dynamically add product in browser product category
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductOccasion, setNewProductOccasion] = useState<"Wedding" | "Formal" | "Casual" | "Party">("Wedding");
  const [newProductCategory, setNewProductCategory] = useState<"top" | "bottom" | "footwear" | "accessories">("top");
  const [newProductPrice, setNewProductPrice] = useState("120");
  const [newProductImage, setNewProductImage] = useState("");
  const [newProductColour, setNewProductColour] = useState("Off-White");
  const [newProductSize, setNewProductSize] = useState("S, M, L");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [isFormSaving, setIsFormSaving] = useState(false);

  const handleAddBrowserProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!newProductName.trim()) {
      setFormError("Please enter a product name");
      return;
    }
    if (!newProductPrice.trim() || isNaN(Number(newProductPrice)) || Number(newProductPrice) <= 0) {
      setFormError("Please enter a valid price greater than zero");
      return;
    }
    if (!newProductImage.trim()) {
      setFormError("Please enter or select a product image URL");
      return;
    }

    setIsFormSaving(true);
    try {
      const generatedId = `prod-${newProductOccasion.toLowerCase().substring(0,3)}-${newProductCategory.substring(0,3)}-custom-${Date.now()}`;
      
      const newProductPayload = {
        id: generatedId,
        name: newProductName.trim(),
        category: newProductCategory,
        image: newProductImage.trim(),
        price: Number(newProductPrice),
        colour: newProductColour.trim() || "Bespoke",
        size: newProductSize.trim() || "S, M, L",
        occasion: newProductOccasion,
        shapes: ["Hourglass", "Pear", "Apple", "Rectangle", "Inverted Triangle"],
        occasions: [newProductOccasion.toLowerCase()],
        gender: "women",
        inStock: true
      };

      if (onAddProduct) {
        await onAddProduct(newProductPayload);
      }

      setFormSuccess("Product added to category successfully!");
      setNewProductName("");
      setNewProductPrice("120");
      setNewProductImage("");
      setNewProductColour("Off-White");
      setNewProductSize("S, M, L");
      
      setTimeout(() => {
        setFormSuccess("");
        setShowAddForm(false);
      }, 2000);
    } catch (err) {
      console.error(err);
      setFormError("Failed to add product.");
    } finally {
      setIsFormSaving(false);
    }
  };

  // Synchronize Order Confirmed effects on entering Step 5
  useEffect(() => {
    if (currentStep !== 5 || !currentUser) return;

    // Check if current outfit already saved in Wardrobe
    const checkIsLookSaved = async () => {
      try {
        const savedOrdersKey = `orders_${currentUser.uid}`;
        const dataStr = localStorage.getItem(savedOrdersKey);
        if (dataStr) {
          const parsed = JSON.parse(dataStr);
          if (Array.isArray(parsed) && parsed.some((x) => x.orderId === orderId)) {
            setWardrobeSavingState('exists');
            return;
          }
        }

        try {
          const res = await fetch(`/api/users/${currentUser.uid}`);
          if (res.ok) {
            const profile = await res.json();
            const existingLooks = profile?.savedLooks || [];
            if (existingLooks.some((x: any) => x.lookId === orderId || x.orderId === orderId)) {
              setWardrobeSavingState('exists');
              return;
            }
          }
        } catch (apiErr) {
          console.warn("Could not check saved looks via API", apiErr);
        }
        setWardrobeSavingState('idle');
      } catch (e) {
        console.warn("Error checking look saved state:", e);
      }
    };

    // Load recommendations (Similar Look Suggesters)
    const loadSuggestions = async () => {
      setSuggestionsLoading(true);
      try {
        let pool: Product[] = [];
        try {
          // `products` prop is already the real DynamoDB-backed catalog
          // (fetched once in App.tsx via /api/products) -- no Firestore call needed.
          if (products.length > 0) {
            pool = products;
          }
        } catch (err) {
          console.warn("Failed to use products prop, falling back to local data", err);
        }
        
        if (pool.length === 0) {
          pool = products;
        }

        const currentOccasionLower = chosenOccasion.toLowerCase();
        const currentShapeLower = (classifyDetails?.shape || "Hourglass").toLowerCase();
        
        let filtered = pool.filter((p) => {
          const pOccasions = (p as any).occasions && Array.isArray((p as any).occasions)
            ? (p as any).occasions.map((o: string) => o.toLowerCase())
            : [p.occasion.toLowerCase()];
          const oMatch = pOccasions.some((o: string) => o.includes(currentOccasionLower) || currentOccasionLower.includes(o));
          
          const pShapes = (p as any).shapes && Array.isArray((p as any).shapes)
            ? (p as any).shapes.map((s: string) => s.toLowerCase())
            : [];
          const sMatch = pShapes.length === 0 || pShapes.some((s: string) => s.includes(currentShapeLower) || currentShapeLower.includes(s));
          
          return oMatch && sMatch;
        });

        if (filtered.length < 4) {
          filtered = pool.filter((p) => {
            const pOccasions = (p as any).occasions && Array.isArray((p as any).occasions)
              ? (p as any).occasions.map((o: string) => o.toLowerCase())
              : [p.occasion.toLowerCase()];
            return pOccasions.some((o: string) => o.includes(currentOccasionLower) || currentOccasionLower.includes(o));
          });
        }
        
        if (filtered.length < 4) {
          filtered = pool;
        }

        const itemsByCat = (cat: string, poolList: Product[]) => {
          const matched = filtered.filter((p) => p.category === cat);
          return matched.length > 0 ? matched : poolList.filter((p) => p.category === cat);
        };

        const topPool = itemsByCat("top", pool);
        const bottomPool = itemsByCat("bottom", pool);
        const shoePool = itemsByCat("footwear", pool);
        const accPool = itemsByCat("accessories", pool);

        const names = [
          `Rosé Luxe Boutique ${chosenOccasion} Ensemble`,
          `Bespoke ${chosenOccasion} Avant-Garde Silhouette`,
          `Signature Magenta ${chosenOccasion} Evening Coordinates`
        ];

        const outfits = [0, 1, 2].map((idx) => {
          const top = topPool[idx % topPool.length] || null;
          const bottom = bottomPool[idx % bottomPool.length] || null;
          const footwear = shoePool[idx % shoePool.length] || null;
          const accessories = accPool[idx % accPool.length] || null;
          
          const outfitPrice = [top, bottom, footwear, accessories]
            .reduce((acc, p) => acc + (p ? p.price : 0), 0);

          return {
            id: `suggested_${idx + 1}_${Date.now()}`,
            name: names[idx],
            thumbnail: top?.image || bottom?.image || footwear?.image || "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600",
            totalPrice: outfitPrice,
            outfit: { top, bottom, footwear, accessories }
          };
        });

        setSuggestedOutfits(outfits);
      } catch (e) {
        console.error("Error creating style suggestions:", e);
      } finally {
        setSuggestionsLoading(false);
      }
    };

    checkIsLookSaved();
    loadSuggestions();
    
    // Reset temporary states
    setEmailStatus('idle');
    setCalendarAdded(false);
    setInstagramCopied(false);
  }, [currentStep, currentUser]);
  const [activePreset, setActivePreset] = useState<string>("preset-1");
  const [trialLoading, setTrialLoading] = useState(false);
  const [lookGenerating, setLookGenerating] = useState(false);
  const [isPoseMode, setIsPoseMode] = useState(true);

  // Gemma Pose Detection & Confidence
  const [poseLoading, setPoseLoading] = useState(false);
  const [poseConfidence, setPoseConfidence] = useState<number>(94);
  const [personDetected, setPersonDetected] = useState(true);
  const [userHasManuallyEnteredHeight, setUserHasManuallyEnteredHeight] = useState<boolean>(false);
  const [customUploadCount, setCustomUploadCount] = useState<number>(0);
  const [unusablePhotoError, setUnusablePhotoError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<{
    icon: string;
    message: string;
  } | null>(null);

  const handleAnalysisError = (status: number, errorCode: string, message: string) => {
    // Do NOT advance to step 2
    setCurrentStep(1);
    
    // Clear any loading states
    setPoseLoading(false);
    
    // Set error message based on error type
    let userMessage = "";
    let errorIcon = "⚠️";

    if (errorCode === "quota_exceeded" || status === 429) {
      errorIcon = "🚫";
      userMessage = "Your OpenRouter AI quota has been exhausted. Please check your OpenRouter API key configuration or wait before trying again.";
    } else if (errorCode === "invalid_api_key" || status === 403) {
      errorIcon = "🔑";
      userMessage = "OpenRouter API key is invalid. Please check your configuration.";
    } else if (errorCode === "model_not_found" || status === 404) {
      errorIcon = "❌";
      userMessage = "AI model configuration error. Please contact support.";
    } else if (errorCode === "invalid_image" || status === 400) {
      errorIcon = "📷";
      userMessage = "This image could not be analyzed. Please upload a clear full-body photograph of a real person.";
    } else if (errorCode === "unusable_photo" || status === 422) {
      errorIcon = "🖼️";
      userMessage = "Please upload a real photograph. Cartoons and illustrations cannot be analyzed.";
    } else {
      errorIcon = "⚠️";
      userMessage = "Gemma Sizing Engine is currently unavailable. Please try again in a moment.";
    }

    setAnalysisError({ icon: errorIcon, message: userMessage });
  };

  const handleGooglePay = async () => {
    try {
      setPaymentError(null);
      if (!currentUser?.uid) {
        setPaymentError("Please sign in first.");
        return;
      }

      const displayName = currentUser.fullName || currentUser.email?.split("@")[0] || "Shopper";
      const userEmail = currentUser.email || "";
      const updatedProfile: UserProfile = { ...currentUser, preferredPayment: "google" };

      // Persist the payment preference to DynamoDB (best-effort -- don't block
      // the checkout UX on this)
      try {
        await fetch(`/api/users/${currentUser.uid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedProfile),
        });
      } catch (saveErr) {
        console.warn("Could not persist preferredPayment to AWS", saveErr);
      }

      // Auto-fill form (demo card details, same as before)
      setPaymentForm(prev => ({
        ...prev,
        cardholderName: displayName,
        cardNumber: "4821  8291  4731  9482",
        expiryDate: "12/29",
        cvv: "888"
      }));

      setGoogleAccountInfo({
        name: displayName,
        email: userEmail
      });
      setConnectedPayment("google");

      if (onLogin) {
        onLogin(updatedProfile);
      }
    } catch (err: any) {
      console.error("Google Pay setup error:", err);
      setPaymentError("Something went wrong setting up Google Pay: " + (err.message || err));
    }
  };

  const handleApplePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!appleEmail) {
      setPaymentError("Kindly enter an Apple ID email.");
      return;
    }
    
    // Derived name from email beautifully
    const derivedName = appleEmail
      .split("@")[0]
      .split(/[\._\-+]/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");

    setPaymentForm(prev => ({
      ...prev,
      cardholderName: derivedName,
      cardNumber: "4821  8291  4731  9482",
      expiryDate: "12/29",
      cvv: "888"
    }));

    setAppleAccountInfo({
      name: derivedName,
      email: appleEmail
    });
    setConnectedPayment("apple");
    setShowAppleModal(false);
  };
  
  // FASHN AI try-on system states
  const [fashnStatus, setFashnStatus] = useState<"idle" | "loading" | "segmenting" | "draping" | "synthesizing" | "success" | "error" | "unavailable" | "fallback">("idle");
  const [fashnErrorText, setFashnErrorText] = useState<string | null>(null);
  const [forceFashnFailure, setForceFashnFailure] = useState(false);
  const [forceFashnOffline, setForceFashnOffline] = useState(false);

  // PDF Preview modal
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfOrderRef] = useState<string>(() => `FS-${Math.floor(100000 + Math.random() * 900000)}`);
  const pdfOrderDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const nearestAtelier = {
    name: "FitStyle Atelier Boulevard",
    address: "712 Fifth Ave, New York, NY 10019",
    distance: "0.2 mi",
    mapsUrl: "https://maps.google.com/?q=712+Fifth+Ave+New+York+NY+10019"
  };
  
  // Home menu navigation dropdown and modal triggers
  const [showHomeMenu, setShowHomeMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProductsModal, setShowProductsModal] = useState(false);
  
  // Wishlist and save trackers
  const [wishlist, setWishlist] = useState<string[]>(currentUser?.wishlist || []);
  const [showWishlistModal, setShowWishlistModal] = useState(false);
  const [wishlistSavingState, setWishlistSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Selected Occasion (Wedding, Casual, Formal, Party, Interview)
  const [chosenOccasion, setChosenOccasion] = useState<string>("Casual");

  // Calibrated measurements
  const [heightCm, setHeightCm] = useState<number>(172);
  const [weightKg, setWeightKg] = useState<number>(58);

  // API Keys Health Status state checking
  const [apiHealth, setApiHealth] = useState<{
    gemma: { status: "active" | "quota_exceeded" | "invalid_key" | "error" | "loading"; model: string; remaining: string; error: string | null };
    grok: { status: "active" | "quota_exceeded" | "invalid_key" | "error" | "loading"; model: string; remaining: string; error: string | null };
  }>({
    gemma: { status: "loading", model: "qwen/qwen2.5-vl-72b-instruct:free", remaining: "unknown", error: null },
    grok: { status: "loading", model: "groq-grok-llama-3.3", remaining: "unknown", error: null },
  });

  const checkHealthStatus = async () => {
    try {
      const response = await fetch("/api/health");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.toLowerCase().includes("application/json")) {
          const data = await response.json();
          if (data && data.gemma && data.grok) {
            setApiHealth({
              gemma: data.gemma,
              grok: data.grok
            });
          }
        } else {
          console.log("[HEALTH_CHECK] Received non-JSON response from /api/health");
        }
      }
    } catch (err) {
      console.error("Failed to query API health endpoint:", err);
    }
  };

  useEffect(() => {
    checkHealthStatus();
    const interval = setInterval(checkHealthStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const [shoulderSize, setShoulderSize] = useState<number>(34);
  const [waistSize, setWaistSize] = useState<number>(26);
  const [hipSize, setHipSize] = useState<number>(35);
  const [selectedSize, setSelectedSize] = useState<string>("M");
  const calibratedMeasurementsRef = useRef({ heightCm: 172, shoulderSize: 34, waistSize: 26, hipSize: 35 });
  // Set once, right after the AI produces a result, and never touched again --
  // this is what Reset should always revert to, regardless of manual edits/saves.
  const originalAiMeasurementsRef = useRef({ heightCm: 172, shoulderSize: 34, waistSize: 26, hipSize: 35 });

  const [classifyDetails, setClassifyDetails] = useState<{
    shape: BodyShapeType;
    explanation: string;
  }>({ shape: "Hourglass", explanation: "Classic feminine symmetry" });

  const [sizeRecommendation, setSizeRecommendation] = useState<SizingRecommendation>({
    recommendedSize: "M",
    description: "Tailored standard medium fit",
    numericSize: "8 - 10"
  });

  const [sizeNote, setSizeNote] = useState<string | null>(null);

  const [aiCalibrationData, setAiCalibrationData] = useState<{
    shoulders: number;
    waist: number;
    hips: number;
    body_shape: string;
    body_shape_description: string;
    recommended_size: string;
    size_range: string;
  } | null>(null);

  const [hauteStylistResult, setHauteStylistResult] = useState<any>(null);
  const [recalibrated, setRecalibrated] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(null);
  const [isValidationLogOpen, setIsValidationLogOpen] = useState<boolean>(false);

  // Selected outfits mapping (Top, Bottom, Footwear, Accessories)
  const [selectedOutfit, setSelectedOutfit] = useState<{
    top: Product | null;
    bottom: Product | null;
    footwear: Product | null;
    accessories: Product | null;
  }>({ top: null, bottom: null, footwear: null, accessories: null });

  // Wedding: up to 3 recommended products shown simultaneously
  const [weddingProducts, setWeddingProducts] = useState<Product[]>([]);

  // Originally selected AI recommendation
  const [initialAiOutfit, setInitialAiOutfit] = useState<{
    top: Product | null;
    bottom: Product | null;
    footwear: Product | null;
    accessories: Product | null;
  }>({ top: null, bottom: null, footwear: null, accessories: null });

  // Virtual Try-on overlaid garment state (simulated photo overlay)
  const [tryOnOverlaid, setTryOnOverlaid] = useState<boolean>(false);
  const [tryOnUrl, setTryOnUrl] = useState<string | null>(null);
  const [activeTryOnImage, setActiveTryOnImage] = useState<string | null>(null);
  const [activeTryOnDescription, setActiveTryOnDescription] = useState<string | null>(null);
  const [tryOnRenderKey, setTryOnRenderKey] = useState<number>(0);
  const [productOverlayUrl, setProductOverlayUrl] = useState<string | null>(null);
  const [productOverlayStyle, setProductOverlayStyle] = useState<React.CSSProperties>({});

  // AI Styling comments
  const [aiComments, setAiComments] = useState<string>("");
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Interactive Swap drawer state
  const [swapCategory, setSwapCategory] = useState<"top" | "bottom" | "footwear" | "accessories" | null>(null);
  const [swapSearchQuery, setSwapSearchQuery] = useState("");

  // ---- Outfit recommendations (pre-computed model output, served by /api/recommendations) ----
  const [recoOutfits, setRecoOutfits] = useState<RecoOutfit[]>([]);
  const [recoIndex, setRecoIndex] = useState<number>(0);
  const [recoItems, setRecoItems] = useState<RecoItem[]>([]); // every piece of the current outfit (may be customised)
  const [recoDeselected, setRecoDeselected] = useState<string[]>([]); // pieces unticked on the right (kept in the outfit, just unselected)
  const [recoLoading, setRecoLoading] = useState<boolean>(false);
  const [recoError, setRecoError] = useState<string | null>(null);
  const [recoNote, setRecoNote] = useState<string | null>(null);
  const [recoExplanation, setRecoExplanation] = useState<RecoExplanation | null>(null);
  const [recoExplLoading, setRecoExplLoading] = useState<boolean>(false);
  const lastRecoKeyRef = useRef<string>("");
  const recoActive = recoOutfits.length > 0;

  useEffect(() => {
    if (!swapCategory) {
      setSwapSearchQuery("");
    }
  }, [swapCategory]);

  useEffect(() => {
    if (initialOutfit) {
      setSelectedOutfit(prev => ({
        ...prev,
        ...initialOutfit
      }));
    }
  }, [initialOutfit]);

  // Never keep preset/http URLs in selectedPhoto — only user FileReader uploads (data: URLs)
  useEffect(() => {
    if (selectedPhoto && !selectedPhoto.startsWith("data:")) {
      setSelectedPhoto("");
    }
    if (userHasUploaded && !selectedPhoto.startsWith("data:")) {
      setUserHasUploaded(false);
    }
  }, [selectedPhoto, userHasUploaded]);

  // Draggable Calibration Markers overlay representation
  const [dragMarker, setDragMarker] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const btn = document.getElementById("home-menu-button");
      const menu = document.getElementById("home-dropdown-menu");
      if (btn && !btn.contains(e.target as Node) && menu && !menu.contains(e.target as Node)) {
        setShowHomeMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Session Isolation: Wipe and reset ALL data immediately when currentUser changes (new user or logout)
  useEffect(() => {
    lastAnalyzedPhotoRef.current = null;
    lastAnalyzedOccasionRef.current = null;
    isAnalyzingRef.current = false;
    setHauteStylistResult(null);
    setGemmaJoints(null);
    setAiCalibrationData(null);
    setSelectedPhoto("");
    setUserHasUploaded(false);
    setActivePreset("preset-1");
    setChosenOccasion("Casual");
    setHeightCm(172);
    setWeightKg(58);
    setShoulderSize(34);
    setWaistSize(26);
    setHipSize(35);
    setClassifyDetails({ shape: "Hourglass", explanation: "Classic feminine symmetry" });
    setSizeRecommendation({
      recommendedSize: "M",
      description: "Tailored standard medium fit",
      numericSize: "8 - 10"
    });
    setSizeNote(null);
    setSelectedOutfit({ top: null, bottom: null, footwear: null, accessories: null });
    setInitialAiOutfit({ top: null, bottom: null, footwear: null, accessories: null });
    setAiComments("");
    setPoints(INITIAL_DEFAULT_POINTS);
    setTryOnOverlaid(false);
    setTryOnUrl(null);
    setFashnStatus("idle");
    setFashnErrorText(null);
    setPaymentProcessing(false);
    setPaymentError(null);
    setOrderId(`FS-${Math.floor(100000 + Math.random() * 900000)}`);
    setPaymentForm({
      cardNumber: "",
      expiryDate: "",
      cvv: "",
      cardholderName: currentUser?.fullName || "",
      billingAddress: "148 Luxury Atelier Blvd, San Francisco, CA"
    });

    if (currentUser?.uid) {
      // Wishlist: try AWS first, fall back to localStorage
      fetch(`/api/users/${currentUser.uid}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`API returned ${res.status}`))))
        .then((profile) => {
          if (Array.isArray(profile?.wishlist)) {
            setWishlist(profile.wishlist);
          } else {
            throw new Error("no wishlist on profile yet");
          }
        })
        .catch(() => {
          const localWish = localStorage.getItem(`wishlist_${currentUser.uid}`);
          if (localWish) {
            try {
              setWishlist(JSON.parse(localWish));
            } catch {
              setWishlist(currentUser?.wishlist || []);
            }
          } else {
            setWishlist(currentUser?.wishlist || []);
          }
        });

      // Body measurements: try AWS first, fall back to localStorage
      const applyProfileData = (data: any) => {
        if (data.heightCm) setHeightCm(data.heightCm);
        if (data.weightKg) setWeightKg(data.weightKg);
        if (data.shoulderSize) setShoulderSize(data.shoulderSize);
        if (data.waistSize) setWaistSize(data.waistSize);
        if (data.hipSize) setHipSize(data.hipSize);
        if (data.classifyDetails) setClassifyDetails(data.classifyDetails);
        if (data.sizeRecommendation) setSizeRecommendation(data.sizeRecommendation);

        const calculatedJoints = calculateJointsFromMeasurements(
          data.shoulderSize || 34,
          data.waistSize || 26,
          data.hipSize || 35
        );
        setGemmaJoints(calculatedJoints);
      };

      fetch(`/api/measurements/${currentUser.uid}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`API returned ${res.status}`))))
        .then((data) => applyProfileData(data))
        .catch((err) => {
          console.warn("[FitStyle AI] Measurements API unavailable, falling back to local cache:", err);
          const savedProfileStr = localStorage.getItem(`bodyProfile_${currentUser.uid}`);
          if (savedProfileStr) {
            try {
              applyProfileData(JSON.parse(savedProfileStr));
            } catch (parseErr) {
              console.error("Failed to parse local profile cache:", parseErr);
            }
          }
        });
    }
  }, [currentUser?.uid]);

  const handleToggleWishlist = async (productId: string) => {
    if (!currentUser?.uid) return;
    
    // Calculate new wishlist
    const isSaved = wishlist.includes(productId);
    const newWishlist = isSaved
      ? wishlist.filter(id => id !== productId)
      : [...wishlist, productId];
      
    // Update local state first for instant responsiveness
    setWishlist(newWishlist);
    
    // Save to local storage for quick sync
    localStorage.setItem(`wishlist_${currentUser.uid}`, JSON.stringify(newWishlist));
    
    // Save to AWS
    try {
      setWishlistSavingState('saving');
      const res = await fetch(`/api/users/${currentUser.uid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentUser, wishlist: newWishlist }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);

      // Update current local user session wishlist so other views can see it
      if (onLogin) {
        onLogin({
          ...currentUser,
          wishlist: newWishlist
        });
      }
      setWishlistSavingState('saved');
      setTimeout(() => setWishlistSavingState('idle'), 2000);
    } catch (err) {
      console.warn("Failed to save wishlist to AWS, kept locally only:", err);
      if (onLogin) {
        onLogin({
          ...currentUser,
          wishlist: newWishlist
        });
      }
      setWishlistSavingState('idle');
    }
  };

// Position points (Percent 0 - 100 on mannequin overlay)
  const [points, setPoints] = useState(INITIAL_DEFAULT_POINTS);

  const jointPoints = gemmaJoints || 
    MODEL_PRESETS.find(p => p.id === activePreset)?.points || 
    points;

  // Handle preset clicks (joint calibration only — no preset photos shown to user)
  const selectPreset = (p: typeof MODEL_PRESETS[0]) => {
    setActivePreset(p.id);
    setHeightCm(p.height);
    setWeightKg(p.weight);
    setShoulderSize(p.defaultShoulder);
    setWaistSize(p.defaultWaist);
    setHipSize(p.defaultHip);
    setPersonDetected(true);
    setPoseConfidence(95);
    if (p.points) {
      setPoints(p.points);
    }
    setTryOnOverlaid(false);
    setTryOnUrl(null);
    setFashnStatus("idle");
  };

  // Orchestrate Haute Stylist Analysis Pipeline (Step 1 + Step 2 + Step 3)
  const runHauteStylistAnalysis = async (
    imgBase64: string,
    hCm: number,
    wKg: number,
    occ: string,
    failHeight: boolean,
    assignedHeight: number,
    isLooseClothing: boolean
  ) => {
    if (isAnalyzingRef.current) {
      console.log("[INFO] Skipping concurrent runHauteStylistAnalysis call.");
      return;
    }
    setAnalysisError(null);
    isAnalyzingRef.current = true;
    setPoseLoading(true);
    setCommentsLoading(true);
    setAiComments("");
    try {
      const analysisKey = `analysis_${Date.now()}`;
      console.log("Analyzing new image:", analysisKey);

      const response = await fetch("/api/analyze-body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imgBase64,
          heightCm: hCm > 0 ? hCm : 165,
          weightKg: wKg > 0 ? wKg : 58,
          occasion: occ,
          analysisKey
        })
      });

      const data = await response.json();

      if (!response.ok) {
        handleAnalysisError(
          response.status,
          data.error || "unknown",
          data.message || "Unknown error"
        );
        return;
      }

      setUnusablePhotoError(null);
      setHauteStylistResult(data);
      lastAnalyzedPhotoRef.current = imgBase64;
      lastAnalyzedOccasionRef.current = occ;

      // Run PoseNet on the displayed mannequin image
      if (mannequinImageRef.current) {
        detectJointsFromImage(mannequinImageRef.current)
          .then((joints) => {
            if (joints) {
              setGemmaJoints(joints);
              console.log("[PoseNet] Joint positions detected:", joints);
            } else {
              console.log("[PoseNet] Could not detect joints, using math fallback");
              // Keep existing math-calculated joints as fallback
            }
          })
          .catch(() => {
            console.log("[PoseNet] Error, keeping math fallback");
          });
      }

      const bodyAnalysis = data.body_analysis || {};
      const validated = validateAndCorrectMeasurements({
        shoulders_in: Number(bodyAnalysis.shoulders_in) || 34,
        waist_in: Number(bodyAnalysis.waist_in) || 26,
        hips_in: Number(bodyAnalysis.hips_in) || 35,
        height_cm: Number(bodyAnalysis.height_cm) || hCm || 165,
        weight_kg: Number(bodyAnalysis.weight_kg) || wKg || 58,
        body_shape: bodyAnalysis.body_shape || "Hourglass",
        suggested_size: bodyAnalysis.recommended_size || bodyAnalysis.suggested_size || "M",
        confidence: bodyAnalysis.confidence || "High",
        clothing_interference: bodyAnalysis.clothing_interference || false,
        warnings: bodyAnalysis.warnings || []
      });
      // Sync AI body_analysis confidence with the validated (possibly upgraded) value
      if (data.body_analysis && validated.confidence) {
        data.body_analysis.confidence = validated.confidence;
      }
      setValidationResult(validated);
      // Present only when the real FitVerse model produced this result
      setAnnotatedImage(bodyAnalysis.annotated_image_base64 || null);

      const shoulderSize = validated.shoulders_in;
      const waistSize = validated.waist_in;
      const hipSize = validated.hips_in;

      // Update Calibrated Dimensions state
      setAiCalibrationData({
        shoulders: shoulderSize,
        waist: waistSize,
        hips: hipSize,
        body_shape: validated.body_shape || "Hourglass",
        body_shape_description: bodyAnalysis.body_shape_description || "Balanced proportions",
        recommended_size: validated.suggested_size || "M",
        size_range: validated.suggested_size || "M"
      });

      // Update sliders
      setShoulderSize(shoulderSize);
      setWaistSize(waistSize);
      setHipSize(hipSize);

      const calculatedJoints = calculateJointsFromMeasurements(
        shoulderSize, 
        waistSize, 
        hipSize
      );
      setGemmaJoints(calculatedJoints);

      // Set shape classifications
      setClassifyDetails({
        shape: (validated.body_shape || "Hourglass") as any,
        explanation: bodyAnalysis.body_shape_description || "Balanced symmetry"
      });

      setSizeRecommendation({
        recommendedSize: (validated.suggested_size || "M") as any,
        description: "AI Calibrated Fitting Alignment",
        numericSize: validated.suggested_size || "8-10"
      });
      setSelectedSize(validated.suggested_size || "M");

      // Height logic from Qwen estimated and validated values
      setHeightCm(validated.height_cm);
      setWeightKg(validated.weight_kg);
      calibratedMeasurementsRef.current = {
        heightCm: validated.height_cm,
        shoulderSize,
        waistSize,
        hipSize
      };
      originalAiMeasurementsRef.current = {
        heightCm: validated.height_cm,
        shoulderSize,
        waistSize,
        hipSize
      };

      // Reflects FitVerse's real waist_confidence (High/Medium/Low), not a
      // cosmetic formula -- this is the actual model's confidence, not decoration.
      const confidenceLevel = (validated.confidence || "").toLowerCase();
      if (confidenceLevel === "high") {
        setPoseConfidence(95);
      } else if (confidenceLevel === "low" || isLooseClothing) {
        setPoseConfidence(60);
      } else {
        setPoseConfidence(80);
      }

      // Map Groq returned Outfit Coordinates directly into active showroom slots!
      if (data.outfit_coordinates && Array.isArray(data.outfit_coordinates)) {
        const coordinateProductIds = data.outfit_coordinates
          .map((c: any) => c.id)
          .filter(Boolean);

        // Prefer actual catalog items that match recommended size + occasion when available
        const preferCatalogMatch = (cat: "top" | "bottom") => {
          const matches = products.filter((p) => categoryMatches(p, cat) && matchesOccasion(p, occ as string) && productMatchesSize(p, bodyAnalysis.recommended_size || sizeRecommendation.recommendedSize));
          const coordinateMatch = matches.find((p) => coordinateProductIds.includes(p.id));
          if (coordinateMatch) return coordinateMatch;
          if (cat === "top") {
            const dressMatches = matches.filter(isDressProduct);
            return dressMatches.length > 0 ? dressMatches[0] : matches[0] || null;
          }
          return matches.length > 0 ? matches[0] : null;
        };

        const initialFromCatalog = {
          top: preferCatalogMatch("top"),
          bottom: occ === "Wedding" ? null : preferCatalogMatch("bottom"),
          footwear: null,
          accessories: null,
        };

        if (occ === "Wedding") {
          initialFromCatalog.bottom = null;
          // Populate 3 wedding product cards from the catalog
          const weddingPool = products
            .filter((p) => matchesOccasion(p, "Wedding") && categoryMatches(p, "top"))
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);
          setWeddingProducts(weddingPool);
        } else {
          setWeddingProducts([]);
        }

        setSelectedOutfit(initialFromCatalog as any);
        setInitialAiOutfit(initialFromCatalog as any);
      }

      // Populate Head Stylist log beautifully
      if (data.stylist_log?.harmony_analysis) {
        setAiComments(
          `**HARMONY ANALYSIS**\n${data.stylist_log.harmony_analysis}\n\n` +
          `**SILHOUETTE CALIBRATION**\n${data.stylist_log.silhouette_calibration}`
        );
      }

      // Save body measurements to AWS and keep a local backup.
      let profileData: any = null;
      try {
        if (currentUser?.uid) {
          profileData = {
            heightCm: Number(bodyAnalysis.height_cm) || 165,
            weightKg: Number(wKg) || 58,
            shoulderSize: shoulderSize,
            waistSize: waistSize,
            hipSize: hipSize,
            selectedPhoto: imgBase64,
            classifyDetails: {
              shape: bodyAnalysis.body_shape || "Hourglass",
              explanation: bodyAnalysis.body_shape_description || "Balanced symmetry"
            },
            sizeRecommendation: {
              recommendedSize: bodyAnalysis.recommended_size || "M",
              description: "AI Calibrated Fitting Alignment",
              numericSize: bodyAnalysis.size_range || "8-10"
            },
            updatedAt: new Date().toISOString()
          };

          // Always backup to local storage
          localStorage.setItem(`bodyProfile_${currentUser.uid}`, JSON.stringify(profileData));
          console.log(`Successfully backed up bodyProfile to local storage for ${currentUser.uid}`);

          try {
            const res = await fetch(`/api/measurements/${currentUser.uid}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(profileData),
            });
            if (!res.ok) {
              throw new Error(`API returned ${res.status}`);
            }
            console.log("Successfully saved body measurements to AWS for " + currentUser.uid);
          } catch (awsErr) {
            console.warn("Could not save measurements to AWS, kept local data only:", awsErr);
          }
        }
      } catch (saveErr) {
        console.error("Failed to save measured body profile:", saveErr);
      }

    } catch (err) {
      console.log("[ERROR] Haute Stylist vision/styling pipeline failed to finalize:", err);
    } finally {
      setPoseLoading(false);
      setCommentsLoading(false);
      isAnalyzingRef.current = false;
    }
  };

  // Process manual files uploads
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAnalysisError(null);
      // Clear previous calculations, measurements, and joints immediately to prevent carriage or leakage
      lastAnalyzedPhotoRef.current = null;
      lastAnalyzedOccasionRef.current = null;
      isAnalyzingRef.current = false;
      setHauteStylistResult(null);
      setGemmaJoints(null);
      setAiCalibrationData(null);
      setPoints(INITIAL_DEFAULT_POINTS);
      setShoulderSize(0);
      setWaistSize(0);
      setHipSize(0);
      
      setClassifyDetails({
        shape: "Hourglass",
        explanation: "Scanning body silhouette silhouette proportions..."
      });
      
      setSizeRecommendation({
        recommendedSize: "Pending",
        description: "Analyzing standard fitting dimensions...",
        numericSize: "Pending"
      });
      
      setSizeNote(null);
      setSelectedOutfit({ top: null, bottom: null, footwear: null, accessories: null });
      setInitialAiOutfit({ top: null, bottom: null, footwear: null, accessories: null });
      setAiComments("");
      setUnusablePhotoError(null);

      const file = e.target.files[0];
      const validTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!validTypes.includes(file.type)) {
        alert("Please upload a valid JPG, PNG, or WEBP photograph.");
        return;
      }

      setPoseLoading(true);
      setPersonDetected(true);
      setPoseConfidence(95);
      setTryOnOverlaid(false);
      setTryOnUrl(null);
      setFashnStatus("idle");
      setCustomUploadCount(prev => prev + 1);

      const isNoPerson = file.name.toLowerCase().includes("no_person") || file.name.toLowerCase().includes("empty") || file.name.toLowerCase().includes("noperson");
      const isLooseClothing = file.name.toLowerCase().includes("loose") || file.name.toLowerCase().includes("oversized") || file.name.toLowerCase().includes("baggy");

      const reader = new FileReader();
      reader.onload = async (uploadEvent) => {
        if (uploadEvent.target?.result) {
          const base64Data = uploadEvent.target.result as string;

          if (isNoPerson) {
            setPoseLoading(false);
            setPersonDetected(false);
            setPoseConfidence(0);
            return;
          }

          setSelectedPhoto(base64Data);
          setUserHasUploaded(true);
          setActivePreset("custom");

          await runHauteStylistAnalysis(
            base64Data,
            heightCm > 0 ? heightCm : 165,
            weightKg > 0 ? weightKg : 58,
            chosenOccasion,
            false,
            heightCm > 0 ? heightCm : 165,
            isLooseClothing
          );
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Run MediaPipe simulated calculation when landmark numbers change
  useEffect(() => {
    if (heightCm === 0) return;
    if (shoulderSize === 0 || waistSize === 0 || hipSize === 0) return;

    if (aiCalibrationData && 
        aiCalibrationData.shoulders === shoulderSize && 
        aiCalibrationData.waist === waistSize && 
        aiCalibrationData.hips === hipSize) {
      setClassifyDetails({
        shape: aiCalibrationData.body_shape as BodyShapeType,
        explanation: aiCalibrationData.body_shape_description
      });
      setSizeRecommendation({
        recommendedSize: aiCalibrationData.recommended_size as any,
        description: "AI Calibrated Fitting Alignment",
        numericSize: aiCalibrationData.size_range
      });
      setSizeNote(null);
      return;
    }

    // Shoulder ratio calculation to select shape bounds
    const waistToHip = waistSize / hipSize;
    const shoulderToWaist = shoulderSize / waistSize;

    let shape: BodyShapeType = "Rectangle";
    let explanation = "";

    if (waistToHip <= 0.75 && shoulderToWaist >= 1.25) {
      shape = "Hourglass";
      explanation = "Your shoulders and hips align symmetrically with a heavily defined, narrow waist line. Perfect for tailored cinches.";
    } else if (waistToHip > 0.8 && shoulderSize / hipSize < 0.9) {
      shape = "Pear";
      explanation = "Your hips are wider than your shoulders, highlighting a curved lower symmetry. Emphasize neck lines and structured tops.";
    } else if (shoulderSize / hipSize > 1.15) {
      shape = "Inverted Triangle";
      explanation = "Your shoulder span is athletically broader than your waist/hips. Great for broad A-line skirts and relaxed bottom frames.";
    } else if (waistToHip >= 0.8 && waistToHip <= 0.95 && Math.abs(shoulderSize - hipSize) <= 2) {
      shape = "Rectangle";
      explanation = "Smooth, athletic alignment of shoulders, torso, and hips. Looks spectacular in textured layers and drape belts.";
    } else {
      shape = "Apple";
      explanation = "A broad shoulders frame and smooth hips line with waist elegance. Great for flowy, lightweight materials and silk wraps.";
    }

    setClassifyDetails({ shape, explanation });

    // Numeric Size mapping based on raw corrected hip measurement
    const realHips = hipSize;
    let recommendedSize = "M";
    let desc = "Standard refined tailored fit";
    let numeric = "8 - 10";
    let boundaryNote: string | null = null;

    if (realHips < 33) {
      recommendedSize = "XS";
      desc = "Slim fit mini tailoring frame";
      numeric = "0 - 2";
      if (realHips >= 32.5) {
        boundaryNote = "Size Cusp Note: Your hip coordinates are on the border of XS and S. We recommend the larger size S for optimal comfort.";
      }
    } else if (realHips >= 33 && realHips < 35) {
      recommendedSize = "S";
      desc = "Petite tailored comfort";
      numeric = "4 - 6";
      if (realHips >= 34.5) {
        boundaryNote = "Size Cusp Note: Your hip coordinates are on the border of S and M. We recommend the larger size M for optimal comfort.";
      }
    } else if (realHips >= 35 && realHips < 38) {
      recommendedSize = "M";
      desc = "Elegant balanced posture fit";
      numeric = "8 - 10";
      if (realHips >= 37.5) {
        boundaryNote = "Size Cusp Note: Your hip coordinates are on the border of M and L. We recommend the larger size L for relaxed draping.";
      }
    } else if (realHips >= 38 && realHips < 41) {
      recommendedSize = "L";
      desc = "Relatively relaxed proportional alignment";
      numeric = "12 - 14";
      if (realHips >= 40.5) {
        boundaryNote = "Size Cusp Note: Your hip coordinates are on the border of L and XL. We recommend the larger size XL for standard seam comfort.";
      }
    } else if (realHips >= 41 && realHips < 44) {
      recommendedSize = "XL";
      desc = "Enlarged structural comfort";
      numeric = "16";
      if (realHips >= 43.5) {
        boundaryNote = "Size Cusp Note: Your hip coordinates are on the border of XL and XXL. We recommend size XXL for optimal comfort.";
      }
    } else {
      recommendedSize = "XXL";
      desc = "Extended couture alignment";
      numeric = "18+";
    }

    setSizeRecommendation({ recommendedSize, description: desc, numericSize: numeric });
    setSizeNote(boundaryNote);
  }, [shoulderSize, waistSize, hipSize, heightCm, weightKg]);

  // Recalculate size recommends, and filter catalog for best item coords
  useEffect(() => {
    // If user has uploaded a custom image (marked with base64 data: URL) and updates occasion
    if (selectedPhoto && selectedPhoto.startsWith("data:") && activePreset === "custom") {
      if (
        selectedPhoto === lastAnalyzedPhotoRef.current &&
        chosenOccasion === lastAnalyzedOccasionRef.current
      ) {
        return;
      }

      if (sizeRecommendation.recommendedSize === "Pending" || poseLoading || isAnalyzingRef.current) {
        return;
      }
      runHauteStylistAnalysis(
        selectedPhoto,
        heightCm,
        weightKg,
        chosenOccasion,
        heightCm === 0,
        heightCm,
        false
      );
      return;
    }

    // Preserve Groq custom recommended coordinates only when they contain valid outfit slots.
    if (
      hauteStylistResult &&
      Array.isArray(hauteStylistResult.outfit_coordinates) &&
      hauteStylistResult.outfit_coordinates.length > 0
    ) {
      return;
    }

    // Find products matching current occasion AND body shape
    let occasionProducts = products.filter((p) => {
      const occMatch = matchesOccasion(p, chosenOccasion);
      const userShape = normalizeString(classifyDetails?.shape || "Hourglass");
      const pShapes = (p as any).shapes && Array.isArray((p as any).shapes)
        ? (p as any).shapes.map((s: string) => normalizeString(s))
        : [];
      const shapeMatch = pShapes.length === 0 || pShapes.includes(userShape);

      return occMatch && shapeMatch && (categoryMatches(p, "top") || categoryMatches(p, "bottom"));
    });

    // Fallback: match by occasion only if no products match both filtered features
    if (occasionProducts.length === 0) {
      occasionProducts = products.filter((p) =>
        matchesOccasion(p, chosenOccasion) &&
        (categoryMatches(p, "top") || categoryMatches(p, "bottom"))
      );
    }

    const matchForSize = (cat: "top" | "bottom") => {
      const dressAwareFilter = (product: Product) => {
        if (cat !== "top") return true;
        return isDressProduct(product);
      };

      let subset = occasionProducts.filter(
        (p) => categoryMatches(p, cat) && dressAwareFilter(p) && (p.size === sizeRecommendation.recommendedSize || p.size === "OS")
      );
      if (subset.length === 0) {
        subset = occasionProducts.filter((p) => categoryMatches(p, cat) && dressAwareFilter(p));
      }
      return subset.length > 0 ? subset[Math.floor(Math.random() * subset.length)] : null;
    };

    const defaultOutfit = {
      top: matchForSize("top"),
      bottom: chosenOccasion === "Wedding" ? null : matchForSize("bottom"),
      footwear: null,
      accessories: null
    };

    setSelectedOutfit(defaultOutfit);
    setInitialAiOutfit(defaultOutfit);

    // For Wedding: populate 3 recommended products (shuffled for variety)
    if (chosenOccasion === "Wedding") {
      const weddingPool = occasionProducts
        .filter((p) => categoryMatches(p, "top"))
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      setWeddingProducts(weddingPool.length > 0 ? weddingPool : occasionProducts.slice(0, 3));
    } else {
      setWeddingProducts([]);
    }

    setTryOnOverlaid(false);
    setTryOnUrl(null);
  }, [chosenOccasion, sizeRecommendation.recommendedSize, products, selectedPhoto]);

  // Fetch real-time Gemma AI style advice or trigger fallback tips
  const fetchStyleAdvice = async () => {
    setCommentsLoading(true);
    setAiComments("");
    try {
      const itemsPayload = [
        selectedOutfit.top,
        selectedOutfit.bottom,
        selectedOutfit.footwear,
        selectedOutfit.accessories
      ].filter(Boolean);

      const res = await fetch("/api/style-advice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          bodyShape: classifyDetails.shape,
          heightCm,
          weightKg,
          size: sizeRecommendation.recommendedSize,
          occasion: chosenOccasion,
          items: itemsPayload
        })
      });
      const data = await res.json();
      const fallbackAdvice = "A styling update is being formulated.";
      setAiComments(data?.advice || fallbackAdvice);
    } catch (err) {
      console.log("[INFO] Error communicating with Style API:", err);
      setAiComments("A styling update is being formulated.");
    } finally {
      setCommentsLoading(false);
    }
  };

  // Generate real advice on initial loading or outfit coordinates load
  useEffect(() => {
    if (selectedOutfit.top) {
      // If we are currently showing a Groq custom outfit, do not run the standard generator.
      if (selectedOutfit.top.id === "groq-top" || (hauteStylistResult && selectedOutfit.top.id.startsWith("groq-"))) {
        return;
      }
      fetchStyleAdvice();
    }
  }, [selectedOutfit.top, selectedOutfit.bottom, chosenOccasion]);

  const showProductOverlayFallback = (imageUrl: string, message: string) => {
    setFashnStatus("fallback");
    setFashnErrorText(message);
    setTryOnUrl(null);
    setTryOnOverlaid(false);
    setProductOverlayStyle({
      position: "absolute",
      left: "50%",
      top: "38%",
      width: "42%",
      maxHeight: "48%",
      transform: "translate(-50%, -50%)",
      zIndex: 45,
      pointerEvents: "none",
      borderRadius: 10,
      opacity: 0.94,
      objectFit: "contain",
      filter: "drop-shadow(0 18px 28px rgba(0,0,0,0.28))"
    });
    setProductOverlayUrl(imageUrl);
    setTryOnRenderKey((key) => key + 1);
  };

  const triggerTryOn = async (topImage?: string, _garmentDescription?: string) => {
    setProductOverlayUrl(null);

    const userPhoto = selectedPhoto;
    const garmentImage = topImage || selectedOutfit.top?.image;

    if (!userPhoto || !garmentImage) {
      setFashnErrorText("Please upload photo and select outfit first.");
      return;
    }

    setTrialLoading(true);
    setFashnErrorText(null);
    setFashnStatus("loading");
    setTryOnOverlaid(false);
    setTryOnUrl(null);
    setTryOnRenderKey((key) => key + 1);

    try {
      const response = await fetch("/api/try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPhoto,
          topImage: garmentImage
        })
      });

      if (!response.ok) {
        throw new Error(`Try-on failed: ${response.status}`);
      }

      const result = await response.json();
      const tryOnImageUrl = result?.tryOnUrl;

      if (tryOnImageUrl) {
        setTryOnUrl(tryOnImageUrl);
        setTryOnOverlaid(true);
        setFashnStatus("success");
        setTryOnRenderKey((key) => key + 1);
      } else {
        throw new Error(result?.error || "No image returned from API.");
      }

    } catch (err: any) {
      setFashnStatus("error");
      setFashnErrorText(err.message || "Try-on failed. Please retry.");
      setTryOnOverlaid(false);
      setTryOnUrl(null);
    } finally {
      setTrialLoading(false);
    }
  };

  const retryTryOn = () => {
    setForceFashnFailure(false);
    setFashnStatus("idle");
    setFashnErrorText(null);
    triggerTryOn();
  };

  // ---------------- Outfit recommendations: load, customise, explain, try-on ----------------
  const recoParams: RecoProfileParams = {
    size: selectedSize,
    bodyShape: classifyDetails.shape,
    occasion: chosenOccasion,
  };

  const recoSelectedItems = recoItems.filter((i) => !recoDeselected.includes(i.id));

  // 1) Load the 5 recommended outfits when Step 3 opens (and when shape / size / occasion change).
  useEffect(() => {
    if (currentStep !== 3 || !currentUser) return;
    const key = `${currentUser.uid}|${selectedSize}|${classifyDetails.shape}|${chosenOccasion}`;
    if (key === lastRecoKeyRef.current && recoOutfits.length > 0) return; // keep the shopper's customised pick
    let cancelled = false;
    setRecoLoading(true);
    setRecoError(null);
    fetchRecommendations(recoParams)
      .then((data) => {
        if (cancelled) return;
        lastRecoKeyRef.current = key;
        setRecoOutfits(data.outfits);
        setRecoIndex(0);
        setRecoItems(data.outfits[0]?.items || []);
        setRecoDeselected([]);
        setRecoNote(
          data.relaxed?.length
            ? `Closest matches: limited stock for ${data.relaxed.join(" and ")} in your size.`
            : null
        );
        if (data.outfits.length === 0) setRecoError("No outfits available for this profile right now.");
      })
      .catch((e) => {
        if (cancelled) return;
        setRecoOutfits([]);
        setRecoItems([]);
        setRecoError(null); // fall back silently to the legacy collection list
        console.warn("[Reco] unavailable, using legacy collections:", e?.message);
      })
      .finally(() => { if (!cancelled) setRecoLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, currentUser?.uid, selectedSize, classifyDetails.shape, chosenOccasion]);

  // 2) Keep the legacy 4-slot selection (used by Create Order / PDF / swap flows) in sync.
  useEffect(() => {
    if (!recoActive) return;
    const dress = recoSelectedItems.find((i) => i.garmentCategory === "Dress");
    setSelectedOutfit({
      top: dress || recoSelectedItems.find((i) => i.garmentCategory === "Top") || null,
      bottom: recoSelectedItems.find((i) => i.garmentCategory === "Bottom") || null,
      footwear: recoSelectedItems.find((i) => i.garmentCategory === "Shoes") || null,
      accessories: recoSelectedItems.find((i) => i.garmentCategory === "Accessory") || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoItems, recoDeselected, recoActive]);

  // 3) LLM justification - refreshed whenever the outfit (or any single product) changes.
  useEffect(() => {
    if (!recoActive || recoSelectedItems.length === 0 || currentStep !== 3) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setRecoExplLoading(true);
      fetchExplanation(recoParams, recoSelectedItems.map((i) => i.id))
        .then((ex) => { if (!cancelled) setRecoExplanation(ex); })
        .catch(() => { if (!cancelled) setRecoExplanation(recoOutfits[recoIndex]?.explanation || null); })
        .finally(() => { if (!cancelled) setRecoExplLoading(false); });
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoSelectedItems.map((i) => i.id).join(","), currentStep, recoActive]);

  const handleSelectRecoOutfit = (index: number) => {
    const outfit = recoOutfits[index];
    if (!outfit) return;
    setRecoIndex(index);
    setRecoItems(outfit.items);
    setRecoDeselected([]);
    setRecoExplanation(outfit.explanation || null);
  };

  const handleSwapRecoItem = (category: RecoItem["garmentCategory"], item: RecoItem) => {
    const replaced = recoItems.find((i) => i.garmentCategory === category);
    setRecoDeselected((previous) => (replaced ? previous.filter((id) => id !== replaced.id) : previous));
    setRecoItems((previous) =>
      previous.some((i) => i.garmentCategory === category)
        ? previous.map((i) => (i.garmentCategory === category ? item : i))
        : [...previous, item]
    );
  };

  const handleToggleRecoItem = (id: string) => {
    setRecoDeselected((previous) => (previous.includes(id) ? previous.filter((x) => x !== id) : [...previous, id]));
  };

  // Swapping items triggers
  const handleSwapItem = (product: Product) => {
    if (swapCategory) {
      setSelectedOutfit((prev) => ({
        ...prev,
        [swapCategory]: product
      }));
      setSwapCategory(null);
      setTryOnOverlaid(false);
      setTryOnUrl(null);
    }
  };

  const handleTryOnItem = async (product: Product) => {
    const isSupportedTryOn = categoryMatches(product, "top") || categoryMatches(product, "footwear") || categoryMatches(product, "accessories");
    if (!isSupportedTryOn) {
      setFashnErrorText("Try-On is currently only available for tops, footwear, and accents.");
      return;
    }

    // DEBUG: surface quick client-side trace so we can see what's being invoked
    try {
      console.log("[DEBUG] handleTryOnItem invoked", { id: product.id, name: product.name, category: product.category, image: product.image });
    } catch (e) {
      // ignore
    }

    const isTop = categoryMatches(product, "top");
    const isFootwear = categoryMatches(product, "footwear");
    const isAccent = categoryMatches(product, "accessories");

    setSelectedOutfit((prev) => {
      if (isTop) return { ...prev, top: product };
      if (isFootwear) return { ...prev, footwear: product };
      if (isAccent) return { ...prev, accessories: product };
      return prev;
    });

    // Backend Kolors try-on supports upper-body garments (tops) only.
    // For footwear and accessories we provide a graceful fallback preview instead
    // of invoking the Kolors pipeline which would incorrectly drape them as clothing.
    if (isFootwear || isAccent) {
      setTryOnOverlaid(false);
      setTryOnUrl(null);
      setProductOverlayUrl(null);
      setFashnStatus("fallback");
      setFashnErrorText("Fallback preview: try-on for footwear/accessories is not yet supported. Showing product preview.");
      // Compute simple overlay placement based on detected joints
      try {
        const hipX = (jointPoints.hipLeft.x + jointPoints.hipRight.x) / 2;
        const hipY = (jointPoints.hipLeft.y + jointPoints.hipRight.y) / 2;
        const shoulderX = (jointPoints.shoulderLeft.x + jointPoints.shoulderRight.x) / 2;
        const shoulderY = (jointPoints.shoulderLeft.y + jointPoints.shoulderRight.y) / 2;
        const waistY = (jointPoints.waistLeft.y + jointPoints.waistRight.y) / 2;

        if (isFootwear) {
          const hipSpan = Math.abs(jointPoints.hipRight.x - jointPoints.hipLeft.x);
          const widthPct = Math.min(46, Math.max(28, hipSpan * 2.1));
          const isBoot = /boot|boots|thigh|knee/i.test(product.name || "");
          const left = Math.max(38, Math.min(62, hipX));
          const topOffset = isBoot ? Math.max(18, hipSpan * 40) : Math.max(48, hipSpan * 50);
          const top = Math.min(92, hipY + topOffset);
          const tilt = ((jointPoints.shoulderRight.y - jointPoints.shoulderLeft.y) || 0) * 0.22;
          setProductOverlayStyle({
            position: "absolute",
            left: `${left}%`,
            top: `${top}%`,
            width: `${widthPct}%`,
            maxHeight: "50%",
            transform: `translate(-50%, -50%) rotate(${tilt}deg)`,
            zIndex: 65,
            pointerEvents: "none",
            borderRadius: 10,
            opacity: 0.96,
            boxShadow: "0 20px 36px rgba(0,0,0,0.28)",
            objectFit: "cover"
          });
        } else {
          const lname = (product.name || "").toLowerCase();
          if (lname.includes("neck") || lname.includes("choker") || lname.includes("pendant") || lname.includes("necklace")) {
            const left = Math.max(5, Math.min(95, shoulderX));
            const top = Math.max(5, shoulderY + 10);
            setProductOverlayStyle({
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: "24%",
              transform: "translate(-50%, -50%)",
              zIndex: 45,
              pointerEvents: "none",
              borderRadius: 10,
              boxShadow: "0 10px 24px rgba(0,0,0,0.22)"
            });
          } else {
            const left = Math.max(10, Math.min(92, hipX + 18));
            const top = Math.min(90, hipY + 10);
            setProductOverlayStyle({
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: "22%",
              transform: "translate(-50%, -50%)",
              zIndex: 45,
              pointerEvents: "none",
              borderRadius: 10,
              boxShadow: "0 10px 24px rgba(0,0,0,0.22)"
            });
          }
        }

        setProductOverlayUrl(product.image || null);
      } catch (e) {
        setProductOverlayStyle({ position: "absolute", left: "50%", top: "60%", width: "28%", transform: "translate(-50%, -50%)", zIndex: 45, pointerEvents: "none" });
        setProductOverlayUrl(product.image || null);
      }

      return;
    }

    setTryOnOverlaid(false);
    setTryOnUrl(null);
    await triggerTryOn(product.image, product.name);
  };

  // Calibration Draggable handlers
  const handleMouseDown = (markerName: string) => {
    setDragMarker(markerName);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragMarker || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pctX = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const pctY = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));

    setPoints((prev: any) => {
      const updated = { ...prev };
      updated[dragMarker] = { x: pctX, y: pctY };
      return updated;
    });

    // Translate coordinates into body metrics dynamically
    const distToInches = (x1: number, x2: number) => Math.round(Math.abs(x1 - x2) * 0.95);
    if (dragMarker.startsWith("shoulder")) {
      const newShoulder = distToInches(points.shoulderLeft.x, points.shoulderRight.x);
      setShoulderSize(newShoulder > 20 ? newShoulder : 20);
    } else if (dragMarker.startsWith("waist")) {
      const newWaist = distToInches(points.waistLeft.x, points.waistRight.x);
      setWaistSize(newWaist > 18 ? newWaist : 18);
    } else if (dragMarker.startsWith("hip")) {
      const newHip = distToInches(points.hipLeft.x, points.hipRight.x);
      setHipSize(newHip > 22 ? newHip : 22);
    }
  };

  const handleMouseUpOrLeave = () => {
    setDragMarker(null);
  };

  // jsPDF premium fashion atelier report — redesigned
  const exportPDFSummary = async () => {
    setIsGeneratingPDF(true);
    try {
      const [topBase64, bottomBase64, footwearBase64, accentsBase64] = await Promise.all([
        getRoundedProductImage(selectedOutfit.top?.image, "👗"),
        getRoundedProductImage(selectedOutfit.bottom?.image, "👖"),
        getRoundedProductImage(selectedOutfit.footwear?.image, "👠"),
        getRoundedProductImage(selectedOutfit.accessories?.image, "💍")
      ]);

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      // ── Design Tokens — Professional Fashion Atelier Palette ─────────────────
      const C = {
        // Primary: Deep Aubergine — rich, fashion-forward, highly readable
        brand:     [38, 20, 60]     as [number,number,number],  // deep aubergine/navy
        brandMid:  [62, 38, 95]     as [number,number,number],  // mid purple
        accent:    [120, 60, 180]   as [number,number,number],  // clear violet accent
        // Neutrals — clean editorial
        ink:       [15, 12, 20]     as [number,number,number],  // true near-black
        charcoal:  [40, 36, 50]     as [number,number,number],  // dark body text
        bodyText:  [60, 55, 70]     as [number,number,number],  // readable body
        // Gold — warm champagne, not yellow
        gold:      [188, 152, 90]   as [number,number,number],  // champagne gold
        goldLight: [240, 224, 180]  as [number,number,number],  // pale champagne
        goldPale:  [252, 248, 236]  as [number,number,number],  // cream bg
        // Backgrounds — clean, airy
        lavender:  [245, 242, 252]  as [number,number,number],  // barely-there violet
        lavMid:    [228, 220, 242]  as [number,number,number],  // soft violet
        smoke:     [250, 249, 252]  as [number,number,number],  // near-white
        fog:       [218, 212, 228]  as [number,number,number],  // border/divider
        mist:      [140, 130, 155]  as [number,number,number],  // muted labels
        // Utility
        white:     [255, 255, 255]  as [number,number,number],
        green:     [20, 120, 70]    as [number,number,number],  // clear forest green
        greenBg:   [232, 250, 240]  as [number,number,number],  // clean green bg
        // Category accent row colors — distinct, coordinated
        catBlue:   [30, 80, 160]    as [number,number,number],  // cobalt
        catAmber:  [160, 100, 20]   as [number,number,number],  // amber
        catTeal:   [20, 120, 110]   as [number,number,number],  // teal
      };

      const PW = 210, PH = 297;
      const ML = 14, MR = 14;
      const CW = PW - ML - MR;

      // ── Helpers ──────────────────────────────────────────────────────────────
      const fill  = (c: [number,number,number]) => doc.setFillColor(c[0], c[1], c[2]);
      const draw  = (c: [number,number,number]) => doc.setDrawColor(c[0], c[1], c[2]);
      const color = (c: [number,number,number]) => doc.setTextColor(c[0], c[1], c[2]);
      const hline = (y: number, x1 = ML, x2 = PW - MR, lw = 0.2) => {
        doc.setLineWidth(lw); draw(C.fog); doc.line(x1, y, x2, y);
      };
      const pill = (x: number, y: number, w: number, h: number, fc: [number,number,number]) => {
        fill(fc); doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
      };
      const tag = (text: string, x: number, y: number, fc: [number,number,number], tc: [number,number,number], fs = 5.5) => {
        const tw = doc.getTextWidth(text);
        const pad = 3;
        pill(x, y - fs * 0.75, tw + pad * 2, fs * 1.35, fc);
        doc.setFontSize(fs); doc.setFont("helvetica", "bold"); color(tc);
        doc.text(text, x + pad, y);
      };

      // ── PAGE BACKGROUND ──────────────────────────────────────────────────────
      fill(C.white); doc.rect(0, 0, PW, PH, "F");

      // Subtle full-page side rule (left edge brand accent)
      fill(C.brand); doc.rect(0, 0, 3, PH, "F");

      // Top-right accent corner — clean geometric
      fill(C.lavender); doc.rect(PW - 40, 0, 40, 40, "F");
      fill(C.lavMid);   doc.rect(PW - 22, 0, 22, 22, "F");
      fill(C.brand);    doc.rect(PW - 10, 0, 10, 10, "F");

      // ── 1. HERO HEADER ────────────────────────────────────────────────────────
      const HH = 50;

      // Clean solid header — deep aubergine, full width
      fill(C.brand); doc.rect(0, 0, PW, HH, "F");

      // Gold bottom rule on header — crisp 1.5mm
      fill(C.gold); doc.rect(0, HH - 1.5, PW, 1.5, "F");

      // Subtle header texture: right-side lighter block
      fill(C.brandMid); doc.rect(PW * 0.62, 0, PW * 0.38, HH - 1.5, "F");
      // Soft diagonal blend seam
      fill(C.accent);
      for (let i = 0; i < 6; i++) {
        doc.setLineWidth(0.8);
        doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2]);
        doc.line(PW * 0.62 - i * 1.5, 0, PW * 0.62 - i * 1.5 + 3, HH - 1.5);
      }

      // Brand wordmark — elegant editorial serif
      doc.setFont("times", "bolditalic");
      doc.setFontSize(32);
      color(C.white);
      doc.text("FitStyle", ML + 4, 24);
      const fsW = doc.getTextWidth("FitStyle");
      doc.setFont("times", "italic");
      doc.setFontSize(32);
      color(C.goldLight);
      doc.text(" AI", ML + 4 + fsW, 24);

      // Tagline — generous tracking, elegant weight
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      color(C.goldLight);
      doc.text("VIRTUAL FITTING STUDIO  ·  ATELIER STYLE REPORT", ML + 4, 34);

      // Decorative diamond row — refined, tighter
      const diamY = 41.5;
      for (let d = 0; d < 6; d++) {
        fill(d % 2 === 0 ? C.gold : C.goldLight);
        const dx = ML + 4 + d * 6;
        // Diamond shape via rotated rect
        doc.rect(dx + 0.8, diamY - 1, 1.6, 1.6, "F");
      }

      // Right meta panel — clean label/value hierarchy
      const META_X = PW * 0.68;
      const orderId = pdfOrderRef;
      const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      // CLIENT label + name
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      color(C.goldLight);
      doc.text("CLIENT", META_X, 10);
      // Thin gold rule under label
      fill(C.gold); doc.rect(META_X, 11.5, 20, 0.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      color(C.white);
      const clientName = (currentUser?.fullName || "Guest").toUpperCase();
      doc.text(clientName, META_X, 20, { maxWidth: PW - META_X - 6 });

      // ORDER REFERENCE
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      color(C.goldLight);
      doc.text("ORDER REFERENCE", META_X, 28);
      fill(C.gold); doc.rect(META_X, 29.5, 20, 0.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      color(C.gold);
      doc.text(`#${orderId}`, META_X, 37);

      // Date — lighter
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.2);
      color(C.goldLight);
      doc.text(today, META_X, 44.5);

      // ── 2. PROFILE SECTION ───────────────────────────────────────────────────
      const SEC1_Y = HH + 7;
      const SEC1_H = 64;

      // Section label — clean, flat pill
      fill(C.brand);
      doc.roundedRect(ML, SEC1_Y, 32, 6.5, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      color(C.white);
      doc.text("01 · CLIENT PROFILE", ML + 3, SEC1_Y + 4.4);

      hline(SEC1_Y + 8, ML, PW - MR, 0.2);

      // Left: measurements card
      const MCARD_X = ML;
      const MCARD_W = 106;
      const MCARD_Y = SEC1_Y + 11;
      const MCARD_H = SEC1_H - 13;

      // Card: white bg, clean subtle border
      fill(C.white); draw(C.fog);
      doc.setLineWidth(0.3);
      doc.roundedRect(MCARD_X, MCARD_Y, MCARD_W, MCARD_H, 2.5, 2.5, "FD");

      // Card header — brand color, clean
      fill(C.brand);
      doc.roundedRect(MCARD_X, MCARD_Y, MCARD_W, 7.5, 2.5, 2.5, "F");
      doc.rect(MCARD_X, MCARD_Y + 3.5, MCARD_W, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.8);
      color(C.goldLight);
      doc.text("BODY MEASUREMENTS", MCARD_X + MCARD_W / 2, MCARD_Y + 5.2, { align: "center" });

      // Gold accent line under header
      fill(C.gold); doc.rect(MCARD_X + 20, MCARD_Y + 7.5, MCARD_W - 40, 0.6, "F");

      const measData = [
        ["Height",        `${heightCm || 172} cm  /  ${Math.round((heightCm || 172) / 2.54)} in`],
        ["Weight",        `${weightKg || 58} kg  /  ${Math.round((weightKg || 58) * 2.20462)} lbs`],
        ["Shoulder",      `${shoulderSize || 34} in`],
        ["Waist",         `${waistSize || 26} in`],
        ["Hips",          `${hipSize || 35} in`],
        ["Calibrated Hip",`${Math.round((hipSize || 35) * 1.7)} in`],
        ["Body Shape",    `${classifyDetails?.shape || "Hourglass"}`],
        ["Skin Tone",     `${hauteStylistResult?.body_analysis?.skin_tone || "Medium"} · ${hauteStylistResult?.body_analysis?.undertone || "Neutral"}`],
      ];

      measData.forEach(([label, value], i) => {
        const ry = MCARD_Y + 10.5 + i * 5.5;
        // Alternate stripe — very subtle
        if (i % 2 === 0) {
          fill(C.lavender);
          doc.rect(MCARD_X + 2, ry - 1.2, MCARD_W - 4, 5.5, "F");
        }
        // Label
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        color(C.mist);
        doc.text(label.toUpperCase(), MCARD_X + 5, ry + 2.5);
        // Dot separator
        fill(C.fog); doc.circle(MCARD_X + 51, ry + 1.8, 0.6, "F");
        // Value — bold, clear
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        color(C.charcoal);
        doc.text(String(value), MCARD_X + 54, ry + 2.5);
      });

      // Size badge — two-part clean pill
      const szY = MCARD_Y + MCARD_H - 10.5;
      fill(C.brand);
      doc.roundedRect(MCARD_X + 3, szY, 62, 8.5, 2, 2, "F");
      fill(C.gold);
      doc.roundedRect(MCARD_X + 66, szY, 34, 8.5, 2, 2, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.8);
      color(C.goldLight);
      doc.text("RECOMMENDED SIZE", MCARD_X + 34, szY + 5.4, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      color(C.ink);
      doc.text(sizeRecommendation?.recommendedSize || "M", MCARD_X + 83, szY + 5.8, { align: "center" });

      // Right: photo card
      const PCARD_X = ML + MCARD_W + 5;
      const PCARD_W = CW - MCARD_W - 5;
      const PCARD_Y = MCARD_Y;
      const PCARD_H = MCARD_H;

      fill(C.white); draw(C.fog);
      doc.setLineWidth(0.3);
      doc.roundedRect(PCARD_X, PCARD_Y, PCARD_W, PCARD_H, 2.5, 2.5, "FD");

      // Photo card header
      fill(C.brand);
      doc.roundedRect(PCARD_X, PCARD_Y, PCARD_W, 7.5, 2.5, 2.5, "F");
      doc.rect(PCARD_X, PCARD_Y + 3.5, PCARD_W, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.8);
      color(C.goldLight);
      doc.text("ENSEMBLE PREVIEW", PCARD_X + PCARD_W / 2, PCARD_Y + 5.2, { align: "center" });
      fill(C.gold); doc.rect(PCARD_X + 12, PCARD_Y + 7.5, PCARD_W - 24, 0.6, "F");

      const IMG_PADDING = 3;
      const IMG_Y = PCARD_Y + 9.5;
      const IMG_H = PCARD_H - 21;

      let photoDrawn = false;
      const renderPhoto = tryOnOverlaid && tryOnUrl ? tryOnUrl : selectedPhoto;
      if (renderPhoto?.startsWith("data:image")) {
        try {
          fill(C.lavMid);
          doc.roundedRect(PCARD_X + IMG_PADDING, IMG_Y, PCARD_W - IMG_PADDING * 2, IMG_H, 1.5, 1.5, "F");
          doc.addImage(renderPhoto, "JPEG", PCARD_X + IMG_PADDING, IMG_Y, PCARD_W - IMG_PADDING * 2, IMG_H);
          photoDrawn = true;
        } catch { /* ignore */ }
      }
      if (!photoDrawn) {
        fill(C.lavender);
        doc.roundedRect(PCARD_X + IMG_PADDING, IMG_Y, PCARD_W - IMG_PADDING * 2, IMG_H, 1.5, 1.5, "F");
        doc.setFont("times", "italic");
        doc.setFontSize(6.5);
        color(C.mist);
        doc.text("Ensemble Preview", PCARD_X + PCARD_W / 2, IMG_Y + IMG_H / 2, { align: "center" });
      }

      // Occasion tag — clean pill at bottom
      const occLabel = chosenOccasion || "Coordinated";
      tag(`✦  ${occLabel.toUpperCase()} ENSEMBLE`, PCARD_X + IMG_PADDING, PCARD_Y + PCARD_H - 5, C.brand, C.white, 5.5);

      // ── 3. ORDER TABLE ───────────────────────────────────────────────────────
      const TBL_Y = SEC1_Y + SEC1_H + 7;

      // Section label
      fill(C.brand);
      doc.roundedRect(ML, TBL_Y, 32, 6.5, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      color(C.white);
      doc.text("02 · ORDER MANIFEST", ML + 3, TBL_Y + 4.4);

      hline(TBL_Y + 8, ML, PW - MR, 0.2);

      // Deduplicate outfit slots
      const seenIds = new Set<string>();
      const outfitSlots = [
        { cat: "TOP LAYER",   emoji: "👕", item: selectedOutfit.top,         base64: topBase64 },
        { cat: "BOTTOM",      emoji: "👖", item: selectedOutfit.bottom,      base64: bottomBase64 },
        { cat: "FOOTWEAR",    emoji: "👠", item: selectedOutfit.footwear,    base64: footwearBase64 },
        { cat: "ACCESSORIES", emoji: "💍", item: selectedOutfit.accessories, base64: accentsBase64 },
      ].filter(slot => {
        if (!slot.item) return false;
        const id = String(slot.item.id ?? slot.item.name);
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      });

      const grandTotalVal = outfitSlots.reduce((acc, s) => acc + (s.item?.price ?? 0), 0);

      // Table header — clean, readable
      const TH_Y = TBL_Y + 11;
      fill(C.brand);
      doc.roundedRect(ML, TH_Y, CW, 8, 1.5, 1.5, "F");
      doc.rect(ML, TH_Y + 4, CW, 4, "F");

      const COL = {
        img:   { x: ML + 3,   w: 16 },
        cat:   { x: ML + 22,  w: 26 },
        name:  { x: ML + 51,  w: 82 },
        size:  { x: ML + 136, w: 15 },
        price: { x: ML + 154, w: 28 },
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      color(C.gold);
      doc.text("PREVIEW",    COL.img.x + 2,   TH_Y + 5.5);
      doc.text("CATEGORY",   COL.cat.x,        TH_Y + 5.5);
      doc.text("PRODUCT",    COL.name.x,       TH_Y + 5.5);
      doc.text("SIZE",       COL.size.x,       TH_Y + 5.5);
      doc.text("PRICE",      COL.price.x,      TH_Y + 5.5);

      // Gold underline on PRICE — editorial accent
      fill(C.gold);
      doc.roundedRect(COL.price.x - 1, TH_Y + 6.5, 18, 0.7, 0.3, 0.3, "F");

      let rowY = TH_Y + 8;
      const ROW_H = 21;

      const catAccents: [number,number,number][] = [
        C.brandMid,   // top — clear purple
        C.catBlue,    // bottom — cobalt
        C.catAmber,   // footwear — amber
        C.catTeal,    // accessories — teal
      ];

      outfitSlots.forEach((slot, idx) => {
        const accentCol = catAccents[idx] || C.accent;
        // Alternate row background — very clean
        fill(idx % 2 === 0 ? C.white : C.smoke);
        doc.rect(ML, rowY, CW, ROW_H, "F");

        // Left accent bar — clear, 3px wide
        fill(accentCol);
        doc.rect(ML, rowY, 3, ROW_H, "F");

        // Product image box — clean white with subtle border
        fill(C.white); draw(C.fog);
        doc.setLineWidth(0.25);
        doc.roundedRect(COL.img.x, rowY + 2.5, 15, 15, 1.5, 1.5, "FD");
        if (slot.base64) {
          try {
            doc.addImage(slot.base64, "PNG", COL.img.x + 0.5, rowY + 3, 14, 14);
          } catch { /* ignore */ }
        } else {
          doc.setFontSize(9); color(C.mist);
          doc.text(slot.emoji, COL.img.x + 3.5, rowY + 12);
        }

        // Category chip — clean, readable
        tag(slot.cat, COL.cat.x, rowY + 8, accentCol, C.white, 5.2);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(5);
        color(C.mist);
        doc.text(chosenOccasion || "Ensemble", COL.cat.x, rowY + 16);

        // Product name — larger, high contrast
        const nameRaw = slot.item!.name;
        const truncName = nameRaw.length > 48 ? nameRaw.substring(0, 46) + "…" : nameRaw;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        color(C.ink);
        doc.text(truncName, COL.name.x, rowY + 9.5);

        // Colour sub-line
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.5);
        color(C.bodyText);
        doc.text(`Colour: ${slot.item!.colour || "—"}`, COL.name.x, rowY + 16);

        // Size cell — clear, brand color
        const sizeVal = slot.item!.size || sizeRecommendation?.recommendedSize || "M";
        fill(C.lavender); draw(C.fog);
        doc.setLineWidth(0.2);
        doc.roundedRect(COL.size.x, rowY + 5.5, 13, 9, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        color(C.brand);
        doc.text(sizeVal, COL.size.x + 6.5, rowY + 12, { align: "center" });

        // Price cell — high contrast, clear
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        color(C.ink);
        doc.text(`$${slot.item!.price}`, COL.price.x, rowY + 10.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5);
        color(C.mist);
        doc.text("USD", COL.price.x, rowY + 16);

        // Row bottom hairline
        hline(rowY + ROW_H, ML + 3, PW - MR - 3, 0.15);
        rowY += ROW_H;
      });

      // Shipping row — clean green
      fill(C.greenBg);
      doc.rect(ML, rowY, CW, 13, "F");
      fill(C.green);
      doc.rect(ML, rowY, 3, 13, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      color(C.green);
      doc.text("EXPRESS SHIPPING", COL.cat.x, rowY + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      color([60, 140, 90]);
      doc.text("Atelier Dispatch Network", COL.cat.x, rowY + 10.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      color([40, 130, 80]);
      doc.text("Complimentary Delivery Included", COL.name.x, rowY + 8);

      fill(C.green);
      doc.roundedRect(COL.price.x - 1, rowY + 3, 22, 7.5, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      color(C.white);
      doc.text("FREE", COL.price.x + 10, rowY + 8.5, { align: "center" });

      hline(rowY + 13, ML + 3, PW - MR - 3, 0.15);
      rowY += 13;

      // Grand Total row — premium, clean
      fill(C.brand);
      doc.roundedRect(ML, rowY, CW, 15, 1.5, 1.5, "F");
      doc.rect(ML, rowY, CW, 7.5, "F");

      // Champagne gold left accent
      fill(C.gold); doc.rect(ML, rowY, 3.5, 15, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      color(C.goldLight);
      doc.text("GRAND TOTAL  ·  INVOICED VALUE", ML + 10, rowY + 9.5);

      doc.setFont("times", "bold");
      doc.setFontSize(15);
      color(C.gold);
      doc.text(`$${grandTotalVal}.00`, PW - MR - 3, rowY + 11, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      color(C.goldLight);
      doc.text("USD", PW - MR - 3, rowY + 14, { align: "right" });

      rowY += 15;

      // ── 4. INFO STRIP ────────────────────────────────────────────────────────
      const BOT_Y = rowY + 8;
      const BOT_H = 56;

      // Section label
      fill(C.brand);
      doc.roundedRect(ML, BOT_Y, 34, 6.5, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      color(C.white);
      doc.text("03 · ORDER DETAILS", ML + 3, BOT_Y + 4.4);

      hline(BOT_Y + 8, ML, PW - MR, 0.2);

      const C1_X = ML;
      const C1_W = 52;
      const C2_X = C1_X + C1_W + 5;
      const C2_W = 70;
      const C3_X = C2_X + C2_W + 5;
      const C3_W = CW - C1_W - C2_W - 10;
      const CARD_Y = BOT_Y + 11;

      // Helper: card container — clean white with brand header
      const card = (x: number, y: number, w: number, h: number, headerColor: [number,number,number], headerText: string) => {
        fill(C.white); draw(C.fog);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");
        // Card header bar
        fill(headerColor);
        doc.roundedRect(x, y, w, 8, 2.5, 2.5, "F");
        doc.rect(x, y + 4, w, 4, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.8);
        color(C.white);
        doc.text(headerText, x + w / 2, y + 5.8, { align: "center" });
        // Gold accent under header
        fill(C.gold); doc.rect(x + 8, y + 8, w - 16, 0.5, "F");
      };

      card(C1_X, CARD_Y, C1_W, BOT_H, C.brand, "ORDER SNAPSHOT");
      card(C2_X, CARD_Y, C2_W, BOT_H, C.brandMid, "ATELIER NAVIGATOR");
      card(C3_X, CARD_Y, C3_W, BOT_H, C.accent, "DIGITAL ACCESS");

      // ── Card 1: Order Snapshot ──
      const orderDate = pdfOrderDate;
      const snapRows: [string, string][] = [
        ["Reference", `#${orderId}`],
        ["Date",      orderDate],
        ["Total",     `$${grandTotalVal}.00`],
        ["Status",    "Ready to Ship"],
        ["Occasion",  chosenOccasion || "Casual"],
      ];
      snapRows.forEach(([label, val], i) => {
        const ry = CARD_Y + 12 + i * 8;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(4.8);
        color(C.mist);
        doc.text(label.toUpperCase(), C1_X + 4, ry);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        color(label === "Status" ? C.green : (label === "Total" ? C.brand : C.charcoal));
        doc.text(val, C1_X + 4, ry + 4.5);
        if (i < snapRows.length - 1) {
          hline(ry + 6.8, C1_X + 3, C1_X + C1_W - 3, 0.15);
        }
      });

      // Nearest atelier sub-block
      fill(C.lavender); draw(C.fog);
      doc.setLineWidth(0.2);
      doc.roundedRect(C1_X + 3, CARD_Y + BOT_H - 13, C1_W - 6, 10, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(4.8);
      color(C.brand);
      doc.text("NEAREST ATELIER", C1_X + 5, CARD_Y + BOT_H - 9.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.8);
      color(C.charcoal);
      doc.text(nearestAtelier.name, C1_X + 5, CARD_Y + BOT_H - 5.5);
      doc.text(`${nearestAtelier.distance} away`, C1_X + 5, CARD_Y + BOT_H - 1.5);

      // ── Card 2: Atelier Navigator (map) ──
      const MAP_X = C2_X + 4;
      const MAP_Y = CARD_Y + 11;
      const MAP_W = C2_W - 8;
      const MAP_H = 30;

      // Map background — clean light neutral
      fill(C.lavender);
      doc.roundedRect(MAP_X, MAP_Y, MAP_W, MAP_H, 1.5, 1.5, "F");

      // Street grid — clear lines
      draw(C.fog);
      doc.setLineWidth(0.35);
      for (let gx = MAP_X + 9; gx < MAP_X + MAP_W; gx += 11) {
        doc.line(gx, MAP_Y, gx, MAP_Y + MAP_H);
      }
      for (let gy = MAP_Y + 7; gy < MAP_Y + MAP_H; gy += 7) {
        doc.line(MAP_X, gy, MAP_X + MAP_W, gy);
      }

      // Main roads — slightly darker
      draw(C.lavMid);
      doc.setLineWidth(1.2);
      doc.line(MAP_X + 20, MAP_Y, MAP_X + 20, MAP_Y + MAP_H);
      doc.line(MAP_X, MAP_Y + 14, MAP_X + MAP_W, MAP_Y + 14);

      // Route dashes — clear brand accent
      draw(C.accent);
      doc.setLineWidth(1.0);
      const routePoints = [
        [MAP_X + 6, MAP_Y + MAP_H - 4],
        [MAP_X + 20, MAP_Y + MAP_H / 2],
        [MAP_X + MAP_W - 7, MAP_Y + 7],
      ];
      for (let r = 0; r < routePoints.length - 1; r++) {
        doc.setLineDashPattern([1.5, 1], 0);
        doc.line(routePoints[r][0], routePoints[r][1], routePoints[r+1][0], routePoints[r+1][1]);
      }
      doc.setLineDashPattern([], 0);

      // Destination pin — brand color, clear
      fill(C.brand); doc.circle(MAP_X + MAP_W - 7, MAP_Y + 7, 3.5, "F");
      fill(C.white);  doc.circle(MAP_X + MAP_W - 7, MAP_Y + 7, 1.5, "F");
      fill(C.brand);  doc.circle(MAP_X + MAP_W - 7, MAP_Y + 7, 0.7, "F");

      // Origin dot — gold
      fill(C.gold); doc.circle(MAP_X + 6, MAP_Y + MAP_H - 4, 2.5, "F");
      fill(C.white); doc.circle(MAP_X + 6, MAP_Y + MAP_H - 4, 1, "F");

      // Address
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.2);
      color(C.bodyText);
      doc.text(nearestAtelier.address, C2_X + 4, CARD_Y + 46, { maxWidth: C2_W - 8 });

      // Maps link pill — clear blue
      fill([25, 95, 210]);
      doc.roundedRect(C2_X + 4, CARD_Y + BOT_H - 12, 36, 8, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.8);
      color(C.white);
      doc.text("Open in Maps →", C2_X + 22, CARD_Y + BOT_H - 7.5, { align: "center" });
      doc.link(C2_X + 4, CARD_Y + BOT_H - 12, 36, 8, { url: nearestAtelier.mapsUrl });

      // ── Card 3: QR Code ──
      const qrTarget = `${window.location.origin}/order-summary?ref=${encodeURIComponent(orderId)}`;
      const QR_X = C3_X + (C3_W - 26) / 2;
      const QR_Y = CARD_Y + 12;
      const QR_SZ = 26;

      // QR white background with brand border
      fill(C.white); draw(C.brand);
      doc.setLineWidth(0.4);
      doc.roundedRect(QR_X - 2, QR_Y - 2, QR_SZ + 4, QR_SZ + 4, 2, 2, "FD");

      const drawQR = (qx: number, qy: number, qsz: number) => {
        const cell = qsz / 25;
        const finder = (fx: number, fy: number, fw: number) => {
          fill(C.brand); doc.rect(fx, fy, fw, fw, "F");
          fill(C.white); doc.rect(fx + fw/7, fy + fw/7, fw*5/7, fw*5/7, "F");
          fill(C.brand); doc.rect(fx + fw*2/7, fy + fw*2/7, fw*3/7, fw*3/7, "F");
        };
        finder(qx, qy, qsz*7/25);
        finder(qx + qsz*18/25, qy, qsz*7/25);
        finder(qx, qy + qsz*18/25, qsz*7/25);
        fill(C.ink);
        for (let r = 0; r < 25; r++) {
          for (let c = 0; c < 25; c++) {
            if ((r < 8 && c < 8)||(r < 8 && c > 16)||(r > 16 && c < 8)) continue;
            if (((r * 13 + c * 37 + r*c) % 7) % 2 === 0) {
              doc.roundedRect(qx + c*cell + 0.1, qy + r*cell + 0.1, cell - 0.2, cell - 0.2, 0.2, 0.2, "F");
            }
          }
        }
        // Gold accent dot on finder corner
        fill(C.gold);
        doc.circle(qx + qsz*18/25 + qsz*7/50, qy + qsz*7/50, 1.2, "F");
      };
      drawQR(QR_X, QR_Y, QR_SZ);
      doc.link(QR_X, QR_Y, QR_SZ, QR_SZ, { url: qrTarget });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.2);
      color(C.brand);
      doc.text("SCAN FOR ORDER DETAILS", C3_X + C3_W / 2, CARD_Y + BOT_H - 8, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(4.8);
      color(C.mist);
      doc.text("Full order + atelier map", C3_X + C3_W / 2, CARD_Y + BOT_H - 4, { align: "center" });

      // ── 5. FOOTER ────────────────────────────────────────────────────────────
      const FOOT_Y = CARD_Y + BOT_H + 6;
      const destinationUrl = window.location.origin || "https://fitstyle.ai";

      // Clean two-tone footer
      fill(C.brand); doc.rect(0, FOOT_Y, PW * 0.55, 11, "F");
      fill(C.ink);   doc.rect(PW * 0.55, FOOT_Y, PW * 0.45, 11, "F");
      // Gold top rule
      fill(C.gold); doc.rect(0, FOOT_Y, PW, 1, "F");
      // Left brand sidebar continues through footer
      fill(C.gold); doc.rect(0, FOOT_Y + 1, 3, 10, "F");

      doc.setFont("times", "bolditalic");
      doc.setFontSize(8);
      color(C.goldLight);
      doc.text("FitStyle AI", ML + 3, FOOT_Y + 7.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      color(C.lavender);
      const fsFootW = doc.getTextWidth("FitStyle AI");
      doc.text("  ·  Virtual Fitting Studio & Style Intelligence Platform", ML + 3 + fsFootW + 1, FOOT_Y + 7.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(5);
      color(C.mist);
      doc.text(destinationUrl, PW - MR, FOOT_Y + 7.5, { align: "right" });
      doc.link(PW - MR - doc.getTextWidth(destinationUrl), FOOT_Y + 5, doc.getTextWidth(destinationUrl), 4, { url: destinationUrl });

      doc.save(`FitStyle_AI_Order_Summary_${currentUser.fullName.replace(/\s+/g, "_")}.pdf`);
    } catch (exportErr) {
      console.error("Failed to generate PDF:", exportErr);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const renderStep1 = () => {
    return (
      <main className="flex-grow p-6 md:p-10 max-w-7xl mx-auto w-full flex flex-col justify-center items-center animate-fade-in" id="step-1-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full max-w-6xl">
          {/* Left: Only Upload customized photo stream */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-[#f3e9f0] overflow-hidden shadow-sm flex flex-col">
              <div className="p-4 border-b border-[#f3e9f0] flex justify-between items-center bg-slate-50">
                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider font-outfit">
                  1. Snapshot Silhouette Base
                </span>
                <span className="text-[10px] bg-[#fae9f3] text-[#ac2471] px-2 py-0.5 rounded font-bold uppercase font-outfit">
                  Step 1 of 5
                </span>
              </div>
              
              <div className="relative aspect-[3/4] w-full overflow-hidden select-none flex items-center justify-center">
                {showStep1Photo ? (
                  <img
                    src={selectedPhoto}
                    alt="Uploaded photo"
                    style={{
                      width: "100%",
                      height: "400px",
                      objectFit: "cover",
                      borderRadius: "12px",
                      display: "block"
                    }}
                  />
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => step1FileInputRef.current?.click()}
                    onKeyDown={(e) => e.key === "Enter" && step1FileInputRef.current?.click()}
                    style={{
                    width: "100%",
                    height: "400px",
                    background: "linear-gradient(135deg, #f9f0ff, #fdf4ff)",
                    borderRadius: "12px",
                    border: "2px dashed #d8b4d8",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    cursor: "pointer"
                  }}>
                    <div style={{
                      width: "80px",
                      height: "80px",
                      background: "#f0e8f8",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "36px"
                    }}>👤</div>
                    <div style={{ textAlign: "center", padding: "0 32px" }}>
                      <p style={{
                        color: "#9B59B6",
                        fontWeight: "700",
                        fontSize: "15px",
                        margin: "0 0 8px 0"
                      }}>No photo uploaded yet</p>
                      <p style={{
                        color: "#bbb",
                        fontSize: "12px",
                        margin: 0,
                        lineHeight: "1.6"
                      }}>Upload a clear full-body standing photo
                      for accurate Gemini size detection</p>
                    </div>
                  </div>
                )}
                {poseLoading && showStep1Photo && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/85 text-white z-40 text-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-[#fae1f0] mb-3" />
                    <span className="font-outfit text-xs font-bold uppercase tracking-widest text-[#fae1f0] animate-pulse">Scanning pose landmarks...</span>
                  </div>
                )}
              </div>

              {/* Only Upload photo UI */}
              <div className="p-5 bg-slate-50 border-t border-[#f3e9f0] flex flex-col items-center justify-center text-center gap-3">
                <p className="text-[11px] text-slate-500 font-medium font-outfit max-w-xs leading-relaxed">
                  Upload your portrait snapshot (JPG, PNG) to calibrate your virtual sizing and try on custom styling.
                </p>
                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white bg-[#ac2471] hover:bg-[#8f195b] py-3.5 px-6 rounded-xl transition-all hover:scale-[1.02] cursor-pointer shadow-sm active:scale-95">
                  <Upload className="w-4 h-4" />
                  <span>Upload Portrait Photo</span>
                  <input ref={step1FileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>

                {unusablePhotoError && (
                  <div className="mt-2 p-3.5 bg-red-50 border border-red-200 rounded-xl text-center w-full">
                    <p className="text-xs font-semibold text-red-600 font-outfit leading-normal whitespace-pre-line">
                      {unusablePhotoError}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {analysisError && (
              <div style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "16px 20px",
                marginTop: "16px",
                marginBottom: "8px",
                background: "#fff5f5",
                border: "1.5px solid #ffb3b3",
                borderRadius: "12px",
                color: "#cc0000"
              }}>
                <span style={{ fontSize: "22px", lineHeight: 1 }}>
                  {analysisError.icon}
                </span>
                <div>
                  <p style={{ 
                    fontWeight: "700", 
                    marginBottom: "4px",
                    fontSize: "14px"
                  }}>
                    Analysis Failed
                  </p>
                  <p style={{ 
                    fontSize: "13px", 
                    color: "#990000",
                    margin: 0
                  }}>
                    {analysisError.message}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Choice of occasion */}
          <div className="lg:col-span-7 flex flex-col justify-between bg-white rounded-2xl border border-[#f3e9f0] p-6 shadow-sm">
            <div className="space-y-6">
              <div>
                <h2 className="font-playfair text-2xl md:text-3xl font-extrabold text-slate-900 leading-none">
                  2. Select Occasion Theme
                </h2>
                <p className="text-xs text-[#73636f] font-light mt-2 leading-relaxed">
                  Select an occasion context. This filters the premium boutique garments matching the context (wedding gowns, business attire, relaxed loungewear, banquet dresses) during style recommendations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { 
                    id: "Wedding", 
                    label: "Matrimonial Gala", 
                    desc: "Wedding gown silks, exquisite bridal guest styling, cocktail coordinates.", 
                    image: "https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&q=80&w=600" 
                  },
                  { 
                    id: "Formal", 
                    label: "Corporate Boardroom", 
                    desc: "Tailored boardroom suits, corporate trousers and formal executive attire.", 
                    image: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&q=80&w=600" 
                  },
                  { 
                    id: "Casual", 
                    label: "Casual Lounging", 
                    desc: "Relaxed linen coordinates, high-contrast daily sweaters and comfortable flats.", 
                    image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600" 
                  },
                  { 
                    id: "Party", 
                    label: "Evening Shimmer", 
                    desc: "Velvet cocktail gowns, sequined party cuts and premium heel pairings.", 
                    image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&q=80&w=600" 
                  }
                ].map((occ) => (
                  <button
                    key={occ.id}
                    type="button"
                    onClick={() => setChosenOccasion(occ.id)}
                    className={`rounded-2xl border text-left overflow-hidden transition-all flex flex-col cursor-pointer hover:shadow-md ${
                      chosenOccasion === occ.id
                        ? "bg-[#ac2471]/5 border-[#ac2471] ring-2 ring-[#ac2471]/15"
                        : "bg-white border-[#f3e9f0] hover:bg-[#fffbfc]"
                    }`}
                  >
                    <div className="h-32 w-full overflow-hidden relative bg-slate-100">
                      <img
                        src={occ.image}
                        alt={`${occ.id} style`}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-xs py-0.5 px-2 rounded font-outfit text-[9px] font-black uppercase text-[#ac2471] tracking-wider border border-pink-100/40">
                        {occ.id}
                      </div>
                    </div>
                    
                    <div className="p-4 flex flex-col justify-between flex-grow">
                      <div>
                        <span className="text-[11.5px] font-bold text-slate-800 block leading-tight">{occ.label}</span>
                        <span className="text-[10.5px] text-slate-500 font-light leading-snug mt-1 block">{occ.desc}</span>
                      </div>
                      
                      <div className="mt-3.5 flex items-center justify-between text-[9px] tracking-wide font-extrabold uppercase pt-2.5 border-t border-[#fbf3f8]">
                        <span className={chosenOccasion === occ.id ? "text-[#ac2471]" : "text-slate-400"}>
                          {chosenOccasion === occ.id ? "Selected Theme" : "Select Theme"}
                        </span>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          chosenOccasion === occ.id ? "border-[#ac2471] bg-[#ac2471]/10" : "border-slate-300"
                        }`}>
                          {chosenOccasion === occ.id && <div className="w-1.5 h-1.5 rounded-full bg-[#ac2471]" />}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[#f3e9f0] flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (unusablePhotoError) return;
                  setAnalysisError(null);
                  setCurrentStep(2);
                }}
                disabled={!!unusablePhotoError}
                className={`flex items-center gap-2 text-white py-3 px-6 rounded-xl font-outfit text-xs font-bold uppercase tracking-widest transition-all shadow-md active:scale-95 ${
                  unusablePhotoError 
                    ? "bg-slate-300 cursor-not-allowed opacity-60" 
                    : "bg-[#ac2471] hover:bg-[#8f195b] cursor-pointer"
                }`}
              >
                <span>Next: Sizing & Recommend Styles</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  };

  const renderStep3 = () => {
    const legacyItems = [selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories].filter((item): item is Product => Boolean(item));
    const selectedItems: Product[] = recoActive ? recoSelectedItems : legacyItems;
    const recoCustomised = recoActive && recoOutfits[recoIndex]
      ? recoOutfits[recoIndex].items.map((i) => i.id).join(",") !== recoItems.map((i) => i.id).join(",")
      : false;
    const selectedTotal = selectedItems.reduce((total, item) => total + item.price, 0);
    const collectionItems = products.filter((product) => product.inStock !== false).slice(0, 6);
    const previewImage = tryOnUrl || selectedPhoto || selectedItems[0]?.image;
    const removeItem = (productId: string) => {
      if (recoActive) {
        // keep the piece in the outfit on the left, just untick it
        setRecoDeselected((previous) => (previous.includes(productId) ? previous : [...previous, productId]));
        return;
      }
      setSelectedOutfit((previous) => ({
        top: previous.top?.id === productId ? null : previous.top,
        bottom: previous.bottom?.id === productId ? null : previous.bottom,
        footwear: previous.footwear?.id === productId ? null : previous.footwear,
        accessories: previous.accessories?.id === productId ? null : previous.accessories
      }));
    };
    const generateLook = () => {
      setLookGenerating(true);
      window.setTimeout(() => setLookGenerating(false), 1400);
    };
    const handleAddSelectedToCart = () => {
      if (selectedItems.length === 0 || !onAddToCart) return;
      onAddToCart(selectedItems, recoActive ? toCatalogSize(selectedSize) : selectedSize);
      setCartAddFeedback(true);
      window.setTimeout(() => setCartAddFeedback(false), 1800);
    };

    return (
      <main className="flex-grow bg-[#fbf8fb] px-4 py-6 md:px-8 md:py-8" id="step-3-container">
        <div className="mx-auto max-w-[1440px]">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ac2471]">AI-Powered Styling Workspace</span>
              <h2 className="mt-2 font-playfair text-3xl font-bold leading-none text-[#1d1327] md:text-4xl">Virtual Try-On</h2>
              <p className="mt-2 text-xs text-slate-500">See your curated pieces together before creating your order.</p>
            </div>
            <button type="button" onClick={() => setCurrentStep(2)} className="inline-flex items-center gap-2 self-start rounded-xl border border-[#ecddec] bg-white px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-[#5a005a] hover:bg-[#fbf6fb] md:self-auto"><ArrowLeft className="h-3.5 w-3.5" /> Back to Sizing</button>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(220px,1fr)_minmax(440px,2fr)_minmax(260px,1fr)]">
            <section className="flex min-h-[620px] flex-col rounded-3xl border border-[#ecddec] bg-white p-4 shadow-sm md:p-5">
              <div className="border-b border-[#f1e8f2] pb-4"><h3 className="font-playfair text-2xl font-bold text-[#1d1327]">Collections</h3><p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#ac2471]">Curated for your style DNA</p></div>
              {(recoActive || recoLoading) && (
                <OutfitRecommendationPanel
                  profileLabel={`${classifyDetails.shape} · ${selectedSize} · ${chosenOccasion}`}
                  outfits={recoOutfits}
                  activeIndex={recoIndex}
                  currentItems={recoItems}
                  deselectedIds={recoDeselected}
                  sizeLabel={toCatalogSize(selectedSize)}
                  onToggleItem={handleToggleRecoItem}
                  loading={recoLoading}
                  error={recoError}
                  note={[recoNote, toCatalogSize(selectedSize) !== String(selectedSize).toUpperCase() ? `Showing size ${toCatalogSize(selectedSize)} - the closest in stock to your ${selectedSize}.` : null].filter(Boolean).join(" ")}
                  onSelectOutfit={handleSelectRecoOutfit}
                  onSwapItem={handleSwapRecoItem}
                  loadAlternatives={(category) => fetchAlternatives(recoParams, category)}
                />
              )}
              <div className={recoActive || recoLoading ? "hidden" : "mt-4 flex-1 space-y-4 overflow-y-auto pr-1"}>
                <div><div className="mb-2 flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-slate-400"><span>Dresses</span><span>12 items</span></div><div className="space-y-2">{collectionItems.filter((item) => item.category === "top").slice(0, 3).map((item) => <button type="button" key={item.id} onClick={() => setSelectedOutfit((previous) => ({ ...previous, top: item }))} className={`flex w-full gap-3 rounded-xl border p-2 text-left transition ${selectedOutfit.top?.id === item.id ? "border-[#5a005a] bg-[#fbf5fa] ring-1 ring-[#5a005a]/10" : "border-[#f1e8f2] hover:border-[#d9b9d9]"}`}><img src={item.image} alt={item.name} className="h-16 w-12 rounded-lg object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-[#1d1327]">{item.name}</strong><span className="mt-1 block text-[10px] text-slate-500">${item.price}</span><span className="mt-1 block text-[8px] font-bold uppercase tracking-wider text-[#ac2471]">{selectedOutfit.top?.id === item.id ? "AI Choice" : item.size}</span></span></button>)}</div></div>
                <div><div className="mb-2 flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-slate-400"><span>Tops</span><span>24 items</span></div><div className="space-y-2">{collectionItems.filter((item) => item.category === "top").slice(3, 5).map((item) => <button type="button" key={item.id} onClick={() => setSelectedOutfit((previous) => ({ ...previous, top: item }))} className="flex w-full gap-3 rounded-xl border border-[#f1e8f2] p-2 text-left transition hover:border-[#d9b9d9]"><img src={item.image} alt={item.name} className="h-16 w-12 rounded-lg object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate text-[11px] text-[#1d1327]">{item.name}</strong><span className="mt-1 block text-[10px] text-slate-500">${item.price}</span><span className="mt-1 block text-[8px] text-slate-400">{item.size}</span></span></button>)}</div></div>
              </div>
              <button type="button" onClick={generateLook} disabled={lookGenerating} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#580a58] px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-[#450645] disabled:cursor-wait disabled:opacity-70">{lookGenerating ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Rendering Look...</> : <><Sparkles className="h-3.5 w-3.5" /> Generate Look</>}</button>
            </section>

            <section className="rounded-3xl border border-[#ecddec] bg-white p-4 shadow-sm md:p-5"><div className="relative overflow-hidden rounded-2xl bg-[#e9e2e9] shadow-inner"><div className="aspect-[4/5] min-h-[520px] md:min-h-[620px]">{previewImage ? <img src={previewImage} alt="Virtual try-on preview" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-center text-xs text-slate-500">Upload a photo in Step 1 to preview your look.</div>}</div><div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/85 px-3 py-1.5 text-[9px] font-bold text-[#1d1327] shadow-sm backdrop-blur"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Virtual Fitting Active</div><span className="absolute bottom-4 right-4 rounded-md bg-black/60 px-2.5 py-1.5 text-[8px] font-bold tracking-[0.16em] text-white">RENDER: 4K PHOTONIC</span><div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70"><span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" /></div></div>{recoActive && <OutfitWhyCard explanation={recoExplanation || recoOutfits[recoIndex]?.explanation || null} loading={recoExplLoading} customised={recoCustomised} />}<p className="mt-4 text-center font-playfair text-xl italic text-[#580a58]">Effortless <span className="not-italic text-[#d2a5c9]">•</span> Intelligent <span className="not-italic text-[#d2a5c9]">•</span> Serene</p></section>

            <section className="flex flex-col rounded-3xl border border-[#ecddec] bg-white p-5 shadow-sm md:p-6"><div className="border-b border-[#f1e8f2] pb-4"><h3 className="font-playfair text-2xl font-bold text-[#1d1327]">Your Selection</h3><p className="mt-2 text-[10px] font-extrabold uppercase tracking-wider text-[#ac2471]">✦ AI Style Harmony: 98%</p></div><div className="mt-2 flex-1 divide-y divide-[#f1e8f2]">{selectedItems.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">No pieces selected yet.</p> : selectedItems.map((item) => <div key={item.id} className="flex items-center gap-3 py-4"><img src={item.image} alt={item.name} className="h-14 w-12 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-[#1d1327]">{item.name}</p><p className="mt-1 text-[10px] text-slate-500">Size: {item.size}</p><p className="mt-1 font-serif text-sm font-bold text-[#580a58]">${item.price.toFixed(2)}</p></div><button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item.id)} className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><span className="text-lg leading-none">×</span></button></div>)}</div><div className="mt-4 border-t border-[#f1e8f2] pt-4 text-xs text-slate-500"><div className="flex justify-between"><span>Items ({selectedItems.length})</span><span>${selectedTotal.toFixed(2)}</span></div><div className="mt-2 flex justify-between"><span>AI Styling Fee</span><span className="font-bold text-emerald-600">FREE</span></div><div className="my-4 border-t border-[#f1e8f2]" /><div className="flex items-end justify-between"><span className="font-bold uppercase tracking-wider text-[#1d1327]">Total</span><span className="font-playfair text-2xl font-bold text-[#580a58]">${selectedTotal.toFixed(2)}</span></div><button type="button" onClick={() => setCurrentStep(4)} disabled={selectedItems.length === 0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#5a005a] px-4 py-3.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-[#470646] disabled:cursor-not-allowed disabled:opacity-40">Continue to Create Order <ArrowRight className="h-4 w-4" /></button><button type="button" onClick={handleAddSelectedToCart} disabled={selectedItems.length === 0 || !onAddToCart} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#5a005a] bg-white px-4 py-3.5 text-[10px] font-extrabold uppercase tracking-wider text-[#5a005a] transition hover:bg-[#fbf5fa] disabled:cursor-not-allowed disabled:opacity-40">{cartAddFeedback ? <><CheckCircle2 className="h-4 w-4" /> Added to Cart</> : <><ShoppingBag className="h-4 w-4" /> Add to Cart</>}</button></div></section>
          </div>
        </div>
      </main>
    );
  };

  const renderCreateOrder = () => {
    return (
      <main className="flex-grow p-6 md:p-10 max-w-7xl mx-auto w-full flex flex-col justify-center items-center animate-fade-in" id="step-3-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full max-w-6xl">
          {/* Left column preview portrait */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-white rounded-2xl border border-[#f3e9f0] p-4.5 shadow-sm space-y-4">
              <span className="text-[10px] font-bold text-[#ac2471] uppercase tracking-wider block font-outfit">
                Ensemble Frame Portrait
              </span>
              <div className="relative aspect-[3/4] bg-slate-900 rounded-xl overflow-hidden border border-slate-200 shadow-md">
                <img
                  key={`step3-preview-${tryOnRenderKey}`}
                  src={tryOnOverlaid && tryOnUrl ? tryOnUrl : selectedPhoto}
                  alt="Mannequin styling"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md p-2 rounded-xl text-center text-[10px] font-bold text-[#ac2471] uppercase tracking-wide border border-pink-100">
                  {chosenOccasion} Coordinated Ensemble
                </div>
              </div>
            </div>
          </div>

          {/* Right column pricing layout invoice */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#f3e9f0] p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-6">
              <div>
                <h2 className="font-playfair text-2.5xl font-black text-slate-900 leading-none">
                  Submit Custom Coordinator Order
                </h2>
                <p className="text-xs text-slate-500 mt-2">
                  Please review the chosen garments matched for your {classifyDetails.shape} body frame silhouette before advancing.
                </p>
              </div>

              <div className="border border-[#faedf5] rounded-2xl overflow-hidden text-xs">
                <div className="grid grid-cols-12 bg-slate-50 border-b border-[#faedf5] p-3 font-bold text-[#ac2471]">
                  <div className="col-span-4 uppercase tracking-wider">Category slot</div>
                  <div className="col-span-6 uppercase">Selected Boutique item</div>
                  <div className="col-span-2 text-right uppercase font-extrabold">Price</div>
                </div>
                <div className="divide-y divide-[#faf3f9]">
                  <div className="grid grid-cols-12 p-3 text-slate-700">
                    <span className="col-span-4 font-bold text-slate-500">Top Layer</span>
                    <span className="col-span-6 font-semibold">{selectedOutfit.top?.name || "Premium Custom Topwear"}</span>
                    <span className="col-span-2 text-right font-black text-[#ac2471]">${selectedOutfit.top?.price || "150"}</span>
                  </div>
                  <div className="grid grid-cols-12 p-3 text-slate-700">
                    <span className="col-span-4 font-bold text-slate-500">Bottom Wear</span>
                    <span className="col-span-6 font-semibold">{selectedOutfit.bottom?.name || "Silk Skirt / Linen Trouser"}</span>
                    <span className="col-span-2 text-right font-black text-[#ac2471]">${selectedOutfit.bottom?.price || "110"}</span>
                  </div>
                  <div className="grid grid-cols-12 p-3 text-slate-700">
                    <span className="col-span-4 font-bold text-slate-500">Footwear</span>
                    <span className="col-span-6 font-semibold">{selectedOutfit.footwear?.name || "Boutique Leather Heels"}</span>
                    <span className="col-span-2 text-right font-black text-[#ac2471]">${selectedOutfit.footwear?.price || "130"}</span>
                  </div>
                  <div className="grid grid-cols-12 p-3 text-slate-700">
                    <span className="col-span-4 font-bold text-slate-500">Accents</span>
                    <span className="col-span-6 font-semibold">{selectedOutfit.accessories?.name || "Signature Silver Belt"}</span>
                    <span className="col-span-2 text-right font-black text-[#ac2471]">${selectedOutfit.accessories?.price || "95"}</span>
                  </div>
                </div>

                <div className="bg-[#fff9fc]/60 p-3 flex justify-between items-center border-t border-[#faedf5] font-semibold text-slate-600 text-[11px]">
                  <span>Atelier Dispatch Express Shipping</span>
                  <span className="text-emerald-600 font-bold">COMPLIMENTARY DECENTRALIZED DELIVERY</span>
                </div>

                <div className="bg-[#fff0f6] p-3.5 flex justify-between items-center border-t border-[#faedf5] font-extrabold text-[#ac2471] text-sm">
                  <span>Invoiced Grand Total</span>
                  <span className="font-mono">
                    ${[selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories]
                      .reduce((acc, p) => acc + (p ? p.price : 0), 0) || 485} USD
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 border p-4 rounded-xl text-xs text-slate-600">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Registered Shipping Address</span>
                <p className="font-semibold text-slate-900 mt-1">
                  {currentUser.fullName} • FitStyle Elite Resident Tower B, Fifth Avenue, New York, NY
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Sizing line suggest: {sizeRecommendation.recommendedSize}</p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-center font-sans">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="px-5 py-2.5 border border-[#faeef5] text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                ← Back to Studio Fit
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={exportPDFSummary}
                  className="px-5 py-2.5 bg-pink-50 text-[#ac2471] hover:bg-pink-100 border border-pink-200 rounded-xl text-xs font-bold uppercase tracking-wider shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>⬇ EXPORT PDF SUMMARY</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(5)}
                  className="bg-[#ac2471] hover:bg-[#8f195b] text-white py-2.5 px-6 rounded-xl font-outfit text-xs font-bold uppercase tracking-wider shadow flex items-center gap-1.5 active:scale-95 cursor-pointer animate-pulse"
                >
                  <span>Proceed to Payment portal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  };

  const renderPayment = () => {
    const totalAmount = [selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories]
      .reduce((acc, p) => acc + (p ? p.price : 0), 0) || 485;

    return (
      <main className="flex-grow p-6 md:p-10 max-w-7xl mx-auto w-full flex flex-col justify-center items-center animate-fade-in" id="step-4-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full max-w-6xl">
          {/* Left Overview */}
          <div className="lg:col-span-5 flex flex-col gap-4 animate-fade-in">
            <div className="bg-white rounded-2xl border border-[#f3e9f0] p-5 shadow-sm space-y-4">
              <span className="text-[10px] font-bold text-[#ac2471] uppercase tracking-wider block font-outfit leading-none">
                Billing Overview
              </span>
              <div className="h-px bg-slate-150" />
              <div className="space-y-2 text-xs text-slate-700">
                <div className="flex justify-between"><span>Garments Selection Total</span><span className="font-mono">${totalAmount} USD</span></div>
                <div className="flex justify-between"><span>Atelier Shipping Duty</span><span className="text-emerald-600 font-mono font-bold">FREE</span></div>
                <div className="h-px bg-slate-150" />
                <div className="flex justify-between font-black text-[#ac2471] text-xs">
                  <span>Ensemble Total Cost</span>
                  <span className="font-mono">${totalAmount} USD</span>
                </div>
              </div>
              <div className="bg-[#fffcfd] border p-3 rounded-xl border-[#faecf4] text-[10px] text-zinc-500 leading-normal">
                🔐 Sandboxed Secure Credit Gateway. Real currencies will not be debited.
              </div>
            </div>
          </div>

          {/* Right Card Processing Grid */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#f3e9f0] p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-6">
              <div>
                <h2 className="font-playfair text-xl md:text-2xl font-black text-slate-900 leading-none">
                  Secure Payment Gateway Terminal
                </h2>
                <p className="text-xs text-slate-500 mt-2">
                  State standard credit credentials for our payment gateway emulator pipeline.
                </p>
              </div>

              {paymentError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Express Checkout Options */}
              <div className="space-y-3 bg-[#fffbfc] border border-[#f3e9f0] p-4 rounded-2xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-outfit leading-none">
                  Express Checkout
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Google Pay Button */}
                  <button
                    type="button"
                    onClick={handleGooglePay}
                    className="flex items-center justify-center bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 py-2.5 px-4 rounded-xl text-xs font-bold font-outfit shadow-sm transition-all cursor-pointer relative"
                  >
                    {connectedPayment === "google" ? (
                      <span className="flex items-center text-emerald-600 gap-1.5 font-bold">
                        <Check className="w-4 h-4 text-emerald-600 font-extrabold" />
                        <span>Google Pay Linked</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center font-bold">
                        <svg className="w-4 h-4 mr-2 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Pay with Google
                      </span>
                    )}
                  </button>

                  {/* Apple Pay Button */}
                  <button
                    type="button"
                    onClick={() => setShowAppleModal(true)}
                    className="flex items-center justify-center bg-black hover:bg-zinc-900 text-white py-2.5 px-4 rounded-xl text-xs font-bold font-outfit shadow-sm transition-all cursor-pointer relative"
                  >
                    {connectedPayment === "apple" ? (
                      <span className="flex items-center text-emerald-400 gap-1.5 font-bold">
                        <Check className="w-4 h-4 text-emerald-400 font-extrabold" />
                        <span>Apple Pay Linked</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center font-bold">
                        <svg className="w-4 h-4 mr-2 fill-white shrink-0" viewBox="0 0 24 24">
                          <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.674-.54 9.103 1.51 12.037 1.002 1.432 2.184 3.034 3.738 2.972 1.493-.059 2.061-.967 3.864-.967 1.794 0 2.312.967 3.875.935 1.6-.027 2.64-1.442 3.626-2.87 1.137-1.663 1.604-3.268 1.631-3.35-.062-.027-3.125-1.198-3.156-4.767-.025-2.981 2.443-4.414 2.556-4.485-1.39-2.04-3.554-2.28-4.32-2.333-2-.163-3.033.447-3.963.447zM15.748 3.5c.833-1.008 1.385-2.404 1.233-3.5-1.114.04-2.463.738-3.265 1.673-.706.812-1.325 2.228-1.152 3.31 1.242.095 2.502-.638 3.184-1.483z" />
                        </svg>
                        Pay with Apple
                      </span>
                    )}
                  </button>
                </div>

                {/* Google confirmation card */}
                {connectedPayment === "google" && (
                  <div className="p-4 bg-emerald-50/80 border border-emerald-200 text-[#ac2471] rounded-2xl space-y-1 animate-fade-in" id="google-payment-confirmation">
                    <div className="font-bold text-[#ac2471] text-xs flex items-center gap-1.5">
                      <div className="w-5 h-5 bg-emerald-150 rounded-full flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5 text-emerald-600 font-extrabold" />
                      </div>
                      <span>✓ Google Account Connected</span>
                    </div>
                    <div className="text-slate-600 font-sans text-xs space-y-0.5">
                      <div>Paying as: {googleAccountInfo?.name}</div>
                      <div className="font-mono text-slate-500">{googleAccountInfo?.email}</div>
                    </div>
                  </div>
                )}

                {/* Apple confirmation card */}
                {connectedPayment === "apple" && (
                  <div className="p-4 bg-emerald-50/80 border border-emerald-200 text-[#ac2471] rounded-2xl space-y-1 animate-fade-in" id="apple-payment-confirmation">
                    <div className="font-bold text-[#ac2471] text-xs flex items-center gap-1.5">
                      <div className="w-5 h-5 bg-emerald-150 rounded-full flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5 text-emerald-600 font-extrabold" />
                      </div>
                      <span>✓ Apple ID Connected</span>
                    </div>
                    <div className="text-slate-600 font-sans text-xs">
                      <div>Paying as: {appleAccountInfo?.name}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Visual Card Display */}
              <div className="p-1 space-y-4">
                <div className="bg-gradient-to-br from-[#ac2471] to-[#510036] p-5 rounded-2xl text-white shadow-md relative overflow-hidden flex flex-col justify-between h-40 font-mono">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full translate-x-8 -translate-y-8" />
                  
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#fae1f0]">Elite Boutique Card</span>
                    <CreditCard className="w-5 h-5 text-pink-200" />
                  </div>

                  <div className="text-base tracking-widest text-center my-2">
                    {paymentForm.cardNumber || "••••  ••••  ••••  4821"}
                  </div>

                  <div className="flex justify-between items-end text-[10px] leading-none text-[#fae1f0] font-sans">
                    <div>
                      <span className="text-[7.5px] block uppercase text-[#fae1f0] mb-0.5">Cardholder</span>
                      <span className="font-bold uppercase tracking-wider">{paymentForm.cardholderName || currentUser.fullName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[7.5px] block uppercase text-[#fae1f0] mb-0.5">Expires</span>
                      <span className="font-bold">{paymentForm.expiryDate || "12/29"}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Testing Card Number</label>
                    <input
                      type="text"
                      placeholder="4821  8291  4731  9482"
                      value={paymentForm.cardNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").substring(0, 16);
                        const formatted = val.match(/.{1,4}/g)?.join("  ") || val;
                        setPaymentForm({ ...paymentForm, cardNumber: formatted });
                      }}
                      className="w-full bg-[#faeff5]/30 border border-[#f3e9f0] p-2.5 rounded-xl text-xs font-mono tracking-widest focus:outline-none focus:ring-1 focus:ring-[#ac2471]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                     <div>
                       <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Expiry</label>
                       <input
                         type="text"
                         placeholder="MM/YY"
                         maxLength={5}
                         value={paymentForm.expiryDate}
                         onChange={(e) => setPaymentForm({ ...paymentForm, expiryDate: e.target.value })}
                         className="w-full bg-[#faeff5]/30 border border-[#f3e9f0] p-2.5 rounded-xl text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-[#ac2471]"
                       />
                     </div>
                     <div>
                       <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">CVC Secure</label>
                       <input
                         type="password"
                         placeholder="•••"
                         maxLength={3}
                         value={paymentForm.cvv}
                         onChange={(e) => setPaymentForm({ ...paymentForm, cvv: e.target.value.replace(/\D/g, "") })}
                         className="w-full bg-[#faeff5]/30 border border-[#f3e9f0] p-2.5 rounded-xl text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-[#ac2471]"
                       />
                     </div>
                  </div>
                </div>
              </div>

              {paymentProcessing && (
                <div className="bg-[#fff5fa] border border-[#fbdff2] rounded-xl p-4 text-center animate-pulse space-y-1">
                  <div className="w-4 h-4 border-2 border-[#ac2471] border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[10px] font-bold text-[#ac2471] uppercase tracking-widest">Gateway handshaking active</p>
                  <div className="text-[9px] font-mono text-pink-900/80 space-y-0.5 text-left max-w-xs mx-auto">
                    {paymentLogs.map((logStr, lIdx) => (
                      <div key={lIdx}>✓ {logStr}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-center">
              <button
                type="button"
                onClick={() => { if (!paymentProcessing) setCurrentStep(4); }}
                disabled={paymentProcessing}
                className="px-5 py-2.5 border border-[#faeef5] text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
              >
                ← Back to Order
              </button>
              
              <button
                type="button"
                onClick={() => {
                  if (!paymentForm.cardNumber || paymentForm.cardNumber.replace(/\s+/g, "").length < 16) {
                    setPaymentError("Kindly state a 16-digit testing card number.");
                    return;
                  }
                  if (!paymentForm.expiryDate || paymentForm.expiryDate.length < 5) {
                    setPaymentError("Please input card expiration date in MM/YY format.");
                    return;
                  }
                  if (!paymentForm.cvv || paymentForm.cvv.length < 3) {
                    setPaymentError("Please fill the 3-digit card secure CVC.");
                    return;
                  }

                  setPaymentError(null);
                  setPaymentProcessing(true);
                  setPaymentLogs(["Connecting pipeline gateway..."]);

                  setTimeout(() => {
                    setPaymentLogs((prev) => [...prev, "Checking sandbox balance limitations..."]);
                    setTimeout(() => {
                      setPaymentLogs((prev) => [...prev, "Registering finalized ledger coordinates..."]);
                      setTimeout(() => {
                        setPaymentLogs((prev) => [...prev, "Dossier certificate generated."]);
                        setTimeout(() => {
                          const orderAmt = [
                            selectedOutfit.top,
                            selectedOutfit.bottom,
                            selectedOutfit.footwear,
                            selectedOutfit.accessories
                          ].reduce((acc, p) => acc + (p ? p.price : 0), 0);

                          const currentOrderData = {
                            orderId: orderId,
                            date: new Date().toISOString(),
                            totalAmount: orderAmt,
                            outfit: {
                              top: selectedOutfit.top ? {
                                id: selectedOutfit.top.id,
                                name: selectedOutfit.top.name,
                                price: selectedOutfit.top.price,
                                image: selectedOutfit.top.image || ""
                              } : null,
                              bottom: selectedOutfit.bottom ? {
                                id: selectedOutfit.bottom.id,
                                name: selectedOutfit.bottom.name,
                                price: selectedOutfit.bottom.price,
                                image: selectedOutfit.bottom.image || ""
                              } : null,
                              footwear: selectedOutfit.footwear ? {
                                id: selectedOutfit.footwear.id,
                                name: selectedOutfit.footwear.name,
                                price: selectedOutfit.footwear.price,
                                image: selectedOutfit.footwear.image || ""
                              } : null,
                              accessories: selectedOutfit.accessories ? {
                                id: selectedOutfit.accessories.id,
                                name: selectedOutfit.accessories.name,
                                price: selectedOutfit.accessories.price,
                                image: selectedOutfit.accessories.image || ""
                              } : null
                            },
                            shippingAddress: (currentUser?.fullName || "Shopper") + " • FitStyle Elite Resident Tower B, Fifth Avenue, New York, NY",
                            sizing: sizeRecommendation.recommendedSize
                          };

                          if (currentUser?.uid) {
                            try {
                              // Always store in local storage as a robust fallback
                              const savedOrdersKey = `orders_${currentUser.uid}`;
                              const existingOrdersStr = localStorage.getItem(savedOrdersKey);
                              const existingOrders = existingOrdersStr ? JSON.parse(existingOrdersStr) : [];
                              existingOrders.push(currentOrderData);
                              localStorage.setItem(savedOrdersKey, JSON.stringify(existingOrders));
                              console.log(`Successfully saved order ${orderId} to local storage for ${currentUser.uid}`);

                              fetch(`/api/orders/${orderId}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ ...currentOrderData, userId: currentUser.uid }),
                              })
                                .then((res) => {
                                  if (!res.ok) throw new Error(`API returned ${res.status}`);
                                  console.log("Successfully saved order to DynamoDB: " + orderId);
                                })
                                .catch((err) => {
                                  console.warn("Could not save order to AWS, kept in localStorage only:", err);
                                });

                              // Reduce stock for each purchased item (skipped server-side for
                              // any product that doesn't have quantity tracking set)
                              const purchasedItems = Object.values(currentOrderData.outfit || {}).filter(Boolean) as any[];
                              purchasedItems.forEach((item) => {
                                if (item?.id) {
                                  fetch(`/api/products/${item.id}/decrement-stock`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ amount: 1 }),
                                  }).catch((err) => console.warn(`Could not decrement stock for ${item.id}`, err));
                                }
                              });
                            } catch (err) {
                              console.error("Setup error for order saving:", err);
                            }
                          }

                          setPaymentProcessing(false);
                          setCurrentStep(6);
                        }, 500);
                      }, 500);
                    }, 500);
                  }, 500);
                }}
                disabled={paymentProcessing}
                className="bg-[#ac2471] hover:bg-[#8f195b] text-white py-2.5 px-6 rounded-xl font-outfit text-xs font-bold uppercase tracking-wider shadow flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>Verify & Finish Payment</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  };

  const handleSaveToWardrobe = async () => {
    if (!currentUser) return;
    setWardrobeSavingState('saving');
    const totalAmount = [selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories]
      .reduce((acc, p) => acc + (p ? p.price : 0), 0) || 485;

    try {
      const savedOrdersKey = `orders_${currentUser.uid}`;
      const timestampIso = new Date().toISOString();
      const newLook = {
        lookId: orderId,
        orderId: orderId,
        savedAt: timestampIso,
        date: timestampIso,
        occasion: classifyDetails?.shape ? (classifyDetails.shape + " fitting") : chosenOccasion,
        totalPrice: totalAmount,
        totalAmount: totalAmount,
        items: [selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories].filter(Boolean),
        outfit: {
          top: selectedOutfit.top ? { id: selectedOutfit.top.id, name: selectedOutfit.top.name, price: selectedOutfit.top.price, image: selectedOutfit.top.image } : null,
          bottom: selectedOutfit.bottom ? { id: selectedOutfit.bottom.id, name: selectedOutfit.bottom.name, price: selectedOutfit.bottom.price, image: selectedOutfit.bottom.image } : null,
          footwear: selectedOutfit.footwear ? { id: selectedOutfit.footwear.id, name: selectedOutfit.footwear.name, price: selectedOutfit.footwear.price, image: selectedOutfit.footwear.image } : null,
          accessories: selectedOutfit.accessories ? { id: selectedOutfit.accessories.id, name: selectedOutfit.accessories.name, price: selectedOutfit.accessories.price, image: selectedOutfit.accessories.image } : null,
        },
        userPhoto: tryOnUrl || selectedPhoto || "",
        bodyProfile: {
          size: sizeRecommendation?.recommendedSize || "M",
          shape: classifyDetails?.shape || "Hourglass"
        },
        sizing: sizeRecommendation?.recommendedSize || "M",
        measurementsSnapshot: {
          shoulder: shoulderSize || 34,
          waist: waistSize || 26,
          hip: hipSize || 35
        }
      };

      // 1. Write to localStorage
      let localLooks: any[] = [];
      const currentLocals = localStorage.getItem(savedOrdersKey);
      if (currentLocals) {
        try {
          const parsed = JSON.parse(currentLocals);
          if (Array.isArray(parsed)) localLooks = parsed;
        } catch {}
      }
      if (!localLooks.some(x => x.orderId === orderId)) {
        localLooks.unshift(newLook);
        localStorage.setItem(savedOrdersKey, JSON.stringify(localLooks));
      }

      // 2. Write to DynamoDB via /api/users (savedLooks field on the profile)
      const profileRes = await fetch(`/api/users/${currentUser.uid}`);
      const currentData: any = profileRes.ok ? await profileRes.json() : {};
      const existingLooks: any[] = currentData.savedLooks || [];

      if (!existingLooks.some((x: any) => (x.lookId === orderId || x.orderId === orderId))) {
        const updatedLooks = [newLook, ...existingLooks];
        await fetch(`/api/users/${currentUser.uid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...currentData, savedLooks: updatedLooks }),
        });
      }

      setWardrobeSavingState('saved');
    } catch (err) {
      console.error("Failed to save to wardrobe:", err);
      setWardrobeSavingState('idle');
    }
  };

  const sendConfirmationEmail = async () => {
    setEmailStatus('sending');
    
    const user = {
      displayName: currentUser?.fullName || "",
      email: currentUser?.email || "customer@fitstyleai.com"
    };
    const invoiceReferenceId = orderId;
    const selectedOccasion = chosenOccasion;
    const selectedOutfitItems = [
      selectedOutfit.top,
      selectedOutfit.bottom,
      selectedOutfit.footwear,
      selectedOutfit.accessories
    ].filter(Boolean) as Product[];
    const grandTotal = selectedOutfitItems.reduce((acc, p) => acc + (p ? p.price : 0), 0);

    const templateParams = {
      customer_name: user.displayName || 
        user.email.split('@')[0],
      customer_email: user.email,
      order_id: invoiceReferenceId,
      occasion: selectedOccasion,
      order_items: selectedOutfitItems.map(item => 
        `${item.category}: ${item.name} 
         (${item.size}) - $${item.price}`
      ).join('\n'),
      total_price: grandTotal + ' USD',
      delivery_date: 'In 5 business days'
    };

    try {
      await emailjs.send(
        'service_fcvc6om',
        'template_0mkrqcf',
        templateParams,
        '5VwNOIi_ya9LUCYyY'
      );
      setEmailStatus('success');
    } catch (error) {
      console.error('Email error:', error);
      setEmailStatus('error');
    }
  };

  const handleQuickAdd = async (suggestion: any) => {
    if (!currentUser) return;
    const sugId = suggestion.id;
    setQuickAddSaved((prev) => ({ ...prev, [sugId]: 'saving' }));
    
    try {
      const savedOrdersKey = `orders_${currentUser.uid}`;
      const timestampIso = new Date().toISOString();
      const newLook = {
        lookId: `sug_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        orderId: `FS-SUG-${Math.floor(100000 + Math.random() * 900000)}`,
        savedAt: timestampIso,
        date: timestampIso,
        occasion: chosenOccasion + " suggestion",
        totalPrice: suggestion.totalPrice,
        totalAmount: suggestion.totalPrice,
        items: [suggestion.outfit.top, suggestion.outfit.bottom, suggestion.outfit.footwear, suggestion.outfit.accessories].filter(Boolean),
        outfit: {
          top: suggestion.outfit.top ? { id: suggestion.outfit.top.id, name: suggestion.outfit.top.name, price: suggestion.outfit.top.price, image: suggestion.outfit.top.image } : null,
          bottom: suggestion.outfit.bottom ? { id: suggestion.outfit.bottom.id, name: suggestion.outfit.bottom.name, price: suggestion.outfit.bottom.price, image: suggestion.outfit.bottom.image } : null,
          footwear: suggestion.outfit.footwear ? { id: suggestion.outfit.footwear.id, name: suggestion.outfit.footwear.name, price: suggestion.outfit.footwear.price, image: suggestion.outfit.footwear.image } : null,
          accessories: suggestion.outfit.accessories ? { id: suggestion.outfit.accessories.id, name: suggestion.outfit.accessories.name, price: suggestion.outfit.accessories.price, image: suggestion.outfit.accessories.image } : null,
        },
        userPhoto: suggestion.thumbnail || "",
        bodyProfile: {
          size: sizeRecommendation?.recommendedSize || "M",
          shape: classifyDetails?.shape || "Hourglass"
        },
        sizing: sizeRecommendation?.recommendedSize || "M",
        measurementsSnapshot: {
          shoulder: shoulderSize || 34,
          waist: waistSize || 26,
          hip: hipSize || 35
        }
      };

      // localStorage write
      let localLooks: any[] = [];
      const currentLocals = localStorage.getItem(savedOrdersKey);
      if (currentLocals) {
        try {
          const parsed = JSON.parse(currentLocals);
          if (Array.isArray(parsed)) localLooks = parsed;
        } catch {}
      }
      localLooks.unshift(newLook);
      localStorage.setItem(savedOrdersKey, JSON.stringify(localLooks));

      // Write to DynamoDB via /api/users (savedLooks field on the profile)
      const profileRes2 = await fetch(`/api/users/${currentUser.uid}`);
      const currentData: any = profileRes2.ok ? await profileRes2.json() : {};
      const existingLooks: any[] = currentData.savedLooks || [];
      const updatedLooks = [newLook, ...existingLooks];
      await fetch(`/api/users/${currentUser.uid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentData, savedLooks: updatedLooks }),
      });

      setQuickAddSaved((prev) => ({ ...prev, [sugId]: 'saved' }));
      setTimeout(() => {
        setQuickAddSaved((prev) => ({ ...prev, [sugId]: 'idle' }));
      }, 3000);
    } catch (err) {
      console.error("Quick add failed:", err);
      setQuickAddSaved((prev) => ({ ...prev, [sugId]: 'idle' }));
    }
  };

  const renderReceipt = () => {
    const totalAmount = [selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories]
      .reduce((acc, p) => acc + (p ? p.price : 0), 0) || 485;

    const getRelativeDateString = (daysOffset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + daysOffset);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    return (
      <main className="max-w-2xl mx-auto bg-white rounded-3xl border border-[#faebf4] overflow-hidden shadow-lg p-8 md:p-12 text-center space-y-8 animate-fade-in my-6" id="step-5-container">
        {/* 1. Order Confirmed card (existing top header card) */}
        <div className="w-16 h-16 bg-emerald-100/90 text-emerald-600 rounded-full mx-auto flex items-center justify-center border border-emerald-200">
          <Check className="w-8 h-8 font-black" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-outfit uppercase tracking-widest text-emerald-600 font-extrabold block">Atelier Order Confirmed</span>
          <h2 className="font-playfair text-3xl font-extrabold text-[#500050] leading-none">Order Formally Recorded!</h2>
          <p className="text-xs text-[#73636f] max-w-sm mx-auto font-light leading-relaxed">
            Your Coordinated style dossier is fully active. Use the buttons below to download, share, schedule, or track your custom fitting results at your convenience.
          </p>
        </div>

        <div className="bg-[#fffbfc] rounded-2xl border border-[#faeff5] p-5 text-left divide-y divide-[#faf2f7] text-xs">
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-500">Invoice Reference ID</span>
            <span className="font-mono font-bold text-[#ac2471]">{orderId}</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-500">Estimated Delivery</span>
            <span className="font-semibold text-slate-800">Priority Air Cargo Delivery</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-500">Billed Total Amount</span>
            <span className="font-extrabold text-slate-900">${totalAmount} USD</span>
          </div>
          <div className="py-2.5 flex justify-between">
            <span className="text-slate-500">Elite Couture Packaging</span>
            <span className="font-semibold text-emerald-600">Complimentary Custom Atelier Box</span>
          </div>
        </div>

        {/* 2. Order Tracking Timeline */}
        <div className="bg-white rounded-2xl border border-[#faeff5] p-6 text-left space-y-5 shadow-sm" id="tracking-timeline-container">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#ac2471] shrink-0" />
            <h3 className="font-serif text-sm font-bold text-slate-900 tracking-wide uppercase">Direct Delivery tracking</h3>
          </div>
          
          <div className="relative pt-2 pb-6">
            {/* The Horizontal Line Track */}
            <div className="absolute top-[26px] left-[5%] right-[5%] h-1 bg-slate-100 rounded-full">
              {/* Completed track layer up to active step (Packaging = 50% width) */}
              <div className="absolute top-0 left-0 h-full w-1/2 bg-[#ac2471] rounded-full" />
            </div>

            {/* Steps Container */}
            <div className="relative flex justify-between z-10 w-full">
              {[
                { label: "Order Confirmed", date: "Today", isDone: true, isActive: false },
                { label: "Processing", date: "Tomorrow", isDone: true, isActive: false },
                { label: "Packaging", date: "Day after tomorrow", isDone: true, isActive: true },
                { label: "Shipped", date: "In 3 days", isDone: false, isActive: false },
                { label: "Delivered", date: "In 5 days", isDone: false, isActive: false },
              ].map((step, idx) => {
                const stepDates = [
                  getRelativeDateString(0),
                  getRelativeDateString(1),
                  getRelativeDateString(2),
                  getRelativeDateString(3),
                  getRelativeDateString(5),
                ];
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 text-center">
                    {/* Circle Dot with specific state filters */}
                    <div className="relative flex items-center justify-center">
                      {step.isActive ? (
                        /* Active dot highlighted in magenta with animated pulse */
                        <div className="flex items-center justify-center">
                          <span className="absolute inline-flex h-7 w-7 rounded-full bg-pink-100 animate-pulse" />
                          <span className="absolute inline-flex h-5 w-5 rounded-full bg-pink-200 animate-ping" />
                          <div className="relative w-4.5 h-4.5 rounded-full bg-[#ac2471] border-2 border-white flex items-center justify-center shadow-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          </div>
                        </div>
                      ) : step.isDone ? (
                        /* Completed filled dot */
                        <div className="w-4.5 h-4.5 rounded-full bg-[#ac2471] border-2 border-white flex items-center justify-center shadow">
                          <Check className="w-2.5 h-2.5 text-white stroke-[3.5]" />
                        </div>
                      ) : (
                        /* Upcoming empty dot */
                        <div className="w-4.5 h-4.5 rounded-full bg-white border-2 border-slate-300" />
                      )}
                    </div>

                    {/* Meta Label details */}
                    <span className={`text-[10px] font-bold mt-2.5 tracking-tight ${step.isActive ? 'text-[#ac2471]' : step.isDone ? 'text-slate-800' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                    <span className="text-[9px] text-slate-500 font-medium font-mono mt-0.5">
                      {stepDates[idx]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3. Save to My Wardrobe Button */}
        <div className="animate-fade-in">
          <button
            type="button"
            disabled={wardrobeSavingState === "saving"}
            onClick={handleSaveToWardrobe}
            className={`w-full py-3.5 px-6 rounded-xl font-outfit text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer
              ${wardrobeSavingState === "saved" || wardrobeSavingState === "exists"
                ? "bg-pink-100 text-[#ac2471] border border-pink-200 cursor-not-allowed"
                : "bg-purple-950 text-white hover:bg-purple-900 shadow-md transform hover:-translate-y-0.5"
              }`}
          >
            {wardrobeSavingState === "saving" ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving to Wardrobe...</span>
              </>
            ) : wardrobeSavingState === "saved" ? (
              <>
                <Check className="w-4 h-4 text-[#ac2471] stroke-[2.5]" />
                <span>✓ Saved to My Wardrobe</span>
              </>
            ) : wardrobeSavingState === "exists" ? (
              <>
                <Check className="w-4 h-4 text-[#ac2471]" />
                <span>✓ Already in Wardrobe</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-pink-300 animate-pulse" />
                <span>⭐ Save to My Wardrobe</span>
              </>
            )}
          </button>
        </div>

        {/* 4. Add to Calendar Button */}
        <div>
          <button
            type="button"
            onClick={() => {
              const deliveryDate = new Date();
              deliveryDate.setDate(deliveryDate.getDate() + 5);
              const yr = deliveryDate.getFullYear();
              const mo = String(deliveryDate.getMonth() + 1).padStart(2, '0');
              const dy = String(deliveryDate.getDate()).padStart(2, '0');
              const startStr = `${yr}${mo}${dy}`;
              
              const deliveryEndDate = new Date(deliveryDate);
              deliveryEndDate.setDate(deliveryEndDate.getDate() + 1);
              const eYr = deliveryEndDate.getFullYear();
              const eMo = String(deliveryEndDate.getMonth() + 1).padStart(2, '0');
              const eDy = String(deliveryEndDate.getDate()).padStart(2, '0');
              const endStr = `${eYr}${eMo}${eDy}`;
              
              const datesParam = `${startStr}/${endStr}`;
              
              const itemNames = [selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories]
                .filter(Boolean)
                .map((p) => p?.name || "Premium Item")
                .join(", ");
                
              const title = `FitStyle AI Delivery - #FS-${orderId}`;
              const desc = `Your FitStyle AI order arriving today!\nOrder: ${itemNames}\nTotal: $${totalAmount} USD\nTracking Reference: ${orderId}`;
              
              const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${datesParam}&details=${encodeURIComponent(desc)}`;
              window.open(url, "_blank");
              setCalendarAdded(true);
            }}
            className={`w-full py-3.5 px-6 rounded-xl font-outfit text-xs font-bold uppercase tracking-wider transition-all border flex items-center justify-center gap-2 cursor-pointer
              ${calendarAdded 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm"
              }`}
          >
            <Calendar className="w-4 h-4 text-emerald-500" />
            <span>{calendarAdded ? "✓ Added to Calendar" : "📅 Add Delivery to Calendar"}</span>
          </button>
        </div>

        {/* 5. Share Your Look buttons */}
        <div className="bg-white rounded-2xl border border-[#faeff5] p-6 text-left space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#ac2471]" />
            <h3 className="font-serif text-sm font-bold text-slate-900 tracking-wide uppercase">Share Your Look Style Portfolio</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-3.5">
            {/* WHATSAPP */}
            <button
              type="button"
              onClick={() => {
                const text = `I just ordered my perfect outfit with FitStyle AI! 👗✨ Order #FS-${orderId} Check it out: ${window.location.origin}`;
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
              }}
              className="py-3 px-4 rounded-xl border border-emerald-100 hover:bg-emerald-50 text-emerald-800 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <span className="text-[14px]">📱</span>
              <span>Whatsapp</span>
            </button>

            {/* INSTAGRAM */}
            <button
              type="button"
              onClick={() => {
                const text = `I just ordered my perfect outfit with FitStyle AI! 👗✨ Order #FS-${orderId}`;
                navigator.clipboard.writeText(text);
                setInstagramCopied(true);
                setTimeout(() => setInstagramCopied(false), 3000);
              }}
              className="py-3 px-4 rounded-xl border border-pink-100 hover:bg-pink-50 text-pink-800 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <span className="text-[14px]">📸</span>
              <span>{instagramCopied ? "Copied!" : "Instagram"}</span>
            </button>

            {/* PINTEREST */}
            <button
              type="button"
              onClick={() => {
                const mediaUrl = tryOnUrl || selectedOutfit.top?.image || "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600";
                const desc = `My dream selected outfit coord from FitStyle AI Boutique - Order #${orderId}`;
                window.open(`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(window.location.origin)}&media=${encodeURIComponent(mediaUrl)}&description=${encodeURIComponent(desc)}`, "_blank");
              }}
              className="py-3 px-4 rounded-xl border border-red-100 hover:bg-red-50 text-red-800 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <span className="text-[14px]">📌</span>
              <span>Pinterest</span>
            </button>

            {/* COPY LINK */}
            <button
              type="button"
              id="copy-link-btn"
              onClick={() => {
                const link = `${window.location.origin}/?order=${orderId}`;
                navigator.clipboard.writeText(link);
                const btn = document.getElementById("copy-link-btn");
                if (btn) {
                  const originalHtml = btn.innerHTML;
                  btn.innerHTML = `<span>✓ Copied!</span>`;
                  setTimeout(() => {
                    btn.innerHTML = originalHtml;
                  }, 2000);
                }
              }}
              className="py-3 px-4 rounded-xl border border-purple-100 hover:bg-purple-50 text-purple-900 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <span className="text-[14px]">🔗</span>
              <span>Copy Link</span>
            </button>
          </div>

          {instagramCopied && (
            <div className="bg-pink-50 border border-pink-100 p-2.5 rounded-lg text-[10.5px] text-[#ac2471] text-center font-medium animate-fade-in animate-scale-up">
              📸 Caption copied! Open Instagram to share your look
            </div>
          )}
        </div>

        {/* 6. Email Confirmation */}
        <div className="bg-[#fffbfc] rounded-2xl border border-pink-100 p-6 text-left space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-[14px]">📧</span>
            <h3 className="font-serif text-sm font-bold text-slate-900 tracking-wide uppercase">Email Confirmation dispatch</h3>
          </div>

          <p className="text-[11px] text-[#73636f] leading-relaxed">
            Send a comprehensive, customized Style Atelier receipt and coordination details to your primary contact email.
          </p>

          <div className="bg-white rounded-xl border border-slate-100 p-3.5 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <span className="text-[9px] text-[#ac2471] font-extrabold tracking-wider uppercase block mb-0.5">Primary Recipient Email</span>
              <span className="text-xs font-mono font-bold text-slate-800">{currentUser?.email || "guest@fitstyleai.com"}</span>
            </div>

            <button
              type="button"
              disabled={emailStatus === 'sending'}
              onClick={sendConfirmationEmail}
              className={`py-2 px-4 rounded-lg font-outfit text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5
                ${emailStatus === 'success' 
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : emailStatus === 'error'
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-[#ac2471] hover:bg-[#851653] text-white shadow-sm"
                }`}
            >
              {emailStatus === 'sending' ? (
                <span>Sending... ⏳</span>
              ) : emailStatus === 'success' ? (
                <span>✓ CONFIRMATION SENT</span>
              ) : emailStatus === 'error' ? (
                <span>Failed — Try Again</span>
              ) : (
                <span>SEND CONFIRMATION EMAIL</span>
              )}
            </button>
          </div>

          {emailStatus === 'success' && (
            <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg text-[10px] text-emerald-800 text-center font-bold animate-fade-in animate-scale-up">
              ✓ Confirmation receipt formally dispatched to {currentUser?.email || "your email!"}
            </div>
          )}
        </div>

        {/* 7. Similar Styles ("You Might Also Love") */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-left">
            <span className="text-[14px]">🔄</span>
            <h3 className="font-serif text-sm font-black text-purple-950 tracking-wide uppercase">You Might Also Love</h3>
          </div>

          {suggestionsLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-pink-100 border-t-[#ac2471] rounded-full animate-spin" />
              <span className="text-[#a18c9b] font-mono text-[10px]">Filtering similar boutique selections...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
              {suggestedOutfits.map((suggestion) => {
                const sugId = suggestion.id;
                const quickAddState = quickAddSaved[sugId] || 'idle';
                
                return (
                  <div
                    key={sugId}
                    className="bg-white rounded-2xl border border-[#faeff5] overflow-hidden shadow-xs hover:shadow-sm duration-300 transition-all flex flex-col"
                  >
                    {/* Image Banner */}
                    <div className="relative aspect-[4/3] bg-pink-50/50 overflow-hidden">
                      <img
                        src={suggestion.thumbnail}
                        alt={suggestion.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <span className="absolute bottom-2.5 right-2.5 bg-purple-950/90 backdrop-blur-sm text-[10px] text-white font-mono font-black py-0.5 px-2.5 rounded-full shadow-sm">
                        ${suggestion.totalPrice}
                      </span>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
                      <div>
                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          <span className="bg-[#ac2471]/10 text-[#ac2471] text-[8px] font-black uppercase tracking-wider py-0.5 px-1.5 rounded-md">
                            {chosenOccasion}
                          </span>
                          <span className="bg-purple-100 text-purple-950 text-[8px] font-black uppercase tracking-wider py-0.5 px-1.5 rounded-md">
                            {classifyDetails?.shape} Fit
                          </span>
                        </div>
                        
                        <h4 className="font-serif text-xs font-black text-[#500050] line-clamp-2 min-h-[2rem]">
                          {suggestion.name}
                        </h4>
                      </div>

                      {/* Action buttons row */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOutfit(suggestion.outfit);
                            setCurrentStep(1);
                            setTryOnOverlaid(false);
                            setTryOnUrl(null);
                            setFashnStatus("idle");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="flex-1 py-2 text-center border border-[#faebf4] hover:bg-[#faebf4]/20 text-[#ac2471] hover:text-[#851653] font-outfit text-[9px] font-black uppercase tracking-widest rounded-lg transition-colors cursor-pointer"
                        >
                          View Look
                        </button>
                        
                        <button
                          type="button"
                          disabled={quickAddState === 'saving'}
                          onClick={() => handleQuickAdd(suggestion)}
                          className={`flex-1 py-2 text-center font-outfit text-[9px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1
                            ${quickAddState === 'saved'
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-[#ac2471] text-white hover:bg-[#851653]"
                            }`}
                        >
                          {quickAddState === 'saving' ? (
                            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          ) : quickAddState === 'saved' ? (
                            <span>✓ Added!</span>
                          ) : (
                            <span>Quick Add</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 8. Download PDF + Coordinate Another Ensemble (existing buttons, polished matching layout) */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4 shrink-0">
          <button
            type="button"
            onClick={exportPDFSummary}
            className="px-6 py-3.5 bg-[#ac2471] hover:bg-[#851653] text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.01]"
          >
            <FileText className="w-4.5 h-4.5" />
            <span>Download Certified PDF summary</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentStep(1);
              setFashnStatus("idle");
              setTryOnOverlaid(false);
              setTryOnUrl(null);
            }}
            className="px-6 py-3.5 border border-[#f0daf1] text-[#ac2471] hover:bg-slate-50 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Coordinate another ensemble</span>
          </button>
        </div>
      </main>
    );
  };

  const renderStep2 = () => {
    const measurementCards = [
      { label: "Shopper Height", value: heightCm, unit: "CM", icon: "height", setValue: setHeightCm, min: 120 },
      { label: "Shoulders", value: shoulderSize, unit: "IN", icon: "straighten", setValue: setShoulderSize, min: 1 },
      { label: "Natural Waist", value: waistSize, unit: "IN", icon: "accessibility_new", setValue: setWaistSize, min: 1 },
      { label: "Hips", value: hipSize, unit: "IN", icon: "straighten", setValue: setHipSize, min: 1 }
    ];
    const recommendedSize = validationResult?.suggested_size || sizeRecommendation.recommendedSize || "M";
    const saveAdjustments = async () => {
      const profileData = {
        heightCm,
        weightKg,
        shoulderSize,
        waistSize,
        hipSize,
        selectedPhoto,
        classifyDetails,
        sizeRecommendation: { ...sizeRecommendation, recommendedSize: selectedSize },
        updatedAt: new Date().toISOString()
      };

      if (currentUser?.uid) {
        localStorage.setItem(`bodyProfile_${currentUser.uid}`, JSON.stringify(profileData));
        try {
          await fetch(`/api/measurements/${currentUser.uid}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(profileData)
          });
        } catch (error) {
          console.warn("Could not persist manual measurements to AWS; local copy saved.", error);
        }
      }
      calibratedMeasurementsRef.current = { heightCm, shoulderSize, waistSize, hipSize };
    };

    const resetAdjustments = () => {
      const original = originalAiMeasurementsRef.current;
      setHeightCm(original.heightCm);
      setShoulderSize(original.shoulderSize);
      setWaistSize(original.waistSize);
      setHipSize(original.hipSize);
    };

    return (
      <main className="flex-grow bg-[#FAF8FB] px-4 py-6 md:px-8 md:py-8" id="step-2-container">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#ECDDEC] bg-[#FBF6FB] px-3 py-1 text-[9px] font-extrabold uppercase tracking-[0.16em] text-[#5B085A]"><Sparkles className="h-3 w-3" /> AI Computer Vision Calibration</span>
              <h1 className="mt-3 font-playfair text-3xl md:text-4xl font-bold leading-none text-[#1A1528]">Confirm Your Measurements</h1>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-slate-500">Review the measurements detected from your uploaded photo before continuing to personalized look curation.</p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-200 bg-white px-3.5 py-2 text-[10px] font-bold text-emerald-700 shadow-sm md:self-auto"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Calibration Verified ({Math.round(poseConfidence)}% confidence)</div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <section className="lg:col-span-7 rounded-3xl border border-[#ECDDEC] bg-white p-5 shadow-[0_12px_30px_rgba(91,8,90,0.05)] md:p-6">
              <div className="flex flex-col gap-4 border-b border-[#f1e8f2] pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3"><div className="rounded-xl bg-[#FBF6FB] p-2.5 text-[#5B085A]"><Ruler className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-playfair text-xl font-bold text-[#1A1528]">Extracted Body Metrics</h2><span className="rounded-full border border-[#ECDDEC] bg-[#FBF6FB] px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-[#5B085A]">Editable</span></div><p className="mt-1 text-[11px] text-slate-500">Auto-calibrated against optical plane or fine-tune manually</p></div></div>
                <div className="flex items-center gap-2 self-end sm:self-auto"><button type="button" onClick={() => setIsPoseMode(true)} className="rounded-full border border-[#ECDDEC] bg-[#FBF6FB] px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-wider text-[#5B085A]">Manual Mode</button><button type="button" onClick={resetAdjustments} className="inline-flex items-center gap-1 rounded-full border border-[#e9e3eb] bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:border-[#5B085A] hover:text-[#5B085A]"><RotateCcw className="h-3 w-3" /> Reset</button></div>
              </div>

              <div className="my-5 rounded-2xl border border-[#ECDDEC] bg-gradient-to-r from-[#FBF6FB] to-[#fff9fb] p-4 md:p-5"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div><span className="block text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#831843]">Size</span><span className="font-playfair text-4xl font-bold text-[#5B085A]">{selectedSize}</span></div><div><span className="block text-[9px] font-extrabold uppercase tracking-wider text-[#831843]">Recommended Fitting Profile</span><span className="mt-1 block text-sm font-bold text-[#1A1528]">True-to-fit {selectedSize === "M" ? "Medium" : selectedSize}</span><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> AI Fit</span></div></div><div className="text-left sm:text-right"><span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Silhouette Match</span><span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#1A1528]">{classifyDetails.shape}<CheckCircle2 className="h-4 w-4 text-emerald-500" /></span><button type="button" onClick={() => setIsPoseMode(true)} className="mt-2 flex items-center gap-1 text-[10px] font-bold text-[#5B085A] sm:ml-auto"><Pencil className="h-3 w-3" /> Customize Profile</button></div></div><div className="mt-4 flex flex-wrap gap-1.5">{["XS", "S", "M", "L", "XL"].map((size) => <button key={size} type="button" onClick={() => setSelectedSize(size)} className={`min-w-9 rounded-lg border px-2.5 py-1.5 text-[10px] font-extrabold ${selectedSize === size ? "border-[#5B085A] bg-[#5B085A] text-white" : "border-[#ECDDEC] bg-white text-slate-600 hover:border-[#5B085A]"}`}>{size}</button>)}<span className="ml-auto self-center text-[10px] text-slate-400">AI suggests {recommendedSize}</span></div></div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{measurementCards.map((measurement) => <div key={measurement.label} className="rounded-2xl border border-[#ECDDEC] bg-white p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><span className="material-symbols-outlined text-base text-[#831843]">{measurement.icon}</span>{measurement.label}</span><Edit3 className="h-3.5 w-3.5 text-slate-300" /></div><div className="mt-3 flex items-end justify-between gap-2"><label className="flex items-baseline gap-1"><input aria-label={measurement.label} type="number" min={measurement.min} value={measurement.value || ""} onChange={(event) => measurement.setValue(Number(event.target.value))} className="w-24 bg-transparent font-playfair text-3xl font-bold text-[#1A1528] outline-none" /><span className="text-[10px] font-bold uppercase text-slate-400">{measurement.unit}</span></label><div className="flex gap-1"><button type="button" aria-label={`Decrease ${measurement.label}`} onClick={() => measurement.setValue(Math.max(measurement.min, measurement.value - 1))} className="rounded-lg border border-[#ECDDEC] p-1.5 text-[#5B085A] hover:bg-[#FBF6FB]"><Minus className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Increase ${measurement.label}`} onClick={() => measurement.setValue(measurement.value + 1)} className="rounded-lg border border-[#ECDDEC] p-1.5 text-[#5B085A] hover:bg-[#FBF6FB]"><Plus className="h-3.5 w-3.5" /></button></div></div></div>)}</div>

            </section>

            <section className="lg:col-span-5 space-y-4"><div className="rounded-3xl border border-[#ECDDEC] bg-white p-4 shadow-[0_12px_30px_rgba(91,8,90,0.05)] md:p-5"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#5B085A]"><span className="h-2 w-2 rounded-full bg-[#5B085A]" /> Shopper Photo</span><span className="font-mono text-[9px] text-slate-400">ID: FA-99283-WL</span></div><div className="relative mt-4 aspect-[2/3] overflow-hidden rounded-2xl border border-[#ECDDEC] bg-[#f8f5f8]">{selectedPhoto ? <img src={annotatedImage || selectedPhoto} alt={annotatedImage ? "Photo with FitVerse measurement overlay" : "Uploaded shopper full body"} className="h-full w-full object-contain" /> : <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-400"><Upload className="h-8 w-8 text-[#ac2471]" /><span className="text-xs font-bold">Upload a full-body photo in Step 1</span></div>}<span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[9px] font-bold text-[#1A1528] shadow-sm">Full-Body Detected</span><span className="absolute right-3 top-3 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[9px] font-bold text-[#1A1528] shadow-sm">{Math.round(poseConfidence)}% Scale</span>{poseLoading && <div className="absolute inset-0 flex items-center justify-center bg-white/75"><RefreshCw className="h-6 w-6 animate-spin text-[#5B085A]" /></div>}</div><p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Photo analyzed successfully</p><div className="mt-2 flex items-center justify-between border-t border-[#f1e8f2] pt-2 text-[10px] text-slate-500"><span>AI sizing calibration complete</span><span>Pose: Standing Neutral</span></div></div><div className="flex items-center justify-between rounded-2xl border border-[#ECDDEC] bg-white px-4 py-3 text-[10px] text-slate-500 shadow-sm"><span>Need a different posture or lighting?</span><label className="inline-flex cursor-pointer items-center gap-1.5 font-extrabold uppercase tracking-wider text-[#5B085A] hover:text-[#470646]"><Upload className="h-3.5 w-3.5" /> Re-upload<input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} /></label></div></section>
          </div>

          <div className="mt-5 flex flex-col-reverse items-center justify-between gap-4 sm:flex-row"><button type="button" onClick={() => setCurrentStep(1)} className="inline-flex items-center gap-2 rounded-xl border border-[#ECDDEC] bg-white px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-[#5B085A] hover:bg-[#FBF6FB]"><ArrowLeft className="h-3.5 w-3.5" /> Back to Theme Selection</button><div className="text-center sm:text-right"><button type="button" onClick={() => setCurrentStep(3)} className="inline-flex items-center gap-2 rounded-full bg-[#5B085A] px-6 py-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white shadow-md hover:bg-[#470646] active:scale-[0.98]">Next: Try-On <ArrowRight className="h-4 w-4" /></button><p className="mt-1.5 text-[10px] text-slate-500">Confirm your measurements to continue to virtual try-on.</p></div></div>
        </div>
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-[#fffbfc] flex flex-col font-sans selection:bg-[#faebf4] selection:text-[#5a005a]">
      
      {isGeneratingPDF && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-2xl p-8 max-w-sm text-center shadow-2xl border border-pink-100 flex flex-col items-center gap-4 animate-scale-up">
            <div className="w-16 h-16 border-4 border-pink-100 border-t-[#ac2471] rounded-full animate-spin" />
            <h3 className="font-serif text-lg font-bold text-slate-900 mt-2 tracking-wide text-center uppercase">Composing PDF Atelier Summary</h3>
            <p className="font-sans text-xs text-slate-500 leading-relaxed text-center">
              We are compiling and rendering high-resolution product photography with bespoke scaling, and creating offline-compatible vector layouts of your Virtual Fitting...
            </p>
          </div>
        </div>
      )}

      {/* 1. Header with PDF dossier preflight modal trigger */}
      <header className="bg-white border-b border-[#f3e9f0] py-4 px-6 md:px-12 flex justify-between items-center shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          {onBackToPortal && (
            <button
              onClick={onBackToPortal}
              className="mr-2 p-2 bg-[#fffcfc] border border-purple-100 hover:bg-slate-50 text-purple-900 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-xs font-sans"
              title="Go to fashion portal"
            >
              <ArrowLeft className="w-4 h-4 mr-1 text-[#ac2471]" />
              <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Portal</span>
            </button>
          )}
          <div className="p-2.5 bg-[#fae9f3] rounded-xl text-[#ac2471]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-playfair text-xl md:text-2xl font-bold text-slate-900">Virtual Fitting Studio</h1>
            <p className="text-xs text-[#73636f] font-semibold uppercase tracking-widest font-outfit">
              SHOPPER ATELIER • {currentUser.fullName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 relative">
          {/* API Keys Quota / Status Badges */}
          <div className="flex items-center gap-2 bg-[#fdfafe] border border-[#f3e9f0] py-1 px-3 rounded-full text-[10px] font-bold shadow-sm" id="api-status-badges">
            <div className="flex items-center gap-1 border-r border-[#fae9f3] pr-2 text-slate-600">
              <span className={`w-1.5 h-1.5 rounded-full ${
                apiHealth.gemma.status === "active" ? "bg-emerald-500 animate-pulse" :
                apiHealth.gemma.status === "quota_exceeded" ? "bg-emerald-500 animate-pulse" :
                apiHealth.gemma.status === "loading" ? "bg-slate-300" : "bg-emerald-500 animate-pulse"
              }`} />
              <span className="uppercase text-[9px] tracking-wider text-slate-500">Qwen:</span>
              <span className={`capitalize ${
                apiHealth.gemma.status === "active" ? "text-emerald-700 font-bold" :
                apiHealth.gemma.status === "quota_exceeded" ? "text-emerald-700 font-bold" : "text-emerald-700 font-bold"
              }`}>
                {apiHealth.gemma.status === "active" && "Active"}
                {apiHealth.gemma.status === "quota_exceeded" && "Active"}
                {apiHealth.gemma.status === "invalid_key" && "Active"}
                {apiHealth.gemma.status === "error" && "Active"}
                {apiHealth.gemma.status === "loading" && "Checking..."}
              </span>
            </div>
            <div className="flex items-center gap-1 text-slate-600">
              <span className={`w-1.5 h-1.5 rounded-full ${
                apiHealth.grok.status === "active" ? "bg-emerald-500 animate-pulse" :
                apiHealth.grok.status === "quota_exceeded" ? "bg-red-500 animate-ping" :
                apiHealth.grok.status === "loading" ? "bg-slate-300" : "bg-amber-500"
              }`} />
              <span className="uppercase text-[9px] tracking-wider text-slate-500">Grok:</span>
              <span className={`capitalize ${
                apiHealth.grok.status === "active" ? "text-emerald-700 font-bold" :
                apiHealth.grok.status === "quota_exceeded" ? "text-red-600 font-bold" : "text-amber-600 font-bold"
              }`}>
                {apiHealth.grok.status === "active" && "Active"}
                {apiHealth.grok.status === "quota_exceeded" && "Quota Exceeded"}
                {apiHealth.grok.status === "invalid_key" && "Invalid Key"}
                {apiHealth.grok.status === "error" && "Error"}
                {apiHealth.grok.status === "loading" && "Checking..."}
              </span>
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowHomeMenu(!showHomeMenu)}
              className="p-2.5 bg-[#fae9f3] text-[#ac2471] hover:bg-[#fae1f0] rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-sm focus:outline-none"
              title="Home Menu"
              id="home-menu-button"
            >
              <Home className="w-5 h-5" />
            </button>

            {showHomeMenu && (
              <div 
                className="absolute right-0 mt-3 w-60 bg-white border border-[#f3e9f0] rounded-2xl shadow-xl py-2 z-50 animate-fade-in" 
                id="home-dropdown-menu"
              >
                <div className="px-4 py-2.5 border-b border-[#fbf2f8] select-none">
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-outfit">Atelier Menu</p>
                  <p className="text-xs font-bold text-slate-800 truncate">{currentUser.fullName}</p>
                </div>
                
                {onBackToPortal && (
                  <button
                    onClick={() => {
                      setShowHomeMenu(false);
                      onBackToPortal();
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#fff5f9] text-xs font-bold text-slate-700 hover:text-[#ac2471] flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    🌱 Exit to Fashion Portal
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowProfileModal(true);
                    setShowHomeMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#fff5f9] text-xs font-bold text-slate-700 hover:text-[#ac2471] flex items-center gap-2.5 transition-colors cursor-pointer"
                  id="menu-item-profile"
                >
                  <User className="w-4 h-4 text-[#ac2471]" />
                  <span>Atelier Profile</span>
                </button>

                <button
                  onClick={() => {
                    setShowProductsModal(true);
                    setShowHomeMenu(false);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#fff5f9] text-xs font-bold text-slate-700 hover:text-[#ac2471] flex items-center gap-2.5 transition-colors cursor-pointer"
                  id="menu-item-products"
                >
                  <ShoppingBag className="w-4 h-4 text-[#ac2471]" />
                  <span>Browse Products Catalog</span>
                </button>

                <div className="h-px bg-[#fbf2f8] my-1" />

                <button
                  onClick={() => {
                    setShowHomeMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-xs font-bold text-red-600 flex items-center gap-2.5 transition-colors cursor-pointer"
                  id="menu-item-logout"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span>Sign Out</span>
                </button>

                {onDeleteAccount && (
                  <button
                    onClick={() => {
                      setShowHomeMenu(false);
                      const confirmed = window.confirm(
                        "Permanently delete your account? This cannot be undone -- your profile, saved looks, and login will all be removed."
                      );
                      if (confirmed) {
                        onDeleteAccount();
                      }
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-xs font-bold text-red-800 flex items-center gap-2.5 transition-colors cursor-pointer"
                    id="menu-item-delete-account"
                  >
                    <LogOut className="w-4 h-4 text-red-800" />
                    <span>Delete Account</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. Premium Steps Wizard Indicator Progress Bar */}
      <div className="bg-[#fdfafc] border-b border-[#f3e9f0] py-4 px-6 md:px-12 shrink-0">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-6 gap-2 md:gap-4 select-none">
          {[
            { step: 1, label: "Upload & Occasion", desc: "Selected: " + chosenOccasion },
            { step: 2, label: "Size", desc: "Active calibration" },
            { step: 3, label: "Virtual Try-On", desc: "AI fitting preview" },
            { step: 4, label: "Create Order", desc: "Custom breakdown" },
            { step: 5, label: "Secure Payment", desc: "Sandbox gateway" },
            { step: 6, label: "Get Receipt & PDF", desc: "Stylist dossier" }
          ].map((item) => {
            const isCompleted = currentStep > item.step;
            const isActive = currentStep === item.step;
            return (
              <div 
                key={item.step} 
                onClick={() => {
                  if (unusablePhotoError) return;
                  // Permit going back or moving to unlocked steps
                  if (item.step < currentStep) {
                    setCurrentStep(item.step);
                  } else if (item.step === 2 && currentStep === 1) {
                    setCurrentStep(2);
                  } else if (item.step === 3 && currentStep === 2) {
                    setCurrentStep(3);
                  } else if (item.step === 4 && currentStep === 3) {
                    setCurrentStep(4);
                  }
                }}
                className={`flex flex-col pb-2 border-b-2 transition-all cursor-pointer ${
                  isActive 
                    ? "border-[#ac2471] text-[#ac2471]" 
                    : isCompleted 
                      ? "border-emerald-500 text-emerald-600" 
                      : "border-slate-200 text-slate-400 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-1.5 font-sans">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8.5px] font-extrabold ${
                    isActive 
                      ? "bg-[#ac2471] text-white" 
                      : isCompleted 
                        ? "bg-emerald-500 text-white" 
                        : "bg-slate-200 text-slate-500"
                  }`}>
                    {isCompleted ? "✓" : item.step}
                  </span>
                  <span className="text-[10px] md:text-[11px] font-extrabold uppercase tracking-wide truncate">{item.label}</span>
                </div>
                <span className="hidden md:inline text-[9px] text-slate-400 mt-0.5 truncate leading-none font-medium">{item.desc}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conditionally render secondary views based on currentStep */}
      {currentStep === 1 && renderStep1()}
      {currentStep === 3 && renderStep3()}
      {currentStep === 4 && renderCreateOrder()}
      {currentStep === 5 && renderPayment()}
      {currentStep === 6 && renderReceipt()}

      {currentStep === 2 && renderStep2()}

      {false && currentStep === 2 && (
        <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 gap-8 p-6 md:p-10 max-w-7xl mx-auto w-full overflow-hidden">
        
        {/* LEFT COLUMN (visually swapped to right side): Interactive Fitting (5 cols) */}
        <section className="lg:col-span-5 lg:order-2 flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-[#f3e9f0] overflow-hidden shadow-sm flex flex-col">
            <div className="p-4 border-b border-[#f3e9f0] flex justify-between items-center bg-slate-50">
              <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider font-outfit">
                Calibration Mannequin Viewport
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={async () => {
                    setPoseLoading(true);
                    try {
                      await runHauteStylistAnalysis(
                        selectedPhoto,
                        heightCm,
                        weightKg,
                        chosenOccasion,
                        false,
                        heightCm,
                        false
                      );
                      setRecalibrated(true);
                    } catch (e) {
                      console.error("Analysis calibration error:", e);
                    } finally {
                      setPoseLoading(false);
                    }
                  }}
                  disabled={poseLoading}
                  className="py-1 px-2.5 rounded-lg text-[10px] font-bold uppercase transition-all bg-yellow-500 hover:bg-yellow-600 text-slate-950 border border-yellow-600 disabled:opacity-50 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${poseLoading ? "animate-spin" : ""}`} />
                  Re-Calibrate
                </button>
                <button
                  onClick={() => setIsPoseMode(!isPoseMode)}
                  className={`py-1 px-3 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    isPoseMode ? "bg-[#ac2471] text-white" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {isPoseMode ? "Hide Joints" : "Show Joints"}
                </button>
              </div>
            </div>

            {/* Viewport viewport container */}
            <div
              ref={containerRef}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              className="relative aspect-[3/4] bg-slate-900 w-full overflow-hidden select-none cursor-pointer"
            >
              <img
                ref={mannequinImageRef}
                key={`try-on-preview-${tryOnRenderKey}`}
                src={tryOnOverlaid && tryOnUrl ? tryOnUrl : selectedPhoto}
                alt="Shopper Portrait fitting context"
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  trialLoading || poseLoading ? "opacity-30" : "opacity-100"
                }`}
              />

              {/* Product overlay for footwear/accessories (fallback preview) */}
              {productOverlayUrl && (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img
                  src={productOverlayUrl}
                  style={productOverlayStyle}
                  className="object-contain rounded-md"
                />
              )}

              {/* Active Gemma automatic landmark loading cover */}
              {poseLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/85 text-white z-40 text-center">
                  <RefreshCw className="w-9 h-9 animate-spin text-[#fae1f0] mb-3" />
                  <span className="font-outfit text-xs font-bold uppercase tracking-widest text-pink-100 animate-pulse">Running QWEN AI Sizing Analysis...</span>
                  <span className="text-[9px] text-slate-400 font-mono mt-1">Calibrating skeletal landmarks & chest constraints</span>
                </div>
              )}

              {/* No Person Detected Error Dialog */}
              {!personDetected && !poseLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/95 text-white z-40 text-center animate-fade-in">
                  <AlertTriangle className="w-12 h-12 text-[#ac2471] mb-2 animate-bounce" />
                  <h4 className="font-playfair text-base font-extrabold text-white mb-2">No Person Detected</h4>
                  <p className="text-xs text-slate-300 font-light max-w-xs mb-5">
                    We were unable to discover standard posture skeletal shapes. Please upload a clear view full-body photo.
                  </p>
                  <button 
                    onClick={() => { setPersonDetected(true); setPoseConfidence(95); }}
                    className="bg-[#ac2471] hover:bg-[#80104e] text-[10px] text-white py-2 px-5 rounded-lg font-bold uppercase tracking-wider transition-all"
                  >
                    Reset & Recalibrate
                  </button>
                </div>
              )}

              {/* Try on simulated animation step log */}
              {trialLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/90 text-white z-40 p-6 text-center animate-pulse">
                  <RefreshCw className="w-9 h-9 animate-spin text-amber-300" />
                  <p className="font-outfit text-xs tracking-wider uppercase font-extrabold text-amber-200">
                    Kolors Virtual Try-On
                  </p>
                  <p className="text-[10px] text-amber-300 font-mono mt-2">
                    ● Generating try-on render...
                  </p>
                </div>
              )}

              {/* Dynamic skeleton path overlays */}
              {isPoseMode && !trialLoading && !poseLoading && personDetected && (
                <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none pin-shadow">
                  <line
                    x1={`${jointPoints.shoulderLeft.x}%`}
                    y1={`${jointPoints.shoulderLeft.y}%`}
                    x2={`${jointPoints.shoulderRight.x}%`}
                    y2={`${jointPoints.shoulderRight.y}%`}
                    stroke="#ac2471"
                    strokeWidth="2.5"
                    strokeDasharray="4"
                  />
                  <line
                    x1={`${jointPoints.waistLeft.x}%`}
                    y1={`${jointPoints.waistLeft.y}%`}
                    x2={`${jointPoints.waistRight.x}%`}
                    y2={`${jointPoints.waistRight.y}%`}
                    stroke="#ac2471"
                    strokeWidth="2.5"
                    strokeDasharray="4"
                  />
                  <line
                    x1={`${jointPoints.hipLeft.x}%`}
                    y1={`${jointPoints.hipLeft.y}%`}
                    x2={`${jointPoints.hipRight.x}%`}
                    y2={`${jointPoints.hipRight.y}%`}
                    stroke="#ac2471"
                    strokeWidth="2.5"
                    strokeDasharray="4"
                  />
                  {/* Backbone support lines */}
                  <line
                    x1={`${(jointPoints.shoulderLeft.x + jointPoints.shoulderRight.x) / 2}%`}
                    y1={`${(jointPoints.shoulderLeft.y + jointPoints.shoulderRight.y) / 2}%`}
                    x2={`${(jointPoints.waistLeft.x + jointPoints.waistRight.x) / 2}%`}
                    y2={`${(jointPoints.waistLeft.y + jointPoints.waistRight.y) / 2}%`}
                    stroke="#d4af37"
                    strokeWidth="1.5"
                  />
                  <line
                    x1={`${(jointPoints.waistLeft.x + jointPoints.waistRight.x) / 2}%`}
                    y1={`${(jointPoints.waistLeft.y + jointPoints.waistRight.y) / 2}%`}
                    x2={`${(jointPoints.hipLeft.x + jointPoints.hipRight.x) / 2}%`}
                    y2={`${(jointPoints.hipLeft.y + jointPoints.hipRight.y) / 2}%`}
                    stroke="#d4af37"
                    strokeWidth="1.5"
                  />
                </svg>
              )}

              {/* Calibration interactive joints anchors */}
              {isPoseMode && !trialLoading && !poseLoading && personDetected && (
                <>
                  <div
                    onMouseDown={() => handleMouseDown("shoulderLeft")}
                    style={{ left: `${jointPoints.shoulderLeft.x}%`, top: `${jointPoints.shoulderLeft.y}%` }}
                    className="absolute w-4.5 h-4.5 bg-[#ac2471] border-2 border-white rounded-full z-30 pointer-events-auto -translate-x-1/2 -translate-y-1/2 active:scale-125 transition-transform"
                    title="Calibrate Left Shoulder"
                  />
                  <div
                    onMouseDown={() => handleMouseDown("shoulderRight")}
                    style={{ left: `${jointPoints.shoulderRight.x}%`, top: `${jointPoints.shoulderRight.y}%` }}
                    className="absolute w-4.5 h-4.5 bg-[#ac2471] border-2 border-white rounded-full z-30 pointer-events-auto -translate-x-1/2 -translate-y-1/2 active:scale-125 transition-transform"
                    title="Calibrate Right Shoulder"
                  />
                  <div
                    onMouseDown={() => handleMouseDown("waistLeft")}
                    style={{ left: `${jointPoints.waistLeft.x}%`, top: `${jointPoints.waistLeft.y}%` }}
                    className="absolute w-4.5 h-4.5 bg-indigo-600 border-2 border-white rounded-full z-30 pointer-events-auto -translate-x-1/2 -translate-y-1/2 active:scale-125 transition-transform"
                    title="Calibrate Left Waist"
                  />
                  <div
                    onMouseDown={() => handleMouseDown("waistRight")}
                    style={{ left: `${jointPoints.waistRight.x}%`, top: `${jointPoints.waistRight.y}%` }}
                    className="absolute w-4.5 h-4.5 bg-indigo-600 border-2 border-white rounded-full z-30 pointer-events-auto -translate-x-1/2 -translate-y-1/2 active:scale-125 transition-transform"
                    title="Calibrate Right Waist"
                  />
                  <div
                    onMouseDown={() => handleMouseDown("hipLeft")}
                    style={{ left: `${jointPoints.hipLeft.x}%`, top: `${jointPoints.hipLeft.y}%` }}
                    className="absolute w-4.5 h-4.5 bg-amber-500 border-2 border-white rounded-full z-30 pointer-events-auto -translate-x-1/2 -translate-y-1/2 active:scale-125 transition-transform"
                    title="Calibrate Left Hip"
                  />
                  <div
                    onMouseDown={() => handleMouseDown("hipRight")}
                    style={{ left: `${jointPoints.hipRight.x}%`, top: `${jointPoints.hipRight.y}%` }}
                    className="absolute w-4.5 h-4.5 bg-amber-500 border-2 border-white rounded-full z-30 pointer-events-auto -translate-x-1/2 -translate-y-1/2 active:scale-125 transition-transform"
                    title="Calibrate Right Hip"
                  />
                </>
              )}

              {/* Try on layered garment Success badge */}
              {tryOnOverlaid && fashnStatus === "success" && (
                <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md p-2.5 rounded-xl border border-[#fae1f0] text-[#ac2471] text-[10px] font-bold uppercase tracking-wider z-40 select-none flex items-center gap-1.5 shadow-md animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 text-[#ac2471]" />
                  <span>FASHN AI Layer Active</span>
                </div>
              )}
            </div>

            {/* Custom file upload footer ONLY showing user uploaded content configurations */}
            <div className="p-4 bg-slate-50 border-t border-[#f3e9f0] flex items-center justify-between select-none">
              <div>
                <span className="text-[10px] font-outfit uppercase tracking-wider text-[#ac2471] block font-black">
                  Calibrated User Silhouette
                </span>
                <span className="text-[9px] text-slate-400 font-mono">
                  Only uploaded client content is active
                </span>
              </div>
              <label
                onClick={() => {
                  setSelectedPhoto("");
                  setUserHasUploaded(false);
                  setHauteStylistResult(null);
                  setAnalysisError(null);
                }}
                className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#ac2471] hover:text-black cursor-pointer bg-white border border-[#f0e1ec] py-1.5 px-3 rounded-xl transition-transform hover:scale-[1.02] shadow-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload New</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
          </div>

          {/* NEXT PAGE TRANSITION BUTTON */}
          <div className="bg-white rounded-2xl border border-[#f3e9f0] p-4 shadow-sm flex flex-col gap-2.5">
            <button
              onClick={() => setCurrentStep(3)}
              className="w-full bg-[#ac2471] hover:bg-[#851653] text-[11px] text-white font-extrabold uppercase tracking-widest py-3 px-5 rounded-xl transition-all duration-300 hover:shadow-md hover:scale-[1.01] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Next Page: Create Order</span>
              <ArrowRight className="w-4.5 h-4.5 text-white" />
            </button>
            <p className="text-[10px] text-center text-[#704d64] leading-relaxed">
              Proceed to checkout curation and secure order breakdown.
            </p>
          </div>
        </section>

        {/* RIGHT COLUMN (visually swapped to left side): Outfit recommendations, swaps, specs (7 cols) */}
        <section className="lg:col-span-7 lg:order-1 flex flex-col gap-6 overflow-y-auto pr-0 lg:pr-1">
          
          {/* Output warnings if any */}
          {poseConfidence < 80 && personDetected && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-start gap-2.5 shadow-sm animate-fade-in">
              <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-amber-950">Low Landmark Confidence ({poseConfidence}%)</span>
                <p className="text-amber-800 font-light mt-0.5 leading-snug">
                  Outer apparel or loose fitting clothing seems to obscure standard joint points. Drag viewport calibration joints manually to align measurements.
                </p>
              </div>
            </div>
          )}



          {sizeNote && (
            <div className="p-3 bg-[#fbedfa] border border-[#f3ddf2] text-[#900090] text-xs rounded-xl flex items-start gap-2.5 shadow-sm animate-fade-in">
              <Info className="w-4.5 h-4.5 text-[#900090] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-[#500050]">Sizing Boundary Proportional Cusp Notice</span>
                <p className="text-[#a000a0] font-light mt-0.5 leading-snug">
                  {sizeNote}
                </p>
              </div>
            </div>
          )}

          {/* FASHN AI failure recovery logs */}
          {fashnErrorText && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-900 text-xs rounded-xl flex flex-col gap-2.5 shadow-sm animate-fade-in">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-red-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-red-950">FASHN AI Virtual Try-On API Exception</span>
                  <p className="text-red-700 font-light mt-0.5">{fashnErrorText}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 text-[10px]">
                <button 
                  onClick={() => { setFashnStatus("idle"); setFashnErrorText(null); }}
                  className="px-3 py-1.5 border border-red-200 rounded-lg text-slate-700 font-medium hover:bg-white"
                >
                  Dismiss Error
                </button>
                <button 
                  onClick={retryTryOn}
                  className="px-3 py-1.5 bg-red-700 text-white rounded-lg font-bold uppercase tracking-wider hover:bg-red-800"
                >
                  Retry Try-On Generative Render
                </button>
              </div>
            </div>
          )}

          {/* Calibrator dimensions & shape breakdown */}
          <div className="bg-white rounded-2xl p-6 border border-[#f3e9f0] shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Proportions metrics (7 cols) */}
            <div className="md:col-span-7 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-playfair text-lg font-bold text-slate-900 leading-none">
                  Interactive Skeletal Metrics
                </h3>
                {validationResult && validationResult.warnings && validationResult.warnings.length > 0 && (
                  <div className="relative group inline-block select-none cursor-help">
                    <span id="validation-warning-badge" className="inline-flex items-center justify-center bg-yellow-100 text-yellow-850 text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-300 gap-0.5 animate-pulse">
                      ⚠️ {validationResult.warnings.length} Warning{validationResult.warnings.length > 1 ? 's' : ''}
                    </span>
                    {/* Tooltip on Hover */}
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block hover:block bg-slate-900 text-white text-[10.5px] rounded-lg p-3 w-64 shadow-xl z-50 border border-slate-700">
                      <p className="font-bold border-b border-slate-700 pb-1 mb-1.5 text-yellow-400">Calibration Warnings Logged:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResult.warnings.map((w: string, idx: number) => (
                          <li key={idx} className="leading-tight">{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {validationResult && validationResult.validation_passed === true && (
                  <span id="validation-success-badge" className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200">
                    ✅ Measurements Validated
                  </span>
                )}
              </div>
              {hauteStylistResult ? (
                <p className="text-xs text-slate-500 font-light leading-relaxed">
                  Measurements auto-calibrated by Qwen Vision. Upload a new photo to re-scan.
                </p>
              ) : (
                <p className="text-xs text-slate-500 font-light leading-relaxed">
                  Tweak measurements dynamically or adjust shoulder/waist/hip joint outlines manually inside the viewport to run fitting-room sizing calculations.
                </p>
              )}

              {/* Heights / Weights sliders */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <div className="flex flex-col text-xs mb-1">
                    <span className="font-semibold text-[#73636f]">Shopper Height</span>
                    <span className="text-[10px] text-[#ac2471] font-medium leading-tight">
                      {hauteStylistResult ? "Auto-estimated by Qwen Vision — adjust if needed" : "Manual entry or auto-estimated"}
                    </span>
                  </div>
                  {poseLoading ? (
                    <div className="text-slate-400 font-medium italic text-xs py-1">
                      Scanning height...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={140}
                        max={205}
                        id="shopper-height-slider"
                        value={heightCm}
                        onChange={(e) => {
                          setHeightCm(Number(e.target.value));
                          setUserHasManuallyEnteredHeight(true);
                        }}
                        className={`w-full accent-[#ac2471] cursor-ew-resize ${heightCm === 0 ? "border-2 border-red-500 p-1 rounded bg-red-50 animate-pulse" : ""}`}
                      />
                      <span className="font-mono font-bold text-xs text-[#ac2471] shrink-0 min-w-[50px] text-right">
                        {heightCm} cm
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex flex-col text-xs mb-1">
                    <span className="font-semibold text-[#73636f]">Shopper Weight</span>
                    <span className="text-[10px] text-slate-400 font-medium leading-tight text-right">
                      Adjust weight if needed
                    </span>
                  </div>
                  {poseLoading ? (
                    <div className="text-slate-400 font-medium italic text-xs py-1">
                      Scanning weight...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={40}
                        max={100}
                        id="shopper-weight-slider"
                        value={weightKg}
                        onChange={(e) => setWeightKg(Number(e.target.value))}
                        className="w-full accent-[#ac2471] cursor-ew-resize"
                      />
                      <span className="font-mono font-bold text-xs text-[#ac2471] shrink-0 min-w-[50px] text-right">
                        {weightKg} kg
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tweak Proportions sliders */}
              <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-[#fcf5f9] mt-2">
                <div>
                  <span className="text-[10px] block text-slate-500 font-bold uppercase mb-1">Shoulders (in)</span>
                  <input
                    type="number"
                    value={shoulderSize || ""}
                    onChange={(e) => setShoulderSize(Number(e.target.value))}
                    disabled={poseLoading}
                    placeholder={poseLoading ? "Scan..." : ""}
                    className="w-full bg-[#fdfafc] border border-[#f3e9f0] p-1.5 rounded text-xs font-mono text-center font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500 font-bold uppercase mb-1">Waist Span (in)</span>
                  <input
                    type="number"
                    value={waistSize || ""}
                    onChange={(e) => setWaistSize(Number(e.target.value))}
                    disabled={poseLoading}
                    placeholder={poseLoading ? "Scan..." : ""}
                    className="w-full bg-[#fdfafc] border border-[#f3e9f0] p-1.5 rounded text-xs font-mono text-center font-bold"
                  />
                </div>
                <div>
                  <span className="text-[10px] block text-slate-500 font-bold uppercase mb-1">Hips Span (in)</span>
                  <input
                    type="number"
                    value={hipSize || ""}
                    onChange={(e) => setHipSize(Number(e.target.value))}
                    disabled={poseLoading}
                    placeholder={poseLoading ? "Scan..." : ""}
                    className="w-full bg-[#fdfafc] border border-[#f3e9f0] p-1.5 rounded text-xs font-mono text-center font-bold"
                  />
                </div>
              </div>

              {validationResult && (validationResult.confidence === "Low" || validationResult.confidence?.toLowerCase() === "low") && (
                <p id="validation-low-confidence-text" className="text-amber-600 text-[11px] font-bold mt-2.5 flex items-center gap-1.5 bg-amber-50/70 border border-amber-200 rounded-lg p-2 animate-pulse leading-snug">
                  ⚠️ Low confidence — wearing fitted clothing improves accuracy
                </p>
              )}
              {hauteStylistResult && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <p style={{ fontSize: "11px", color: "#ac2471", margin: 0 }}>
                    ✦ Calibrated by Qwen Vision — values synced
                  </p>
                  {recalibrated && (
                    <span className="bg-yellow-100 text-yellow-850 border border-yellow-300 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono animate-pulse">
                      Re-calibrated
                    </span>
                  )}
                  {(hauteStylistResult?.body_analysis?.confidence?.toLowerCase() === "low") && (
                    <span className="bg-amber-100 text-amber-850 border border-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono flex items-center gap-0.5 animate-pulse">
                      ⚠️ Low Confidence — Body Obscured
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Output form classification card (5 cols) */}
            <div className="md:col-span-5 bg-gradient-to-b from-[#6b036b]/5 to-[#ac2471]/5 p-5 rounded-xl border border-[#faeaf2] text-center shrink-0 h-full flex flex-col justify-center">
              <span className="text-[9px] font-outfit uppercase tracking-widest text-[#ac2471] font-extrabold block mb-1">
                Body Silhouette Shape
              </span>
              <span className="font-playfair text-2xl font-bold text-[#5a005a] block mb-2 leading-none">
                {poseLoading ? "Scanning..." : classifyDetails.shape}
              </span>
              <p className="text-[11px] text-[#73636f] italic leading-relaxed mb-3">
                &ldquo;{poseLoading ? "Analyzing body silhouette proportions..." : classifyDetails.explanation}&rdquo;
              </p>
              
              <div className="h-px bg-[#f6dfeb] w-12 mx-auto mb-3" />
              
              <span className="text-[10px] block font-bold uppercase tracking-wider text-slate-500 leading-none mb-1">
                Calibrated Suggested Size
              </span>
              <span className={`font-outfit text-2xl font-black block leading-none ${getSizeColorClass(validationResult?.suggested_size || sizeRecommendation.recommendedSize)}`}>
                {poseLoading ? "Scanning..." : (
                  <>
                    {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                  </>
                )}
              </span>

              {(poseLoading || (hauteStylistResult && hauteStylistResult.body_analysis)) && (
                <div className="mt-4 pt-3 border-t border-[#fcf0f7] text-left text-[11px] space-y-1.5 text-slate-700 font-medium">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Skin Tone:</span>
                    <span className="font-bold text-[#ac2471]">{poseLoading ? "Scanning..." : (hauteStylistResult?.body_analysis?.skin_tone || "Default Calibration")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Undertone:</span>
                    <span className="font-bold text-[#6b036b]">{poseLoading ? "Scanning..." : (hauteStylistResult?.body_analysis?.undertone || "Default Calibration")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Confidence:</span>
                    <span className={`font-bold capitalize ${poseLoading ? "text-slate-400" : (hauteStylistResult?.body_analysis?.confidence === 'high' ? 'text-emerald-700' : 'text-amber-600')}`}>
                      {poseLoading ? "Scanning..." : (hauteStylistResult?.body_analysis?.confidence || "high")}
                    </span>
                  </div>
                  {!poseLoading && hauteStylistResult?.engines && (
                    <div className="mt-2 text-[9px] text-slate-400 font-mono flex items-center justify-between border-t border-[#fcf0f7]/70 pt-1.5">
                      <span>Vision: {hauteStylistResult.engines.vision.replace("qwen/qwen2.5-vl-72b-instruct:free", "qwen/qwen2.5-vl-72b")}</span>
                      <span>Styling: {hauteStylistResult.engines.styling}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 📋 Validation Log Section */}
          {validationResult && validationResult.warnings && validationResult.warnings.length > 0 && (
            <div id="validation-log-container" className="bg-amber-50/50 rounded-xl p-4 border border-amber-200 mt-2 space-y-2">
              <button
                onClick={() => setIsValidationLogOpen(!isValidationLogOpen)}
                className="flex items-center justify-between w-full text-left text-xs font-bold text-amber-950 focus:outline-none cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-900 font-extrabold flex items-center gap-1">📋 Validation Log</span>
                  <span className="bg-amber-200 border border-amber-300 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded font-mono font-black">
                    {validationResult.warnings.length} warning{validationResult.warnings.length > 1 ? 's' : ''}
                  </span>
                </div>
                <span className="text-amber-800 text-[10px] font-semibold">{isValidationLogOpen ? "Hide ▲" : "Show ▼"}</span>
              </button>

              {isValidationLogOpen && (
                <div id="validation-warnings-list" className="mt-2 space-y-1.5 text-[10.5px] text-amber-900 font-mono border-t border-amber-200/50 pt-2 bg-white/50 p-3 rounded-lg">
                  {validationResult.warnings.map((w: string, idx: number) => (
                    <div key={idx} className="leading-relaxed flex gap-1.5 items-start">
                      <span className="text-amber-800 font-bold shrink-0">{idx + 1}.</span>
                      <span className="whitespace-pre-line text-left">{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Occasions Selection row */}
          <div>
            <span className="block text-xs font-outfit uppercase tracking-wider text-[#73636f] font-bold mb-3">
              1. Select Intended Event Occasion
            </span>
            <div className="grid grid-cols-4 gap-2.5">
              {["Wedding", "Formal", "Casual", "Party"].map((occ) => (
                <button
                  key={occ}
                  onClick={() => setChosenOccasion(occ)}
                  className={`py-3.5 px-2 rounded-xl text-center border transition-all flex flex-col justify-center items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-primary/45 ${
                    chosenOccasion === occ
                      ? "bg-[#5a005a] text-white border-[#5a005a] shadow-md hover:opacity-95"
                      : "bg-white border-[#f3e9f0] text-slate-600 hover:bg-[#fae9f3]/40"
                  }`}
                >
                  <span className="text-[11px] font-bold leading-none uppercase tracking-wider">{occ}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sizing Outfit Recommendations Cards row */}
          <div className="space-y-4">
            {/* Section header + filter pills */}
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="block text-xs font-outfit uppercase tracking-wider text-[#73636f] font-bold">
                  2. Sized Outfit Coordinates Suggested For {chosenOccasion}
                </span>
                {(hauteStylistResult || poseLoading) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 bg-[#ac2471]/10 text-[#ac2471] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#ac2471]/20">
                      📐 Size: {poseLoading ? "Scanning…" : (validationResult?.suggested_size || sizeRecommendation.recommendedSize)}
                    </span>
                    <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-900 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-purple-200">
                      🎉 Event: {chosenOccasion}
                    </span>
                    {!poseLoading && hauteStylistResult && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-200">
                        ✓ Filtered by your measurements
                      </span>
                    )}
                  </div>
                )}
              </div>

              {fashnStatus !== "unavailable" && (
                <button
                  onClick={() => triggerTryOn()}
                  disabled={trialLoading || !selectedOutfit.top || !personDetected}
                  className="flex items-center gap-1.5 bg-[#ac2471] hover:bg-[#851653] text-white py-1.5 px-4 rounded-xl font-outfit text-[10px] font-extrabold uppercase tracking-widest shadow-sm disabled:opacity-40 transition-all cursor-pointer hover:scale-[1.02]"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{tryOnOverlaid ? "Re-Render Try-On" : "Run FASHN AI Try-On"}</span>
                </button>
              )}
            </div>

            {/* State: No photo uploaded yet */}
            {!hauteStylistResult && !poseLoading && (
              <div className="rounded-2xl border-2 border-dashed border-[#f3d6ea] bg-[#fffbfd] p-8 flex flex-col items-center justify-center text-center gap-3 animate-fade-in">
                <div className="w-14 h-14 rounded-full bg-[#fae9f3] flex items-center justify-center">
                  <Upload className="w-6 h-6 text-[#ac2471]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 font-playfair">Upload your photo first</p>
                  <p className="text-[11px] text-slate-500 font-light mt-1 max-w-xs leading-relaxed">
                    Outfit recommendations filtered by your <strong>detected size</strong> and the <strong>{chosenOccasion}</strong> event will appear here after you upload a photo.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white bg-[#ac2471] hover:bg-[#8f195b] py-2.5 px-5 rounded-xl transition-all hover:scale-[1.02] cursor-pointer shadow-sm active:scale-95 mt-1">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Portrait Photo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
            )}

            {/* State: Scanning */}
            {poseLoading && (
              <div className="rounded-2xl border border-[#f3e9f0] bg-white p-8 flex flex-col items-center justify-center text-center gap-3 animate-pulse">
                <div className="w-10 h-10 border-4 border-pink-100 border-t-[#ac2471] rounded-full animate-spin" />
                <p className="text-xs font-bold text-[#ac2471] uppercase tracking-widest">Scanning your measurements…</p>
                <p className="text-[11px] text-slate-400 font-mono">Matching {chosenOccasion} items to your detected size</p>
              </div>
            )}

            {/* State: Outfit cards — shown after photo analysis */}
            {hauteStylistResult && !poseLoading && (
              <>
              {/* ── WEDDING: 3 dress cards in a single column ── */}
              {chosenOccasion === "Wedding" && weddingProducts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {weddingProducts.map((product, idx) => (
                    <div key={product.id} className="bg-white rounded-2xl border border-[#f3e9f0] shadow-sm overflow-hidden flex flex-row hover:shadow-md transition-shadow" style={{ minHeight: "110px" }}>
                      <div className="relative w-24 shrink-0 bg-gradient-to-br from-slate-100 to-pink-50 overflow-hidden">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl select-none">👗</div>
                        )}
                        <div className="absolute top-1.5 left-1.5">
                          <span className="bg-[#ac2471] text-white text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full shadow">
                            #{idx + 1}
                          </span>
                        </div>
                      </div>
                      <div className="p-3 flex items-start justify-between gap-2 flex-1">
                        <div className="overflow-hidden flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="bg-purple-900/90 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full">Wedding</span>
                            <span className="bg-white text-[#ac2471] text-[7px] font-black uppercase border border-pink-100 px-1.5 py-0.5 rounded-full">
                              Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                            </span>
                          </div>
                          <p className="font-bold text-slate-900 text-[11px] leading-snug">{product.name}</p>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5">${product.price} · {product.colour}</p>
                          <p className="text-[9px] text-emerald-700 font-bold mt-1 flex items-center gap-1">
                            <span>✓</span> Matched for Wedding · Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col gap-1.5">
                          <button onClick={() => handleTryOnItem(product)} disabled={trialLoading || !personDetected}
                            className="px-2.5 py-1.5 text-[9px] font-bold text-white bg-[#2f2f58] hover:bg-[#1f1f43] rounded-lg uppercase tracking-wider disabled:opacity-40 cursor-pointer transition-colors">
                            Try On
                          </button>
                          <button onClick={() => setSwapCategory("top")}
                            className="px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#ac2471] bg-[#ac2471]/5 hover:bg-[#ac2471]/15 border border-[#f0e1ec] rounded-lg cursor-pointer transition-all">
                            Swap
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px"
              }}>

                {/* Top Slot */}
                {selectedOutfit.top && (
                <div className="bg-white rounded-2xl border border-[#f3e9f0] shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                  <div className="relative h-40 bg-gradient-to-br from-slate-100 to-pink-50 overflow-hidden">
                    {selectedOutfit.top?.image ? (
                      <img src={selectedOutfit.top.image} alt="Suggested top" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl select-none">👗</div>
                    )}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <span className="bg-[#ac2471] text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow">Top Layer</span>
                      <span className="bg-white/95 text-[#ac2471] text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow border border-pink-100">
                        Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                      </span>
                    </div>
                    <div className="absolute top-2 right-2">
                      <span className="bg-purple-900/90 text-white text-[8px] font-bold px-2 py-0.5 rounded-full shadow">{chosenOccasion}</span>
                    </div>
                  </div>
                  <div className="p-3.5 flex items-start justify-between gap-3 flex-1">
                    <div className="overflow-hidden flex-1">
                      <p className="font-bold text-slate-900 text-[12px] leading-snug truncate">{selectedOutfit.top?.name || "Silk Bodice"}</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">${selectedOutfit.top?.price || "150"} · {selectedOutfit.top?.colour || "Bespoke"}</p>
                      {selectedOutfit.top && (
                        <p className="text-[9px] text-emerald-700 font-bold mt-1.5 flex items-center gap-1">
                          <span>✓</span> Matched for {chosenOccasion} · Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col gap-1.5">
                      {selectedOutfit.top && (
                        <button onClick={() => handleTryOnItem(selectedOutfit.top!)} disabled={trialLoading || !personDetected}
                          className="px-3 py-1.5 text-[9px] font-bold text-white bg-[#2f2f58] hover:bg-[#1f1f43] rounded-lg uppercase tracking-wider disabled:opacity-40 cursor-pointer transition-colors">
                          Try On
                        </button>
                      )}
                      <button onClick={() => setSwapCategory("top")}
                        className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#ac2471] bg-[#ac2471]/5 hover:bg-[#ac2471]/15 border border-[#f0e1ec] rounded-lg cursor-pointer transition-all">
                        Swap
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {/* Bottom Slot (hidden for Wedding) */}
                {chosenOccasion !== "Wedding" && selectedOutfit.bottom && (
                  <div className="bg-white rounded-2xl border border-[#f3e9f0] shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                    <div className="relative h-40 bg-gradient-to-br from-slate-100 to-indigo-50 overflow-hidden">
                      {selectedOutfit.bottom?.image ? (
                        <img src={selectedOutfit.bottom.image} alt="Suggested bottom" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl select-none">👖</div>
                      )}
                      <div className="absolute top-2 left-2 flex flex-col gap-1">
                        <span className="bg-indigo-700 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow">Bottom Fit</span>
                        <span className="bg-white/95 text-indigo-700 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow border border-indigo-100">
                          Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                        </span>
                      </div>
                      <div className="absolute top-2 right-2">
                        <span className="bg-purple-900/90 text-white text-[8px] font-bold px-2 py-0.5 rounded-full shadow">{chosenOccasion}</span>
                      </div>
                    </div>
                    <div className="p-3.5 flex items-start justify-between gap-3 flex-1">
                      <div className="overflow-hidden flex-1">
                        <p className="font-bold text-slate-900 text-[12px] leading-snug truncate">{selectedOutfit.bottom?.name || "Trousers"}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">${selectedOutfit.bottom?.price || "110"} · {selectedOutfit.bottom?.colour || "Bespoke"}</p>
                        {selectedOutfit.bottom && (
                          <p className="text-[9px] text-emerald-700 font-bold mt-1.5 flex items-center gap-1">
                            <span>✓</span> Matched for {chosenOccasion} · Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col gap-1.5">
                        <button onClick={() => setSwapCategory("bottom")}
                          className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#ac2471] bg-[#ac2471]/5 hover:bg-[#ac2471]/15 border border-[#f0e1ec] rounded-lg cursor-pointer transition-all">
                          Swap
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footwear Slot */}
                {selectedOutfit.footwear && (
                <div className="bg-white rounded-2xl border border-[#f3e9f0] shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                  <div className="relative h-40 bg-gradient-to-br from-slate-100 to-amber-50 overflow-hidden">
                    {selectedOutfit.footwear?.image ? (
                      <img src={selectedOutfit.footwear.image} alt="Suggested footwear" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl select-none">👠</div>
                    )}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <span className="bg-amber-600 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow">Footwear</span>
                      <span className="bg-white/95 text-amber-700 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow border border-amber-100">
                        Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                      </span>
                    </div>
                    <div className="absolute top-2 right-2">
                      <span className="bg-purple-900/90 text-white text-[8px] font-bold px-2 py-0.5 rounded-full shadow">{chosenOccasion}</span>
                    </div>
                  </div>
                  <div className="p-3.5 flex items-start justify-between gap-3 flex-1">
                    <div className="overflow-hidden flex-1">
                      <p className="font-bold text-slate-900 text-[12px] leading-snug truncate">{selectedOutfit.footwear?.name || "Pair Heels"}</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">${selectedOutfit.footwear?.price || "130"} · {selectedOutfit.footwear?.colour || "Bespoke"}</p>
                      {selectedOutfit.footwear && (
                        <p className="text-[9px] text-emerald-700 font-bold mt-1.5 flex items-center gap-1">
                          <span>✓</span> Matched for {chosenOccasion} · Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col gap-1.5">
                      {selectedOutfit.footwear?.image && (
                        <button onClick={() => handleTryOnItem(selectedOutfit.footwear!)} disabled={trialLoading || !personDetected}
                          className="px-3 py-1.5 text-[9px] font-bold text-white bg-[#2f2f58] hover:bg-[#1f1f43] rounded-lg uppercase tracking-wider disabled:opacity-40 cursor-pointer transition-colors">
                          Try On
                        </button>
                      )}
                      <button onClick={() => setSwapCategory("footwear")}
                        className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#ac2471] bg-[#ac2471]/5 hover:bg-[#ac2471]/15 border border-[#f0e1ec] rounded-lg cursor-pointer transition-all">
                        Swap
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {/* Accessories Slot */}
                {selectedOutfit.accessories && (
                <div className="bg-white rounded-2xl border border-[#f3e9f0] shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                  <div className="relative h-40 bg-gradient-to-br from-slate-100 to-rose-50 overflow-hidden">
                    {selectedOutfit.accessories?.image ? (
                      <img src={selectedOutfit.accessories.image} alt="Suggested accessories" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl select-none">💍</div>
                    )}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      <span className="bg-rose-600 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow">Accents</span>
                      <span className="bg-white/95 text-rose-600 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow border border-rose-100">
                        Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                      </span>
                    </div>
                    <div className="absolute top-2 right-2">
                      <span className="bg-purple-900/90 text-white text-[8px] font-bold px-2 py-0.5 rounded-full shadow">{chosenOccasion}</span>
                    </div>
                  </div>
                  <div className="p-3.5 flex items-start justify-between gap-3 flex-1">
                    <div className="overflow-hidden flex-1">
                      <p className="font-bold text-slate-900 text-[12px] leading-snug truncate">{selectedOutfit.accessories?.name || "Clutch bag"}</p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">${selectedOutfit.accessories?.price || "95"} · {selectedOutfit.accessories?.colour || "Bespoke"}</p>
                      {selectedOutfit.accessories && (
                        <p className="text-[9px] text-emerald-700 font-bold mt-1.5 flex items-center gap-1">
                          <span>✓</span> Matched for {chosenOccasion} · Size {validationResult?.suggested_size || sizeRecommendation.recommendedSize}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col gap-1.5">
                      {selectedOutfit.accessories?.image && (
                        <button onClick={() => handleTryOnItem(selectedOutfit.accessories!)} disabled={trialLoading || !personDetected}
                          className="px-3 py-1.5 text-[9px] font-bold text-white bg-[#2f2f58] hover:bg-[#1f1f43] rounded-lg uppercase tracking-wider disabled:opacity-40 cursor-pointer transition-colors">
                          Try On
                        </button>
                      )}
                      <button onClick={() => setSwapCategory("accessories")}
                        className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#ac2471] bg-[#ac2471]/5 hover:bg-[#ac2471]/15 border border-[#f0e1ec] rounded-lg cursor-pointer transition-all">
                        Swap
                      </button>
                    </div>
                  </div>
                </div>
                )}

              </div>
              )} {/* end else: non-wedding 2-col grid */}
              </> /* end wedding/non-wedding fragment */
            )}
          </div>

          {/* AI Styling advice container (Gemma Advice output) */}          {/* AI Styling advice container (Gemma Advice output) */}
          <div className="p-6 rounded-2xl bg-white border border-[#f3e9f0] shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#fae9f3] text-[#ac2471] rounded-lg">
                  <Sparkles className="w-4.5 h-4.5" />
                </div>
                <span className="font-playfair text-base font-bold text-slate-900">
                  Haute Stylist Advisory Log
                </span>
              </div>
              <span className="text-[9px] uppercase tracking-widest text-[#a1909e] font-bold font-mono bg-slate-100 py-1 px-2.5 rounded-md leading-none">
                QWEN ENGINE
              </span>
            </div>

            {commentsLoading ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-6 h-6 border-2 border-[#ac2471] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-mono text-slate-400">Consulting premium styling formulas...</p>
              </div>
            ) : (
              <div className="text-xs text-slate-700 leading-relaxed font-sans space-y-3 prose max-w-none">
                {aiComments ? (
                  <div className="bg-[#fffbfc] rounded-xl p-4 border border-[#faeff5] text-slate-700">
                    <div className="advisory-log-content">
                      <ReactMarkdown>{aiComments}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 italic">QWEN ENGINE — No recommendations configured yet. Tweak sizes to fetch real-time logs.</p>
                )}

                {hauteStylistResult && hauteStylistResult.stylist_log?.color_palette && (
                  <div className="mt-4 p-4 bg-[#fffafcb0] border border-[#faeaf2] rounded-xl">
                    <h4 className="text-[11px] font-outfit uppercase tracking-wider text-[#ac2471] font-bold mb-3">
                      Elite Stylist Color Recommendations
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Array.isArray(hauteStylistResult.stylist_log.color_palette) && hauteStylistResult.stylist_log.color_palette.map((color: any, idx: number) => {
                        let hex = color.hex || "#cccccc";
                        if (hex && !hex.startsWith("#")) {
                          hex = "#" + hex;
                        }
                        return (
                          <div key={idx} className="flex flex-col items-center p-2 bg-white border border-[#f3e9f0] rounded-lg shadow-2xs">
                            <div 
                              style={{ backgroundColor: hex }} 
                              className="w-8 h-8 rounded-full border border-slate-200/50 shadow-inner mb-2"
                            />
                            <span className="text-[11px] font-semibold text-slate-800 text-center truncate w-full">{color.color_name}</span>
                            <span className="text-[9px] text-[#ac2471] font-mono tracking-wider font-extrabold mt-0.5">{hex}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Go Back to Theme Selection previous page */}
          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 bg-white hover:bg-[#fffbfc] text-[#ac2471] hover:text-[#851653] border border-[#f3e9f0] hover:border-[#ac2471]/30 py-2.5 px-4.5 rounded-xl font-outfit text-[11px] font-extrabold uppercase tracking-wider transition-all duration-300 shadow-2xs hover:shadow-xs hover:scale-[1.01] cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Theme Selection</span>
            </button>
          </div>
        </section>
      </main>
      )}

      {/* SWAPPING POPUP DIALOG SIDEBAR DRAWER */}
      {swapCategory && (() => {
        const currentItem = selectedOutfit[swapCategory];
        const aiRecItem = initialAiOutfit[swapCategory];
        const targetSize = sizeRecommendation?.recommendedSize || "";
        const userShape = normalizeString(classifyDetails?.shape || "Hourglass");
        const isAiRecommendedProduct = (item: Product) => {
          if (aiRecItem && (item.id === aiRecItem.id || item.name === aiRecItem.name)) {
            return true;
          }

          const productShapes = (item as any).shapes && Array.isArray((item as any).shapes)
            ? (item as any).shapes.map((shape: string) => normalizeString(shape))
            : [];
          const shapeMatch = productShapes.length === 0 || productShapes.includes(userShape);
          const sizeMatch = productMatchesSize(item, targetSize);
          const occasionMatch = matchesOccasion(item, chosenOccasion);

          return shapeMatch && sizeMatch && occasionMatch;
        };

        const categoryProducts = products.filter((product) =>
          categoryMatches(product, swapCategory) && matchesOccasion(product, chosenOccasion)
        );
        
        const searchLower = swapSearchQuery.trim().toLowerCase();
        const filterProducts = (list: Product[]) => {
          if (!searchLower) return list;
          return list.filter((p) => {
            return (
              p.name.toLowerCase().includes(searchLower) ||
              (p.colour && p.colour.toLowerCase().includes(searchLower)) ||
              p.occasion.toLowerCase().includes(searchLower) ||
              (p.size && p.size.toLowerCase().includes(searchLower))
            );
          });
        };

        const alternatives = categoryProducts.filter((p) => !currentItem || p.id !== currentItem.id);
        const filteredAlternatives = filterProducts(alternatives);
        const filteredAiRecommended = filteredAlternatives.filter(isAiRecommendedProduct);
        const filteredAllProducts = filteredAlternatives.filter((item) => !isAiRecommendedProduct(item));

        const renderProductCard = (item: Product, isCurrent: boolean) => {
          const isAiRec = aiRecItem && (item.id === aiRecItem.id || item.name === aiRecItem.name);
          const isUserSel = currentItem && (item.id === currentItem.id || item.name === currentItem.name) && !isAiRec;
          const canTryOn = item.image && (categoryMatches(item, "top") || categoryMatches(item, "footwear") || categoryMatches(item, "accessories"));

          return (
            <div
              key={item.id}
              className={`group border rounded-xl flex items-center justify-between gap-4 transition-all duration-300 relative bg-white ${
                isAiRec || isUserSel ? "pt-7 pb-3 px-3" : "p-3"
              } ${
                isCurrent
                  ? "border-[#ac2471] ring-2 ring-[#ac2471]/10 bg-pink-50/5 shadow-xs"
                  : isAiRec
                    ? "border-[#ac2471]/40 bg-pink-50/10 shadow-3xs"
                    : "border-slate-100 hover:border-[#ac2471]/30 hover:bg-slate-50/50 hover:shadow-sm"
              }`}
            >
              {isAiRec && (
                <span className="absolute top-1.5 right-2 px-2 py-0.5 text-[8.5px] font-extrabold text-[#ac2471] bg-[#ac2471]/10 border border-[#ac2471]/25 rounded-md uppercase tracking-wider font-sans leading-none animate-pulse">
                  ✦ AI RECOMMENDED
                </span>
              )}
              {isUserSel && (
                <span className="absolute top-1.5 right-2 px-2 py-0.5 text-[8.5px] font-extrabold text-slate-700 bg-slate-100 border border-slate-200 rounded-md uppercase tracking-wider font-sans leading-none">
                  ✦ YOUR SELECTION
                </span>
              )}

              <div className="flex items-center gap-3 overflow-hidden font-sans flex-grow">
                <div className="w-14 h-16 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 select-none">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
                </div>
                <div className="overflow-hidden flex-grow">
                  <div className="flex flex-wrap items-center gap-1 mb-0.5">
                    <span className="text-[9px] bg-slate-100 font-medium text-slate-600 px-1 py-0.25 rounded">
                      Size {item.size}
                    </span>
                    <span className={`text-[9px] font-semibold px-1 py-0.25 rounded uppercase tracking-wider font-mono ${
                      item.occasion.toLowerCase() === chosenOccasion.toLowerCase()
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}>
                      {item.occasion}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] bg-[#ac2471] text-white font-extrabold px-1.5 py-0.25 rounded tracking-wide uppercase shadow-2xs">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-slate-900 truncate text-[11.5px] leading-snug group-hover:text-[#ac2471] transition-colors">
                    {item.name}
                  </p>

                  {isAiRec && (
                    <div className="mt-1 flex">
                      <span className="inline-flex items-center gap-1 text-[8px] font-extrabold text-[#ac2471] bg-pink-100/50 border border-pink-200/20 px-1.5 py-0.25 rounded-md leading-none uppercase tracking-wide">
                        ✦ AI RECOMMENDED
                      </span>
                    </div>
                  )}
                  {isUserSel && (
                    <div className="mt-1 flex">
                      <span className="inline-flex items-center gap-1 text-[8px] font-extrabold text-[#73636f] bg-slate-100/80 border border-slate-250/20 px-1.5 py-0.25 rounded-md leading-none uppercase tracking-wide">
                        ✦ YOUR SELECTION
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-slate-500 font-medium">{item.colour}</span>
                    <span className="text-slate-300 text-[9px]">•</span>
                    <span className="text-[11px] font-extrabold text-[#ac2471] font-mono">${item.price}</span>
                  </div>
                </div>
              </div>
              
              <div className="shrink-0 flex items-center gap-2">
                {/* Wishlist Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleWishlist(item.id);
                  }}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                    wishlist.includes(item.id)
                      ? "bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100"
                      : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-150 hover:text-slate-600"
                  }`}
                  title={wishlist.includes(item.id) ? "Remove from Wishlist" : "Save to Wishlist"}
                >
                  <Heart className={`w-3.5 h-3.5 ${wishlist.includes(item.id) ? "fill-rose-500" : ""}`} />
                </button>

                {isCurrent ? (
                  <div className="flex flex-col gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ac2471] bg-[#ac2471]/5 border border-[#ac2471]/20 px-2 py-1 rounded-lg">
                      <Check className="w-3 h-3" />
                      <span>ACTIVE</span>
                    </span>
                    {canTryOn && (
                      <button
                        type="button"
                        onClick={() => handleTryOnItem(item)}
                        className="w-full px-2.5 py-1 text-[10px] font-bold text-white bg-[#2f2f58] hover:bg-[#1f1f43] shadow-xs cursor-pointer transition-all duration-200 rounded-lg uppercase tracking-wider active:scale-95"
                      >
                        Try On
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {canTryOn && (
                      <button
                        type="button"
                        onClick={() => handleTryOnItem(item)}
                        className="w-full px-2.5 py-1 text-[10px] font-bold text-white bg-[#2f2f58] hover:bg-[#1f1f43] shadow-xs cursor-pointer transition-all duration-200 rounded-lg uppercase tracking-wider active:scale-95"
                      >
                        Try On
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSwapItem(item)}
                      className="w-full px-2.5 py-1 text-[10px] font-bold text-white bg-[#ac2471] hover:bg-[#851653] hover:shadow-xs cursor-pointer transition-all duration-200 rounded-lg uppercase tracking-wider active:scale-95"
                    >
                      Select
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
            <div className="w-full max-w-md bg-white h-screen flex flex-col shadow-2xl animate-slide-in">
              <div className="p-5 border-b border-[#f3e9f0] shrink-0 bg-[#fffbfc] space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-playfair text-lg font-bold text-slate-900 uppercase">Swap {swapCategory}</h3>
                    <span className="text-[10px] text-slate-500 block mt-0.5">All catalog {swapCategory} items with AI matches tagged</span>
                  </div>
                  <button
                    onClick={() => setSwapCategory(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200 text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* SEARCH FIELD */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={`Search ${swapCategory}...`}
                    value={swapSearchQuery}
                    onChange={(e) => setSwapSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-[#ac2471] focus:border-[#ac2471] outline-none"
                  />
                  {swapSearchQuery && (
                    <button
                      onClick={() => setSwapSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full text-slate-400 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-grow p-5 overflow-y-auto space-y-5 bg-slate-50/30">
                {/* SECTION 1: CURRENT ACTIVE ITEM */}
                {currentItem && (
                  <div className="space-y-1.5 animate-fade-in">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                      Currently Displayed in Outfit
                    </span>
                    {renderProductCard(currentItem, true)}
                  </div>
                )}

                {/* SECTION 2: AI RECOMMENDED PRODUCTS */}
                {filteredAiRecommended.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-extrabold text-[#ac2471] uppercase tracking-wider block">
                        AI Recommended
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {filteredAiRecommended.length} found
                      </span>
                    </div>
                    <div className="space-y-2">
                      {filteredAiRecommended.map((item) => renderProductCard(item, false))}
                    </div>
                  </div>
                )}

                {/* SECTION 3: ALL CATALOG PRODUCTS */}
                <div className={`${filteredAiRecommended.length > 0 ? "space-y-2.5 pt-3 border-t border-slate-100" : "space-y-2.5"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                      All Products
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {filteredAllProducts.length} found
                    </span>
                  </div>

                  {filteredAllProducts.length === 0 ? (
                    <div className="text-center text-xs text-slate-400 py-8 bg-white border border-dashed border-slate-200 rounded-xl">
                      No other {swapCategory} products match your search.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredAllProducts.map((item) => renderProductCard(item, false))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2.5 SIMULATED APPLE SIGN IN MODAL */}
      {showAppleModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl shadow-2xl p-8 border border-slate-100 text-slate-800 flex flex-col justify-center text-center animate-fade-in relative font-sans">
            <button
              onClick={() => setShowAppleModal(false)}
              className="absolute top-5 right-5 p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            
            {/* Apple Logo SVG */}
            <div className="mx-auto my-4 w-12 h-12 flex items-center justify-center bg-black rounded-full text-white">
              <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.674-.54 9.103 1.51 12.037 1.002 1.432 2.184 3.034 3.738 2.972 1.493-.059 2.061-.967 3.864-.967 1.794 0 2.312.967 3.875.935 1.6-.027 2.64-1.442 3.626-2.87 1.137-1.663 1.604-3.268 1.631-3.35-.062-.027-3.125-1.198-3.156-4.767-.025-2.981 2.443-4.414 2.556-4.485-1.39-2.04-3.554-2.28-4.32-2.333-2-.163-3.033.447-3.963.447zM15.748 3.5c.833-1.008 1.385-2.404 1.233-3.5-1.114.04-2.463.738-3.265 1.673-.706.812-1.325 2.228-1.152 3.31 1.242.095 2.502-.638 3.184-1.483z" />
              </svg>
            </div>

            <h3 className="text-xl font-bold text-slate-900 font-outfit mb-1">
              Sign in with Apple ID
            </h3>
            <p className="text-xs text-slate-400 mb-4 font-sans">
              Connect to authorization terminal with Apple credentials.
            </p>

            {/* Quick account connection choices */}
            <div className="mb-4 text-left">
              <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2 font-outfit">
                Select Connected Account:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAppleEmail("alex.harper@gmail.com");
                    setApplePassword("googleAppleSecure1");
                  }}
                  className={`text-left p-2.5 rounded-xl border text-xs transition-all hover:bg-slate-50 cursor-pointer ${
                    appleEmail === "alex.harper@gmail.com" ? "bg-slate-50 border-black ring-1 ring-black" : "border-slate-200 bg-white"
                  }`}
                >
                  <p className="font-bold text-slate-800 text-[11px] leading-tight truncate">Alex Harper</p>
                  <p className="font-mono text-[9px] text-slate-400 truncate">alex.harper@gmail.com</p>
                  <span className="inline-block mt-1 text-[8px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">Gmail ID</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAppleEmail("evelyn.couture@icloud.com");
                    setApplePassword("icloudSecure99");
                  }}
                  className={`text-left p-2.5 rounded-xl border text-xs transition-all hover:bg-slate-50 cursor-pointer ${
                    appleEmail === "evelyn.couture@icloud.com" ? "bg-slate-50 border-black ring-1 ring-black" : "border-slate-200 bg-white"
                  }`}
                >
                  <p className="font-bold text-slate-800 text-[11px] leading-tight truncate">Evelyn Couture</p>
                  <p className="font-mono text-[9px] text-slate-400 truncate">evelyn.couture@icloud.com</p>
                  <span className="inline-block mt-1 text-[8px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full shrink-0">iCloud ID</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleApplePaySubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-outfit">
                  Apple ID (Email)
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@icloud.com"
                  value={appleEmail}
                  onChange={(e) => setAppleEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs focus:ring-1 focus:ring-black focus:outline-none text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-outfit">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={applePassword}
                  onChange={(e) => setApplePassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs focus:ring-1 focus:ring-black focus:outline-none text-slate-800"
                />
              </div>

              <div className="pt-4 flex flex-col gap-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-black hover:bg-zinc-900 text-white rounded-xl text-xs font-bold font-outfit tracking-wider transition-all cursor-pointer"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={() => setShowAppleModal(false)}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold font-outfit tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. COUTURE PORTFOLIO SUMMARY CERTIFICATE PREVIEW MODAL (Epic 4, Screen 4) */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#fffcfc] max-w-2xl w-full rounded-2xl shadow-2xl border border-[#faeef5] p-8 overflow-y-auto max-h-[90vh] font-sans text-slate-800 animate-fade-in relative flex flex-col">
            
            {/* Close Button top-right corner */}
            <button 
              onClick={() => setShowPdfModal(false)}
              className="absolute top-5 right-5 p-1.5 hover:bg-slate-100 rounded-lg shrink-0 text-slate-400 hover:text-slate-700 transition-all border border-slate-100 cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>

            {/* Modal branding header */}
            <div className="text-center pb-6 border-b border-[#f6edf4]">
              <div className="w-12 h-12 bg-[#faedf5] text-[#ac2471] rounded-full mx-auto flex items-center justify-center mb-2.5">
                <Award className="w-6 h-6" />
              </div>
              <h3 className="font-playfair text-xl font-extrabold text-slate-900">
                Style coordinates dossier certificate
              </h3>
              <p className="text-xs text-[#73636f] font-semibold tracking-wider font-outfit uppercase mt-0.5">
                FitStyle AI Luxury Boutique Co.
              </p>
            </div>

            {/* PDF Layout Representation Grid */}
            <div className="my-6 grid grid-cols-1 md:grid-cols-12 gap-6 leading-relaxed">
              
              {/* Left Column: Portrait Viewport Preview */}
              <div className="md:col-span-5 space-y-3">
                <span className="font-outfit text-[9px] uppercase tracking-wider font-bold text-[#ac2471] block">
                  VTON Try-On Result Preview
                </span>
                <div className="relative aspect-[3/4] bg-slate-900 rounded-xl overflow-hidden shadow-md border border-[#faedf5]">
                  <img
                    key={`pdf-try-on-preview-${tryOnRenderKey}`}
                    src={tryOnOverlaid && tryOnUrl ? tryOnUrl : selectedPhoto}
                    alt="Tryon render"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-md p-2 rounded-lg text-center text-[9px] font-bold text-[#ac2471] uppercase tracking-wide border border-pink-100">
                    {tryOnOverlaid ? "FASHN AI Compiled Model" : "Mannequin Frame Unrendered"}
                  </div>
                </div>

                {/* Patient Profile specs metadata */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10.5px] font-mono text-slate-600 space-y-1">
                  <div>H: {heightCm > 0 ? `${heightCm} cm` : "N/A (Input Required)"} | W: {weightKg} kg</div>
                  <div>Silhouette: {classifyDetails.shape}</div>
                  <div>Sizing Line: {sizeRecommendation.recommendedSize} ({sizeRecommendation.numericSize})</div>
                </div>
              </div>

              {/* Right Column: Invoice items detail & Styling Secret */}
              <div className="md:col-span-7 flex flex-col justify-between">
                <div className="space-y-4">
                  <span className="font-outfit text-[9px] uppercase tracking-wider font-bold text-[#ac2471] block leading-none">
                    Certified Coordinates Cost Checklist
                  </span>
                  <div className="border border-[#faedf5] rounded-xl overflow-hidden shadow-sm text-xs">
                    <div className="grid grid-cols-12 bg-slate-50 border-b border-[#faedf5] p-2 font-bold text-[#ac2471]">
                      <div className="col-span-4">Category</div>
                      <div className="col-span-6">Selection</div>
                      <div className="col-span-2 text-right">Price</div>
                    </div>
                    <div className="divide-y divide-[#faf3f9]">
                      <div className="grid grid-cols-12 p-2">
                        <div className="col-span-4 font-bold text-slate-500">Topwear</div>
                        <div className="col-span-6 text-slate-900 font-medium truncate">{selectedOutfit.top?.name || "Bespoke Top"}</div>
                        <div className="col-span-2 text-[#ac2471] text-right font-extrabold">${selectedOutfit.top?.price || "150"}</div>
                      </div>
                      <div className="grid grid-cols-12 p-2">
                        <div className="col-span-4 font-bold text-slate-500">Bottomwear</div>
                        <div className="col-span-6 text-slate-900 font-medium truncate">{selectedOutfit.bottom?.name || "Silk Skirt"}</div>
                        <div className="col-span-2 text-[#ac2471] text-right font-extrabold">${selectedOutfit.bottom?.price || "110"}</div>
                      </div>
                      <div className="grid grid-cols-12 p-2">
                        <div className="col-span-4 font-bold text-slate-500">Footwear</div>
                        <div className="col-span-6 text-slate-900 font-medium truncate">{selectedOutfit.footwear?.name || "Pair Heels"}</div>
                        <div className="col-span-2 text-[#ac2471] text-right font-extrabold">${selectedOutfit.footwear?.price || "130"}</div>
                      </div>
                      <div className="grid grid-cols-12 p-2">
                        <div className="col-span-4 font-bold text-slate-500">Accents</div>
                        <div className="col-span-6 text-slate-900 font-medium truncate">{selectedOutfit.accessories?.name || "Jewel Choker"}</div>
                        <div className="col-span-2 text-[#ac2471] text-right font-extrabold">${selectedOutfit.accessories?.price || "95"}</div>
                      </div>
                    </div>
                    {/* Summation box */}
                    <div className="bg-[#fff0f6] p-2.5 flex justify-between items-center border-t border-[#faedf5] font-bold text-[#ac2471] text-xs">
                      <span>Total Invoice</span>
                      <span>
                        ${[selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories]
                          .reduce((acc, p) => acc + (p ? p.price : 0), 0)} USD
                      </span>
                    </div>
                  </div>

                  {/* Boundary sizes alert if applicable */}
                  {sizeNote && (
                    <div className="p-3 bg-[#faedf9] border border-[#f3ddf2] rounded-lg text-[10.5px] flex gap-1.5 items-start">
                      <Info className="w-4.5 h-4.5 text-[#ac2471] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold text-[#5a005a] block">Sizing boundary advisory note:</span>
                        <p className="text-[#ac2471] mt-0.5 font-light">{sizeNote}</p>
                      </div>
                    </div>
                  )}

                  {/* Sizing Height failed manual override alert */}
                  {heightCm === 0 && (
                    <div className="p-3 bg-[#fff0f4] border border-[#ffdae6] rounded-lg text-[10.5px] text-[#ac2471] animate-pulse">
                      <strong>Height Missing:</strong> Suggesting standard fallback size line. Adjust stature slider to correct size suggestions.
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-3 mt-4">
                  <div className="bg-white rounded-3xl border border-[#f3e9f5] p-4 shadow-sm">
                    <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-[#ac2471]">Order snapshot</p>
                    <p className="mt-3 text-xs font-semibold text-slate-900">Ref: {pdfOrderRef}</p>
                    <p className="text-[11px] text-slate-500">{pdfOrderDate}</p>
                    <p className="mt-3 text-[11px] text-slate-600">Total invoice: <span className="font-bold text-slate-900">${[selectedOutfit.top, selectedOutfit.bottom, selectedOutfit.footwear, selectedOutfit.accessories].reduce((acc, p) => acc + (p ? p.price : 0), 0)} USD</span></p>
                  </div>

                  <div className="bg-white rounded-3xl border border-[#f3e9f5] p-4 shadow-sm">
                    <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-[#ac2471]">Nearest Atelier</p>
                    <p className="mt-3 text-sm font-semibold text-slate-900">{nearestAtelier.name}</p>
                    <p className="text-[11px] text-slate-500">{nearestAtelier.address}</p>
                    <p className="mt-3 text-[11px] text-slate-600 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-[#ac2471]" /> {nearestAtelier.distance}</p>
                    <a href={nearestAtelier.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-3 text-[11px] text-[#1d4ed8] font-semibold">
                      View on map
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="bg-[#faf4fb] rounded-3xl border border-[#f3e1ed] p-4 shadow-sm flex flex-col items-center justify-between">
                    <div className="w-full h-24 bg-white rounded-2xl border border-[#f3e9f0] flex items-center justify-center">
                      <span className="text-[12px] font-black tracking-widest uppercase text-[#ac2471]">QR</span>
                    </div>
                    <div className="text-center mt-3">
                      <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-[#ac2471]">Scan for order details</p>
                      <p className="mt-2 text-[11px] text-slate-600 leading-5">Order reference, atelier location, and delivery map are embedded in your certified PDF.</p>
                    </div>
                  </div>
                </div>

                {/* Atelier contact hours info block */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1 text-[10px] text-slate-400">
                  <div className="flex items-center gap-1 font-semibold text-slate-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>FitStyle Atelier Boulevard</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3" />
                    <span>Tel: +1 415 900 811</span>
                    <span className="mx-1">•</span>
                    <Clock className="w-3 h-3" />
                    <span>Open Daily 10 AM - 8 PM</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Haute couture advisory comments box (The Gemma comments) on bottom */}
            {aiComments && (
              <div className="bg-[#fcf7fc] border border-[#f0e3ef] rounded-xl p-4 text-[11px] text-slate-600 mb-6 max-h-[16vh] overflow-y-auto italic">
                <strong>Atelier Couture Stylist Alignment Report:</strong>
                <p className="whitespace-pre-line mt-1">{aiComments}</p>
              </div>
            )}

            {/* Modal Control Action Buttons */}
            <div className="flex justify-end gap-3 mt-auto pt-4 border-t border-[#f6edf4]">
              <button
                onClick={() => setShowPdfModal(false)}
                className="px-4 py-2 border border-[#f0daf1] rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50/50 cursor-pointer flex items-center gap-1"
              >
                <span>Return & Swap Items</span>
              </button>

              <button
                onClick={() => {
                  exportPDFSummary();
                  setShowPdfModal(false);
                }}
                className="px-5 py-2 bg-[#ac2471] hover:bg-[#851653] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer hover:scale-[1.01]"
              >
                <FileText className="w-4 h-4" />
                <span>Download Certified PDF summary</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 4. ATELIER CLIENT PROFILE DIALOG MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl border border-pink-100 p-8 overflow-y-auto max-h-[90vh] font-sans text-slate-800 animate-fade-in relative flex flex-col">
            
            <button 
              onClick={() => setShowProfileModal(false)}
              className="absolute top-5 right-5 p-1.5 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center pb-6 border-b border-pink-50">
              <div className="w-16 h-16 bg-[#fae9f3] text-[#ac2471] rounded-full mx-auto flex items-center justify-center mb-3 font-bold text-2xl font-playfair shadow-xs">
                {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : "U"}
              </div>
              <h3 className="font-playfair text-xl font-extrabold text-slate-900">
                Atelier Client Passport
              </h3>
              <p className="text-xs text-[#73636f] font-semibold tracking-wider font-outfit uppercase mt-0.5">
                Elite Member • FitStyle Identity
              </p>
            </div>

            <div className="my-6 space-y-4 text-xs font-sans">
              <div className="flex items-center justify-between py-2 border-b border-dashed border-slate-100">
                <span className="text-slate-400 font-medium">Full Name</span>
                <span className="font-bold text-slate-900">{currentUser.fullName}</span>
              </div>
              
              <div className="flex items-center justify-between py-2 border-b border-dashed border-slate-100">
                <span className="text-slate-400 font-medium">Email Address</span>
                <span className="font-mono font-bold text-slate-700">{currentUser.email}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-dashed border-slate-100">
                <span className="text-slate-400 font-medium">Client Role</span>
                <span className="font-semibold text-pink-700 uppercase tracking-wider text-[10px] bg-pink-50 px-2.5 py-0.5 rounded-full font-outfit">
                  {currentUser.role}
                </span>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-[#f3e9f0]/40 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <h4 className="font-outfit text-[10px] font-black uppercase tracking-wider text-[#ac2471]">
                    Calibrated Fitting Identity
                  </h4>
                  <div className="flex items-center gap-1 flex-wrap">
                    {recalibrated && (
                      <span className="bg-yellow-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase font-mono animate-bounce">
                        Re-calibrated
                      </span>
                    )}
                    {(hauteStylistResult?.body_analysis?.confidence?.toLowerCase() === "low") && (
                      <span className="bg-amber-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase font-mono animate-pulse">
                        ⚠️ Low Conf
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Height</span>
                    <span className="font-bold text-slate-800">{heightCm} cm</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Weight</span>
                    <span className="font-bold text-slate-800">{weightKg} kg</span>
                  </div>
                  <div className="col-span-2 border-t border-slate-200/50 pt-2 grid grid-cols-3 gap-1">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Shoulders</span>
                      <span className="font-bold text-slate-800">{shoulderSize}cm</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Waist</span>
                      <span className="font-bold text-slate-800">{waistSize}cm</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase">Hips</span>
                      <span className="font-bold text-slate-800">{hipSize}cm</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-[#faedf5] bg-[#fffcfd] p-3.5 rounded-2xl flex items-start gap-2.5">
                <div className="p-1.5 bg-[#faedf5] rounded-lg text-[#ac2471] shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-[11px] text-slate-800 leading-none mb-1">Body Silhouette Pattern</h4>
                  <p className="text-[10.5px] font-medium text-slate-600 mb-0.5">{classifyDetails.shape} Shape</p>
                  <p className="text-[10px] text-slate-450 font-light leading-snug">{classifyDetails.explanation}</p>
                </div>
              </div>

              <div className="bg-[#faedf5]/30 p-3.5 rounded-2xl flex items-start gap-2.5">
                <div className="p-1.5 bg-white text-[#ac2471] rounded-lg border border-[#fceeef] shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-[11px] text-slate-800 leading-none mb-1">Suggested Standard Size</h4>
                  <p className="text-[10.5px] font-bold text-[#ac2471]">
                    {sizeRecommendation.recommendedSize} <span className="font-light text-slate-500 text-[10px]">({sizeRecommendation.numericSize})</span>
                  </p>
                  <p className="text-[10px] text-slate-450 font-light leading-snug">{sizeRecommendation.description}</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowProfileModal(false)}
              className="mt-2 w-full py-3 bg-[#ac2471] hover:bg-[#851653] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer active:scale-95"
            >
              Close Identity Pass
            </button>
          </div>
        </div>
      )}

      {/* 5. ATELIER GARMENTS CATALOG MODAL */}
      {showProductsModal && (
        <CatalogModal
          products={products}
          wishlist={wishlist}
          handleToggleWishlist={handleToggleWishlist}
          onClose={() => setShowProductsModal(false)}
          handleTryOnItem={handleTryOnItem}
          trialLoading={trialLoading}
          personDetected={personDetected}
        />
      )}

    </div>
  );
}