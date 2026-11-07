import { Camera } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { brandLogoUrl } from "@/lib/brand-assets";

export function BrandLogo({
  compact = false,
  light = false,
}: {
  compact?: boolean;
  light?: boolean;
}) {
  return (
    <Link
      to="/"
      aria-label="AZCCTV — الصفحة الرئيسية"
      className="inline-flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FFB900]"
    >
      {brandLogoUrl ? (
        <img
          src={brandLogoUrl}
          alt="شعار AZCCTV — كاميرا المراقبة"
          width={56}
          height={56}
          className="h-12 w-12 shrink-0 rounded-xl object-contain shadow-[0_8px_24px_rgba(3,9,87,.12)] md:h-14 md:w-14"
        />
      ) : (
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#FFB900]/40 bg-[#030957] text-[#FFB900]">
          <Camera className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      {!compact && (
        <span className="flex flex-col text-right" dir="ltr">
          <span
            className={
              "text-xl font-black tracking-tight " + (light ? "text-white" : "text-foreground")
            }
          >
            AZ<span className="text-[#FFB900]">CCTV</span>
          </span>
          <span
            className={
              "text-[10px] font-semibold tracking-[.12em] " +
              (light ? "text-white/65" : "text-muted-foreground")
            }
          >
            SECURITY DESIGN PLATFORM
          </span>
        </span>
      )}
    </Link>
  );
}
