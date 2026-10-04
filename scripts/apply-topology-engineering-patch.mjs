import fs from "node:fs";

function replaceOnce(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`Patch target not found: ${label}`);
  return text.replace(oldValue, newValue);
}

// Editor wiring
{
  const path = "src/components/cctv/CctvProjectEditorV2.tsx";
  let s = fs.readFileSync(path, "utf8");
  s = replaceOnce(
    s,
    'import { emptyTopology, type TopologyData } from "@/lib/cctv/topology";',
    'import { emptyTopology, normalizeTopology, type TopologyData } from "@/lib/cctv/topology";',
    "editor topology import",
  );
  s = replaceOnce(
    s,
    'setTopology({ parents: stored.topology?.parents ?? {}, media: stored.topology?.media ?? {} });',
    'setTopology(normalizeTopology(stored.topology));',
    "editor topology normalization",
  );
  s = replaceOnce(
    s,
    'const boq = useMemo(() => buildBoq(projectPlan, retention), [projectPlan, retention]);',
    'const boq = useMemo(() => buildBoq(projectPlan, retention, { layouts, topology }), [projectPlan, retention, layouts, topology]);',
    "editor central BOQ integration",
  );
  fs.writeFileSync(path, s);
}

// Topology correctness
{
  const path = "src/lib/cctv/topology.ts";
  let s = fs.readFileSync(path, "utf8");
  s = replaceOnce(
    s,
`    const candidates = [...switches, ...nvrs]
      .filter((p) => {
        const cap = effectiveCapabilities(p.device, base);
        return cap.poePorts > (usedPoe.get(p.device.id) ?? 0) && cap.ethernetPorts > (usedEthernet.get(p.device.id) ?? 0);
      })`,
`    const candidates = [...switches, ...nvrs]
      .filter((p) => {
        const cap = effectiveCapabilities(p.device, base);
        const poeAvailable = cap.poePorts > (usedPoe.get(p.device.id) ?? 0);
        const ethernetAvailable = p.device.kind === "nvr" || cap.ethernetPorts > (usedEthernet.get(p.device.id) ?? 0);
        return poeAvailable && ethernetAvailable;
      })`,
    "NVR PoE candidate accounting",
  );
  s = replaceOnce(
    s,
`    usedPoe.set(p.device.id, (usedPoe.get(p.device.id) ?? 0) + 1);
    usedEthernet.set(p.device.id, (usedEthernet.get(p.device.id) ?? 0) + 1);`,
`    usedPoe.set(p.device.id, (usedPoe.get(p.device.id) ?? 0) + 1);
    if (p.device.kind === "switch") {
      usedEthernet.set(p.device.id, (usedEthernet.get(p.device.id) ?? 0) + 1);
    }`,
    "NVR dedicated PoE ports",
  );
  s = replaceOnce(
    s,
`    const hasCopperUplink = d.kind === "switch" && !!topology.parents[d.id] && (topology.media[d.id] ?? "utp") === "utp";
    const usedEthernet = kids.length + (hasCopperUplink ? 1 : 0);

    if (usedEthernet > cap.ethernetPorts) {
      issues.push({ level: "error", deviceId: d.id, text: \\`${d.name}: ${usedEthernet} منافذ Ethernet مستخدمة من أصل ${cap.ethernetPorts}\\` });
    }`,
`    const hasCopperUplink = !!topology.parents[d.id] && (topology.media[d.id] ?? "utp") === "utp";
    const networkChildren = kids.filter((k) => k.device.kind !== "camera").length;
    const usedEthernet = d.kind === "nvr"
      ? networkChildren + (hasCopperUplink ? 1 : 0)
      : kids.length + (hasCopperUplink ? 1 : 0);

    if (usedEthernet > cap.ethernetPorts) {
      issues.push({ level: "error", deviceId: d.id, text: \\`${d.name}: ${usedEthernet} منافذ Ethernet مستخدمة من أصل ${cap.ethernetPorts}\\` });
    }`,
    "NVR LAN vs built-in PoE validation",
  );
  s = replaceOnce(
    s,
`export function cableTypeForRoute(route: ResolvedLinkRoute, medium: LinkMedia) {
  if (route.cableTypeId) return cableTypes.find((c) => c.id === route.cableTypeId);
  return cableTypes.find((c) => (medium === "fiber" ? c.category === "fiber" : c.category === "network"));
}`,
`export function cableTypeForRoute(route: ResolvedLinkRoute, medium: LinkMedia) {
  if (route.cableTypeId) return cableTypes.find((c) => c.id === route.cableTypeId);
  if (medium === "fiber") return undefined;
  return cableTypes.find((c) => c.id === "cat6-stp") ?? cableTypes.find((c) => c.category === "network");
}`,
    "no assumed fiber core count",
  );
  const routeNeedle = `    const route = resolveLinkRoute(d.id, topology, nodes, layouts);\n    const medium = topology.media[d.id] ?? "utp";`;
  const routeReplacement = `    const route = resolveLinkRoute(d.id, topology, nodes, layouts);\n    const medium = topology.media[d.id] ?? "utp";\n    const selectedCable = route.cableTypeId ? cableTypes.find((c) => c.id === route.cableTypeId) : undefined;\n    const expectedCategory = medium === "fiber" ? "fiber" : "network";\n    if (selectedCable && selectedCable.category !== expectedCategory) {\n      issues.push({ level: "error", deviceId: d.id, text: \\`${d.name}: نوع الكابل ${selectedCable.label} لا يطابق وسيط الرابط ${medium === "fiber" ? "Fiber" : "UTP/STP"}\\` });\n    }\n    if (medium === "fiber" && route.source === "estimated" && !selectedCable) {\n      issues.push({ level: "warning", deviceId: d.id, text: \\`${d.name}: نوع/عدد قلوب الفايبر غير محدد؛ لن يُفترض نوع تلقائياً في BOQ\\` });\n    }`;
  s = replaceOnce(s, routeNeedle, routeReplacement, "medium/cable category validation");

  s = replaceOnce(
    s,
`  return {
    gateway: { name: topology.gateway.name ?? "Router / Core", ...gatewayCapabilities(topology) },
    devices,
    edges,
    stats: topologyStats(topology, nodes, layouts),
    issues: issues.map((i) => ({ severity: i.level, deviceId: i.deviceId ?? null, text: i.text })),
  };`,
`  const cableTotals = new Map<string, { cableTypeId: string; medium: LinkMedia; totalLengthM: number; measuredLinks: number; estimatedLinks: number }>();
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
  };`,
    "AI network BOQ summary",
  );
  fs.writeFileSync(path, s);
}

