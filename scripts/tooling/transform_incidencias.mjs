import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const filePath   = join(__dirname, '..', 'workflows', 'incidencias.json');
const backupPath = join(__dirname, '..', 'workflows', 'incidencias.json.bak');

const workflow = JSON.parse(readFileSync(filePath, 'utf-8'));
writeFileSync(backupPath, JSON.stringify(workflow, null, 2));
console.log('📦 Backup: incidencias.json.bak');

// 1. Fix Gmail subjects in Followup branch
const gmailNodes = ['FW Gmail H', 'FW Gmail M', 'FW Gmail K', 'FW Gmail S'];
workflow.nodes.forEach(node => {
  if (gmailNodes.includes(node.name)) {
    node.parameters.subject = '={{ $json.email_subject }}';
    console.log(`  ✅ Subject fixed: ${node.name}`);
  }
});

// 2. Split Code FW JS3 into (Calcular Horas + Preparar Contexto)
// Note: Code FW JS3 is at [-860, 2256] area? Reference view_file: lines 313-315: [932, 1360]
const nodeJS3 = workflow.nodes.find(n => n.name === 'Code FW JS3');
if (nodeJS3) {
  const originalPos = [...nodeJS3.position];
  
  // Create Calc node
  const nodeCalc = JSON.parse(JSON.stringify(nodeJS3));
  nodeCalc.name = 'Code: Calcular Horas FW';
  nodeCalc.id = 'fw-calc-0001-0000-4000-8000-000000000001';
  nodeCalc.position = [originalPos[0], originalPos[1]];
  
  // Logic for Calc: calculates hours, does NOT join bultos_text
  nodeCalc.parameters.jsCode = `try {
  const incidencia = $('Loop Followup').item.json;
  const httpResp = $input.item.json;
  
  let itemsRaw = [];
  const rawData = httpResp?.data?.shipping_history;
  if (Array.isArray(rawData)) itemsRaw = rawData;
  else if (rawData && typeof rawData === 'object') itemsRaw = [rawData];
  else throw new Error('No se encontró historial de bultos');

  function businessHours(startDate, endDate) {
    if (!startDate || !endDate || endDate <= startDate) return 0;
    let hours = 0;
    let cur = new Date(startDate.getTime());
    while (cur < endDate) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
        const nextMidnight = new Date(y, m, d + 1);
        const seg = endDate < nextMidnight ? endDate : nextMidnight;
        hours += (seg - cur) / 3600000;
      }
      const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
      cur = new Date(y, m, d + 1);
    }
    return parseFloat(hours.toFixed(1));
  }

  const now = new Date();
  const TRANSIT    = ['0900', '1000'];
  const DELIVERY   = ['1200', '1500'];
  const STATIONARY = ['1700', '1800'];
  const MANIFEST   = ['0000', '0030'];

  let maxTransit = 0, maxManifest = 0, maxDelivery = 0, maxStationary = 0;
  let anyDamage = false;

  for (const it of itemsRaw) {
    const events = Array.isArray(it.events) ? it.events : [];
    if (events.length > 0) {
      const parsedEvents = events.map(e => ({
        date: new Date(e.event_date || e.item_event_date),
        code: e.event_code || e.code
      })).filter(e => !isNaN(e.date.getTime()));

      if (parsedEvents.some(e => e.code === '6_INCT')) anyDamage = true;
      const firstTransit = parsedEvents.find(e => TRANSIT.includes(e.code));
      if (firstTransit && !parsedEvents.some(e => e.code === '1500' && e.date > firstTransit.date)) {
        maxTransit = Math.max(maxTransit, businessHours(firstTransit.date, now));
      }
      const firstManifest = parsedEvents.find(e => MANIFEST.includes(e.code));
      if (firstManifest && !parsedEvents.some(e => TRANSIT.includes(e.code))) {
        maxManifest = Math.max(maxManifest, businessHours(firstManifest.date, now));
      }
      let deliveryStart = null;
      parsedEvents.forEach(e => {
        if (DELIVERY.includes(e.code)) deliveryStart = e.date;
        else if (e.code === '1000') deliveryStart = null;
      });
      if (deliveryStart) maxDelivery = Math.max(maxDelivery, businessHours(deliveryStart, now));
      const lastStat = [...parsedEvents].reverse().find(e => STATIONARY.includes(e.code));
      if (lastStat) maxStationary = Math.max(maxStationary, businessHours(lastStat.date, now));
    }
  }

  return {
    ...incidencia,
    transit_hours: maxTransit,
    manifest_hours: maxManifest,
    delivery_hours: maxDelivery,
    stationary_hours: maxStationary,
    any_damage: anyDamage,
    items_raw: itemsRaw
  };
} catch (error) {
  throw new Error('[Code: Calcular Horas FW] ' + error.message);
}`;

  // Update original node to be "Preparar Contexto IA"
  nodeJS3.name = 'Code: Preparar Contexto IA FW';
  nodeJS3.position = [originalPos[0] + 250, originalPos[1]];
  nodeJS3.parameters.jsCode = `const data = $input.item.json;
const itemsRaw = data.items_raw || [];
let aggregatedInfo = [];

for (const it of itemsRaw) {
  const item_code = it.item_code || 'N/A';
  const events = Array.isArray(it.events) ? it.events : [];
  const historyLines = events.map(e => {
    const raw_date = e.event_date || e.item_event_date || '';
    const date = raw_date ? raw_date.substring(0, 10) + ' ' + raw_date.substring(11,16).replace('T', ' ') : 'N/A';
    const code = e.event_code || e.code || '???';
    const desc = e.event_description || e.description || '';
    const detail = e.detail?.External_event_text || e.detail?.item_event_text || '';
    return \`\${date} | [\${code}] \${desc}\${detail ? ' - ' + detail : ''}\`;
  });
  aggregatedInfo.push(\`Item: \${item_code}\\nHistorial:\\n\${historyLines.join('\\n')}\`);
}

return {
  shipping_code: data.numero_envio,
  numero_pedido: data.numero_pedido,
  tienda: data.tienda,
  credencial: data.credencial,
  incidencia_registrada: data.incidencia,
  bultos_text: aggregatedInfo.join('\\n\\n---\\n\\n'),
  transit_hours: data.transit_hours,
  manifest_hours: data.manifest_hours,
  delivery_hours: data.delivery_hours,
  stationary_hours: data.stationary_hours,
  any_damage: data.any_damage
};`;

  workflow.nodes.push(nodeCalc);
  console.log('  ✅ Split: Calcular Horas FW + Preparar Contexto IA FW');
}

