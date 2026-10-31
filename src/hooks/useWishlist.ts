import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "@/lib/catalog";

export interface WishlistItem {
  productId: string;
  name: string;
  brand: string;
  price: number;
  image: string | null;
}

const toWishlistItem = (product: Product): WishlistItem => ({
  productId: product.id,
  name: product.name,
  brand: product.brand,
  price: product.price,
  image: product.image_url,
});

interface WishlistState {
  items: WishlistItem[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  toggleItem: (product: Product) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
}

export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product) => {
        const { items } = get();
        if (!items.find((item) => item.productId === product.id)) {
          set({ items: [...items, toWishlistItem(product)] });
        }
      },
      removeItem: (productId) => {
        set({ items: get().items.filter((item) => item.productId !== productId) });
      },
      toggleItem: (product) => {
        const { items } = get();
        if (items.find((item) => item.productId === product.id)) {
          get().removeItem(product.id);
        } else {
          get().addItem(product);
        }
      },
      isInWishlist: (productId) => get().items.some((item) => item.productId === productId),
      clearWishlist: () => set({ items: [] }),
    }),
    { name: "az-wishlist" }
  )
);
