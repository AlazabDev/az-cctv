# AZ-CCTV — Modular Architecture Blueprint
**Version:** 1.0 (design specification)  
**Date:** 2026-10-24  
**Reference:** verified `main` source tree (`CctvProjectEditorV2.tsx`, `PlanCanvas.tsx`, `normalized-layouts.ts`, `boq.ts`, `product-catalog.ts`, `topology.ts`).  
**Status:** Architecture proposed and documented; runtime code has not yet been refactored.

## Principles
1. Modular monolith, NOT microservices. One deployable React/TanStack app with typed internal contracts. Supabase stays the persistence provider.
2. Modules own business logic, UI, tests and external-data adapters. They cannot import another module's internal files; interact through exported public APIs.
3. Shared kernel is intentionally small: UUID identifiers, SI units, error/result contracts, event envelope, auth context and geometrical primitives. Business rules remain in modules.
4. Product master is exclusively `public.products`; project placements hold product UUID and approved optical snapshot.
5. One canonical project identity, one authoritative saved layout, no duplicative writes. Legacy `cctv_projects.data` remains read-compatible during migration.
6. Save/version operations are serialized and revision-checked. No silent overwriting of newer revisions, no accidental change to persisted geometry after product updates.
7. Every output is derived from a pinned revision of the project and indicates its provenance and validation state.
8. Arabic-first user experience, screen-readable status, deterministic tests, editable design canvas and predictable mouse gestures.
9. No module is labelled complete from file existence; CI and browser acceptance determine release readiness.

## Functional modules
| ID | Name | Owns | Existing implementation |
|---|---|---|---|
| M01 | Projects | clients, project lifecycle, memberships | `src/routes/_authenticated/projects.tsx` |
| M02 | Sites & Layouts | site metadata, floorplans, height, calibration, layout revisions | `normalized-layouts.ts`, `floorplan-image.ts` |
| M03 | Plan & Walls | CAD interaction, walls, openings, snapping, canvas history | `PlanCanvas.tsx`, `wall-editor.ts` |
| M04 | Camera Placement | product placement, camera aim, lens setting, verified optical snapshot | editor, `deployment.ts` |
| M05 | DORI & 3D | FOV projections, PPM/DORI, occlusion, 3D camera frustum | `geometry.ts`, `CameraDeploymentDiagram.tsx` |
| M06 | Map Design | outdoor/site map, coordinates, outdoor placements | `MapWorkspace.tsx`, `site-map.ts` |
| M07 | Product Catalog | SKU product master adapter, datasheet evidence, optical profiles | `product-catalog.ts`, `catalog.ts` |
| M08 | Network Topology | NVR, switch, PoE, ports, links, cables, validation | `topology.ts`, `TopologyWorkspace.tsx` |
| M09 | BOQ & Costing | material takeoff, deduplication, quantities, costing and price snapshots | `boq.ts`, Offer UI |
| M10 | Documents & Reports | versioned drawings, camera sheets, BOM/offer PDF, audit output | `offer-pdf.ts` |
| M11 | Design Agent | proposed changes, review/accept/reject, explainable constraints | `auto-design.ts`, `AgentPanel.tsx` |
| M12 | Commissioning | site installation, actual camera settings, checks, sign-off, as-built | NEW; not implemented |

## Code layout (target)
```
src/
  app/
    router/
    shell/
    providers/
  modules/
    projects/
    sites-layouts/
    plan-walls/
    camera-placement/
    dori-3d/
    map-design/
    product-catalog/
    network-topology/
    boq-costing/
    documents-reports/
    design-agent/
    commissioning/
  shared/
    kernel/
      ids.ts
      units.ts
      result.ts
      events.ts
    infrastructure/
      supabase/
      auth/
      logging/
      storage/
    ui/
      primitives/
      layout/
  routes/               # thin route adapters only
```
Each module: `index.ts` public API; `domain/` pure rules; `application/` commands/queries; `infrastructure/` Supabase and adapters; `ui/` views; `tests/` integration + unit.

