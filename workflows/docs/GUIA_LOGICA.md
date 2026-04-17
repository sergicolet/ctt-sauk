# Guía de Funcionamiento de Workflows (Contexto No Técnico)

Esta guía explica qué hace cada nodo de los flujos automáticos de CTT Last Mile para que cualquier persona pueda entender el proceso sin necesidad de saber programación.

---

## 1. Workflow: `main.json` (Procesamiento Diario)
Este es el motor principal. Se encarga de descargar los envíos del día, analizar su estado y avisar si algo va mal.

### Fase Inicial: Descarga y Preparación
- **Trigger**: El "despertador" que inicia el proceso automáticamente cada hora (de lunes a viernes).
- **Token CTT**: Los "pases de acceso" para que el sistema pueda entrar a la base de datos de CTT Express.
- **Call SubWf**: Descarga todos los envíos activos de cada tienda.
- **Merge**: Junta los resultados de todas las tiendas (Haminos, Snappy, etc.).
- **Enriquecer Cliente**: Busca quién es el cliente para tener su contacto.

### Fase de Análisis (El "Cerebro")
- **Filter: Estados Activos**: Limpia la lista de envíos antiguos.
- **Loop**: Abre cada paquete para inspeccionarlo uno por uno.
- **Calculadora de SLA**: Mide cuánto tiempo lleva el paquete en cada fase (transporte, reparto, etc.).
- **IA Followup**: Una Inteligencia Artificial lee el historial del paquete y decide qué está pasando.

### Fase de Seguridad y Notificación
- **Paracaídas (Override)**: Si la IA falla pero el paquete lleva más de 24h parado, el sistema fuerza un aviso por seguridad.
- **Procesar Respuesta**: Elige la plantilla adecuada. **Mejora**: Si el envío ya tiene avisos previos (re-incidencia), redirige el email al equipo interno con el prefijo `[RE-INCIDENCIA]` para evitar saturar a CTT.
- **Gmail Send**: Envía el correo electrónico desde la cuenta oficial de la tienda.
- **Continuidad del Bucle (Skip)**: Si un envío resulta estar ya entregado tras analizar el historial, el sistema lo marca para "saltar" y continuar con el siguiente, evitando que el proceso se detenga por falta de datos.


---

## 2. Workflow: `incidencias.json` (Seguimiento de Problemas)
Este flujo revisa los problemas que detectamos ayer para ver si CTT los ha solucionado.

### Seguimiento de Errores (Incidencias de Ayer)
- **Consultar Base de Datos**: Lee los problemas que quedaron abiertos ayer.
- **IA Followup**: Decide si el paquete ya se movió o si hay que volver a reclamar a CTT.
- **Update Resuelta**: Si el paquete ya se entregó, lo marca como solucionado.

### Alerta de Paquetes No Recogidos (Rama 0000)
- **Alerta Pendiente**: Detecta paquetes que están en el almacén pero que CTT no ha pasado a recoger en 24h.
- **Aviso Urgente**: Envía un correo al equipo de logística interno.

---

## 3. Herramienta: `manual-refresh.json` (Actualización bajo Demanda)
Esta herramienta permite a un usuario del Dashboard forzar la actualización de un pedido en cualquier momento sin esperar al proceso automático.

### Proceso de Refresco
- **Webhook**: Recibe la orden desde el botón "Actualizar Tracking" del Dashboard.
- **Preparar Variables**: Identifica automáticamente de qué tienda es el pedido para usar las credenciales correctas.
- **Consultar CTT**: Pide a la API de CTT Express el historial completo y en tiempo real de todos los bultos del envío.
- **Update Firestore (Upsert)**: Sobrescribe la información en la base de datos con los datos frescos. Marca la fecha con la etiqueta `(Manual)` y añade la razón para que se sepa que fue una intervención humana.

---

## Glosario
*   **SLA**: Tiempo máximo permitido de espera (ej. 24h).
*   **Internal**: Mensajes internos (Saludo: "Hola").
*   **Standard**: Mensajes a CTT (Saludo: "Buenos días").
*   **Manual Refresh**: Fuerza la sincronización con CTT sin activar el análisis de la IA ni enviar correos.
