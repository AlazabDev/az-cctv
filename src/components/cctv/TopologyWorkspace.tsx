import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Globe,
  Network,
  Printer,
  Server,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cableTypes } from "@/lib/cctv/catalog";
import { reviewNetworkTopology, type NetworkReviewResult } from "@/lib/topology-ai.functions";
import {
  ROUTER_ID,
  autoTopology,
  buildNetworkReviewContext,
  canParent,
  childrenOf,
  collectNodes,
  effectiveCapabilities,
  camerasForRecorder,
  mediaConvertersForLink,
  normalizeTopology,
  poePortsOf,
  poeWatt,
  recorderChannelsOf,
  resolveLinkRoute,
  topologyStats,
  validateTopology,
  type EngineeringCapabilityOverride,
  type LinkLengthMode,
  type LinkMedia,
  type TopoLayout,
  type TopoNode,
  type TopologyData,
} from "@/lib/cctv/topology";

export function TopologyWorkspace({
  layouts,
  topology: rawTopology,
  onChange,
}: {
  layouts: TopoLayout[];
  topology: TopologyData;
  onChange: (t: TopologyData) => void;
}) {
  const topology = useMemo(() => normalizeTopology(rawTopology), [rawTopology]);
  const nodes = useMemo(() => collectNodes(layouts), [layouts]);
  const issues = useMemo(
    () => validateTopology(topology, nodes, layouts),
    [topology, nodes, layouts],
  );
  const stats = useMemo(() => topologyStats(topology, nodes, layouts), [topology, nodes, layouts]);
  const all = [...nodes.values()].filter((n) => n.device.kind !== "rack");
  const roots = all.filter((n) => topology.parents[n.device.id] === ROUTER_ID);
  const orphans = all.filter((n) => {
    const p = topology.parents[n.device.id];
    return !p || (p !== ROUTER_ID && !nodes.has(p));
  });
  const networkParents = all.filter((n) => n.device.kind === "switch" || n.device.kind === "nvr");
  const nvrs = all.filter((n) => n.device.kind === "nvr");
  const errors = issues.filter((i) => i.level === "error").length;
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<NetworkReviewResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [specDeviceId, setSpecDeviceId] = useState<string>(
    () => networkParents[0]?.device.id ?? "",
  );

  const issueBy = (id: string) => issues.filter((i) => i.deviceId === id);
  const patch = (next: Partial<TopologyData>) =>
    onChange(normalizeTopology({ ...topology, ...next }));

  const setParent = (id: string, parent: string) => {
    const parents = { ...topology.parents };
    if (parent) parents[id] = parent;
    else delete parents[id];
    const media = { ...topology.media };
    const routeBindings = { ...topology.routeBindings };
    if (parent && !media[id]) media[id] = "utp";
    if (parent && !routeBindings[id])
      routeBindings[id] = { mode: "estimated", cableTypeId: "cat6-stp" };
    patch({ parents, media, routeBindings });
  };

  const setMedia = (id: string, medium: LinkMedia) => {
    const media = { ...topology.media, [id]: medium };
    const current = topology.routeBindings[id] ?? { mode: "estimated" as const };
    const wantedCategory = medium === "fiber" ? "fiber" : "network";
    const currentType = cableTypes.find((c) => c.id === current.cableTypeId);
    const fallback =
      medium === "fiber"
        ? undefined
        : (cableTypes.find((c) => c.id === "cat6-stp")?.id ??
          cableTypes.find((c) => c.category === "network")?.id);
    const nextType = currentType?.category === wantedCategory ? current.cableTypeId : fallback;
    const { cableTypeId: _omitType, ...restBinding } = current;
    const routeBindings: typeof topology.routeBindings = {
      ...topology.routeBindings,
      [id]: nextType ? { ...restBinding, cableTypeId: nextType } : restBinding,
    };
    patch({ media, routeBindings });
  };

  const setRouteBinding = (id: string, mode: LinkLengthMode, cableRunId?: string) => {
    const current = topology.routeBindings[id] ?? { mode: "estimated" as const };
    patch({
      routeBindings: {
        ...topology.routeBindings,
        [id]: (() => {
          const { cableRunId: _omitRun, ...rest } = current;
          return mode === "cable" && cableRunId ? { ...rest, mode, cableRunId } : { ...rest, mode };
        })(),
      },
    });
  };

  const setCableType = (id: string, cableTypeId: string) => {
    const current = topology.routeBindings[id] ?? { mode: "estimated" as const };
    patch({ routeBindings: { ...topology.routeBindings, [id]: { ...current, cableTypeId } } });
  };

  const setRecorder = (cameraId: string, recorderId: string) => {
    const recorders = { ...topology.recorders };
    if (recorderId) recorders[cameraId] = recorderId;
    else delete recorders[cameraId];
    patch({ recorders });
  };

  const updateOverride = (id: string, next: Partial<EngineeringCapabilityOverride>) => {
    patch({
      deviceOverrides: {
        ...topology.deviceOverrides,
        [id]: { ...(topology.deviceOverrides[id] ?? {}), ...next },
      },
    });
  };

  const runAiReview = async () => {
    setReviewing(true);
    setReview(null);
    setReviewError(null);
    try {
      const result = await reviewNetworkTopology({
        data: { context: buildNetworkReviewContext(topology, layouts) },
      });
      if ("error" in result && result.error) setReviewError(result.error);
      else if ("review" in result && result.review) setReview(result.review);
    } catch {
      setReviewError("تعذّر تشغيل AI Network Review.");
    } finally {
      setReviewing(false);
    }
  };

  const renderNode = (n: TopoNode, depth: number): React.ReactNode => {
    const d = n.device;
    const kids = childrenOf(topology, d.id, nodes).sort(
      (a, b) =>
        (a.device.kind === "camera" ? 1 : 0) - (b.device.kind === "camera" ? 1 : 0) ||
        a.device.name.localeCompare(b.device.name),
    );
    const parentId = topology.parents[d.id] ?? "";
    const route = parentId ? resolveLinkRoute(d.id, topology, nodes, layouts) : null;
    const medium = topology.media[d.id] ?? "utp";
    const cap = effectiveCapabilities(d, topology);
    const cameras = kids.filter((k) => k.device.kind === "camera");
    const load = cameras.reduce((s, k) => s + poeWatt(k.device), 0);
    const myIssues = issueBy(d.id);
    const Icon = d.kind === "camera" ? Camera : d.kind === "nvr" ? Server : Network;
    const parentOptions = networkParents.filter((p) => canParent(d, p.device, topology));
    const binding = topology.routeBindings[d.id] ?? { mode: "estimated" as const };
    const cableOptions = layouts.flatMap((l) =>
      l.cables.map((c) => ({ ...c, layoutName: l.layoutName })),
    );
    const cableCategory = medium === "fiber" ? "fiber" : "network";

    return (
      <div
        key={d.id}
        style={{ marginInlineStart: depth ? 22 : 0 }}
        className={depth ? "border-s border-dashed border-border ps-3" : ""}
      >
        <div
          className={`my-1.5 rounded-lg border px-3 py-2 text-sm ${myIssues.some((i) => i.level === "error") ? "border-destructive/60 bg-destructive/10" : myIssues.length ? "border-accent/60 bg-accent/10" : "border-border bg-surface"}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Icon className={`h-4 w-4 ${d.kind === "camera" ? "text-primary" : "text-accent"}`} />
            <span className="font-semibold">{d.name}</span>
            <span className="text-[11px] text-muted-foreground">{n.layoutName}</span>
            {d.kind === "switch" && (
              <span className="rounded bg-muted px-1.5 text-[11px]">
                Ethernet {kids.length}/{cap.ethernetPorts} · PoE {cameras.length}/{cap.poePorts}
              </span>
            )}
            {d.kind === "nvr" && (
              <span className="rounded bg-muted px-1.5 text-[11px]">
                Recording {camerasForRecorder(topology, d.id, nodes).length}/
                {recorderChannelsOf(d, topology)} · PoE {cameras.length}/{poePortsOf(d, topology)}
              </span>
            )}
            {cap.poeBudget !== undefined && (
              <span
                className={`rounded px-1.5 text-[11px] ${load > cap.poeBudget ? "bg-destructive/20 text-destructive" : "bg-muted"}`}
              >
                PoE {load}/{cap.poeBudget}W
              </span>
            )}
            {d.kind === "camera" && (
              <span className="text-[11px] text-muted-foreground">{poeWatt(d)}W</span>
            )}
            {route && (
              <span
                className={`rounded px-1.5 text-[11px] ${route.source === "measured" ? "bg-primary/10 text-primary" : route.source === "estimated" ? "bg-muted" : "bg-destructive/10 text-destructive"}`}
              >
                {route.lengthM === null ? "الطول غير مقاس" : `${route.lengthM.toFixed(1)}م`} ·{" "}
                {route.source === "measured"
                  ? "Measured"
                  : route.source === "estimated"
                    ? "Estimated"
                    : "Missing"}
              </span>
            )}
            {medium === "fiber" && parentId && (
              <span className="rounded bg-muted px-1.5 text-[11px]">
                Media converters: {mediaConvertersForLink(d.id, topology, nodes)}
              </span>
            )}
          </div>

          <div className="mt-2 grid gap-2 no-print md:grid-cols-4">
            <select
              className="h-8 rounded border border-border bg-background px-2 text-xs"
              value={parentId}
              onChange={(e) => setParent(d.id, e.target.value)}
            >
              <option value="">— غير متصل —</option>
              {d.kind !== "camera" && (
                <option value={ROUTER_ID}>{topology.gateway.name || "Router / Core"}</option>
              )}
              {parentOptions.map((p) => (
                <option key={p.device.id} value={p.device.id}>
                  {p.device.name} ({p.layoutName})
                </option>
              ))}
            </select>
            {parentId && (
              <select
                className="h-8 rounded border border-border bg-background px-2 text-xs"
                value={medium}
                onChange={(e) => setMedia(d.id, e.target.value as LinkMedia)}
              >
                <option value="utp">UTP/STP</option>
                <option value="fiber">Fiber</option>
              </select>
            )}
            {parentId && (
              <select
                className="h-8 rounded border border-border bg-background px-2 text-xs"
                value={binding.mode}
                onChange={(e) => setRouteBinding(d.id, e.target.value as LinkLengthMode)}
              >
                <option value="estimated">تقدير هندسي</option>
                <option value="cable">مسار مرسوم</option>
              </select>
            )}
            {parentId && binding.mode === "cable" ? (
              <select
                className="h-8 rounded border border-border bg-background px-2 text-xs"
                value={binding.cableRunId ?? ""}
                onChange={(e) => setRouteBinding(d.id, "cable", e.target.value || undefined)}
              >
                <option value="">— اختر Cable Run —</option>
                {cableOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.layoutName} · {c.type} · {c.id.slice(0, 6)}
                  </option>
                ))}
              </select>
            ) : parentId ? (
              <select
                className="h-8 rounded border border-border bg-background px-2 text-xs"
                value={binding.cableTypeId ?? ""}
                onChange={(e) => setCableType(d.id, e.target.value)}
              >
                <option value="">— نوع الكابل —</option>
                {cableTypes
                  .filter((c) => c.category === cableCategory)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </select>
            ) : null}
          </div>
          {d.kind === "camera" && (
            <div className="mt-2 no-print">
              <Label className="text-[11px]">NVR للتسجيل</Label>
              <select
                className="ms-2 h-8 rounded border border-border bg-background px-2 text-xs"
                value={topology.recorders[d.id] ?? ""}
                onChange={(e) => setRecorder(d.id, e.target.value)}
              >
                <option value="">— غير معين —</option>
                {nvrs.map((nvr) => (
                  <option key={nvr.device.id} value={nvr.device.id}>
                    {nvr.device.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  const selectedSpecNode = nodes.get(specDeviceId);
  const selectedSpec = selectedSpecNode
    ? effectiveCapabilities(selectedSpecNode.device, topology)
    : null;

  return (
    <div className="flex flex-1 overflow-hidden bg-muted/20">
      <div className="flex-1 overflow-auto p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
          <div>
            <h2 className="text-lg font-bold">Network Topology</h2>
            <p className="text-xs text-muted-foreground">
              مسار فعلي للكابلات + تحقق شبكي deterministic + مراجعة AI استشارية
            </p>
          </div>
          <div className="ms-auto flex gap-2">
            <Button size="sm" onClick={() => onChange(autoTopology(layouts, topology))}>
              <Sparkles className="h-4 w-4" />
              توليد تلقائي
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
          </div>
        </div>
        {all.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            أضف كاميرات وسويتشات وNVR في Plan Design أولاً.
          </p>
        ) : (
          <>
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 text-sm font-semibold">
              <Globe className="h-4 w-4 text-primary" />
              {topology.gateway.name || "Internet / Router / Core"}
            </div>
            <div
              className="border-s border-dashed border-border ps-3"
              style={{ marginInlineStart: 12 }}
            >
              {roots.length ? (
                roots.map((r) => renderNode(r, 0))
              ) : (
                <p className="py-2 text-xs text-muted-foreground">
                  لا توجد أجهزة متصلة بالـGateway بعد.
                </p>
              )}
            </div>
            {orphans.length > 0 && (
              <div className="mt-6">
                <p className="mb-1 text-sm font-bold text-destructive">
                  أجهزة غير متصلة ({orphans.length})
                </p>
                {orphans.map((o) => renderNode(o, 0))}
              </div>
            )}
          </>
        )}
      </div>

      <aside className="w-[390px] shrink-0 overflow-auto border-s border-border bg-surface p-4 no-print">
        <p className="font-bold">التحقق من الشبكة</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <Stat label="UTP/STP" value={`${stats.utpM.toFixed(0)}م`} />
          <Stat label="Fiber" value={`${stats.fiberM.toFixed(0)}م`} />
          <Stat label="Measured" value={stats.measuredLinks} />
          <Stat label="Estimated" value={stats.estimatedLinks} />
          <Stat label="Missing lengths" value={stats.missingLengths} />
          <Stat label="Media converters" value={stats.mediaConverters} />
        </div>
        <div
          className={`mt-4 flex items-center gap-2 rounded-lg p-2 text-sm font-semibold ${errors ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"}`}
        >
          {errors ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {errors ? `${errors} خطأ يجب إصلاحه` : "الشبكة سليمة وفق القواعد الحالية"}
        </div>
        <ul className="mt-3 space-y-2">
          {issues.map((i, idx) => (
            <li key={idx} className="flex gap-2 text-xs leading-5">
              {i.level === "error" ? (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              )}
              <span>{i.text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-border pt-4">
          <p className="font-bold">Engineering Network Input</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            قيم المشروع تتغلب على الكتالوج بدون تعديل المواصفات العامة.
          </p>
          <div className="mt-3 space-y-2">
            <Label>Router / Core name</Label>
            <Input
              value={topology.gateway.name ?? ""}
              onChange={(e) => patch({ gateway: { ...topology.gateway, name: e.target.value } })}
            />
            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label="Ethernet"
                value={topology.gateway.ethernetPorts}
                onChange={(v) => patch({ gateway: withOpt(topology.gateway, "ethernetPorts", v) })}
              />
              <NumberField
                label="SFP"
                value={topology.gateway.sfpPorts}
                onChange={(v) => patch({ gateway: withOpt(topology.gateway, "sfpPorts", v) })}
              />
              <NumberField
                label="Uplink Mbps"
                value={topology.gateway.uplinkMbps}
                onChange={(v) => patch({ gateway: withOpt(topology.gateway, "uplinkMbps", v) })}
              />
            </div>
          </div>

          {networkParents.length > 0 && (
            <div className="mt-4 space-y-2">
              <Label>جهاز لتعديل مواصفاته</Label>
              <select
                className="h-9 w-full rounded border border-border bg-background px-2 text-xs"
                value={specDeviceId}
                onChange={(e) => setSpecDeviceId(e.target.value)}
              >
                {networkParents.map((n) => (
                  <option key={n.device.id} value={n.device.id}>
                    {n.device.name} · {n.layoutName}
                  </option>
                ))}
              </select>
              {selectedSpecNode && selectedSpec && (
                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label="Ethernet"
                    value={selectedSpec.ethernetPorts}
                    onChange={(v) =>
                      updateOverride(selectedSpecNode.device.id, { ethernetPorts: v } as never)
                    }
                  />
                  <NumberField
                    label="PoE ports"
                    value={selectedSpec.poePorts}
                    onChange={(v) =>
                      updateOverride(selectedSpecNode.device.id, { poePorts: v } as never)
                    }
                  />
                  <NumberField
                    label="SFP"
                    value={selectedSpec.sfpPorts}
                    onChange={(v) =>
                      updateOverride(selectedSpecNode.device.id, { sfpPorts: v } as never)
                    }
                  />
                  <NumberField
                    label="PoE W"
                    value={selectedSpec.poeBudget}
                    onChange={(v) =>
                      updateOverride(selectedSpecNode.device.id, { poeBudget: v } as never)
                    }
                  />
                  <NumberField
                    label="Uplink Mbps"
                    value={selectedSpec.uplinkMbps}
                    onChange={(v) =>
                      updateOverride(selectedSpecNode.device.id, { uplinkMbps: v } as never)
                    }
                  />
                  {selectedSpecNode.device.kind === "nvr" && (
                    <NumberField
                      label="Channels"
                      value={selectedSpec.channels}
                      onChange={(v) =>
                        updateOverride(selectedSpecNode.device.id, { channels: v } as never)
                      }
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">AI Network Review</p>
              <p className="text-[11px] text-muted-foreground">
                استشاري فقط؛ لا يغير التوصيلات أو الأرقام.
              </p>
            </div>
            <Button
              size="sm"
              disabled={reviewing || all.length === 0}
              onClick={() => void runAiReview()}
            >
              <Bot className="h-4 w-4" />
              {reviewing ? "جارٍ المراجعة…" : "مراجعة"}
            </Button>
          </div>
          {reviewError && (
            <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              {reviewError}
            </p>
          )}
          {review && (
            <div className="mt-3 space-y-3">
              <p className="rounded-lg bg-muted p-3 text-xs leading-5">{review.summary}</p>
              {review.recommendations.map((r, i) => (
                <div
                  key={`${r.title}-${i}`}
                  className="rounded-lg border border-border p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <b>{r.title}</b>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                      {r.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{r.rationale}</p>
                  <p className="mt-2">
                    <b>الإجراء:</b> {r.action}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <Input
        className="mt-1 h-8"
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0))
        }
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <p className="text-base font-bold">{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

function withOpt<T extends object, K extends keyof T>(obj: T, key: K, value: T[K] | undefined): T {
  const next = { ...obj };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}
