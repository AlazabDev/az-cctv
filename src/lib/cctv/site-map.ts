import type { PlacedDevice } from "./types";

export interface MapCamera {
  id: string;
  specId: string;
  name: string;
  lat: number;
  lng: number;
  /** Compass bearing in degrees, 0 = north, clockwise. */
  rotation: number;
  heightM: number;
}

export interface SiteMapData {
  center: { lat: number; lng: number } | null;
  zoom: number;
  address: string;
  cameras: MapCamera[];
}

export const emptySiteMap: SiteMapData = { center: null, zoom: 18, address: "", cameras: [] };

export function normalizeSiteMap(raw: Partial<SiteMapData> | undefined | null): SiteMapData {
  return {
    center: raw?.center ?? null,
    zoom: typeof raw?.zoom === "number" ? raw.zoom : 18,
    address: raw?.address ?? "",
    cameras: Array.isArray(raw?.cameras) ? raw.cameras : [],
  };
}

/** Destination point from a start, bearing (deg) and distance (m) on a sphere. */
export function destination(lat: number, lng: number, bearingDeg: number, distM: number) {
  const R = 6371000;
  const d = distM / R;
  const b = (bearingDeg * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lng * Math.PI) / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [(p2 * 180) / Math.PI, (l2 * 180) / Math.PI] as [number, number];
}

export function sectorLatLngs(lat: number, lng: number, bearing: number, fov: number, distM: number) {
  const pts: [number, number][] = [[lat, lng]];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    pts.push(destination(lat, lng, bearing - fov / 2 + (fov * i) / steps, distM));
  }
  return pts;
}

/** Map cameras as plan devices so BOQ / offer count them. */
export function mapCamerasAsDevices(map: SiteMapData): PlacedDevice[] {
  return map.cameras.map((c) => ({
    id: c.id,
    kind: "camera",
    specId: c.specId,
    name: c.name,
    x: 0,
    y: 0,
    rotation: c.rotation,
    heightM: c.heightM,
    tilt: 0,
  }));
}
