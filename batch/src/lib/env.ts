/**
 * Carga ligera de un archivo .env local (KEY=VALUE por línea) a process.env.
 * Sin dependencias. En Cloud Run no hay .env → no hace nada (las vars vienen
 * de Secret Manager). NO sobreescribe variables ya presentes en el entorno.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadEnv(): void {
  // Busca .env en la raíz del proyecto batch/ (dos niveles por encima de dist/lib).
  const candidates = [
    path.resolve(__dirname, "../../.env"), // ejecutando dist/lib/env.js
    path.resolve(process.cwd(), ".env"),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) return;

  const content = fs.readFileSync(file, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Quita comillas envolventes si las hay.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
