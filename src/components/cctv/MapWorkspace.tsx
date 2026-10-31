import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Camera, Crosshair, LocateFixed, MapPin, PenLine, Search, Trash2 } from "lucide-react";
import { AutoDesignPanel } from "@/components/cctv/AutoDesignPanel";
import {
  localToGeo,
  runAutoDesign,
  screenToBearing,
  siteDesignInput,
  type CoverageGoal,
  type Proposal,
} from "@/lib/cctv/auto-design";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cameraCatalog, cameraById } from "@/lib/cctv/catalog";
import { distanceForPpm, ppmLevels } from "@/lib/cctv/geometry";
import { sectorLatLngs, type MapCamera, type SiteMapData } from "@/lib/cctv/site-map";
import { generateAiSiteDesign } from "@/lib/ai-site-designer.functions";
import { wirelessLinkAssessment, type GeoPoint } from "@/lib/cctv/wireless-links";

const LEVEL_COLORS = ["#1e3a8a", "#3b82f6", "#22c55e", "#eab308"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type GisProposal={id:string;specId:string;lat:number;lng:number;bearing:number;heightM:number;
  tilt:number;targetDistanceM:number;blindSpotM:number;ppmAtTarget:number;reason:string};
export function MapWorkspace({
  siteMap, onChange, projectId, layoutId, onSave,
}: {
  siteMap: SiteMapData;
  onChange: (next: SiteMapData) => void;
  projectId:string;
  layoutId:string;
  onSave:()=>Promise<boolean>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const stateRef = useRef(siteMap);
  stateRef.current = siteMap;
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placingLink, setPlacingLink] = useState(false);
  const placingLinkRef = useRef(false);
  placingLinkRef.current = placingLink;
  const linkStartRef = useRef<GeoPoint | null>(null);
  const placingRef = useRef(false);
  placingRef.current = placing;
  const [specId, setSpecId] = useState(cameraCatalog[0]?.id ?? "");
  const specRef = useRef(specId);
  specRef.current = specId;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawingBoundary, setDrawingBoundary] = useState(false);
  const boundaryRef = useRef(false);
  boundaryRef.current = drawingBoundary;
  const [proposals, setProposals] = useState<
    (Proposal & { lat: number; lng: number; bearing: number })[] | null
  >(null);
  const [aiCoverage, setAiCoverage] = useState(0);
  const [gisProposals,setGisProposals]=useState<GisProposal[]|null>(null);
  const [gisBusy,setGisBusy]=useState(false);
  const [gisError,setGisError]=useState("");
  const [gisSummary,setGisSummary]=useState("");
  const [gisGoal,setGisGoal]=useState<CoverageGoal>("recognize");
  const [gisMax,setGisMax]=useState(8);
  const [gisProvisional,setGisProvisional]=useState(false);
  const [gisNotes,setGisNotes]=useState("");
  const [gisFeedback,setGisFeedback]=useState("");
  const [gisExcluded,setGisExcluded]=useState<string[]>([]);
  async function generateGisProposal(){
    if(gisBusy)return;
    if((siteMap.boundary??[]).length<3){setGisError("ارسم حدود الموقع أولًا");return}
    setGisBusy(true);setGisError("");setGisProposals(null);setGisExcluded([]);
    try{
      if(!await onSave())throw new Error("تعذر حفظ خريطة الموقع قبل التحليل");
      const result=await generateAiSiteDesign({data:{
        projectId,layoutId,mode:"site",scope:"perimeter",goal:gisGoal,maxCameras:gisMax,
        allowProvisionalOptics:gisProvisional,
        requirements:gisNotes,feedback:gisFeedback||undefined
      }});
      if("error" in result)throw new Error(String(result.error));
      if(!result.siteProposals?.length)throw new Error("لم يُعتمد أي اقتراح لخريطة الموقع");
      setGisProposals(result.siteProposals);
      setGisSummary(result.summary);
    }catch(err){setGisError(err instanceof Error?err.message:"تعذر التحليل")}
    finally{setGisBusy(false)}
  }
  function applyGisProposal(){
    const selected=(gisProposals??[]).filter(p=>!gisExcluded.includes(p.id));
    if(!selected.length||!window.confirm(`اعتماد ${selected.length} كاميرا على خريطة الموقع وإضافتها إلى جدول الكميات؟`))return;
    const newCameras:MapCamera[]=selected.map((p,i)=>({
      id:p.id,specId:p.specId,name:`AI GIS Camera ${siteMap.cameras.length+i+1}`,
      lat:p.lat,lng:p.lng,rotation:p.bearing,heightM:p.heightM
    }));
    onChange({...siteMap,cameras:[...siteMap.cameras,...newCameras]});
    setGisProposals(null);setGisExcluded([]);
    toast.success(`تمت إضافة ${newCameras.length} كاميرا؛ راجع الشبكة والتوصيلات المطلوبة`);
  }

  const [query, setQuery] = useState(siteMap.address);
  const [latInput, setLatInput] = useState(siteMap.center?.lat.toFixed(6) ?? "");
  const [lngInput, setLngInput] = useState(siteMap.center?.lng.toFixed(6) ?? "");

  // Init map (browser only, dynamic import).
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      const L =
        (mod as unknown as { default?: typeof Leaflet }).default ??
        (mod as unknown as typeof Leaflet);
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const start = stateRef.current.center ?? { lat: 30.0444, lng: 31.2357 };
      const map = L.map(containerRef.current, { zoomControl: true, maxZoom: 21 }).setView(
        [start.lat, start.lng],
        stateRef.current.center ? stateRef.current.zoom : 12,
      );
      const googleKey = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"];

      if (googleKey) {
        // طبقة Google Maps Hybrid (قمر صناعي + أسماء وتفاصيل الشوارع)
        L.tileLayer(`https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${googleKey}`, {
          maxZoom: 21,
          attribution: "Map data © Google",
        }).addTo(map);
      } else {
        // بديل تلقائي (Esri) في حال عدم وجود المفتاح
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 21, maxNativeZoom: 19, attribution: "Tiles © Esri" },
        ).addTo(map);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 21, maxNativeZoom: 19, attribution: "Tiles © Esri" },
        ).addTo(map);
      }

      L.control.scale({ metric: true, imperial: false }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      map.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const cur = stateRef.current;
        if (boundaryRef.current) {
          onChangeRef.current({
            ...cur,
            boundary: [...(cur.boundary ?? []), { lat: e.latlng.lat, lng: e.latlng.lng }],
          });
          return;
        }
        if (placingLinkRef.current) {
          const nextPoint = {lat:e.latlng.lat,lng:e.latlng.lng};
          const first = linkStartRef.current;
          if (!first) {
            linkStartRef.current=nextPoint;
            toast.info("اختر النقطة الثانية لإنشاء رابط PTP");
          } else {
            linkStartRef.current=null;
            const link={
              id:uid(),name:`PTP ${(cur.wirelessLinks?.length??0)+1}`,
              from:first,to:nextPoint,frequencyGHz:5.8,heightFromM:6,heightToM:6
            };
            if (!wirelessLinkAssessment(link).valid) {
              toast.error("رابط PTP غير صالح؛ تحقق من النقطتين");
              return;
            }
            onChangeRef.current({...cur,wirelessLinks:[...(cur.wirelessLinks??[]),link]});
            setPlacingLink(false);
          }
          return;
        }
        if (!placingRef.current) return;
        const cam: MapCamera = {
          id: uid(),
          specId: specRef.current,
          name: `Outdoor Cam ${cur.cameras.length + 1}`,
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          rotation: 0,
          heightM: 4,
        };
        onChangeRef.current({ ...cur, cameras: [...cur.cameras, cam] });
        setSelectedId(cam.id);
      });
      map.on("moveend", () => {
        const c = map.getCenter();
        const cur = stateRef.current;
        if (!cur.center) return;
        onChangeRef.current({ ...cur, center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() });
      });
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Redraw cameras and coverage.
  useEffect(() => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    if (siteMap.center) {
      L.circleMarker([siteMap.center.lat, siteMap.center.lng], {
        radius: 5,
        color: "#f59e0b",
        fillOpacity: 1,
      }).addTo(layer);
    }
    const boundary = siteMap.boundary ?? [];
    if (boundary.length >= 2) {
      L.polygon(
        boundary.map((b) => [b.lat, b.lng] as [number, number]),
        { color: "#f97316", weight: 2, dashArray: "6 4", fillOpacity: 0.05, interactive: false },
      ).addTo(layer);
    }
    for (const p of proposals ?? []) {
      const d = distanceForPpm(p.spec, ppmLevels[1].ppm);
      L.polygon(
        sectorLatLngs(p.lat, p.lng, p.bearing, p.spec.hfov, Math.max(d, p.targetDistanceM)),
        {
          color: "#f97316",
          weight: 1,
          dashArray: "4 3",
          fillOpacity: 0.25,
          interactive: false,
        },
      ).addTo(layer);
      L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: "#fff",
        fillColor: "#f97316",
        fillOpacity: 1,
      }).addTo(layer);
    }
    for (const link of siteMap.wirelessLinks??[]) {
      const assessment=wirelessLinkAssessment(link);
      if(!assessment.valid)continue;
      L.polyline([[link.from.lat,link.from.lng],[link.to.lat,link.to.lng]],{
        color:"#0284c7",weight:3,dashArray:"8 6",interactive:false
      }).addTo(layer);
      L.circleMarker([link.from.lat,link.from.lng],{radius:5,color:"#0284c7",fillOpacity:1,interactive:false}).addTo(layer);
      L.circleMarker([link.to.lat,link.to.lng],{radius:5,color:"#0284c7",fillOpacity:1,interactive:false}).addTo(layer);
    }
    for(const p of gisProposals??[]){
      const spec=cameraById(p.specId);
      if(!spec)continue;
      L.polygon(sectorLatLngs(p.lat,p.lng,p.bearing,spec.hfov,p.targetDistanceM),{
        color:"#FFB900",weight:2,fillOpacity:0.15,interactive:false,dashArray:"3 4",
      }).addTo(layer);
      L.circleMarker([p.lat,p.lng],{radius:9,color:"#030957",fillColor:"#FFB900",
        fillOpacity:1,interactive:false,weight:2}).addTo(layer);
    }
    for (const cam of siteMap.cameras) {
      const spec = cameraById(cam.specId);
      if (spec) {
        [...ppmLevels].reverse().forEach((lvl, ri) => {
          const i = ppmLevels.length - 1 - ri;
          const d = distanceForPpm(spec, lvl.ppm);
          L.polygon(sectorLatLngs(cam.lat, cam.lng, cam.rotation, spec.hfov, d), {
            color: LEVEL_COLORS[i],
            weight: 1,
            fillOpacity: lvl.opacity,
            interactive: false,
          }).addTo(layer);
        });
      }
      const sel = cam.id === selectedId;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50%;background:${sel ? "#f59e0b" : "#06b6d4"};border:2px solid #fff;box-shadow:0 0 4px #000;display:flex;align-items:center;justify-content:center;color:#000;font:bold 10px sans-serif">C</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const m = L.marker([cam.lat, cam.lng], { icon, draggable: true, title: cam.name }).addTo(
        layer,
      );
      m.on("click", () => setSelectedId(cam.id));
      m.on("dragend", () => {
        const p = m.getLatLng();
        const cur = stateRef.current;
        onChangeRef.current({
          ...cur,
          cameras: cur.cameras.map((c) => (c.id === cam.id ? { ...c, lat: p.lat, lng: p.lng } : c)),
        });
      });
    }
  }, [ready, siteMap, selectedId, proposals, gisProposals]);

  function generate(goal: CoverageGoal, maxCameras: number) {
    const boundary = siteMap.boundary ?? [];
    if (boundary.length < 3) {
      toast.error("ارسم حدود الموقع أولاً (3 نقاط على الأقل)");
      return;
    }
    const specs = cameraCatalog.filter((c) => c.engineeringReady !== false);
    const { input, origin } = siteDesignInput(
      boundary,
      goal,
      specs.length ? specs : cameraCatalog,
      maxCameras,
      4,
    );
    const result = runAutoDesign(input);
    setAiCoverage(result.coverage);
    setProposals(
      result.proposals.map((p) => ({
        ...p,
        ...localToGeo(origin, p.pos),
        bearing: screenToBearing(p.rotation),
      })),
    );
    if (!result.proposals.length) toast.error("لم يتم العثور على توزيع مناسب");
  }

  function applyProposals() {
    if (!proposals?.length) return;
    const start = siteMap.cameras.length;
    const cams: MapCamera[] = proposals.map((p, i) => ({
      id: uid(),
      specId: p.spec.id,
      name: `Outdoor Cam ${start + i + 1}`,
      lat: p.lat,
      lng: p.lng,
      rotation: p.bearing,
      heightM: p.heightM,
    }));
    onChange({ ...siteMap, cameras: [...siteMap.cameras, ...cams] });
    setProposals(null);
    toast.success(`تمت إضافة ${cams.length} كاميرا خارجية إلى جدول الكميات`);
  }

  function setSite(lat: number, lng: number, address?: string) {
    onChange({ ...siteMap, center: { lat, lng }, zoom: 18, address: address ?? siteMap.address });
    setLatInput(lat.toFixed(6));
    setLngInput(lng.toFixed(6));
    mapRef.current?.setView([lat, lng], 18);
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    const coord = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coord) {
      setSite(Number(coord[1]), Number(coord[2]));
      return;
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { "Accept-Language": "ar,en" } },
      );
      const list = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      const hit = list[0];
      if (!hit) {
        toast.error("لم يتم العثور على الموقع");
        return;
      }
      setSite(Number(hit.lat), Number(hit.lon), hit.display_name);
    } catch {
      toast.error("تعذّر البحث عن الموقع");
    }
  }

  function applyCoords() {
    const lat = Number(latInput);
    const lng = Number(lngInput);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      toast.error("إحداثيات غير صحيحة");
      return;
    }
    setSite(lat, lng);
  }

  function myLocation() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setSite(p.coords.latitude, p.coords.longitude),
      () => toast.error("تعذّر تحديد موقعك"),
    );
  }

  function updateCam(id: string, patch: Partial<MapCamera>) {
    onChange({
      ...siteMap,
      cameras: siteMap.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }
  function removeCam(id: string) {
    onChange({ ...siteMap, cameras: siteMap.cameras.filter((c) => c.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  const selected = siteMap.cameras.find((c) => c.id === selectedId) ?? null;
  const selSpec = selected ? cameraById(selected.specId) : null;
  const totalCost = siteMap.cameras.reduce((s, c) => s + (cameraById(c.specId)?.price ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1">
        <div className="absolute inset-x-3 top-3 z-[500] flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/95 p-2 shadow">
          <div className="flex flex-1 items-center gap-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder="ابحث بالعنوان أو الصق إحداثيات 30.1563, 31.7602"
              className="h-8"
            />
            <Button size="sm" variant="secondary" onClick={() => void search()}>
              <Search className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="secondary" onClick={myLocation} title="موقعي">
              <LocateFixed className="h-4 w-4" />
            </Button>
          </div>
          <select
            value={specId}
            onChange={(e) => setSpecId(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            {cameraCatalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant={placing ? "default" : "outline"}
            onClick={() => { setPlacing((v) => !v); setPlacingLink(false); linkStartRef.current = null; setDrawingBoundary(false); }}
          >
            <Camera className="h-4 w-4" />
            {placing ? "انقر على الخريطة لوضع كاميرا" : "إضافة كاميرا"}
          </Button>
          <Button
            size="sm"
            variant={placingLink ? "default" : "outline"}
            onClick={() => {
              setPlacingLink((v) => !v);
              linkStartRef.current = null;
              setPlacing(false);
              setDrawingBoundary(false);
            }}
          >
            {placingLink ? "حدد نقطتي PTP" : "رابط لاسلكي PTP"}
          </Button>
        </div>
        <div
          ref={containerRef}
          className={`h-full w-full ${placing || drawingBoundary ? "cursor-crosshair" : ""}`}
        />
        <div className="absolute bottom-6 left-3 z-[500] flex flex-col items-start gap-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={drawingBoundary ? "default" : "secondary"}
              onClick={() => {
                setPlacing(false);
                setPlacingLink(false);
                linkStartRef.current = null;
                setDrawingBoundary((v) => !v);
              }}
            >
              <PenLine className="h-4 w-4" />
              {drawingBoundary ? "إنهاء رسم الحدود" : "رسم حدود الموقع"}
            </Button>
            {(siteMap.boundary?.length ?? 0) > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onChange({ ...siteMap, boundary: [] })}
              >
                مسح الحدود
              </Button>
            )}
          </div>
          <AutoDesignPanel
            proposals={proposals}
            coverage={aiCoverage}
            hint="ارسم حدود الموقع بالنقر على الخريطة، ثم ولّد توزيعاً لكاميرات المحيط على السور موجّهة للداخل."
            onGenerate={generate}
            onApply={applyProposals}
            onReject={() => setProposals(null)}
            onRemove={(id) => setProposals((p) => p?.filter((x) => x.id !== id) ?? null)}
          />
        </div>
      </div>

      <aside className="no-print w-80 shrink-0 overflow-y-auto border-r border-border bg-surface p-4 text-sm">
        <h3 className="mb-2 flex items-center gap-2 font-bold">
          <MapPin className="h-4 w-4 text-primary" /> موقع المشروع
        </h3>
        {siteMap.address && <p className="mb-2 text-xs text-muted-foreground">{siteMap.address}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={latInput}
            onChange={(e) => setLatInput(e.target.value)}
            placeholder="Lat"
            className="h-8"
            dir="ltr"
          />
          <Input
            value={lngInput}
            onChange={(e) => setLngInput(e.target.value)}
            placeholder="Lng"
            className="h-8"
            dir="ltr"
          />
        </div>
        <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={applyCoords}>
          <Crosshair className="h-4 w-4" /> تثبيت الإحداثيات
        </Button>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md border border-border p-2">
            <div className="text-lg font-bold">{siteMap.cameras.length}</div>
            <div className="text-xs text-muted-foreground">كاميرات خارجية</div>
          </div>
          <div className="rounded-md border border-border p-2">
            <div className="text-lg font-bold">{totalCost.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">تكلفة الكاميرات</div>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <h3 className="font-bold">روابط لاسلكية PTP</h3>
          {(siteMap.wirelessLinks??[]).length===0 && <p className="text-xs text-muted-foreground">لا توجد روابط. اضغط PTP ثم اختر نقطتين على الخريطة.</p>}
          {(siteMap.wirelessLinks??[]).map(link=>{
            const assessment=wirelessLinkAssessment(link);
            return <div key={link.id} className="rounded-lg border border-border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <strong>{link.name}</strong>
                <Button size="sm" variant="ghost" aria-label={`حذف ${link.name}`} onClick={() => onChange({...siteMap,wirelessLinks:(siteMap.wirelessLinks??[]).filter(l=>l.id!==link.id)})}><Trash2 className="h-3 w-3"/></Button>
              </div>
              <p>المسافة: {assessment.valid ? assessment.distanceM.toFixed(1)+" م" : "غير صالحة"}</p>
              <p>60% Fresnel: {assessment.minimumClearanceM?.toFixed(2)??"—"} م</p>
              <label className="mt-2 block">التردد (GHz)
                <Input type="number" min="0.1" step="0.1" value={link.frequencyGHz} onChange={e=>onChange({...siteMap,wirelessLinks:(siteMap.wirelessLinks??[]).map(l=>l.id===link.id?{...l,frequencyGHz:Number(e.target.value)}:l)})}/>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["heightFromM","heightToM"] as const).map((field,i)=><label key={field}>ارتفاع الطرف {i+1} (م)
                  <Input type="number" min="0.1" step="0.5" value={link[field]} onChange={e=>onChange({...siteMap,wirelessLinks:(siteMap.wirelessLinks??[]).map(l=>l.id===link.id?{...l,[field]:Number(e.target.value)}:l)})}/>
                </label>)}
              </div>
              <p className="mt-2 text-amber-700">خط النظر وخلو منطقة Fresnel من العوائق غير معتمدين قبل رفع المناسيب وفحص الموقع.</p>
            </div>;
          })}
        </div>

        <section className="mt-5 space-y-3 rounded-lg border border-[#030957]/20 p-3" dir="rtl">
          <h3 className="font-bold text-[#030957]">AI Site Designer — مخطط GIS</h3>
          <p className="text-xs text-muted-foreground">حلل حدود الموقع مع الكتالوج المعتمد ثم راجع مواقع الكاميرات قبل إضافتها.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">مستوى التغطية
              <select value={gisGoal} onChange={e=>setGisGoal(e.target.value as CoverageGoal)} className="mt-1 w-full rounded border p-2">
                <option value="detect">كشف 25 PPM</option><option value="observe">ملاحظة 63 PPM</option>
                <option value="recognize">تعرف 125 PPM</option><option value="identify">تمييز 250 PPM</option>
              </select>
            </label>
            <label className="text-xs">الحد الأقصى
              <Input type="number" min={1} max={32} value={gisMax} onChange={e=>setGisMax(Math.max(1,Math.min(32,Number(e.target.value)||1)))}/>
            </label>
          </div>
          <label className="block text-xs">أولويات المنطقة
            <textarea value={gisNotes} onChange={e=>setGisNotes(e.target.value)} maxLength={1600}
              rows={2} className="mt-1 w-full rounded border p-2" placeholder="بوابة، سور، مناطق حساسة، اتجاهات الحركة"/>
          </label>
          <label className="block text-xs">ملاحظات إعادة التصميم
            <textarea value={gisFeedback} onChange={e=>setGisFeedback(e.target.value)} maxLength={1200}
              rows={2} className="mt-1 w-full rounded border p-2" placeholder="قلل نقاط التثبيت في الجانب الغربي"/>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-amber-300 p-2 text-xs">
            <input type="checkbox" checked={gisProvisional} onChange={e=>setGisProvisional(e.target.checked)}/>
            <span>السماح باستخدام مواصفات بصرية أولية غير موثّقة من الداتا شيت للمراجعة الهندسية فقط.</span>
          </label>
          <Button disabled={gisBusy} className="w-full bg-[#030957] text-white" onClick={()=>void generateGisProposal()}>
            {gisBusy?"جارٍ التحليل...":"اقتراح توزيع GIS عبر AI Gateway"}
          </Button>
          {gisError&&<p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-700">{gisError}</p>}
          {gisProposals&&<div className="space-y-2">
            {gisSummary&&<p className="text-xs">{gisSummary}</p>}
            {gisProposals.map(p=><label key={p.id} className="block rounded border p-2 text-xs">
              <span className="flex gap-2"><input type="checkbox" checked={!gisExcluded.includes(p.id)}
                onChange={e=>setGisExcluded(v=>e.target.checked?v.filter(id=>id!==p.id):[...v,p.id])}/>
                <strong>{cameraById(p.specId)?.model??p.specId}</strong></span>
              <span className="block">الاتجاه {p.bearing.toFixed(0)}° · {p.ppmAtTarget} PPM · ارتفاع {p.heightM}م</span>
              <span className="block text-muted-foreground">{p.reason}</span>
            </label>)}
            <div className="flex gap-2">
              <Button disabled={gisBusy||gisProposals.every(p=>gisExcluded.includes(p.id))} onClick={applyGisProposal}>اعتماد المختار</Button>
              <Button variant="outline" onClick={()=>setGisProposals(null)}>رفض</Button>
            </div>
          </div>}
          <p className="text-xs text-amber-800">المعاينة لا تثبت خط النظر أو الارتفاعات والتضاريس؛ راجعها ميدانيًا.</p>
        </section>
        {selected && selSpec && (
          <div className="mt-4 space-y-2 rounded-lg border border-primary/40 p-3">
            <Input
              value={selected.name}
              onChange={(e) => updateCam(selected.id, { name: e.target.value })}
              className="h-8"
            />
            <select
              value={selected.specId}
              onChange={(e) => updateCam(selected.id, { specId: e.target.value })}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            >
              {cameraCatalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="block text-xs">
              الاتجاه: {Math.round(selected.rotation)}°
              <input
                type="range"
                min={0}
                max={359}
                value={selected.rotation}
                onChange={(e) => updateCam(selected.id, { rotation: Number(e.target.value) })}
                className="w-full"
              />
            </label>
            <label className="block text-xs">
              ارتفاع التركيب (م)
              <Input
                type="number"
                min={1}
                step={0.5}
                value={selected.heightM}
                onChange={(e) => updateCam(selected.id, { heightM: Number(e.target.value) || 0 })}
                className="h-8"
              />
            </label>
            <div className="space-y-1 text-xs">
              {ppmLevels.map((l, i) => (
                <div key={l.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: LEVEL_COLORS[i] }}
                    />
                    {l.label} ({l.ppm} PPM)
                  </span>
                  <span>{distanceForPpm(selSpec, l.ppm).toFixed(1)} م</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
            </p>
            <Button
              size="sm"
              variant="destructive"
              className="w-full"
              onClick={() => removeCam(selected.id)}
            >
              <Trash2 className="h-4 w-4" /> حذف الكاميرا
            </Button>
          </div>
        )}

        <h4 className="mb-1 mt-4 text-xs font-bold text-muted-foreground">الكاميرات على الخريطة</h4>
        <ul className="space-y-1">
          {siteMap.cameras.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(c.id);
                  mapRef.current?.panTo([c.lat, c.lng]);
                }}
                className={`w-full rounded px-2 py-1 text-right text-xs ${c.id === selectedId ? "bg-primary/20" : "hover:bg-muted"}`}
              >
                {c.name} — {cameraById(c.specId)?.label}
              </button>
            </li>
          ))}
          {siteMap.cameras.length === 0 && (
            <li className="text-xs text-muted-foreground">
              حدد الموقع ثم اضغط "إضافة كاميرا" وانقر على الخريطة.
            </li>
          )}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          الكاميرات الخارجية تُحسب تلقائيًا في جدول الكميات وعرض السعر.
        </p>
      </aside>
    </div>
  );
}
