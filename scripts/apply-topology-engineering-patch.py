from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Patch target not found: {label}")
    return text.replace(old, new, 1)

# Editor wiring
p = Path("src/components/cctv/CctvProjectEditorV2.tsx")
s = p.read_text()
s = replace_once(s,
    'import { emptyTopology, type TopologyData } from "@/lib/cctv/topology";',
    'import { emptyTopology, normalizeTopology, type TopologyData } from "@/lib/cctv/topology";',
    "editor topology import")
s = replace_once(s,
    'setTopology({ parents: stored.topology?.parents ?? {}, media: stored.topology?.media ?? {} });',
    'setTopology(normalizeTopology(stored.topology));',
    "editor topology normalization")
s = replace_once(s,
    'const boq = useMemo(() => buildBoq(projectPlan, retention), [projectPlan, retention]);',
    'const boq = useMemo(() => buildBoq(projectPlan, retention, { layouts, topology }), [projectPlan, retention, layouts, topology]);',
    "editor central BOQ integration")
p.write_text(s)

# Topology correctness
p = Path("src/lib/cctv/topology.ts")
s = p.read_text()
s = replace_once(s,
'''    const candidates = [...switches, ...nvrs]
      .filter((p) => {
        const cap = effectiveCapabilities(p.device, base);
        return cap.poePorts > (usedPoe.get(p.device.id) ?? 0) && cap.ethernetPorts > (usedEthernet.get(p.device.id) ?? 0);
      })''',
'''    const candidates = [...switches, ...nvrs]
      .filter((p) => {
        const cap = effectiveCapabilities(p.device, base);
        const poeAvailable = cap.poePorts > (usedPoe.get(p.device.id) ?? 0);
        const ethernetAvailable = p.device.kind === "nvr" || cap.ethernetPorts > (usedEthernet.get(p.device.id) ?? 0);
        return poeAvailable && ethernetAvailable;
      })''',
"NVR PoE candidate accounting")
s = replace_once(s,
'''    usedPoe.set(p.device.id, (usedPoe.get(p.device.id) ?? 0) + 1);
    usedEthernet.set(p.device.id, (usedEthernet.get(p.device.id) ?? 0) + 1);''',
'''    usedPoe.set(p.device.id, (usedPoe.get(p.device.id) ?? 0) + 1);
    if (p.device.kind === "switch") {
      usedEthernet.set(p.device.id, (usedEthernet.get(p.device.id) ?? 0) + 1);
    }''',
"NVR dedicated PoE ports")
s = replace_once(s,
'''    const hasCopperUplink = d.kind === "switch" && !!topology.parents[d.id] && (topology.media[d.id] ?? "utp") === "utp";
    const usedEthernet = kids.length + (hasCopperUplink ? 1 : 0);

    if (usedEthernet > cap.ethernetPorts) {
      issues.push({ level: "error", deviceId: d.id, text: `${d.name}: ${usedEthernet} منافذ Ethernet مستخدمة من أصل ${cap.ethernetPorts}` });
    }''',
'''    const hasCopperUplink = !!topology.parents[d.id] && (topology.media[d.id] ?? "utp") === "utp";
    const networkChildren = kids.filter((k) => k.device.kind !== "camera").length;
    const usedEthernet = d.kind === "nvr"
      ? networkChildren + (hasCopperUplink ? 1 : 0)
      : kids.length + (hasCopperUplink ? 1 : 0);

    if (usedEthernet > cap.ethernetPorts) {
      issues.push({ level: "error", deviceId: d.id, text: `${d.name}: ${usedEthernet} منافذ Ethernet مستخدمة من أصل ${cap.ethernetPorts}` });
    }''',
"NVR LAN vs built-in PoE validation")
s = replace_once(s,
'''export function cableTypeForRoute(route: ResolvedLinkRoute, medium: LinkMedia) {
  if (route.cableTypeId) return cableTypes.find((c) => c.id === route.cableTypeId);
  return cableTypes.find((c) => (medium === "fiber" ? c.category === "fiber" : c.category === "network"));
}''',
'''export function cableTypeForRoute(route: ResolvedLinkRoute, medium: LinkMedia) {
  if (route.cableTypeId) return cableTypes.find((c) => c.id === route.cableTypeId);
  if (medium === "fiber") return undefined;
  return cableTypes.find((c) => c.id === "cat6-stp") ?? cableTypes.find((c) => c.category === "network");
}''',
"no assumed fiber core count")
s = replace_once(s,
'''    const route = resolveLinkRoute(d.id, topology, nodes, layouts);
    const medium = topology.media[d.id] ?? "utp";''',
'''    const route = resolveLinkRoute(d.id, topology, nodes, layouts);
    const medium = topology.media[d.id] ?? "utp";
    const selectedCable = route.cableTypeId ? cableTypes.find((c) => c.id === route.cableTypeId) : undefined;
    const expectedCategory = medium === "fiber" ? "fiber" : "network";
    if (selectedCable && selectedCable.category !== expectedCategory) {
      issues.push({ level: "error", deviceId: d.id, text: `${d.name}: نوع الكابل ${selectedCable.label} لا يطابق وسيط الرابط ${medium === "fiber" ? "Fiber" : "UTP/STP"}` });
    }
    if (medium === "fiber" && route.source === "estimated" && !selectedCable) {
      issues.push({ level: "warning", deviceId: d.id, text: `${d.name}: نوع/عدد قلوب الفايبر غير محدد؛ لن يُفترض نوع تلقائياً في BOQ` });
    }''',
"medium/cable category validation")
s = replace_once(s,
'''  return {
    gateway: { name: topology.gateway.name ?? "Router / Core", ...gatewayCapabilities(topology) },
    devices,
    edges,
    stats: topologyStats(topology, nodes, layouts),
    issues: issues.map((i) => ({ severity: i.level, deviceId: i.deviceId ?? null, text: i.text })),
  };''',
'''  const cableTotals = new Map<string, { cableTypeId: string; medium: LinkMedia; totalLengthM: number; measuredLinks: number; estimatedLinks: number }>();
  for (const edge of edges) {
    if (!(edge.lengthM && edge.lengthM > 0) || !edge.cableTypeId) continue;
    const current = cableTotals.get(edge.cableTypeId) ?? {
      cableTypeId: edge.cableTypeId,
      medium: edge.medium,
      totalLengthM: 0,
      measuredLinks: 0,
      estimatedLinks: 0,
    };
    current.totalLengthM += edge.lengthM;
    if (edge.lengthSource === "measured") current.measuredLinks += 1;
    if (edge.lengthSource === "estimated") current.estimatedLinks += 1;
    cableTotals.set(edge.cableTypeId, current);
  }

  return {
    gateway: { name: topology.gateway.name ?? "Router / Core", ...gatewayCapabilities(topology) },
    devices,
    edges,
    stats: topologyStats(topology, nodes, layouts),
    networkBoqSummary: {
      cableTotals: [...cableTotals.values()].map((x) => ({ ...x, totalLengthM: Math.round(x.totalLengthM * 10) / 10 })),
      mediaConverters: totalMediaConverters(topology, nodes),
    },
    issues: issues.map((i) => ({ severity: i.level, deviceId: i.deviceId ?? null, text: i.text })),
  };''',
"AI network BOQ summary")
p.write_text(s)

