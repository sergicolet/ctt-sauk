import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const mainPath   = join(__dirname, '..', 'workflows', 'main.json');

// ── Backup ──
copyFileSync(mainPath, mainPath + '.bak');
console.log('📦 Backup: main.json.bak');

const workflow = JSON.parse(readFileSync(mainPath, 'utf-8'));

// ═══════════════════════════════════════════════════════
// 1. Fix Gmail Send subjects (usaban subject hardcodeado)
// ═══════════════════════════════════════════════════════
const SEND_NAMES = [
  'Gmail: Send HAMINOS',
  'Gmail: Send SNAPPY',
  'Gmail: Send KULTUDENDA',
  'Gmail: Send MIESTERY'
];

for (const node of workflow.nodes) {
  if (SEND_NAMES.includes(node.name)) {
    node.parameters.subject = '={{ $json.email_subject }}';
    console.log('  ✅ Subject fixed: ' + node.name);
  }
}

// ═══════════════════════════════════════════════════════
// 2. Split Code: Calcular SLA Horas → 2 nodos
//    A) Code: Calcular Horas Fase  (cálculo de horas)
//    B) Code: Calcular SLA Horas   (detección incidencia activa)
// ═══════════════════════════════════════════════════════
const slaIdx = workflow.nodes.findIndex(n => n.name === 'Code: Calcular SLA Horas');
if (slaIdx === -1) throw new Error('Node "Code: Calcular SLA Horas" not found');
const slaNode = workflow.nodes[slaIdx];

// 2a. Nuevo nodo: Code: Calcular Horas Fase
const horasCode = [
  "const item   = $input.item.json;",
  "const bultos = item.bultos || [];",
  "const now    = new Date();",
  "",
  "let manifest_hours   = 0;",
  "let transit_hours    = 0;",
  "let delivery_hours   = 0;",
  "let stationary_hours = 0;",
  "let last_event_date  = null;",
  "",
  "bultos.forEach(b => {",
  "  const lines = (b.history || '').split('\\n').filter(Boolean);",
  "  const events = lines.map(line => {",
  "    const parts    = line.split(' | ');",
  "    const dateStr  = parts[0];",
  "    const match    = parts[1]?.match(/\\[(\\d+)\\]/);",
  "    const code     = match ? match[1] : null;",
  "    return { date: new Date(dateStr), code };",
  "  }).filter(e => !isNaN(e.date.getTime()));",
  "",
  "  if (events.length === 0) return;",
  "",
  "  const latest = events.reduce((a, b) => b.date > a.date ? b : a, events[0]);",
  "  if (!last_event_date || latest.date > last_event_date) last_event_date = latest.date;",
  "",
  "  const lastManifest   = [...events].reverse().find(e => ['0000','0030'].includes(e.code));",
  "  const lastTransit    = [...events].reverse().find(e => ['0900','1000'].includes(e.code));",
  "  const lastDelivery   = [...events].reverse().find(e => ['1200','1500','1600','2400','2600','2700'].includes(e.code));",
  "  const lastStationary = [...events].reverse().find(e => ['1700','1800'].includes(e.code));",
  "",
  "  const diffNow = (d) => d ? (now - d) / 3600000 : 0;",
  "",
  "  if (lastManifest)   manifest_hours   = Math.max(manifest_hours,   diffNow(lastManifest.date));",
  "  if (lastTransit)    transit_hours    = Math.max(transit_hours,    diffNow(lastTransit.date));",
  "  if (lastDelivery)   delivery_hours   = Math.max(delivery_hours,   diffNow(lastDelivery.date));",
  "  if (lastStationary) stationary_hours = Math.max(stationary_hours, diffNow(lastStationary.date));",
  "});",
  "",
  "return {",
  "  json: {",
  "    ...item,",
  "    manifest_hours:   Number(manifest_hours.toFixed(1)),",
  "    transit_hours:    Number(transit_hours.toFixed(1)),",
  "    delivery_hours:   Number(delivery_hours.toFixed(1)),",
  "    stationary_hours: Number(stationary_hours.toFixed(1)),",
  "    h_en_estado: last_event_date ? Number(((now - last_event_date) / 3600000).toFixed(1)) : 0",
  "  }",
  "};"
].join('\n');

