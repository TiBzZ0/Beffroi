// B11 : réglages et types du chat, partagés entre le client et le serveur.

export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY = 50;
/** Un message toutes les 3 secondes au plus par joueur. */
export const CHAT_COOLDOWN_MS = 3_000;
export const CHAT_REACTIONS = ["👍", "⚔️", "🛡️", "🏗️", "😂", "❤️"] as const;

export type ChatChannel = "general" | "alliance";

export interface ChatMessage {
  id: number;
  at: number;
  userId: string;
  name: string;
  body: string;
  reactions: Record<string, string[]>;
}

export interface ChatView {
  channel: ChatChannel;
  /** Faux si le joueur demande le canal d'alliance sans en avoir. */
  available: boolean;
  messages: ChatMessage[];
}

