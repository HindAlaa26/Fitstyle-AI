import React from "react";
import { Sparkles } from "lucide-react";
import { RecoExplanation } from "../utils/recommendationsApi";

interface Props {
  explanation: RecoExplanation | null;
  loading: boolean;
  customised: boolean;
}

export default function OutfitWhyCard({ explanation, loading, customised }: Props) {
  return (
    <div className="mt-4 rounded-2xl border border-[#ecddec] bg-gradient-to-br from-[#fbf5fa] to-white p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#ac2471]" />
        <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#ac2471]">Why this outfit</span>
        {customised && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-bold uppercase text-amber-700">Customised</span>}
      </div>
      {loading && !explanation ? (
        <div className="mt-3 space-y-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-[#efe3ef]" />
          <div className="h-3 w-full animate-pulse rounded bg-[#efe3ef]" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-[#efe3ef]" />
        </div>
      ) : explanation ? (
        <div className={loading ? "opacity-60 transition" : "transition"}>
          {explanation.headline && <h4 className="mt-2 font-playfair text-lg font-bold text-[#1d1327]">{explanation.headline}</h4>}
          {explanation.explanation && <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{explanation.explanation}</p>}
          {explanation.why_this_one && <p className="mt-2 text-[10px] italic text-[#580a58]">{explanation.why_this_one}</p>}
        </div>
      ) : null}
    </div>
  );
}
