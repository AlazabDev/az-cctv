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

export const hardwareCatalog: HardwareSpec[] = [
  { id: "nvr-8", kind: "nvr", label: "مسجل شبكي NVR 8 قنوات PoE", price: 1100, channels: 8 },
  { id: "nvr-16", kind: "nvr", label: "مسجل شبكي NVR 16 قناة PoE", price: 1850, channels: 16 },
  { id: "nvr-32", kind: "nvr", label: "مسجل شبكي NVR 32 قناة", price: 3100, channels: 32 },
  { id: "sw-8", kind: "switch", label: "سويتش PoE 8 منافذ", price: 430, ports: 8, poeBudget: 120 },
  { id: "sw-16", kind: "switch", label: "سويتش PoE 16 منفذ", price: 890, ports: 16, poeBudget: 225 },
  { id: "sw-24", kind: "switch", label: "سويتش PoE 24 منفذ", price: 1500, ports: 24, poeBudget: 370 },
  { id: "rack-6u", kind: "rack", label: "كابينة 6U مع منظم كهرباء", price: 650 },
];

export const cableTypes = [
  { id: "cat6-utp", label: "CAT6 UTP", category: "network", color: "var(--color-cable)", pricePerMeter: 3.2 },
  { id: "cat6-stp", label: "CAT6 STP", category: "network", color: "var(--color-cable)", pricePerMeter: 4.5 },
  { id: "cat6a-stp", label: "CAT6A STP", category: "network", color: "var(--color-cable)", pricePerMeter: 6.8 },
  { id: "fiber-2", label: "فايبر 2 كور", category: "fiber", color: "var(--color-fiber)", pricePerMeter: 5.5 },
] as const;

export interface WallMaterialSpec {
  id: "brick" | "glass" | "fence";
  label: string;
  /** لون خط الرسم على المخطط */
  color: string;
  /** سماكة خط الرسم بالبكسل عند تكبير 100% */
  strokeWidth: number;
  /** نمط تقطيع الخط؛ فارغ = خط متصل (جدار صلب) */
  dash?: number[];
  /** فقد الإشارة/الرؤية التقريبي بالديسيبل — أساس لحساب حجب مخروط الكاميرا لاحقاً */
  attenuationDb: number;
  /** هل يحجب الجدار الرؤية بصرياً بشكل كامل (طوب) أم جزئي/معدوم (زجاج، سياج) */
  opaque: boolean;
}

export const wallMaterials: WallMaterialSpec[] = [
  { id: "brick", label: "جدار طوب", color: "#b45309", strokeWidth: 7, attenuationDb: 18, opaque: true },
  {
    id: "glass",
    label: "جدار زجاج",
    color: "#38bdf8",
    strokeWidth: 4,
    dash: [10, 4],
    attenuationDb: 4,
    opaque: false,
  },
  {
    id: "fence",
    label: "سياج",
    color: "#65a30d",
    strokeWidth: 3,
    dash: [3, 5],
    attenuationDb: 2,
    opaque: false,
  },
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
