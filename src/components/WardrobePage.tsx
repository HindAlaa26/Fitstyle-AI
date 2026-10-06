import React, { useState, useEffect } from "react";
import { Sparkles, Shirt, ShoppingBag, ArrowRight, Layers, Plus } from "lucide-react";
import { Product } from "../types";

interface WardrobePageProps {
  products: Product[];
  uid: string;
  onNavigateToStudio: (updatedOutfitPartial?: any) => void;
}

export default function WardrobePage({ products, uid, onNavigateToStudio }: WardrobePageProps) {
  const [activeCategory, setActiveCategory] = useState<string>("Tops");
  const [wardrobeItems, setWardrobeItems] = useState<Product[]>([]);

  // Category Tabs mapping
  const categoriesMap: Record<string, string> = {
    "Tops": "top",
    "Bottoms": "bottom",
    "Footwear": "footwear",
    "Accents": "accessories"
  };

  useEffect(() => {
    // 1. Start with some beautiful curated starter pieces in their personal wardrobe
    const starterIds = [
      "prod-cas-blouse",
      "prod-cas-trousers",
      "prod-cas-polka-dress"
    ];
    let initialWardrobe = products.filter(p => p && starterIds.includes(p.id));

    if (initialWardrobe.length === 0) {
      // Just take two products of each category as fallback starter items
      const categories: any[] = ["top", "bottom", "footwear", "accessories"];
      categories.forEach(cat => {
        const catProducts = products.filter(p => p && p.category === cat).slice(0, 2);
        initialWardrobe = [...initialWardrobe, ...catProducts];
      });
    }

    const addOrderItems = (orders: any[], target: Product[]) => {
      orders.forEach(order => {
        if (order && Array.isArray(order.items)) {
          order.items.forEach((it: any) => {
            if (it && it.id && !target.some(p => p && p.id === it.id)) {
              target.push({
                id: it.id,
                name: it.name,
                price: it.unitPrice ?? it.price ?? 0,
                image: it.image || "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600",
                category: (it.category || "top") as any,
                size: it.size || order.sizing || "M",
                colour: it.colour || "Bespoke Selection",
                occasion: "Casual" as any
              });
            }
          });
        }
        if (order && order.outfit) {
          Object.entries(order.outfit).forEach(([cat, item]: [string, any]) => {
            if (item && item.id) {
              if (!target.some(p => p && p.id === item.id)) {
                target.push({
                  id: item.id,
                  name: item.name,
                  price: item.price,
                  image: item.image || "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600",
                  category: cat as any,
                  size: order.sizing || "M",
                  colour: "Bespoke Selection",
                  occasion: (order.outfit.top?.occasion || "Wedding") as any
                });
              }
            }
          });
        }
      });
    };

    // 2. Immediate fallback: localStorage (covers right after checkout, before
    // this page has re-fetched from AWS)
    const savedOrdersKey = `orders_${uid}`;
    const ordersStr = localStorage.getItem(savedOrdersKey);
    if (ordersStr) {
      try {
        const localOrders = JSON.parse(ordersStr);
        if (Array.isArray(localOrders)) {
          addOrderItems(localOrders, initialWardrobe);
        }
      } catch (err) {
        console.error("Failed to parse wardrobe orders snapshot", err);
      }
    }

    // 3. Real source of truth: AWS (works across devices/browsers, not just this one)
    if (uid) {
      fetch(`/api/orders/user/${uid}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((awsOrders: any[]) => {
          if (Array.isArray(awsOrders) && awsOrders.length > 0) {
            const merged = [...initialWardrobe];
            addOrderItems(awsOrders, merged);

            const seenIds = new Set<string>();
            const finalWardrobe: Product[] = [];
            merged.forEach(p => {
              if (p && p.id && !seenIds.has(p.id)) {
                seenIds.add(p.id);
                finalWardrobe.push(p);
              }
            });
            setWardrobeItems(finalWardrobe);
          }
        })
        .catch((err) => console.warn("Could not fetch orders from AWS for wardrobe", err));
    }

    // 4. Strict final deduplication for the initial (localStorage-based) render
    const seenIds = new Set<string>();
    const finalWardrobe: Product[] = [];
    initialWardrobe.forEach(p => {
      if (p && p.id && !seenIds.has(p.id)) {
        seenIds.add(p.id);
        finalWardrobe.push(p);
      }
    });

    setWardrobeItems(finalWardrobe);
  }, [uid, products]);

  // Filter items based on active category
  const currentCategoryKey = categoriesMap[activeCategory];
  const filteredItems = wardrobeItems.filter(item => item.category === currentCategoryKey);

  const handleAddToOutfit = (item: Product) => {
    // We send a partial update loaded into standard fitting-studio slots
    const partialOutfit: any = {};
    if (item.category === "top") partialOutfit.top = item;
    else if (item.category === "bottom") partialOutfit.bottom = item;
    else if (item.category === "footwear") partialOutfit.footwear = item;
    else if (item.category === "accessories") partialOutfit.accessories = item;

    onNavigateToStudio(partialOutfit);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
        <div className="text-center md:text-left">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-purple-950 flex items-center justify-center md:justify-start gap-2.5">
            My Digital Wardrobe
          </h2>
          <p className="text-zinc-500 font-sans text-sm mt-2 max-w-xl">
            Your personal digital cedar-room containing your owned garments, custom orders, and saved fittings.
          </p>
        </div>
        
        <button
          onClick={() => onNavigateToStudio()}
          className="bg-white hover:bg-slate-50 text-purple-950 border-2 border-purple-950/20 px-8 py-3.5 rounded-full font-sans text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4 text-[#ac2471]" />
          Shop More Products
        </button>
      </div>

      {/* Categories Toolbar Panel */}
      <div className="flex justify-center md:justify-start gap-2 border-b border-purple-50 pb-4 mb-8">
        {Object.keys(categoriesMap).map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeCategory === category
                ? "bg-purple-950 text-white shadow"
                : "bg-white text-zinc-500 hover:text-purple-950 border border-purple-100"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Grid of items */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-purple-50 max-w-lg mx-auto shadow-sm">
          <div className="w-14 h-14 bg-purple-50 text-[#ac2471] rounded-full flex items-center justify-center mx-auto mb-4">
            <Shirt className="w-6 h-6" />
          </div>
          <p className="font-serif text-xl font-bold text-[#221920] mb-1">Category is currently empty</p>
          <p className="font-sans text-zinc-400 text-xs mb-6">No items registered in your personal vault under {activeCategory} yet.</p>
          <button
            onClick={() => onNavigateToStudio()}
            className="bg-[#ac2471] hover:bg-[#8f195b] text-white py-2.5 px-6 rounded-xl font-sans text-[11px] font-bold uppercase tracking-wider cursor-pointer"
          >
            Virtual Fitting Shop
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredItems.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-purple-100/70 overflow-hidden shadow-xs hover:shadow transition-all font-sans relative flex flex-col group justify-between"
            >
              {/* Product Photo section */}
              <div className="relative aspect-[3/4] bg-slate-50 overflow-hidden">
                <img
                  src={item.image || "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600"}
                  alt={item.name}
                  onError={(e) => {
                    e.currentTarget.src = "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600";
                  }}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                />
                <span className="absolute top-3 left-3 bg-white/95 text-[9px] text-[#ac2471] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border border-purple-50">
                  {item.size}
                </span>
                <span className="absolute bottom-3 left-3 bg-purple-950/90 text-[8px] text-purple-100 font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md">
                  {item.occasion || "Casual"}
                </span>
              </div>

              {/* Product info details */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm line-clamp-1">{item.name}</h4>
                  <p className="text-zinc-400 text-[10px] mt-0.5 uppercase tracking-wide">Colour: {item.colour}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-purple-50/50 flex items-center justify-between">
                  <span className="text-purple-950 font-serif font-extrabold text-base">${item.price}</span>
                  <button
                    type="button"
                    onClick={() => handleAddToOutfit(item)}
                    className="inline-flex items-center gap-1 bg-purple-950 hover:bg-[#ac2471] text-white py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add to Outfit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