## Dependency / ownership rules
- M07 Product Catalog publishes `getProductById`, `getVerifiedOptics`, `getProductRevision`; neither canvas nor DORI invents specs.
- M02 owns calibration and the authoritative `layoutId`, `pxPerMeter` and `ceilingHeightM` metadata.
- M03 owns walls, geometry edits, pointer gestures, history; M05 consumes immutable room/wall geometry snapshots for occlusion.
- M04 owns `PlacedCamera` and optical snapshot; M05 consumes camera optical placement and returns coverage as a pure calculation.
- M08 consumes immutable layout device positions; outputs links, power/port findings and measured cable runs.
- M09 consumes product identities, pinned prices and geometry/topology takeoff; it must not mutate source models.
- M10 consumes a frozen `ProjectRevisionSnapshot` and produces documents with project revision and validation metadata.
- M11 ONLY proposes patches, reviewed by user before applying through application commands.
- M12 compares actual on-site values with the approved design revision; deviations create a change record, not overwrite baseline.
- Routes cannot query Supabase directly; each route imports the relevant module public API or composed ProjectWorkspace.

## Shared contracts (target, not yet implemented)
```ts
type ProjectRevisionId = string;
type ModuleId =
  | "projects" | "sites-layouts" | "plan-walls" | "camera-placement"
  | "dori-3d" | "map-design" | "product-catalog" | "network-topology"
  | "boq-costing" | "documents-reports" | "design-agent" | "commissioning";

interface EngineeringSnapshot {
  projectId: string;
  revisionId: ProjectRevisionId;
  layoutIds: string[];
  productRevisionIds: string[];
  approvalStatus: "draft" | "review" | "approved" | "as-built";
}
```

## UI shell
- Global sidebar: Projects, Sites, Design, Hardware & Network, Outputs, Operations.
- Project workspace tabs: Plan / Cameras / 3D-DORI / Map / Topology / BOQ / Documents / Commissioning.
- Shared header: project, site, revision, save-state, validation status, export.
- Shared inspector selection: selected wall, camera, port or cable. Selection is UI state, not duplicated persisted data.
- Per-module status: Unconfigured / Draft / Needs review / Validated. Status never inferred solely from page existence.

## Extract from CctvProjectEditorV2.tsx incrementally
1. Pin a regression baseline. Fix CI (repo uses `pnpm-lock.yaml`, but major GitHub workflows use npm cache/install). Obtain passing types/build/tests.
2. Introduce `ProjectWorkspaceShell` and typed module registry without behavior changes; route remains same.
3. Extract `ProjectRepository` + centralized autosave controller; preserve legacy decoding and normalized layout migration. Test create/save/reload, multi-layout revisions, overlapping writes.
4. Extract M02 layout preparation/upload/calibration. Keep fixed upload-first calibrated workflow.
5. Extract M03 wall editor, pointer gestures and history; test right click detach, right drag pan, double-right exit, camera/cable behavior unaffected.
6. Extract M07 product adapter and M04 placement. Preserve optics snapshots; confirm focal-vs-FOV per manufacturer variant.
7. Move pure M05/M08 engines with tests and immutable input snapshots.
8. Extract M09 and M10 reporting; reconcile cross-layout cable takeoff and price revision.
9. Extract M06 and M11; enforce proposed-vs-approved changes.
10. Build M12 commissioning, then E2E verification and staging deployment.

## Required acceptance
- All CI jobs successful: setup, formatting, ESLint, TypeScript, unit/integration, production build.
- No data loss/duplication across project create, save, refresh, layout selection and reopening.
- Numerical consistency across plan / map / DORI / topology / BOQ.
- Real SKU, real manufacturer verified optics, lens setting selection, frozen approved values.
- Tested CAD pointer state machine, undo/redo, calibration invariants.
- Every generated report displays project version; trace to product IDs.
- RLS/authorization tested against the live Supabase schema (read/write boundaries).
- No user-visible regression from extraction; original project URLs remain valid.
- Production switch only after browser smoke + rollback plan.

## Current confirmed constraints
- On current main, `CctvProjectEditorV2.tsx` combines four module tabs, persistence, layouts and offer computation.
- `normalized-layouts.ts` manages `cctv_layouts`, but editor also stores layout projections within `cctv_projects.data`; decide a single authoritative write model before extraction.
- `boq.ts` currently imports catalog and topology, requiring a clear input contract rather than direct cross-module imports.
- The existing `roadmap.md` labels some phases closed despite recent CI failures; use tested acceptance state.
- Splitting files alone does NOT make the app production-ready.
