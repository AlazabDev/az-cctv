import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { Crop, RotateCcw, RotateCw, Upload, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cropFloorplan, renderPdfPage, validateFloorplanFile, type PixelCrop } from "@/lib/cctv/floorplan-image";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialHeight: string;
  replacing: boolean;
  onConfirm: (file: File, name: string, height: number) => Promise<boolean>;
};

export function FloorplanUploadDialog(props: Props) {
  const [name, setName] = useState(props.initialName);
  const [height, setHeight] = useState(props.initialHeight);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<PixelCrop | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!props.open) return;
    setName(props.initialName); setHeight(props.initialHeight); setFile(null); setSource(null);
    setRotation(0); setCropping(false); setPage(1); setPageCount(1); setPixels(null); setZoom(1); setCrop({ x: 0, y: 0 });
  }, [props.open, props.initialName, props.initialHeight]);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setLoading(true); setSource(null); setPixels(null); setRotation(0); setZoom(1); setCrop({ x: 0, y: 0 });
    void (async () => {
      try {
        if (/\.pdf$/i.test(file.name)) {
          const result = await renderPdfPage(file, page);
          if (!cancelled) { setSource(result.url); setPageCount(result.pageCount); }
        } else {
          objectUrl = URL.createObjectURL(file);
          const image = new Image(); image.src = objectUrl; await image.decode();
          if (!cancelled) { setSource(objectUrl); setPageCount(1); }
        }
      } catch { if (!cancelled) toast.error("تعذّر قراءة المخطط؛ اختر ملفاً غير تالف"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file, page]);
  function choose(next?: File) {
    if (!next || busy) return;
    try { validateFloorplanFile(next); setPage(1); setFile(next); }
    catch (error) { toast.error(error instanceof Error ? error.message : "ملف غير صالح"); }
  }
  async function confirm() {
    if (!source || !name.trim() || !(Number(height) > 0) || busy) return;
    setBusy(true);
    try {
      const prepared = await cropFloorplan(source, rotation, cropping ? pixels : null);
      if (await props.onConfirm(prepared, name.trim(), Number(height))) props.onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذّر رفع المخطط"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={props.open} onOpenChange={(open) => !busy && props.onOpenChange(open)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" aria-describedby={undefined} dir="rtl">
        <DialogTitle>{props.replacing ? "تحديث المخطط" : "إضافة مخطط جديد"}</DialogTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="layout-name">اسم المخطط</Label><Input id="layout-name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} /></div>
          <div><Label htmlFor="ceiling-height">ارتفاع السقف (م)</Label><Input id="ceiling-height" type="number" min={0.1} step={0.1} value={height} onChange={(e) => setHeight(e.target.value)} disabled={busy} /></div>
        </div>
        <input ref={inputRef} id="layout-file" className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp,.bmp,.pdf" disabled={busy} onChange={(e) => choose(e.target.files?.[0])} />
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-4" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choose(e.dataTransfer.files[0]); }}>
          <div className="min-w-0 text-xs"><p className="truncate font-semibold">{file?.name ?? "ملف المخطط"}</p><p className="text-muted-foreground">JPG · PNG · WEBP · BMP · PDF / 15 MB</p></div>
          <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" />اختيار ملف</Button>
        </div>
        {loading && <p role="status" className="py-10 text-center text-muted-foreground">جارٍ تجهيز المعاينة…</p>}
        {source && !loading && <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="icon" variant="outline" title="تدوير لليسار" aria-label="تدوير لليسار" disabled={busy} onClick={() => setRotation((r) => (r + 270) % 360)}><RotateCcw className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" title="تدوير لليمين" aria-label="تدوير لليمين" disabled={busy} onClick={() => setRotation((r) => (r + 90) % 360)}><RotateCw className="h-4 w-4" /></Button>
            <Button size="icon" variant={cropping ? "default" : "outline"} title="قص المخطط" aria-label="قص المخطط" disabled={busy} onClick={() => { setCropping((c) => !c); setPixels(null); }}><Crop className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" title="إعادة ضبط" aria-label="إعادة ضبط" disabled={busy} onClick={() => { setRotation(0); setCropping(false); setCrop({ x: 0, y: 0 }); setZoom(1); }}><Undo2 className="h-4 w-4" /></Button>
            <span className="text-xs text-muted-foreground">{rotation}°</span>
            {cropping && <select aria-label="نسبة القص" className="rounded-md border border-border bg-background p-2 text-xs" value={aspect} onChange={(e) => setAspect(Number(e.target.value))}><option value={4 / 3}>4:3</option><option value={16 / 9}>16:9</option><option value={1}>1:1</option><option value={3 / 4}>3:4</option></select>}
            {pageCount > 1 && <div className="mr-auto flex items-center gap-2 text-xs"><Label htmlFor="pdf-page">صفحة PDF</Label><Input id="pdf-page" className="h-8 w-20" type="number" min={1} max={pageCount} value={page} onChange={(e) => setPage(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))} /><span>/ {pageCount}</span></div>}
          </div>
          <div className="relative h-80 overflow-hidden rounded-md border border-border bg-muted" data-testid="floorplan-preview">
            {cropping ? <Cropper image={source} crop={crop} zoom={zoom} rotation={rotation} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, area) => setPixels(area)} /> : <img src={source} alt="معاينة المخطط" className={`h-full w-full object-contain ${rotation === 90 ? "rotate-90" : rotation === 180 ? "rotate-180" : rotation === 270 ? "-rotate-90" : ""}`} />}
          </div>
          {cropping && <input aria-label="تكبير القص" type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />}
        </>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => props.onOpenChange(false)}>إلغاء</Button><Button disabled={busy || loading || !source || !name.trim() || !(Number(height) > 0) || (cropping && !pixels)} onClick={() => void confirm()}>{busy ? "جارٍ الرفع…" : "اعتماد ورفع المخطط"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}