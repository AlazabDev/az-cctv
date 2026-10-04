import type { CameraSpec, HardwareSpec } from "./types";

export const cameraCatalog: CameraSpec[] = [
  {
    id: "bullet-2mp-28",
    brand: "هيكفيجن",
    model: "DS-2CD1027G2H-LIUF",
    label: "بوليت 2 ميجا 2.8مم",
    type: "bullet",
    megapixel: 2,
    hres: 1920,
    vres: 1080,
    focal: 2.8,
    hfov: 102,
    irRange: 30,
    price: 320,
    poeWatt: 7,
    bitrateMbps: 4,
  },
  {
    id: "bullet-4mp-28",
    brand: "هيكفيجن",
    model: "DS-2CD2043G2-I",
    label: "بوليت 4 ميجا 2.8مم",
    type: "bullet",
    megapixel: 4,
    hres: 2560,
    vres: 1440,
    focal: 2.8,
    hfov: 102,
    irRange: 40,
    price: 480,
    poeWatt: 8,
    bitrateMbps: 6,
  },
  {
    id: "bullet-4mp-4",
    brand: "هيكفيجن",
    model: "DS-2CD2043G2-I 4mm",
    label: "بوليت 4 ميجا 4مم",
    type: "bullet",
    megapixel: 4,
    hres: 2560,
    vres: 1440,
    focal: 4,
    hfov: 84,
    irRange: 40,
    price: 510,
    poeWatt: 8,
    bitrateMbps: 6,
  },
  {
    id: "turret-4mp-28",
    brand: "هيكفيجن",
    model: "DS-2CD2347G2-LU",
    label: "تيوريت ColorVu 4 ميجا",
    type: "turret",
    megapixel: 4,
    hres: 2560,
    vres: 1440,
    focal: 2.8,
    hfov: 103,
    irRange: 30,
    price: 560,
    poeWatt: 9,
    bitrateMbps: 6,
  },
  {
    id: "dome-2mp-28",
    brand: "داهوا",
    model: "IPC-HDBW2231E-S",
    label: "دوم داخلي 2 ميجا",
    type: "dome",
    megapixel: 2,
    hres: 1920,
    vres: 1080,
    focal: 2.8,
    hfov: 106,
    irRange: 30,
    price: 290,
    poeWatt: 7,
    bitrateMbps: 4,
  },
  {
    id: "dome-8mp-28",
    brand: "داهوا",
    model: "IPC-HDBW3841E-AS",
    label: "دوم 8 ميجا (4K)",
    type: "dome",
    megapixel: 8,
    hres: 3840,
    vres: 2160,
    focal: 2.8,
    hfov: 106,
    irRange: 30,
    price: 890,
    poeWatt: 11,
    bitrateMbps: 12,
  },
  {
    id: "ptz-4mp",
    brand: "هيكفيجن",
    model: "DS-2DE4425IW-DE",
    label: "PTZ 4 ميجا زوم 25x",
    type: "ptz",
    megapixel: 4,
    hres: 2560,
    vres: 1440,
    focal: 4.8,
    hfov: 60,
    irRange: 100,
    price: 3200,
    poeWatt: 24,
    bitrateMbps: 10,
  },
  {
    id: "fisheye-6mp",
    brand: "هيكفيجن",
    model: "DS-2CD2955FWD-I",
    label: "فيش آي 6 ميجا 360°",
    type: "fisheye",
    megapixel: 6,
    hres: 3072,
    vres: 2048,
    focal: 1.27,
    hfov: 180,
    irRange: 15,
    price: 1450,
    poeWatt: 10,
    bitrateMbps: 10,
  },
];

