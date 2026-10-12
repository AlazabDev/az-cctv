# AZ-CCTV Supabase Backend

Project ref: `jdnbtjplzbatowzbxqis`

This directory is the reproducible backend definition for AZ-CCTV. The database remains backward-compatible with the current single-plan `cctv_projects.data` model while introducing normalized multi-layout storage.

## Migration order

1. `0000_create_cctv_projects.sql`
   - profiles
   - cctv_projects
   - base RLS/storage policies
2. `0001_storage_hardening_agent.sql`
   - private `floorplans` bucket
   - owner immutability
   - project indexes
3. `0002_create_cctv_layouts.sql`
   - multi-layout backend
   - ceiling height / scale / source file metadata
   - geometry/design JSON documents
   - active-layout invariant
4. `0003_create_agent_schema.sql`
   - agent_threads
   - agent_messages
   - agent_design_proposals
   - owner-only RLS
   - layout-scoped proposals
5. `0004_layout_revisions_and_geometry_rpc.sql`
   - immutable layout revisions
   - `snapshot_cctv_layout()`
   - `approve_cctv_layout_geometry()`
6. `0005_backfill_legacy_projects_and_layout_rpc.sql`
   - non-destructive backfill from the existing single-plan JSON model
   - `activate_cctv_layout()`
   - `assert_layout_ready_for_design()`

## Core backend model

```text
cctv_projects
  └── cctv_layouts
        ├── cctv_layout_revisions
        ├── agent_threads
        │     └── agent_messages
        └── agent_design_proposals
```

`cctv_layouts.geometry` stores geometry-only data (`walls`, `boundary`, `openings`).
`cctv_layouts.design_data` stores design objects (`devices`, `cables`, `roomLabels`, display state).

The AI design agent must only execute against a layout for which:

- a floor plan exists;
- `px_per_meter > 0`;
- `ceiling_height_m > 0`;
- `geometry_status = 'approved'`.

Use `assert_layout_ready_for_design(layout_id)` as the server-side precondition.

## Storage convention

Keep the `floorplans` bucket private. New uploads should use:

```text
<user_id>/<project_id>/<layout_id>/<original-file-name>
```

The existing storage policy already validates the first folder against `auth.uid()`.

## Deploy

From the repository root:

```bash
supabase link --project-ref jdnbtjplzbatowzbxqis
supabase db push
supabase functions deploy az-agent
supabase functions deploy az-design-agent
```

For a clean local verification:

```bash
supabase db reset
supabase status
```

After applying migrations regenerate client types:

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

## Edge Function secrets

The browser must never receive these values. Configure them as Supabase Edge Function secrets:

```text
AZURE_API_KEY
AZURE_AGENT_ENDPOINT
AZURE_AGENT_NAME
AZURE_AGENT_VERSION
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the Supabase Edge Runtime.

## Compatibility

The migrations do not remove `cctv_projects.data` or `cctv_projects.floorplan_path`. Migration `0005` copies existing project plan data into the first layout only when the project has no layout yet. This allows the frontend to migrate to the normalized layout API incrementally without breaking existing projects.
