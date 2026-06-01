import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// --- 1. FIREBASE ADMIN CONFIGURATION ---
if (admin.apps.length === 0) {
  let serviceAccountKey;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccountKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e: any) {
      console.error("Error parseando FIREBASE_SERVICE_ACCOUNT env var:", e.message);
    }
  }

  if (!serviceAccountKey) {
    const serviceAccountPath = path.resolve(process.cwd(), '../scripts/config/serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      try {
        serviceAccountKey = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      } catch (e: any) {
        console.error("Error leyendo local serviceAccountKey.json:", e.message);
      }
    }
  }

  if (serviceAccountKey) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountKey)
    });
  } else {
    console.error("No se configuró FIREBASE_SERVICE_ACCOUNT ni serviceAccountKey.json para Firebase Admin");
  }
}

const db = admin.firestore();

// --- 2. CLIENT CONFIGURATION ---
const CLIENTS: Record<string, {
  name: string;
  clientId: string;
  clientSecret: string;
  centers: string[];
  internalEmail: string;
  ccaZone: string;
}> = {
  '48630': {
    name: 'HAMINOS',
    clientId: process.env.CTT_HAMINOS_CLIENT_ID || '',
    clientSecret: process.env.CTT_HAMINOS_CLIENT_SECRET || '',
    centers: ['4863000001'],
    internalEmail: 'incidenciashaminos@gmail.com',
    ccaZone: 'cca.z3@cttexpress.com'
  },
  '47352': {
    name: 'SNAPPY',
    clientId: process.env.CTT_SNAPPY_CLIENT_ID || '',
    clientSecret: process.env.CTT_SNAPPY_CLIENT_SECRET || '',
    centers: ['4735200001', '4735200002', '4735200003', '4735200004', '4735200005'],
    internalEmail: 'incidenciassnappyblue@gmail.com',
    ccaZone: 'cca.z3@cttexpress.com'
  },
  '47685': {
    name: 'MIESTERY',
    clientId: process.env.CTT_MIESTERY_CLIENT_ID || '',
    clientSecret: process.env.CTT_MIESTERY_CLIENT_SECRET || '',
    centers: ['4768500003'],
    internalEmail: 'incidenciasamzdiscounts01@gmail.com',
    ccaZone: 'cca.z3@cttexpress.com'
  },
  '45416': {
    name: 'KULTUDENDA',
    clientId: process.env.CTT_KULTUDENDA_CLIENT_ID || '',
    clientSecret: process.env.CTT_KULTUDENDA_CLIENT_SECRET || '',
    centers: ['4541600001', '4541600002'],
    internalEmail: 'incidenciaskulturdenda@gmail.com',
    ccaZone: 'cca.z2@cttexpress.com'
  }
};

const TERMINAL_CODES = new Set(['2000', '2100', '2300', '2310', '3000']);
const INCIDENT_CODES = new Set(['1600', '2400', '2600', '2700', '0600']);
const RESOLUTION_CODES = new Set(['1500', '2000', '2100']);

