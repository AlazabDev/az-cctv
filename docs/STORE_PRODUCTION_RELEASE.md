# AZ-CCTV Store — Production Release Checklist

## Architecture
- One commercial source of truth: `public.products` (Supabase AZ-CCTV project `jdnbtjplzbatowzbxqis`).
- Public store routes: `/store`, `/product/:id`, `/category/cctv`, `/category/network`, `/compare`, `/cart`.
- Authenticated quote submission: `/quote`, using `public.submit_store_quotation` and PostgreSQL RLS. Browser prices are never trusted.
- Designer handoff: selected product IDs stored per browser session; the editor displays them for engineering review. **Automatic placement is intentionally not implemented** until product geometry and engineering classification are verified.
- Product feeds: `/store/feeds/google.xml`, `/store/feeds/meta.csv`, `/sitemap.xml`. Publish only products with confirmed source availability, primary image URL and price. Merchants must review these feeds before channel approval.
- Amazon functions (admin access only): `amazon-auth`, `amazon-search`, `amazon-pricing`, `amazon-create-order`. MCF disabled by default.

## Setup
1. Bring the latest `main` locally, preserving your uncommitted changes with a deliberate `git stash push -u`/pull/restore process.
2. Use Node >=22 and `pnpm install --frozen-lockfile` (or the version currently specified by `packageManager`). Do **not** commit `.env` / `.env.local`.
3. Configure only frontend-public Supabase URL and publishable key in `VITE_*` variables. Never expose Supabase service-role or Amazon LWA secrets in browser variables.
4. Set server-side `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for dynamic sitemap and feeds. Set `AZCCTV_PUBLIC_ORIGIN` to the deployed canonical origin.
5. Configure Amazon functions as Supabase Edge Function secrets: `SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET`, `SP_API_REFRESH_TOKEN`, `SP_API_MARKETPLACE_ID=ARBP9OOSHTCHU`, and **real seller ID only when known**. Use `SP_API_SANDBOX=true`. Do not enable `SP_API_MCF_ENABLED` until seller SKU and FBA inventory are confirmed.
6. Apply migrations `0009` through `0012` sequentially to target DB if missing. These were applied to AZ-CCTV production Supabase during development; confirm migration history rather than re-applying manually.
7. Run `pnpm exec tsc --noEmit`, `pnpm exec eslint .`, `pnpm build`, and project tests. Check GitHub Actions for all workflow results.
8. Smoke-test `/store`, `/product/<valid-id>`, `/category/cctv?page=1`, `/compare`, `/cart`, `/quote`, `/sitemap.xml`, and both feeds on the target deployed domain.
9. Perform an authenticated quotation test using a dedicated test account; verify matching quote plus items in DB, per-user RLS, and that anon cannot insert. Never create an MCF order for a smoke test.
10. Run an R2 object/HTTP audit for the `metadata.images` array; database references are **not** proof that images exist. Resolve unmatched images before enabling large paid acquisition campaigns.

## Current validation / release gates
- Frontend CI runs validate types, quality gates and a production build, but do **not** replace browser E2E.
- Amazon LWA was tested successfully **from the user's local PowerShell** (expires_in=3600), but server Edge Function secrets / SP-API seller permissions have **not** been validated end-to-end.
- `amazon-create-order` is deployed but hard-blocked without server-side feature flag; no live MCF workflow has been certified.
- No public purchase/payment flow is enabled. The quote workflow is separate from payment.
- Conversion events have an event-emission helper and a restricted database table, but **the event-ingestion/reporting pipeline is not yet deployed**.
- Product feed acceptance by Google Merchant Center / Meta Commerce Manager has not been confirmed.
- No production-domain browser E2E, Core Web Vitals or full R2 media audit has been confirmed.

## Release decision
A green CI build means **code is buildable**, not that the platform is ready for unrestricted public marketing or Amazon order execution. First complete the live smoke tests, image audit, merchant feed review and monitoring before any high-volume ad campaign.
