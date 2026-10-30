import { createClient } from "npm:@supabase/supabase-js@2";

export const AMAZON_MARKETPLACE_EG = "ARBP9OOSHTCHU";
const storeOrigin = Deno.env.get("AZCCTV_PUBLIC_ORIGIN") || "https://cctv.alazab.com";
const isSandbox = Deno.env.get("SP_API_SANDBOX") !== "false";
const base = isSandbox ? "https://sandbox.sellingpartnerapi-eu.amazon.com" : "https://sellingpartnerapi-eu.amazon.com";
let tokenCache: { token: string; expiresAt: number } | null = null;
let tokenPending: Promise<string> | null = null;

export function amazonMarket() {
 const marketplace = Deno.env.get("SP_API_MARKETPLACE_ID") || AMAZON_MARKETPLACE_EG;
 if (marketplace !== AMAZON_MARKETPLACE_EG) {
  throw new Error("Invalid marketplace ID. Egypt is ARBP9OOSHTCHU. Review SP_API_MARKETPLACE_ID.");
 }
 return marketplace;
}
export function amazonSandbox() { return isSandbox; }
function client() {
 const url = Deno.env.get("SUPABASE_URL");
 const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if (!url || !key) throw new Error("Supabase server configuration is missing");
 return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
export function adminDb() { return client(); }
export async function requireAdmin(req: Request) {
 const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
 if (!token) throw new Error("AUTH_REQUIRED");
 const { data, error } = await client().auth.getUser(token);
 if (error || !data.user) throw new Error("AUTH_REQUIRED");
 const metadata = data.user.app_metadata || {};
 const permissions = Array.isArray(metadata.permissions) ? metadata.permissions : [];
 if (metadata.role !== "admin" && !permissions.includes("commerce:admin")) throw new Error("ADMIN_REQUIRED");
 return data.user;
}
async function refresh(): Promise<string> {
 const clientId = Deno.env.get("SP_API_CLIENT_ID");
 const clientSecret = Deno.env.get("SP_API_CLIENT_SECRET");
 const refreshToken = Deno.env.get("SP_API_REFRESH_TOKEN");
 if (!clientId || !clientSecret || !refreshToken) throw new Error("Amazon SP-API secrets not configured");
 const response = await fetch("https://api.amazon.com/auth/o2/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
  signal: AbortSignal.timeout(15000),
 });
 if (!response.ok) throw new Error("Amazon LWA token refresh rejected");
 const result = await response.json() as { access_token?: string; expires_in?: number };
 if (!result.access_token || !Number.isFinite(result.expires_in)) throw new Error("Amazon LWA response incomplete");
 tokenCache = { token: result.access_token, expiresAt: Date.now() + (result.expires_in || 3600)*1000 };
 return result.access_token;
}
export async function accessToken() {
 if (tokenCache && tokenCache.expiresAt > Date.now() + 90000) return tokenCache.token;
 if (!tokenPending) tokenPending = refresh().finally(() => { tokenPending = null; });
 return tokenPending;
}
export async function amazonRequest(path: string, init?: RequestInit) {
 if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Amazon API path");
 const token = await accessToken();
 const response = await fetch(base + path, {
  ...init, headers: { "Accept": "application/json", "x-amz-access-token": token, ...init?.headers },
  signal: AbortSignal.timeout(20000),
 });
 // Do not leak API payloads or authorization tokens into logs / public errors.
 if (!response.ok) throw new Error("Amazon SP-API request failed: HTTP " + response.status);
 return response.json();
}
const headersFor = (req: Request) => {
 const origin = req.headers.get("Origin");
 const allow = origin === storeOrigin ? origin : storeOrigin;
 return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info", "Vary": "Origin", "Cache-Control": "no-store", "Content-Type": "application/json" };
};
export const reply = (req: Request, data: unknown, status=200) => new Response(JSON.stringify(data), { status, headers: headersFor(req) });
export async function serveAdmin(req: Request, handler: () => Promise<unknown>) {
 if (req.method === "OPTIONS") return new Response(null,{status:204,headers:headersFor(req)});
 if (req.method !== "POST") return reply(req,{error:"Method not allowed"},405);
 try { await requireAdmin(req); return reply(req,await handler()); }
 catch (error) {
  const message = error instanceof Error ? error.message : "Request failed";
  const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 502;
  return reply(req,{error:message},status);
 }
}
