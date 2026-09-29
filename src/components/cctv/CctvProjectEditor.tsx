import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  BrickWall,
  Cable,
  Camera,
  ChevronDown,
  Download,
  Fence,
  GlassWater,
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
import { buildBoq, suggestHardware } from "@/components/cctv/boq";
import {
  cableTypes,
  cameraById,
  cameraCatalog,
  hardwareCatalog,
  wallMaterialById,
  wallMaterials,
} from "@/lib/cctv/catalog";
import { distanceForPpm, formatMoney, ppmLevels } from "@/lib/cctv/geometry";
import {
  emptyPlan,
  type PlanData,
  type PlacedDevice,
  type RoomLabel,
  type WallSegment,
} from "@/lib/cctv/types";

type ModuleId = "plan" | "map" | "offer" | "topology";
type DrawerId = "camera" | "device" | "wall" | "cable" | "annotation" | "layers" | null;

const moduleItems = [
  { id: "plan" as const, label: "Plan Design", icon: Layers3 },
  { id: "map" as const, label: "Map Design", icon: Map },
  { id: "offer" as const, label: "Offer List", icon: ShoppingCart },
  { id: "topology" as const, label: "Topology", icon: Waypoints },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function orthogonalAppend(points: { x: number; y: number }[], p: { x: number; y: number }) {
  const last = points.at(-1);
  if (!last) return [p];
  if (last.x === p.x || last.y === p.y) return [...points, p];
  return [...points, { x: p.x, y: last.y }, p];
}

export function CctvProjectEditor({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanData>(emptyPlan);
  const [name, setName] = useState("مشروع جديد");
  const [clientName, setClientName] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [retention, setRetention] = useState(14);
  const [activeModule, setActiveModule] = useState<ModuleId>("plan");
  const [drawer, setDrawer] = useState<DrawerId>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [newCameraSpec, setNewCameraSpec] = useState(cameraCatalog[0]!.id);
  const [newHardwareSpec, setNewHardwareSpec] = useState(hardwareCatalog[0]!.id);
  const [cableType, setCableType] = useState(cableTypes.find((c) => c.id === "cat6-stp")?.id ?? cableTypes[0]!.id);
  const [wallMaterial, setWallMaterial] = useState(wallMaterials.find((w) => w.id === "medium-wall")?.id ?? wallMaterials[0]!.id);
  const [cableDraft, setCableDraft] = useState<{ x: number; y: number }[]>([]);
  const [wallDraft, setWallDraft] = useState<{ x: number; y: number }[]>([]);
  const [scaleDraft, setScaleDraft] = useState<{ x: number; y: number }[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wallCurved, setWallCurved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cctv_projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!project) return;
    const stored = (project.data ?? {}) as Partial<PlanData>;
    setPlan({
      ...emptyPlan,
      ...stored,
      devices: stored.devices ?? [],
      cables: stored.cables ?? [],
      walls: stored.walls ?? [],
      roomLabels: stored.roomLabels ?? [],
    });
    setName(project.name);
    setClientName(project.client_name ?? "");
    setCurrency(project.currency ?? "EGP");
    if (project.floorplan_path) {
      supabase.storage
        .from("floorplans")
        .createSignedUrl(project.floorplan_path, 60 * 60 * 8)
        .then(({ data }) => setImageUrl(data?.signedUrl ?? null));
    }
  }, [project]);

  const selected = plan.devices.find((device) => device.id === selectedId) ?? null;
  const selectedWall = plan.walls.find((wall) => wall.id === selectedWallId) ?? null;
  const selectedLabel = plan.roomLabels.find((label) => label.id === selectedLabelId) ?? null;
  const boq = useMemo(() => buildBoq(plan, retention), [plan, retention]);
  const suggestion = useMemo(() => suggestHardware(boq.cameras), [boq.cameras]);

  function update(updater: (value: PlanData) => PlanData) {
    setPlan((prev) => updater(prev));
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

  function addDevice(kind: PlacedDevice["kind"], point: { x: number; y: number }) {
    const specId = kind === "camera" ? newCameraSpec : newHardwareSpec;
    const count = plan.devices.filter((device) => device.kind === kind).length + 1;
    const names: Record<PlacedDevice["kind"], string> = {
      camera: "Camera",
      nvr: "NVR",
      switch: "Switch",
      rack: "Rack",
    };
    const device: PlacedDevice = {
      id: uid(),
      kind,
      specId,
      name: `${names[kind]}${count}`,
      x: point.x,
      y: point.y,
      rotation: -90,
      heightM: 3,
      tilt: 15,
    };
    update((prev) => ({ ...prev, devices: [...prev.devices, device] }));
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
      const label: RoomLabel = { id: uid(), text, x: point.x, y: point.y, fontSize: 18 };
      update((prev) => ({ ...prev, roomLabels: [...prev.roomLabels, label] }));
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
      update((prev) => ({
        ...prev,
        cables: [
          ...prev.cables,
          { id: uid(), type: cableType, points: cableDraft, slackPercent: 15 },
        ],
      }));
    }
    setCableDraft([]);
  }

  function finishWall() {
    if (mode === "wall" && wallDraft.length >= 2) {
      const wall: WallSegment = {
        id: uid(),
        material: wallMaterial,
        points: wallDraft,
        curved: wallCurved,
      };
      update((prev) => ({ ...prev, walls: [...prev.walls, wall] }));
      setSelectedWallId(wall.id);
    }
    setWallDraft([]);
  }

  async function uploadPlan(file: File) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const path = `${auth.user.id}/${projectId}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("floorplans").upload(path, file, { upsert: true });
    if (error) {
      toast.error("تعذّر رفع المخطط");
      return;
    }
    const { data: signed } = await supabase.storage.from("floorplans").createSignedUrl(path, 60 * 60 * 8);
    const url = signed?.signedUrl ?? null;
    setImageUrl(url);
    await supabase.from("cctv_projects").update({ floorplan_path: path }).eq("id", projectId);
    if (url) {
      const image = new Image();
      image.onload = () => update((prev) => ({ ...prev, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight }));
      image.src = url;
    }
    toast.success("تم رفع المخطط");
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("cctv_projects")
      .update({ name, client_name: clientName, currency, data: plan as never })
      .eq("id", projectId);
    setSaving(false);
    if (error) {
      toast.error("تعذّر الحفظ");
      return;
    }
    toast.success("تم حفظ المشروع");
  }

  function exportCsv() {
    const rows = [
      ["Item", "Qty", "Unit", "Unit Price", "Total"],
      ...boq.lines.map((line) => [line.label, String(line.qty), line.unit, String(line.unitPrice), String(line.total)]),
      ["Grand Total", "", "", "", String(boq.grand)],
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}-offer.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
  if (!project) {
    return (
      <div className="p-10">
        <p className="mb-4">المشروع غير موجود.</p>
        <Button onClick={() => navigate({ to: "/projects" })}>العودة للمشاريع</Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <header className="no-print flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
        <div className="flex min-w-[260px] items-center gap-2">
          <Link to="/projects" className="text-muted-foreground hover:text-foreground" aria-label="العودة للمشاريع">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8 w-56 border-0 bg-transparent px-1 font-bold shadow-none" />
        </div>

        <nav className="flex h-full flex-1 items-stretch justify-center" aria-label="Project modules">
          {moduleItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveModule(id);
                setDrawer(null);
                setMode("select");
                clearDrafts();
              }}
              className={`flex min-w-[112px] items-center justify-center gap-2 border-b-2 px-4 text-sm font-medium transition ${activeModule === id ? "border-primary bg-primary/5 text-primary" : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex min-w-[310px] items-center justify-end gap-2">
          <div className="relative">
            <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-8 appearance-none rounded-md border border-border bg-background py-1 pl-7 pr-3 text-xs font-semibold">
              <option value="EGP">EGP</option>
              <option value="SAR">SAR</option>
              <option value="USD">USD</option>
            </select>
            <ChevronDown className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          </div>
          <Button variant="secondary" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving" : "Save"}</Button>
        </div>
      </header>

      {activeModule === "plan" ? (
        <PlanDesignWorkspace
          plan={plan}
          imageUrl={imageUrl}
          mode={mode}
          drawer={drawer}
          selectedId={selectedId}
          selectedWallId={selectedWallId}
          selectedLabelId={selectedLabelId}
          newCameraSpec={newCameraSpec}
          newHardwareSpec={newHardwareSpec}
          cableType={cableType}
          wallMaterial={wallMaterial}
          wallCurved={wallCurved}
          cableDraft={cableDraft}
          wallDraft={wallDraft}
          scaleDraft={scaleDraft}
          fileRef={fileRef}
          selected={selected}
          selectedWall={selectedWall}
          selectedLabel={selectedLabel}
          onUploadPlan={uploadPlan}
          onChooseTool={chooseTool}
          onDrawerChange={setDrawer}
          onCameraSpecChange={setNewCameraSpec}
          onHardwareSpecChange={setNewHardwareSpec}
          onCableTypeChange={setCableType}
          onWallMaterialChange={setWallMaterial}
          onWallCurvedChange={setWallCurved}
          onCanvasPoint={onCanvasPoint}
          onSelect={setSelectedId}
          onSelectWall={setSelectedWallId}
          onSelectLabel={setSelectedLabelId}
          onMoveDevice={(deviceId, point) => update((prev) => ({ ...prev, devices: prev.devices.map((device) => device.id === deviceId ? { ...device, ...point } : device) }))}
          onMoveLabel={(labelId, point) => update((prev) => ({ ...prev, roomLabels: prev.roomLabels.map((label) => label.id === labelId ? { ...label, ...point } : label) }))}
          onFinishCable={finishCable}
          onFinishWall={finishWall}
          onUpdate={update}
        />
      ) : activeModule === "offer" ? (
        <OfferPreview clientName={clientName} onClientNameChange={setClientName} currency={currency} retention={retention} onRetentionChange={setRetention} boq={boq} suggestion={suggestion} />
      ) : (
        <ModulePlaceholder module={activeModule} />
      )}
    </div>
  );
}

