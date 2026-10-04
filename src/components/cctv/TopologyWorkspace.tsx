import { useMemo } from "react";
import { AlertTriangle, Camera, CheckCircle2, Globe, Network, Printer, Server, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hardwareById } from "@/lib/cctv/catalog";
import {
  ROUTER_ID,
  autoTopology,
  canParent,
  childrenOf,
  collectNodes,
  countCamerasBelow,
  linkLengthM,
  poeWatt,
  portsOf,
  topologyStats,
  validateTopology,
  type LinkMedia,
  type TopoLayout,
  type TopoNode,
  type TopologyData,
} from "@/lib/cctv/topology";

export function TopologyWorkspace({ layouts, topology, onChange }: { layouts: TopoLayout[]; topology: TopologyData; onChange: (t: TopologyData) => void }) {
  const nodes = useMemo(() => collectNodes(layouts), [layouts]);
  const issues = useMemo(() => validateTopology(topology, nodes), [topology, nodes]);
  const stats = useMemo(() => topologyStats(topology, nodes), [topology, nodes]);
  const all = [...nodes.values()].filter((n) => n.device.kind !== "rack");
  const roots = all.filter((n) => topology.parents[n.device.id] === ROUTER_ID);
  const orphans = all.filter((n) => { const p = topology.parents[n.device.id]; return !p || (p !== ROUTER_ID && !nodes.has(p)); });
  const switches = all.filter((n) => n.device.kind === "switch" || n.device.kind === "nvr");
  const errors = issues.filter((i) => i.level === "error").length;
  const issueBy = (id: string) => issues.filter((i) => i.deviceId === id);

  const setParent = (id: string, parent: string) => {
    const parents = { ...topology.parents };
    if (parent) parents[id] = parent; else delete parents[id];
    const child = nodes.get(id), p = nodes.get(parent);
    const media = { ...topology.media };
    if (child && p) { const len = linkLengthM(child, p); if (len === null && child.device.kind !== "camera") media[id] = "fiber"; }
    onChange({ parents, media });
  };
  const setMedia = (id: string, m: LinkMedia) => onChange({ ...topology, media: { ...topology.media, [id]: m } });

  const renderNode = (n: TopoNode, depth: number): React.ReactNode => {
    const d = n.device;
    const kids = childrenOf(topology, d.id, nodes).sort((a, b) => (a.device.kind === "camera" ? 1 : 0) - (b.device.kind === "camera" ? 1 : 0) || a.device.name.localeCompare(b.device.name));
    const parent = nodes.get(topology.parents[d.id] ?? "");
    const len = parent ? linkLengthM(n, parent) : null;
    const media = topology.media[d.id] ?? "utp";
    const ports = portsOf(d);
    const hasUplink = d.kind === "switch" && !!topology.parents[d.id];
    const used = kids.length + (hasUplink ? 1 : 0);
    const load = kids.filter((k) => k.device.kind === "camera").reduce((s, k) => s + poeWatt(k.device), 0);
    const budget = hardwareById(d.specId)?.poeBudget;
    const myIssues = issueBy(d.id);
    const Icon = d.kind === "camera" ? Camera : d.kind === "nvr" ? Server : Network;
    const options = switches.filter((p) => canParent(d, p.device));
    return (
      <div key={d.id} style={{ marginInlineStart: depth ? 22 : 0 }} className={depth ? "border-s border-dashed border-border ps-3" : ""}>
        <div className={`my-1.5 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${myIssues.some((i) => i.level === "error") ? "border-destructive/60 bg-destructive/10" : myIssues.length ? "border-accent/60 bg-accent/10" : "border-border bg-surface"}`}>
          <Icon className={`h-4 w-4 ${d.kind === "camera" ? "text-primary" : "text-accent"}`} />
          <span className="font-semibold">{d.name}</span>
          <span className="text-[11px] text-muted-foreground">{n.layoutName}</span>
          {d.kind !== "camera" && <span className="rounded bg-muted px-1.5 text-[11px]">{used}/{ports} {d.kind === "nvr" ? "قناة" : "منفذ"}</span>}
          {d.kind === "nvr" && <span className="rounded bg-muted px-1.5 text-[11px]">{countCamerasBelow(topology, d.id, nodes)} كاميرا</span>}
          {budget ? <span className={`rounded px-1.5 text-[11px] ${load > budget ? "bg-destructive/20 text-destructive" : "bg-muted"}`}>PoE {load}/{budget}W</span> : null}
          {d.kind === "camera" && <span className="text-[11px] text-muted-foreground">{poeWatt(d)}W</span>}
          {parent && <span className="text-[11px] text-muted-foreground">{len === null ? "بين طوابق" : `≈ ${len.toFixed(1)}م`}</span>}
          <div className="ms-auto flex items-center gap-1.5 no-print">
            {topology.parents[d.id] && topology.parents[d.id] !== ROUTER_ID && (
              <select className="h-7 rounded border border-border bg-background px-1 text-xs" value={media} onChange={(e) => setMedia(d.id, e.target.value as LinkMedia)}>
                <option value="utp">UTP</option><option value="fiber">Fiber</option>
              </select>
            )}
            <select className="h-7 max-w-40 rounded border border-border bg-background px-1 text-xs" value={topology.parents[d.id] ?? ""} onChange={(e) => setParent(d.id, e.target.value)}>
              <option value="">— غير متصل —</option>
              {d.kind !== "camera" && <option value={ROUTER_ID}>Router / Internet</option>}
              {options.map((p) => <option key={p.device.id} value={p.device.id}>{p.device.name} ({p.layoutName})</option>)}
            </select>
          </div>
        </div>
        {kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-1 overflow-hidden bg-muted/20">
      <div className="flex-1 overflow-auto p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
          <h2 className="text-lg font-bold">Network Topology</h2>
          <span className="text-xs text-muted-foreground">كل جهاز متصل بمين وكيف</span>
          <div className="ms-auto flex gap-2">
            <Button size="sm" onClick={() => onChange(autoTopology(layouts))}><Sparkles className="h-4 w-4" />توليد تلقائي</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة</Button>
          </div>
        </div>
        {all.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">أضف كاميرات وسويتشات وNVR في Plan Design أولاً.</p>
        ) : (
          <>
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-sm font-semibold"><Globe className="h-4 w-4 text-primary" />Internet / Router</div>
            <div className="border-s border-dashed border-border ps-3" style={{ marginInlineStart: 12 }}>
              {roots.length ? roots.map((r) => renderNode(r, 0)) : <p className="py-2 text-xs text-muted-foreground">لا توجد أجهزة متصلة بالراوتر بعد — اضغط "توليد تلقائي".</p>}
            </div>
            {orphans.length > 0 && (
              <div className="mt-6">
                <p className="mb-1 text-sm font-bold text-destructive">أجهزة غير متصلة ({orphans.length})</p>
                {orphans.map((o) => renderNode(o, 0))}
              </div>
            )}
          </>
        )}
      </div>
      <aside className="w-80 shrink-0 overflow-auto border-s border-border bg-surface p-4 no-print">
        <p className="font-bold">التحقق من الشبكة</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <Stat label="كاميرات" value={all.filter((n) => n.device.kind === "camera").length} />
          <Stat label="سويتشات" value={all.filter((n) => n.device.kind === "switch").length} />
          <Stat label="UTP تقديري" value={`${stats.utpM.toFixed(0)}م`} />
          <Stat label="روابط فايبر" value={stats.fiberLinks} />
        </div>
        {stats.fiberUnknown > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{stats.fiberUnknown} رابط فايبر بين طوابق — طولها يُقاس من مسار الكابل الفعلي.</p>}
        <div className={`mt-4 flex items-center gap-2 rounded-lg p-2 text-sm font-semibold ${errors ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}>
          {errors ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {errors ? `${errors} خطأ يجب إصلاحه` : "الشبكة سليمة"}
        </div>
        <ul className="mt-3 space-y-2">
          {issues.map((i, idx) => (
            <li key={idx} className="flex gap-2 text-xs leading-5">
              {i.level === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />}
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-border p-2"><p className="text-base font-bold">{value}</p><p className="text-muted-foreground">{label}</p></div>;
}
