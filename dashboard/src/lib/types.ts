export interface Ejecucion {
  id: string;
  fecha_procesado: string;
  numero_envio: string;
  numero_pedido: string;
  tienda: string;
  centro: string;
  estado: string;
  fecha_estado: string;
  h_en_estado: number;
  email_enviado: boolean;
  tipo_email: string;
  razon: string;
  destinatario: string;
  credencial: string;
  transit_hours: number;
  delivery_hours: number;
  manifest_hours: number;
  forzado_interno: boolean;
  dano: boolean;
  isEjecucionOk?: boolean;
  asunto?: string;
  cuerpo?: string;
  email_subject?: string;
  email_body?: string;
  historial_formateado?: string;
  bultos_historial_json?: string;
  stationary_hours?: number;
}

export interface Incidencia {
  id: string;
  fecha_procesado: string;
  numero_envio: string;
  numero_pedido: string;
  tienda: string;
  centro: string;
  estado?: string;
  incidencia: string;
  fecha_incidencia: string;
  h_en_incidencia: number;
  tipo_email: string;
  razon: string;
  destinatario: string;
  credencial: string;
  numero_avisos: number;
  transit_hours: number;
  delivery_hours: number;
  manifest_hours: number;
  forzado_interno: boolean;
  dano: boolean;
  isEjecucionOk?: boolean;
  asunto?: string;
  cuerpo?: string;
  email_subject?: string;
  email_body?: string;
  historial_formateado?: string;
  bultos_historial_json?: string;
  stationary_hours?: number;
}

export interface Historial {
  id: string;
  fecha: string;
  numero_envio: string;
  numero_pedido: string;
  tienda: string;
  // Preparar Contexto: datos del envío enviados al modelo
  contexto: string;
  // Output del modelo IA
  ia_output: string;
  // Email enviado
  email_asunto: string;
  email_cuerpo: string;
  email_destinatario: string;
  tipo_email: string;
}
