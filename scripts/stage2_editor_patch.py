from pathlib import Path

editor = Path("src/components/cctv/CctvProjectEditorV2.tsx")
s = editor.read_text()

old = 'import { cableTypes, cameraById, cameraCatalog, hardwareCatalog } from "@/lib/cctv/catalog";'
new = '''import {
  cableTypes,
  cameraById,
  cameraCatalog,
  hardwareCatalog,
  hydrateProductCatalog,
  productForSpecId,
} from "@/lib/cctv/catalog";'''
if old in s:
    s = s.replace(old, new, 1)

s = s.replace(
    'const [newCameraSpec, setNewCameraSpec] = useState(cameraCatalog[0]!.id);\n  const [newHardwareSpec, setNewHardwareSpec] = useState(hardwareCatalog[0]!.id);',
    'const [newCameraSpec, setNewCameraSpec] = useState("");\n  const [newHardwareSpec, setNewHardwareSpec] = useState("");\n  const [catalogVersion, setCatalogVersion] = useState(0);',
    1,
)

marker = '  const { data: project, isLoading } = useQuery({\n'
if marker in s and 'queryKey: ["products", "catalog"]' not in s:
    block = '''  const {
    data: products = [],
    isLoading: productsLoading,
    error: productsError,
  } = useQuery({
    queryKey: ["products", "catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("brand", { ascending: true })
        .order("model", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    hydrateProductCatalog(products);
    setCatalogVersion((value) => value + 1);
    setNewCameraSpec((current) =>
      cameraCatalog.some((item) => item.id === current) ? current : (cameraCatalog[0]?.id ?? ""),
    );
    setNewHardwareSpec((current) => {
      if (hardwareCatalog.some((item) => item.id === current)) return current;
      return hardwareCatalog.find((item) => item.kind !== "rack")?.id ?? "";
    });
  }, [products]);

  void catalogVersion;

'''
    s = s.replace(marker, block + marker, 1)

old = '    const specId = kind === "camera" ? newCameraSpec : newHardwareSpec;\n    const count = plan.devices.filter((device) => device.kind === kind).length + 1;'
new = '''    const specId = kind === "camera" ? newCameraSpec : newHardwareSpec;
    if (!specId) {
      toast.error(productsLoading ? "جارٍ تحميل كتالوج المنتجات…" : "لا يوجد منتج صالح لهذا العنصر");
      return;
    }
    const product = productForSpecId(specId);
    const count = plan.devices.filter((device) => device.kind === kind).length + 1;'''
if old in s:
    s = s.replace(old, new, 1)

old = '      specId,\n      name: `${names[kind]}${count}`,'
new = '      specId,\n      productId: product?.id,\n      name: `${names[kind]}${count}`,'
if old in s:
    s = s.replace(old, new, 1)

marker = '      <main className="relative min-w-0 flex-1 bg-muted/20">\n'
if marker in s and 'تعذّر تحميل كتالوج المنتجات' not in s:
    notice = '''      {productsError && (
        <div className="no-print absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          تعذّر تحميل كتالوج المنتجات من قاعدة البيانات. لن يتم استخدام منتجات تجارية ثابتة كبديل.
        </div>
      )}
'''
    s = s.replace(marker, notice + marker, 1)

old = '''              <p className="text-sm font-semibold">{camera.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {camera.model} · {camera.megapixel}MP · {camera.focal}mm
              </p>'''
new = '''              <div className="flex items-center gap-3">
                {camera.imageUrl ? (
                  <img src={camera.imageUrl} alt={camera.label} className="h-12 w-12 rounded-md object-contain" />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{camera.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {camera.model} · {camera.megapixel || "—"}MP · {camera.focal || "—"}mm
                  </p>
                  <p className="mt-1 text-[11px] font-semibold">
                    {formatMoney(camera.price, camera.currency ?? "EGP")}
                  </p>
                  {!camera.engineeringReady && (
                    <p className="mt-1 text-[10px] text-amber-600">بيانات DORI الهندسية غير مكتملة</p>
                  )}
                </div>
              </div>'''
if old in s:
    s = s.replace(old, new, 1)

old = '''                  {item.label}
                </button>'''
new = '''                  <div className="flex items-center gap-2">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.label} className="h-10 w-10 rounded object-contain" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{item.label}</p>
                      {item.model && <p className="truncate text-[10px] text-muted-foreground">{item.model}</p>}
                      {item.productId && (
                        <p className="text-[10px]">{formatMoney(item.price, item.currency ?? "EGP")}</p>
                      )}
                    </div>
                  </div>
                </button>'''
idx = s.find('hardwareCatalog\n              .filter((item) => item.kind === kind)')
if idx != -1:
    tail = s[idx:]
    if old in tail:
        tail = tail.replace(old, new, 1)
        s = s[:idx] + tail

idx = s.find("function DeviceProperties")
if idx != -1:
    tail = s[idx:]
    marker = '      {spec && (\n        <>\n'
    if marker in tail:
        replacement = '''      {spec && !spec.engineeringReady && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          المنتج مربوط بقاعدة المنتجات، لكن بيانات العدسة/الدقة/HFOV اللازمة لحساب DORI غير مكتملة. لن يتم حساب تغطية هندسية له حتى تُستكمل specifications.
        </div>
      )}
      {spec?.engineeringReady && (
        <>
'''
        tail = tail.replace(marker, replacement, 1)
        s = s[:idx] + tail

s = s.replace(
    '  isCable: boolean;\n};',
    '  isCable: boolean;\n  productId?: string;\n  imageUrl?: string;\n};',
    1,
)
s = s.replace('    const key = line.label;\n', '    const key = line.productId ?? line.label;\n', 1)
old = '''      isCable: line.label.startsWith("كابل "),
    };'''
new = '''      isCable: line.label.startsWith("كابل "),
      productId: line.productId,
      imageUrl: line.imageUrl,
    };'''
if old in s:
    s = s.replace(old, new, 1)

old = '''                    <td className="px-4 py-3">
                      <p className="font-medium">{line.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {line.isCable ? "Network infrastructure" : "CCTV / system product"}
                      </p>
                    </td>'''
new = '''                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {line.imageUrl ? (
                          <img src={line.imageUrl} alt={line.label} className="h-12 w-12 rounded-md object-contain" />
                        ) : null}
                        <div>
                          <p className="font-medium">{line.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {line.isCable ? "Network infrastructure" : line.productId ? `Product · ${line.productId.slice(0, 8)}…` : "Engineering / design item"}
                          </p>
                        </div>
                      </div>
                    </td>'''
if old in s:
    s = s.replace(old, new, 1)

editor.write_text(s)

canvas = Path("src/components/cctv/PlanCanvas.tsx")
c = canvas.read_text()
c = c.replace(
    '                if (!spec) return null;\n',
    '                if (!spec || !spec.engineeringReady) return null;\n',
    1,
)
canvas.write_text(c)
