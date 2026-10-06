import React, { useState } from "react";
import { X, CheckCircle2, CreditCard, Store, AlertTriangle, RefreshCw, Download, MapPin } from "lucide-react";
import type { CartItem } from "./ProductCartPage";
import { authFetch } from "../utils/authFetch";
import { SHOP, mapsLink, mapsEmbed } from "../config/shop";
import { downloadOrderPdf } from "../utils/orderPdf";

export interface PlacedOrder {
  orderId: string;
  status: string;
  date: string;
  paymentMethod: string;
  subtotal: number;
  totalAmount: number;
  items: Array<{
    id: string;
    name: string;
    sku: string;
    category: string;
    size: string;
    colour: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    image?: string;
  }>;
  customerName?: string;
  customerEmail?: string;
}

interface CheckoutDialogProps {
  mode: "online" | "offline";
  cartItems: CartItem[];
  onClose: () => void; // cancelled before any order was placed
  onDone: () => void;  // success screen closed (caller clears the local cart)
}

const luhnValid = (digits: string) => {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
};

const money = (n: number) => `$${n.toFixed(2)}`;

export default function CheckoutDialog({ mode, cartItems, onClose, onDone }: CheckoutDialogProps) {
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const downloadPdf = async () => {
    if (!placed) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      await downloadOrderPdf(placed);
    } catch (err) {
      console.error("PDF generation failed:", err);
      setPdfError("Could not create the PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const estimatedTotal = cartItems.reduce((t, i) => t + i.product.price * i.quantity, 0);
  const itemCount = cartItems.reduce((t, i) => t + i.quantity, 0);

  const validateCard = (): string | null => {
    const digits = card.number.replace(/\s/g, "");
    if (!/^\d{13,19}$/.test(digits) || !luhnValid(digits)) {
      return "Enter a valid card number (test mode: 4242 4242 4242 4242).";
    }
    const m = card.expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (!m) return "Enter the expiry date as MM/YY.";
    const expiresAt = new Date(2000 + Number(m[2]), Number(m[1]), 1); // first day after the expiry month
    if (expiresAt <= new Date()) return "This card has expired.";
    if (!/^\d{3,4}$/.test(card.cvc)) return "Enter the 3 or 4 digit security code.";
    if (card.name.trim().length < 2) return "Enter the name on the card.";
    return null;
  };

  const submit = async () => {
    setError(null);
    if (mode === "online") {
      const problem = validateCard();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setProcessing(true);
    try {
      // Only the mode is sent. Prices and items are read from the saved cart on the server.
      const res = await authFetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Nothing was charged.");
        return;
      }
      setCard({ number: "", expiry: "", cvc: "", name: "" }); // never keep card data
      setPlaced(data as PlacedOrder);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Nothing was charged.");
    } finally {
      setProcessing(false);
    }
  };

  const close = () => {
    if (processing) return;
    setCard({ number: "", expiry: "", cvc: "", name: "" });
    if (placed) onDone();
    else onClose();
  };

  const inputClass =
    "w-full rounded-lg border border-purple-100 bg-[#fffbfd] px-3 py-2.5 text-xs outline-none focus:border-[#ac2471]";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "online" ? "Pay online" : "Pay in store"}
    >
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl border border-purple-100 bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={close}
          disabled={processing}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-400 transition hover:bg-purple-50 hover:text-purple-950 disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>

        {placed ? (
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-serif text-2xl font-bold text-purple-950">
              {mode === "online" ? "Payment successful" : "Order reserved"}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {mode === "online"
                ? "Test mode: no real money was charged."
                : "Show this order number at the store. Payment is due at pickup."}
            </p>
            <div className="mt-5 space-y-2 rounded-2xl bg-[#fbf5fa] p-4 text-left text-xs text-slate-600">
              <div className="flex justify-between"><span>Order number</span><strong className="font-mono text-purple-950">{placed.orderId}</strong></div>
              <div className="flex justify-between"><span>Status</span><strong className="text-[#ac2471]">{placed.status}</strong></div>
              <div className="flex justify-between"><span>Items</span><strong className="text-purple-950">{placed.items.reduce((t, i) => t + i.quantity, 0)}</strong></div>
              <div className="flex justify-between border-t border-purple-100 pt-2"><span>Total</span><strong className="font-serif text-base text-purple-950">{money(placed.totalAmount)}</strong></div>
            </div>
{mode === "offline" && (
              <div className="mt-5 text-left">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#ac2471]">
                  <MapPin className="h-3.5 w-3.5" /> Pick up at
                </p>
                <div className="relative h-44 overflow-hidden rounded-2xl border border-purple-100">
                  <iframe
                    title="Shop location"
                    src={mapsEmbed()}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="pointer-events-none h-full w-full border-0"
                  />
                  {/* the whole map is one link: a click opens Google Maps on the shop */}
                  <a
                    href={mapsLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open the shop location in Google Maps"
                    className="absolute inset-0 flex items-end justify-end p-2"
                  >
                    <span className="rounded-full bg-white/95 px-3 py-1 text-[9px] font-extrabold uppercase tracking-wider text-[#5a005a] shadow">
                      Open in Google Maps
                    </span>
                  </a>
                </div>
                <p className="mt-2 text-xs font-semibold text-purple-950">{SHOP.name}</p>
                <p className="text-[11px] text-zinc-500">{SHOP.address}</p>
              </div>
            )}
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfBusy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-[#5a005a] bg-white px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-[#5a005a] transition hover:bg-[#fbf5fa] disabled:cursor-wait disabled:opacity-70"
            >
              {pdfBusy ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Preparing PDF...
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </>
              )}
            </button>
            {pdfError && <p className="mt-2 text-[11px] text-red-600">{pdfError}</p>}
            <button
              type="button"
              onClick={onDone}
              className="mt-6 w-full rounded-lg bg-[#5a005a] px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-white transition hover:bg-[#470646]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#fbf0f7] text-[#5a005a]">
                {mode === "online" ? <CreditCard className="h-5 w-5" /> : <Store className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="font-serif text-xl font-bold text-purple-950">
                  {mode === "online" ? "Pay online" : "Pay in store"}
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {itemCount} {itemCount === 1 ? "item" : "items"} · {money(estimatedTotal)}
                </p>
              </div>
            </div>

            {mode === "online" ? (
              <>
                <div className="mt-4 inline-block rounded-full bg-amber-50 px-3 py-1 text-[9px] font-extrabold uppercase tracking-wider text-amber-700">
                  Test mode · no real money is charged
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Card number</label>
                    <input
                      className={inputClass + " mt-1 font-mono tracking-widest"}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="4242 4242 4242 4242"
                      value={card.number}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 19);
                        setCard({ ...card, number: d.replace(/(.{4})/g, "$1 ").trim() });
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Expiry</label>
                      <input
                        className={inputClass + " mt-1 text-center font-mono"}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="MM/YY"
                        value={card.expiry}
                        onChange={(e) => {
                          let d = e.target.value.replace(/\D/g, "").slice(0, 4);
                          if (d.length > 2) d = d.slice(0, 2) + "/" + d.slice(2);
                          setCard({ ...card, expiry: d });
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">CVC</label>
                      <input
                        className={inputClass + " mt-1 text-center font-mono"}
                        inputMode="numeric"
                        autoComplete="off"
                        type="password"
                        placeholder="•••"
                        value={card.cvc}
                        onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name on card</label>
                    <input
                      className={inputClass + " mt-1"}
                      autoComplete="off"
                      placeholder="Full name"
                      value={card.name}
                      onChange={(e) => setCard({ ...card, name: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-zinc-600">
                We will reserve your order. You pay at the store when you collect it. You will get an order number to
                show at the counter. No payment is taken now.
              </p>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={processing}
                className="flex-1 rounded-lg border border-purple-100 bg-white px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-purple-900 transition hover:bg-purple-50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={processing}
                className="flex flex-[1.4] items-center justify-center gap-2 rounded-lg bg-[#5a005a] px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-white transition hover:bg-[#470646] disabled:cursor-wait disabled:opacity-70"
              >
                {processing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Processing...
                  </>
                ) : mode === "online" ? (
                  `Pay ${money(estimatedTotal)}`
                ) : (
                  "Confirm reservation"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
