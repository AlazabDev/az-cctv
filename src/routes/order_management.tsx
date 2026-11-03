import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, RefreshCcw, ReceiptText } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";

type Invoice = {
  id: string;
  quotation_id: string;
  daftra_id: string | null;
  daftra_number: string | null;
  status: string;
  created_at: string;
  store_quotations: {
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    total: number | null;
    currency: string;
  } | null;
};
type Payload = { invoices: Invoice[]; window_hours: number; generated_at: string; limit: number };

export const Route = createFileRoute("/order_management")({
  head: () => ({ meta: [
    { title: "إدارة الفواتير الحديثة | AZ-CCTV" },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: OrderManagementPage,
});

function OrderManagementPage() {
  const [now, setNow] = useState(Date.now());
  const [user, setUser] = useState<"checking" | "signed_out" | "admin" | "forbidden">("checking");

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) { setUser("signed_out"); return; }
      const meta = data.user.app_metadata || {};
      setUser(meta.role === "admin" || meta.role === "super_admin" || meta.is_admin === true ? "admin" : "forbidden");
    };
    void check();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void check(); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const invoices = useQuery({
    queryKey: ["az-recent-invoices"],
    enabled: user === "admin",
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<Payload>("az-recent-invoices", {
        body: {},
      });
      if (error) throw error;
      if (!data || !Array.isArray(data.invoices)) throw new Error("استجابة الفواتير غير صالحة");
      return data;
    },
  });

  const visible = (invoices.data?.invoices || []).filter((row) =>
    Number.isFinite(Date.parse(row.created_at)) &&
    Date.parse(row.created_at) > now - 6 * 60 * 60 * 1000
  );
  const formatDate = (value: string) => new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo",
  }).format(new Date(value));

  return (
    <div dir="rtl" className="min-h-screen bg-[#F6F8FC] text-slate-900">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <Link to="/store" className="inline-flex items-center gap-2 text-sm font-bold text-[#030957]">
          <ArrowRight size={17} /> العودة للمتجر
        </Link>
        <header className="mt-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest text-slate-500">ORDER MANAGEMENT</p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black text-[#030957]">
              <ReceiptText /> الفواتير الحديثة
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              تعرض الصفحة فواتير AZ-CCTV المسجلة خلال آخر 6 ساعات. تختفي تلقائيًا بعد انتهاء المدة،
              دون حذف أصل الفاتورة أو السجل المحاسبي.
            </p>
          </div>
          {user === "admin" && (
            <button type="button" onClick={() => void invoices.refetch()}
              disabled={invoices.isFetching}
              className="inline-flex items-center gap-2 rounded-xl bg-[#030957] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
              <RefreshCcw size={16} /> تحديث الآن
            </button>
          )}
        </header>
        {user === "checking" && <p className="mt-8">جارٍ التحقق من صلاحيات الحساب…</p>}
        {user === "signed_out" && <section className="mt-8 rounded-2xl bg-white p-8">
          <p>هذه الصفحة مخصصة لإدارة المتجر. سجّل الدخول للمتابعة.</p>
          <Link to="/auth" className="mt-4 inline-block rounded-xl bg-[#FFB900] px-5 py-3 font-bold text-[#030957]">تسجيل الدخول</Link>
        </section>}
        {user === "forbidden" && <p role="alert" className="mt-8 rounded-2xl bg-white p-8 text-red-700">هذه الصفحة متاحة لمسؤولي المتجر فقط.</p>}
        {user === "admin" && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
              <h2 className="font-black text-[#030957]">الفواتير المعروضة: {visible.length}</h2>
              <span className="text-xs text-slate-500">تحديث تلقائي كل دقيقة</span>
            </div>
            {invoices.isLoading ? <p className="p-8">جارٍ تحميل الفواتير…</p>
              : invoices.error ? <p role="alert" className="p-8 text-red-700">تعذر جلب الفواتير: {invoices.error instanceof Error ? invoices.error.message : "خطأ غير معروف"}</p>
              : visible.length === 0 ? <p className="p-8 text-slate-500">لا توجد فواتير مسجلة خلال آخر 6 ساعات.</p>
              : <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-right text-sm">
                  <thead className="bg-slate-50 text-[#030957]">
                    <tr><th className="p-4">رقم الفاتورة</th><th className="p-4">العميل</th>
                      <th className="p-4">الهاتف</th><th className="p-4">البريد</th>
                      <th className="p-4">الإجمالي</th><th className="p-4">الحالة</th>
                      <th className="p-4">تاريخ الإنشاء</th><th className="p-4">الوقت المتبقي</th></tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const seconds = Math.max(0, Math.ceil((Date.parse(row.created_at) + 21600000 - now) / 1000));
                      const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
                      const q = row.store_quotations;
                      return <tr key={row.id} className="border-t border-slate-100">
                        <td className="p-4 font-bold text-[#030957]">{row.daftra_number || row.daftra_id || "قيد الإصدار"}</td>
                        <td className="p-4">{q?.customer_name || "—"}</td>
                        <td dir="ltr" className="p-4 text-right">{q?.customer_phone || "—"}</td>
                        <td className="p-4">{q?.customer_email || "—"}</td>
                        <td className="p-4">{q?.total == null ? "—" : Number(q.total).toLocaleString("ar-EG", {maximumFractionDigits:2}) + " " + (q.currency || "EGP")}</td>
                        <td className="p-4">{row.status === "confirmed" ? "مؤكدة" : row.status}</td>
                        <td className="p-4 whitespace-nowrap">{formatDate(row.created_at)}</td>
                        <td className="p-4 whitespace-nowrap">{hours} س {minutes} د</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>}
          </section>
        )}
      </main>
    </div>
  );
}
