import { ROUTER_ID } from "./topology";

type NetworkLayout = { devices: Array<{ id: string; kind: string }> };

export const BADR_DIRECT_CAMERAS = [4, 6, 6, 6] as const;

export interface BadrNetworkAssessment {
  cameraCount: number;
  switchCount: number;
  directCameras: number[];
  issues: string[];
}

/**
 * Checks the user-confirmed four-switch physical chain without synthesizing
 * equipment, port counts, cable lengths or unexplained network links.
 */
export function inspectBadrNetwork(
  layouts: NetworkLayout[],
  parents: Record<string, string>,
): BadrNetworkAssessment {
  const devices = layouts.flatMap((layout) => layout.devices);
  const cameras = devices.filter((device) => device.kind === "camera");
  const switches = devices.filter((device) => device.kind === "switch");
  const ids = new Set(switches.map((device) => device.id));
  const issues: string[] = [];
  if (switches.length !== 4)
    issues.push(`المخطط يتضمن ${switches.length} سويتش، بينما التنفيذ المبلغ يتضمن 4.`);
  if (cameras.length !== 22)
    issues.push(`المخطط يتضمن ${cameras.length} كاميرا، بينما المشروع يتضمن 22.`);

  const rootSwitches = switches.filter((sw) => parents[sw.id] === ROUTER_ID);
  if (rootSwitches.length !== 1)
    issues.push("يجب ربط سويتش التجميع الرئيسي وحده ببوابة الشبكة، وتسلسل الثلاثة الباقية منه.");

  const ordered: typeof switches = [];
  if (rootSwitches.length === 1) {
    let current = rootSwitches[0];
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      ordered.push(current);
      const next = switches.filter((sw) => parents[sw.id] === current!.id);
      if (next.length > 1) {
        issues.push("التوصيل المتسلسل تفرع بين سويتشين؛ المعتمد هو سلسلة واحدة بلا تفريعات.");
        break;
      }
      current = next[0];
    }
    if (current && seen.has(current.id)) issues.push("دورة غير صحيحة في شبكة السويتشات.");
    if (ordered.length !== switches.length || ordered.length !== 4)
      issues.push("السويتشات الأربعة لا تكوّن سلسلة اتصال واحدة مكتملة.");
  }
  const directCameras = ordered.map(
    (sw) => cameras.filter((camera) => parents[camera.id] === sw.id).length,
  );
  if (ordered.length === 4) {
    BADR_DIRECT_CAMERAS.forEach((target, index) => {
      if (directCameras[index] !== target)
        issues.push(
          `السويتش ${index + 1} عليه ${directCameras[index]} كاميرا مباشرة؛ العدد المبلغ به ${target}.`,
        );
    });
  }
  const connected = cameras.filter((camera) => ids.has(parents[camera.id])).length;
  if (connected !== cameras.length)
    issues.push(`${cameras.length - connected} كاميرا ليس لها ربط مباشر بسويتش في المخطط.`);
  if (connected !== 22) issues.push("تسليم الـ22 كاميرا يتطلب تسجيل رابط شبكة مباشر لكل كاميرا.");
  return { cameraCount: cameras.length, switchCount: switches.length, directCameras, issues };
}
