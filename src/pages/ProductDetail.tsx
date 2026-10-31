import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import {
  queryProducts,
  getCategories,
  getBrands,
  sectionFromSlug,
  type Product,
  type SortKey,
} from "@/lib/catalog";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const Products = () => {
  const [params, setParams] = useSearchParams();
  const { t, catLabel } = useLanguage();

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [brands, setBrands] = useState<{ brand: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const activeCategory = params.get("category") || "";
  const activeSectionSlug = params.get("section") || "";
  const activeSort = (params.get("sort") as SortKey) || "featured";
  const activeSearch = params.get("search") || "";
  const activePage = parseInt(params.get("page") || "1", 10);

  useEffect(() => {
    Promise.all([getCategories(), getBrands()]).then(([cats, brs]) => {
      setCategories(cats);
      setBrands(brs);
    });
  }, []);

  useEffect(() => {
    async function fetchList() {
      setLoading(true);
      try {
        const res = await queryProducts({
          category: activeCategory || undefined,
          section: sectionFromSlug(activeSectionSlug),
          search: activeSearch || undefined,
          sort: activeSort,
          page: activePage,
        });
        setProducts(res.items);
        setTotal(res.total);
        setPageCount(res.pageCount);
      } catch (e) {
        console.error("Error fetching products", e);
      } finally {
        setLoading(false);
      }
    }
    fetchList();
  }, [activeCategory, activeSectionSlug, activeSort, activeSearch, activePage]);

  const updateParam = (key: string, val: string) => {
    const next = new URLSearchParams(params);
    if (!val) next.delete(key);
    else next.set(key, val);
    next.set("page", "1");
    setParams(next);
  };

  return (
    <Layout>
      <div className="container-full py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {activeSectionSlug === "cctv"
                ? t("sectionCctv")
                : activeSectionSlug === "network"
                ? t("sectionNetwork")
                : activeCategory
                ? catLabel(activeCategory)
                : t("navProducts")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {total} {t("results")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={activeSort}
              onChange={(e) => updateParam("sort", e.target.value)}
              className="h-9 px-3 text-xs bg-card border border-border rounded-md focus:outline-none"
            >
              <option value="featured">{t("sortFeatured")}</option>
              <option value="price-asc">{t("sortPriceAsc")}</option>
              <option value="price-desc">{t("sortPriceDesc")}</option>
              <option value="name">{t("sortName")}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pt-6">
          <aside className="space-y-6">
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                {t("allCategories")}
              </h3>
              <div className="space-y-1 max-h-60 overflow-y-auto pe-1 text-xs">
                <button
                  onClick={() => updateParam("category", "")}
                  className={`w-full text-start py-1 px-2 rounded ${
                    !activeCategory ? "bg-primary text-primary-foreground font-bold" : "hover:bg-muted"
                  }`}
                >
                  {t("allCategories")}
                </button>
                {categories.map((c) => (
                  <button
                    key={c.category}
                    onClick={() => updateParam("category", c.category)}
                    className={`w-full text-start py-1 px-2 rounded flex justify-between ${
                      activeCategory === c.category
                        ? "bg-primary text-primary-foreground font-bold"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="truncate">{catLabel(c.category)}</span>
                    <span className="text-[10px] opacity-70">({c.count})</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="lg:col-span-3">
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20 border rounded-lg bg-muted/20">
                <p className="text-muted-foreground">{t("productNotFoundText")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {products.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} />
                ))}
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-2 pt-8">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={activePage <= 1}
                  onClick={() => updateParam("page", String(activePage - 1))}
                >
                  <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                  {t("prevPage")}
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {t("page")} {activePage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={activePage >= pageCount}
                  onClick={() => updateParam("page", String(activePage + 1))}
                >
                  {t("nextPage")}
                  <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Products;
