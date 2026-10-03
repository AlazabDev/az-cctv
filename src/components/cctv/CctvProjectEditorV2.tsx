import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  BrickWall,
  FileText,
  Cable,
  Camera,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Layers3,
  Map,
  MousePointer2,
  Network,
  Plus,
  Ruler,
  Save,
  Server,
  ShoppingCart,
  Tag,
  Trash2,
  Waypoints,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { PlanCanvas, type CanvasMode } from "@/components/cctv/PlanCanvas";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AgentPanel } from "@/components/cctv/AgentPanel";
import { openOfferPdf } from "@/components/cctv/offer-pdf";
import { buildBoq, suggestHardware } from "@/components/cctv/boq";
import {
  cableTypes,
  cameraById,
  cameraCatalog,
  hardwareCatalog,
} from "@/lib/cctv/catalog";
import { distanceForPpm, formatMoney, polylineLengthMeters, ppmLevels } from "@/lib/cctv/geometry";
import {
  emptyPlan,
  type PlanData,
  type PlacedDevice,
  type RoomLabel,
  type WallSegment,
  type WallThicknessCm,
} from "@/lib/cctv/types";

type ModuleId = "plan" | "map" | "offer" | "topology";
type DrawerId = "camera" | "device" | "wall" | "cable" | "annotation" | "layers" | null;
type EditableRoomLabel = RoomLabel & { note?: string };
type OfferFee = { id: string; label: string; amount: number };
type LineOverride = { unitPrice?: number; discountPercent?: number; qty?: number };
type OfferSettings = {
  taxPercent: number;
  globalDiscountPercent: number;
  fees: OfferFee[];
  lineOverrides: Record<string, LineOverride>;
};

const defaultOffer: OfferSettings = {
  taxPercent: 0,
  globalDiscountPercent: 0,
  fees: [
    { id: "installation", label: "Installation and Commissioning", amount: 0 },
    { id: "auxiliary", label: "Auxiliary Material Cost", amount: 0 },
    { id: "cable-labor", label: "Cable Installation Labor", amount: 0 },
  ],
  lineOverrides: {},
};

