import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import { GarmentCategory } from "../types";
import { RecoItem, RecoOutfit } from "../utils/recommendationsApi";

const CATEGORY_LABEL: Record<GarmentCategory, string> = {
  Dress: "Dresses",
  Top: "Tops",
  Bottom: "Bottoms",
  Outerwear: "Outerwear",
  Shoes: "Shoes",
  Accessory: "Accessories",
};

interface Props {
  profileLabel: string;
  outfits: RecoOutfit[];
  activeIndex: number;
  currentItems: RecoItem[];
  loading: boolean;
  error: string | null;
  note?: string | null;
  onSelectOutfit: (index: number) => void;
  onSwapItem: (category: GarmentCategory, item: RecoItem) => void;
  loadAlternatives: (category: GarmentCategory) => Promise<RecoItem[]>;
}

type View = { name: "current" } | { name: "all" } | { name: "alternatives"; category: GarmentCategory };

const money = (n: number) => `$${Number(n).toFixed(2)}`;

function ItemCard({ item, selected, hint, onClick }: { item: RecoItem; selected?: boolean; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full gap-3 rounded-xl border p-2 text-left transition ${
        selected ? "border-[#5a005a] bg-[#fbf5fa] ring-1 ring-[#5a005a]/10" : "border-[#f1e8f2] hover:border-[#d9b9d9]"
      }`}
    >
      <img src={item.image} alt={item.name} className="h-20 w-16 shrink-0 rounded-lg bg-[#f4edf4] object-cover" />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[11px] text-[#1d1327]">{item.name}</strong>
        <span className="mt-1 block font-serif text-[13px] font-bold text-[#580a58]">{money(item.price)}</span>
        <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-slate-500">
          <span>Colour: {item.colour}</span>
          <span>Size: {item.size}</span>
        </span>
        {hint && <span className="mt-1 block text-[8px] font-bold uppercase tracking-wider text-[#ac2471]">{hint}</span>}
      </span>
    </button>
  );
}

export default function OutfitRecommendationPanel({
  profileLabel, outfits, activeIndex, currentItems, loading, error, note,
  onSelectOutfit, onSwapItem, loadAlternatives,
}: Props) {
  const [view, setView] = useState<View>({ name: "current" });
  const [alts, setAlts] = useState<RecoItem[]>([]);
  const [altsLoading, setAltsLoading] = useState(false);
  const [altsError, setAltsError] = useState<string | null>(null);

  const active = outfits[activeIndex];
  const total = currentItems.reduce((sum, i) => sum + i.price, 0);
  const title = active?.explanation?.headline || `Outfit ${activeIndex + 1}`;

  useEffect(() => {
    if (view.name !== "alternatives") return;
    let cancelled = false;
    setAltsLoading(true);
    setAltsError(null);
    setAlts([]);
    loadAlternatives(view.category)
      .then((items) => { if (!cancelled) setAlts(items); })
      .catch((e) => { if (!cancelled) setAltsError(e.message || "Could not load products"); })
      .finally(() => { if (!cancelled) setAltsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const BackBar = ({ label }: { label: string }) => (
    <button type="button" onClick={() => setView({ name: "current" })} className="mb-3 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#5a005a] hover:text-[#ac2471]">
      <ChevronLeft className="h-4 w-4" /> {label}
    </button>
  );

  if (loading) {
    return (
      <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 text-xs text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin text-[#ac2471]" /> Styling outfits for you...
      </div>
    );
  }
  if (error) {
    return <p className="mt-4 rounded-xl bg-red-50 p-3 text-[11px] text-red-700">{error}</p>;
  }
  if (!active) {
    return <p className="mt-4 text-center text-xs text-slate-400">No outfits available for this profile yet.</p>;
  }

  // ---------------------------------------------------------------- all outfits
  if (view.name === "all") {
    return (
      <div className="mt-4 flex flex-1 flex-col overflow-hidden">
        <BackBar label="Back" />
        <p className="mb-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">All {outfits.length} recommended outfits</p>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {outfits.map((o, i) => {
            const sum = o.items.reduce((s, it) => s + it.price, 0);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => { onSelectOutfit(i); setView({ name: "current" }); }}
                className={`w-full rounded-2xl border p-3 text-left transition ${i === activeIndex ? "border-[#5a005a] bg-[#fbf5fa] ring-1 ring-[#5a005a]/10" : "border-[#f1e8f2] hover:border-[#d9b9d9]"}`}
              >
                <div className="flex items-center justify-between">
                  <strong className="truncate text-[11px] text-[#1d1327]">#{i + 1} {o.explanation?.headline || "Outfit"}</strong>
                  <span className="shrink-0 font-serif text-[12px] font-bold text-[#580a58]">{money(sum)}</span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  {o.items.map((it) => (
                    <img key={it.id} src={it.image} alt={it.name} title={it.name} className="h-16 w-12 rounded-md bg-[#f4edf4] object-cover" />
                  ))}
                </div>
                <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-[#ac2471]">{Math.round(o.matchScore)}% match {i === activeIndex ? "· Selected" : ""}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- alternatives
  if (view.name === "alternatives") {
    const current = currentItems.find((i) => i.garmentCategory === view.category);
    return (
      <div className="mt-4 flex flex-1 flex-col overflow-hidden">
        <BackBar label="Back to outfit" />
        <p className="mb-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{alts.length > 0 ? `${alts.length} ` : ""}{CATEGORY_LABEL[view.category]} that suit you</p>
        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {altsLoading && <p className="py-6 text-center text-xs text-slate-400">Loading...</p>}
          {altsError && <p className="rounded-xl bg-red-50 p-3 text-[11px] text-red-700">{altsError}</p>}
          {!altsLoading && !altsError && alts.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No other matches in your size.</p>}
          {alts.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={current?.id === item.id}
              hint={current?.id === item.id ? "In your outfit" : "Tap to use"}
              onClick={() => { onSwapItem(view.category, item); setView({ name: "current" }); }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- current outfit
  return (
    <div className="mt-4 flex flex-1 flex-col overflow-hidden">
      <div className="mb-3 rounded-xl bg-[#fbf5fa] p-3">
        <p className="text-[8px] font-extrabold uppercase tracking-[0.16em] text-[#ac2471]">For {profileLabel}</p>
        <div className="mt-1 flex items-start justify-between gap-2">
          <h4 className="font-playfair text-lg font-bold leading-tight text-[#1d1327]">{title}</h4>
          <span className="shrink-0 font-serif text-sm font-bold text-[#580a58]">{money(total)}</span>
        </div>
        <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Outfit {activeIndex + 1} of {outfits.length} · {Math.round(active.matchScore)}% match
        </p>
        {note && <p className="mt-1 text-[9px] text-amber-700">{note}</p>}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {currentItems.map((item) => (
          <div key={item.id}>
            <div className="mb-1 flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>{CATEGORY_LABEL[item.garmentCategory]}</span>
              <span className="text-[#ac2471]">Tap item to swap</span>
            </div>
            <ItemCard item={item} selected hint={`Tap to see all matching ${CATEGORY_LABEL[item.garmentCategory].toLowerCase()}`} onClick={() => setView({ name: "alternatives", category: item.garmentCategory })} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setView({ name: "all" })}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-[#ecddec] bg-white px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-[#5a005a] transition hover:bg-[#fbf5fa]"
      >
        <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> See all {outfits.length} outfits</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