/** Physical topology capabilities. Recording channels are not physical PoE ports. */
export const hardwareCatalog: HardwareSpec[] = [
  { id: "nvr-8", kind: "nvr", label: "مسجل شبكي NVR 8 قنوات PoE", price: 1100, channels: 8, ports: 8, ethernetPorts: 1, poePorts: 8, sfpPorts: 0, uplinkMbps: 1000 },
  { id: "nvr-16", kind: "nvr", label: "مسجل شبكي NVR 16 قناة PoE", price: 1850, channels: 16, ports: 16, ethernetPorts: 1, poePorts: 16, sfpPorts: 0, uplinkMbps: 1000 },
  { id: "nvr-32", kind: "nvr", label: "مسجل شبكي NVR 32 قناة", price: 3100, channels: 32, ports: 1, ethernetPorts: 1, poePorts: 0, sfpPorts: 0, uplinkMbps: 1000 },
  { id: "sw-8", kind: "switch", label: "سويتش PoE 8 منافذ", price: 430, ports: 8, ethernetPorts: 8, poePorts: 8, sfpPorts: 0, poeBudget: 120, uplinkMbps: 1000 },
  { id: "sw-16", kind: "switch", label: "سويتش PoE 16 منفذ", price: 890, ports: 16, ethernetPorts: 16, poePorts: 16, sfpPorts: 0, poeBudget: 225, uplinkMbps: 1000 },
  { id: "sw-24", kind: "switch", label: "سويتش PoE 24 منفذ", price: 1500, ports: 24, ethernetPorts: 24, poePorts: 24, sfpPorts: 0, poeBudget: 370, uplinkMbps: 1000 },
  { id: "rack-6u", kind: "rack", label: "كابينة 6U مع منظم كهرباء", price: 650 },
];

export interface NetworkAccessorySpec {
  id: string;
  label: string;
  unit: string;
  price: number;
}

/** Quantity is engineering-derived; the Offer module keeps price editable. */
export const networkAccessories: NetworkAccessorySpec[] = [
  { id: "media-converter-gigabit", label: "محول ميديا Gigabit Ethernet ↔ Fiber", unit: "قطعة", price: 0 },
];

export type CableCategory = "network" | "fiber" | "coaxial";

export interface CableTypeSpec {
  id: string;
  label: string;
  category: CableCategory;
  color: string;
  pricePerMeter: number;
  cores?: number;
}

export const cableTypes: CableTypeSpec[] = [
  { id: "cat5e-utp", label: "CAT5E UTP", category: "network", color: "var(--color-cable)", pricePerMeter: 2.5 },
  { id: "cat5e-stp", label: "CAT5E STP", category: "network", color: "var(--color-cable)", pricePerMeter: 3.4 },
  { id: "cat6-utp", label: "CAT6 UTP", category: "network", color: "var(--color-cable)", pricePerMeter: 3.2 },
  { id: "cat6-stp", label: "CAT6 STP", category: "network", color: "var(--color-cable)", pricePerMeter: 4.5 },
  { id: "cat6a-utp", label: "CAT6A UTP", category: "network", color: "var(--color-cable)", pricePerMeter: 5.6 },
  { id: "cat6a-stp", label: "CAT6A STP", category: "network", color: "var(--color-cable)", pricePerMeter: 6.8 },
  { id: "fiber-1", label: "1-Core Singlemode", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 4.2, cores: 1 },
  { id: "fiber-2", label: "2-Core Singlemode", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 5.5, cores: 2 },
  { id: "fiber-4", label: "4-Core Singlemode", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 6.8, cores: 4 },
  { id: "fiber-8", label: "8-Core Singlemode", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 8.4, cores: 8 },
  { id: "fiber-12", label: "12-Core Singlemode", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 10.5, cores: 12 },
  { id: "fiber-24", label: "24-Core Singlemode", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 15.5, cores: 24 },
  { id: "fiber-48", label: "48-Core Singlemode", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 24, cores: 48 },
  { id: "fiber-96", label: "96-Core Singlemode", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 39, cores: 96 },
  { id: "rg59", label: "RG59", category: "coaxial", color: "#8b5cf6", pricePerMeter: 3.6 },
  { id: "rg6", label: "RG6", category: "coaxial", color: "#8b5cf6", pricePerMeter: 4.4 },
  { id: "rg11", label: "RG11", category: "coaxial", color: "#8b5cf6", pricePerMeter: 6.2 },
  { id: "sywv-75-5", label: "SYWV-75-5", category: "coaxial", color: "#8b5cf6", pricePerMeter: 5.2 },
  { id: "syv-75-3", label: "SYV-75-3", category: "coaxial", color: "#8b5cf6", pricePerMeter: 4.1 },
  { id: "syv-75-5", label: "SYV-75-5", category: "coaxial", color: "#8b5cf6", pricePerMeter: 5.1 },
  { id: "syv-75-7", label: "SYV-75-7", category: "coaxial", color: "#8b5cf6", pricePerMeter: 6.4 },
  { id: "syv-75-9", label: "SYV-75-9", category: "coaxial", color: "#8b5cf6", pricePerMeter: 7.8 },
];

