/**
 * Helper para obtener un refresh_token de Gmail a partir de client_id + client_secret.
 * Uso:  node get-gmail-token.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Requisitos en el proyecto de Google Cloud del OAuth client:
 *  - Gmail API habilitada.
 *  - El OAuth client (tipo "Web") debe tener http://localhost autorizado como redirect URI,
 *    o usa el flujo "out-of-band" pegando el código manualmente (este script).
 *
 * Repite el proceso autenticándote con la CUENTA DE CADA CLIENTE (la que envía los emails).
 */
import { google } from "googleapis";
import readline from "node:readline";

const [, , clientId, clientSecret] = process.argv;
if (!clientId || !clientSecret) {
  console.error("Uso: node get-gmail-token.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

// urn:ietf:wg:oauth:2.0:oob está deprecado; usamos localhost copia-pega del code.
const REDIRECT = "http://localhost";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose", // crear drafts
];

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
const url = oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

console.log("\n1) Abre esta URL e inicia sesión con la cuenta del CLIENTE:\n");
console.log(url);
console.log(
  "\n2) Tras aceptar, el navegador irá a http://localhost/?code=XXXX (dará error de conexión: es normal).",
);
console.log("   Copia el valor de 'code=' de la barra de direcciones y pégalo aquí.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Código: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2.getToken(decodeURIComponent(code.trim()));
    if (!tokens.refresh_token) {
      console.error("\n⚠️ No vino refresh_token. Revoca el acceso en https://myaccount.google.com/permissions y reintenta (necesita prompt=consent).");
      process.exit(1);
    }
    console.log("\n✅ REFRESH_TOKEN:\n");
    console.log(tokens.refresh_token);
    console.log("\nGuárdalo como secreto GMAIL_<CLIENTE>_REFRESH_TOKEN.");
  } catch (e) {
    console.error("Error intercambiando el code:", e.message);
    process.exit(1);
  }
});
