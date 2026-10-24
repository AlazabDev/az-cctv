import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, CircleHelp, MapPinned, Network, PanelLeftClose, PanelLeftOpen, Settings, ShoppingCart, Video } from "lucide-react";
import { cctvModuleRegistry, type CctvModuleId } from "@/lib/cctv/module-services";

export type { CctvModuleId } from "@/lib/cctv/module-services";

const moduleIcons = {
  plan: Video,
  topology: Network,
  map: MapPinned,
  offer: ShoppingCart,
  agent: Bot,
} as const;


type Props = {
  activeModule: CctvModuleId;
  onSelectModule: (module: CctvModuleId) => void;
};

export function CctvPrimarySidebar({ activeModule, onSelectModule }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <aside
      dir="rtl"
      aria-label="التنقل الرئيسي لنظام CCTV"
      className={`no-print flex h-full shrink-0 flex-col border-l border-border bg-surface transition-[width] duration-200 ${collapsed ? "w-[68px]" : "w-[228px]"}`}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
        {!collapsed && <span className="truncate text-sm font-black text-primary">AZ-CCTV</span>}
        <button
          type="button"
          onClick={() => setCollapsed((current) => !current)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
          title={collapsed ? "توسيع القائمة" : "طي القائمة"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="المديولات الخمسة">
        {!collapsed && <p className="px-3 pb-2 pt-3 text-[11px] font-bold text-muted-foreground">المديولات</p>}
        <div className="space-y-1">
          {cctvModuleRegistry.map(({ id, label, services }) => {
            const Icon = moduleIcons[id];
            const selected = activeModule === id;
            return (
              <div key={id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => onSelectModule(id)}
                  title={label}
                  aria-current={selected ? "page" : undefined}
                  aria-expanded={selected && !collapsed}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-right text-sm font-semibold transition-colors ${selected ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {!collapsed && <span>{label}</span>}
                </button>
                {selected && !collapsed && (
                  <div className="mr-5 space-y-0.5 border-r border-border pr-3" aria-label={`خدمات ${label}`}>
                    {services.map((service) => (
                      <div
                        key={service.id}
                        title={service.status === "planned" ? "خدمة مخططة ولم تُنفذ بعد" : service.label}
                        className="flex items-start gap-2 rounded-md px-2 py-1 text-xs leading-5 text-muted-foreground"
                      >
                        <span className="min-w-0 flex-1">{service.label}</span>
                        {service.status === "planned" && <span className="shrink-0 text-[10px]">لاحقًا</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
      <div className="shrink-0 border-t border-border p-2">
        {!collapsed && <p className="px-3 py-2 text-[11px] font-bold text-muted-foreground">الدعم والإعدادات</p>}
        <button
          type="button"
          onClick={() => setHelpOpen((current) => !current)}
          title="الدعم"
          aria-expanded={helpOpen}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-right text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CircleHelp className="h-5 w-5 shrink-0" />
          {!collapsed && <span>الدعم</span>}
        </button>
        {helpOpen && (
          <div role="region" aria-label="إرشادات الدعم" className="mx-2 mb-2 rounded-lg border border-border bg-background p-3 text-xs leading-6 text-muted-foreground">
            <p>يمكنك إدارة المشروع من المديولات الخمسة، والحفظ من شريط المشروع العلوي.</p>
            <p>للإبلاغ عن مشكلة، اذكر اسم المديول والخطوة التي ظهرت فيها المشكلة.</p>
          </div>
        )}
        <Link
          to="/account"
          title="الإعدادات"
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-right text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-5 w-5 shrink-0" />
          {!collapsed && <span>الإعدادات</span>}
        </Link>
      </div>
    </aside>
  );
}
