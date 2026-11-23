// Webhook servidor-a-servidor para integrar un banco/proveedor que confirme pagos QR.
// No verifica una captura de pantalla: requiere notificación auténtica del proveedor.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const secret = Deno.env.get("PAYMENT_WEBHOOK_SECRET") ?? "";
  const supplied = req.headers.get("x-payment-secret") ?? "";
  if (!secret || supplied.length !== secret.length || supplied !== secret) {
    return json({ error: "No autorizado" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const monto = Number(body.monto);
  const transactionId = String(body.transaction_id ?? "").trim();
  if (!Number.isFinite(monto) || monto <= 0 || monto > 1000000 ||
      !transactionId || transactionId.length > 120) {
    return json({ error: "Monto o identificador de transacción inválido" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Integración no configurada" }, 500);

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("pagos_recibidos").insert({
    monto: Math.round(monto * 100) / 100,
    transaction_id: transactionId,
    remitente: String(body.remitente ?? "").slice(0, 120),
    banco: String(body.banco ?? "").slice(0, 80),
    mensaje: String(body.mensaje ?? "").slice(0, 500)
  }).select("id,pedido_id").single();

  if (error?.code === "23505") return json({ error: "Transacción ya registrada" }, 409);
  if (error) return json({ error: "No se pudo registrar la notificación" }, 500);
  return json({ ok: true, payment_id: data.id, matched_order: data.pedido_id });
});

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-payment-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}
