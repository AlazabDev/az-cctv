import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { StoreDesignSelection } from "@/components/store/StoreDesignSelection";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CctvProjectEditorV2 } from "@/components/cctv/CctvProjectEditorV2";
import { cameraCatalog, hardwareCatalog, hydrateProductCatalog } from "@/lib/cctv/catalog";

export function ProductCatalogGate({ projectId }: { projectId: string }) {
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["cctv-product-catalog"],
    queryFn: async () => {
      // Supabase defaults to 1,000 rows per query. A partial equipment master
      // must never silently appear complete to an engineering project.
      const products: Tables<"products">[] = [];
      const pageSize = 500;
      for (let page = 0; page < 200; page += 1) {
        const from = page * pageSize;
        const { data, error: queryError } = await supabase
          .from("products")
          .select("*")
          .eq("is_active", true)
          .eq("published", true)
          .order("category", { ascending: true })
          .order("brand", { ascending: true })
          .order("model", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (queryError) throw queryError;
        products.push(...(data ?? []));
        if (!data || data.length < pageSize) return products;
      }
      throw new Error("تعذّر تحميل كتالوج المنتجات بالكامل؛ العدد تجاوز الحد المسموح.");
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
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : "تعذّر الاتصال بالكتالوج."}
        </p>
        <Button className="mt-4" type="button" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? "جارٍ إعادة المحاولة…" : "إعادة تحميل الكتالوج"}
        </Button>
      </div>
    );
  }

  const catalog = hydrateProductCatalog(data);
  const hasCamera = catalog.cameras.length > 0;
  const hasNvrOrSwitch = catalog.hardware.some(
    (item) => item.kind === "nvr" || item.kind === "switch",
  );

  const readyCameras = catalog.cameras.filter((camera) => camera.engineeringReady === true).length;

  return (
    <>
      <StoreDesignSelection />
      {(!hasCamera || !hasNvrOrSwitch) && (
        <div
          role="alert"
          className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <strong>الكتالوج غير مكتمل.</strong> يمكنك فتح المخطط وإدارة المشروع، لكن إضافة المعدات
          وحسابات الشبكة والتغطية تتطلب منتجات نشطة ذات مواصفات مكتملة.
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mr-3"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            تحديث المنتجات
          </Button>
        </div>
      )}
      {hasCamera && readyCameras === 0 && (
        <div
          role="status"
          className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-foreground"
        >
          كتالوج المنتجات: {catalog.cameras.length} كاميرا تجارية، لكن لا توجد كاميرا معتمدة هندسيًا
          لحساب التغطية. يمكنك تحرير المخطط، بينما يظل التوزيع التلقائي متوقفًا إلى حين استكمال
          الدقة وزاوية الرؤية والعدسة.
        </div>
      )}
      <CctvProjectEditorV2 key={`catalog-${data.length}`} projectId={projectId} />
    </>
  );
}
