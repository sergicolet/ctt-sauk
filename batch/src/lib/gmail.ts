/**
 * Envío de notificaciones por Gmail, por cuenta de cada cliente.
 * Espejo del "Switch: Email Routing" + nodos Gmail de main.json:
 *   - target_type = "standard" → drafts.create  (borrador a la cca_zone de CTT)
 *   - target_type = "internal" → messages.send  (email real al equipo interno)
 *
 * Credenciales por cliente vía env (inyectadas desde Secret Manager):
 *   GMAIL_<KEY>_CLIENT_ID
 *   GMAIL_<KEY>_CLIENT_SECRET
 *   GMAIL_<KEY>_REFRESH_TOKEN
 * donde <KEY> = HAMINOS | SNAPPY | MIESTERY | KULTUDENDA (ver clients.ts).
 *
 * Sin SEND_EMAILS=true NO se envía/crea nada (modo seguro por defecto).
 */

import { google } from "googleapis";
import type { ClientConfig } from "../config/clients.js";
import type { Decision } from "./decision.js";
import { log } from "./logger.js";

/** Clave de env por cliente (estable, no depende del nombre con espacios). */
const GMAIL_ENV_KEY: Record<string, string> = {
  "48630": "HAMINOS",
  "47352": "SNAPPY",
  "47685": "MIESTERY",
  "45416": "KULTUDENDA",
};

interface GmailCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

function getCreds(client: ClientConfig): GmailCreds | null {
  const key = GMAIL_ENV_KEY[client.code];
  if (!key) return null;
  const clientId = process.env[`GMAIL_${key}_CLIENT_ID`];
  const clientSecret = process.env[`GMAIL_${key}_CLIENT_SECRET`];
  const refreshToken = process.env[`GMAIL_${key}_REFRESH_TOKEN`];
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

/** Construye un Gmail API client autenticado para la cuenta del cliente. */
function gmailClient(creds: GmailCreds) {
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2.setCredentials({ refresh_token: creds.refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

/** Mensaje RFC822 → base64url (formato que pide la API de Gmail). */
function buildRaw(to: string, subject: string, body: string): string {
  // Subject codificado en UTF-8 (RFC 2047) para acentos.
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const lines = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type EmailOutcome = "draft" | "sent" | "skipped_flag" | "no_creds" | "error";

/**
 * Crea draft (standard) o envía (internal) según la decisión.
 * El cuerpo añade PEDIDO y BULTO AFECTADO igual que los nodos Gmail de n8n.
 */
export async function sendNotification(
  client: ClientConfig,
  decision: Decision,
  shippingCode: string,
): Promise<EmailOutcome> {
  if (decision.target_type === "none" || !decision.should_notify) return "skipped_flag";

  const sendEnabled = process.env.SEND_EMAILS === "true";
  if (!sendEnabled) {
    log.info("SEND_EMAILS!=true → no se envía/crea email", {
      shipping_code: shippingCode,
      client: client.name,
      target_type: decision.target_type,
    } as any);
    return "skipped_flag";
  }

  const creds = getCreds(client);
  if (!creds) {
    log.warn("Sin credenciales Gmail para el cliente", { client: client.name, shipping_code: shippingCode });
    return "no_creds";
  }

  const to = decision.destinatario;
  const subject = decision.asunto;
  const body = `${decision.cuerpo}\n\nPEDIDO: ${shippingCode}\nBULTO AFECTADO: ${decision.affected_bulto || "N/A"}`;
  const raw = buildRaw(to, subject, body);

  try {
    const gmail = gmailClient(creds);
    if (decision.target_type === "standard") {
      await gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } });
      log.info("Draft creado", { shipping_code: shippingCode, client: client.name, to } as any);
      return "draft";
    } else {
      await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      log.info("Email enviado", { shipping_code: shippingCode, client: client.name, to } as any);
      return "sent";
    }
  } catch (e) {
    log.error("Fallo Gmail", { shipping_code: shippingCode, client: client.name, razon: String(e) });
    return "error";
  }
}
