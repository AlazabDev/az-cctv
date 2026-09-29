import { createFileRoute } from "@tanstack/react-router";
import { CctvProjectEditorV2 } from "@/components/cctv/CctvProjectEditorV2";

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
  return <CctvProjectEditorV2 projectId={id} />;
}