const TEMPLATES: Record<string, {
  subject: string | ((ped: string, seg: string) => string);
  body: ((ped: string, seg: string) => string);
}> = {
  pendiente: {
    subject: 'ALERTA PENDIENTE (0000)',
    body: (ped: string, seg: string) => `Hola, se ha detectado que el siguiente envío lleva más de 24 horas en estado 0000. Por favor, revisadlo.\nPEDIDO: - ${ped || seg}`
  },
  devolucion: {
    subject: (ped: string, seg: string) => `Devolución en proceso: ${ped || seg}`,
    body: (ped: string, seg: string) => `Hola, el siguiente pedido ha entrado en proceso de devolución. Iniciamos seguimiento manual.\nCÓDIGO: - ${seg}`
  },
  siniestro: {
    subject: (ped: string, seg: string) => `Apertura de siniestro: ${ped || seg}`,
    body: (ped: string, seg: string) => `Buenos días CTT, solicitamos la apertura oficial de expediente de siniestro por pérdida/daño para el envío:\nREFERENCIA: - ${seg}. Quedamos a la espera del número de expediente.`
  },
  segundo_intento: {
    subject: (ped: string, seg: string) => `Incidencia en el envío ${ped || seg}`,
    body: (ped: string, seg: string) => `Buenos días. Tras la incidencia en el primer intento, solicitamos automáticamente un segundo intento de reparto para el siguiente día hábil.\nEXPEDICIÓN: - ${seg}. Gracias.`
  },
  recogida_fallida: {
    subject: (ped: string, seg: string) => `Incidencia en el envío ${ped || seg}`,
    body: (ped: string, seg: string) => `Buenos días. Solicitamos que se reintente la recogida fallida del siguiente envío:\nEXPEDICIÓN: - ${seg}. Gracias.`
  },
  agilizar_transito: {
    subject: (ped: string, seg: string) => `Incidencia en el envío ${ped || seg}`,
    body: (ped: string, seg: string) => `Buenos días. El envío ${seg} lleva más de 24 horas en tránsito sin pasar a reparto. Solicitamos que salga a reparto el próximo día hábil. Gracias.`
  },
  agilizar_reparto: {
    subject: (ped: string, seg: string) => `Incidencia en el envío ${ped || seg}`,
    body: (ped: string, seg: string) => `Buenos días. El envío ${seg} lleva más de 24 horas en reparto sin entregarse. Solicitamos que sea sacado nuevamente a reparto hoy mismo. Gracias.`
  },
  punto_ctt: {
    subject: (ped: string, seg: string) => `Envío en punto CTT: ${ped || seg}`,
    body: (ped: string, seg: string) => `Buenos días. Necesitamos la dirección detallada del punto de recogida para el siguiente envío:\nEXPEDICIÓN: - ${seg}. Gracias de antemano.`
  },
  recogida_0030: {
    subject: (ped: string, seg: string) => `Incidencia en el envío ${ped || seg}`,
    body: (ped: string, seg: string) => `Buenos días. Solicitamos agilizar la recogida del siguiente envío que lleva más de 24 horas pendiente:\nLISTADO DE ENVÍOS: - ${seg}. Gracias.`
  }
};

// --- Helper Functions ---
function getFormattedDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function normalizeFecha(f: any): string {
  if (!f) return '';
  const s = String(f).replace(/"/g, '').substring(0, 10);
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-');
    return `${y}-${m}-${d}`;
  }
  return s;
}

