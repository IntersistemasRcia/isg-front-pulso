/** Item de listado (GET /api/PulsoChat/Conversaciones). */
export type ConversationListItem = {
  id: string;
  titulo: string;
  createdDate: string | null;
  lastModifiedDate: string | null;
};

/** Mensaje persistido (detalle). */
export type ConversationMessageItem = {
  id: string;
  role: "user" | "assistant" | string;
  modelId: string | null;
  partsJson: string;
  orden: number;
  createdDate: string | null;
};

/** Detalle con mensajes (GET /api/PulsoChat/Conversaciones/{id}). */
export type ConversationDetail = {
  id: string;
  titulo: string;
  mensajes: ConversationMessageItem[];
};

/** Item para POST .../Mensajes. */
export type AppendMensajeInput = {
  role: "user" | "assistant";
  partsJson: string;
  modelId: string | null;
  orden: number;
};
