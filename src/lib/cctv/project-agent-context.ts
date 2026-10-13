/**
 * Read-only, bounded snapshot of a CCTV project for the design assistant.
 * Supports legacy single-layout plans and the current data.layouts[] format.
 */
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function array(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function summaryLayout(raw: JsonObject, index: number) {
  const devices = array(raw.devices);
  return {
    id: String(raw.id ?? `layout-${index + 1}`),
    name: String(raw.layoutName ?? `Layout ${index + 1}`),
    scalePxPerMeter: raw.pxPerMeter ?? null,
    ceilingHeightM: raw.ceilingHeightM ?? null,
    cameras: devices
      .filter((d) => d.kind === "camera")
      .map((d) => ({
        name: d.name,
        productId: d.productId ?? d.specId,
        x: d.x,
        y: d.y,
        heightM: d.heightM,
        rotation: d.rotation,
        tilt: d.tilt,
      })),
    hardware: devices
      .filter((d) => d.kind !== "camera")
      .map((d) => ({
        name: d.name,
        kind: d.kind,
        productId: d.productId ?? d.specId,
      })),
    cableRuns: array(raw.cables).length,
    walls: array(raw.walls).length,
  };
}

export function projectAgentContext(projectName: string, projectData: unknown) {
  const raw = object(projectData);
  const layouts = Array.isArray(raw.layouts) && raw.layouts.length > 0 ? array(raw.layouts) : [raw];
  const siteMap = object(raw.siteMap);
  const topology = object(raw.topology);
  return {
    projectName,
    activeLayoutId: raw.activeLayoutId ?? null,
    layouts: layouts.map(summaryLayout),
    siteMap: {
      cameraCount: array(siteMap.cameras).length,
      address: siteMap.address ?? "",
      hasBoundary: Array.isArray(siteMap.boundary) && siteMap.boundary.length >= 3,
    },
    topology: {
      networkLinks: Object.keys(object(topology.parents)).length,
      recorderAssignments: Object.keys(object(topology.recorders)).length,
    },
  };
}
