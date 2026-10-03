import React, { useState } from "react";
import { 
  ShoppingBag, 
  User, 
  Sparkles, 
  Upload, 
  Calendar, 
  Shirt, 
  Star, 
  Users, 
  ArrowRight, 
  LogOut,
  Heart
} from "lucide-react";
import { Product, UserProfile } from "../types";
import ProductCartPage, { CartItem } from "./ProductCartPage";
import fitStyleLogo from "../assets/images/fitstyle_ai_logo_1780811765736.png";
import featuredWeddingDress from "../assets/images/wedding.jpeg";

interface LandingPageProps {
  products: Product[];
  currentUser: UserProfile | null;
  onLogout: () => void;
  onDeleteAccount?: () => void;
  activeView: "home" | "cart";
  setActiveView: (view: "home" | "cart") => void;
  onSignIn: (message?: string, redirectTarget?: string) => void;
  onEnterFittingStudio: () => void;
  cartItems: CartItem[];
  onOpenCart: () => void;
  onProceedToPayment: () => void;
  onUpdateCartQuantity: (productId: string, quantity: number) => void;
  onRemoveCartItem: (productId: string) => void;
}

export default function LandingPage({ 
  products, 
  currentUser, 
  onLogout,
  onDeleteAccount,
  activeView, 
  setActiveView, 
  onSignIn, 
  onEnterFittingStudio,
  cartItems,
  onOpenCart,
  onProceedToPayment,
  onUpdateCartQuantity,
  onRemoveCartItem
}: LandingPageProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [settingsActive, setSettingsActive] = useState(false);

  const initials = currentUser
    ? currentUser.fullName
      ? currentUser.fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
      : currentUser.email[0].toUpperCase()
    : "";

  const handleStartTransformation = () => {
    if (!currentUser) {
      onSignIn("Sign in to start your style transformation", "fitting-studio");
    } else {
      onEnterFittingStudio();
    }
  };

  const handleSignInClick = () => {
    if (!currentUser) {
      onSignIn("", "home");
    } else {
      setShowDropdown(!showDropdown);
    }
  };

  return (
    <div className="min-h-screen bg-[#fff7f9] text-[#221920] font-sans selection:bg-[#fae9f3] selection:text-[#5a005a]">
      {/* TopAppBar */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-purple-50 shadow-sm">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center w-full">
          {/* Logo Brand Frame */}
          <div 
            onClick={() => setActiveView("home")} 
            className="flex items-center gap-4 cursor-pointer"
          >
            <img 
              id="top-bar-logo"
              alt="FitStyle AI" 
              className="h-11 w-11 rounded-full object-cover shadow-sm border border-purple-100" 
              src={fitStyleLogo}
              referrerPolicy="no-referrer"
            />
            <span className="text-2xl font-serif font-bold italic text-purple-900">FitStyle AI</span>
          </div>

          {/* Header Action Items */}
          <div className="flex items-center gap-4">
            <button 
              onClick={onOpenCart}
              className={`relative rounded-xl p-2 transition-opacity hover:bg-purple-50 hover:opacity-80 cursor-pointer ${activeView === "cart" ? "bg-purple-50 text-purple-950" : "text-purple-900"}`}
              title="Product Cart"
            >
              <ShoppingBag className="w-6 h-6" />
              {cartItems.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-900 px-1 text-[9px] font-bold text-white">
                  {cartItems.reduce((total, item) => total + item.quantity, 0)}
                </span>
              )}
            </button>
            
            {currentUser ? (
              /* User authenticated state circle avatar dropdown */
              <div className="relative">
                <button 
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 p-1 text-purple-950 hover:bg-purple-50 rounded-xl transition-all border border-transparent hover:border-purple-100 cursor-pointer"
                  title="User Account Menu"
                >
                  <div className="w-9 h-9 rounded-full bg-purple-900 text-white font-sans text-xs font-black flex items-center justify-center border-2 border-purple-100 shadow-sm uppercase">
                    {initials}
                  </div>
                  <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider text-purple-950 pr-1">
                    {currentUser.fullName ? currentUser.fullName.split(" ")[0] : "Shopper"}
                  </span>
                </button>

                {/* Dropdown menu panel */}
                {showDropdown && (
                  <div 
                    className="absolute right-0 mt-2.5 w-56 bg-white border border-purple-100 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-3 duration-200"
                    onMouseLeave={() => setShowDropdown(false)}
                  >
                    <div className="px-4 py-2 border-b border-purple-50 select-none">
                      <p className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider">Shopper Account</p>
                      <p className="text-xs font-bold text-purple-950 truncate">{currentUser.fullName}</p>
                    </div>

                    <div className="h-px bg-purple-50 my-1" />

                    <button
                      onClick={() => {
                        setShowDropdown(false);
                        onLogout();
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-red-50 text-xs font-bold text-red-600 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>

                    {onDeleteAccount && (
                      <button
                        onClick={() => {
                          setShowDropdown(false);
                          const confirmed = window.confirm(
                            "Permanently delete your account? This cannot be undone -- your profile, saved looks, and login will all be removed."
                          );
                          if (confirmed) {
                            onDeleteAccount();
                          }
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-red-50 text-xs font-bold text-red-800 flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Delete Account
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Public user guest account - Click Sign In trigger */
              <button 
                onClick={handleSignInClick}
                className="p-2 text-purple-900 hover:opacity-80 transition-opacity flex items-center gap-1.5 cursor-pointer"
                title="User Account"
              >
                <User className="w-6 h-6" />
                <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-purple-900">Sign In</span>
              </button>
            )}
          </div>
        </nav>
      </header>

      {/* Main Content Area */}
      <main>
        {activeView === "cart" && (
          <ProductCartPage
            cartItems={cartItems}
            onUpdateQuantity={onUpdateCartQuantity}
            onRemoveItem={onRemoveCartItem}
            onContinueShopping={() => setActiveView("home")}
            onProceedToPayment={onProceedToPayment}
          />
        )}

        {activeView === "home" && (
          <>
            {/* Hero Section */}
            <section className="relative min-h-[870px] flex items-center overflow-hidden bg-[#ffeff8] px-6 md:px-16">
              <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center py-12 w-full">
                <div className="z-10 text-center md:text-left space-y-6">
                  <span className="font-sans text-xs font-bold text-[#ac2471] tracking-widest uppercase mb-4 block">
                    Personal AI Stylist & Skeletal Calibration
                  </span>
                  <h1 className="font-serif text-5xl md:text-6xl font-bold text-purple-950 leading-tight">
                    Find Your Perfect Outfit with AI
                  </h1>
                  <p className="font-sans text-base md:text-lg text-zinc-600 max-w-xl leading-relaxed">
                    Experience curated elegance tailored to your unique silhouette and style preferences. Your digital concierge for a sophisticated wardrobe.
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start pt-2">
                    <button 
                      onClick={handleStartTransformation}
                      className="hero-gradient text-white px-10 py-4 rounded-full font-sans text-sm font-semibold shadow-lg shadow-purple-900/20 hover:scale-105 transition-transform cursor-pointer"
                    >
                      Start Your Transformation
                    </button>
                  </div>
                </div>

                <div className="relative mt-8 md:mt-0 flex justify-center">
                  <div className="relative w-full max-w-[420px] aspect-[4/5] rounded-xl overflow-hidden shadow-2xl">
                    <img 
                      className="w-full h-full object-cover" 
                      alt="High fashion tailored neutral-toned suit ensemble" 
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDmOCbfAAg4aWFQ_GCG_2bY9LA-P519Reezzik7Ep6hYC0Z-hCpPdVUlAE_HwPQemfNn7BMprSx6bRrqVYlhHmGUsg1rnBH6lJGHWEMk51SagrXwTJjvQDmXSIao396QOTeBUrBVbct7ZUDv1hfq-yb1NPJ6pVOMeAqcPZzllzCXBy-LeeT_oqicoT2w2PLwDMeKpSAbBFLgJ4VR1QBpYIycK3beI-W9hKXV9eJb6du4g2LhRaYG03c3CPiV8Jc_CrYLLocafVkhrU"
                      referrerPolicy="no-referrer"
                    />
                    {/* Recommendation Glass Overlay Card */}
                    <div className="absolute bottom-6 left-6 right-6 glass-card p-6 rounded-lg border border-white/30 shadow-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-sans text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-[#ac2471]" />
                          AI Recommendation
                        </span>
                        <Sparkles className="w-4 h-4 text-purple-900 opacity-60" />
                      </div>
                      <p className="font-serif italic text-purple-950 text-sm">
                        "A tailored blazer with silk trousers — Perfect for your morning boardroom presentation."
                      </p>
                    </div>
                  </div>
                  {/* Decorative Glow */}
                  <div className="absolute -top-12 -right-12 w-48 h-48 bg-purple-300/35 rounded-full blur-3xl -z-10" />
                </div>
              </div>
            </section>

            {/* How it Works Section */}
            <section className="py-24 bg-white px-6 md:px-16" id="journey">
              <div className="max-w-7xl mx-auto text-center mb-16 space-y-4">
                <h2 className="font-serif text-3xl md:text-4xl font-bold text-purple-950">The Effortless Journey</h2>
                <div className="w-24 h-1 bg-pink-300 mx-auto rounded-full" />
              </div>

              <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
                {/* Step 1 */}
                <div className="group text-center p-8 rounded-xl hover:bg-[#fff7f9] hover:shadow-xl transition-all duration-300">
                  <div className="w-20 h-20 bg-[#ffd7f5] text-purple-950 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-purple-900 mb-3">1. Upload</h3>
                  <p className="font-sans text-sm text-zinc-600 leading-relaxed">
                    Securely upload your photo or link your existing wardrobe. Our AI analyzes your unique silhouette and style history.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="group text-center p-8 rounded-xl hover:bg-[#fff7f9] hover:shadow-xl transition-all duration-300">
                  <div className="w-20 h-20 bg-pink-150 text-pink-700 bg-[#ffd8e6] rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <Calendar className="w-8 h-8" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-purple-900 mb-3">2. Select Occasion</h3>
                  <p className="font-sans text-sm text-zinc-600 leading-relaxed">
                    Tell us where you're going. Whether it's a corporate gala, a weekend escape, or a high-stakes meeting.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="group text-center p-8 rounded-xl hover:bg-[#fff7f9] hover:shadow-xl transition-all duration-300">
                  <div className="w-20 h-20 bg-purple-900 text-white rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                    <Shirt className="w-8 h-8" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-purple-900 mb-3">3. Get Outfit</h3>
                  <p className="font-sans text-sm text-zinc-600 leading-relaxed">
                    See your AI-curated look instantly. Complete with accessories and styling tips from our virtual digital concierge.
                  </p>
                </div>
              </div>
            </section>

            {/* Featured Bento Section */}
            <section className="py-24 px-6 md:px-16 bg-[#fae9f3]">
              <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  
                  {/* Product Flatlay Block */}
                  <div className="md:col-span-2 md:row-span-2 bg-white rounded-xl overflow-hidden shadow-lg group relative min-h-[400px]">
                    <img 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                      alt="Featured ivory lace mermaid bridal gown"
                      src={featuredWeddingDress}
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-purple-950/70 to-transparent flex flex-col justify-end p-8">
                      <div className="inline-flex items-center gap-2 uppercase tracking-[.24em] text-[10px] font-extrabold text-white/90 bg-white/10 px-3 py-1 rounded-full mb-4">
                        <span className="w-2 h-2 rounded-full bg-pink-400"></span>
                        Featured Wedding Gown
                      </div>
                      <h4 className="text-white font-serif text-3xl font-bold mb-3">Ivory Lace Mermaid Bridal Gown</h4>
                      <p className="text-white/90 font-sans text-sm max-w-xl">A couture-inspired bridal moment made to be showcased in the Grok recommendation experience.</p>
                    </div>
                  </div>

                

                  {/* Stat Block 1 */}
                  <div className="bg-white rounded-xl overflow-hidden shadow-lg p-6 flex flex-col items-center justify-center text-center">
                    <Star className="w-10 h-10 text-pink-500 fill-pink-500 mb-4" />
                    <p className="font-serif text-lg font-bold text-purple-950">50k+ Styles Generated</p>
                    <p className="font-sans text-[10.5px] uppercase tracking-wider text-zinc-400 mt-1">Global User Co-signs</p>
                  </div>

                  {/* Stat Block 2 */}
                  <div className="bg-[#ffd8e6] rounded-xl overflow-hidden shadow-lg p-6 flex flex-col items-center justify-center text-center border border-[#fbc9df]">
                    <Users className="w-10 h-10 text-purple-950 mb-4" />
                    <p className="font-serif text-lg font-bold text-purple-950">Community Favorites</p>
                    <p className="font-sans text-[10.5px] uppercase tracking-wider text-purple-900 mt-1">Connoisseur Network</p>
                  </div>

                </div>
              </div>
            </section>

            {/* Call To Action Banner */}
            <section className="py-24 px-6 md:px-16 bg-[#fff7f9]">
              <div className="max-w-7xl mx-auto rounded-3xl hero-gradient p-12 md:p-24 text-center text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full -ml-32 -mb-32 blur-3xl pointer-events-none" />
                
                <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6 relative z-10">
                  Ready to Redefine Your Style?
                </h2>
                <p className="font-sans text-base md:text-lg mb-8 max-w-2xl mx-auto opacity-90 relative z-10 leading-relaxed">
                  Join thousands of professional women who have elevated their daily look with our intelligent fashion assistant.
                </p>
                <div className="relative z-10">
                  <button 
                    onClick={handleStartTransformation}
                    className="bg-white text-purple-950 hover:bg-slate-50 px-12 py-5 rounded-full font-sans text-sm font-bold shadow-xl hover:-translate-y-1 transition-all cursor-pointer"
                  >
                    Get Started For Free
                  </button>
                </div>
              </div>
            </section>
          </>
        )}


      </main>

      {/* Settings Modal (Placeholder as requested) */}
      {settingsActive && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-purple-100 shadow-2xl relative">
            <button 
              onClick={() => setSettingsActive(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-purple-950 cursor-pointer"
            >
              ✕
            </button>
            <h3 className="font-serif text-lg font-extrabold text-purple-950 mb-2">Profile Settings</h3>
            <p className="text-xs text-zinc-500 font-sans leading-relaxed mb-6">
              Manage your personal sizing preferences, skeletal calibration settings, and notifications directly.
            </p>
            <div className="space-y-4">
              <div className="font-sans">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Standard profile size</span>
                <p className="text-xs font-semibold text-slate-800">Calibrated Sizing Range: <strong className="text-[#ac2471]">S / M / L</strong></p>
              </div>
              <div className="font-sans">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-1">Authentication Session</span>
                <p className="text-xs font-mono text-slate-600 break-all">{currentUser?.email || "No email parsed"}</p>
              </div>
            </div>
            <button 
              onClick={() => setSettingsActive(false)}
              className="w-full mt-8 bg-purple-950 hover:bg-purple-900 text-white rounded-xl text-xs font-bold uppercase py-3 tracking-wider transition-all cursor-pointer"
            >
              Save Profile Settings
            </button>
          </div>
        </div>
      )}

      {/* Footer Container */}
      <footer className="bg-white border-t border-purple-50">
        <div className="mx-auto px-4 py-6 text-center">
          <p className="whitespace-nowrap font-sans text-[clamp(0.6rem,2.5vw,0.75rem)] tracking-wide text-zinc-400">
            © 2026 FitStyle AI — Curated Elegance for the Modern Woman.
          </p>
          </div>
      </footer>
    </div>
  );
}
