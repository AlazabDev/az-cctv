import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  BrickWall,
  Cable as CableIcon,
  Camera,
  Download,
  Fence,
  GlassWater,
  Image as ImageIcon,
  LayoutTemplate,
  MousePointer2,
  Network,
  Printer,
  Ruler,
  Save,
  Server,
  Sparkles,
  Spline,
  Tag,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanCanvas, type CanvasMode } from "@/components/cctv/PlanCanvas";
import { AgentPanel } from "@/components/cctv/AgentPanel";
import { buildBoq, suggestHardware } from "@/components/cctv/boq";
import { cableTypes, cameraById, cameraCatalog, hardwareCatalog, wallMaterialById, wallMaterials } from "@/lib/cctv/catalog";
import { distanceForPpm, formatMoney, polylineLengthMeters, ppmLevels } from "@/lib/cctv/geometry";
import { emptyPlan, type PlanData, type PlacedDevice, type RoomLabel, type WallSegment } from "@/lib/cctv/types";

export const Route = createFileRoute("/_authenticated/editor/$id")({
  head: () => ({
    meta: [
      { title: "محرر التصميم — كاميرا بلان" },
      {
        name: "description",
        content: "وزّع الكاميرات على المخطط واحسب التغطية والكابلات وقائمة الأسعار.",
      },
      { property: "og:title", content: "محرر التصميم — كاميرا بلان" },
      {
        property: "og:description",
        content: "محرر مخططات أنظمة المراقبة مع حساب التغطية والتسعير.",
      },
    ],
  }),
  component: EditorPage,
});

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function EditorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<PlanData>(emptyPlan);
  const [name, setName] = useState("مشروع جديد");
  const [clientName, setClientName] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [retention, setRetention] = useState(14);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [workspace, setWorkspace] = useState<"design" | "network" | "coverage" | "boq">("design");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCameraSpec, setNewCameraSpec] = useState(cameraCatalog[0]!.id);
  const [newHardwareSpec, setNewHardwareSpec] = useState(hardwareCatalog[0]!.id);
  const [cableType, setCableType] = useState(cableTypes[0]!.id);
  const [cableDraft, setCableDraft] = useState<{ x: number; y: number }[]>([]);
  const [wallMaterial, setWallMaterial] = useState(wallMaterials[0]!.id);
  const [wallCurved, setWallCurved] = useState(false);
  const [wallDraft, setWallDraft] = useState<{ x: number; y: number }[]>([]);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [scaleDraft, setScaleDraft] = useState<{ x: number; y: number }[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cctv_projects")
        .select("*")
        .eq("id", id)
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
    setCurrency(project.currency ?? "SAR");
    if (project.floorplan_path) {
      supabase.storage
        .from("floorplans")
        .createSignedUrl(project.floorplan_path, 60 * 60 * 8)
        .then(({ data }) => setImageUrl(data?.signedUrl ?? null));
    }
  }, [project]);

  const selected = plan.devices.find((d) => d.id === selectedId) ?? null;
  const selectedWall = plan.walls.find((w) => w.id === selectedWallId) ?? null;
  const selectedLabel = plan.roomLabels.find((label) => label.id === selectedLabelId) ?? null;
  const boq = useMemo(() => buildBoq(plan, retention), [plan, retention]);
  const suggestion = useMemo(() => suggestHardware(boq.cameras), [boq.cameras]);

  function update(updater: (p: PlanData) => PlanData) {
    setPlan((prev) => updater(prev));
  }

  function addDevice(kind: PlacedDevice["kind"], p: { x: number; y: number }) {
    const specId = kind === "camera" ? newCameraSpec : newHardwareSpec;
    const count = plan.devices.filter((d) => d.kind === kind).length + 1;
    const prefix =
      kind === "camera"
        ? "كاميرا"
        : kind === "nvr"
          ? "مسجل"
          : kind === "switch"
            ? "سويتش"
            : "كابينة";
    const device: PlacedDevice = {
      id: uid(),
      kind,
      specId,
      name: `${prefix}${count}`,
      x: p.x,
      y: p.y,
      rotation: -90,
      heightM: 3,
      tilt: 15,
    };
    update((prev) => ({ ...prev, devices: [...prev.devices, device] }));
    setSelectedId(device.id);
  }

  function onCanvasPoint(p: { x: number; y: number }) {
    if (mode === "camera" || mode === "nvr" || mode === "switch" || mode === "rack") {
      addDevice(mode, p);
      return;
    }
    if (mode === "cable") {
      setCableDraft((prev) => [...prev, p]);
      return;
    }
    if (mode === "wall") {
      setWallDraft((prev) => [...prev, p]);
      return;
    }
    if (mode === "label") {
      const text = window.prompt("اكتب اسم الغرفة", "غرفة جديدة")?.trim();
      if (!text) return;
      const label: RoomLabel = { id: uid(), text, x: p.x, y: p.y, fontSize: 18 };
      update((prev) => ({ ...prev, roomLabels: [...prev.roomLabels, label] }));
      setSelectedLabelId(label.id);
      setMode("select");
      return;
    }
    if (mode === "scale") {
      const pts = [...scaleDraft, p];
      if (pts.length < 2) {
        setScaleDraft(pts);
        return;
      }
      const px = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
      const answer = window.prompt("كم يساوي هذا الخط بالأمتار على الطبيعة؟", "5");
      setScaleDraft([]);
      setMode("select");
      const meters = Number(answer);
      if (!answer || !Number.isFinite(meters) || meters <= 0) return;
      update((prev) => ({ ...prev, pxPerMeter: px / meters }));
      toast.success(`تمت المعايرة: ${(px / meters).toFixed(1)} بكسل لكل متر`);
    }
  }

  function finishCable() {
    if (mode === "cable" && cableDraft.length >= 2) {
      update((prev) => ({
        ...prev,
        cables: [...prev.cables, { id: uid(), type: cableType, points: cableDraft }],
      }));
    }
    setCableDraft([]);
    setScaleDraft([]);
  }

  function finishWall() {
    if (mode === "wall" && wallDraft.length >= 2) {
      const wall: WallSegment = { id: uid(), material: wallMaterial, points: wallDraft, curved: wallCurved };
      update((prev) => ({ ...prev, walls: [...prev.walls, wall] }));
      setSelectedWallId(wall.id);
    }
    setWallDraft([]);
  }

  function selectWorkspace(value: "design" | "network" | "coverage" | "boq") {
    setWorkspace(value);
    setMode(value === "network" ? "cable" : "select");
    setCableDraft([]);
    setWallDraft([]);
    setScaleDraft([]);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, selectedLabelId, selectedWallId]);

  async function uploadPlan(file: File) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const path = `${u.user.id}/${id}-${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("floorplans")
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error("تعذّر رفع المخطط");
      return;
    }
    const { data: signed } = await supabase.storage
      .from("floorplans")
      .createSignedUrl(path, 60 * 60 * 8);
    const url = signed?.signedUrl ?? null;
    setImageUrl(url);
    await supabase.from("cctv_projects").update({ floorplan_path: path }).eq("id", id);
    if (url) {
      const img = new Image();
      img.onload = () =>
        update((prev) => ({
          ...prev,
          imageWidth: img.naturalWidth,
          imageHeight: img.naturalHeight,
        }));
      img.src = url;
    }
    toast.success("تم رفع المخطط");
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("cctv_projects")
      .update({ name, client_name: clientName, currency, data: plan as never })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error("تعذّر الحفظ");
      return;
    }
    toast.success("تم حفظ المشروع");
  }

  function exportCsv() {
    const rows = [
      ["البند", "الكمية", "الوحدة", "سعر الوحدة", "الإجمالي"],
      ...boq.lines.map((l) => [
        l.label,
        String(l.qty),
        l.unit,
        String(l.unitPrice),
        String(l.total),
      ]),
      ["الإجمالي الكلي", "", "", "", String(boq.grand)],
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-عرض-سعر.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <div className="p-10 text-muted-foreground">جارٍ تحميل المشروع…</div>;
  if (!project)
    return (
      <div className="p-10">
        <p className="mb-3">المشروع غير موجود.</p>
        <Button onClick={() => navigate({ to: "/projects" })}>العودة للمشاريع</Button>
      </div>
    );

  const tools: { id: CanvasMode; label: string; icon: typeof Camera }[] = [
    { id: "select", label: "تحديد", icon: MousePointer2 },
    { id: "camera", label: "كاميرا", icon: Camera },
    { id: "nvr", label: "مسجل", icon: Server },
    { id: "switch", label: "سويتش", icon: Network },
    { id: "cable", label: "كابل", icon: CableIcon },
    { id: "wall", label: "جدار", icon: BrickWall },
    { id: "label", label: "تسمية", icon: Tag },
    { id: "scale", label: "معايرة", icon: Ruler },
  ];

  return (
    <div className="flex h-screen flex-col">
      <header className="no-print flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link to="/projects" className="text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-56 font-bold"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && uploadPlan(e.target.files[0])}
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <ImageIcon className="ml-1 h-4 w-4" /> رفع مخطط
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="ml-1 h-4 w-4" /> طباعة
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download className="ml-1 h-4 w-4" /> تصدير العرض
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="ml-1 h-4 w-4" /> {saving ? "جارٍ الحفظ" : "حفظ"}
          </Button>
        </div>
      </header>

      <nav className="no-print flex h-11 shrink-0 items-center border-b border-border bg-sidebar px-4" aria-label="مساحات عمل المشروع">
        {([
          ["design", "تصميم المخطط", LayoutTemplate],
          ["network", "الكابلات والشبكة", Network],
          ["coverage", "التغطية", Camera],
          ["boq", "جدول الكميات", Download],
        ] as const).map(([value, label, Icon]) => (
          <Button
            key={value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => selectWorkspace(value)}
            className={`h-11 rounded-none border-b-2 px-5 ${workspace === value ? "border-primary bg-primary/10 text-primary" : "border-transparent text-muted-foreground"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </Button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        {/* شريط الأدوات */}
        <aside className="no-print flex w-[13rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-sidebar p-3">
          <div className="grid grid-cols-3 gap-1.5">
            {tools.filter((tool) => workspace === "network" ? ["select", "switch", "rack", "cable", "scale"].includes(tool.id) : workspace === "coverage" ? ["select", "camera", "scale"].includes(tool.id) : ["select", "camera", "nvr", "switch", "wall", "label", "scale"].includes(tool.id)).map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="outline"
                onClick={() => {
                  setMode(t.id);
                  setCableDraft([]);
                  setWallDraft([]);
                  setScaleDraft([]);
                }}
                className={`h-auto flex-col gap-1 p-2 text-[11px] ${
                  mode === t.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </Button>
            ))}
          </div>

          {mode === "camera" && (
            <div className="space-y-1.5">
              <Label className="text-xs">موديل الكاميرا</Label>
              <select
                className="w-full rounded-md border border-border bg-background p-2 text-xs"
                value={newCameraSpec}
                onChange={(e) => setNewCameraSpec(e.target.value)}
              >
                {cameraCatalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(mode === "nvr" || mode === "switch" || mode === "rack") && (
            <div className="space-y-1.5">
              <Label className="text-xs">الجهاز</Label>
              <select
                className="w-full rounded-md border border-border bg-background p-2 text-xs"
                value={newHardwareSpec}
                onChange={(e) => setNewHardwareSpec(e.target.value)}
              >
                {hardwareCatalog
                  .filter((h) => h.kind === mode)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.label}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {mode === "cable" && (
            <div className="space-y-1.5">
              <Label className="text-xs">درج كابلات الشبكة</Label>
              <div className="space-y-1">
                {cableTypes.filter((c) => c.category === "network").map((c) => (
                  <Button key={c.id} type="button" variant={cableType === c.id ? "default" : "outline"} size="sm" className="w-full justify-start" onClick={() => setCableType(c.id)}>
                    <span className="h-2.5 w-2.5 rounded-full bg-cable" /> {c.label}
                  </Button>
                ))}
              </div>
              <Label className="pt-2 text-xs">درج كابلات الفايبر</Label>
              <div className="space-y-1">
                {cableTypes.filter((c) => c.category === "fiber").map((c) => (
                  <Button key={c.id} type="button" variant={cableType === c.id ? "default" : "outline"} size="sm" className="w-full justify-start" onClick={() => setCableType(c.id)}>
                    <span className="h-2.5 w-2.5 rounded-full bg-fiber" /> {c.label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                انقر لإضافة نقاط المسار، ثم نقرة مزدوجة أو Esc للإنهاء.
              </p>
            </div>
          )}

          {mode === "wall" && (
            <div className="space-y-1.5">
              <Label className="text-xs">نوع الجدار</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {wallMaterials.map((m) => {
                  const Icon = m.id === "brick" ? BrickWall : m.id === "glass" ? GlassWater : Fence;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setWallMaterial(m.id)}
                      className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] transition-colors ${
                        wallMaterial === m.id
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-4 w-4" style={{ color: wallMaterial === m.id ? undefined : m.color }} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between rounded-md border border-border p-2">
                <span className="flex items-center gap-1.5 text-xs">
                  <Spline className="h-3.5 w-3.5" /> رسم منحني
                </span>
                <Switch checked={wallCurved} onCheckedChange={setWallCurved} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                انقر لإضافة نقاط الجدار، ثم نقرة مزدوجة أو Esc للإنهاء. فعّل «رسم منحني» لجدار دائري أو ركن مُقوّس.
              </p>
            </div>
          )}

          {mode === "label" && (
            <p className="rounded-md bg-primary/10 p-2 text-[11px] text-primary">انقر على موضع الغرفة في المخطط، ثم اكتب اسمها.</p>
          )}

          {mode === "scale" && (
            <p className="rounded-md bg-accent/15 p-2 text-[11px] text-accent">
              انقر نقطتين على مسافة معلومة في المخطط ثم أدخل طولها بالأمتار.
            </p>
          )}

          <div className="flex items-center justify-between rounded-md border border-border p-2">
            <span className="text-xs">إظهار التغطية</span>
            <Switch
              checked={plan.showCoverage}
              onCheckedChange={(v) => update((prev) => ({ ...prev, showCoverage: v }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">مقياس المخطط (بكسل/متر)</Label>
            <Input
              type="number"
              className="h-8"
              value={Number(plan.pxPerMeter.toFixed(2))}
              onChange={(e) =>
                update((prev) => ({ ...prev, pxPerMeter: Number(e.target.value) || 1 }))
              }
            />
          </div>

          <div className="rounded-md border border-border p-2 text-[11px] text-muted-foreground">
            <p className="mb-1 font-bold text-foreground">دليل الألوان</p>
            {ppmLevels.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-4 rounded-sm"
                  style={{ background: "var(--color-coverage)", opacity: l.opacity }}
                />
                {l.label} ({l.ppm} بكسل/م)
              </div>
            ))}
          </div>
        </aside>

        {/* اللوحة */}
        <main className="min-w-0 flex-1">
          <PlanCanvas
            plan={plan}
            imageUrl={imageUrl}
            mode={mode}
            selectedId={selectedId}
            selectedWallId={selectedWallId}
            selectedLabelId={selectedLabelId}
            cableDraft={cableDraft}
            cableDraftType={cableType}
            wallDraft={wallDraft}
            wallCurved={wallCurved}
            scaleDraft={scaleDraft}
            onSelect={(sid) => {
              setSelectedId(sid);
              if (sid) setSelectedWallId(null);
              if (sid) setSelectedLabelId(null);
            }}
            onSelectWall={(wallId) => {
              setSelectedWallId(wallId);
              if (wallId) setSelectedLabelId(null);
            }}
            onSelectLabel={setSelectedLabelId}
            onCanvasPoint={onCanvasPoint}
            onMoveDevice={(did, p) =>
              update((prev) => ({
                ...prev,
                devices: prev.devices.map((d) => (d.id === did ? { ...d, x: p.x, y: p.y } : d)),
              }))
            }
            onMoveLabel={(labelId, p) =>
              update((prev) => ({
                ...prev,
                roomLabels: prev.roomLabels.map((label) => label.id === labelId ? { ...label, x: p.x, y: p.y } : label),
              }))
            }
            onFinishCable={finishCable}
            onFinishWall={finishWall}
          />
        </main>

        {/* اللوحة الجانبية */}
        <aside className="flex w-[21rem] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar">
          <Tabs defaultValue="props" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="no-print grid w-full shrink-0 grid-cols-4 rounded-none">
              <TabsTrigger value="props">الخصائص</TabsTrigger>
              <TabsTrigger value="devices">الأجهزة</TabsTrigger>
              <TabsTrigger value="boq">التسعير</TabsTrigger>
              <TabsTrigger value="agent" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                المساعد
              </TabsTrigger>
            </TabsList>

            <TabsContent value="props" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {!selected ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    اختر جهازاً من المخطط لعرض خصائصه.
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">اسم العميل</Label>
                    <Input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">العملة</Label>
                    <Input
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">مدة التخزين المطلوبة: {retention} يوم</Label>
                    <Slider
                      min={3}
                      max={90}
                      step={1}
                      value={[retention]}
                      onValueChange={(v) => setRetention(v[0] ?? retention)}
                    />
                  </div>
                </div>
              ) : (
                <SelectedPanel
                  device={selected}
                  plan={plan}
                  onChange={(patch) =>
                    update((prev) => ({
                      ...prev,
                      devices: prev.devices.map((d) =>
                        d.id === selected.id ? { ...d, ...patch } : d,
                      ),
                    }))
                  }
                  onDelete={() => {
                    update((prev) => ({
                      ...prev,
                      devices: prev.devices.filter((d) => d.id !== selected.id),
                    }));
                    setSelectedId(null);
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="devices" className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {plan.devices.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد أجهزة بعد.</p>
              )}
              {plan.devices.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`flex w-full items-center justify-between rounded-md border p-2 text-right text-sm ${
                    d.id === selectedId
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span>{d.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.kind === "camera" ? cameraById(d.specId).label : d.kind}
                  </span>
                </button>
              ))}
              {plan.cables.length > 0 && (
                <div className="pt-3">
                  <p className="mb-2 text-xs font-bold">مسارات الكابلات</p>
                  {plan.cables.map((c, i) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between border-b border-border py-1.5 text-xs"
                    >
                      <span>
                        مسار {i + 1} — {cableTypes.find((t) => t.id === c.type)?.label}
                      </span>
                      <button
                        onClick={() =>
                          update((prev) => ({
                            ...prev,
                            cables: prev.cables.filter((x) => x.id !== c.id),
                          }))
                        }
                        className="text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="boq" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="عدد الكاميرات" value={`${boq.cameras}`} />
                <Stat label="حمل PoE" value={`${boq.poeLoad} واط`} />
                <Stat label="إجمالي البث" value={`${boq.totalBitrate} ميجابت/ث`} />
                <Stat label="التخزين المطلوب" value={`${boq.neededTb.toFixed(1)} تيرا`} />
              </div>
              <div className="rounded-md border border-border p-2 text-xs text-muted-foreground">
                المقترح: {suggestion.nvr?.label ?? "—"}
                {suggestion.sw ? ` + ${suggestion.sw.label}` : ""}
              </div>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 text-right">البند</th>
                    <th className="py-1.5">الكمية</th>
                    <th className="py-1.5">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {boq.lines.map((l) => (
                    <tr key={l.label} className="border-b border-border/60">
                      <td className="py-1.5 pl-2">{l.label}</td>
                      <td className="py-1.5 text-center">
                        {l.qty} {l.unit}
                      </td>
                      <td className="py-1.5 text-center">{formatMoney(l.total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between rounded-md bg-primary/15 p-3 font-bold text-primary">
                <span>الإجمالي</span>
                <span>{formatMoney(boq.grand, currency)}</span>
              </div>
            </TabsContent>

            <TabsContent value="agent" className="min-h-0 flex-1 overflow-hidden">
              <AgentPanel projectId={id} projectName={name} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}

function SelectedPanel({
  device,
  plan,
  onChange,
  onDelete,
}: {
  device: PlacedDevice;
  plan: PlanData;
  onChange: (patch: Partial<PlacedDevice>) => void;
  onDelete: () => void;
}) {
  const spec = device.kind === "camera" ? cameraById(device.specId) : null;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">الاسم</Label>
        <Input
          className="h-8"
          value={device.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      {spec && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">الموديل</Label>
            <select
              className="w-full rounded-md border border-border bg-background p-2 text-xs"
              value={device.specId}
              onChange={(e) => onChange({ specId: e.target.value })}
            >
              {cameraCatalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {spec.model} • {spec.megapixel} ميجا • عدسة {spec.focal}مم • زاوية {spec.hfov}°
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">اتجاه الكاميرا: {Math.round(device.rotation)}°</Label>
            <Slider
              min={-180}
              max={180}
              step={1}
              value={[device.rotation]}
              onValueChange={(v) => onChange({ rotation: v[0] ?? device.rotation })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">ارتفاع التركيب: {device.heightM.toFixed(1)} م</Label>
            <Slider
              min={1}
              max={12}
              step={0.1}
              value={[device.heightM]}
              onValueChange={(v) => onChange({ heightM: v[0] ?? device.heightM })}
            />
          </div>

          <div className="rounded-md border border-border p-2 text-[11px]">
            <p className="mb-1 font-bold">مدى الوضوح (حسب المقياس الحالي)</p>
            {ppmLevels.map((l) => (
              <div key={l.id} className="flex justify-between py-0.5 text-muted-foreground">
                <span>{l.label}</span>
                <span>حتى {distanceForPpm(spec, l.ppm).toFixed(1)} م</span>
              </div>
            ))}
            <p className="mt-1 text-muted-foreground">مدى الأشعة تحت الحمراء: {spec.irRange} م</p>
            <p className="text-muted-foreground">
              مقياس المخطط: {plan.pxPerMeter.toFixed(1)} بكسل/م
            </p>
          </div>
        </>
      )}

      <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
        <Trash2 className="ml-1 h-4 w-4" /> حذف الجهاز
      </Button>
    </div>
  );
}
