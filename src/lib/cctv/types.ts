export type DeviceKind = "camera" | "nvr" | "switch" | "rack";

export interface CameraSpec {
  id: string;
  /** Canonical commercial product row when this spec came from public.products. */
  productId?: string;
  brand: string;
  model: string;
  label: string;
  type: "bullet" | "dome" | "turret" | "ptz" | "fisheye" | "other";
  megapixel: number;
  hres: number;
  vres: number;
  focal: number;
  hfov: number;
  irRange: number;
  price: number;
  currency?: string;
  poeWatt: number;
  bitrateMbps: number;
  imageUrl?: string;
  /** True only when deterministic geometry inputs are complete enough for DORI/PPM. */
  engineeringReady?: boolean;
}

export interface HardwareSpec {
  id: string;
  /** Canonical commercial product row when this spec came from public.products. */
  productId?: string;
  kind: Exclude<DeviceKind, "camera">;
  brand?: string;
  model?: string;
  label: string;
  price: number;
  currency?: string;
  imageUrl?: string;
  engineeringReady?: boolean;
  /** Recording capacity only. Never treat channels as physical Ethernet/PoE ports. */
  channels?: number;
  /** Legacy physical port count kept for backward compatibility. */
  ports?: number;
  /** Total copper Ethernet interfaces available on the device. */
  ethernetPorts?: number;
  /** Copper interfaces capable of supplying PoE to endpoint devices. */
  poePorts?: number;
  /** SFP/SFP+ cages that can terminate fiber directly without media converters. */
  sfpPorts?: number;
  /** Total PoE power budget in watts. */
  poeBudget?: number;
  /** Nominal uplink capacity in Mbps when known. */
  uplinkMbps?: number;
}

export interface PlacedDevice {
  id: string;
  kind: DeviceKind;
  /** Engineering/catalog adapter id. New catalog-backed devices use the product UUID. */
  specId: string;
  /** Canonical commercial product identity. Experimental/design-only items may omit it. */
  productId?: string;
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
  /** Optional installer allowance in metres for vertical drops / rises. */
  verticalAllowanceM?: number;
  /** Extra installation slack. Defaults to 15% in commercial calculations. */
  slackPercent?: number;
}

/**
 * Wall material is retained for backward compatibility with existing saved
 * projects and the design-agent occlusion model.
 */
export type WallMaterial = string;
export type WallThicknessCm = 10 | 20;
export type WallKind = "wall" | "fence";

export interface WallSegment {
  id: string;
  material: WallMaterial;
  /** Visual/engineering classification used by the plan editor. */
  kind?: WallKind;
  /** User-selected drawing color. Stored with the layout. */
  color?: string;
  thicknessCm?: WallThicknessCm;
  points: { x: number; y: number }[];
  curved: boolean;
  note?: string;
}

export interface RoomLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

export interface PlanData {
  layoutName: string;
  ceilingHeightM: number;
  pxPerMeter: number;
  devices: PlacedDevice[];
  cables: CableRun[];
  walls: WallSegment[];
  roomLabels: RoomLabel[];
  showCoverage: boolean;
  imageWidth?: number;
  imageHeight?: number;
}

export const emptyPlan: PlanData = {
  layoutName: "",
  ceilingHeightM: 3,
  pxPerMeter: 40,
  devices: [],
  cables: [],
  walls: [],
  roomLabels: [],
  showCoverage: true,
};
