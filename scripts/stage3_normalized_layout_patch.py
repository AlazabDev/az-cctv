from pathlib import Path

path = Path('src/components/cctv/CctvProjectEditorV2.tsx')
text = path.read_text(encoding='utf-8')

replacements = []

replacements.append((
'''import {\n  emptyPlan,\n  type PlanData,\n  type PlacedDevice,\n  type RoomLabel,\n  type WallSegment,\n  type WallThicknessCm,\n} from "@/lib/cctv/types";\n''',
'''import {\n  emptyPlan,\n  type PlanData,\n  type PlacedDevice,\n  type RoomLabel,\n  type WallSegment,\n  type WallThicknessCm,\n} from "@/lib/cctv/types";\nimport {\n  deleteNormalizedProjectLayout,\n  loadNormalizedProjectLayouts,\n  saveNormalizedProjectLayouts,\n} from "@/lib/cctv/normalized-layouts";\n'''
))

replacements.append((
'''  const { data: project, isLoading } = useQuery({\n    queryKey: ["project", projectId],\n''',
'''  const { data: project, isLoading: projectLoading } = useQuery({\n    queryKey: ["project", projectId],\n'''
))

needle = '''  const { data: project, isLoading: projectLoading } = useQuery({\n    queryKey: ["project", projectId],\n    queryFn: async () => {\n      const { data, error } = await supabase\n        .from("cctv_projects")\n        .select("*")\n        .eq("id", projectId)\n        .maybeSingle();\n      if (error) throw error;\n      return data;\n    },\n  });\n\n'''
insert = needle + '''  const { data: normalizedLayoutsState, isLoading: layoutsLoading } = useQuery({\n    queryKey: ["normalized-layouts", projectId, project?.updated_at],\n    enabled: Boolean(project),\n    queryFn: () => loadNormalizedProjectLayouts(project!),\n    staleTime: 30_000,\n  });\n\n'''
replacements.append((needle, insert))

replacements.append((
'''  useEffect(() => {\n    if (!project) return;\n    const stored = (project.data ?? {}) as Partial<PlanData> & {\n      offer?: Partial<OfferSettings>;\n      layouts?: Partial<ProjectLayout>[];\n      activeLayoutId?: string;\n      topology?: Partial<TopologyData>;\n      siteMap?: Partial<SiteMapData>;\n    };\n    const list: ProjectLayout[] = stored.layouts?.length\n      ? stored.layouts.map((l) => normalizeLayout(l))\n      : [\n          normalizeLayout({\n            ...stored,\n            id: uid(),\n            layoutName: stored.layoutName || "Layout 1",\n            floorplanPath: project.floorplan_path ?? null,\n          }),\n        ];\n    setLayouts(list);\n    setActiveLayoutId(\n      list.some((l) => l.id === stored.activeLayoutId) ? stored.activeLayoutId! : list[0]!.id,\n    );\n''',
'''  useEffect(() => {\n    if (!project || !normalizedLayoutsState) return;\n    const stored = (project.data ?? {}) as Partial<PlanData> & {\n      offer?: Partial<OfferSettings>;\n      topology?: Partial<TopologyData>;\n      siteMap?: Partial<SiteMapData>;\n    };\n    const list: ProjectLayout[] = normalizedLayoutsState.layouts.map((layout) => normalizeLayout(layout));\n    if (list.length === 0) return;\n    setLayouts(list);\n    setActiveLayoutId(\n      list.some((layout) => layout.id === normalizedLayoutsState.activeLayoutId)\n        ? normalizedLayoutsState.activeLayoutId\n        : list[0]!.id,\n    );\n'''
))

replacements.append((
'''  }, [project]);\n''',
'''  }, [project, normalizedLayoutsState]);\n'''
))

replacements.append((
'''    const targetId = dialogTargetId ?? uid();\n''',
'''    const targetId = dialogTargetId ?? crypto.randomUUID();\n'''
))

replacements.append((
'''  function deleteLayout(id: string) {\n    if (layouts.length <= 1) {\n      toast.error("يجب أن يحتوي المشروع على مخطط واحد على الأقل");\n      return;\n    }\n    const current = layouts.find((l) => l.id === id);\n    if (!window.confirm(`حذف المخطط «${current?.layoutName || ""}» وكل عناصره؟`)) return;\n    const rest = layouts.filter((l) => l.id !== id);\n    setLayouts(rest);\n    if (activeLayoutId === id) {\n      clearSelection();\n      setActiveLayoutId(rest[0]!.id);\n    }\n  }\n''',
'''  function deleteLayout(id: string) {\n    if (layouts.length <= 1) {\n      toast.error("يجب أن يحتوي المشروع على مخطط واحد على الأقل");\n      return;\n    }\n    const current = layouts.find((l) => l.id === id);\n    if (!window.confirm(`حذف المخطط «${current?.layoutName || ""}» وكل عناصره؟`)) return;\n    const rest = layouts.filter((l) => l.id !== id);\n    setLayouts(rest);\n    void deleteNormalizedProjectLayout(id).then((ok) => {\n      if (!ok) toast.error("تعذّر حذف المخطط من قاعدة البيانات");\n    });\n    if (activeLayoutId === id) {\n      clearSelection();\n      setActiveLayoutId(rest[0]!.id);\n    }\n  }\n'''
))

replacements.append((
'''  async function persist(nextLayouts = layouts, nextActive = activeLayoutId) {\n    const active = nextLayouts.find((l) => l.id === nextActive);\n    const { error } = await supabase\n''',
'''  async function persist(nextLayouts = layouts, nextActive = activeLayoutId) {\n    const active = nextLayouts.find((l) => l.id === nextActive);\n    const normalizedSaved = await saveNormalizedProjectLayouts(projectId, nextLayouts, nextActive);\n    if (!normalizedSaved) return false;\n\n    // Transitional compatibility write: normalized cctv_layouts is authoritative.\n    // Keep the legacy project JSON synchronized until old readers are retired.\n    const { error } = await supabase\n'''
))

replacements.append((
'''  if (isLoading) return <div className="p-10 text-muted-foreground">جارٍ تحميل المشروع…</div>;\n''',
'''  if (projectLoading || layoutsLoading)\n    return <div className="p-10 text-muted-foreground">جارٍ تحميل المشروع والمخططات…</div>;\n'''
))

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, found {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Stage 3 normalized multi-layout patch applied successfully')
