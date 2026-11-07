import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return reply({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL"),
    anon = Deno.env.get("SUPABASE_ANON_KEY"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !secret) return reply({ error: "Server configuration unavailable" }, 503);
  try {
    const authDb = createClient(url, anon, { auth: { persistSession: false } });
    const {
      data: { user },
      error: authErr,
    } = await authDb.auth.getUser(bearer);
    if (authErr || !user) return reply({ error: "Unauthorized" }, 401);
    const roles = user.app_metadata || {};
    if (roles.role !== "admin" && roles.role !== "super_admin" && roles.is_admin !== true)
      return reply({ error: "Administrator access required" }, 403);
    const db = createClient(url, secret, { auth: { persistSession: false } });
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const [quotes, checkouts] = await Promise.all([
      db
        .from("store_daftra_documents")
        .select(
          "id,quotation_id,daftra_id,daftra_number,status,created_at,store_quotations(customer_name,customer_phone,customer_email,total,currency)",
        )
        .eq("kind", "invoice")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("store_checkout_payments")
        .select(
          "id,customer_name,customer_phone,customer_email,amount,currency,daftra_invoice_id,daftra_invoice_number,invoice_status,invoice_issued_at,invoice_access_token",
        )
        .eq("status", "paid")
        .eq("invoice_status", "confirmed")
        .gte("invoice_issued_at", since)
        .order("invoice_issued_at", { ascending: false })
        .limit(500),
    ]);
    if (quotes.error || checkouts.error) return reply({ error: "Unable to load invoices" }, 500);
    const storeInvoices = (checkouts.data || []).map((x) => ({
      id: x.id,
      quotation_id: x.id,
      daftra_id: x.daftra_invoice_id,
      daftra_number: x.daftra_invoice_number,
      status: x.invoice_status,
      created_at: x.invoice_issued_at,
      store_quotations: {
        customer_name: x.customer_name,
        customer_phone: x.customer_phone,
        customer_email: x.customer_email,
        total: x.amount,
        currency: x.currency,
      },
    }));
    const invoices = [...(quotes.data || []), ...storeInvoices]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 500);
    return reply({ invoices, window_hours: 6, generated_at: new Date().toISOString(), limit: 500 });
  } catch {
    return reply({ error: "Internal server error" }, 500);
  }
});