// 3. Update AI Followup prompt
const nodeIA = workflow.nodes.find(n => n.name === 'IA Followup');
if (nodeIA) {
  const systemMsg = nodeIA.parameters.responses.values.find(v => v.role === 'system');
  if (systemMsg) {
    systemMsg.content = `Eres un auditor logístico de CTT Express. Tu misión es analizar si una incidencia registrada ayer sigue activa o se ha resuelto.

### REGLA DE ORO DE PRIORIDAD
Si el ÚLTIMO estado detectado es [2500], [2300], [2310] o [2000/2100]:
- sigue_incidencia: false (En estas fases ya hay un proceso de cierre o punto PUDO)
- FIN DEL ANÁLISIS.

### JERARQUÍA DE EVALUACIÓN
1. RESOLUCIÓN: ¿Hay un evento [1500] (En reparto) posterior a la incidencia? ¿Estado actual tránsito < 24h?
   - Si sí -> sigue_incidencia: false.
2. INCIDENCIA ACTIVA: ¿Último evento sigue siendo un fallo activo [1600, 1700, 1800, 2400, 2600, 2700]?
   - Si sí -> sigue_incidencia: true. Categoria: "Fallo Reparto".
3. ESTANCAMIENTO:
   - transit_hours > 24 -> sigue_incidencia: true. Categoria: "Transito Estancado".
   - delivery_hours > 24 -> sigue_incidencia: true. Categoria: "Reparto Estancado".

### FORMATO JSON
{
  "sigue_incidencia": true | false,
  "categoria": "Transito Estancado" | "Reparto Estancado" | "Fallo Reparto" | "Otros",
  "justificacion": "Breve explicación",
  "estado_actual": "Código CTT final"
}`;
    console.log('  ✅ IA Followup prompt updated');
  }
}

