import admin from "firebase-admin";
import fs from "fs";

// --- 1. CONFIGURACIÓN DE FIREBASE ---
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error("Error parseando FIREBASE_SERVICE_ACCOUNT desde variable de entorno:", e.message);
    process.exit(1);
  }
} else {
  const serviceAccountPath = "./config/serviceAccountKey.json";
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  } else {
    console.error("No se encontró serviceAccountKey.json ni la variable FIREBASE_SERVICE_ACCOUNT");
    process.exit(1);
  }
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (e) {
  console.error("Error al inicializar Firebase Admin:", e.message);
}
const db = admin.firestore();

// --- 2. CONFIGURACIÓN DE CLIENTES CTT EXPRESS ---
const CLIENTS = {
  '48630': {
    name: 'HAMINOS',
    clientId: '6lmgulg22aneeht6tj0oqgd5nt',
    clientSecret: 'g84jnhse644ttjct97s1hkvth1ekbh8pupjpoue9ubmhmis77ll',
    centers: ['4863000001'],
    internalEmail: 'incidenciashaminos@gmail.com',
    ccaZone: 'cca.z3@cttexpress.com'
  },
  '47352': {
    name: 'SNAPPY',
    clientId: '21fmaj0ohg018vodhuf7cgdbqn',
    clientSecret: '6vrimoi7bftui40e63o3i2jhd9lqc6bcfuag2af6n35oov38oa1',
    centers: ['4735200001', '4735200002', '4735200003', '4735200004', '4735200005'],
    internalEmail: 'incidenciassnappyblue@gmail.com',
    ccaZone: 'cca.z3@cttexpress.com'
  },
  '47685': {
    name: 'MIESTERY',
    clientId: '3eg1spueen47l2jkcm0dt56olk',
    clientSecret: 'dmnoi2am8sdndpc1p905c2s5van5p110fik945t5q6pd5fkledk',
    centers: ['4768500003'],
    internalEmail: 'incidenciasamzdiscounts01@gmail.com',
    ccaZone: 'cca.z3@cttexpress.com'
  },
  '45416': {
    name: 'KULTUDENDA',
    clientId: '76m6rjgitmn2rdnpvenkngtf2',
    clientSecret: '145nub573diu45cleh7h3at6gkb6f91shoh9lv38q1djoi245loj',
    centers: ['4541600001', '4541600002'],
    internalEmail: 'incidenciaskulturdenda@gmail.com',
    ccaZone: 'cca.z2@cttexpress.com'
  }
};

const TERMINAL_CODES = new Set(['2000', '2100', '2300', '2310', '3000']);
const INCIDENT_CODES = new Set(['1600', '2400', '2600', '2700', '0600']);
const RESOLUTION_CODES = new Set(['1500', '2000', '2100']);

const TEMPLATES = {
  pendiente: {
    subject: 'ALERTA PENDIENTE (0000)',
    body: (ped, seg) => `Hola, se ha detectado que el siguiente envío lleva más de 24 horas en estado 0000. Por favor, revisadlo.\nPEDIDO: - ${ped || seg}`
  },
  devolucion: {
    subject: (ped, seg) => `Devolución en proceso: ${ped || seg}`,
    body: (seg) => `Hola, el siguiente pedido ha entrado en proceso de devolución. Iniciamos seguimiento manual.\nCÓDIGO: - ${seg}`
  },
  siniestro: {
    subject: (ped, seg) => `Apertura de siniestro: ${ped || seg}`,
    body: (seg) => `Buenos días CTT, solicitamos la apertura oficial de expediente de siniestro por pérdida/daño para el envío:\nREFERENCIA: - ${seg}. Quedamos a la espera del número de expediente.`
  },
  segundo_intento: {
    subject: (ped, seg) => `Incidencia en el envío ${ped || seg}`,
    body: (seg) => `Buenos días. Tras la incidencia en el primer intento, solicitamos automáticamente un segundo intento de reparto para el siguiente día hábil.\nEXPEDICIÓN: - ${seg}. Gracias.`
  },
  recogida_fallida: {
    subject: (ped, seg) => `Incidencia en el envío ${ped || seg}`,
    body: (seg) => `Buenos días. Solicitamos que se reintente la recogida fallida del siguiente envío:\nEXPEDICIÓN: - ${seg}. Gracias.`
  },
  agilizar_transito: {
    subject: (ped, seg) => `Incidencia en el envío ${ped || seg}`,
    body: (seg) => `Buenos días. El envío ${seg} lleva más de 24 horas en tránsito sin pasar a reparto. Solicitamos que salga a reparto el próximo día hábil. Gracias.`
  },
  agilizar_reparto: {
    subject: (ped, seg) => `Incidencia en el envío ${ped || seg}`,
    body: (seg) => `Buenos días. El envío ${seg} lleva más de 24 horas en reparto sin entregarse. Solicitamos que sea sacado nuevamente a reparto hoy mismo. Gracias.`
  },
  punto_ctt: {
    subject: (ped, seg) => `Envío en punto CTT: ${ped || seg}`,
    body: (seg) => `Buenos días. Necesitamos la dirección detallada del punto de recogida para el siguiente envío:\nEXPEDICIÓN: - ${seg}. Gracias de antemano.`
  },
  recogida_0030: {
    subject: (ped, seg) => `Incidencia en el envío ${ped || seg}`,
    body: (seg) => `Buenos días. Solicitamos agilizar la recogida del siguiente envío que lleva más de 24 horas pendiente:\nLISTADO DE ENVÍOS: - ${seg}. Gracias.`
  }
};