// --- CTT Express API Calls ---
async function getAccessToken(clientId: string, clientSecret: string) {
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'urn:com:ctt-express:integration-clients:scopes:common/ALL');

  const res = await fetch('https://api.cttexpress.com/integrations/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  if (!res.ok) {
    throw new Error(`Error obteniendo token CTT: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function fetchShippingHistory(accessToken: string, shippingCode: string) {
  const url = `https://api.cttexpress.com/integrations-info/trf/item-history-api/history/${shippingCode}?view=APITRACK&showItems=true`;
  
  let retries = 3;
  while (retries > 0) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.status === 502 || res.status === 504) {
        console.warn(`Error de Gateway (${res.status}) en shipping ${shippingCode}. Reintentando...`);
        retries--;
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      if (!res.ok) {
        return { error: { message: `HTTP Error ${res.status}` } };
      }
      return await res.json();
    } catch (e: any) {
      console.warn(`Error en petición history para ${shippingCode}: ${e.message}. Reintentando...`);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  return { error: { message: "Excedidos reintentos máximos" } };
}

// --- SLA calculation ---
function calculateSLAFases(bultos: any[]) {
  const now = new Date();
  let manifest_hours = 0;
  let transit_hours = 0;
  let delivery_hours = 0;
  let stationary_hours = 0;
  let last_event_date: Date | null = null;

  let has_active_incident = false;
  let active_incident_code = null;

  bultos.forEach(b => {
    const historyStr = b.history || '';
    if (!historyStr) return;

    const lines = historyStr.split('\n');
    const events: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split(' | ');
      if (parts.length < 2) continue;
      
      const d = new Date(parts[0]);
      if (isNaN(d.getTime())) continue;

      const match = parts[1].match(/\[(\w+)\]/);
      const code = match ? match[1] : null;
      events.push({ date: d, code });
    }

    if (events.length === 0) return;

    // Encontrar el último de cada tipo y evaluar incidentes activos
    let lManifest: any = null;
    let lTransit: any = null;
    let lDelivery: any = null;
    let lStationary: any = null;
    let latest: any = null;
    let lastIncident: any = null;

    events.forEach(e => {
      if (!latest || e.date > latest.date) latest = e;
      
      if (['0000', '0030'].includes(e.code)) lManifest = e;
      if (['0900', '1000'].includes(e.code)) lTransit = e;
      if (['1200', '1500', '1600', '2400', '2600', '2700'].includes(e.code)) lDelivery = e;
      if (['1700', '1800'].includes(e.code)) lStationary = e;

      if (INCIDENT_CODES.has(e.code)) lastIncident = e.code;
      if (RESOLUTION_CODES.has(e.code)) lastIncident = null;
    });

    if (latest && (!last_event_date || latest.date > last_event_date)) {
      last_event_date = latest.date;
    }

    if (lastIncident) {
      has_active_incident = true;
      active_incident_code = lastIncident;
    }

    const diffNow = (d: Date | null) => d ? (now.getTime() - d.getTime()) / 3600000 : 0;
    if (lManifest) manifest_hours = Math.max(manifest_hours, diffNow(lManifest.date));
    if (lTransit) transit_hours = Math.max(transit_hours, diffNow(lTransit.date));
    if (lDelivery) delivery_hours = Math.max(delivery_hours, diffNow(lDelivery.date));
    if (lStationary) stationary_hours = Math.max(stationary_hours, diffNow(lStationary.date));
  });

  return {
    manifest_hours: Number(manifest_hours.toFixed(1)),
    transit_hours: Number(transit_hours.toFixed(1)),
    delivery_hours: Number(delivery_hours.toFixed(1)),
    stationary_hours: Number(stationary_hours.toFixed(1)),
    h_en_estado: last_event_date ? Number(((now.getTime() - (last_event_date as Date).getTime()) / 3600000).toFixed(1)) : 0,
    has_active_incident,
    active_incident_code
  };
}