// AI Gateway server function hardening
{
  const path = "src/lib/topology-ai.functions.ts";
  let s = fs.readFileSync(path, "utf8");
  s = s.replace('const AGENT_NAME = process.env["AZURE_NETWORK_AGENT_NAME"] || process.env["AZURE_AGENT_NAME"] || "az-agent-bim";\nconst AGENT_VERSION = process.env["AZURE_NETWORK_AGENT_VERSION"] || process.env["AZURE_AGENT_VERSION"] || "8";\n\n', '');
  s = replaceOnce(
    s,
`    stats: z.record(z.unknown()),
    issues: z.array(z.record(z.unknown())).max(1000),`,
`    stats: z.record(z.unknown()),
    networkBoqSummary: z.object({
      cableTotals: z.array(z.record(z.unknown())).max(100),
      mediaConverters: z.number().nonnegative(),
    }),
    issues: z.array(z.record(z.unknown())).max(1000),`,
    "AI network BOQ schema",
  );
  s = replaceOnce(
    s,
`    const apiKey = process.env["AZURE_API_KEY"];
    if (!apiKey) return { error: "خدمة AI Network Review غير مهيأة على الخادم." } as const;`,
`    const apiKey = process.env["AZURE_API_KEY"];
    const agentName = process.env["AZURE_NETWORK_AGENT_NAME"] || process.env["AZURE_AGENT_NAME"] || "az-agent-bim";
    const agentVersion = process.env["AZURE_NETWORK_AGENT_VERSION"] || process.env["AZURE_AGENT_VERSION"] || "8";
    if (!apiKey) return { error: "خدمة AI Network Review غير مهيأة على الخادم." } as const;`,
    "request-time AI env",
  );
  s = s.replace('agent: { name: AGENT_NAME, version: AGENT_VERSION, type: "agent_reference" },', 'agent: { name: agentName, version: agentVersion, type: "agent_reference" },');
  fs.writeFileSync(path, s);
}

// Regression test
{
  const path = "tests/topology.engineering.test.ts";
  let s = fs.readFileSync(path, "utf8");
  const marker = '  it("keeps NVR recording channels separate from physical PoE ports", () => {';
  const test = `  it("does not count built-in NVR PoE camera ports as the NVR LAN Ethernet interface", () => {\n    const c1 = device("c1", "camera", "bullet-2mp-28", 0);\n    const c2 = device("c2", "camera", "bullet-2mp-28", 10);\n    const nvr = device("nvr", "nvr", "nvr-8", 20);\n    const layouts = [layout("L1", [c1, c2, nvr])];\n    const t = topology({\n      parents: { c1: "nvr", c2: "nvr", nvr: "__router" },\n      media: { c1: "utp", c2: "utp", nvr: "utp" },\n      recorders: { c1: "nvr", c2: "nvr" },\n    });\n    const issues = validateTopology(t, collectNodes(layouts), layouts);\n    expect(issues.some((i) => i.deviceId === "nvr" && i.level === "error" && i.text.includes("Ethernet"))).toBe(false);\n    expect(issues.some((i) => i.deviceId === "nvr" && i.level === "error" && i.text.includes("PoE"))).toBe(false);\n  });\n\n`;
  if (!s.includes(test)) {
    if (!s.includes(marker)) throw new Error("NVR regression test marker not found");
    s = s.replace(marker, test + marker);
  }
  fs.writeFileSync(path, s);
}