const horasNode = {
  parameters: { jsCode: horasCode },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [3440, 528],
  id: "horas-0001-0001-0001-000000000016",
  name: "Code: Calcular Horas Fase"
};

// 2b. Modify existing node → only incident detection + passthrough hours
const incidentCode = [
  "// Detecta incidencia activa: 1600/2400/2600/2700/0600 sin resolución posterior (1500/2000/2100)",
  "const INCIDENT_CODES   = new Set(['1600','2400','2600','2700','0600']);",
  "const RESOLUTION_CODES = new Set(['1500','2000','2100']);",
  "const item = $input.item.json;",
  "",
  "let has_active_incident  = false;",
  "let active_incident_code = null;",
  "",
  "for (const b of (item.bultos || [])) {",
  "  const lines = (b.history || '').split('\\n').filter(Boolean);",
  "  const evts  = lines.map(l => {",
  "    const parts = l.split(' | ');",
  "    const m     = parts[1]?.match(/\\[(\\w+)\\]/);",
  "    return m ? m[1] : null;",
  "  }).filter(Boolean);",
  "",
  "  let lastIncident = null;",
  "  for (const code of evts) {",
  "    if (INCIDENT_CODES.has(code))   lastIncident = code;",
  "    if (RESOLUTION_CODES.has(code)) lastIncident = null;",
  "  }",
  "  if (lastIncident) {",
  "    has_active_incident  = true;",
  "    active_incident_code = lastIncident;",
  "    break;",
  "  }",
  "}",
  "",
  "return { json: { ...item, has_active_incident, active_incident_code } };"
].join('\n');

slaNode.parameters.jsCode = incidentCode;
slaNode.position = [3560, 528];

// Insert horasNode before slaNode
workflow.nodes.splice(slaIdx, 0, horasNode);
console.log('  ✅ Split: Calcular Horas Fase + Calcular SLA Horas');

// ═══════════════════════════════════════════════════════
// 3. Split Code: Procesar Respuesta IA → 2 nodos
//    A) Code: Parsear y Override IA  (parse IA + override SLA)
//    B) Code: Procesar Respuesta IA  (routing + plantillas email)
//
//    BUG FIX: El override leía hours de $('Code: Extraer Historial')
//    donde NO existen. Ahora lee de $('Code: Calcular SLA Horas').
// ═══════════════════════════════════════════════════════
const procIdx = workflow.nodes.findIndex(n => n.name === 'Code: Procesar Respuesta IA');
if (procIdx === -1) throw new Error('Node "Code: Procesar Respuesta IA" not found');
const procNode = workflow.nodes[procIdx];

