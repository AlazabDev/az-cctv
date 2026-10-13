import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowUpLeft, LogOut, Menu, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";

const navClass = "text-sm font-bold text-slate-300 transition hover:text-[#FFB900]";

export function SiteHeader() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (live) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    setMenuOpen(false);
    await qc.cancelQueries();
    qc.clear();
    const { error } = await supabase.auth.signOut();
    if (error) return;
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="no-print relative z-30 border-b border-white/10 bg-[#030957] text-white">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-5 px-5">
        <BrandLogo light />
        <nav className="hidden items-center gap-8 md:flex" aria-label="القائمة الرئيسية">
          <Link to="/" className={navClass}>الرئيسية</Link>
          <Link to="/catalog" className={navClass}>كتالوج الأجهزة</Link>
          <Link to="/calculator" className={navClass}>الحاسبة</Link>
          {signedIn && <Link to="/projects" className={navClass}>لوحة التحكم</Link>}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {signedIn ? (
            <>
              <Link to="/account" className="text-sm font-bold text-slate-300 hover:text-[#FFB900]">حسابي</Link>
              <button type="button" onClick={signOut} className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-xs font-bold hover:bg-white/10"><LogOut className="h-4 w-4" /> خروج</button>
            </>
          ) : (
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-xl bg-[#FFB900] px-5 py-2.5 text-sm font-black text-[#030957] transition hover:bg-[#ffcf49]">دخول / تسجيل <ArrowUpLeft className="h-4 w-4" /></Link>
          )}
        </div>
        <button type="button" aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={menuOpen} onClick={() => setMenuOpen(x => !x)} className="rounded-lg border border-white/20 p-2 md:hidden">
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {menuOpen && <nav className="flex flex-col gap-1 border-t border-white/10 px-5 pb-5 pt-3 md:hidden" aria-label="قائمة الهاتف">
        {[
          { title: "الرئيسية", to: "/" },
          { title: "كتالوج الأجهزة", to: "/catalog" },
          { title: "الحاسبة", to: "/calculator" },
          { title: signedIn ? "لوحة التحكم" : "تسجيل الدخول", to: signedIn ? "/projects" : "/auth" },
          ...(signedIn ? [{ title: "حسابي", to: "/account" }] : []),
        ].map(link => <Link key={link.to} to={link.to} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-bold text-slate-200 hover:bg-white/10">{link.title}</Link>)}
        {signedIn && <button type="button" onClick={signOut} className="rounded-lg px-3 py-3 text-right text-sm font-bold text-[#FFB900]">تسجيل الخروج</button>}
      </nav>}
    </header>
  );
}