// --- OpenAI API call ---
async function callOpenAI(historyText: string, precalculatedSLA: any) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY no configurada. Saltando análisis IA.");
    return null;
  }

  const systemPrompt = `Eres un auditor logístico de CTT Express. Analiza el historial y decide la acción correcta. RESPONDE SOLO CON JSON PURO, SIN MARKDOWN.

### FUENTE DE VERDAD
Lee el historial cronológicamente. Los valores precalculados ya están calculados en JS — ÚSALOS DIRECTAMENTE, NO los recalcules.

### VERIFICACIÓN EN ORDEN ESTRICTO

PASO 0 — ESTADOS TERMINALES (prioridad máxima):
¿El último evento de algún bulto es 2500, 2300 o 2310?
- 2500 → notification_type: "devolucion". FIN.
- 2300 → notification_type: "punto_ctt". FIN.
- 2310 → notification_type: "punto_ctt". FIN.
- 2100 → notification_type: "none", should_notify: false (entregado). FIN.
- 2000 → notification_type: "none", should_notify: false (entregado). FIN.

PASO 1 — INCIDENCIAS GRAVES (sin umbral de tiempo):
¿Existe en el historial algún evento 1006, 1008 o 1012?
- 1006 (daño) / 1008 (robo) / 1012 (extravío) → notification_type: "siniestro". FIN.

PASO 2 — INCIDENCIA ACTIVA (usa el campo precalculado, NO analices el historial):
¿has_active_incident es true?
- active_incident_code = 0600 → notification_type: "recogida_fallida". FIN.
- active_incident_code = 1600/2400/2600/2700 → notification_type: "segundo_intento". FIN.

PASO 3 — UMBRALES DE TIEMPO (Obligatorio, prevalece sobre el "sentido común"):
SI SE CUMPLE ALGUNA DE ESTAS CONDICIONES MATEMÁTICAS, APLICA INMEDIATAMENTE (Sin importar si el último estado suena normal, como un [1200] Delegación destino. Si supera el tiempo, ES una incidencia por retraso):
- manifest_hours > 24 y el último evento es 0000 → notification_type: "pendiente".
- manifest_hours > 24 y el último evento es 0030 → notification_type: "recogida_0030".
- transit_hours > 24 y NO existe ningún [1200] o [1500] en el historial → notification_type: "agilizar_transito".
- delivery_hours > 24 → notification_type: "agilizar_reparto". (Nota: Aplica aunque el envío solo esté en la delegación de destino [1200])
- stationary_hours > 24 → notification_type: "agilizar_reparto".
- Si absolutamente Ninguno supera su umbral → notification_type: "none".

### REGLAS ANTI-ALUCINACIÓN
- PROHIBIDO saltarse el Paso 3. Que un envío haya "llegado a la delegación" [1200] NO significa que esté bien si delivery_hours > 24.
- NUNCA afirmes un evento si su código no aparece textualmente en el historial.
- 71_INAT NO es una incidencia. Es gestión interna de CTT.
- Si should_notify es false → notification_type DEBE ser "none".
- Si should_notify es true → notification_type NUNCA puede ser "none".

### SALIDA JSON (ÚNICO FORMATO VÁLIDO)
{
  "analysis": {
    "ultimo_estado": "código del último evento del bulto más relevante",
    "item_afectado": "item_code del bulto con la incidencia, o null",
    "justificacion": "explicación del paso seguido y por qué. Especifica siempre qué condición de tiempo se cumplió si aplica."
  },
  "decision": {
    "is_incident": boolean,
    "should_notify": boolean,
    "notification_type": "none|pendiente|devolucion|siniestro|segundo_intento|recogida_fallida|agilizar_transito|agilizar_reparto|punto_ctt|recogida_0030"
  }
}`;

  const userContent = `Envío: ${precalculatedSLA.shipping_code}
Referencia cliente: ${precalculatedSLA.client_references[0] || 'sin-ref'}
Cliente: ${precalculatedSLA.client_name}
Fecha/hora actual: ${getFormattedDate().substring(0, 16)}

--- VALORES PRECALCULADOS (USA ESTOS DIRECTAMENTE, NO RECALCULES) ---
Horas en grabación/pendiente (0000/0030): ${precalculatedSLA.manifest_hours}
Horas en tránsito (0900/1000): ${precalculatedSLA.transit_hours}
Horas en reparto (1200/1500): ${precalculatedSLA.delivery_hours}
Horas estacionado (1700/1800): ${precalculatedSLA.stationary_hours}
Incidencia activa (1600/2400/2600/2700/0600 sin resolución posterior): ${precalculatedSLA.has_active_incident}
Código de incidencia activa: ${precalculatedSLA.active_incident_code || 'ninguna'}

--- HISTORIALES DE BULTOS ---
${historyText}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!res.ok) {
      console.error(`Error llamando a OpenAI: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    return JSON.parse(text);
  } catch (e: any) {
    console.error("Excepción en llamada a OpenAI:", e.message);
    return null;
  }
}

