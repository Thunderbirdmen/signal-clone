import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, post, WS, User, Message, Conversation, Upload } from "./api";
export function useMessenger(
  token: string,
  me: User,
  notify: (message: string) => void,
  onSessionExpired: () => void,
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const [typing, setTyping] = useState<
    Record<number, { name: string; until: number }>
  >({});
  const [hasOlder, setHasOlder] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // Coalesce simultaneous socket, focus and polling refreshes into one fetch loop.
  const running = useRef(false);
  const again = useRef(false);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const selected = activeRef.current;
        const [chats, people] = await Promise.all([
          api<Conversation[]>("/conversations", token),
          api<User[]>("/contacts", token),
        ]);
        if (!alive.current) return;
        setConversations(chats);
        setContacts(people);
        if (selected && !chats.some((c) => c.id === selected)) {
          setActive(null);
          setMessages([]);
          continue;
        }
        if (selected) {
          // Capture the selection; a slow response must not overwrite a newer chat.
          const latest = await api<Message[]>(
            `/conversations/${selected}/messages`,
            token,
          );
          if (activeRef.current !== selected) continue;
          setMessages((prev) => {
            const current = new Set(latest.map((m) => m.id));
            const floor = latest.length ? latest[0].id : Infinity;
            const map = new Map(
              prev
                .filter((m) => m.conversation_id === selected && (m.id < floor || current.has(m.id)))
                .map((m) => [m.id, m]),
            );
            latest.forEach((m) => map.set(m.id, m));
            return [...map.values()].sort((a, b) => a.id - b.id);
          });
          setPending((prev) =>
            prev.filter(
              (p) => !latest.some((m) => m.client_id === p.client_id),
            ),
          );
          if (document.visibilityState === "visible" && document.hasFocus()) {
            await api(`/conversations/${selected}/read`, token, post());
            setConversations((prev) =>
              prev.map((c) => (c.id === selected ? { ...c, unread: 0 } : c)),
            );
          }
        }
      } while (again.current);
    } catch (e) {
      if (alive.current) {
        if (e instanceof ApiError && e.status === 401) onSessionExpired();
        else notifyRef.current((e as Error).message);
      }
    } finally {
      running.current = false;
    }
  }, [token, onSessionExpired]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let reconnect: ReturnType<typeof setTimeout>;
    let failures = 0;
    function connect() {
      const ws = new WebSocket(WS);
      socket.current = ws;
      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        failures = 0;
        ws.send(JSON.stringify({ token }));
        setConnected(true);
        void refresh();
      };
      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "sync") {
          if (event.tombstoned_id) {
            setMessages((prev) => prev.map((m) => m.reply_to === event.tombstoned_id ? {...m, reply_body: "This message was deleted"} : m));
          }
          if (event.deleted_ids) {
            const deleted = new Set<number>(event.deleted_ids);
            setMessages((prev) =>
              prev
                .filter((m) => !deleted.has(m.id))
                .map((m) =>
                  m.reply_to && deleted.has(m.reply_to)
                    ? {
                        ...m,
                        reply_to: null,
                        reply_body: undefined,
                        reply_sender: undefined,
                      }
                    : m,
                ),
            );
          }
          if (event.message_id && event.conversation_id === activeRef.current) {
            const selected = activeRef.current;
            void api<Message[]>(
              `/conversations/${selected}/messages?before=${event.message_id + 1}&limit=1`,
              token,
            )
              .then((rows) => {
                if (activeRef.current !== selected) return;
                const updated = rows.find((m) => m.id === event.message_id);
                if (updated)
                  setMessages((prev) =>
                    prev.map((m) => (m.id === updated.id ? updated : m)),
                  );
              })
              .catch(() => {});
          }
          void refresh();
          if (
            event.sender_id &&
            event.sender_id !== me.id &&
            event.conversation_id !== activeRef.current &&
            !conversationsRef.current.find((c) => c.id === event.conversation_id)?.muted
          )
            notifyRef.current("New message received");
        }
        if (event.type === "typing")
          setTyping((prev) => ({
            ...prev,
            [event.conversation_id]: {
              name: event.name,
              until: Date.now() + 3500,
            },
          }));
      };
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled)
          reconnect = setTimeout(
            connect,
            Math.min(1000 * 2 ** failures++, 15000),
          );
      };
      ws.onerror = () => ws.close();
    }
    connect();
    const heartbeat = setInterval(() => {
      if (socket.current?.readyState === WebSocket.OPEN)
        socket.current.send(JSON.stringify({ type: "ping" }));
    }, 20000);
    const polling = setInterval(() => void refresh(), 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      alive.current = false;
      cancelled = true;
      clearTimeout(reconnect);
      clearInterval(heartbeat);
      clearInterval(polling);
      socket.current?.close();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [token, me.id, refresh]);
  useEffect(() => {
    setMessages([]);
    setHasOlder(true);
    setTyping({});
    void refresh();
  }, [active, refresh]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setTyping((prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(([, v]) => v.until > Date.now()),
          ),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  async function send(
    body: string,
    reply: Message | null,
    retry?: Message,
    upload?: Upload,
  ) {
    const cid = retry?.conversation_id || activeRef.current;
    if (!cid) return;
    const optimistic: Message = retry
      ? { ...retry, status: "sending" }
      : {
          id: -Date.now(),
          conversation_id: cid,
          sender_id: me.id,
          sender_name: me.display_name,
          sender_avatar: me.avatar,
          body: body.trim() || upload?.name || "",
          upload,
          attachment: upload
            ? {
                name: upload.name,
                media_type: "application/octet-stream",
                size: Math.floor((upload.data.length * 3) / 4),
              }
            : null,
          created_at: new Date().toISOString(),
          client_id: crypto.randomUUID(),
          reply_to: reply?.id || null,
          reply_body: reply?.body,
          reply_sender: reply?.sender_name,
          status: "sending",
        };
    setPending((prev) => [
      ...prev.filter((m) => m.client_id !== optimistic.client_id),
      optimistic,
    ]);
    try {
      await api(
        `/conversations/${cid}/messages`,
        token,
        post({
          body: optimistic.body,
          client_id: optimistic.client_id,
          reply_to: optimistic.reply_to,
          attachment: optimistic.upload,
        }),
      );
      setPending((prev) =>
        prev.map((m) =>
          m.client_id === optimistic.client_id ? { ...m, status: "sent" } : m,
        ),
      );
      await refresh();
    } catch (e) {
      setPending((prev) =>
        prev.map((m) =>
          m.client_id === optimistic.client_id ? { ...m, status: "failed" } : m,
        ),
      );
      notifyRef.current((e as Error).message);
    }
  }
  async function older() {
    const cid = activeRef.current;
    if (!cid || !messages.length) {
      setHasOlder(false);
      return;
    }
    try {
      const rows = await api<Message[]>(
        `/conversations/${cid}/messages?before=${messages[0].id}`,
        token,
      );
      if (cid !== activeRef.current) return;
      setHasOlder(rows.length === 50);
      setMessages((prev) => {
        const map = new Map([...rows, ...prev].map((m) => [m.id, m]));
        return [...map.values()].sort((a, b) => a.id - b.id);
      });
    } catch (e) {
      notifyRef.current((e as Error).message);
    }
  }
  async function react(message: Message, emoji: string) {
    try {
      await api(
        `/conversations/${message.conversation_id}/messages/${message.id}/reactions`,
        token,
        post({ emoji }),
      );
      await refresh();
    } catch (e) {
      notifyRef.current((e as Error).message);
    }
  }
  async function edit(message: Message, body: string): Promise<boolean> {
    try {
      await api(`/conversations/${message.conversation_id}/messages/${message.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
      await refresh();
      return true;
    } catch (e) {
      notifyRef.current((e as Error).message);
      return false;
    }
  }
  async function remove(message: Message, scope: "me" | "everyone"): Promise<boolean> {
    try {
      await api(`/conversations/${message.conversation_id}/messages/${message.id}?scope=${scope}`, token, { method: "DELETE" });
      if (scope === "me") setMessages((prev) => prev.filter((m) => m.id !== message.id));
      await refresh();
      return true;
    } catch (e) {
      notifyRef.current((e as Error).message);
      return false;
    }
  }
  // Remove expired content even if the socket is temporarily disconnected.
  useEffect(() => {
    const timer = setInterval(
      () =>
        setMessages((prev) =>
          prev
            .filter(
              (m) => !m.expires_at || Date.parse(m.expires_at) > Date.now(),
            )
            .map((m) =>
              m.reply_expires_at && Date.parse(m.reply_expires_at) <= Date.now()
                ? {
                    ...m,
                    reply_to: null,
                    reply_body: undefined,
                    reply_sender: undefined,
                  }
                : m,
            ),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  function sendTyping() {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(
        JSON.stringify({ type: "typing", conversation_id: activeRef.current }),
      );
  }
  async function setPreference(c: Conversation, field: "pinned" | "muted" | "archived", value: boolean) {
    try {
      await api(`/conversations/${c.id}/preferences`, token, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
      if (field === "archived" && value && activeRef.current === c.id) setActive(null);
      await refresh();
    } catch (e) {
      notifyRef.current((e as Error).message);
    }
  }
  async function markRead(cid: number) {
    try {
      await api(`/conversations/${cid}/read`, token, post());
      await refresh();
    } catch (e) {
      notifyRef.current((e as Error).message);
    }
  }
  return {
    conversations,
    contacts,
    active,
    setActive,
    messages: [
      ...messages,
      ...pending.filter(
        (m) =>
          m.conversation_id === active &&
          !messages.some((x) => x.client_id === m.client_id),
      ),
    ],
    connected,
    typing: active ? typing[active]?.name : undefined,
    refresh,
    send,
    sendTyping,
    react,
    edit,
    remove,
    older,
    hasOlder,
    setPreference,
    markRead,
  };
}
