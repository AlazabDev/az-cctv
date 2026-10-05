import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { emptyPlan, type PlanData } from "./types";

export type ProjectLayout = PlanData & { id: string; floorplanPath: string | null };
type LayoutRow = Tables<"cctv_layouts">;
type ProjectRow = Tables<"cctv_projects">;

type LegacyProjectData = Partial<PlanData> & {
  layouts?: Partial<ProjectLayout>[];
  activeLayoutId?: string;
};

function object(value: Json | null | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function array<T>(value: Json | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function validNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function rowToProjectLayout(row: LayoutRow): ProjectLayout {
  const geometry = object(row.geometry);
  const design = object(row.design_data);
  return {
    ...emptyPlan,
    id: row.id,
    floorplanPath: row.floorplan_path,
    layoutName: row.name,
    ceilingHeightM: validNumber(row.ceiling_height_m, 3),
    pxPerMeter: validNumber(row.px_per_meter, 40),
    imageWidth: row.image_width ?? undefined,
    imageHeight: row.image_height ?? undefined,
    walls: array<PlanData["walls"][number]>(geometry.walls),
    devices: array<PlanData["devices"][number]>(design.devices),
    cables: array<PlanData["cables"][number]>(design.cables),
    roomLabels: array<PlanData["roomLabels"][number]>(design.roomLabels),
    showCoverage:
      typeof design.showCoverage === "boolean" ? design.showCoverage : true,
  };
}

export function projectLayoutToPayload(
  projectId: string,
  layout: ProjectLayout,
  sortOrder: number,
  activeLayoutId: string,
) {
  return {
    id: layout.id,
    project_id: projectId,
    name: layout.layoutName.trim() || `Layout ${sortOrder + 1}`,
    sort_order: sortOrder,
    ceiling_height_m: layout.ceilingHeightM || 3,
    floorplan_path: layout.floorplanPath,
    px_per_meter: layout.pxPerMeter || null,
    image_width: layout.imageWidth ?? null,
    image_height: layout.imageHeight ?? null,
    geometry_status: layout.walls.length > 0 ? "review" : "draft",
    geometry: {
      walls: layout.walls,
      boundary: [],
      openings: [],
    } as Json,
    design_data: {
      devices: layout.devices,
      cables: layout.cables,
      roomLabels: layout.roomLabels,
      showCoverage: layout.showCoverage,
    } as Json,
    is_active: layout.id === activeLayoutId,
  };
}

function normalizeLegacyLayout(raw: Partial<ProjectLayout>, index: number): ProjectLayout {
  return {
    ...emptyPlan,
    ...raw,
    id: crypto.randomUUID(),
    floorplanPath: raw.floorplanPath ?? null,
    layoutName: raw.layoutName?.trim() || `Layout ${index + 1}`,
    ceilingHeightM: validNumber(raw.ceilingHeightM, 3),
    pxPerMeter: validNumber(raw.pxPerMeter, 40),
    devices: raw.devices ?? [],
    cables: raw.cables ?? [],
    walls: raw.walls ?? [],
    roomLabels: raw.roomLabels ?? [],
    showCoverage: raw.showCoverage ?? true,
  };
}

function legacyLayouts(project: ProjectRow) {
  const stored = (project.data ?? {}) as LegacyProjectData;
  if (stored.layouts?.length) {
    return {
      layouts: stored.layouts.map(normalizeLegacyLayout),
      legacyActiveIndex: Math.max(
        0,
        stored.layouts.findIndex((layout) => layout.id === stored.activeLayoutId),
      ),
    };
  }
  return {
    layouts: [
      normalizeLegacyLayout(
        {
          ...stored,
          layoutName: stored.layoutName || project.name || "Layout 1",
          floorplanPath: project.floorplan_path,
        },
        0,
      ),
    ],
    legacyActiveIndex: 0,
  };
}

async function replaceSingleBackfillWithLegacyMulti(
  project: ProjectRow,
  existing: LayoutRow[],
) {
  const legacy = legacyLayouts(project);
  if (legacy.layouts.length <= existing.length) return existing;

  // Migration 0005 created one normalized row from the old top-level plan.
  // When V2 later stored multiple layouts in project.data, reuse that first UUID
  // and materialize the remaining layouts once, preserving all legacy content.
  if (existing.length === 1) {
    legacy.layouts[0] = { ...legacy.layouts[0], id: existing[0]!.id };
  }

  const activeId = legacy.layouts[legacy.legacyActiveIndex]?.id ?? legacy.layouts[0]!.id;
  const payload = legacy.layouts.map((layout, index) =>
    projectLayoutToPayload(project.id, layout, index, activeId),
  );

  const { error } = await supabase.from("cctv_layouts").upsert(payload as never, { onConflict: "id" });
  if (error) throw error;

  const { data, error: reloadError } = await supabase
    .from("cctv_layouts")
    .select("*")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (reloadError) throw reloadError;
  return data ?? [];
}

export async function loadNormalizedProjectLayouts(project: ProjectRow) {
  const { data, error } = await supabase
    .from("cctv_layouts")
    .select("*")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  let rows = data ?? [];
  const legacy = legacyLayouts(project);
  if (rows.length === 0 || legacy.layouts.length > rows.length) {
    rows = await replaceSingleBackfillWithLegacyMulti(project, rows);
  }

  const layouts = rows.map(rowToProjectLayout);
  const activeLayoutId = rows.find((row) => row.is_active)?.id ?? layouts[0]?.id ?? "";
  return { layouts, activeLayoutId };
}

export async function saveNormalizedProjectLayouts(
  projectId: string,
  layouts: ProjectLayout[],
  activeLayoutId: string,
) {
  if (layouts.length === 0) return false;
  const payload = layouts.map((layout, index) =>
    projectLayoutToPayload(projectId, layout, index, activeLayoutId),
  );
  const { error } = await supabase.from("cctv_layouts").upsert(payload as never, { onConflict: "id" });
  if (error) return false;

  const { error: activateError } = await supabase.rpc("activate_cctv_layout", {
    p_layout_id: activeLayoutId,
  });
  return !activateError;
}

export async function deleteNormalizedProjectLayout(layoutId: string) {
  const { error } = await supabase.from("cctv_layouts").delete().eq("id", layoutId);
  return !error;
}
