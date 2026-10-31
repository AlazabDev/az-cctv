import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "@/lib/catalog";

export interface CartItem {
  productId: string;
  name: string;
  brand: string;
  price: number;
  image: string | null;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
}

const toCartItem = (product: Product, quantity: number): CartItem => ({
  productId: product.id,
  name: product.name,
  brand: product.brand,
  price: product.price,
  image: product.image_url,
  quantity,
});

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product: Product, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((item) => item.productId === product.id);
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.productId === product.id
                  ? { ...item, quantity: Math.min(item.quantity + quantity, 99) }
                  : item
              ),
            };
          }
          return { items: [...state.items, toCartItem(product, Math.max(1, quantity))] };
        });
      },

      updateQuantity: (productId: string, quantity: number) => {
        if (quantity < 1) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId
              ? { ...item, quantity: Math.min(quantity, 99) }
              : item
          ),
        }));
      },

      removeItem: (productId: string) => {
        set((state) => ({
          items: state.items.filter((item) => item.productId !== productId),
        }));
      },

      clearCart: () => set({ items: [] }),

      getSubtotal: () =>
        get().items.reduce((total, item) => total + item.price * item.quantity, 0),

      getItemCount: () => get().items.reduce((count, item) => count + item.quantity, 0),
    }),
    { name: "az-cart" }
  )
);
