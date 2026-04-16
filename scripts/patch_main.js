const fs = require("fs");
const path = "../workflows/main.json";
const wf = JSON.parse(fs.readFileSync(path, "utf8"));

const prepNode = wf.nodes.find(n => n.name === "Code: Preparar Contexto");
if (prepNode) {
    prepNode.parameters.jsCode = `// Determina skip, force_internal y numero_avisos a partir del doc Firestore
const firestoreDoc = $input.item.json;
const shipment = $('Loop: Un envío a la vez').item.json;
const hoy = $now.toFormat('dd-MM-yyyy');
const ayer = $now.minus({days: 1}).toFormat('dd-MM-yyyy');

const is2500 = String(shipment.shipping_status_code || '') === '2500';
const docValido = firestoreDoc?.numero_envio || firestoreDoc?.shipping_code;
const doc = docValido ? firestoreDoc : null;

let skip = false;
let force_internal = false;
let numero_avisos = 0;

if (doc) {
  const fecha = (doc.fecha_procesado || '').substring(0, 10);
  skip = !is2500 && fecha === hoy;
  force_internal = !skip && (fecha === ayer || is2500);
  numero_avisos = (parseInt(doc.numero_avisos) || 0);
} else {
  force_internal = is2500;
}

return {
  json: {
    ...shipment,
    skip,
    force_internal,
    is_2500: is2500,
    numero_avisos
  }
};
`;
}

const procNode = wf.nodes.find(n => n.name === "Code: Procesar Respuesta IA");
if (procNode) {
    procNode.parameters.jsCode = `// Parsea respuesta IA y aplica la Regla de Oro de routing
const raw = $input.item.json;
const ctx = $('Code: Extraer Historial').item.json;

const formatted_history = (ctx.bultos || []).map(b => 'Item: ' + b.item_code + '\\n' + b.history).join('\\n\\n---\\n\\n');
const bultos_raw = JSON.stringify(ctx.bultos || []);

const aiText = raw.output?.[0]?.content?.[0]?.text || '{}';
let ai;
try {
  ai = JSON.parse(aiText.replace(/\`\`\`json|\`\`\`/g, '').trim());
} catch (e) {
  ai = { analysis: { detected_issue: 'parse_error', affected_bulto: null, justification: e.message }, decision: { is_incident: false, should_notify: false, incident_type: 'none', email_subject: '', email_body: '' } };
}

let is_incident   = ai.decision?.is_incident   === true;
let should_notify = ai.decision?.should_notify === true;

// 1. Extracción de estado principal blindada (limpia comillas literales)
let estado_actual = String((ctx.bultos && ctx.bultos[0]) ? ctx.bultos[0].shipping_status_code : (ctx.shipping_status_code || ''));
estado_actual = estado_actual.replace(/["']/g, '').trim(); 

const isManifest = estado_actual === '0000' || estado_actual === '0030';
const isTransit = estado_actual === '0900' || estado_actual === '1000';
const isDelivery = estado_actual === '1200' || estado_actual === '1500';
const isStationary = estado_actual === '1700' || estado_actual === '1800';

// 2. OVERRIDE MATEMÁTICO SLA DE SEGURIDAD (Calculado sin interferencia IA)
if (
  ctx.force_internal === true ||
  (isManifest && (parseFloat(ctx.manifest_hours) || 0) > 24) ||
  (isTransit && (parseFloat(ctx.transit_hours) || 0) > 24) ||
  (isDelivery && (parseFloat(ctx.delivery_hours) || 0) > 24) ||
  (isStationary && (parseFloat(ctx.stationary_hours) || 0) > 24)
) {
  is_incident = true;
  should_notify = true;
}

const incident_type = ai.decision?.incident_type || 'none';
const num_base = parseInt(ctx.numero_avisos) || 0;

// Regla de Oro: immediate = daño, devolución, reincidencia o forzado interno
const isImmediate =
  incident_type === 'damage'  ||
  incident_type === 'return'  ||
  ctx.force_internal === true ||
  (num_base >= 1 && is_incident);

const target_type = (should_notify && is_incident)
  ? (isImmediate ? 'internal' : 'standard')
  : 'none';

const INTERNAL = {
  '48630': 'incidenciashaminos@gmail.com',
  '47352': 'incidenciassnappyblue@gmail.com',
  '47685': 'incidenciasamzdiscounts01@gmail.com',
  '45416': 'incidenciaskulturdenda@gmail.com'
};
const CCA = {
  '48630': 'cca.z3@cttexpress.com',
  '47352': 'cca.z3@cttexpress.com',
  '47685': 'cca.z3@cttexpress.com',
  '45416': 'cca.z2@cttexpress.com'
};

const to_email = target_type === 'internal'
  ? (INTERNAL[ctx.client_code] || 'alertas@sergi.com')
  : (CCA[ctx.client_code] || 'cca.z3@cttexpress.com');

const nuevo_numero_avisos = num_base + (is_incident ? 1 : 0);

// ==========================================
// PARACAÍDAS DE REDACCIÓN [NUEVO]
// ==========================================
let final_subject = ai.decision?.email_subject || '';
let final_body = ai.decision?.email_body || '';

// Si la IA nos ha boicoteado dejándolo en blanco pero sabemos matemáticamente que amerita enviar:
if ((should_notify && is_incident) && (!final_subject || final_subject.trim() === '')) {
  final_subject = \`Notificación de Incidencia Automática - Pedido \${ctx.client_references?.[0] || ctx.shipping_code}\`;
}

if ((should_notify && is_incident) && (!final_body || final_body.trim() === '')) {
  final_body = \`El envío \${ctx.shipping_code} (\${ctx.client_references?.[0] || 'Desconocido'}) ha requerido una notificación forzada de seguridad debido a que excede los tiempos SLA estipulados o acarrea retraso sin resolver.\\n\\nPor favor, revisad el seguimiento:\\n\\n\${formatted_history}\`;
}
// ==========================================

return {
  json: {
    ...ctx,
    formatted_history,
    bultos_raw,
    should_notify: should_notify && is_incident,
    target_type,
    incident_type,
    incidencia:       incident_type,
    email_subject:    final_subject,
    asunto:           final_subject,
    email_body:       final_body,
    cuerpo:           final_body,
    ai_justification: ai.analysis?.justificacion || ai.analysis?.justification || ai.analysis?.detected_issue || ai.decision?.justification || '',
    razon:            ai.analysis?.justificacion || ai.analysis?.justification || ai.analysis?.detected_issue || ai.decision?.justification || '',
    affected_bulto:   ai.analysis?.item_afectado || ai.analysis?.affected_bulto || ai.analysis?.item || null,
    bulto_afectado:   ai.analysis?.item_afectado || ai.analysis?.affected_bulto || ai.analysis?.item || null,
    to_email,
    destinatario:     to_email,
    numero_avisos:    nuevo_numero_avisos,
    fecha_procesado:  $now.toFormat('dd-MM-yyyy HH:mm:ss'),
    _docid:           ctx.shipping_code.toString()
  }
};
`;
}

fs.writeFileSync(path, JSON.stringify(wf, null, 2), "utf8");
console.log("Successfully patched both nodes in main.json");