// Helper para formatear fechas
function getFormattedDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function normalizeFecha(f) {
  if (!f) return '';
  const s = String(f).replace(/"/g, '').substring(0, 10);
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-');
    return `${y}-${m}-${d}`;
  }
  return s;
}

// --- 3. FUNCIONES DE LLAMADA A API CTT ---
async function getAccessToken(clientId, clientSecret) {
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
    throw new Error(`Error obteniendo token: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function fetchShippings(accessToken, centerCode) {
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const formatDateQuery = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const shippingDateRange = `${formatDateQuery(thirtyDaysAgo)}[range]${formatDateQuery(today)}`;
  let shippings = [];
  let page = 1;
  let hasMore = true;

  console.log(`Descargando envíos del centro ${centerCode} en rango ${shippingDateRange}...`);

  while (hasMore) {
    const url = `https://api.cttexpress.com/integrations/trf/web-tracking/v1.0/shippings?mapping_table_code=APITRACK&client_center_code=${centerCode}&shipping_date=${encodeURIComponent(shippingDateRange)}&page_limit=50&page_offsets=${page}`;
    
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      console.error(`Error al leer envíos: ${res.status} ${res.statusText}`);
      break;
    }

    const resJson = await res.json();
    const data = resJson.data || [];
    shippings = shippings.concat(data);

    const current = resJson.pagination?.page_offsets?.current ?? 1;
    const last = resJson.pagination?.page_offsets?.last ?? 1;

    console.log(`Leída página ${current} de ${last}. (${data.length} envíos)`);

    if (current >= last) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return shippings;
}

async function fetchBultoHistory(accessToken, itemCode) {
  const url = `https://api.cttexpress.com/integrations-info/trf/item-history-api/history/${itemCode}?view=APITRACK&showItems=false`;
  
  let retries = 3;
  while (retries > 0) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.status === 502 || res.status === 504) {
        console.warn(`Error de Gateway (${res.status}) en bulto ${itemCode}. Reintentando...`);
        retries--;
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      if (!res.ok) {
        return { error: { message: `HTTP Error ${res.status}` } };
      }
      return await res.json();
    } catch (e) {
      console.warn(`Error en petición bulto ${itemCode}: ${e.message}. Reintentando...`);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  return { error: { message: "Excedidos reintentos máximos" } };
}

