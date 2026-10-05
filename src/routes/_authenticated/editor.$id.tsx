import { createFileRoute } from "@tanstack/react-router";
import { ProductCatalogGate } from "@/components/cctv/ProductCatalogGate";

export const Route = createFileRoute("/_authenticated/editor/$id")({
  head: () => ({
    meta: [
      { title: "CCTV Project Designer — كاميرا بلان" },
      {
        name: "description",
        content: "محرر متكامل لتصميم أنظمة كاميرات المراقبة والكابلات والجدران والتغطية وعروض الأسعار التجارية.",
      },
    ],
  }),
  component: EditorRoutePage,
});

function EditorRoutePage() {
  const { id } = Route.useParams();
  return <ProductCatalogGate projectId={id} />;
}
