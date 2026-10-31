import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shield, ArrowRight, Truck, Award, Headphones, Percent } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { queryProducts, getCategories, type Product } from "@/lib/catalog";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { t, catLabel } = useLanguage();
  const [featured, setFeatured] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [pRes, cRes] = await Promise.all([
          queryProducts({ page: 1, sort: "featured" }),
          getCategories(),
        ]);
        setFeatured(pRes.items.slice(0, 8));
        setCategories(cRes.slice(0, 12));
      } catch (err) {
        console.error("Failed to load catalog data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <Layout>
      <section className="relative bg-gradient-to-br from-primary via-primary/95 to-secondary text-primary-foreground py-16 md:py-24 overflow-hidden">
        <div className="container-full relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-bold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" />
              {t("brandTagline")}
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight">
              {t("heroTitle")}
            </h1>
            <p className="text-base md:text-lg text-primary-foreground/80 max-w-xl">
              {t("heroSubtitle")}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold">
                <Link to="/products">{t("heroCta")}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-primary-foreground/30 text-white hover:bg-primary-foreground/10">
                <Link to="/products?section=cctv">{t("sectionCctv")}</Link>
              </Button>
            </div>
          </div>

          <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-primary-foreground/10 aspect-[4/3] bg-primary/40 flex items-center justify-center">
            <img
              src="/src/assets/hero-cctv.jpg"
              alt="CCTV & Networking Systems"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=1200&q=80";
              }}
            />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-muted/40 py-6">
        <div className="container-full grid grid-cols-2 md:grid-cols-4 gap-4 text-center md:text-start">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <Award className="w-8 h-8 text-accent shrink-0" />
            <div>
              <p className="font-bold text-sm">{t("whyGenuine")}</p>
              <p className="text-xs text-muted-foreground">{t("whyGenuineText")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <Truck className="w-8 h-8 text-accent shrink-0" />
            <div>
              <p className="font-bold text-sm">{t("whyDelivery")}</p>
              <p className="text-xs text-muted-foreground">{t("whyDeliveryText")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <Headphones className="w-8 h-8 text-accent shrink-0" />
            <div>
              <p className="font-bold text-sm">{t("whySupport")}</p>
              <p className="text-xs text-muted-foreground">{t("whySupportText")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <Percent className="w-8 h-8 text-accent shrink-0" />
            <div>
              <p className="font-bold text-sm">{t("whyPrice")}</p>
              <p className="text-xs text-muted-foreground">{t("whyPriceText")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14 container-full">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("categoriesTitle")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("categoriesSubtitle")}</p>
          </div>
          <Link to="/products" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
            {t("viewAll")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {categories.map((c) => (
            <Link
              key={c.category}
              to={`/products?category=${encodeURIComponent(c.category)}`}
              className="p-4 rounded-lg border border-border bg-card hover:border-primary hover:shadow-sm transition-all text-center flex flex-col justify-center min-h-[90px]"
            >
              <span className="font-medium text-xs text-foreground line-clamp-2">{catLabel(c.category)}</span>
              <span className="text-[11px] text-muted-foreground mt-1 font-mono">{c.count} {t("results")}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="py-14 bg-muted/20 border-t border-border">
        <div className="container-full">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("featuredTitle")}</h2>
              <p className="text-sm text-muted-foreground mt-1">870+ منتج جاهز للشحن الفوري</p>
            </div>
            <Link to="/products" className="text-sm font-semibold text-primary hover:underline flex items-center gap-1">
              {t("viewAll")} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {featured.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default Index;
