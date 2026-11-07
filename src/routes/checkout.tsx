import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { useStoreCart } from "@/hooks/use-store-cart";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [{ title: "إتمام الشراء | AZ-CCTV" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: CheckoutPage,
});
function CheckoutPage() {
  const { items } = useStoreCart();
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !items.length) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke<{
        redirect_url?: string;
        error?: string;
      }>("az-checkout", {
        body: { name, phone, email, items: items.map((i) => ({ id: i.id, quantity: i.quantity })) },
      });
      if (error || !data?.redirect_url)
        throw new Error(data?.error || "تعذر إنشاء عملية الدفع. لم يتم تحصيل أي مبلغ.");
      const redirect = new URL(data.redirect_url);
      if (redirect.protocol !== "https:" || !redirect.hostname.endsWith(".paytabs.com"))
        throw new Error("رابط الدفع غير صالح");
      window.location.assign(redirect.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر بدء الدفع");
      setBusy(false);
    }
  }
  return (
    <div dir="rtl" className="min-h-screen bg-[#F6F8FC] text-slate-900">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <Link to="/cart" className="font-bold text-[#030957]">
          العودة للسلة
        </Link>
        <section className="mt-6 rounded-3xl bg-white p-7 shadow-sm">
          <h1 className="text-3xl font-black text-[#030957]">إتمام الشراء</h1>
          <p className="mt-3 text-sm text-slate-600">
            تُراجع الأسعار والتوفر في الخادم قبل إنشاء عملية الدفع. الهاتف إلزامي والبريد اختياري.
          </p>
          {!items.length ? (
            <p className="mt-6">السلة فارغة.</p>
          ) : (
            <form onSubmit={start} className="mt-7 space-y-5">
              <label className="block text-sm font-bold">
                اسم العميل *
                <input
                  required
                  minLength={2}
                  maxLength={150}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full rounded-xl border p-3"
                />
              </label>
              <label className="block text-sm font-bold">
                رقم واتساب مع كود الدولة *
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  placeholder="+201xxxxxxxxx"
                  pattern="\\+?[0-9]{10,15}"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-2 w-full rounded-xl border p-3"
                  dir="ltr"
                />
              </label>
              <label className="block text-sm font-bold">
                البريد الإلكتروني (اختياري)
                <input
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-xl border p-3"
                  dir="ltr"
                />
              </label>
              {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
                  {error}
                </p>
              )}
              <button
                disabled={busy}
                type="submit"
                className="w-full rounded-xl bg-[#FFB900] p-4 font-black text-[#030957] disabled:opacity-60"
              >
                {busy ? "جارٍ إنشاء رابط الدفع…" : "الانتقال إلى الدفع الآمن"}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
