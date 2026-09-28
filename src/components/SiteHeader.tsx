import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Camera, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const linkCls = "text-sm text-muted-foreground hover:text-foreground";
const active = { className: "text-sm font-bold text-foreground" };

export function SiteHeader() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="no-print border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Link to="/" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-extrabold">
          <Camera className="h-5 w-5 text-primary" /> كاميرا بلان
        </Link>
        <nav className="flex flex-wrap items-center gap-5">
          <Link to="/catalog" className={linkCls} activeProps={active}>كتالوج الأجهزة</Link>
          <Link to="/calculator" className={linkCls} activeProps={active}>الحاسبة</Link>
          {signedIn ? (
            <>
              <Link to="/projects" className={linkCls} activeProps={active}>مشاريعي</Link>
              <Link to="/account" className={linkCls} activeProps={active}>حسابي</Link>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="ml-1 h-4 w-4" /> خروج
              </Button>
            </>
          ) : (
            <Button asChild size="sm"><Link to="/auth">تسجيل الدخول</Link></Button>
          )}
        </nav>
      </div>
    </header>
  );
}
