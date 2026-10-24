import { ChevronLeft, X } from "lucide-react";
import { getCctvModule, type CctvModuleId, type CctvService } from "@/lib/cctv/module-services";

type Props = {
  moduleId: CctvModuleId;
  selectedServiceId: string | null;
  onSelectService: (service: CctvService) => void;
  onClose: () => void;
};

/** Dynamic navigation restricted to the services owned by the selected module. */
export function CctvServiceSidebar({
  moduleId,
  selectedServiceId,
  onSelectService,
  onClose,
}: Props) {
  const module = getCctvModule(moduleId);
  const chosen = module.services.find((service) => service.id === selectedServiceId);

  return (
    <aside
      dir="rtl"
      className="no-print flex h-full w-[256px] shrink-0 flex-col border-l border-border bg-muted/30"
      aria-label={`خدمات ${module.label}`}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border px-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{module.label}</p>
          <p className="truncate text-[11px] text-muted-foreground">الخدمات التابعة للمديول</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق قائمة الخدمات"
          title="إغلاق قائمة الخدمات"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
        aria-label={`خدمات ${module.label}`}
      >
        {module.services.map((service) => {
          const selected = selectedServiceId === service.id;
          const planned = service.status === "planned";
          return (
            <button
              key={service.id}
              type="button"
              disabled={planned}
              onClick={() => onSelectService(service)}
              aria-current={selected ? "true" : undefined}
              title={planned ? "هذه الخدمة قيد التطوير" : service.label}
              className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-right text-xs transition-colors ${
                selected
                  ? "bg-primary/10 font-semibold text-primary"
                  : planned
                    ? "cursor-not-allowed opacity-50"
                    : "text-foreground hover:bg-muted"
              }`}
            >
              <span className="min-w-0 flex-1">{service.label}</span>
              {planned ? (
                <span className="shrink-0 text-[10px]">قريبًا</span>
              ) : (
                <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </nav>
      <div
        className="shrink-0 border-t border-border p-3 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {chosen
          ? `الخدمة المحددة: ${chosen.label}`
          : `${module.services.length} خدمة — اختر الخدمة المطلوبة`}
      </div>
    </aside>
  );
}