// --- API Route Handler ---
export async function POST(req: Request) {
  try {
    const { shipping_code, client_code } = await req.json();

    if (!shipping_code || !client_code) {
      return NextResponse.json({ success: false, error: "Faltan parámetros requeridos (shipping_code, client_code)" }, { status: 400 });
    }

    const clientMeta = CLIENTS[client_code];
    if (!clientMeta) {
      return NextResponse.json({ success: false, error: `Cliente no soportado: ${client_code}` }, { status: 400 });
    }

    console.log(`[TEST_REFRESH] Refrescando envío ${shipping_code} para cliente ${clientMeta.name}...`);

    // A. Obtener token de acceso para CTT Express
    let accessToken;
    try {
      accessToken = await getAccessToken(clientMeta.clientId, clientMeta.clientSecret);
    } catch (err: any) {
      console.error(`Error de autenticación CTT para ${clientMeta.name}:`, err.message);
      return NextResponse.json({ success: false, error: `Error autenticando con CTT Express: ${err.message}` }, { status: 500 });
    }

    // B. Buscar documento previo en Firestore para recuperar metadatos
    let existingData: any = null;
    const searchCollections = ["incidencias_test", "ejecuciones_test", "incidencias", "ejecuciones"];
    for (const colName of searchCollections) {
      try {
        const docRef = db.collection(colName).doc(shipping_code);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          existingData = docSnap.data();
          break;
        }
      } catch (e) {
        // Ignorar errores de lectura
      }
    }

    // C. Consultar historial en CTT Express (showItems=true para traer todos los bultos)
    const histData = await fetchShippingHistory(accessToken, shipping_code);
    if (histData.error) {
      return NextResponse.json({ success: false, error: `Error leyendo historial de CTT: ${histData.error.message}` }, { status: 502 });
    }

    // D. Procesar bultos y formatear historiales
    let rawData = histData?.data?.shipping_history || histData?.data?.items_raw || [];
    const items = Array.isArray(rawData) ? rawData : (rawData && typeof rawData === 'object' ? [rawData] : []);

    if (items.length === 0) {
      items.push({
        item_code: shipping_code + '001',
        events: []
      });
    }

    const bultos: any[] = [];
    const MAX_EVENTS = 20;

    items.forEach((it: any) => {
      const itemCode = it.item_code || shipping_code;
      const rawEvents = it.events || (Array.isArray(it) ? it : []);
      
      const events = rawEvents.length <= MAX_EVENTS
        ? rawEvents
        : [rawEvents[0], ...rawEvents.slice(-(MAX_EVENTS - 1))];

      const lines: string[] = [];
      let latestEvent: any = null;

      events.forEach((e: any) => {
        const raw_date = e.event_date || e.item_event_date || '';
        const date = raw_date ? raw_date.substring(0, 16).replace('T', ' ') : '????-??-?? ??:??';
        
        if (!latestEvent || raw_date > (latestEvent.event_date || latestEvent.item_event_date || '')) {
          latestEvent = e;
        }

        const code = e.code || e.event_code || '????';
        const desc = e.description || e.event_description || '';
        const detailRaw = (e.detail && e.detail.External_event_text) ? e.detail.External_event_text : ((e.detail && e.detail.item_event_text) ? e.detail.item_event_text : '');
        const cleanDetail = (detailRaw && detailRaw !== 'null' && detailRaw !== 'undefined') ? ' - ' + detailRaw : '';
        lines.push(`${date} | [${code}] ${desc}${cleanDetail}`);
      });

      bultos.push({
        item_code: itemCode,
        history: lines.join('\n'),
        shipping_status_code: latestEvent ? String(latestEvent.code || latestEvent.event_code || '') : ''
      });
    });

    bultos.sort((a, b) => a.item_code < b.item_code ? -1 : 1);

    // E. Calcular SLA Fases
    const sla = calculateSLAFases(bultos);

    // F. Preparar contexto para OpenAI
    const clientReferences = existingData?.client_references || (existingData?.numero_pedido ? [existingData.numero_pedido] : ['sin-ref']);
    const precalculatedSLA = {
      shipping_code,
      client_references: clientReferences,
      client_name: clientMeta.name,
      manifest_hours: sla.manifest_hours,
      transit_hours: sla.transit_hours,
      delivery_hours: sla.delivery_hours,
      stationary_hours: sla.stationary_hours,
      has_active_incident: sla.has_active_incident,
      active_incident_code: sla.active_incident_code
    };

    const formatted_history = bultos.map(b => `Item: ${b.item_code}\n${b.history}`).join('\n\n---\n\n');
    const bultos_raw = JSON.stringify(bultos);

    // G. Evaluar con OpenAI
    let aiResponse = await callOpenAI(formatted_history, precalculatedSLA);
    
    let is_incident = aiResponse?.decision?.is_incident === true;
    let should_notify = aiResponse?.decision?.should_notify === true;
    let notification_type = aiResponse?.decision?.notification_type || 'none';
    let ai_justification = aiResponse?.analysis?.justificacion || 'Análisis IA completado';
    let affected_bulto = aiResponse?.analysis?.item_afectado || null;

    // H. Overrides matemáticos de SLA
    let estado_actual = String(bultos[0] ? bultos[0].shipping_status_code : '').replace(/["']/g, '').trim();
    
    const isManifest = estado_actual === '0000' || estado_actual === '0030';
    const isTransit = estado_actual === '0900' || estado_actual === '1000';
    const isDelivery = ['1200', '1500', '1600', '2400', '2600', '2700'].includes(estado_actual);
    const isStationary = estado_actual === '1700' || estado_actual === '1800';
    const is2500 = estado_actual === '2500';
    const is71INAT = estado_actual === '71_INAT';

    const stateIsStillProblematic = isDelivery || isStationary || is2500 || is71INAT || sla.has_active_incident;

    // For manual refresh, we assume force_internal holds true if state is still problematic
    const force_internal = stateIsStillProblematic;

    const breachedSLA =
      (force_internal && stateIsStillProblematic) ||
      sla.has_active_incident ||
      (isManifest && sla.manifest_hours > 24) ||
      (isTransit && sla.transit_hours > 24) ||
      (isDelivery && sla.delivery_hours > 24) ||
      (isStationary && sla.stationary_hours > 24) ||
      is71INAT;

    if (breachedSLA) {
      is_incident = true;
      should_notify = true;
      if (notification_type === 'none') {
        if (sla.has_active_incident) {
          const ac = sla.active_incident_code;
          notification_type = ac === '0600' ? 'recogida_fallida' : 'segundo_intento';
        } else if (isManifest) {
          notification_type = estado_actual === '0030' ? 'recogida_0030' : 'pendiente';
        } else if (isTransit) {
          notification_type = 'agilizar_transito';
        } else if (is2500) {
          notification_type = 'devolucion';
        } else if (is71INAT || isDelivery || isStationary) {
          notification_type = 'agilizar_reparto';
        }
      }
    }

    // I. Formatear Asunto y Cuerpo del email de prueba (Mocked)
    let target_type = 'none';
    let asunto = '';
    let cuerpo = '';
    let destinatario = '';

    const ped = clientReferences[0] || '';
    const seg = shipping_code;

    // Recuperar avisos previos
    let numero_avisos = existingData?.numero_avisos || 0;

    const getAsunto = (tpl: any, ped: string, seg: string) => {
      return typeof tpl.subject === 'function' ? tpl.subject(ped, seg) : tpl.subject;
    };
    const getCuerpo = (tpl: any, ped: string, seg: string) => {
      return typeof tpl.body === 'function' ? tpl.body(ped, seg) : tpl.body;
    };

    if (should_notify && notification_type !== 'none') {
      const cat = notification_type.toLowerCase();
      let tpl = TEMPLATES[cat];
      
      if (!tpl) {
        // Fallback checks
        if (cat.includes('agilizar_reparto')) tpl = TEMPLATES.agilizar_reparto;
        else if (cat.includes('agilizar_transito')) tpl = TEMPLATES.agilizar_transito;
        else if (cat.includes('segundo_intento')) tpl = TEMPLATES.segundo_intento;
        else if (cat.includes('punto_ctt')) tpl = TEMPLATES.punto_ctt;
        else if (cat.includes('recogida_fallida')) tpl = TEMPLATES.recogida_fallida;
        else if (cat.includes('pendiente')) tpl = TEMPLATES.pendiente;
        else if (cat.includes('recogida_0030')) tpl = TEMPLATES.recogida_0030;
        else if (cat.includes('devolucion')) tpl = TEMPLATES.devolucion;
        else if (cat.includes('siniestro')) tpl = TEMPLATES.siniestro;
      }

      if (tpl) {
        target_type = ['pendiente', 'devolucion', 'siniestro'].includes(notification_type) ? 'internal' : 'standard';
        asunto = getAsunto(tpl, ped, seg);
        cuerpo = getCuerpo(tpl, ped, seg);
      } else {
        target_type = 'internal';
        asunto = `Gestión Urgente: ${seg}`;
        cuerpo = `Hola, se requiere revisión manual para el envío ${seg}.\nJustificación: ${ai_justification}`;
      }

      numero_avisos += 1;

      // Reincidencia
      if (numero_avisos > 1 && target_type === 'standard') {
        target_type = 'internal';
        asunto = `[RE-INCIDENCIA] ${asunto}`;
        cuerpo = `Hola equipo, este envío ya fue notificado previamente y sigue en incidencia. Por favor, gestionad manualmente.\n\n${cuerpo}`;
      }

      // Destinatario
      if (target_type === 'internal') {
        destinatario = clientMeta.internalEmail;
      } else if (target_type === 'standard') {
        destinatario = clientMeta.ccaZone;
      }
    }

    if (should_notify && !asunto) {
      target_type = 'internal';
      asunto = `Gestión Urgente fallback: ${seg}`;
      cuerpo = `Hola, se requiere revisión manual para el envío ${seg}.\nJustificación: ${ai_justification}`;
      destinatario = clientMeta.internalEmail;
    }

    // J. Escribir resultados de prueba en Firestore (Colecciones de Test)
    const logData = {
      _docid: shipping_code,
      fecha_procesado: getFormattedDate(),
      numero_envio: shipping_code,
      numero_pedido: ped,
      tienda: clientMeta.name,
      centro: existingData?.centro || '',
      estado: estado_actual,
      fecha_estado: existingData?.fecha_estado || '',
      h_en_estado: sla.h_en_estado || 0,
      email_enviado: should_notify,
      tipo_email: target_type,
      razon: ai_justification,
      destinatario: destinatario,
      credencial: clientMeta.name,
      transit_hours: sla.transit_hours,
      delivery_hours: sla.delivery_hours,
      manifest_hours: sla.manifest_hours,
      stationary_hours: sla.stationary_hours,
      forzado_interno: force_internal,
      dano: (notification_type === 'siniestro' || estado_actual === '1006'),
      historial_formateado: formatted_history,
      asunto: asunto,
      cuerpo: cuerpo,
      bultos_historial_json: bultos_raw,
      is_test_run: true
    };

    // Grabación en colecciones de prueba
    await db.collection("ejecuciones_test").doc(shipping_code).set(logData);
    console.log(`[TEST_LOG] Grabado log de pruebas en ejecuciones_test para ${shipping_code}`);

    if (is_incident) {
      const incidenciaData = {
        ...logData,
        incidencia: asunto,
        numero_avisos: numero_avisos,
        shipping_code
      };
      await db.collection("incidencias_test").doc(shipping_code).set(incidenciaData);
      console.log(`[TEST_INCIDENCIA] Grabado log de pruebas en incidencias_test para ${shipping_code}`);
    } else {
      await db.collection("incidencias_test").doc(shipping_code).delete();
      console.log(`[TEST_INCIDENCIA] Eliminado de incidencias_test para ${shipping_code} (no es incidencia)`);
    }

    return NextResponse.json({
      success: true,
      message: "Refresco manual completado con éxito en entorno de pruebas",
      data: logData,
      is_incident
    });

  } catch (error: any) {
    console.error("Error en API refresh-tracking:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to refresh tracking" }, { status: 500 });
  }
}