// --- 4. LLAMADA A LA API DE OPENAI ---
async function callOpenAI(historyText, precalculatedSLA) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY no configurada. Saltando análisis IA y aplicando override SLA.");
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
  },\n  "decision": {
    "is_incident": boolean,\n    "should_notify": boolean,\n    "notification_type": "none|pendiente|devolucion|siniestro|segundo_intento|recogida_fallida|agilizar_transito|agilizar_reparto|punto_ctt|recogida_0030"\n  }\n}`;

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
  } catch (e) {
    console.error("Excepción en llamada a OpenAI:", e.message);
    return null;
  }
}

// --- 5. LOGICA DEL ANALIZADOR SLA (Calcula SLA Horas) ---
function calculateSLAFases(bultos) {
  const now = new Date();
  let manifest_hours = 0;
  let transit_hours = 0;
  let delivery_hours = 0;
  let stationary_hours = 0;
  let last_event_date = null;

  let has_active_incident = false;
  let active_incident_code = null;

  bultos.forEach(b => {
    const historyStr = b.history || '';
    if (!historyStr) return;

    const lines = historyStr.split('\n');
    const events = [];
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
    let lManifest, lTransit, lDelivery, lStationary, latest;
    let lastIncident = null;

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

    const diffNow = (d) => d ? (now - d) / 3600000 : 0;
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
    h_en_estado: last_event_date ? Number(((now - last_event_date) / 3600000).toFixed(1)) : 0,
    has_active_incident,
    active_incident_code
  };
}

// --- 6. PROCESAMIENTO DE UN PEDIDO INDIVIDUAL ---
async function processTrackingItem(shipment, clientMeta, accessToken) {
  const shippingCode = shipment.shipping_code;
  console.log(`\n--- Procesando Envío: ${shippingCode} ---`);

  // A. Buscar si existe en Firestore incidencias_test previa
  let docPrevio = null;
  try {
    const docRef = db.collection("incidencias_test").doc(shippingCode);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      docPrevio = docSnap.data();
    }
  } catch (e) {
    console.error("Error buscando incidencia previa en DB:", e.message);
  }

  // B. Determinar skip y force_internal
  const hoyStr = getFormattedDate().substring(0, 10);
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = getFormattedDate(ayer).substring(0, 10);

  const is2500 = String(shipment.shipping_status_code || '') === '2500';
  const lastFechaProc = docPrevio ? normalizeFecha(docPrevio.fecha_procesado) : '';

  let skip = false;
  let force_internal = false;
  let numero_avisos = docPrevio ? (parseInt(docPrevio.numero_avisos) || 0) : 0;
  if (numero_avisos > 100) numero_avisos = String(docPrevio.numero_avisos).length; // Sanear

  if (docPrevio) {
    const estado_actual = String(shipment.shipping_status_code || '');
    const estado_anterior = String(docPrevio.estado || '');
    skip = !is2500 && lastFechaProc === hoyStr && estado_actual === estado_anterior;
    force_internal = !skip && (lastFechaProc === ayerStr || is2500);
  } else {
    force_internal = is2500;
  }

  if (skip) {
    console.log(`[SKIP] El envío ${shippingCode} ya se procesó hoy en el mismo estado.`);
    return;
  }

  // C. Expandir bultos y descargar historiales
  const items = shipment.items || [];
  const bultosCodes = items.length === 0 ? [shippingCode + '001'] : items.map(it => it.item_code);
  const bultos = [];

  for (const itemCode of bultosCodes) {
    const histData = await fetchBultoHistory(accessToken, itemCode);
    
    let rawEvents = [];
    if (histData.data && histData.data.shipping_history) {
      const sh = histData.data.shipping_history;
      rawEvents = sh.events || (Array.isArray(sh) ? sh : []);
    } else if (histData.events) {
      rawEvents = histData.events;
    } else if (histData.error) {
      bultos.push({
        item_code: itemCode,
        history: `ERROR: No se pudo obtener el historial (${histData.error?.message || '502 Bad Gateway'})`,
        shipping_status_code: 'FETCH_ERROR'
      });
      continue;
    }

    // Máximo 20 eventos
    const MAX_EVENTS = 20;
    const events = rawEvents.length <= MAX_EVENTS
      ? rawEvents
      : [rawEvents[0], ...rawEvents.slice(-(MAX_EVENTS - 1))];

    const lines = [];
    let latestEvent = null;

    events.forEach(e => {
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
  }

  bultos.sort((a, b) => a.item_code < b.item_code ? -1 : 1);

  // D. Calcular Horas Fases SLA e incidentes activos
  const sla = calculateSLAFases(bultos);

  // Guardamos contexto precalculado para IA
  const precalculatedSLA = {
    shipping_code: shippingCode,
    client_references: shipment.client_references || ['sin-ref'],
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

  // E. Evaluar con OpenAI
  let aiResponse = await callOpenAI(formatted_history, precalculatedSLA);
  
  let is_incident = aiResponse?.decision?.is_incident === true;
  let should_notify = aiResponse?.decision?.should_notify === true;
  let notification_type = aiResponse?.decision?.notification_type || 'none';
  let ai_justification = aiResponse?.analysis?.justificacion || 'Análisis IA completado';
  let affected_bulto = aiResponse?.analysis?.item_afectado || null;

  // F. Overrides matemáticos de SLA (Lógica estricta de n8n)
  let estado_actual = String(bultos[0] ? bultos[0].shipping_status_code : (shipment.shipping_status_code || '')).replace(/["']/g, '').trim();
  
  const isManifest = estado_actual === '0000' || estado_actual === '0030';
  const isTransit = estado_actual === '0900' || estado_actual === '1000';
  const isDelivery = ['1200', '1500', '1600', '2400', '2600', '2700'].includes(estado_actual);
  const isStationary = estado_actual === '1700' || estado_actual === '1800';
  const is71INAT = estado_actual === '71_INAT';

  const stateIsStillProblematic = isDelivery || isStationary || is2500 || is71INAT || sla.has_active_incident;

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

  // G. Formatear asunto y cuerpo del email de prueba (Simulado)
  let target_type = 'none';
  let asunto = '';
  let cuerpo = '';
  let destinatario = '';

  const ped = precalculatedSLA.client_references[0] || '';
  const seg = shippingCode;

  if (should_notify && notification_type !== 'none') {
    const cat = notification_type.toLowerCase();
    
    if (cat.includes('agilizar_reparto')) {
      target_type = 'standard';
      asunto = TEMPLATES.agilizar_reparto.subject(ped, seg);
      cuerpo = TEMPLATES.agilizar_reparto.body(seg);
    } else if (cat.includes('agilizar_transito')) {
      target_type = 'standard';
      asunto = TEMPLATES.agilizar_transito.subject(ped, seg);
      cuerpo = TEMPLATES.agilizar_transito.body(seg);
    } else if (cat.includes('segundo_intento')) {
      target_type = 'standard';
      asunto = TEMPLATES.segundo_intento.subject(ped, seg);
      cuerpo = TEMPLATES.segundo_intento.body(seg);
    } else if (cat.includes('punto_ctt')) {
      target_type = 'standard';
      asunto = TEMPLATES.punto_ctt.subject(ped, seg);
      cuerpo = TEMPLATES.punto_ctt.body(seg);
    } else if (cat.includes('recogida_fallida')) {
      target_type = 'standard';
      asunto = TEMPLATES.recogida_fallida.subject(ped, seg);
      cuerpo = TEMPLATES.recogida_fallida.body(seg);
    } else if (cat.includes('pendiente')) {
      target_type = 'internal';
      asunto = TEMPLATES.pendiente.subject(ped, seg);
      cuerpo = TEMPLATES.pendiente.body(ped, seg);
    } else if (cat.includes('recogida_0030')) {
      target_type = 'standard';
      asunto = TEMPLATES.recogida_0030.subject(ped, seg);
      cuerpo = TEMPLATES.recogida_0030.body(seg);
    } else if (cat.includes('devolucion')) {
      target_type = 'internal';
      asunto = TEMPLATES.devolucion.subject(ped, seg);
      cuerpo = TEMPLATES.devolucion.body(seg);
    } else if (cat.includes('siniestro')) {
      target_type = 'internal';
      asunto = TEMPLATES.siniestro.subject(ped, seg);
      cuerpo = TEMPLATES.siniestro.body(seg);
    } else {
      target_type = 'internal';
      asunto = `Gestión Urgente: ${seg}`;
      cuerpo = `Hola, se requiere revisión manual para el envío ${seg}.\nJustificación: ${ai_justification}`;
    }

    // Incrementar avisos
    numero_avisos = numero_avisos + 1;

    // Lógica de reincidencia
    if (numero_avisos > 1 && target_type === 'standard') {
      target_type = 'internal';
      asunto = `[RE-INCIDENCIA] ${asunto}`;
      cuerpo = `Hola equipo, este envío ya fue notificado previamente y sigue en incidencia. Por favor, gestionad manualmente.\n\n${cuerpo}`;
    }

    // Definir destinatario
    if (target_type === 'internal') {
      destinatario = clientMeta.internalEmail;
    } else if (target_type === 'standard') {
      destinatario = clientMeta.ccaZone;
    }
  }

  // Guardia final
  if (should_notify && !asunto) {
    target_type = 'internal';
    asunto = `Gestión Urgente fallback: ${seg}`;
    cuerpo = `Hola, se requiere revisión manual para el envío ${seg}.\nJustificación: ${ai_justification}`;
    destinatario = clientMeta.internalEmail;
  }

  // H. Escribir resultados de prueba en Firestore (Independiente)
  const logData = {
    _docid: shippingCode,
    fecha_procesado: getFormattedDate(),
    numero_envio: shippingCode,
    numero_pedido: ped,
    tienda: clientMeta.name,
    centro: shipment.client_center_code || '',
    estado: estado_actual,
    fecha_estado: shipment.shipping_status_datetime || '',
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
    dano: (aiResponse?.decision?.notification_type === 'siniestro' || estado_actual === '1006'),
    historial_formateado: formatted_history,
    asunto: asunto,
    cuerpo: cuerpo,
    bultos_historial_json: bultos_raw,
    // Bandera que indica que fue una ejecución de test mediante script en GitHub Actions
    is_test_run: true
  };

  try {
    // Escribir en ejecuciones_test
    await db.collection("ejecuciones_test").doc(shippingCode).set(logData);
    console.log(`[TEST_LOG] Grabado log de pruebas en ejecuciones_test para ${shippingCode}`);

    // Escribir en incidencias_test si aplica
    if (is_incident) {
      const incidenciaData = {
        ...logData,
        incidencia: asunto,
        numero_avisos: numero_avisos,
        bulto_afectado: affected_bulto,
        shipping_code: shippingCode
      };
      await db.collection("incidencias_test").doc(shippingCode).set(incidenciaData);
      console.log(`[TEST_INCIDENCIA] Grabado log de pruebas en incidencias_test para ${shippingCode}`);
    } else {
      // Si ya no es incidencia pero existía en pruebas, podríamos eliminarlo o marcarlo
      await db.collection("incidencias_test").doc(shippingCode).delete();
    }
  } catch (err) {
    console.error(`Error escribiendo en Firestore para ${shippingCode}:`, err.message);
  }
}

// --- 7. BUCLE PRINCIPAL (CRON SIMULADO) ---
async function run() {
  console.log("=== INICIANDO WORKFLOW DE PRUEBAS SLA CTT (GITHUB ACTIONS MOCK) ===");
  const today = getFormattedDate();
  console.log(`Fecha de inicio: ${today}`);

  for (const clientCode in CLIENTS) {
    const clientMeta = CLIENTS[clientCode];
    console.log(`\n=============================================`);
    console.log(`Procesando Cliente: ${clientMeta.name} (${clientCode})`);
    console.log(`=============================================`);

    let accessToken;
    try {
      accessToken = await getAccessToken(clientMeta.clientId, clientMeta.clientSecret);
      console.log("Token OAuth CTT obtenido con éxito.");
    } catch (e) {
      console.error(`No se pudo obtener el token para el cliente ${clientMeta.name}:`, e.message);
      continue; // Saltar a siguiente cliente
    }

    let allShippings = [];
    for (const center of clientMeta.centers) {
      try {
        const shippings = await fetchShippings(accessToken, center);
        allShippings = allShippings.concat(shippings);
      } catch (e) {
        console.error(`Error leyendo envíos del centro ${center}:`, e.message);
      }
    }

    console.log(`Total envíos obtenidos para ${clientMeta.name}: ${allShippings.length}`);

    // Filtrar estados terminales
    const activeShippings = allShippings.filter(shipment => {
      const status = String(shipment.shipping_status_code || '').replace(/"/g, '').trim();
      if (!TERMINAL_CODES.has(status)) return true;
      // En n8n: si el estado es terminal, se procesa solo si tiene más de 1 bulto/item
      const itemsCount = Array.isArray(shipment.items) ? shipment.items.length : 0;
      return itemsCount > 1;
    });

    console.log(`Envíos activos a evaluar (SLA / Incidencia): ${activeShippings.length}`);

    // Procesar secuencialmente con un pequeño retraso
    for (const shipment of activeShippings) {
      try {
        await processTrackingItem(shipment, clientMeta, accessToken);
        // Delay de 1 segundo para evitar saturar las APIs de CTT y OpenAI
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`Error procesando envío ${shipment.shipping_code}:`, err.message);
      }
    }
  }

  console.log("\n=== WORKFLOW DE PRUEBAS SLA CTT FINALIZADO ===");
  process.exit(0);
}

run().catch(err => {
  console.error("Error crítico en la ejecución del script de pruebas:", err);
  process.exit(1);
});
