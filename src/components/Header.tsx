import { Link } from "react-router-dom";
import { Heart, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import type { Product } from "@/lib/catalog";
import { useWishlist } from "@/hooks/useWishlist";
import { useCart } from "@/hooks/useCart";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
  index?: number;
}

export const ProductCard = ({ product, index = 0 }: ProductCardProps) => {
  const { addItem: addWish, removeItem: removeWish, isInWishlist } = useWishlist();
  const { addItem: addCart } = useCart();
  const { fmtPrice, catLabel, t } = useLanguage();
  const { toast } = useToast();
  const inWishlist = isInWishlist(product.id);

  const image = product.image_url || product.images?.[0] || "/placeholder.svg";

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inWishlist) {
      removeWish(product.id);
      toast({ description: t("wishlistRemoved") });
    } else {
      addWish(product);
      toast({ description: t("wishlistAdded") });
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addCart(product, 1);
    toast({ description: t("addedToBag") });
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3) }}
      className="group bg-card border border-border/60 rounded-lg overflow-hidden flex flex-col hover:border-primary/40 hover:shadow-md transition-all"
    >
      <Link to={`/product/${product.id}`} className="relative block aspect-square bg-muted/30 overflow-hidden">
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/placeholder.svg";
          }}
        />

        <div className="absolute top-2 start-2 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded">
            {product.brand}
          </span>
          {!product.available && (
            <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded">
              {t("outOfStock")}
            </span>
          )}
        </div>

        <button
          onClick={handleWishlistToggle}
          className="absolute top-2 end-2 p-2 rounded-full bg-background/80 backdrop-blur-sm text-foreground hover:bg-background transition-colors"
          aria-label="Wishlist"
        >
          <Heart className={cn("w-4 h-4", inWishlist && "fill-destructive text-destructive")} />
        </button>
      </Link>

      <div className="p-3.5 flex flex-col flex-1">
        <span className="text-xs text-muted-foreground line-clamp-1 mb-1">
          {catLabel(product.category)}
        </span>

        <Link
          to={`/product/${product.id}`}
          className="font-medium text-sm text-foreground line-clamp-2 hover:text-primary transition-colors flex-1 mb-2"
        >
          {product.name}
        </Link>

        {product.model && (
          <span className="text-[11px] text-muted-foreground font-mono mb-2">
            {product.model}
          </span>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-auto">
          <div>
            <span className="font-bold text-base text-primary">
              {fmtPrice(product.price)}
            </span>
            {product.old_price && product.old_price > product.price && (
              <span className="text-xs text-muted-foreground line-through ms-2">
                {fmtPrice(product.old_price)}
              </span>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            disabled={!product.available}
            className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            title={t("addToBag")}
          >
            <ShoppingBag className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.article>
  );
};
