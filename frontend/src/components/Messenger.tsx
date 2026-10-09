"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { api, ApiError, post, User } from "@/lib/api";
import { useMessenger } from "@/lib/useMessenger";
import Auth from "./Auth";
import Sidebar from "./Sidebar";
import Chat from "./Chat";
import { NewChat, Details, Settings } from "./Dialogs";
import { SignalLogo } from "./ui";
export default function Messenger() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [dark, setDarkState] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  const expireSession = useCallback(() => {
    localStorage.removeItem("signal-session");
    setToken(null);
    setMe(null);
    notify("Session expired. Please sign in again.");
  }, [notify]);
  useEffect(() => {
    const saved = localStorage.getItem("signal-session");
    setDarkState(localStorage.getItem("signal-theme") === "dark");
    if (saved)
      api<User>("/me", saved)
        .then((user) => {
          setMe(user);
          setToken(saved);
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 401) localStorage.removeItem("signal-session");
          notify((e as Error).message);
        })
        .finally(() => setReady(true));
    else setReady(true);
    return () => clearTimeout(timer.current);
  }, [notify]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  function setDark(value: boolean) {
    setDarkState(value);
    localStorage.setItem("signal-theme", value ? "dark" : "light");
  }
  function login(value: string, user: User) {
    localStorage.setItem("signal-session", value);
    setToken(value);
    setMe(user);
  }
  async function logout() {
    try {
      await api("/auth/logout", token, post());
      localStorage.removeItem("signal-session");
      setMe(null);
      setToken(null);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      {!ready ? (
        <div className="loading">
          <SignalLogo />
          <p>Opening your conversations…</p>
        </div>
      ) : token && me ? (
        <Workspace
          token={token}
          me={me}
          onProfile={setMe}
          onLogout={logout}
          dark={dark}
          setDark={setDark}
          notify={notify}
          onSessionExpired={expireSession}
        />
      ) : (
        <Auth onLogin={login} />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
function Workspace({
  token,
  me,
  onProfile,
  onLogout,
  dark,
  setDark,
  notify,
  onSessionExpired,
}: {
  token: string;
  me: User;
  onProfile: (u: User) => void;
  onLogout: () => Promise<void>;
  dark: boolean;
  setDark: (v: boolean) => void;
  notify: (m: string) => void;
  onSessionExpired: () => void;
}) {
  const state = useMessenger(token, me, notify, onSessionExpired);
  const [dialog, setDialog] = useState<"new" | "details" | "settings" | null>(
    null,
  );
  const close = useCallback(() => setDialog(null), []);
  const chat = state.conversations.find((c) => c.id === state.active);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !dialog) {
        if (window.innerWidth <= 700) {
          state.setActive(null);
          requestAnimationFrame(() =>
            document.getElementById("chat-search")?.focus(),
          );
        }
        e.preventDefault();
        document.getElementById("chat-search")?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setDialog("new");
      }
      if (e.key === "Escape" && !dialog) state.setActive(null);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [dialog, state.setActive]);
  async function openContact(user: User) {
    try {
      const c = await api<{ id: number }>(
        "/conversations/direct",
        token,
        post({ user_id: user.id }),
      );
      await state.refresh();
      state.setActive(c.id);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <main className={`messenger ${state.active ? "chat-open" : ""}`}>
      <Sidebar
        me={me}
        chats={state.conversations}
        contacts={state.contacts}
        active={state.active}
        onSelect={state.setActive}
        onNew={() => setDialog("new")}
        onSettings={() => setDialog("settings")}
        onContact={(user) => void openContact(user)}
        onPreference={state.setPreference}
        onMarkRead={state.markRead}
        notify={notify}
      />
      <Chat
        token={token}
        onReact={state.react}
        onEdit={state.edit}
        onDelete={state.remove}
        chat={chat}
        me={me}
        messages={state.messages}
        connected={state.connected}
        typing={state.typing}
        onSend={state.send}
        onTyping={state.sendTyping}
        onBack={() => state.setActive(null)}
        onInfo={() => setDialog("details")}
        notify={notify}
        onOlder={state.older}
        hasOlder={state.hasOlder}
      />
      {dialog === "new" && (
        <NewChat
          token={token}
          me={me}
          contacts={state.contacts}
          onClose={close}
          onCreated={(id) => {
            state.setActive(id);
            close();
          }}
          refresh={state.refresh}
          notify={notify}
        />
      )}{" "}
      {dialog === "details" && chat && (
        <Details
          token={token}
          me={me}
          chat={chat}
          contacts={state.contacts}
          onClose={close}
          refresh={state.refresh}
          notify={notify}
        />
      )}{" "}
      {dialog === "settings" && (
        <Settings
          token={token}
          me={me}
          onProfile={onProfile}
          onLogout={onLogout}
          dark={dark}
          setDark={setDark}
          onClose={close}
          notify={notify}
        />
      )}
    </main>
  );
}
