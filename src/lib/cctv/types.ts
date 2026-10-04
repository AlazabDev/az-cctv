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
  /** Optional installer allowance in metres for vertical drops / rises. */
  verticalAllowanceM?: number;
  /** Extra installation slack. Defaults to 15% in commercial calculations. */
  slackPercent?: number;
}

/**
 * Wall material is retained for backward compatibility with existing saved
 * projects and the design-agent occlusion model. New walls use one opaque wall
 * material; the user-facing choice is wall thickness only.
 */
export type WallMaterial = string;
export type WallThicknessCm = 10 | 20;

export interface WallSegment {
  id: string;
  material: WallMaterial;
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