// 3a. Nuevo nodo: Code: Parsear y Override IA
const parsearCode = [
  "const raw = $input.item.json;",
  "const ctx = $('Code: Extraer Historial').item.json;",
  "const sla = $('Code: Calcular SLA Horas').item.json;",
  "",
  "const formatted_history = (ctx.bultos || []).map(b => 'Item: ' + b.item_code + '\\n' + b.history).join('\\n\\n---\\n\\n');",
  "const bultos_raw = JSON.stringify(ctx.bultos || []);",
  "",
  "// --- Parsear respuesta IA ---",
  "const aiText = raw.output?.[0]?.content?.[0]?.text || '{}';",
  "let ai;",
  "try {",
  "  ai = JSON.parse(aiText.replace(/```json|```/g, '').trim());",
  "} catch (e) {",
  "  ai = {",
  "    analysis: { ultimo_estado: '', item_afectado: null, justificacion: 'parse_error: ' + e.message },",
  "    decision: { is_incident: false, should_notify: false, notification_type: 'none' }",
  "  };",
  "}",
  "",
  "let is_incident       = ai.decision?.is_incident   === true;",
  "let should_notify     = ai.decision?.should_notify === true;",
  "let notification_type = ai.decision?.notification_type || 'none';",
  "",
  "// --- Estado actual desde historial ---",
  "let estado_actual = String((ctx.bultos && ctx.bultos[0]) ? ctx.bultos[0].shipping_status_code : (ctx.shipping_status_code || '')).replace(/[\"']/g, '').trim();",
  "",
  "// --- Override matemático SLA (usa 'sla' para hours e incidencias) ---",
  "const isManifest   = estado_actual === '0000' || estado_actual === '0030';",
  "const isTransit    = estado_actual === '0900' || estado_actual === '1000';",
  "const isDelivery   = ['1200','1500','1600','2400','2600','2700'].includes(estado_actual);",
  "const isStationary = estado_actual === '1700' || estado_actual === '1800';",
  "",
  "if (ctx.force_internal === true || sla.has_active_incident ||",
  "  (isManifest   && (parseFloat(sla.manifest_hours)   || 0) > 24) ||",
  "  (isTransit    && (parseFloat(sla.transit_hours)    || 0) > 24) ||",
  "  (isDelivery   && (parseFloat(sla.delivery_hours)   || 0) > 24) ||",
  "  (isStationary && (parseFloat(sla.stationary_hours) || 0) > 24)",
  ") {",
  "  is_incident   = true;",
  "  should_notify = true;",
  "  if (notification_type === 'none') {",
  "    if (sla.has_active_incident) {",
  "      const ac = sla.active_incident_code;",
  "      notification_type = ac === '0600' ? 'recogida_fallida' : 'segundo_intento';",
  "    } else if (isManifest) {",
  "      notification_type = estado_actual === '0030' ? 'recogida_0030' : 'pendiente';",
  "    } else if (isTransit)    notification_type = 'agilizar_transito';",
  "    else if (isDelivery || isStationary) notification_type = 'agilizar_reparto';",
  "  }",
  "}",
  "",
  "return {",
  "  json: {",
  "    ...ctx,",
  "    shipping_status_code: estado_actual || ctx.shipping_status_code,",
  "    formatted_history,",
  "    bultos_raw,",
  "    is_incident,",
  "    should_notify,",
  "    notification_type,",
  "    ai_justification: ai.analysis?.justificacion || '',",
  "    affected_bulto:   ai.analysis?.item_afectado || null",
  "  }",
  "};"
].join('\n');

const parsearNode = {
  parameters: { jsCode: parsearCode },
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [3920, 528],
  id: "parsear-0001-0001-0001-000000000018",
  name: "Code: Parsear y Override IA"
};