// 4. Transform Code FW JS2 into (Parse + Procesar Respuesta IA FW)
const nodeJS2 = workflow.nodes.find(n => n.name === 'Code FW JS2');
if (nodeJS2) {
  const originalPos = [...nodeJS2.position];
  
  // Create Parse node
  const nodeParse = JSON.parse(JSON.stringify(nodeJS2));
  nodeParse.name = 'Code: Parsear Respuesta IA FW';
  nodeParse.id = 'fw-parse-0001-0000-4000-8000-000000000001';
  nodeParse.position = [originalPos[0], originalPos[1]];
  nodeParse.parameters.jsCode = `const raw = $input.item.json;
const aiText = raw.output?.[0]?.content?.[0]?.text || '{}';
let aiData;
try {
  aiData = JSON.parse(aiText.replace(/\\\`\\\`\\\`json|\\\`\\\`\\\`/g, '').trim());
} catch (e) {
  aiData = { sigue_incidencia: true, categoria: 'Otros', justificacion: 'Error parsing AI response' };
}

const ctx = $('Code: Calcular Horas FW').item.json;

// Override Matemático (Paracaídas)
if (ctx.transit_hours > 24 || ctx.delivery_hours > 24 || ctx.stationary_hours > 24) {
  aiData.sigue_incidencia = true;
  if (!aiData.categoria || aiData.categoria === 'Otros') {
     if (ctx.transit_hours > 24) aiData.categoria = 'Transito Estancado';
     else if (ctx.delivery_hours > 24) aiData.categoria = 'Reparto Estancado';
  }
}

return {
  ...aiData,
  shipping_code: ctx.numero_envio || ctx.shipping_code,
  numero_pedido: ctx.numero_pedido,
  tienda: ctx.tienda,
  credencial: ctx.credencial,
  any_damage: ctx.any_damage
};`;

  // Update original node to be "Procesar Respuesta IA FW"
  nodeJS2.name = 'Code: Procesar Respuesta IA FW';
  nodeJS2.position = [originalPos[0] + 250, originalPos[1]];
  nodeJS2.parameters.jsCode = `const raw = $input.item.json;
const seg = raw.shipping_code;

let subject = \`SEGUIMIENTO: Incidencia en envio \${seg}\`;
let body = \`Hola, solicitamos gestion del envio \${seg} que sigue en incidencia.\`;

if (raw.sigue_incidencia) {
  if (raw.categoria === 'Transito Estancado') {
    subject = 'SOLICITAR RECOGIDA / AGILIZAR REPARTO';
    body = \`Hola equipo de CTT, solicitamos agilizar la gestión (recogida o entrega) del siguiente envío parado:
LISTADO DE ENVÍOS: - \${seg}. Gracias.\`;
  } 
  else if (raw.categoria === 'Reparto Estancado') {
    subject = 'SOLICITAR AGILIZAR REPARTO';
    body = \`Hola equipo de CTT, solicitamos agilizar la entrega del siguiente envío en reparto desde ayer:
EXPEDICIÓN: - \${seg}. Gracias.\`;
  }
  else if (raw.categoria === 'Fallo Reparto') {
    subject = 'SEGUNDO INTENTO (AUTOMÁTICO)';
    body = \`Hola CTT, tras la incidencia en el primer intento, solicitamos automáticamente un segundo intento para mañana:
EXPEDICIÓN: - \${seg}. Gracias.\`;
  }
}

return {
  ...raw,
  email_subject: subject,
  email_body: body
};`;

  workflow.nodes.push(nodeParse);
  console.log('  ✅ Split: Parsear Respuesta IA FW + Procesar Respuesta IA FW');
}

// 5. Update Preparar Alerta 0000
const node0000 = workflow.nodes.find(n => n.name === 'Preparar Alerta 0000');
if (node0000) {
  node0000.parameters.jsCode = node0000.parameters.jsCode.replace(
    /email_subject: .*,/,
    'email_subject: `ALERTA PENDIENTE (0000)`,'
  ).replace(
    /email_body: .*/,
    'email_body: `Hola, se ha detectado que el siguiente envío lleva más de 24 horas en estado 0000. Por favor, revisadlo.\\n\\nPEDIDO: - ${numeroPedido || shippingCode}`'
  );
  console.log('  ✅ Preparar Alerta 0000 templates updated');
}

// 6. Update Connections
const getConn = (name) => workflow.connections[name] || { main: [[]] };

// Obtener Historial FW -> Code: Calcular Horas FW
workflow.connections['Obtener Historial FW'] = { main: [[{ node: 'Code: Calcular Horas FW', type: 'main', index: 0 }]] };

// Code: Calcular Horas FW -> Code: Preparar Contexto IA FW
workflow.connections['Code: Calcular Horas FW'] = { main: [[{ node: 'Code: Preparar Contexto IA FW', type: 'main', index: 0 }]] };

// Code: Preparar Contexto IA FW -> IA Followup
workflow.connections['Code: Preparar Contexto IA FW'] = { main: [[{ node: 'IA Followup', type: 'main', index: 0 }]] };

// IA Followup -> Code: Parsear Respuesta IA FW
workflow.connections['IA Followup'] = { main: [[{ node: 'Code: Parsear Respuesta IA FW', type: 'main', index: 0 }]] };

// Code: Parsear Respuesta IA FW -> Code: Procesar Respuesta IA FW
workflow.connections['Code: Parsear Respuesta IA FW'] = { main: [[{ node: 'Code: Procesar Respuesta IA FW', type: 'main', index: 0 }]] };

// Code: Procesar Respuesta IA FW -> If Sigue Incidencia & If Daño FW
workflow.connections['Code: Procesar Respuesta IA FW'] = { 
  main: [
    [
      { node: 'If Sigue Incidencia', type: 'main', index: 0 },
      { node: 'If Daño FW', type: 'main', index: 0 }
    ]
  ] 
};

// Cleanup old connections if necessary (n8n usually handles this if source name changed but here the source name of the last node remains 'Code FW JS2' effectively renamed to 'Code: Procesar Respuesta IA FW')
delete workflow.connections['Code FW JS3'];
delete workflow.connections['Code FW JS2'];

console.log('  ✅ Connections updated');

writeFileSync(filePath, JSON.stringify(workflow, null, 2));
console.log('\n🎉 incidencias.json actualizado!');
