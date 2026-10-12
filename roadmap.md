# Roadmap

## Delivery Phases

1. **Plan Design** — ✅ CLOSED
2. **Product Catalog Integration** — ✅ CLOSED
   - Canonical commercial source: `public.products`
   - Editor hydrates the live product catalog before rendering
   - Camera / NVR / Network Switch pickers use Product Master records
   - `/catalog` reads the same Product Master instead of the legacy static commercial catalog
   - Legacy specs remain lookup-only for previously saved projects
3. **Normalized Multi-Layout** — ⏭ NEXT
4. **DORI / Geometry Engine** — ⏸ PENDING
5. **AI Agent** — ⏸ PENDING
6. **Map Design** — ⏸ PENDING
7. **Production Hardening** — ✅ build/types/tests clean

## Existing Capabilities / Backlog

## Requested reference editor upgrades
- [ ] Stage 1: floorplan preparation dialog, name/height, preview, rotation and crop before upload.
- [ ] Stage 2: wall material/thickness controls and searchable device list/placement.
- [ ] Stage 3: camera deployment controls, side-view geometry and interactive target distance/PPM.
- [ ] Verify new controls, persistence and regression tests.

- [x] إضافة التبويبات العلوية ومساحات العمل داخل المحرر
- [x] إضافة درج كابلات الشبكة والفايبر وقائمة المسارات
- [x] إكمال أداة الجدران وخصائصها
- [x] إضافة تسميات الغرف وتحريرها وتحريكها
- [x] توحيد نموذج البيانات وإصلاح أخطاء البناء الحالية
- [ ] التحقق من الحفظ وإعادة الفتح وتجربة الواجهة
- [x] تعدد المخططات (Layouts) داخل المشروع مع حفظ تلقائي
- [x] مديول Topology (توليد تلقائي، تعديل التوصيل، تحقق منافذ/PoE/أطوال/فايبر)
- [x] مديول Map Design (خريطة أقمار صناعية، إحداثيات، كاميرات خارجية بتغطية PPM، تدخل في جدول الكميات)
- [x] التصميم التلقائي للكاميرات في المخطط والخريطة
