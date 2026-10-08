import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Plus, RefreshCw, Sparkles, X } from "lucide-react";
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
  currentItems: RecoItem[];      // every piece of the current outfit (selected or not)
  deselectedIds: string[];       // pieces the shopper removed from "Your Selection" (kept here, just unselected)
  loading: boolean;
  error: string | null;
  note?: string | null;
  sizeLabel: string;             // the shopper's size (shown in the swap dialog)
  onSelectOutfit: (index: number) => void;
  onSwapItem: (category: GarmentCategory, item: RecoItem) => void;
  onToggleItem: (id: string) => void;
  loadAlternatives: (category: GarmentCategory) => Promise<RecoItem[]>;
}

const money = (n: number) => `$${Number(n).toFixed(2)}`;

// ------------------------------------------------------------------ swap dialog (centre of the screen)
function SwapDialog({
  category, sizeLabel, current, loadAlternatives, onPick, onClose,
}: {
  category: GarmentCategory;
  sizeLabel: string;
  current?: RecoItem;
  loadAlternatives: (c: GarmentCategory) => Promise<RecoItem[]>;
  onPick: (item: RecoItem) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<RecoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadAlternatives(category)
      .then((r) => { if (!cancelled) setItems(r); })
      .catch((e) => { if (!cancelled) setError(e.message || "Could not load products"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[#f1e8f2] px-6 py-4">
          <div>
            <h3 className="font-playfair text-xl font-bold text-[#1d1327]">{CATEGORY_LABEL[category]} that suit you</h3>
            <p className="mt-1 text-[10px] font-extrabold uppercase tracking-wider text-[#ac2471]">
              Matched to your profile · size {sizeLabel}{!loading && !error ? ` · ${items.length} options` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading && <p className="py-10 text-center text-sm text-slate-400">Loading...</p>}
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!loading && !error && items.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No other matches in your size.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => {
              const isCurrent = current?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPick(item)}
                  className={`overflow-hidden rounded-2xl border text-left transition hover:shadow-md ${isCurrent ? "border-[#5a005a] ring-2 ring-[#5a005a]/20" : "border-[#f1e8f2] hover:border-[#d9b9d9]"}`}
                >
                  <img src={item.image} alt={item.name} className="aspect-[3/4] w-full bg-[#f4edf4] object-cover" />
                  <span className="block p-2.5">
                    <strong className="block truncate text-[11px] text-[#1d1327]">{item.name}</strong>
                    <span className="mt-1 block font-serif text-[13px] font-bold text-[#580a58]">{money(item.price)}</span>
                    <span className="mt-1 block text-[10px] text-slate-500">Colour: {item.colour} · Size: {item.size}</span>
                    <span className="mt-1.5 block text-[8px] font-extrabold uppercase tracking-wider text-[#ac2471]">{isCurrent ? "In your outfit" : "Tap to use"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ------------------------------------------------------------------ one piece in the outfit
function ItemCard({ item, selected, onOpen, onToggle }: { item: RecoItem; selected: boolean; onOpen: () => void; onToggle: () => void }) {
  return (
    <div className={`flex gap-3 rounded-xl border p-2 transition ${selected ? "border-[#5a005a] bg-[#fbf5fa] ring-1 ring-[#5a005a]/10" : "border-dashed border-[#d8cbd8] bg-white opacity-60"}`}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left" title="See all matching options">
        <img src={item.image} alt={item.name} className="h-20 w-16 shrink-0 rounded-lg bg-[#f4edf4] object-cover" />
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[11px] text-[#1d1327]">{item.name}</strong>
          <span className="mt-1 block font-serif text-[13px] font-bold text-[#580a58]">{money(item.price)}</span>
          <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-slate-500">
            <span>Colour: {item.colour}</span>
            <span>Size: {item.size}</span>
          </span>
          <span className="mt-1 block text-[8px] font-bold uppercase tracking-wider text-[#ac2471]">Tap to see all matching {CATEGORY_LABEL[item.garmentCategory].toLowerCase()}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        title={selected ? "Remove from your selection" : "Add back to your selection"}
        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${selected ? "border-[#5a005a] bg-[#5a005a] text-white" : "border-slate-300 bg-white text-slate-400 hover:border-[#5a005a] hover:text-[#5a005a]"}`}
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export default function OutfitRecommendationPanel({
  profileLabel, outfits, activeIndex, currentItems, deselectedIds, loading, error, note, sizeLabel,
  onSelectOutfit, onSwapItem, onToggleItem, loadAlternatives,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const [dialogCategory, setDialogCategory] = useState<GarmentCategory | null>(null);

  const active = outfits[activeIndex];
  const selectedItems = currentItems.filter((i) => !deselectedIds.includes(i.id));
  const total = selectedItems.reduce((sum, i) => sum + i.price, 0);
  const title = active?.explanation?.headline || `Outfit ${activeIndex + 1}`;

  if (loading) {
    return (
      <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 text-xs text-slate-400">
        <RefreshCw className="h-5 w-5 animate-spin text-[#ac2471]" /> Styling outfits for you...
      </div>
    );
  }
  if (error) return <p className="mt-4 rounded-xl bg-red-50 p-3 text-[11px] text-red-700">{error}</p>;
  if (!active) return <p className="mt-4 text-center text-xs text-slate-400">No outfits available for this profile yet.</p>;

  // ---------------------------------------------------------------- all outfits
  if (showAll) {
    return (
      <div className="mt-4 flex flex-1 flex-col overflow-hidden">
        <button type="button" onClick={() => setShowAll(false)} className="mb-3 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#5a005a] hover:text-[#ac2471]">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <p className="mb-2 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">All {outfits.length} recommended outfits</p>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {outfits.map((o, i) => {
            const sum = o.items.reduce((s, it) => s + it.price, 0);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => { onSelectOutfit(i); setShowAll(false); }}
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
          Outfit {activeIndex + 1} of {outfits.length} · {Math.round(active.matchScore)}% match · {selectedItems.length}/{currentItems.length} selected
        </p>
        {note && <p className="mt-1 text-[9px] text-amber-700">{note}</p>}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {currentItems.map((item) => (
          <div key={item.id}>
            <div className="mb-1 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">{CATEGORY_LABEL[item.garmentCategory]}</div>
            <ItemCard
              item={item}
              selected={!deselectedIds.includes(item.id)}
              onOpen={() => setDialogCategory(item.garmentCategory)}
              onToggle={() => onToggleItem(item.id)}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowAll(true)}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-[#ecddec] bg-white px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-wider text-[#5a005a] transition hover:bg-[#fbf5fa]"
      >
        <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> See all {outfits.length} outfits</span>
        <ChevronRight className="h-4 w-4" />
      </button>

      {dialogCategory && (
        <SwapDialog
          category={dialogCategory}
          sizeLabel={sizeLabel}
          current={currentItems.find((i) => i.garmentCategory === dialogCategory)}
          loadAlternatives={loadAlternatives}
          onPick={(item) => { onSwapItem(dialogCategory, item); setDialogCategory(null); }}
          onClose={() => setDialogCategory(null)}
        />
      )}
    </div>
  );
}
