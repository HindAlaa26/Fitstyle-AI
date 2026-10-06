import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Product } from "../types";

export interface CartItem {
  product: Product;
  quantity: number;
  badge?: string;
  selectedSize?: string;
}

interface ProductCartPageProps {
  cartItems: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onContinueShopping: () => void;
  onProceedToPayment: () => void;
}

const categoryLabel = (category: Product["category"]) => ({
  top: "Tops",
  bottom: "Bottoms",
  footwear: "Shoes",
  accessories: "Accessories",
}[category]);

export default function ProductCartPage({
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onContinueShopping,
  onProceedToPayment,
}: ProductCartPageProps) {
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState("");
  const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const subtotal = useMemo(
    () => cartItems.reduce((total, item) => total + item.product.price * item.quantity, 0),
    [cartItems]
  );

  const applyPromoCode = () => {
    setPromoMessage(promoCode.trim() ? "Code noted for checkout." : "Enter a promo code to apply it.");
  };

  if (cartItems.length === 0) {
    return (
      <main className="min-h-[70vh] bg-[#fff7f9] px-6 py-20">
        <div className="mx-auto max-w-xl rounded-3xl border border-purple-100 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fbf0f7] text-[#5a005a]"><ShoppingBag className="h-7 w-7" /></div>
          <h1 className="mt-6 font-serif text-3xl font-bold text-purple-950">Your Cart Is Empty</h1>
          <p className="mt-3 text-sm text-zinc-500">Your curated wardrobe is waiting for you.</p>
          <button type="button" onClick={onContinueShopping} className="mt-8 inline-flex items-center gap-2 rounded-full bg-purple-950 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-purple-900"><span>Explore Collection</span><ArrowRight className="h-4 w-4" /></button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[70vh] bg-[#fff7f9] px-4 py-10 md:px-8 md:py-14">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#ac2471]">Your Curated Selection</span>
            <h1 className="mt-3 font-serif text-4xl font-bold leading-none text-purple-950 md:text-5xl">Your Product Cart</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">Review your selected pieces and confirm your tailored look before proceeding to checkout.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
            <span className="rounded-full border border-purple-100 bg-white px-3 py-2 text-purple-900">{itemCount} {itemCount === 1 ? "Item" : "Items"}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]">
          <section className="rounded-3xl border border-purple-100 bg-white p-5 shadow-sm md:p-7">
            <div className="flex items-center justify-between border-b border-purple-50 pb-4"><div><h2 className="font-serif text-2xl font-bold text-purple-950">Selected Items</h2><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">{itemCount} {itemCount === 1 ? "piece" : "pieces"} selected</p></div><Sparkles className="h-5 w-5 text-[#ac2471]" /></div>
            <div className="divide-y divide-purple-50">
              {cartItems.map(({ product, quantity, badge, selectedSize }) => (
                <article key={product.id} className="flex gap-4 py-5 first:pt-6 last:pb-2 md:gap-5">
                  <div className="h-28 w-24 shrink-0 overflow-hidden rounded-xl border border-purple-50 bg-[#fcf8fb] md:h-36 md:w-28"><img src={product.image || "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=400"} alt={product.name} className="h-full w-full object-cover" /></div>
                  <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h3 className="font-serif text-lg font-bold text-purple-950">{product.name}</h3>{badge && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#fbf0f7] px-2 py-1 text-[8px] font-extrabold uppercase tracking-wider text-[#ac2471]"><Sparkles className="h-3 w-3" /> {badge}</span>}</div><button type="button" aria-label={`Remove ${product.name}`} onClick={() => onRemoveItem(product.id)} className="rounded-full p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div><div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1 text-[10px] text-zinc-500 md:grid-cols-3"><span>Category: <strong className="text-slate-700">{categoryLabel(product.category)}</strong></span><span>Color: <strong className="text-slate-700">{product.colour}</strong></span><span>Size: <strong className="text-slate-700">{selectedSize || product.size}</strong></span></div><div className="mt-4 flex items-center justify-between gap-3"><div className="flex items-center rounded-lg border border-purple-100"><button type="button" aria-label={`Decrease ${product.name}`} onClick={() => onUpdateQuantity(product.id, quantity - 1)} className="p-1.5 text-purple-900 hover:bg-purple-50"><Minus className="h-3 w-3" /></button><span className="min-w-7 text-center text-xs font-bold text-slate-700">{quantity}</span><button type="button" aria-label={`Increase ${product.name}`} onClick={() => onUpdateQuantity(product.id, quantity + 1)} className="p-1.5 text-purple-900 hover:bg-purple-50"><Plus className="h-3 w-3" /></button></div><span className="font-serif text-xl font-bold text-purple-950">${(product.price * quantity).toFixed(2)}</span></div></div>
                </article>
              ))}
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className="rounded-3xl border border-purple-100 bg-white p-5 shadow-sm md:p-6"><h2 className="font-serif text-2xl font-bold text-purple-950">Order Summary</h2><div className="mt-6 space-y-3 text-xs text-zinc-500"><div className="flex justify-between"><span>Items ({itemCount})</span><span className="font-semibold text-slate-700">${subtotal.toFixed(2)}</span></div><div className="flex justify-between"><span>AI Styling Fee</span><span className="font-bold text-emerald-600">FREE</span></div><div className="flex justify-between"><span>Shipping</span><span className="text-right">Calculated at checkout</span></div></div><div className="my-5 border-t border-purple-50" /><div className="flex items-end justify-between"><span className="text-xs font-bold uppercase tracking-wider text-purple-950">Total</span><span className="font-serif text-3xl font-bold text-purple-950">${subtotal.toFixed(2)}</span></div><div className="mt-6"><label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Have a promo code?</label><div className="mt-2 flex gap-2"><input value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder="Enter code" className="min-w-0 flex-1 rounded-lg border border-purple-100 bg-[#fffbfd] px-3 py-2 text-xs outline-none focus:border-[#ac2471]" /><button type="button" onClick={applyPromoCode} className="rounded-lg border border-purple-950 px-3 py-2 text-[10px] font-bold tracking-wider text-purple-950 hover:bg-purple-50">APPLY</button></div>{promoMessage && <p className="mt-2 text-[10px] text-[#ac2471]">{promoMessage}</p>}</div></section>
            <button type="button" onClick={onContinueShopping} className="inline-flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-purple-900 hover:text-[#ac2471]"><ArrowLeft className="h-3.5 w-3.5" /> Continue Shopping</button>
          </aside>
        </div>
      </div>
    </main>
  );
}
