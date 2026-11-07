import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const env = (s: string) => Deno.env.get(s) || "";
const respond = (s: number, v: unknown) =>
  new Response(JSON.stringify(v), {
    status: s,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const equal = (a: string, b: string) => {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
};
async function issueInvoice(orderId: string, url: string, role: string) {
  try {
    const r = await fetch(url + "/functions/v1/az-invoice-finalize", {
      method: "POST",
      headers: { authorization: "Bearer " + role, "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId }),
      signal: AbortSignal.timeout(90000),
    });
    const output = await r.json().catch(() => ({ error: "Invalid invoice processor response" }));
    return { invoice_started: r.ok, invoice_result: output };
  } catch {
    return { invoice_started: false, invoice_result: { error: "Invoice processor unavailable" } };
  }
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });
  const signature = req.headers.get("signature") || "";
  if (!/^[a-f0-9]{64}$/i.test(signature))
    return respond(401, { error: "Missing or invalid signature" });
  const secret = env("PAYTABS_SERVER_KEY"),
    base = env("PAYTABS_API_BASE_URL"),
    profile = Number(env("PAYTABS_PROFILE_ID")),
    url = env("SUPABASE_URL"),
    role = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !base || !profile || !url || !role)
    return respond(503, { error: "Not configured" });
  const raw = await req.text();
  if (raw.length > 50000) return respond(413, { error: "Payload too large" });
  const mac = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    new TextEncoder().encode(raw),
  );
  const calculated = Array.from(new Uint8Array(mac))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  if (!equal(calculated, signature.toLowerCase()))
    return respond(401, { error: "Invalid signature" });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return respond(400, { error: "Invalid payload" });
  }
  const cartId = String(data.cart_id || ""),
    tranRef = String(data.tran_ref || "");
  if (!/^[a-f0-9-]{36}$/i.test(cartId) || !tranRef)
    return respond(400, { error: "Missing transaction reference" });
  const db = createClient(url, role, { auth: { persistSession: false } });
  const { data: order, error } = await db
    .from("store_checkout_payments")
    .select("id,amount,currency,status,tran_ref")
    .eq("id", cartId)
    .maybeSingle();
  if (error || !order) return respond(404, { error: "Unknown order" });
  if (order.tran_ref && order.tran_ref !== tranRef)
    return respond(409, { error: "Transaction reference mismatch" });
  let target: URL;
  try {
    target = new URL(base);
    if (
      target.protocol !== "https:" ||
      !/^secure(?:-egypt)?\.paytabs\.(?:com|sa)$/.test(target.hostname)
    )
      throw Error();
  } catch {
    return respond(503, { error: "Invalid gateway host" });
  }
  let verified: Record<string, unknown>;
  try {
    const r = await fetch(new URL("/payment/query", target), {
      method: "POST",
      headers: { authorization: secret, "content-type": "application/json" },
      body: JSON.stringify({ profile_id: profile, tran_ref: tranRef }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return respond(503, { error: "Transaction recheck unavailable" });
    verified = await r.json();
  } catch {
    return respond(503, { error: "Transaction recheck unavailable" });
  }
  const result = verified.payment_result as Record<string, unknown> | undefined;
  const verifiedCart = String(verified.cart_id || "");
  const amount = Number(verified.cart_amount);
  const currency = String(verified.cart_currency || "");
  if (
    verifiedCart !== cartId ||
    currency !== order.currency ||
    !Number.isFinite(amount) ||
    Math.round(amount * 100) !== Math.round(Number(order.amount) * 100) ||
    String(verified.tran_ref || "") !== tranRef
  ) {
    await db
      .from("store_checkout_payments")
      .update({
        status: "needs_review",
        last_error: "Payment data mismatch",
        updated_at: new Date().toISOString(),
      })
      .eq("id", cartId)
      .neq("status", "paid");
    return respond(409, { error: "Transaction mismatch" });
  }
  const approved =
    result?.response_status === "A" && String(verified.tran_type || "").toLowerCase() === "sale";
  if (order.status === "paid")
    return respond(200, { ok: true, duplicate: true, ...(await issueInvoice(cartId, url, role)) });
  if (approved) {
    const { error: upErr } = await db
      .from("store_checkout_payments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        tran_ref: tranRef,
        paytabs_payload: { tran_ref: tranRef, response_status: "A" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", cartId)
      .in("status", ["initiating", "pending", "needs_review"]);
    if (upErr) return respond(503, { error: "Cannot persist payment" });
    return respond(200, { ok: true, paid: true, ...(await issueInvoice(cartId, url, role)) });
  }
  await db
    .from("store_checkout_payments")
    .update({
      status: "failed",
      tran_ref: tranRef,
      paytabs_payload: {
        tran_ref: tranRef,
        response_status: String(result?.response_status || ""),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", cartId)
    .in("status", ["initiating", "pending"]);
  return respond(200, { ok: true, paid: false });
});