// 3b. Modify existing node → email construction + routing only
const emailCode = [
  "const item = $input.item.json;",
  "",
  "const SEG = String(item.shipping_code || '');",
  "const PED = String(item.client_references?.[0] || SEG);",
  "",
  "// --- Routing: internal (envío directo) vs standard (borrador CCA) ---",
  "const INTERNAL_TYPES = new Set(['pendiente','devolucion','siniestro','recogida_0030']);",
  "const num_base   = Math.min(parseInt(item.numero_avisos) || 0, 999);",
  "const isImmediate = INTERNAL_TYPES.has(item.notification_type) || item.force_internal === true || (num_base >= 1 && item.is_incident);",
  "",
  "const target_type = (item.should_notify && item.is_incident)",
  "  ? (isImmediate ? 'internal' : 'standard')",
  "  : 'none';",
  "",
  "const INTERNAL = { '48630':'incidenciashaminos@gmail.com', '47352':'incidenciassnappyblue@gmail.com', '47685':'incidenciasamzdiscounts01@gmail.com', '45416':'incidenciaskulturdenda@gmail.com' };",
  "const CCA      = { '48630':'cca.z3@cttexpress.com', '47352':'cca.z3@cttexpress.com', '47685':'cca.z3@cttexpress.com', '45416':'cca.z2@cttexpress.com' };",
  "const to_email  = target_type === 'internal' ? (INTERNAL[item.client_code] || 'alertas@sergi.com') : (CCA[item.client_code] || 'cca.z3@cttexpress.com');",
  "",
  "// --- Plantillas fijas por tipo de notificación ---",
  "const TEMPLATES = {",
  "  pendiente:         { subject: `ALERTA INTERNA: Envío ${SEG} grabado sin recoger`,           body: `Hola, se ha detectado que el siguiente envío lleva más de 24 horas en estado 0000. Por favor, revisadlo.\\nPEDIDO: - ${PED}` },",
  "  devolucion:        { subject: `Devolución en proceso: ${PED}`,                              body: `Estimados, el siguiente pedido ha entrado en proceso de devolución. Iniciamos seguimiento manual.\\nCÓDIGO: - ${SEG}` },",
  "  siniestro:         { subject: `Apertura de siniestro: ${PED}`,                              body: `Hola CTT, solicitamos la apertura oficial de expediente de siniestro por pérdida/daño para el envío:\\nREFERENCIA: - ${SEG}. Quedamos a la espera del número de expediente.` },",
  "  segundo_intento:   { subject: `Incidencia en el envío ${PED}`,                              body: `Buenos días. Tras la incidencia en el primer intento, solicitamos automáticamente un segundo intento de reparto para el siguiente día hábil.\\nEXPEDICIÓN: - ${SEG}. Gracias.` },",
  "  recogida_fallida:  { subject: `Incidencia en el envío ${PED}`,                              body: `Buenos días. Solicitamos que se reintente la recogida fallida del siguiente envío:\\nEXPEDICIÓN: - ${SEG}. Gracias.` },",
  "  agilizar_transito: { subject: `Incidencia en el envío ${PED}`,                              body: `Buenos días. El envío ${SEG} lleva más de 24 horas en tránsito sin pasar a reparto. Solicitamos que salga a reparto el próximo día hábil. Gracias.` },",
  "  agilizar_reparto:  { subject: `Incidencia en el envío ${PED}`,                              body: `Buenos días. El envío ${SEG} lleva más de 24 horas en reparto sin entregarse. Solicitamos que sea sacado nuevamente a reparto hoy mismo. Gracias.` },",
  "  punto_ctt:         { subject: `Envío en punto CTT: ${PED}`,                                 body: `Hola. Necesitamos la dirección detallada del punto de recogida para el siguiente envío:\\nEXPEDICIÓN: - ${SEG}. Gracias de antemano.` },",
  "  recogida_0030:     { subject: `Incidencia en el envío ${PED}`,                              body: `Buenos días. Solicitamos agilizar la recogida del siguiente envío que lleva más de 24 horas pendiente:\\nLISTADO DE ENVÍOS: - ${SEG}. Gracias.` },",
  "};",
  "",
  "const plantilla = TEMPLATES[item.notification_type] || { subject: '', body: '' };",
  "const nuevo_numero_avisos = num_base + ((item.should_notify && item.is_incident && target_type !== 'none') ? 1 : 0);",
  "",
  "return {",
  "  json: {",
  "    ...item,",
  "    should_notify:     item.should_notify && item.is_incident,",
  "    target_type,",
  "    notification_type: item.notification_type,",
  "    incident_type:     item.notification_type,",
  "    incidencia:        item.notification_type,",
  "    email_subject:     plantilla.subject,",
  "    asunto:            plantilla.subject,",
  "    email_body:        plantilla.body,",
  "    cuerpo:            plantilla.body,",
  "    ai_justification:  item.ai_justification,",
  "    razon:             item.ai_justification,",
  "    affected_bulto:    item.affected_bulto,",
  "    bulto_afectado:    item.affected_bulto,",
  "    to_email,",
  "    destinatario:      to_email,",
  "    numero_avisos:     nuevo_numero_avisos,",
  "    fecha_procesado:   $now.toFormat('yyyy-MM-dd HH:mm:ss'),",
  "    _docid:            SEG",
  "  }",
  "};"
].join('\n');

