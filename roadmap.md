# AZ-CCTV — Production Closure Register

**Platform scope:** exactly five modules: CCTV system, CCTV network, CCTV maps, CCTV cost, CCTV agent. Support and settings are shared navigation, not modules.
**State:** ongoing development; no production closure claim without passing validation.

## Gate P0 — Source and CI
- [x] Main and develop consolidated before hardening
- [x] Primary and contextual service sidebar present in source
- [x] Legacy editor canvas contract repaired after TypeScript diagnostic
- [x] Empty product catalog no longer crashes calculator rendering
- [x] pnpm configuration repaired for core validation pipelines
- [x] Source formatting pass executed on develop
- [ ] All required workflows green on the same release SHA
- [ ] Remove or retire historical auto-patching workflows
- [ ] Replace remaining Lovable-specific runtime build dependencies safely
- [ ] Test routes including calculator, account, catalog and editor

## Gate P1 — CCTV system
- [ ] Test project creation / save / reload against live Supabase
- [ ] Validate multiple layouts, image upload, ceiling heights, and calibration
- [ ] Test wall pointer state machine (right-click finish, drag-pan, double-right exit)
- [ ] Verify placement optics against real product SKU and manufacturer source
- [ ] Test DORI/PPM accuracy, occlusion, 2D/3D fidelity
- [ ] Test project permission boundaries and concurrent edits

## Gate P2 — CCTV network
- [ ] Validate topology and actual NVR/switch ports/channel counts
- [ ] Verify PoE budgets, uplinks, cable runs and storage capacity
- [ ] Test saved/loaded network graph and integration with equipment placements

## Gate P3 — CCTV maps
- [ ] Validate geospatial accuracy and outdoor camera persistence
- [ ] Cross-check geo vs indoor equipment identity, avoid BOQ duplicates

## Gate P4 — CCTV cost
- [ ] Cross-module quantities audit from same saved project revision
- [ ] Price provenance, currency, fees, discounts, taxes, margin/reconciliation
- [ ] Compare PDF/CSV exports against approved project snapshot

## Gate P5 — CCTV agent
- [ ] Test agent invocation/auth/privacy/timeouts
- [ ] Suggestions must be proposed, reviewed, approved and audited before application
- [ ] Ensure errors never modify approved engineering data

## Gate P6 — Production sign-off
- [ ] Live Supabase migration/RLS audit
- [ ] Staging end-to-end with first real project, desktop and mobile
- [ ] Monitoring, error logs, backup/restore, rollback exercise
- [ ] Signed client/field acceptance, matching camera commissioning settings
- [ ] Approve production deploy only after all blocking gates pass

All unchecked gates are genuinely open, not silently marked done because the source includes code.
