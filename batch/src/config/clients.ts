/**
 * Configuración por cliente CTT.
 *
 * SECRETOS: client_id / client_secret se leen de variables de entorno
 * (inyectadas desde Secret Manager en Cloud Run). Si no existen, cae al valor
 * hardcodeado SOLO para pruebas locales. ⚠️ Estos valores estuvieron en texto
 * plano en los workflows; conviene ROTARLOS al desplegar (ver MIGRACION §6).
 */

export interface ClientConfig {
  code: string;
  name: string;
  clientId: string;
  clientSecret: string;
  centers: string[];
  internalEmail: string;
  ccaZone: string;
  /** Nombre de la credencial Gmail (para resolver el OAuth token del cliente). */
  gmailCredentialName: string;
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const CLIENTS: Record<string, ClientConfig> = {
  "48630": {
    code: "48630",
    name: "HAMINOS",
    clientId: env("CTT_HAMINOS_CLIENT_ID", ""),
    clientSecret: env("CTT_HAMINOS_CLIENT_SECRET", ""),
    centers: ["4863000001"],
    internalEmail: "incidenciashaminos@gmail.com",
    ccaZone: "cca.z3@cttexpress.com",
    gmailCredentialName: "HAMINOS",
  },
  "47352": {
    code: "47352",
    name: "SNAPPY",
    clientId: env("CTT_SNAPPY_CLIENT_ID", ""),
    clientSecret: env("CTT_SNAPPY_CLIENT_SECRET", ""),
    centers: ["4735200001", "4735200002", "4735200003", "4735200004", "4735200005"],
    internalEmail: "incidenciassnappyblue@gmail.com",
    ccaZone: "cca.z3@cttexpress.com",
    gmailCredentialName: "SNAPPY",
  },
  "47685": {
    code: "47685",
    name: "MIESTERY",
    clientId: env("CTT_MIESTERY_CLIENT_ID", ""),
    clientSecret: env("CTT_MIESTERY_CLIENT_SECRET", ""),
    centers: ["4768500003"],
    internalEmail: "incidenciasamzdiscounts01@gmail.com",
    ccaZone: "cca.z3@cttexpress.com",
    gmailCredentialName: "MIESTERY / SERVICE CORP WORLD",
  },
  "45416": {
    code: "45416",
    name: "KULTUDENDA",
    clientId: env("CTT_KULTUDENDA_CLIENT_ID", ""),
    clientSecret: env("CTT_KULTUDENDA_CLIENT_SECRET", ""),
    centers: ["4541600001", "4541600002"],
    internalEmail: "incidenciaskulturdenda@gmail.com",
    ccaZone: "cca.z2@cttexpress.com",
    gmailCredentialName: "KULTURDENDA",
  },
};

export const ALL_CLIENTS = Object.values(CLIENTS);

/** Resuelve el cliente a partir de un client_center_code. */
export function clientFromCenter(centerCode: string): ClientConfig | null {
  for (const c of ALL_CLIENTS) if (c.centers.includes(centerCode)) return c;
  return null;
}
