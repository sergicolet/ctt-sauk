const fs = require('fs');
let data = JSON.parse(fs.readFileSync('workflows/incidencias.json', 'utf8'));

const modelNode = data.nodes.find(n => n.name === 'IA Followup');
if (modelNode) {
    let prompt = modelNode.parameters.responses.values[1].content;

    // Define updated logic block based on explicacion-workflow.txt
    const updateHeader = `### REGLAS DE RESPUESTA (SEGÚN EXPLICACION-WORKFLOW.TXT)

1. CASO TRANSITO ESTANCADO (Regla 2): 
   - Si ayer estaba en Transito y hoy sigue en Transito (sin llegar a Reparto).
   - Email: "Buenos dias. El envio [SEG] estuvo en transito el dia anterior y hoy aun no ha cambiado a reparto. Solicitamos que el envio salga a reparto al dia siguiente. Gracias."
   
2. CASO REPARTO ESTANCADO (Regla 3):
   - Si ayer estaba en Reparto y hoy sigue en Reparto (sin entregarse).
   - Email: "Buenos dias. El envio [SEG] se encuentra en reparto desde ayer sin entregarse. Solicitamos que el pedido sea sacado nuevamente a reparto hoy mismo. Gracias."

3. CASO INCIDENCIA ACTIVA (Regla 4):
   - Si es la PRIMERA incidencia (1600, etc.).
   - Email: "Buenos dias. El envio [SEG] presenta su primera incidencia. Solicitamos explicitamente un segundo intento de reparto para el siguiente dia habil. Gracias."

4. CASO YA GESTIONADO O RESUELTO:
   - Si hay un 1500 (En reparto) tras una incidencia previa, o el estado ha avanzado a Entregado.
   - should_notify: false.
`;

    // We don't have separate fields for email in incidencias.json output yet, it uses a different schema.
    // Let's check incidencias.json schema again. 
    // It uses { "sigue_incidencia": boolean, "estado_actual": string, "justification": string }

    // Actually, incidencias.json doesn't send the email directly in the same node? 
    // Let me check the connections in incidencias.json.
}