function PlanDesignWorkspace(props: {
  plan: PlanData;
  imageUrl: string | null;
  mode: CanvasMode;
  drawer: DrawerId;
  selectedId: string | null;
  selectedWallId: string | null;
  selectedLabelId: string | null;
  newCameraSpec: string;
  newHardwareSpec: string;
  cableType: string;
  wallMaterial: string;
  wallCurved: boolean;
  cableDraft: { x: number; y: number }[];
  wallDraft: { x: number; y: number }[];
  scaleDraft: { x: number; y: number }[];
  fileRef: React.RefObject<HTMLInputElement | null>;
  selected: PlacedDevice | null;
  selectedWall: WallSegment | null;
  selectedLabel: RoomLabel | null;
  onUploadPlan: (file: File) => void;
  onChooseTool: (mode: CanvasMode, drawer: DrawerId) => void;
  onDrawerChange: (drawer: DrawerId) => void;
  onCameraSpecChange: (id: string) => void;
  onHardwareSpecChange: (id: string) => void;
  onCableTypeChange: (id: string) => void;
  onWallMaterialChange: (id: string) => void;
  onWallCurvedChange: (value: boolean) => void;
  onCanvasPoint: (point: { x: number; y: number }) => void;
  onSelect: (id: string | null) => void;
  onSelectWall: (id: string | null) => void;
  onSelectLabel: (id: string | null) => void;
  onMoveDevice: (id: string, point: { x: number; y: number }) => void;
  onMoveLabel: (id: string, point: { x: number; y: number }) => void;
  onFinishCable: () => void;
  onFinishWall: () => void;
  onUpdate: (updater: (plan: PlanData) => PlanData) => void;
}) {
  const toolButtons = [
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
          <div>
            <p className="text-sm font-bold">Layouts</p>
            <p className="text-[11px] text-muted-foreground">Project plans & scale</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => props.fileRef.current?.click()} title="Upload / replace layout">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <input ref={props.fileRef} type="file" accept="image/*" hidden onChange={(event) => event.target.files?.[0] && props.onUploadPlan(event.target.files[0])} />
        <button type="button" onClick={() => props.fileRef.current?.click()} className="w-full rounded-lg border-2 border-primary bg-primary/5 p-2 text-right">
          <div className="mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted">
            {props.imageUrl ? <img src={props.imageUrl} alt="Current layout" className="h-full w-full object-contain" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
          </div>
          <p className="truncate text-xs font-semibold">Current Layout</p>
          <p className="mt-1 text-[11px] text-muted-foreground">1m : {props.plan.pxPerMeter.toFixed(2)}px</p>
        </button>
        <div className="mt-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between text-xs">
            <span>Scale Calibration</span>
            <Ruler className="h-4 w-4 text-muted-foreground" />
          </div>
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => props.onChooseTool("scale", null)}>Calibrate on plan</Button>
          <Input type="number" value={Number(props.plan.pxPerMeter.toFixed(2))} onChange={(event) => props.onUpdate((prev) => ({ ...prev, pxPerMeter: Number(event.target.value) || 1 }))} className="mt-2 h-8" />
        </div>
        <div className="mt-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between text-xs">
            <span>DORI/PPM Coverage</span>
            <Switch checked={props.plan.showCoverage} onCheckedChange={(value) => props.onUpdate((prev) => ({ ...prev, showCoverage: value }))} />
          </div>
          <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
            {ppmLevels.map((level) => <div key={level.id} className="flex justify-between"><span>{level.label}</span><span>{level.ppm} PPM</span></div>)}
          </div>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 bg-muted/20">
        <PlanCanvas
          plan={props.plan}
          imageUrl={props.imageUrl}
          mode={props.mode}
          selectedId={props.selectedId}
          selectedWallId={props.selectedWallId}
          selectedLabelId={props.selectedLabelId}
          cableDraft={props.cableDraft}
          cableDraftType={props.cableType}
          wallDraft={props.wallDraft}
          wallCurved={props.wallCurved}
          scaleDraft={props.scaleDraft}
          onSelect={props.onSelect}
          onSelectWall={props.onSelectWall}
          onSelectLabel={props.onSelectLabel}
          onCanvasPoint={props.onCanvasPoint}
          onMoveDevice={props.onMoveDevice}
          onMoveLabel={props.onMoveLabel}
          onFinishCable={props.onFinishCable}
          onFinishWall={props.onFinishWall}
        />

        <div className="no-print absolute right-3 top-3 z-20 flex w-[78px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <button type="button" onClick={() => props.onChooseTool("select", null)} className={`flex flex-col items-center gap-1 border-b border-border p-3 text-[10px] ${props.mode === "select" && !props.drawer ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><MousePointer2 className="h-5 w-5" />Select</button>
          {toolButtons.map(({ drawer, mode, label, icon: Icon }) => <button key={drawer} type="button" onClick={() => props.onChooseTool(mode, drawer)} className={`flex flex-col items-center gap-1 border-b border-border p-3 text-center text-[10px] last:border-b-0 ${props.drawer === drawer ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}><Icon className="h-5 w-5" />{label}</button>)}
        </div>

        {props.drawer && (
          <div className="no-print absolute right-[94px] top-3 z-20 max-h-[calc(100%-24px)] w-[360px] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface p-4">
              <p className="font-bold">{drawerTitle(props.drawer)}</p>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => props.onDrawerChange(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4">
              <ToolDrawer {...props} />
            </div>
          </div>
        )}
      </main>

      <aside className="no-print w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
        <p className="mb-3 text-sm font-bold">Selection / Project</p>
        {props.selected ? <DeviceProperties device={props.selected} plan={props.plan} onUpdate={props.onUpdate} /> : props.selectedWall ? <WallProperties wall={props.selectedWall} onUpdate={props.onUpdate} /> : props.selectedLabel ? <LabelProperties label={props.selectedLabel} onUpdate={props.onUpdate} /> : <ProjectSummary plan={props.plan} />}
      </aside>
    </div>
  );
}

function drawerTitle(drawer: Exclude<DrawerId, null>) {
  return ({ camera: "Camera", device: "Device Deployment", wall: "Add Wall", cable: "Network Cabling", annotation: "Annotations & Rooms", layers: "Layers" } as const)[drawer];
}

function ToolDrawer(props: Parameters<typeof PlanDesignWorkspace>[0]) {
  if (props.drawer === "camera") {
    return <div className="space-y-3"><Label>Camera model</Label><div className="grid gap-2">{cameraCatalog.map((camera) => <button key={camera.id} type="button" onClick={() => props.onCameraSpecChange(camera.id)} className={`rounded-lg border p-3 text-right ${props.newCameraSpec === camera.id ? "border-primary bg-primary/5" : "border-border"}`}><p className="text-sm font-semibold">{camera.label}</p><p className="text-[11px] text-muted-foreground">{camera.model} · {camera.megapixel}MP · {camera.focal}mm</p></button>)}</div><p className="text-xs text-muted-foreground">Select a model then click the plan to place it.</p></div>;
  }
  if (props.drawer === "device") {
    return <div className="space-y-3"><Label>Central devices</Label>{(["switch", "nvr", "rack"] as const).map((kind) => <div key={kind}><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{kind}</p>{hardwareCatalog.filter((item) => item.kind === kind).map((item) => <button key={item.id} type="button" onClick={() => { props.onHardwareSpecChange(item.id); props.onChooseTool(kind, "device"); }} className={`mb-1 w-full rounded-lg border p-2 text-right text-xs ${props.newHardwareSpec === item.id ? "border-primary bg-primary/5" : "border-border"}`}>{item.label}</button>)}</div>)}</div>;
  }
  if (props.drawer === "cable") {
    return <div className="space-y-4"><p className="text-xs text-muted-foreground">Cable paths are drawn as orthogonal 90° routes. BOQ applies 15% installation slack.</p>{(["network", "fiber", "coaxial"] as const).map((category) => <div key={category}><p className="mb-2 text-xs font-bold">{category === "network" ? "Network Cables" : category === "fiber" ? "Fiber Cables" : "Coaxial Cables"}</p><div className="grid grid-cols-2 gap-2">{cableTypes.filter((item) => item.category === category).map((item) => <button key={item.id} type="button" onClick={() => props.onCableTypeChange(item.id)} className={`rounded-lg border p-2 text-xs ${props.cableType === item.id ? "border-primary bg-primary/5 text-primary" : "border-border"}`}><span className="mx-auto mb-1 block h-0.5 w-10" style={{ backgroundColor: item.color }} />{item.label}</button>)}</div></div>)}</div>;
  }
  if (props.drawer === "wall") {
    const groups = [
      { id: "wall" as const, label: "Wall Thickness" },
      { id: "material" as const, label: "Construction Materials" },
    ];
    return <div className="space-y-4">{groups.map((group) => <div key={group.id}><p className="mb-2 text-xs font-bold">{group.label}</p><div className="space-y-1">{wallMaterials.filter((item) => item.group === group.id).map((item) => { const Icon = item.id.includes("glass") ? GlassWater : item.id === "fence" ? Fence : BrickWall; return <button key={item.id} type="button" onClick={() => props.onWallMaterialChange(item.id)} className={`flex w-full items-center justify-between rounded-lg border p-2 text-xs ${props.wallMaterial === item.id ? "border-primary bg-primary/5 text-primary" : "border-border"}`}><span className="flex items-center gap-2"><Icon className="h-4 w-4" />{item.label}</span><span className="text-muted-foreground">{item.attenuationRange ? `${item.attenuationRange[0]}–${item.attenuationRange[1]}dB` : `${item.attenuationDb}dB`}</span></button>; })}</div></div>)}<div className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"><span>Curved wall</span><Switch checked={props.wallCurved} onCheckedChange={props.onWallCurvedChange} /></div></div>;
  }
  if (props.drawer === "annotation") {
    return <div className="space-y-3"><p className="text-sm font-semibold">Room labels</p><p className="text-xs text-muted-foreground">Click any room position on the plan, then enter its name. Labels remain movable and editable.</p><Button className="w-full" onClick={() => props.onChooseTool("label", "annotation")}><Tag className="h-4 w-4" />Add room label</Button></div>;
  }
  return <div className="space-y-3"><div className="flex items-center justify-between rounded-lg border border-border p-3"><span className="text-xs">Coverage layer</span><Switch checked={props.plan.showCoverage} onCheckedChange={(value) => props.onUpdate((prev) => ({ ...prev, showCoverage: value }))} /></div><div className="rounded-lg border border-border p-3 text-xs"><div className="flex justify-between"><span>Devices</span><span>{props.plan.devices.length}</span></div><div className="flex justify-between"><span>Cable routes</span><span>{props.plan.cables.length}</span></div><div className="flex justify-between"><span>Walls</span><span>{props.plan.walls.length}</span></div><div className="flex justify-between"><span>Room labels</span><span>{props.plan.roomLabels.length}</span></div></div></div>;
}

function DeviceProperties({ device, plan, onUpdate }: { device: PlacedDevice; plan: PlanData; onUpdate: (updater: (plan: PlanData) => PlanData) => void }) {
  const spec = device.kind === "camera" ? cameraById(device.specId) : null;
  const patch = (next: Partial<PlacedDevice>) => onUpdate((prev) => ({ ...prev, devices: prev.devices.map((item) => item.id === device.id ? { ...item, ...next } : item) }));
  return <div className="space-y-3"><Label>Name</Label><Input value={device.name} onChange={(event) => patch({ name: event.target.value })} />{spec && <><div><Label>Rotation: {Math.round(device.rotation)}°</Label><Slider min={-180} max={180} step={1} value={[device.rotation]} onValueChange={(value) => patch({ rotation: value[0] ?? device.rotation })} /></div><div><Label>Installation height: {device.heightM.toFixed(1)}m</Label><Slider min={0.3} max={12} step={0.1} value={[device.heightM]} onValueChange={(value) => patch({ heightM: value[0] ?? device.heightM })} /></div><div className="rounded-lg border border-border p-3 text-xs"><p className="font-semibold">{spec.model}</p>{ppmLevels.map((level) => <div key={level.id} className="flex justify-between text-muted-foreground"><span>{level.label}</span><span>{distanceForPpm(spec, level.ppm).toFixed(1)}m</span></div>)}</div></>}<Button variant="destructive" className="w-full" onClick={() => onUpdate((prev) => ({ ...prev, devices: prev.devices.filter((item) => item.id !== device.id) }))}><Trash2 className="h-4 w-4" />Delete</Button></div>;
}

function WallProperties({ wall, onUpdate }: { wall: WallSegment; onUpdate: (updater: (plan: PlanData) => PlanData) => void }) {
  const material = wallMaterialById(wall.material);
  return <div className="space-y-3"><div className="rounded-lg border border-border p-3 text-xs"><p className="font-semibold">{material.label}</p><p className="text-muted-foreground">Attenuation: {material.attenuationRange ? `${material.attenuationRange[0]}–${material.attenuationRange[1]}dB` : `${material.attenuationDb}dB`}</p><p className="text-muted-foreground">{material.opaque ? "Opaque / blind-spot boundary" : "Partially transparent boundary"}</p></div><Button variant="destructive" className="w-full" onClick={() => onUpdate((prev) => ({ ...prev, walls: prev.walls.filter((item) => item.id !== wall.id) }))}><Trash2 className="h-4 w-4" />Delete wall</Button></div>;
}

function LabelProperties({ label, onUpdate }: { label: RoomLabel; onUpdate: (updater: (plan: PlanData) => PlanData) => void }) {
  const patch = (next: Partial<RoomLabel>) => onUpdate((prev) => ({ ...prev, roomLabels: prev.roomLabels.map((item) => item.id === label.id ? { ...item, ...next } : item) }));
  return <div className="space-y-3"><Label>Room name</Label><Input value={label.text} onChange={(event) => patch({ text: event.target.value })} /><Label>Font size</Label><Input type="number" value={label.fontSize} onChange={(event) => patch({ fontSize: Number(event.target.value) || 18 })} /><Button variant="destructive" className="w-full" onClick={() => onUpdate((prev) => ({ ...prev, roomLabels: prev.roomLabels.filter((item) => item.id !== label.id) }))}><Trash2 className="h-4 w-4" />Delete label</Button></div>;
}

function ProjectSummary({ plan }: { plan: PlanData }) {
  return <div className="space-y-2 text-xs"><div className="rounded-lg border border-border p-3"><div className="flex justify-between"><span>Cameras</span><span>{plan.devices.filter((item) => item.kind === "camera").length}</span></div><div className="flex justify-between"><span>Network devices</span><span>{plan.devices.filter((item) => item.kind !== "camera").length}</span></div><div className="flex justify-between"><span>Cable routes</span><span>{plan.cables.length}</span></div><div className="flex justify-between"><span>Walls</span><span>{plan.walls.length}</span></div><div className="flex justify-between"><span>Annotations</span><span>{plan.roomLabels.length}</span></div></div><p className="text-muted-foreground">Select a device, wall or room label to edit its properties.</p></div>;
}

function OfferPreview({ clientName, onClientNameChange, currency, retention, onRetentionChange, boq, suggestion }: { clientName: string; onClientNameChange: (value: string) => void; currency: string; retention: number; onRetentionChange: (value: number) => void; boq: ReturnType<typeof buildBoq>; suggestion: ReturnType<typeof suggestHardware> }) {
  return <div className="flex-1 overflow-y-auto bg-muted/20 p-6"><div className="mx-auto max-w-6xl space-y-5"><div className="grid grid-cols-4 gap-4">{[{ label: "Total Price", value: formatMoney(boq.grand, currency) }, { label: "Products", value: formatMoney(boq.grand, currency) }, { label: "Additional Fees", value: formatMoney(0, currency) }, { label: "VAT/GST", value: formatMoney(0, currency) }].map((card) => <div key={card.label} className="rounded-xl border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className="mt-2 text-xl font-bold">{card.value}</p></div>)}</div><div className="grid grid-cols-[1fr_260px] gap-5"><div className="rounded-xl border border-border bg-surface p-4"><div className="mb-4 flex items-center justify-between"><div><p className="font-bold">Products</p><p className="text-xs text-muted-foreground">Phase 3 will add editable pricing, discounts, Locate and Replace.</p></div></div><table className="w-full text-sm"><thead><tr className="border-b border-border text-muted-foreground"><th className="py-2 text-right">Product</th><th>Qty</th><th>Total</th></tr></thead><tbody>{boq.lines.map((line) => <tr key={line.label} className="border-b border-border/60"><td className="py-2">{line.label}</td><td className="text-center">{line.qty}</td><td className="text-center">{formatMoney(line.total, currency)}</td></tr>)}</tbody></table></div><div className="space-y-4"><div className="rounded-xl border border-border bg-surface p-4"><Label>Client</Label><Input className="mt-1" value={clientName} onChange={(event) => onClientNameChange(event.target.value)} /></div><div className="rounded-xl border border-border bg-surface p-4"><Label>Retention: {retention} days</Label><Slider className="mt-3" min={3} max={90} step={1} value={[retention]} onValueChange={(value) => onRetentionChange(value[0] ?? retention)} /><p className="mt-3 text-xs text-muted-foreground">Suggested: {suggestion.nvr?.label ?? "—"}{suggestion.sw ? ` + ${suggestion.sw.label}` : ""}</p></div></div></div></div></div>;
}

function ModulePlaceholder({ module }: { module: Exclude<ModuleId, "plan" | "offer"> }) {
  const content = module === "map" ? { icon: Map, title: "Map Design", text: "Outdoor GIS, satellite map, GPS coordinates and wireless bridge line-of-sight are reserved for Phase 5." } : { icon: Network, title: "Topology", text: "Automatic network tree, PoE port budget and image export are reserved for Phase 4." };
  const Icon = content.icon;
  return <div className="flex flex-1 items-center justify-center bg-muted/20 p-8"><div className="max-w-xl rounded-2xl border border-border bg-surface p-10 text-center shadow-sm"><Icon className="mx-auto h-12 w-12 text-primary" /><h2 className="mt-4 text-2xl font-bold">{content.title}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{content.text}</p></div></div>;
}
