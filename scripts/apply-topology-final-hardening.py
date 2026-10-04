from pathlib import Path

# 1) Do not silently assume a fiber type/core count when switching a link to Fiber.
p = Path("src/components/cctv/TopologyWorkspace.tsx")
s = p.read_text()
old = '''    const fallback = cableTypes.find((c) => c.category === wantedCategory)?.id;
    const routeBindings = {
      ...topology.routeBindings,
      [id]: { ...current, cableTypeId: currentType?.category === wantedCategory ? current.cableTypeId : fallback },
    };'''
new = '''    const fallback = medium === "fiber"
      ? undefined
      : cableTypes.find((c) => c.id === "cat6-stp")?.id ?? cableTypes.find((c) => c.category === "network")?.id;
    const routeBindings = {
      ...topology.routeBindings,
      [id]: { ...current, cableTypeId: currentType?.category === wantedCategory ? current.cableTypeId : fallback },
    };'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("TopologyWorkspace setMedia target not found")
p.write_text(s)

# 2) A bad measured binding must not make a real drawn cable disappear from BOQ.
p = Path("src/components/cctv/boq.ts")
s = p.read_text()
s = s.replace("  topologyCableRunsUsed,\n", "")
old = '''  const boundCableIds = topology ? topologyCableRunsUsed(topology) : new Set<string>();

  // Drawn cable routes not consumed by a topology edge remain valid BOQ infrastructure.
  plan.cables.forEach((c) => {
    if (boundCableIds.has(c.id)) return;
    const base = cableLengthMeters(c, plan.pxPerMeter) + Math.max(0, c.verticalAllowanceM ?? 0);
    const withSlack = base * (1 + Math.max(0, c.slackPercent ?? 15) / 100);
    addCableMeters(cableByType, c.type, withSlack);
  });

  if (topology && layouts.length) {
    const nodes = collectNodes(layouts);
    for (const node of nodes.values()) {
      if (!topology.parents[node.device.id]) continue;
      const route = resolveLinkRoute(node.device.id, topology, nodes, layouts);
      if (route.lengthM === null) continue;
      const medium = topology.media[node.device.id] ?? "utp";
      const cable = cableTypeForRoute(route, medium);
      if (!cable) continue;
      addCableMeters(cableByType, cable.id, route.lengthM);
    }

    const converterQty = totalMediaConverters(topology, nodes);'''
new = '''  const validMeasuredCableIds = new Set<string>();

  if (topology && layouts.length) {
    const nodes = collectNodes(layouts);
    for (const node of nodes.values()) {
      if (!topology.parents[node.device.id]) continue;
      const route = resolveLinkRoute(node.device.id, topology, nodes, layouts);
      if (route.source === "measured" && route.cableRunId) validMeasuredCableIds.add(route.cableRunId);
      if (route.lengthM === null) continue;
      const medium = topology.media[node.device.id] ?? "utp";
      const cable = cableTypeForRoute(route, medium);
      if (!cable) continue;
      addCableMeters(cableByType, cable.id, route.lengthM);
    }

    const converterQty = totalMediaConverters(topology, nodes);'''
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise RuntimeError("BOQ topology block not found")

raw_block = '''  // Drawn cable routes remain BOQ infrastructure unless a validated measured topology edge consumes them.
  plan.cables.forEach((c) => {
    if (validMeasuredCableIds.has(c.id)) return;
    const base = cableLengthMeters(c, plan.pxPerMeter) + Math.max(0, c.verticalAllowanceM ?? 0);
    const withSlack = base * (1 + Math.max(0, c.slackPercent ?? 15) / 100);
    addCableMeters(cableByType, c.type, withSlack);
  });

'''
anchor = '''  cableByType.forEach((meters, typeId) => {'''
if raw_block not in s:
    if anchor not in s:
        raise RuntimeError("BOQ cable output anchor not found")
    s = s.replace(anchor, raw_block + anchor, 1)
p.write_text(s)

# 3) Regression test: invalid measured binding still leaves the drawn cable in BOQ.
p = Path("tests/topology.engineering.test.ts")
s = p.read_text()
marker = '''  it("detects topology loops", () => {'''
test = '''  it("keeps a drawn cable in BOQ when its measured topology binding is invalid", () => {
    const cam = device("cam", "camera", "bullet-2mp-28", 0);
    const sw = device("sw", "switch", "sw-8", 100);
    const cable: CableRun = { id: "bad-route", type: "cat6-stp", points: [{ x: 500, y: 500 }, { x: 600, y: 500 }], slackPercent: 0 };
    const layouts = [layout("L1", [cam, sw], [cable])];
    const t = topology({
      parents: { cam: "sw" },
      media: { cam: "utp" },
      routeBindings: { cam: { mode: "cable", cableRunId: "bad-route" } },
    });
    const plan: PlanData = { ...emptyPlan, pxPerMeter: 10, devices: [cam, sw], cables: [cable] };
    const boq = buildBoq(plan, 14, { layouts, topology: t });
    const line = boq.lines.find((l) => l.label === "كابل CAT6 STP");
    expect(line?.qty).toBe(10);
  });

'''
if test not in s:
    if marker not in s:
        raise RuntimeError("Test insertion marker not found")
    s = s.replace(marker, test + marker, 1)
p.write_text(s)
