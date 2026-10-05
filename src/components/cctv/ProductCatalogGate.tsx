import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CctvProjectEditorV2 } from "@/components/cctv/CctvProjectEditorV2";
import {
  cameraCatalog,
  hardwareCatalog,
  hydrateProductCatalog,
} from "@/lib/cctv/catalog";

export function ProductCatalogGate({ projectId }: { projectId: string }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["cctv-product-catalog"],
    queryFn: async () => {
      const { data: products, error: queryError } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("brand", { ascending: true })
        .order("model", { ascending: true });

      if (queryError) throw queryError;
      return products ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="p-10 text-muted-foreground">جارٍ تحميل كتالوج المنتجات…</div>;
  }

  if (error || !data) {
    return (
      <div className="p-10">
        <h1 className="mb-2 text-lg font-bold">تعذّر تحميل كتالوج المنتجات</h1>
        <p className="text-sm text-muted-foreground">
          لا يمكن فتح محرر التصميم قبل تحميل المنتجات النشطة من قاعدة البيانات.
        </p>
      </div>
    );
  }

  const catalog = hydrateProductCatalog(data);
  const hasCamera = catalog.cameras.length > 0;
  const hasNvrOrSwitch = catalog.hardware.some(
    (item) => item.kind === "nvr" || item.kind === "switch",
  );

  if (!hasCamera || !hasNvrOrSwitch) {
    return (
      <div className="p-10">
        <h1 className="mb-2 text-lg font-bold">كتالوج المنتجات غير مكتمل</h1>
        <p className="text-sm text-muted-foreground">
          يلزم وجود كاميرا نشطة واحدة على الأقل ومنتج NVR أو Network Switch واحد على الأقل قبل فتح المحرر.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Cameras: {cameraCatalog.length} · Hardware: {hardwareCatalog.length}
        </p>
      </div>
    );
  }

  return <CctvProjectEditorV2 key={`catalog-${data.length}`} projectId={projectId} />;
}
