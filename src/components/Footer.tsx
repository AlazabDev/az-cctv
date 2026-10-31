import { Link, useNavigate } from "react-router-dom";
import { Search, Heart, Menu, X, Globe, Shield } from "lucide-react";
import { useState } from "react";
import { useWishlist } from "@/hooks/useWishlist";
import { CartIcon } from "@/components/CartIcon";
import { useLanguage } from "@/lib/i18n";

export const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { items } = useWishlist();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setMobileOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="bg-primary text-primary-foreground text-xs py-1.5 px-4 text-center font-medium">
        {t("heroSubtitle")}
      </div>

      <div className="container-full py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 text-foreground hover:opacity-90">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-lg">
            <Shield className="w-5 h-5 text-accent" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg leading-tight tracking-tight text-primary">
              AZ-CCTV
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              {t("brandTagline")}
            </span>
          </div>
        </Link>

        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full h-10 ps-10 pe-4 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:border-primary transition-colors"
          />
          <Search className="w-4 h-4 text-muted-foreground absolute top-1/2 -translate-y-1/2 start-3" />
        </form>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-foreground/80">
          <Link to="/" className="hover:text-primary transition-colors">{t("navHome")}</Link>
          <Link to="/products" className="hover:text-primary transition-colors">{t("navProducts")}</Link>
          <Link to="/products?section=cctv" className="hover:text-primary transition-colors">{t("navCctv")}</Link>
          <Link to="/products?section=network" className="hover:text-primary transition-colors">{t("navNetwork")}</Link>
          <Link to="/about" className="hover:text-primary transition-colors">{t("navAbout")}</Link>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
            title="Toggle Language"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t("language")}</span>
          </button>

          <Link
            to="/products"
            className="relative p-2 text-foreground/80 hover:text-foreground"
            title={t("wishlist")}
          >
            <Heart className="w-5 h-5" />
            {items.length > 0 && (
              <span className="absolute top-1 end-1 w-4 h-4 bg-accent text-accent-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {items.length}
              </span>
            )}
          </Link>

          <CartIcon />

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 text-foreground"
            aria-label="Toggle Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-border px-4 py-4 bg-background space-y-3">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full h-10 ps-10 pe-4 text-sm bg-muted/40 border border-border rounded-lg"
            />
            <Search className="w-4 h-4 text-muted-foreground absolute top-1/2 -translate-y-1/2 start-3" />
          </form>
          <div className="flex flex-col gap-2 pt-2 text-sm font-medium">
            <Link to="/" onClick={() => setMobileOpen(false)} className="py-2 border-b border-border/40">{t("navHome")}</Link>
            <Link to="/products" onClick={() => setMobileOpen(false)} className="py-2 border-b border-border/40">{t("navProducts")}</Link>
            <Link to="/products?section=cctv" onClick={() => setMobileOpen(false)} className="py-2 border-b border-border/40">{t("navCctv")}</Link>
            <Link to="/products?section=network" onClick={() => setMobileOpen(false)} className="py-2 border-b border-border/40">{t("navNetwork")}</Link>
            <Link to="/about" onClick={() => setMobileOpen(false)} className="py-2">{t("navAbout")}</Link>
          </div>
        </div>
      )}
    </header>
  );
};
