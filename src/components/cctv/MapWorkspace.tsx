import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Camera, Crosshair, LocateFixed, MapPin, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cameraCatalog, cameraById } from "@/lib/cctv/catalog";
import { distanceForPpm, ppmLevels } from "@/lib/cctv/geometry";
import { sectorLatLngs, type MapCamera, type SiteMapData } from "@/lib/cctv/site-map";

const LEVEL_COLORS = ["#1e3a8a", "#3b82f6", "#22c55e", "#eab308"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function MapWorkspace({
  siteMap,
  onChange,
}: {
  siteMap: SiteMapData;
  onChange: (next: SiteMapData) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const stateRef = useRef(siteMap);
  stateRef.current = siteMap;
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  placingRef.current = placing;
  const [specId, setSpecId] = useState(cameraCatalog[0]?.id ?? "");
  const specRef = useRef(specId);
  specRef.current = specId;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState(siteMap.address);
  const [latInput, setLatInput] = useState(siteMap.center?.lat.toFixed(6) ?? "");
  const [lngInput, setLngInput] = useState(siteMap.center?.lng.toFixed(6) ?? "");

  // Init map (browser only, dynamic import).
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      const L = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const start = stateRef.current.center ?? { lat: 30.0444, lng: 31.2357 };
      const map = L.map(containerRef.current, { zoomControl: true, maxZoom: 21 }).setView(
        [start.lat, start.lng],
        stateRef.current.center ? stateRef.current.zoom : 12,
      );
      const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

      if (googleKey) {
        // طبقة Google Maps Hybrid (قمر صناعي + أسماء وتفاصيل الشوارع)
        L.tileLayer(
          `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${googleKey}`,
          {
            maxZoom: 21,
            attribution: "Map data © Google",
          }
        ).addTo(map);
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
        if (!placingRef.current) return;
        const cur = stateRef.current;
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
      const m = L.marker([cam.lat, cam.lng], { icon, draggable: true, title: cam.name }).addTo(layer);
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
  }, [ready, siteMap, selectedId]);

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
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
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
    onChange({ ...siteMap, cameras: siteMap.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
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
          <Button size="sm" variant={placing ? "default" : "outline"} onClick={() => setPlacing((v) => !v)}>
            <Camera className="h-4 w-4" />
            {placing ? "انقر على الخريطة لوضع كاميرا" : "إضافة كاميرا"}
          </Button>
        </div>
        <div ref={containerRef} className={`h-full w-full ${placing ? "cursor-crosshair" : ""}`} />
      </div>

      <aside className="no-print w-80 shrink-0 overflow-y-auto border-r border-border bg-surface p-4 text-sm">
        <h3 className="mb-2 flex items-center gap-2 font-bold">
          <MapPin className="h-4 w-4 text-primary" /> موقع المشروع
        </h3>
        {siteMap.address && <p className="mb-2 text-xs text-muted-foreground">{siteMap.address}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Input value={latInput} onChange={(e) => setLatInput(e.target.value)} placeholder="Lat" className="h-8" dir="ltr" />
          <Input value={lngInput} onChange={(e) => setLngInput(e.target.value)} placeholder="Lng" className="h-8" dir="ltr" />
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

        {selected && selSpec && (
          <div className="mt-4 space-y-2 rounded-lg border border-primary/40 p-3">
            <Input value={selected.name} onChange={(e) => updateCam(selected.id, { name: e.target.value })} className="h-8" />
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
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: LEVEL_COLORS[i] }} />
                    {l.label} ({l.ppm} PPM)
                  </span>
                  <span>{distanceForPpm(selSpec, l.ppm).toFixed(1)} م</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
            </p>
            <Button size="sm" variant="destructive" className="w-full" onClick={() => removeCam(selected.id)}>
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
            <li className="text-xs text-muted-foreground">حدد الموقع ثم اضغط "إضافة كاميرا" وانقر على الخريطة.</li>
          )}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          الكاميرات الخارجية تُحسب تلقائيًا في جدول الكميات وعرض السعر.
        </p>
      </aside>
    </div>
  );
}
