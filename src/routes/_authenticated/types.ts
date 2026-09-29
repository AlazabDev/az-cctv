export type DeviceKind = "camera" | "nvr" | "switch" | "rack";

export interface CameraSpec {
  id: string;
  brand: string;
  model: string;
  label: string;
  type: "bullet" | "dome" | "turret" | "ptz" | "fisheye";
  megapixel: number;
  hres: number;
  vres: number;
  focal: number;
  hfov: number;
  irRange: number;
  price: number;
  poeWatt: number;
  bitrateMbps: number;
}

export interface HardwareSpec {
  id: string;
  kind: Exclude<DeviceKind, "camera">;
  label: string;
  price: number;
  channels?: number;
  ports?: number;
  poeBudget?: number;
}

export interface PlacedDevice {
  id: string;
  kind: DeviceKind;
  specId: string;
  name: string;
  x: number;
  y: number;
  /** direction in degrees, 0 = to the right */
  rotation: number;
  heightM: number;
  tilt: number;
  note?: string;
}

export interface CableRun {
  id: string;
  type: string;
  points: { x: number; y: number }[];
}

export type WallMaterial = "brick" | "glass" | "fence";

export interface WallSegment {
  id: string;
  material: WallMaterial;
  /** ≥2 points. Rendered as straight segments, or as a smooth curve through the points when `curved` is true. */
  points: { x: number; y: number }[];
  curved: boolean;
  note?: string;
}

export interface PlanData {
  pxPerMeter: number;
  devices: PlacedDevice[];
  cables: CableRun[];
  walls: WallSegment[];
  showCoverage: boolean;
  imageWidth?: number;
  imageHeight?: number;
}

export const emptyPlan: PlanData = {
  pxPerMeter: 40,
  devices: [],
  cables: [],
  walls: [],
  showCoverage: true,
};
