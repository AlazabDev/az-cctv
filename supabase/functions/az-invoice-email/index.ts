import nodemailer from "npm:nodemailer@9.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const env = (name: string) => Deno.env.get(name) || "";
const respond = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch,
  );
Deno.serve(async (req) => {
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || req.headers.get("authorization") !== "Bearer " + key)
    return respond({ error: "Unauthorized" }, 401);
  if (env("STORE_INVOICE_DELIVERY_ENABLED") !== "true")
    return respond({ error: "Delivery disabled" }, 503);
  let input: { order_id?: unknown };
  try {
    input = await req.json();
  } catch {
    return respond({ error: "Invalid JSON" }, 400);
  }
  if (typeof input.order_id !== "string" || !uuid.test(input.order_id))
    return respond({ error: "Invalid order ID" }, 400);
  const db = createClient(env("SUPABASE_URL"), key, { auth: { persistSession: false } });
  const { data: o, error } = await db
    .from("store_checkout_payments")
    .select(
      "id,status,invoice_status,customer_name,customer_email,invoice_access_token,daftra_invoice_number,amount,currency",
    )
    .eq("id", input.order_id)
    .maybeSingle();
  if (error || !o) return respond({ error: "Order not found" }, 404);
  if (o.status !== "paid" || o.invoice_status !== "confirmed" || !o.daftra_invoice_number)
    return respond({ error: "Invoice not confirmed" }, 409);
  if (!o.customer_email) return respond({ skipped: true, reason: "No email provided" });
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(o.customer_email))
    return respond({ error: "Invalid customer email" }, 409);
  if (o.email_status === "accepted") return respond({ existing: true, status: "accepted" });
  const host = env("SMTP_HOST"),
    configuredPort = Number(env("SMTP_PORT"));
  const port = host === "smtp.migadu.com" && configuredPort === 587 ? 465 : configuredPort;
  const username = env("SMTP_USERNAME"),
    password = env("SMTP_PASSWORD"),
    from = env("SMTP_FROM_EMAIL"),
    fromName = env("SMTP_FROM_NAME") || "AZ-CCTV";
  if (
    !host ||
    !username ||
    !password ||
    !from ||
    !Number.isSafeInteger(port) ||
    port === 25 ||
    port === 587
  )
    return respond({ error: "SMTP transport not supported in Edge runtime" }, 503);
  const { data: job, error: reserveError } = await db
    .from("store_invoice_jobs")
    .insert({ checkout_id: o.id, kind: "email", status: "reserved" })
    .select("id")
    .maybeSingle();
  if (reserveError || !job)
    return respond({ error: "Existing email attempt requires reconciliation" }, 409);
  const link = "https://cctv.alazab.com/invoice/" + o.invoice_access_token;
  const displayAmount = Number(o.amount).toFixed(2) + " " + o.currency;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: username, pass: password },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 15000,
    requireTLS: port !== 465,
  });
  const html = `<div dir="rtl" lang="ar" style="font-family:Arial,sans-serif;line-height:1.9"><div style="border-bottom:5px solid #FFB900;padding:16px;background:#030957;color:white"><h2>AZ-CCTV | العزب</h2></div><h3>فاتورة شراء ${escapeHtml(String(o.daftra_invoice_number))}</h3><p>مرحبًا ${escapeHtml(String(o.customer_name))}،</p><p>تم تأكيد الدفع وإصدار فاتورتك الرسمية من دفترة.</p><p><b>المبلغ المدفوع:</b> ${escapeHtml(displayAmount)}</p><p><a href="${link}" style="background:#FFB900;padding:12px 18px;color:#030957;text-decoration:none;font-weight:bold">عرض الفاتورة وطباعتها PDF</a></p><p>شكرًا لثقتكم بنا.</p></div>`;
  try {
    const result = await transport.sendMail({
      from: { name: fromName, address: from },
      to: o.customer_email,
      subject: `فاتورة AZ-CCTV رقم ${o.daftra_invoice_number}`,
      html,
      text: `تم إصدار فاتورتك رقم ${o.daftra_invoice_number}\nالمبلغ: ${displayAmount}\nرابط الفاتورة: ${link}`,
      headers: { "X-AZ-CCTV-Order": o.id },
    });
    if (
      !result.accepted?.some(
        (x: string) => x.toLowerCase() === String(o.customer_email).toLowerCase(),
      )
    )
      throw Error("SMTP recipient not accepted");
    await db
      .from("store_invoice_jobs")
      .update({
        status: "succeeded",
        external_id: result.messageId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await db.from("store_checkout_payments").update({ email_status: "accepted" }).eq("id", o.id);
    return respond({ accepted: true, message_id: result.messageId });
  } catch (e) {
    await db
      .from("store_invoice_jobs")
      .update({ status: "reconcile_required", error: String(e).slice(0, 350) })
      .eq("id", job.id);
    await db
      .from("store_checkout_payments")
      .update({ email_status: "reconcile_required" })
      .eq("id", o.id);
    return respond({ error: "Email delivery requires reconciliation" }, 502);
  } finally {
    transport.close();
  }
});
