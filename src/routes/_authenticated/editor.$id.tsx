import { createFileRoute } from "@tanstack/react-router";
import { CctvProjectEditor } from "@/components/cctv/CctvProjectEditor";

export const Route = createFileRoute("/_authenticated/editor/$id")({
  head: () => ({
    meta: [
      { title: "CCTV Project Designer — كاميرا بلان" },
      {
        name: "description",
        content: "محرر متكامل لتصميم أنظمة كاميرات المراقبة والكابلات والجدران والتغطية.",
      },
    ],
  }),
  component: EditorRoutePage,
});

function EditorRoutePage() {
  const { id } = Route.useParams();
  return <CctvProjectEditor projectId={id} />;
}