export interface WallMaterialSpec {
  id: string;
  label: string;
  group: "wall" | "material";
  color: string;
  strokeWidth: number;
  dash?: number[];
  attenuationDb: number;
  attenuationRange?: [number, number];
  opaque: boolean;
}

export const wallMaterials: WallMaterialSpec[] = [
  { id: "thin-wall", label: "Thin Wall", group: "wall", color: "#ef4444", strokeWidth: 3, attenuationDb: 7, attenuationRange: [5, 9], opaque: true },
  { id: "medium-wall", label: "Medium Wall", group: "wall", color: "#b91c1c", strokeWidth: 6, attenuationDb: 16, attenuationRange: [12, 20], opaque: true },
  { id: "thick-wall", label: "Thick Wall", group: "wall", color: "#7f1d1d", strokeWidth: 9, attenuationDb: 30, attenuationRange: [28, 32], opaque: true },
  { id: "brick", label: "طوب أحمر سميك", group: "material", color: "#b45309", strokeWidth: 7, attenuationDb: 22, attenuationRange: [18, 27], opaque: true },
  { id: "light-concrete", label: "خرسانة خفيفة", group: "material", color: "#f59e0b", strokeWidth: 6, attenuationDb: 13, attenuationRange: [10, 15], opaque: true },
  { id: "medium-concrete", label: "خرسانة متوسطة", group: "material", color: "#d97706", strokeWidth: 8, attenuationDb: 26, attenuationRange: [20, 30], opaque: true },
  { id: "heavy-concrete", label: "خرسانة مسلحة ثقيلة", group: "material", color: "#92400e", strokeWidth: 10, attenuationDb: 38, attenuationRange: [30, 45], opaque: true },
  { id: "solid-wood", label: "قاطع خشبي", group: "material", color: "#f4a261", strokeWidth: 5, attenuationDb: 5, attenuationRange: [4, 6], opaque: true },
  { id: "thick-wood", label: "حائط خشبي سميك", group: "material", color: "#e76f51", strokeWidth: 7, attenuationDb: 10, attenuationRange: [8, 12], opaque: true },
  { id: "gypsum", label: "قاطع جبس", group: "material", color: "#94a3b8", strokeWidth: 4, attenuationDb: 8, attenuationRange: [6, 10], opaque: true },
  { id: "thin-metal", label: "لوح معدني رفيع", group: "material", color: "#ca8a04", strokeWidth: 5, attenuationDb: 38, attenuationRange: [30, 45], opaque: true },
  { id: "medium-metal", label: "حائط معدني متوسط", group: "material", color: "#a16207", strokeWidth: 7, attenuationDb: 75, attenuationRange: [60, 90], opaque: true },
  { id: "heavy-metal", label: "حاجز معدني ثقيل", group: "material", color: "#854d0e", strokeWidth: 9, attenuationDb: 110, attenuationRange: [90, 135], opaque: true },
  { id: "glass", label: "زجاج مفرد", group: "material", color: "#60a5fa", strokeWidth: 4, dash: [10, 4], attenuationDb: 4, attenuationRange: [3, 5], opaque: false },
  { id: "double-glass", label: "زجاج مزدوج", group: "material", color: "#3b82f6", strokeWidth: 5, dash: [10, 4], attenuationDb: 8, attenuationRange: [6, 10], opaque: false },
  { id: "thick-glass", label: "زجاج سميك", group: "material", color: "#2563eb", strokeWidth: 6, dash: [10, 4], attenuationDb: 12, attenuationRange: [9, 15], opaque: false },
  { id: "fence", label: "سياج", group: "material", color: "#65a30d", strokeWidth: 3, dash: [3, 5], attenuationDb: 2, attenuationRange: [1, 3], opaque: false },
];

export function wallMaterialById(id: string) {
  return wallMaterials.find((w) => w.id === id) ?? wallMaterials[0]!;
}

export const storageOptions = [
  { id: "hdd-4", label: "هارد ديسك 4TB (مراقبة)", price: 620, tb: 4 },
  { id: "hdd-8", label: "هارد ديسك 8TB (مراقبة)", price: 1150, tb: 8 },
];

export function cameraById(id: string) {
  return cameraCatalog.find((c) => c.id === id) ?? cameraCatalog[0]!;
}

export function hardwareById(id: string) {
  return hardwareCatalog.find((h) => h.id === id);
}

export function specById(id: string) {
  return (cameraCatalog as { id: string; label: string; price: number }[])
    .concat(hardwareCatalog)
    .find((s) => s.id === id);
}
