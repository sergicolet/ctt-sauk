const fs = require('fs');

let data = JSON.parse(fs.readFileSync('workflows/main.json', 'utf8'));

const modelNode = data.nodes.find(n => n.name === 'Message a model');

if (modelNode) {
    let prompt = modelNode.parameters.responses.values[1].content;

    // We need to inject the rule logic about Transit 0900/1000
    // Currently we have:
    // - 0900 / 1000 -> > 24h en transito

    // We will replace the entire "### ALERTAS CON UMBRAL" section
    const oldUmbralSection = `### ALERTAS CON UMBRAL
Notificar solo si supera las horas indicadas:
- 0000 / 0030 → > 24h sin movimiento
- 0900 / 1000 → > 24h en transito
- 1200 / 1500 → > 24h en ciclo de reparto
- 1700 / 1800 → > 24h estacionado

### ALERTAS SIN UMBRAL`;

    const newUmbralSection = `### ALERTAS CON UMBRAL
Notificar solo si supera las horas indicadas:
- 0000 / 0030 → > 24h sin movimiento
- 1200 / 1500 → > 24h en ciclo de reparto
- 1700 / 1800 → > 24h estacionado

### REGLA ESPECIAL TRANSITO (SLA 24-48H)
El tiempo en transito se mide DESDE el momento en que se documentó originalmente el tránsito, hasta que llega a reparto.
Reglas OBLIGATORIAS para transito:
1. Buscar el primer evento \`0900\` o \`1000\` de todo el historial.
2. Calcular las horas laborables transcurridas desde ESE primer evento hasta la hora actual.
3. Ignorar todas las actualizaciones intermedias (como nuevos 1000, 71_INAT o cualquier otro evento que no sea salida a reparto).
4. Si las horas laborables desde que empezó a estar en tránsito son mayores a 24 horas y todavía no hay un 1200 o 1500, notificar (should_notify: true).
5. Esta regla tiene prioridad absoluta sobre "mensajes de gestion interna" como el 71_INAT.

### ALERTAS SIN UMBRAL`;

    // Also update "NO NOTIFICAR si:"
    // Evento MANAGEMENTS con code 71_INAT -> ya gestionado, no notificar.
    // Let's modify that to say "A MENOS QUE se incumpla la regla especial de transito"
    const oldInatRule = `- Evento MANAGEMENTS con code 71_INAT → ya gestionado, no notificar. Si el ultimo evento es 71_INAT → should_notify: false SIEMPRE, sin excepcion. 71_INAT significa que CTT ya ha gestionado la incidencia internamente.`;
    const newInatRule = `- Evento 71_INAT → ya gestionado. Si el ultimo evento es 71_INAT → should_notify: false, EXCEPTO si se incumple la REGLA ESPECIAL TRANSITO (en cuyo caso notifica por retraso en transito igualmente).`;

    prompt = prompt.replace(oldUmbralSection, newUmbralSection);
    prompt = prompt.replace(oldInatRule, newInatRule);

    // We also need to fix the template text
    // - 0900/1000: "Buenos dias. El envio [SEG] no avanza de estado desde hace mas de 24 horas. Se encuentra en transito sin actualizacion. Rogamos su gestion. Gracias."
    const oldTransitText = `- 0900/1000: "Buenos dias. El envio [SEG] no avanza de estado desde hace mas de 24 horas. Se encuentra en transito sin actualizacion. Rogamos su gestion. Gracias."`;
    const newTransitText = `- 0900/1000: "Buenos dias. El envio [SEG] lleva mas de 24h habiles en transito sin salir a reparto (SLA incumplido). Rogamos su gestion urgente. Gracias."`;

    prompt = prompt.replace(oldTransitText, newTransitText);

    modelNode.parameters.responses.values[1].content = prompt;
    fs.writeFileSync('workflows/main.json', JSON.stringify(data, null, 2), 'utf8');
    console.log("SLA Transit rules patched in main.json.");
} else {
    console.log("Could not find IA node in main.json");
}