# AI server function
p = Path("src/lib/topology-ai.functions.ts")
s = p.read_text()
s = s.replace('const AGENT_NAME = process.env["AZURE_NETWORK_AGENT_NAME"] || process.env["AZURE_AGENT_NAME"] || "az-agent-bim";\nconst AGENT_VERSION = process.env["AZURE_NETWORK_AGENT_VERSION"] || process.env["AZURE_AGENT_VERSION"] || "8";\n\n', '')
s = replace_once(s,
'''    stats: z.record(z.unknown()),
    issues: z.array(z.record(z.unknown())).max(1000),''',
'''    stats: z.record(z.unknown()),
    networkBoqSummary: z.object({
      cableTotals: z.array(z.record(z.unknown())).max(100),
      mediaConverters: z.number().nonnegative(),
    }),
    issues: z.array(z.record(z.unknown())).max(1000),''',
"AI network BOQ schema")
s = replace_once(s,
'''    const apiKey = process.env["AZURE_API_KEY"];
    if (!apiKey) return { error: "خدمة AI Network Review غير مهيأة على الخادم." } as const;''',
'''    const apiKey = process.env["AZURE_API_KEY"];
    const agentName = process.env["AZURE_NETWORK_AGENT_NAME"] || process.env["AZURE_AGENT_NAME"] || "az-agent-bim";
    const agentVersion = process.env["AZURE_NETWORK_AGENT_VERSION"] || process.env["AZURE_AGENT_VERSION"] || "8";
    if (!apiKey) return { error: "خدمة AI Network Review غير مهيأة على الخادم." } as const;''',
"request-time AI env")
s = s.replace('agent: { name: AGENT_NAME, version: AGENT_VERSION, type: "agent_reference" },', 'agent: { name: agentName, version: agentVersion, type: "agent_reference" },')
p.write_text(s)

# Regression test
p = Path("tests/topology.engineering.test.ts")
s = p.read_text()
marker = '  it("keeps NVR recording channels separate from physical PoE ports", () => {'
test = '''  it("does not count built-in NVR PoE camera ports as the NVR LAN Ethernet interface", () => {
    const c1 = device("c1", "camera", "bullet-2mp-28", 0);
    const c2 = device("c2", "camera", "bullet-2mp-28", 10);
    const nvr = device("nvr", "nvr", "nvr-8", 20);
    const layouts = [layout("L1", [c1, c2, nvr])];
    const t = topology({
      parents: { c1: "nvr", c2: "nvr", nvr: "__router" },
      media: { c1: "utp", c2: "utp", nvr: "utp" },
      recorders: { c1: "nvr", c2: "nvr" },
    });
    const issues = validateTopology(t, collectNodes(layouts), layouts);
    expect(issues.some((i) => i.deviceId === "nvr" && i.level === "error" && i.text.includes("Ethernet"))).toBe(false);
    expect(issues.some((i) => i.deviceId === "nvr" && i.level === "error" && i.text.includes("PoE"))).toBe(false);
  });

'''
if test not in s:
    if marker not in s:
        raise RuntimeError("NVR regression test marker not found")
    s = s.replace(marker, test + marker, 1)
p.write_text(s)
