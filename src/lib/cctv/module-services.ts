/**
 * Functional ownership of AZ-CCTV services.
 * Exactly five primary modules; support and account settings remain in the shell.
 * These are service descriptors, not claims that every service is production-ready.
 */
export type CctvModuleId = "plan" | "topology" | "map" | "offer" | "agent";

export type CctvService = {
  id: string;
  label: string;
  /** Verified current implementation entrypoints or planned integration. */
  source: readonly string[];
  status: "implemented" | "partial" | "planned";
};

export type CctvModuleDefinition = {
  id: CctvModuleId;
  label: string;
  subtitle: string;
  services: readonly CctvService[];
};

export const cctvModuleRegistry: readonly CctvModuleDefinition[] = [
  {
    id: "plan",
    label: "CCTV system",
    subtitle: "تصميم النظام ومكوناته ومخططاته",
    services: [
      { id: "projects", label: "المشروعات والعميل", source: ["src/routes/_authenticated/projects.tsx"], status: "implemented" },
      { id: "layouts", label: "المواقع والمخططات والأدوار", source: ["src/lib/cctv/normalized-layouts.ts"], status: "implemented" },
      { id: "floorplans", label: "رفع المخططات وارتفاع السقف", source: ["src/components/cctv/FloorplanUploadDialog.tsx", "src/components/cctv/CctvProjectEditorV2.tsx"], status: "partial" },
      { id: "calibration", label: "معايرة الأبعاد والمقياس", source: ["src/components/cctv/CctvProjectEditorV2.tsx"], status: "implemented" },
      { id: "walls", label: "رسم الحوائط وتحريرها CAD", source: ["src/components/cctv/PlanCanvas.tsx", "src/lib/cctv/wall-editor.ts"], status: "partial" },
      { id: "cameras", label: "توزيع الكاميرات ومواضع التركيب", source: ["src/components/cctv/CctvProjectEditorV2.tsx"], status: "implemented" },
      { id: "optics", label: "العدسات ومواصفات المنتج", source: ["src/lib/cctv/product-catalog.ts", "src/lib/cctv/catalog.ts"], status: "partial" },
      { id: "coverage", label: "التغطية وDORI وPPM", source: ["src/lib/cctv/geometry.ts", "src/lib/cctv/deployment.ts"], status: "partial" },
      { id: "camera-3d", label: "محاكاة الكاميرا ثلاثية الأبعاد", source: ["src/components/cctv/CameraDeploymentDiagram.tsx"], status: "planned" },
      { id: "room-labels", label: "الغرف والتسميات والطبقات", source: ["src/components/cctv/PlanCanvas.tsx"], status: "implemented" },
      { id: "product-master", label: "كتالوج الأجهزة والمنتجات", source: ["src/routes/catalog.tsx", "src/lib/cctv/product-catalog.ts"], status: "implemented" },
    ],
  },
  {
    id: "topology",
    label: "CCTV network",
    subtitle: "البنية الشبكية والتوصيلات والتسجيل",
    services: [
      { id: "network-topology", label: "مخطط الشبكة Topology", source: ["src/components/cctv/TopologyWorkspace.tsx", "src/lib/cctv/topology.ts"], status: "implemented" },
      { id: "switches", label: "السويتشات ومنافذ PoE", source: ["src/lib/cctv/topology.ts"], status: "implemented" },
      { id: "nvr", label: "المسجلات NVR والقنوات", source: ["src/lib/cctv/catalog.ts", "src/lib/cctv/topology.ts"], status: "implemented" },
      { id: "cabling", label: "كابلات CAT6 والفايبر والمسارات", source: ["src/lib/cctv/topology.ts", "src/components/cctv/PlanCanvas.tsx"], status: "implemented" },
      { id: "network-validations", label: "فحص المنافذ والطاقة وأطوال التوصيل", source: ["src/lib/cctv/topology.ts"], status: "partial" },
      { id: "storage", label: "حساب التخزين ومدة التسجيل", source: ["src/lib/cctv/geometry.ts", "src/routes/calculator.tsx"], status: "partial" },
      { id: "network-architecture", label: "تصميم الربط والتجميع والراكات", source: ["src/components/cctv/TopologyWorkspace.tsx"], status: "partial" },
    ],
  },
  {
    id: "map",
    label: "CCTV maps",
    subtitle: "المواقع الجغرافية والكاميرات الخارجية",
    services: [
      { id: "site-map", label: "خريطة موقع المشروع", source: ["src/components/cctv/MapWorkspace.tsx"], status: "implemented" },
      { id: "coordinates", label: "الإحداثيات ومواقع العناصر", source: ["src/lib/cctv/site-map.ts"], status: "implemented" },
      { id: "outdoor-cameras", label: "توزيع الكاميرات الخارجية", source: ["src/components/cctv/MapWorkspace.tsx"], status: "implemented" },
      { id: "geo-coverage", label: "اتجاه الكاميرا والتغطية الجغرافية", source: ["src/lib/cctv/site-map.ts", "src/components/cctv/MapWorkspace.tsx"], status: "partial" },
      { id: "map-sync", label: "مطابقة الخرائط مع المشروع والكميات", source: ["src/lib/cctv/site-map.ts", "src/components/cctv/boq.ts"], status: "partial" },
    ],
  },
  {
    id: "offer",
    label: "CCTV cost",
    subtitle: "حصر الكميات والتكاليف والمخرجات",
    services: [
      { id: "boq", label: "جدول الكميات BOQ", source: ["src/components/cctv/boq.ts"], status: "implemented" },
      { id: "pricing", label: "الأسعار وربط منتجات الموردين", source: ["src/lib/cctv/product-catalog.ts", "src/components/cctv/boq.ts"], status: "partial" },
      { id: "project-costs", label: "تكلفة الأجهزة والخامات والكابلات", source: ["src/components/cctv/boq.ts"], status: "implemented" },
      { id: "labor-fees", label: "المصنعية والإضافات والخصومات والضرائب", source: ["src/components/cctv/CctvProjectEditorV2.tsx"], status: "implemented" },
      { id: "offers", label: "عروض الأسعار والمستخلصات التجارية", source: ["src/components/cctv/CctvProjectEditorV2.tsx"], status: "partial" },
      { id: "pdf-csv", label: "التصدير PDF وCSV", source: ["src/components/cctv/offer-pdf.ts", "src/components/cctv/CctvProjectEditorV2.tsx"], status: "implemented" },
      { id: "commissioning-docs", label: "بطاقات ضبط التركيب والتسليم", source: [], status: "planned" },
    ],
  },
  {
    id: "agent",
    label: "CCTV agent",
    subtitle: "المساعد الهندسي والاقتراحات والاعتمادات",
    services: [
      { id: "agent-chat", label: "محادثة مساعد التصميم", source: ["src/components/cctv/AgentPanel.tsx"], status: "implemented" },
      { id: "auto-design", label: "التوزيع والتصميم التلقائي", source: ["src/lib/cctv/auto-design.ts", "src/components/cctv/AutoDesignPanel.tsx"], status: "partial" },
      { id: "design-analysis", label: "تحليل المخطط والتغطية", source: ["src/lib/cctv/project-agent-context.ts"], status: "partial" },
      { id: "agent-service", label: "التكامل مع وكيل التصميم", source: ["supabase/functions/az-design-agent/index.ts"], status: "implemented" },
      { id: "proposal-review", label: "مراجعة المقترحات قبل اعتمادها", source: ["src/components/cctv/AutoDesignPanel.tsx"], status: "partial" },
      { id: "agent-audit", label: "سجل قرارات وتغييرات الوكيل", source: ["supabase/migrations/0003_create_agent_schema.sql"], status: "partial" },
    ],
  },
] as const;

/** The sidebar, future module routes and acceptance tests read one registry. */
export function getCctvModule(id: CctvModuleId): CctvModuleDefinition {
  const module = cctvModuleRegistry.find((item) => item.id === id);
  if (!module) throw new Error(`Unknown CCTV module: ${id}`);
  return module;
}
