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
  /** Manufacturer horizontal/vertical angles for the currently selected lens setting. */
  vfov?: number;
  sensorFormat?: string;
  /** Supported focal lengths for a configurable/varifocal lens. */
  focalOptionsMm?: number[];
  /** Datasheet provenance; absence means geometry is not yet verified. */
  opticsSourceUrl?: string;
  opticsVerified?: boolean;
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
  /** Physical lens setting in mm; fixed-lens cameras use the catalog default. */
  focalMm?: number;
  /** Locked optical fields from the approved product revision for audit/history. */
  opticsSnapshot?: {
    productId: string;
    focalMm: number;
    hfovDeg: number;
    vfovDeg?: number;
    hres: number;
    vres: number;
    verified?: boolean;
    sourceUrl?: string;
  };
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

export interface ScaleCalibration {
  /** Pixel distance of the reference segment measured on the actual drawing. */
  pixelDistance: number;
  /** Site-verified real distance in metres for the same segment. */
  realDistanceM: number;
  calibratedAt: string;
}

export interface PlanData {
  layoutName: string;
  ceilingHeightM: number;
  pxPerMeter: number;
  scaleCalibration?: ScaleCalibration;
  devices: PlacedDevice[];
  cables: CableRun[];
  walls: WallSegment[];
  roomLabels: RoomLabel[];
  showCoverage: boolean;
  imageWidth?: number;
  imageHeight?: number;
}

/** Explicit drawing-scale evidence is required before engineering approval. */
export function isScaleCalibrated(
  plan: Pick<PlanData, "pxPerMeter" | "scaleCalibration">,
): boolean {
  const evidence = plan.scaleCalibration;
  if (!evidence) return false;
  if (!(evidence.pixelDistance > 0) || !(evidence.realDistanceM > 0)) return false;
  if (!Number.isFinite(evidence.pixelDistance) || !Number.isFinite(evidence.realDistanceM))
    return false;
  if (!Number.isFinite(plan.pxPerMeter) || !(plan.pxPerMeter > 0)) return false;
  const expected = evidence.pixelDistance / evidence.realDistanceM;
  return Math.abs(expected - plan.pxPerMeter) <= Math.max(1e-6, expected * 1e-6);
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
