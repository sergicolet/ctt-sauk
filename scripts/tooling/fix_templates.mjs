import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FILES = [
  { path: join(__dirname, '..', '..', 'workflows', 'main.json'), nodeName: 'Code: Procesar Respuesta IA' },
  { path: join(__dirname, '..', '..', 'workflows', 'incidencias.json'), nodeName: 'Code: Procesar Respuesta IA FW' }
];

const updateFile = (filePath, nodeName) => {
  const workflow = JSON.parse(readFileSync(filePath, 'utf-8'));
  const node = workflow.nodes.find(n => n.name === nodeName);
  
  if (!node) {
    console.log(`❌ Node not found: ${nodeName} in ${filePath}`);
    return;
  }

  // Logic for the main AI Processing nodes
  node.parameters.jsCode = `const raw = $input.item.json;
const SEG = raw.shipping_code;
const PED = raw.numero_pedido;

const TEMPLATES = {
  pendiente:         { subject: 'ALERTA PENDIENTE (0000)',                                     body: 'Hola, se ha detectado que el siguiente envío lleva más de 24 horas en estado 0000. Por favor, revisadlo.\\nPEDIDO: - ' + (PED || SEG) },
  devolucion:        { subject: 'Devolución en proceso: ' + (PED || SEG),                        body: 'Hola, el siguiente pedido ha entrado en proceso de devolución. Iniciamos seguimiento manual.\\nCÓDIGO: - ' + SEG },
  siniestro:         { subject: 'Apertura de siniestro: ' + (PED || SEG),                        body: 'Buenos días CTT, solicitamos la apertura oficial de expediente de siniestro por pérdida/daño para el envío:\\nREFERENCIA: - ' + SEG + '. Quedamos a la espera del número de expediente.' },
  segundo_intento:   { subject: 'Incidencia en el envío ' + (PED || SEG),                        body: 'Buenos días. Tras la incidencia en el primer intento, solicitamos automáticamente un segundo intento de reparto para el siguiente día hábil.\\nEXPEDICIÓN: - ' + SEG + '. Gracias.' },
  recogida_fallida:  { subject: 'Incidencia en el envío ' + (PED || SEG),                        body: 'Buenos días. Solicitamos que se reintente la recogida fallida del siguiente envío:\\nEXPEDICIÓN: - ' + SEG + '. Gracias.' },
  agilizar_transito: { subject: 'Incidencia en el envío ' + (PED || SEG),                        body: 'Buenos días. El envío ' + SEG + ' lleva más de 24 horas en tránsito sin pasar a reparto. Solicitamos que salga a reparto el próximo día hábil. Gracias.' },
  agilizar_reparto:  { subject: 'Incidencia en el envío ' + (PED || SEG),                        body: 'Buenos días. El envío ' + SEG + ' lleva más de 24 horas en reparto sin entregarse. Solicitamos que sea sacado nuevamente a reparto hoy mismo. Gracias.' },
  punto_ctt:         { subject: 'Envío en punto CTT: ' + (PED || SEG),                           body: 'Buenos días. Necesitamos la dirección detallada del punto de recogida para el siguiente envío:\\nEXPEDICIÓN: - ' + SEG + '. Gracias de antemano.' },
  recogida_0030:     { subject: 'Incidencia en el envío ' + (PED || SEG),                        body: 'Buenos días. Solicitamos agilizar la recogida del siguiente envío que lleva más de 24 horas pendiente:\\nLISTADO DE ENVÍOS: - ' + SEG + '. Gracias.' },
};

let res = { ...raw, email_subject: '', email_body: '', target_type: 'none', to_email: '' };

const active = raw.sigue_incidencia === true || raw.is_incident === true || raw.should_notify === true;

if (active) {
  const cat = (raw.notification_type || raw.categoria || raw.decision || 'Otros').toLowerCase();
  
  if (cat.includes('reparto_estancado') || cat.includes('agilizar_reparto')) { 
    res.target_type = 'standard'; res.email_subject = TEMPLATES.agilizar_reparto.subject; res.email_body = TEMPLATES.agilizar_reparto.body; 
  }
  else if (cat.includes('transito_estancado') || cat.includes('agilizar_transito')) { 
    res.target_type = 'standard'; res.email_subject = TEMPLATES.agilizar_transito.subject; res.email_body = TEMPLATES.agilizar_transito.body; 
  }
  else if (cat.includes('segundo_intento') || cat.includes('fallo reparto')) { 
    res.target_type = 'standard'; res.email_subject = TEMPLATES.segundo_intento.subject; res.email_body = TEMPLATES.segundo_intento.body; 
  }
  else if (cat.includes('punto_ctt') || cat.includes('pudo') || cat.includes('2300') || cat.includes('2310')) { 
    res.target_type = 'standard'; res.email_subject = TEMPLATES.punto_ctt.subject; res.email_body = TEMPLATES.punto_ctt.body; 
  }
  else if (cat.includes('recogida_fallida') || cat.includes('0600')) {
    res.target_type = 'standard'; res.email_subject = TEMPLATES.recogida_fallida.subject; res.email_body = TEMPLATES.recogida_fallida.body;
  }
  else if (cat.includes('pendiente') || cat.includes('0000')) { 
    res.target_type = 'internal'; res.email_subject = TEMPLATES.pendiente.subject; res.email_body = TEMPLATES.pendiente.body; 
  }
  else if (cat.includes('recogida_0030') || cat.includes('0030')) {
    res.target_type = 'standard'; res.email_subject = TEMPLATES.recogida_0030.subject; res.email_body = TEMPLATES.recogida_0030.body;
  }
  else if (cat.includes('devolucion') || cat.includes('2500')) { 
    res.target_type = 'internal'; res.email_subject = TEMPLATES.devolucion.subject; res.email_body = TEMPLATES.devolucion.body; 
  }
  else if (cat.includes('siniestro') || cat.includes('6_inct') || cat.includes('1006') || cat.includes('1008') || cat.includes('1012')) { 
    res.target_type = 'internal'; res.email_subject = TEMPLATES.siniestro.subject; res.email_body = TEMPLATES.siniestro.body; 
  }
  else {
    res.target_type = 'internal';
    res.email_subject = 'Gestión Urgente: ' + SEG;
    res.email_body = 'Hola, se requiere revisión manual para el envío ' + SEG + '.\\nJustificación: ' + (raw.justificacion || raw.justification || raw.ai_justification || 'Sin detalle');
  }

  const avisos = parseInt(raw.numero_avisos) || 0;
  if (avisos > 0 && res.target_type === 'standard') {
    res.target_type = 'internal';
    res.email_subject = '[RE-INCIDENCIA] ' + res.email_subject;
    res.email_body = 'Hola equipo, este envío ya fue notificado a CTT (' + avisos + ' veces) y sigue sin solución. Por favor, gestionad manualmente.\\n\\n--- MENSAJE ORIGINAL ---\\n' + res.email_body;
  }

  if (res.target_type === 'internal') {
    res.to_email = raw.internal_email || 'incidenciasamzdiscounts01@gmail.com';
  } else if (res.target_type === 'standard') {
    res.to_email = raw.cca_zone || 'cca.z3@cttexpress.com';
  }
}

return res;`;

  // Update specific incidencias 0000 node if it exists in this file
  const node0000 = workflow.nodes.find(n => n.name === 'Preparar Alerta 0000');
  if (node0000) {
    node0000.parameters.jsCode = `const pedido = $input.item.json;
const SEG = pedido.shipping_code;
const PED = (pedido.client_references && pedido.client_references[0]) || '';
const centerCode = String(pedido.client_center_code || '');
const credencial = pedido.credencial;

const emailMap = {
  'HAMINOS': 'incidenciashaminos@gmail.com',
  'MIESTERY': 'incidenciasamzdiscounts01@gmail.com',
  'KULTUDENDA': 'incidenciaskulturdenda@gmail.com',
  'SNAPPY': 'incidenciassnappyblue@gmail.com'
};
const destinatario = emailMap[credencial] || '';

return [{
  json: {
    shipping_code: SEG,
    numero_pedido: PED,
    tienda: credencial,
    centro: centerCode,
    credencial,
    fecha_estado: pedido.fecha_estado_local || '',
    destinatario,
    to_email: destinatario,
    email_subject: 'ALERTA PENDIENTE (0000)',
    email_body: 'Hola, se ha detectado que el siguiente envío lleva más de 24 horas en estado 0000. Por favor, revisadlo.\\nPEDIDO: - ' + (PED || SEG)
  }
}];`;
    console.log(`  ✅ Preparar Alerta 0000 updated in ${filePath}`);
  }

  writeFileSync(filePath, JSON.stringify(workflow, null, 2));
  console.log(`✅ ${filePath} updated.`);
};

FILES.forEach(f => updateFile(f.path, f.nodeName));
