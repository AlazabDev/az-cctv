import { Camera } from "lucide-react";
import { Link } from "@tanstack/react-router";

const assets = import.meta.glob<string>("/src/assets/**/*.{svg,png,webp,jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
});
const logo = Object.entries(assets)
  .filter(([path]) => /(?:az.?cctv|logo|brand|primary|symbol|\/1\.svg)/i.test(path))
  .sort(([a], [b]) => rank(a) - rank(b))[0]?.[1];

function rank(path: string) {
  if (/primary.full|full.logo|horizontal/i.test(path)) return 0;
  if (/az.?cctv|logo/i.test(path)) return 1;
  if (/symbol/i.test(path)) return 2;
  return 3;
}

export function BrandLogo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <Link to="/" aria-label="AZCCTV — الصفحة الرئيسية" className="inline-flex items-center gap-3">
      {logo ? (
        <img src={logo} alt="شعار AZCCTV" className="h-12 w-12 shrink-0 object-contain md:h-14 md:w-14" />
      ) : (
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#FFB900]/40 bg-[#030957] text-[#FFB900]">
          <Camera className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      {!compact && (
        <span className="flex flex-col text-right" dir="ltr">
          <span className={"text-xl font-black tracking-tight " + (light ? "text-white" : "text-foreground")}>
            AZ<span className="text-[#FFB900]">CCTV</span>
          </span>
          <span className={"text-[10px] font-semibold tracking-[.12em] " + (light ? "text-white/65" : "text-muted-foreground")}>
            SECURITY DESIGN PLATFORM
          </span>
        </span>
      )}
    </Link>
  );
}
