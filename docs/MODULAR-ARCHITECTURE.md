# AZ-CCTV — Five-Module Architecture (Locked Scope)
**Approved module count: exactly FIVE.** This replaces the prior 12-module proposal.
**Date:** 2026-10-24
**Repository branch:** develop

## Five official modules (names and order immutable until user explicitly changes them)
1. **CCTV system** — project and site setup, layouts, plan upload, required ceiling height, calibration, smart wall editor, camera placement, lens profile, DORI/PPM, 2D/3D coverage, drawings, engineering assets and design review.
2. **CCTV network** — NVRs, switches, PoE budgets, copper/fiber wiring, logical/physical topology, route lengths, port assignments, capacity validation and network drawings.
3. **CCTV maps** — geographical site location, map/satellite layers, outdoor cameras and assets, positions, orientation, geographical coverage and site map.
4. **CCTV cost** — unified BOQ, quantities from system/network/maps, product prices, labor/allowances, discounts/taxes, offer versions, cost summaries and export/PDF.
5. **CCTV agent** — guided design, recommendations, automatic layout proposals, agent chat, proposal validation and explicit user approval. An agent proposal MUST NOT silently mutate approved project state.

**No sixth top-level module is permitted.** Product Catalog, Projects, Layouts, DORI, reporting, commissioning, users/auth and shared infrastructure are subdomains/services inside the five modules or platform-level infrastructure — never independent top-level modules.

## Single canonical shared project
All five modules operate on one `projectId`, with site/layout IDs, product UUIDs, revision ID, and immutable approved engineering snapshots. Data ownership:
| Entity/Workflow | Canonical owner |
|---|---|
| Project record, layouts, walls, camera placements, geometry | CCTV system |
| Connection graph, switch ports, PoE, cable routes | CCTV network |
| Outdoor geographic features and placements | CCTV maps |
| Aggregated BOQ, costing, offers, report exports | CCTV cost |
| Agent threads, proposed design patches, approvals | CCTV agent |
| Product master | Shared catalog service over **public.products**, consumed by relevant modules; never copied as an alternate master |
| Authentication, storage, persistence, versioning, audit events | Platform infrastructure; not top-level modules |

## Dependency contracts
- CCTV system consumes product master records; each placed camera locks model ID, focal setting, HFOV/VFOV and installation orientation.
- CCTV network consumes immutable equipment/site placement snapshots and writes only its network graph, cable assignments and capacity validations.
- CCTV maps owns geographic coordinates, geometry and outdoor placed objects; integration uses IDs rather than multiplying devices in BOQ.
- CCTV cost is read-mostly over snapshots of the other three modules; it must avoid double-counting cameras/cables present across system/maps/network. It owns commercial edits only.
- CCTV agent reads approved snapshots and issues **proposals**, which are reviewed and applied through normal module commands.
- Changes requiring recalculation publish revision-scoped events. No circular internal imports; communicate via typed public APIs.
- Shared kernels are libraries, not user-facing modules.

## Target code structure
```text
src/
  app/                  # auth, navigation, workspace shell
  modules/
    cctv-system/
      domain/ application/ infrastructure/ ui/ tests/ index.ts
    cctv-network/
      domain/ application/ infrastructure/ ui/ tests/ index.ts
    cctv-maps/
      domain/ application/ infrastructure/ ui/ tests/ index.ts
    cctv-cost/
      domain/ application/ infrastructure/ ui/ tests/ index.ts
    cctv-agent/
      domain/ application/ infrastructure/ ui/ tests/ index.ts
  shared/               # product catalog adapter, contracts, geometry utilities, persistence primitives
  routes/               # thin adapters to existing URLs
```

## Current source-to-module mapping (verified from main and develop)
- `CctvProjectEditorV2.tsx` currently combines module selection, persistence, layouts and calculations. This is an interim shell and **has not yet been physically separated** into all five folders.
- `PlanCanvas.tsx`, `wall-editor.ts`, `floorplan-image.ts`, `normalized-layouts.ts`, `geometry.ts`, `deployment.ts` -> CCTV system.
- `topology.ts`, `TopologyWorkspace.tsx` -> CCTV network.
- `site-map.ts`, `MapWorkspace.tsx` -> CCTV maps.
- `boq.ts`, `offer-pdf.ts`, existing offer panel -> CCTV cost.
- `AgentPanel.tsx`, `AutoDesignPanel.tsx`, `auto-design.ts` and agent service -> CCTV agent.
- `catalog.ts`, `product-catalog.ts`, Supabase client, authentication -> shared data/infrastructure (not separate modules).

## UI navigation
Exactly five project workspace tabs, in this fixed order:
**CCTV system → CCTV network → CCTV maps → CCTV cost → CCTV agent**.
Internal drawers, dialogs and sub-tabs are allowed within those five sections. They do not add modules.

## Implementation status
- Navigation updated on `develop` to display the five official tabs.
- Existing functional components remain present; no data tables deleted, and old project routes are retained.
- Physical source extraction, revised cross-module APIs, CI repair, and end-to-end acceptance have **not** yet been completed.
- Do not claim production readiness until CI, real Supabase persistence and first-project end-to-end workflows pass.

## Migration sequence (no expansion beyond five modules)
1. Repair CI and establish verified source baseline.
2. Extract shared workspace state/persistence while keeping current project schema and URL.
3. Extract CCTV system workflows with required calibration and smart wall editor tests.
4. Extract CCTV network and CCTV maps with consistent shared IDs.
5. Extract CCTV cost, reconcile quantities once across all modules.
6. Extract CCTV agent, ensuring proposal/approval separation.
7. Verify end-to-end creation/save/reopen/design/network/map/cost/agent paths; staging and production rollout only when validated.
