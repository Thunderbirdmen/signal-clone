export const API = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");
export const WS = API.replace(/^http/, "ws") + "/ws";
export const AVATARS = [
  "💙",
  "🌿",
  "🌸",
  "🏔️",
  "☀️",
  "🎨",
  "🚀",
  "🐱",
  "🌊",
  "🎧",
  "🦊",
  "🌻",
];
export type User = {
  id: number;
  username: string;
  display_name: string;
  avatar: string;
  online: boolean;
  last_seen: string;
  role?: "admin" | "member";
};
export type Upload = { name: string; data: string };
export type Reaction = { emoji: string; user_id: number; display_name: string };
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "🔥"];
export const TIMERS = [
  [0, "Off"],
  [10, "10 seconds (demo)"],
  [60, "1 minute"],
  [3600, "1 hour"],
  [86400, "1 day"],
  [604800, "1 week"],
] as const;
export function timerLabel(seconds: number) {
  return TIMERS.find((t) => t[0] === seconds)?.[1] || "Off";
}
export type Message = {
  deleted_at?: string | null;
  edited_at?: string | null;
  expires_at?: string | null;
  reply_expires_at?: string | null;
  attachment?: { name: string; media_type: string; size: number } | null;
  upload?: Upload;
  reactions?: Reaction[];
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar: string;
  body: string;
  created_at: string;
  client_id: string;
  reply_to: number | null;
  reply_body?: string;
  reply_sender?: string;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
};
export type Conversation = {
  disappear_seconds: number;
  id: number;
  kind: "direct" | "group";
  name: string | null;
  created_at: string;
  members: User[];
  last_message: Message | null;
  unread: number;
};
export async function api<T>(
  path: string,
  token: string | null,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(API + path, {
    signal: AbortSignal.timeout(15000),
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Request failed (${response.status}).`,
    );
  }
  return response.json();
}
export const post = (data: unknown = {}) => ({
  method: "POST",
  body: JSON.stringify(data),
});
export function title(c: Conversation, me: number) {
  return c.kind === "group"
    ? c.name || "Group"
    : c.members.find((m) => m.id !== me)?.display_name || "Conversation";
}
export function avatar(c: Conversation, me: number) {
  return c.kind === "group"
    ? "👥"
    : c.members.find((m) => m.id !== me)?.avatar || "💙";
}
export function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function dayLabel(value: string) {
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString()
    ? "Today"
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