procNode.parameters.jsCode = emailCode;
procNode.position = [4040, 528];

// Insert parsearNode before procNode
workflow.nodes.splice(procIdx, 0, parsearNode);
console.log('  ✅ Split: Parsear y Override IA + Procesar Respuesta IA');
console.log('  ✅ BUG FIX: Override SLA ahora lee de $("Code: Calcular SLA Horas") en vez de $("Code: Extraer Historial")');

// ═══════════════════════════════════════════════════════
// 4. Update connections
// ═══════════════════════════════════════════════════════

// 4a: Filtrar Bultos → Calcular Horas Fase (era → Calcular SLA Horas)
workflow.connections['Code: Filtrar Bultos Activos'].main[0][0].node = 'Code: Calcular Horas Fase';

// 4b: Calcular Horas Fase → Calcular SLA Horas (nueva)
workflow.connections['Code: Calcular Horas Fase'] = {
  main: [[{ node: 'Code: Calcular SLA Horas', type: 'main', index: 0 }]]
};

// 4c: AI → Parsear y Override IA (era → Procesar Respuesta IA)
workflow.connections['AI: Analizar Historiales'].main[0][0].node = 'Code: Parsear y Override IA';

// 4d: Parsear y Override IA → Procesar Respuesta IA (nueva)
workflow.connections['Code: Parsear y Override IA'] = {
  main: [[{ node: 'Code: Procesar Respuesta IA', type: 'main', index: 0 }]]
};

console.log('  ✅ Connections updated');

// ═══════════════════════════════════════════════════════
// 5. Shift downstream node positions for visual clarity
// ═══════════════════════════════════════════════════════
const POS_MAP = {
  'AI: Analizar Historiales':        [3720, 528],
  'IF: ¿Debe Notificar?':           [4280, 528],
  'Switch: Email Routing':           [4520, 528],
  '¿Es Incidencia Real?':           [5000, 500],
  'Set: Preparar Registro Incidencia': [5120, 360],
  'Firestore: Registrar Incidencia': [5220, 428],
  'Set: Preparar Log':               [5440, 528],
  'Firestore: Log Ejecucion':        [5660, 528],
};

const GMAIL_NODES = new Set([
  'Gmail: Send HAMINOS',    'Gmail: Draft HAMINOS',
  'Gmail: Send SNAPPY',     'Gmail: Draft SNAPPY',
  'Gmail: Send KULTUDENDA', 'Gmail: Draft KULTUDENDA',
  'Gmail: Send MIESTERY',   'Gmail: Draft MIESTERY',
]);

for (const node of workflow.nodes) {
  if (POS_MAP[node.name]) {
    node.position = POS_MAP[node.name];
  } else if (GMAIL_NODES.has(node.name)) {
    node.position[0] = 4760;
  }
}

console.log('  ✅ Positions adjusted');

// ═══════════════════════════════════════════════════════
// Write
// ═══════════════════════════════════════════════════════
writeFileSync(mainPath, JSON.stringify(workflow, null, 2));

console.log('\n🎉 Workflow actualizado correctamente!');
console.log('');
console.log('Resumen de cambios:');
console.log('  1. Gmail Send (x4): subject ahora usa plantilla email_subject');
console.log('  2. Code: Calcular SLA Horas → split en:');
console.log('     • Code: Calcular Horas Fase   (cálculo de horas por fase)');
console.log('     • Code: Calcular SLA Horas     (detección incidencia activa)');
console.log('  3. Code: Procesar Respuesta IA → split en:');
console.log('     • Code: Parsear y Override IA   (parse JSON IA + override SLA)');
console.log('     • Code: Procesar Respuesta IA   (routing + plantillas email)');
console.log('  4. BUG FIX: Override SLA ahora lee hours/incidencias desde');
console.log('     $("Code: Calcular SLA Horas") — antes leía de');
console.log('     $("Code: Extraer Historial") donde NO existen (siempre 0)');
