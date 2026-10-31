import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Shield, Truck, Heart, ArrowRight, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { QuantitySelector } from "@/components/QuantitySelector";
import {
  getProductById,
  getRelatedProducts,
  parseSpecs,
  type Product,
} from "@/lib/catalog";
import { useWishlist } from "@/hooks/useWishlist";
import { useCart } from "@/hooks/useCart";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ProductDetail = () => {
  const { slug: id } = useParams<{ slug: string }>();
  const { fmtPrice, catLabel, t } = useLanguage();
  const { toast } = useToast();
  const { addItem: addWish, removeItem: removeWish, isInWishlist } = useWishlist();
  const { addItem: addCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getProductById(id).then(async (p) => {
      if (p) {
        setProduct(p);
        setSelectedImage(p.image_url || p.images?.[0] || "/placeholder.svg");
        const rel = await getRelatedProducts(p, 4);
        setRelated(rel);
      }
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="container-full py-20 text-center animate-pulse">
          <div className="h-8 bg-muted max-w-sm mx-auto rounded mb-4" />
          <div className="h-64 bg-muted max-w-lg mx-auto rounded" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container-full py-28 text-center">
          <h1 className="text-3xl font-bold mb-4">{t("productNotFound")}</h1>
          <p className="text-muted-foreground mb-8">{t("productNotFoundText")}</p>
          <Button asChild>
            <Link to="/products">{t("browseProducts")}</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const inWishlist = isInWishlist(product.id);
  const specs = parseSpecs(product.description);
  const allImages = Array.from(new Set([product.image_url, ...(product.images || [])].filter(Boolean))) as string[];

  return (
    <Layout>
      <div className="container-full py-10">
        <nav className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
          <Link to="/" className="hover:text-foreground">{t("navHome")}</Link>
          <span>/</span>
          <Link to="/products" className="hover:text-foreground">{t("navProducts")}</Link>
          <span>/</span>
          <Link to={`/products?category=${encodeURIComponent(product.category)}`} className="hover:text-foreground">
            {catLabel(product.category)}
          </Link>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div className="space-y-4">
            <div className="aspect-square bg-card border rounded-xl p-8 flex items-center justify-center overflow-hidden">
              <img
                src={selectedImage}
                alt={product.name}
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = "/placeholder.svg";
                }}
              />
            </div>
            {allImages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(img)}
                    className={`w-16 h-16 rounded border p-1 bg-card shrink-0 ${
                      selectedImage === img ? "border-primary ring-2 ring-primary/20" : "border-border"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent bg-primary px-2.5 py-1 rounded">
                {product.brand}
              </span>
              <h1 className="text-2xl md:text-3xl font-bold mt-3 text-foreground leading-snug">
                {product.name}
              </h1>
              {product.model && (
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  {t("modelLabel")}: {product.model}
                </p>
              )}
            </div>

            <div className="p-4 bg-muted/40 rounded-lg border flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-primary">
                {fmtPrice(product.price)}
              </span>
              {product.old_price && product.old_price > product.price && (
                <span className="text-sm text-muted-foreground line-through">
                  {fmtPrice(product.old_price)}
                </span>
              )}
              <span className="ms-auto text-xs font-semibold text-secondary flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {t("inStock")}
              </span>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <QuantitySelector quantity={quantity} onChange={setQuantity} min={1} max={99} />
              <Button
                size="lg"
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                onClick={() => {
                  addCart(product, quantity);
                  toast({ description: t("addedToBag") });
                }}
              >
                {t("addToBag")}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  if (inWishlist) removeWish(product.id);
                  else addWish(product);
                }}
              >
                <Heart className={`w-5 h-5 ${inWishlist ? "fill-destructive text-destructive" : ""}`} />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t text-xs">
              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded">
                <Shield className="w-4 h-4 text-accent" />
                <span>{t("returnsText")}</span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted/30 rounded">
                <Truck className="w-4 h-4 text-accent" />
                <span>{t("shippingText")}</span>
              </div>
            </div>

            {specs.length > 0 && (
              <div className="pt-4 border-t">
                <h3 className="font-bold text-sm mb-3">{t("specsTitle")}</h3>
                <div className="divide-y divide-border/60 border rounded-lg overflow-hidden text-xs">
                  {specs.map((s, i) => (
                    <div key={i} className="grid grid-cols-3 p-2.5 bg-card">
                      <span className="font-semibold text-muted-foreground">{s.label}</span>
                      <span className="col-span-2 text-foreground font-mono">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-20 pt-10 border-t">
            <h2 className="text-xl font-bold mb-6">{t("relatedTitle")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {related.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
};

export default ProductDetail;