const moduleItems = [
  { id: "plan" as const, label: "Plan Design", icon: Layers3 },
  { id: "map" as const, label: "Map Design", icon: Map },
  { id: "offer" as const, label: "Offer List", icon: ShoppingCart },
  { id: "topology" as const, label: "Topology", icon: Waypoints },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** A Layout is one floor/area of the project with its own plan image, scale and elements. */
type ProjectLayout = PlanData & { id: string; floorplanPath: string | null };

function normalizeLayout(raw: Partial<ProjectLayout>): ProjectLayout {
  return {
    ...emptyPlan,
    ...raw,
    id: raw.id || uid(),
    floorplanPath: raw.floorplanPath ?? null,
    layoutName: raw.layoutName ?? "",
    ceilingHeightM: raw.ceilingHeightM ?? 3,
    pxPerMeter: raw.pxPerMeter || 40,
    devices: raw.devices ?? [],
    cables: raw.cables ?? [],
    walls: (raw.walls ?? []).map((wall) => ({ ...wall, thicknessCm: wall.thicknessCm === 20 ? 20 : 10 })),
    roomLabels: raw.roomLabels ?? [],
    showCoverage: raw.showCoverage ?? true,
  };
}

/** Combine every layout into one plan (at 1px = 1m) so BOQ/offer cover the whole project. */
function mergeLayouts(layouts: ProjectLayout[]): PlanData {
  return {
    ...emptyPlan,
    pxPerMeter: 1,
    devices: layouts.flatMap((l) => l.devices),
    cables: layouts.flatMap((l) => l.cables.map((c) => ({ ...c, points: c.points.map((p) => ({ x: p.x / (l.pxPerMeter || 1), y: p.y / (l.pxPerMeter || 1) })) }))),
    walls: layouts.flatMap((l) => l.walls),
    roomLabels: layouts.flatMap((l) => l.roomLabels),
  };
}

function orthogonalAppend(points: { x: number; y: number }[], p: { x: number; y: number }) {
  const last = points.at(-1);
  if (!last) return [p];
  if (last.x === p.x || last.y === p.y) return [...points, p];
  return [...points, { x: p.x, y: last.y }, p];
}

export function CctvProjectEditorV2({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState<ProjectLayout[]>([]);
  const [activeLayoutId, setActiveLayoutId] = useState("");
  const plan: PlanData = layouts.find((layout) => layout.id === activeLayoutId) ?? emptyPlan;
  const [name, setName] = useState("مشروع جديد");
  const [clientName, setClientName] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [retention, setRetention] = useState(14);
  const [offer, setOffer] = useState<OfferSettings>(defaultOffer);
  const [activeModule, setActiveModule] = useState<ModuleId>("plan");
  const [drawer, setDrawer] = useState<DrawerId>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [newCameraSpec, setNewCameraSpec] = useState(cameraCatalog[0]!.id);
  const [newHardwareSpec, setNewHardwareSpec] = useState(hardwareCatalog[0]!.id);
  const [cableType, setCableType] = useState(cableTypes.find((c) => c.id === "cat6-stp")?.id ?? cableTypes[0]!.id);
  const [wallThicknessCm, setWallThicknessCm] = useState<WallThicknessCm>(10);
  const [cableDraft, setCableDraft] = useState<{ x: number; y: number }[]>([]);
  const [wallDraft, setWallDraft] = useState<{ x: number; y: number }[]>([]);
  const [scaleDraft, setScaleDraft] = useState<{ x: number; y: number }[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const imageUrl = imageUrls[activeLayoutId] ?? null;
  const [loaded, setLoaded] = useState(false);
  const [dialogTargetId, setDialogTargetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wallCurved, setWallCurved] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  const [pendingLayoutName, setPendingLayoutName] = useState("");
  const [pendingCeilingHeight, setPendingCeilingHeight] = useState("3");
  const [pendingLayoutFile, setPendingLayoutFile] = useState<File | null>(null);
  const [uploadingLayout, setUploadingLayout] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cctv_projects").select("*").eq("id", projectId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!project) return;
    const stored = (project.data ?? {}) as Partial<PlanData> & { offer?: Partial<OfferSettings>; layouts?: Partial<ProjectLayout>[]; activeLayoutId?: string };
    const list: ProjectLayout[] = stored.layouts?.length
      ? stored.layouts.map((l) => normalizeLayout(l))
      : [normalizeLayout({ ...stored, id: uid(), layoutName: stored.layoutName || "Layout 1", floorplanPath: project.floorplan_path ?? null })];
    setLayouts(list);
    setActiveLayoutId(list.some((l) => l.id === stored.activeLayoutId) ? stored.activeLayoutId! : list[0]!.id);
    setOffer({
      ...defaultOffer,
      ...(stored.offer ?? {}),
      fees: stored.offer?.fees ?? defaultOffer.fees,
      lineOverrides: stored.offer?.lineOverrides ?? {},
    });
    setName(project.name);
    setClientName(project.client_name ?? "");
    setCurrency(project.currency ?? "EGP");
    for (const layout of list) {
      if (!layout.floorplanPath) continue;
      supabase.storage.from("floorplans").createSignedUrl(layout.floorplanPath, 60 * 60 * 8).then(({ data }) => {
        if (data?.signedUrl) setImageUrls((prev) => ({ ...prev, [layout.id]: data.signedUrl }));
      });
    }
    setLoaded(true);
  }, [project]);

  const selected = plan.devices.find((device) => device.id === selectedId) ?? null;
  const selectedWall = plan.walls.find((wall) => wall.id === selectedWallId) ?? null;
  const selectedLabel = (plan.roomLabels.find((label) => label.id === selectedLabelId) ?? null) as EditableRoomLabel | null;
  const projectPlan = useMemo(() => mergeLayouts(layouts), [layouts]);
  const boq = useMemo(() => buildBoq(projectPlan, retention), [projectPlan, retention]);
  const suggestion = useMemo(() => suggestHardware(boq.cameras), [boq.cameras]);

  function update(updater: (value: PlanData) => PlanData) {
    setLayouts((prev) => prev.map((layout) => (layout.id === activeLayoutId ? { ...layout, ...updater(layout), id: layout.id, floorplanPath: layout.floorplanPath } : layout)));
  }

  function clearSelection() {
    setSelectedId(null);
    setSelectedWallId(null);
    setSelectedLabelId(null);
  }

  function clearDrafts() {
    setCableDraft([]);
    setWallDraft([]);
    setScaleDraft([]);
  }

  function chooseTool(nextMode: CanvasMode, nextDrawer: DrawerId) {
    setMode(nextMode);
    setDrawer(nextDrawer);
    clearDrafts();
  }

  function openLayoutDialog() {
    setDialogTargetId(null);
    setPendingLayoutName(`Layout ${layouts.length + 1}`);
    setPendingCeilingHeight(String(plan.ceilingHeightM || 3));
    setPendingLayoutFile(null);
    setLayoutDialogOpen(true);
  }

  function openReplaceDialog(id: string) {
    const target = layouts.find((l) => l.id === id);
    if (!target) return;
    setDialogTargetId(id);
    setPendingLayoutName(target.layoutName || `Layout ${layouts.length}`);
    setPendingCeilingHeight(String(target.ceilingHeightM || 3));
    setPendingLayoutFile(null);
    setLayoutDialogOpen(true);
  }

  function addDevice(kind: PlacedDevice["kind"], point: { x: number; y: number }) {
    const specId = kind === "camera" ? newCameraSpec : newHardwareSpec;
    const count = plan.devices.filter((device) => device.kind === kind).length + 1;
    const names: Record<PlacedDevice["kind"], string> = { camera: "Camera", nvr: "NVR", switch: "Switch", rack: "Rack" };
    const device: PlacedDevice = {
      id: uid(), kind, specId, name: `${names[kind]}${count}`, x: point.x, y: point.y,
      rotation: -90, heightM: plan.ceilingHeightM || 3, tilt: 15,
    };
    update((prev) => ({ ...prev, devices: [...prev.devices, device] }));
    clearSelection();
    setSelectedId(device.id);
  }

  function onCanvasPoint(point: { x: number; y: number }) {
    if (["camera", "nvr", "switch", "rack"].includes(mode)) {
      addDevice(mode as PlacedDevice["kind"], point);
      return;
    }
    if (mode === "cable") {
      setCableDraft((prev) => orthogonalAppend(prev, point));
      return;
    }
    if (mode === "wall") {
      setWallDraft((prev) => [...prev, point]);
      return;
    }
    if (mode === "label") {
      const text = window.prompt("اسم الغرفة / القاعة", "Room")?.trim();
      if (!text) return;
      const label: EditableRoomLabel = { id: uid(), text, x: point.x, y: point.y, fontSize: 18, note: "" };
      update((prev) => ({ ...prev, roomLabels: [...prev.roomLabels, label] }));
      clearSelection();
      setSelectedLabelId(label.id);
      setMode("select");
      return;
    }
    if (mode === "scale") {
      const points = [...scaleDraft, point];
      if (points.length < 2) {
        setScaleDraft(points);
        return;
      }
      const pixels = Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y);
      const answer = window.prompt("المسافة الحقيقية بالمتر", "3");
      setScaleDraft([]);
      setMode("select");
      const meters = Number(answer);
      if (!answer || !Number.isFinite(meters) || meters <= 0) return;
      update((prev) => ({ ...prev, pxPerMeter: pixels / meters }));
      toast.success(`Scale calibrated: ${meters}m = ${pixels.toFixed(1)}px · 1m = ${(pixels / meters).toFixed(2)}px`);
    }
  }

  function finishCable() {
    if (mode === "cable" && cableDraft.length >= 2) {
      update((prev) => ({ ...prev, cables: [...prev.cables, { id: uid(), type: cableType, points: cableDraft, slackPercent: 15 }] }));
    }
    setCableDraft([]);
  }

  function finishWall() {
    if (mode === "wall" && wallDraft.length >= 2) {
      const wall: WallSegment = {
        id: uid(),
        material: "medium-wall",
        thicknessCm: wallThicknessCm,
        points: wallDraft,
        curved: wallCurved,
        note: "",
      };
      update((prev) => ({ ...prev, walls: [...prev.walls, wall] }));
      clearSelection();
      setSelectedWallId(wall.id);
    }
    setWallDraft([]);
  }

  async function uploadPlan(file: File, layoutName: string, ceilingHeightM: number) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    const path = `${auth.user.id}/${projectId}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("floorplans").upload(path, file, { upsert: true });
    if (error) {
      toast.error("تعذّر رفع المخطط");
      return false;
    }
    const { data: signed } = await supabase.storage.from("floorplans").createSignedUrl(path, 60 * 60 * 8);
    const url = signed?.signedUrl ?? null;
    let size: { imageWidth?: number; imageHeight?: number } = {};
    if (url) {
      size = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ imageWidth: image.naturalWidth, imageHeight: image.naturalHeight });
        image.onerror = () => resolve({});
        image.src = url;
      });
    }
    const targetId = dialogTargetId ?? uid();
    const nextLayouts: ProjectLayout[] = dialogTargetId
      ? layouts.map((l) => (l.id === targetId ? { ...l, layoutName, ceilingHeightM, floorplanPath: path, ...size } : l))
      : [...layouts, { ...emptyPlan, id: targetId, layoutName, ceilingHeightM, floorplanPath: path, ...size }];
    setLayouts(nextLayouts);
    setActiveLayoutId(targetId);
    if (url) setImageUrls((prev) => ({ ...prev, [targetId]: url }));
    clearSelection();
    clearDrafts();
    const ok = await persist(nextLayouts, targetId);
    if (!ok) {
      toast.error("تم رفع الملف لكن تعذّر حفظ بيانات المخطط");
      return false;
    }
    toast.success(`تم رفع المخطط «${layoutName}»`);
    return true;
  }

  async function confirmLayoutUpload() {
    const layoutName = pendingLayoutName.trim();
    const ceilingHeightM = Number(pendingCeilingHeight);
    if (!layoutName) {
      toast.error("اسم المخطط مطلوب");
      return;
    }
    if (!Number.isFinite(ceilingHeightM) || ceilingHeightM <= 0) {
      toast.error("ارتفاع السقف مطلوب ويجب أن يكون أكبر من صفر");
      return;
    }
    if (!pendingLayoutFile) {
      toast.error("اختر ملف المخطط أولاً");
      return;
    }
    setUploadingLayout(true);
    const ok = await uploadPlan(pendingLayoutFile, layoutName, ceilingHeightM);
    setUploadingLayout(false);
    if (ok) setLayoutDialogOpen(false);
  }

  function selectLayout(id: string) {
    if (id === activeLayoutId) return;
    clearSelection();
    clearDrafts();
    setMode("select");
    setActiveLayoutId(id);
  }

  function renameLayout(id: string) {
    const current = layouts.find((l) => l.id === id);
    if (!current) return;
    const next = window.prompt("اسم المخطط", current.layoutName)?.trim();
    if (!next) return;
    setLayouts((prev) => prev.map((l) => (l.id === id ? { ...l, layoutName: next } : l)));
  }

  function deleteLayout(id: string) {
    if (layouts.length <= 1) {
      toast.error("يجب أن يحتوي المشروع على مخطط واحد على الأقل");
      return;
    }
    const current = layouts.find((l) => l.id === id);
    if (!window.confirm(`حذف المخطط «${current?.layoutName || ""}» وكل عناصره؟`)) return;
    const rest = layouts.filter((l) => l.id !== id);
    setLayouts(rest);
    if (activeLayoutId === id) {
      clearSelection();
      setActiveLayoutId(rest[0]!.id);
    }
  }

  function buildProjectData(nextLayouts: ProjectLayout[], nextActive: string) {
    const active = nextLayouts.find((l) => l.id === nextActive) ?? nextLayouts[0];
    // Top-level copy of the active layout keeps older readers (design agent) working.
    return { ...(active ?? emptyPlan), layouts: nextLayouts, activeLayoutId: nextActive, offer };
  }

  async function persist(nextLayouts = layouts, nextActive = activeLayoutId) {
    const active = nextLayouts.find((l) => l.id === nextActive);
    const { error } = await supabase
      .from("cctv_projects")
      .update({ name, client_name: clientName, currency, floorplan_path: active?.floorplanPath ?? null, data: buildProjectData(nextLayouts, nextActive) as never })
      .eq("id", projectId);
    return !error;
  }

  async function save() {
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (!ok) {
      toast.error("تعذّر الحفظ");
      return;
    }
    toast.success("تم حفظ المشروع");
  }

  // Autosave so a reload restores every layout exactly.
  useEffect(() => {
    if (!loaded || layouts.length === 0) return;
    const timer = window.setTimeout(() => { void persist(); }, 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts, activeLayoutId, offer, name, clientName, currency, loaded]);

  function exportCsv() {
    const summary = calculateOffer(boq, offer);
    const rows = [
      ["Item", "Qty", "Unit", "Unit Price", "Discount %", "Amount"],
      ...summary.lines.map((line) => [line.label, String(line.qty), line.unit, String(line.unitPrice), String(line.discountPercent), String(line.amount)]),
      ...offer.fees.map((fee) => [fee.label, "1", "fee", String(fee.amount), "0", String(fee.amount)]),
      ["Subtotal", "", "", "", "", String(summary.subtotal)],
      ["Global Discount", "", "", "", `${offer.globalDiscountPercent}%`, String(summary.globalDiscountValue)],
      ["VAT/GST", "", "", "", `${offer.taxPercent}%`, String(summary.taxValue)],
      ["Grand Total", "", "", "", "", String(summary.total)],
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}-offer.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    const summary = calculateOffer(boq, offer);
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = auth.user
      ? await supabase.from("profiles").select("company, full_name").eq("id", auth.user.id).maybeSingle()
      : { data: null };
    const ok = openOfferPdf({
      companyName: profile?.company || "كاميرا بلان",
      preparedBy: profile?.full_name ? `إعداد: ${profile.full_name}` : "",
      projectName: name,
      clientName,
      currency,
      lines: summary.lines,
      fees: offer.fees,
      subtotal: summary.subtotal,
      globalDiscountPercent: offer.globalDiscountPercent,
      globalDiscountValue: summary.globalDiscountValue,
      taxPercent: offer.taxPercent,
      taxValue: summary.taxValue,
      total: summary.total,
      cameras: boq.cameras,
      storageTb: boq.neededTb,
      poeWatt: boq.poeLoad,
    });
    if (!ok) toast.error("اسمح بالنوافذ المنبثقة لفتح عرض السعر");
    else if (!profile?.company) toast.info("أضف اسم شركتك من صفحة حسابي ليظهر في العرض");
  }

  useEffect(() => {
    const onDelete = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (selectedId) {
        update((prev) => ({ ...prev, devices: prev.devices.filter((device) => device.id !== selectedId) }));
        setSelectedId(null);
      } else if (selectedWallId) {
        update((prev) => ({ ...prev, walls: prev.walls.filter((wall) => wall.id !== selectedWallId) }));
        setSelectedWallId(null);
      } else if (selectedLabelId) {
        update((prev) => ({ ...prev, roomLabels: prev.roomLabels.filter((label) => label.id !== selectedLabelId) }));
        setSelectedLabelId(null);
      }
    };
    window.addEventListener("keydown", onDelete);
    return () => window.removeEventListener("keydown", onDelete);
  }, [selectedId, selectedLabelId, selectedWallId]);

  if (isLoading) return <div className="p-10 text-muted-foreground">جارٍ تحميل المشروع…</div>;
  if (!project) return <div className="p-10"><p className="mb-4">المشروع غير موجود.</p><Button onClick={() => navigate({ to: "/projects" })}>العودة للمشاريع</Button></div>;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <header className="no-print flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
        <div className="flex min-w-[300px] items-center gap-2">
          <Link to="/projects" className="text-muted-foreground hover:text-foreground" aria-label="العودة للمشاريع"><ArrowRight className="h-5 w-5" /></Link>
          <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8 w-48 border-0 bg-transparent px-1 font-bold shadow-none" />
          <span className="text-muted-foreground">/</span>
          <span className="max-w-36 truncate rounded-md bg-muted px-2 py-1 text-xs font-semibold" title={plan.layoutName || name}>{plan.layoutName || name}</span>
        </div>
        <nav className="flex h-full flex-1 items-stretch justify-center" aria-label="Project modules">
          {moduleItems.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { setActiveModule(id); setDrawer(null); setMode("select"); clearDrafts(); }} className={`flex min-w-[112px] items-center justify-center gap-2 border-b-2 px-4 text-sm font-medium transition ${activeModule === id ? "border-primary bg-primary/5 text-primary" : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-[310px] items-center justify-end gap-2">
          <div className="relative"><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-8 appearance-none rounded-md border border-border bg-background py-1 pl-7 pr-3 text-xs font-semibold"><option value="EGP">EGP</option><option value="SAR">SAR</option><option value="USD">USD</option></select><ChevronDown className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" /></div>
          <Button variant="outline" size="sm" onClick={() => setAgentOpen(true)}><Bot className="h-4 w-4" />المساعد</Button>
          <Button variant="secondary" size="sm" onClick={exportPdf}><FileText className="h-4 w-4" />PDF</Button>
          <Button variant="ghost" size="sm" onClick={exportCsv} title="تصدير CSV"><Download className="h-4 w-4" /></Button>
          <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4" />{saving ? "Saving" : "Save"}</Button>
        </div>
      </header>

      {activeModule === "plan" ? (
        <PlanDesignWorkspace
          layouts={layouts} activeLayoutId={activeLayoutId} imageUrls={imageUrls}
          onSelectLayout={selectLayout} onRenameLayout={renameLayout} onDeleteLayout={deleteLayout} onReplaceLayout={openReplaceDialog}
          plan={plan} imageUrl={imageUrl} mode={mode} drawer={drawer}
          selectedId={selectedId} selectedWallId={selectedWallId} selectedLabelId={selectedLabelId}
          newCameraSpec={newCameraSpec} newHardwareSpec={newHardwareSpec} cableType={cableType}
          wallThicknessCm={wallThicknessCm} wallCurved={wallCurved} cableDraft={cableDraft} wallDraft={wallDraft} scaleDraft={scaleDraft}
          selected={selected} selectedWall={selectedWall} selectedLabel={selectedLabel}
          onOpenLayoutDialog={openLayoutDialog} onChooseTool={chooseTool} onDrawerChange={setDrawer}
          onCameraSpecChange={setNewCameraSpec} onHardwareSpecChange={setNewHardwareSpec} onCableTypeChange={setCableType}
          onWallThicknessChange={setWallThicknessCm} onWallCurvedChange={setWallCurved} onCanvasPoint={onCanvasPoint}
          onSelect={(id) => { clearSelection(); setSelectedId(id); }}
          onSelectWall={(id) => { clearSelection(); setSelectedWallId(id); }}
          onSelectLabel={(id) => { clearSelection(); setSelectedLabelId(id); }}
          onMoveDevice={(deviceId, point) => update((prev) => ({ ...prev, devices: prev.devices.map((device) => device.id === deviceId ? { ...device, ...point } : device) }))}
          onMoveLabel={(labelId, point) => update((prev) => ({ ...prev, roomLabels: prev.roomLabels.map((label) => label.id === labelId ? { ...label, ...point } : label) }))}
          onFinishCable={finishCable} onFinishWall={finishWall} onUpdate={update}
        />
      ) : activeModule === "offer" ? (
        <OfferList clientName={clientName} onClientNameChange={setClientName} currency={currency} retention={retention} onRetentionChange={setRetention} boq={boq} suggestion={suggestion} offer={offer} onOfferChange={setOffer} />
      ) : (
        <ModulePlaceholder module={activeModule} />
      )}
      <Sheet open={agentOpen} onOpenChange={setAgentOpen}>
        <SheetContent side="left" className="no-print w-full p-0 sm:max-w-md">
          <SheetTitle className="sr-only">مساعد التصميم</SheetTitle>
          <AgentPanel projectId={projectId} projectName={name} />
        </SheetContent>
      </Sheet>

      {layoutDialogOpen && (
        <div className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="layout-upload-title">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 id="layout-upload-title" className="text-lg font-bold">{dialogTargetId ? "تحديث المخطط" : "إضافة مخطط جديد"}</h2>
                <p className="mt-1 text-xs text-muted-foreground">حدد اسم المخطط وارتفاع السقف ثم اختر الملف. لا يبدأ الرفع قبل اكتمال البيانات.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => !uploadingLayout && setLayoutDialogOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <Label htmlFor="layout-name">اسم المخطط</Label>
                <Input id="layout-name" className="mt-1" value={pendingLayoutName} onChange={(event) => setPendingLayoutName(event.target.value)} autoFocus />
              </div>
              <div>
                <Label htmlFor="ceiling-height">ارتفاع السقف</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input id="ceiling-height" type="number" min={0.1} step={0.1} value={pendingCeilingHeight} onChange={(event) => setPendingCeilingHeight(event.target.value)} />
                  <span className="rounded-md border border-border bg-muted px-3 py-2 text-sm">m</span>
                </div>
              </div>
              <div>
                <Label htmlFor="layout-file">ملف المخطط</Label>
                <Input id="layout-file" className="mt-1" type="file" accept="image/*" onChange={(event) => setPendingLayoutFile(event.target.files?.[0] ?? null)} />
                <p className="mt-1 text-[11px] text-muted-foreground">PNG / JPG / WEBP — دعم PDF سيضاف عند ربط عارض PDF بالمحرر.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" disabled={uploadingLayout} onClick={() => setLayoutDialogOpen(false)}>إلغاء</Button>
              <Button disabled={uploadingLayout || !pendingLayoutName.trim() || !pendingLayoutFile || !(Number(pendingCeilingHeight) > 0)} onClick={() => void confirmLayoutUpload()}>
                {uploadingLayout ? "جارٍ الرفع…" : "رفع المخطط"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type PlanWorkspaceProps = {
  layouts: ProjectLayout[]; activeLayoutId: string; imageUrls: Record<string, string>;
  onSelectLayout: (id: string) => void; onRenameLayout: (id: string) => void; onDeleteLayout: (id: string) => void; onReplaceLayout: (id: string) => void;
  plan: PlanData; imageUrl: string | null; mode: CanvasMode; drawer: DrawerId;
  selectedId: string | null; selectedWallId: string | null; selectedLabelId: string | null;
  newCameraSpec: string; newHardwareSpec: string; cableType: string; wallThicknessCm: WallThicknessCm; wallCurved: boolean;
  cableDraft: { x: number; y: number }[]; wallDraft: { x: number; y: number }[]; scaleDraft: { x: number; y: number }[];
  selected: PlacedDevice | null; selectedWall: WallSegment | null; selectedLabel: EditableRoomLabel | null;
  onOpenLayoutDialog: () => void; onChooseTool: (mode: CanvasMode, drawer: DrawerId) => void; onDrawerChange: (drawer: DrawerId) => void;
  onCameraSpecChange: (id: string) => void; onHardwareSpecChange: (id: string) => void; onCableTypeChange: (id: string) => void;
  onWallThicknessChange: (value: WallThicknessCm) => void; onWallCurvedChange: (value: boolean) => void; onCanvasPoint: (point: { x: number; y: number }) => void;
  onSelect: (id: string | null) => void; onSelectWall: (id: string | null) => void; onSelectLabel: (id: string | null) => void;
  onMoveDevice: (id: string, point: { x: number; y: number }) => void; onMoveLabel: (id: string, point: { x: number; y: number }) => void;
  onFinishCable: () => void; onFinishWall: () => void; onUpdate: (updater: (plan: PlanData) => PlanData) => void;
};

function PlanDesignWorkspace(props: PlanWorkspaceProps) {
  const tools = [
    { drawer: "camera" as const, mode: "camera" as const, label: "Camera", icon: Camera },
    { drawer: "device" as const, mode: "switch" as const, label: "Device", icon: Server },
    { drawer: "wall" as const, mode: "wall" as const, label: "Add Wall", icon: BrickWall },
    { drawer: "cable" as const, mode: "cable" as const, label: "Cable Routing", icon: Cable },
    { drawer: "annotation" as const, mode: "label" as const, label: "Annotations", icon: Tag },
    { drawer: "layers" as const, mode: "select" as const, label: "Layers", icon: Layers3 },
  ];
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="no-print w-64 shrink-0 border-r border-border bg-surface p-3">
        <div className="mb-3 flex items-center justify-between">
          <div><p className="text-sm font-bold">Layouts ({props.layouts.length})</p><p className="text-[11px] text-muted-foreground">Project plans & scale</p></div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={props.onOpenLayoutDialog} title="إضافة مخطط"><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="max-h-[42vh] space-y-2 overflow-y-auto">
          {props.layouts.map((layout) => {
            const active = layout.id === props.activeLayoutId;
            const url = props.imageUrls[layout.id];
            return (
              <div key={layout.id} className={`rounded-lg border-2 p-2 ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                <button type="button" onClick={() => props.onSelectLayout(layout.id)} className="w-full text-right">
                  <div className="mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted">{url ? <img src={url} alt={layout.layoutName || "Layout"} className="h-full w-full object-contain" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}</div>
                  <p className="truncate text-xs font-semibold">{layout.layoutName || "بدون اسم"}</p>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>H: {layout.ceilingHeightM.toFixed(1)}m</span><span>{layout.devices.filter((d) => d.kind === "camera").length} cam</span><span>1m:{layout.pxPerMeter.toFixed(1)}px</span></div>
                </button>
                {active && (
                  <div className="mt-2 flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 flex-1 px-1 text-[11px]" onClick={() => props.onReplaceLayout(layout.id)}>{url ? "تغيير المخطط" : "رفع مخطط"}</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => props.onRenameLayout(layout.id)}>تسمية</Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => props.onDeleteLayout(layout.id)} title="حذف المخطط"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 rounded-lg border border-border p-3"><div className="flex items-center justify-between text-xs"><span>Scale Calibration</span><Ruler className="h-4 w-4 text-muted-foreground" /></div><Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => props.onChooseTool("scale", null)}>Calibrate on plan</Button><Input type="number" value={Number(props.plan.pxPerMeter.toFixed(2))} onChange={(event) => props.onUpdate((prev) => ({ ...prev, pxPerMeter: Number(event.target.value) || 1 }))} className="mt-2 h-8" /></div>
        <div className="mt-3 rounded-lg border border-border p-3"><div className="flex items-center justify-between text-xs"><span>DORI/PPM Coverage</span><Switch checked={props.plan.showCoverage} onCheckedChange={(value) => props.onUpdate((prev) => ({ ...prev, showCoverage: value }))} /></div><div className="mt-2 space-y-1 text-[10px] text-muted-foreground">{ppmLevels.map((level) => <div key={level.id} className="flex justify-between"><span>{level.label}</span><span>{level.ppm} PPM</span></div>)}</div></div>
      </aside>

      <main className="relative min-w-0 flex-1 bg-muted/20">
        <PlanCanvas plan={props.plan} imageUrl={props.imageUrl} mode={props.mode} selectedId={props.selectedId} selectedWallId={props.selectedWallId} selectedLabelId={props.selectedLabelId} cableDraft={props.cableDraft} cableDraftType={props.cableType} wallDraft={props.wallDraft} wallCurved={props.wallCurved} scaleDraft={props.scaleDraft} onSelect={props.onSelect} onSelectWall={props.onSelectWall} onSelectLabel={props.onSelectLabel} onCanvasPoint={props.onCanvasPoint} onMoveDevice={props.onMoveDevice} onMoveLabel={props.onMoveLabel} onFinishCable={props.onFinishCable} onFinishWall={props.onFinishWall} />
        <div className="no-print absolute right-3 top-3 z-20 flex w-[78px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <button type="button" onClick={() => props.onChooseTool("select", null)} className={`flex flex-col items-center gap-1 border-b border-border p-3 text-[10px] ${props.mode === "select" && !props.drawer ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><MousePointer2 className="h-5 w-5" />Select</button>
          {tools.map(({ drawer, mode, label, icon: Icon }) => <button key={drawer} type="button" onClick={() => props.onChooseTool(mode, drawer)} className={`flex flex-col items-center gap-1 border-b border-border p-3 text-center text-[10px] last:border-b-0 ${props.drawer === drawer ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><Icon className="h-5 w-5" />{label}</button>)}
        </div>
        {props.drawer && <div className="no-print absolute right-[94px] top-3 z-20 max-h-[calc(100%-24px)] w-[360px] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface p-4"><p className="font-bold">{drawerTitle(props.drawer)}</p><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => props.onDrawerChange(null)}><X className="h-4 w-4" /></Button></div><div className="p-4"><ToolDrawer {...props} /></div></div>}
      </main>

      <aside className="no-print w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
        <p className="mb-3 text-sm font-bold">Selection / Project</p>
        {props.selected ? <DeviceProperties device={props.selected} plan={props.plan} onUpdate={props.onUpdate} /> : props.selectedWall ? <WallProperties wall={props.selectedWall} plan={props.plan} onUpdate={props.onUpdate} /> : props.selectedLabel ? <LabelProperties label={props.selectedLabel} onUpdate={props.onUpdate} /> : <ProjectSummary plan={props.plan} />}
      </aside>
    </div>
  );
}

function drawerTitle(drawer: Exclude<DrawerId, null>) {
  return ({ camera: "Camera", device: "Device Deployment", wall: "Add Wall", cable: "Network Cabling", annotation: "Annotations & Rooms", layers: "Layers" } as const)[drawer];
}

function ToolDrawer(props: PlanWorkspaceProps) {
  if (props.drawer === "camera") return <div className="space-y-3"><Label>Camera model</Label><div className="grid gap-2">{cameraCatalog.map((camera) => <button key={camera.id} type="button" onClick={() => props.onCameraSpecChange(camera.id)} className={`rounded-lg border p-3 text-right ${props.newCameraSpec === camera.id ? "border-primary bg-primary/5" : "border-border"}`}><p className="text-sm font-semibold">{camera.label}</p><p className="text-[11px] text-muted-foreground">{camera.model} · {camera.megapixel}MP · {camera.focal}mm</p></button>)}</div></div>;
  if (props.drawer === "device") return <div className="space-y-3">{(["switch", "nvr", "rack"] as const).map((kind) => <div key={kind}><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{kind}</p>{hardwareCatalog.filter((item) => item.kind === kind).map((item) => <button key={item.id} type="button" onClick={() => { props.onHardwareSpecChange(item.id); props.onChooseTool(kind, "device"); }} className={`mb-1 w-full rounded-lg border p-2 text-right text-xs ${props.newHardwareSpec === item.id ? "border-primary bg-primary/5" : "border-border"}`}>{item.label}</button>)}</div>)}</div>;
  if (props.drawer === "cable") return <div className="space-y-4"><p className="text-xs text-muted-foreground">Orthogonal 90° routing. BOQ includes 15% slack.</p>{(["network", "fiber", "coaxial"] as const).map((category) => <div key={category}><p className="mb-2 text-xs font-bold">{category}</p><div className="grid grid-cols-2 gap-2">{cableTypes.filter((item) => item.category === category).map((item) => <button key={item.id} type="button" onClick={() => props.onCableTypeChange(item.id)} className={`rounded-lg border p-2 text-xs ${props.cableType === item.id ? "border-primary bg-primary/5 text-primary" : "border-border"}`}><span className="mx-auto mb-1 block h-0.5 w-10" style={{ backgroundColor: item.color }} />{item.label}</button>)}</div></div>)}</div>;
  if (props.drawer === "wall") return <div className="space-y-4"><div><p className="mb-2 text-xs font-bold">سمك الحائط</p><div className="grid grid-cols-2 gap-2">{([10, 20] as const).map((thickness) => <button key={thickness} type="button" onClick={() => props.onWallThicknessChange(thickness)} className={`rounded-lg border p-3 text-sm font-semibold ${props.wallThicknessCm === thickness ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>{thickness} سم</button>)}</div><p className="mt-2 text-[11px] text-muted-foreground">الافتراضي 10 سم. غيّره إلى 20 سم فقط عند الحاجة.</p></div><div className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"><span>Curved wall</span><Switch checked={props.wallCurved} onCheckedChange={props.onWallCurvedChange} /></div></div>;
  if (props.drawer === "annotation") return <div className="space-y-3"><p className="text-sm font-semibold">Room labels</p><p className="text-xs text-muted-foreground">Place labels on the plan, then edit text, font size and notes from the selection panel.</p><Button className="w-full" onClick={() => props.onChooseTool("label", "annotation")}><Tag className="h-4 w-4" />Add room label</Button></div>;
  return <div className="space-y-3"><div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs">Coverage layer</span><Switch checked={props.plan.showCoverage} onCheckedChange={(value) => props.onUpdate((prev) => ({ ...prev, showCoverage: value }))} /></div><ProjectSummary plan={props.plan} /></div>;
}

function DeviceProperties({ device, plan, onUpdate }: { device: PlacedDevice; plan: PlanData; onUpdate: (updater: (plan: PlanData) => PlanData) => void }) {
  const spec = device.kind === "camera" ? cameraById(device.specId) : null;
  const patch = (next: Partial<PlacedDevice>) => onUpdate((prev) => ({ ...prev, devices: prev.devices.map((item) => item.id === device.id ? { ...item, ...next } : item) }));
  return <div className="space-y-3"><Label>Name</Label><Input value={device.name} onChange={(event) => patch({ name: event.target.value })} />{spec && <><div><Label>Rotation: {Math.round(device.rotation)}°</Label><Slider min={-180} max={180} step={1} value={[device.rotation]} onValueChange={(value) => patch({ rotation: value[0] ?? device.rotation })} /></div><div><Label>Installation height: {device.heightM.toFixed(1)}m</Label><Slider min={0.3} max={12} step={0.1} value={[device.heightM]} onValueChange={(value) => patch({ heightM: value[0] ?? device.heightM })} /></div><div className="rounded-lg border border-border p-3 text-xs"><p className="font-semibold">{spec.model}</p>{ppmLevels.map((level) => <div key={level.id} className="flex justify-between text-muted-foreground"><span>{level.label}</span><span>{distanceForPpm(spec, level.ppm).toFixed(1)}m</span></div>)}<p className="mt-2 text-muted-foreground">Scale: {plan.pxPerMeter.toFixed(2)} px/m</p></div></>}<Button variant="destructive" className="w-full" onClick={() => onUpdate((prev) => ({ ...prev, devices: prev.devices.filter((item) => item.id !== device.id) }))}><Trash2 className="h-4 w-4" />Delete</Button></div>;
}

function WallProperties({ wall, plan, onUpdate }: { wall: WallSegment; plan: PlanData; onUpdate: (updater: (plan: PlanData) => PlanData) => void }) {
  const lengthM = polylineLengthMeters(wall.points, plan.pxPerMeter);
  const patch = (next: Partial<WallSegment>) => onUpdate((prev) => ({ ...prev, walls: prev.walls.map((item) => item.id === wall.id ? { ...item, ...next } : item) }));
  const thickness = wall.thicknessCm ?? 10;
  return <div className="space-y-4">
    <div><Label>سمك الحائط</Label><div className="mt-2 grid grid-cols-2 gap-2">{([10, 20] as const).map((value) => <button key={value} type="button" onClick={() => patch({ thicknessCm: value })} className={`rounded-lg border p-3 text-sm font-semibold ${thickness === value ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>{value} سم</button>)}</div></div>
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3"><p className="text-[11px] text-muted-foreground">طول الحائط</p><p className="text-xl font-bold text-primary">{lengthM.toFixed(2)} m</p><p className="mt-1 text-[11px] text-muted-foreground">يظهر المقاس أيضاً مباشرة فوق الحائط عند تحديده.</p></div>
    <div><Label>Notes</Label><textarea value={wall.note ?? ""} onChange={(event) => patch({ note: event.target.value })} rows={4} className="mt-1 w-full resize-y rounded-md border border-border bg-background p-2 text-sm" placeholder="Execution notes, wall condition, routing restrictions…" /></div>
    <div className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"><span>Curved wall</span><Switch checked={wall.curved} onCheckedChange={(value) => patch({ curved: value })} /></div>
    <Button variant="destructive" className="w-full" onClick={() => onUpdate((prev) => ({ ...prev, walls: prev.walls.filter((item) => item.id !== wall.id) }))}><Trash2 className="h-4 w-4" />Delete wall</Button>
  </div>;
}

function LabelProperties({ label, onUpdate }: { label: EditableRoomLabel; onUpdate: (updater: (plan: PlanData) => PlanData) => void }) {
  const patch = (next: Partial<EditableRoomLabel>) => onUpdate((prev) => ({ ...prev, roomLabels: prev.roomLabels.map((item) => item.id === label.id ? { ...item, ...next } : item) }));
  return <div className="space-y-4"><div><Label>Room / area name</Label><Input className="mt-1" value={label.text} onChange={(event) => patch({ text: event.target.value })} /></div><div><Label>Font size</Label><Input className="mt-1" type="number" min={8} max={72} value={label.fontSize} onChange={(event) => patch({ fontSize: Number(event.target.value) || 18 })} /></div><div><Label>Notes</Label><textarea value={label.note ?? ""} onChange={(event) => patch({ note: event.target.value })} rows={4} className="mt-1 w-full resize-y rounded-md border border-border bg-background p-2 text-sm" placeholder="Room purpose, access notes, installation constraints…" /></div><Button variant="destructive" className="w-full" onClick={() => onUpdate((prev) => ({ ...prev, roomLabels: prev.roomLabels.filter((item) => item.id !== label.id) }))}><Trash2 className="h-4 w-4" />Delete label</Button></div>;
}

function ProjectSummary({ plan }: { plan: PlanData }) {
  return <div className="space-y-2 text-xs"><div className="rounded-lg border border-border p-3"><div className="flex justify-between"><span>Layout</span><span className="max-w-36 truncate font-semibold">{plan.layoutName || "—"}</span></div><div className="flex justify-between"><span>Ceiling height</span><span>{plan.ceilingHeightM.toFixed(1)} m</span></div><div className="flex justify-between"><span>Cameras</span><span>{plan.devices.filter((item) => item.kind === "camera").length}</span></div><div className="flex justify-between"><span>Network devices</span><span>{plan.devices.filter((item) => item.kind !== "camera").length}</span></div><div className="flex justify-between"><span>Cable routes</span><span>{plan.cables.length}</span></div><div className="flex justify-between"><span>Walls</span><span>{plan.walls.length}</span></div><div className="flex justify-between"><span>Annotations</span><span>{plan.roomLabels.length}</span></div></div><p className="text-muted-foreground">Select a device, wall or room label to edit its properties.</p></div>;
}

type OfferLineView = { key: string; label: string; unit: string; qty: number; unitPrice: number; discountPercent: number; amount: number; isCable: boolean };

function calculateOffer(boq: ReturnType<typeof buildBoq>, offer: OfferSettings) {
  const lines: OfferLineView[] = boq.lines.map((line) => {
    const key = line.label;
    const override = offer.lineOverrides[key] ?? {};
    const qty = Math.max(0, override.qty ?? line.qty);
    const unitPrice = Math.max(0, override.unitPrice ?? line.unitPrice);
    const discountPercent = Math.min(100, Math.max(0, override.discountPercent ?? 0));
    const amount = qty * unitPrice * (1 - discountPercent / 100);
    return { key, label: line.label, unit: line.unit, qty, unitPrice, discountPercent, amount, isCable: line.label.startsWith("كابل ") };
  });
  const devices = lines.filter((line) => !line.isCable).reduce((sum, line) => sum + line.amount, 0);
  const cables = lines.filter((line) => line.isCable).reduce((sum, line) => sum + line.amount, 0);
  const fees = offer.fees.reduce((sum, fee) => sum + Math.max(0, fee.amount || 0), 0);
  const subtotal = devices + cables + fees;
  const globalDiscountValue = subtotal * Math.min(100, Math.max(0, offer.globalDiscountPercent)) / 100;
  const taxable = Math.max(0, subtotal - globalDiscountValue);
  const taxValue = taxable * Math.max(0, offer.taxPercent) / 100;
  const total = taxable + taxValue;
  return { lines, devices, cables, fees, subtotal, globalDiscountValue, taxable, taxValue, total };
}

function OfferList({ clientName, onClientNameChange, currency, retention, onRetentionChange, boq, suggestion, offer, onOfferChange }: { clientName: string; onClientNameChange: (value: string) => void; currency: string; retention: number; onRetentionChange: (value: number) => void; boq: ReturnType<typeof buildBoq>; suggestion: ReturnType<typeof suggestHardware>; offer: OfferSettings; onOfferChange: (value: OfferSettings) => void }) {
  const totals = calculateOffer(boq, offer);
  const patchLine = (key: string, patch: LineOverride) => onOfferChange({ ...offer, lineOverrides: { ...offer.lineOverrides, [key]: { ...(offer.lineOverrides[key] ?? {}), ...patch } } });
  const patchFee = (id: string, patch: Partial<OfferFee>) => onOfferChange({ ...offer, fees: offer.fees.map((fee) => fee.id === id ? { ...fee, ...patch } : fee) });
  return <div className="flex-1 overflow-y-auto bg-muted/20 p-5"><div className="mx-auto max-w-[1500px] space-y-4">
    <div className="rounded-xl border border-border bg-surface p-4"><div className="grid grid-cols-5 gap-4"><SummaryCard label="Total Price" value={formatMoney(totals.total, currency)} strong /><SummaryCard label="Devices / Products" value={formatMoney(totals.devices, currency)} /><SummaryCard label="Network Cables" value={formatMoney(totals.cables, currency)} /><SummaryCard label="Additional Fees" value={formatMoney(totals.fees, currency)} /><SummaryCard label="VAT/GST" value={formatMoney(totals.taxValue, currency)} /></div><div className="mt-4 grid grid-cols-4 gap-3"><div><Label>Client</Label><Input className="mt-1" value={clientName} onChange={(event) => onClientNameChange(event.target.value)} /></div><div><Label>VAT/GST %</Label><Input className="mt-1" type="number" min={0} value={offer.taxPercent} onChange={(event) => onOfferChange({ ...offer, taxPercent: Number(event.target.value) || 0 })} /></div><div><Label>Global Discount %</Label><Input className="mt-1" type="number" min={0} max={100} value={offer.globalDiscountPercent} onChange={(event) => onOfferChange({ ...offer, globalDiscountPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} /></div><div><Label>Currency</Label><div className="mt-1 flex h-10 items-center rounded-md border border-border px-3 text-sm font-semibold">{currency}</div></div></div></div>

    <div className="rounded-xl border border-border bg-surface"><div className="flex items-center justify-between border-b border-border p-4"><div><p className="font-bold">Products</p><p className="text-xs text-muted-foreground">Prices and discounts are editable; quantities default to the live plan BOQ.</p></div><div className="text-xs text-muted-foreground">{totals.lines.length} line items</div></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-right">Product Info</th><th className="px-3 py-3">Unit Price</th><th className="px-3 py-3">Qty</th><th className="px-3 py-3">Discount %</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Operation</th></tr></thead><tbody>{totals.lines.map((line) => <tr key={line.key} className="border-t border-border/70"><td className="px-4 py-3"><p className="font-medium">{line.label}</p><p className="text-[11px] text-muted-foreground">{line.isCable ? "Network infrastructure" : "CCTV / system product"}</p></td><td className="px-3 py-3"><Input type="number" min={0} className="h-9 w-32" value={line.unitPrice} onChange={(event) => patchLine(line.key, { unitPrice: Number(event.target.value) || 0 })} /></td><td className="px-3 py-3"><Input type="number" min={0} className="h-9 w-24" value={line.qty} onChange={(event) => patchLine(line.key, { qty: Number(event.target.value) || 0 })} /></td><td className="px-3 py-3"><Input type="number" min={0} max={100} className="h-9 w-24" value={line.discountPercent} onChange={(event) => patchLine(line.key, { discountPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} /></td><td className="px-3 py-3 text-center font-semibold">{formatMoney(line.amount, currency)}</td><td className="px-3 py-3 text-center"><button type="button" className="text-xs text-primary hover:underline" onClick={() => { const next = { ...offer.lineOverrides }; delete next[line.key]; onOfferChange({ ...offer, lineOverrides: next }); }}>Reset</button></td></tr>)}</tbody></table></div></div>

    <div className="grid grid-cols-[1fr_340px] gap-4"><div className="rounded-xl border border-border bg-surface"><div className="flex items-center justify-between border-b border-border p-4"><div><p className="font-bold">Additional Fees</p><p className="text-xs text-muted-foreground">Installation, commissioning, auxiliary materials, cable labor and custom commercial items.</p></div><Button size="sm" variant="outline" onClick={() => onOfferChange({ ...offer, fees: [...offer.fees, { id: uid(), label: "Custom Fee", amount: 0 }] })}><Plus className="h-4 w-4" />Add</Button></div><div className="divide-y divide-border">{offer.fees.map((fee) => <div key={fee.id} className="grid grid-cols-[1fr_180px_42px] items-center gap-3 p-4"><Input value={fee.label} onChange={(event) => patchFee(fee.id, { label: event.target.value })} /><Input type="number" min={0} value={fee.amount} onChange={(event) => patchFee(fee.id, { amount: Number(event.target.value) || 0 })} /><Button variant="ghost" size="icon" onClick={() => onOfferChange({ ...offer, fees: offer.fees.filter((item) => item.id !== fee.id) })}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>)}</div></div>
      <div className="space-y-4"><div className="rounded-xl border border-border bg-surface p-4"><p className="font-bold">HDD Calculator</p><p className="mt-1 text-xs text-muted-foreground">Live estimate from camera bitrate and retention period.</p><div className="mt-4"><Label>Retention: {retention} days</Label><Slider className="mt-3" min={3} max={90} step={1} value={[retention]} onValueChange={(value) => onRetentionChange(value[0] ?? retention)} /></div><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span>Total bitrate</span><b>{boq.totalBitrate} Mbps</b></div><div className="flex justify-between"><span>Required storage</span><b>{boq.neededTb.toFixed(2)} TB</b></div><div className="flex justify-between"><span>PoE load</span><b>{boq.poeLoad} W</b></div></div><p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Suggested: {suggestion.nvr?.label ?? "—"}{suggestion.sw ? ` + ${suggestion.sw.label}` : ""}</p></div><div className="rounded-xl border border-border bg-surface p-4 text-sm"><div className="flex justify-between py-1"><span>Subtotal</span><b>{formatMoney(totals.subtotal, currency)}</b></div><div className="flex justify-between py-1 text-muted-foreground"><span>Global discount</span><span>- {formatMoney(totals.globalDiscountValue, currency)}</span></div><div className="flex justify-between py-1 text-muted-foreground"><span>VAT/GST</span><span>{formatMoney(totals.taxValue, currency)}</span></div><div className="mt-2 flex justify-between border-t border-border pt-3 text-lg font-bold text-primary"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div></div></div>
    </div>
  </div></div>;
}

function SummaryCard({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`rounded-lg border p-4 ${strong ? "border-primary bg-primary/5" : "border-border"}`}><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-2 text-xl font-bold ${strong ? "text-primary" : ""}`}>{value}</p></div>;
}

function ModulePlaceholder({ module }: { module: Exclude<ModuleId, "plan" | "offer"> }) {
  const content = module === "map" ? { icon: Map, title: "Map Design", text: "Outdoor GIS, satellite map, GPS coordinates and wireless bridge line-of-sight are reserved for Phase 5." } : { icon: Network, title: "Topology", text: "Automatic network tree, PoE port budget and image export are reserved for Phase 4." };
  const Icon = content.icon;
  return <div className="flex flex-1 items-center justify-center bg-muted/20 p-8"><div className="max-w-xl rounded-2xl border border-border bg-surface p-10 text-center shadow-sm"><Icon className="mx-auto h-12 w-12 text-primary" /><h2 className="mt-4 text-2xl font-bold">{content.title}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{content.text}</p></div></div>;
}
