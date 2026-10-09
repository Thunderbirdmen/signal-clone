import { useEffect, useState } from "react";
import {
  UserPlus,
  Users,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  Shield,
  Bell,
  Monitor,
  Check,
  NotebookPen,
} from "lucide-react";
import {
  api,
  post,
  AVATARS,
  User,
  Conversation,
  avatar,
  title,
} from "@/lib/api";
import { Modal, Avatar } from "./ui";
type Common = {
  token: string;
  onClose: () => void;
  notify: (s: string) => void;
};
export function NewChat({
  token,
  me,
  contacts,
  onClose,
  onCreated,
  refresh,
  notify,
}: Common & {
  me: User;
  contacts: User[];
  onCreated: (id: number) => void;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"chat" | "group" | "contact">("chat");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [members, setMembers] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const people = contacts.filter((c) =>
    `${c.display_name} ${c.username}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Modal
      title={
        tab === "group"
          ? "New group"
          : tab === "contact"
            ? "Add a contact"
            : "New conversation"
      }
      onClose={onClose}
    >
      <div className="dialog-tabs">
        {(["chat", "group", "contact"] as const).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              setError("");
            }}
          >
            {t === "chat"
              ? "Message"
              : t === "group"
                ? "New group"
                : "Add contact"}
          </button>
        ))}
      </div>
      {tab === "contact" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await api("/contacts", token, post({ username }));
              await refresh();
              setTab("chat");
              setUsername("");
              notify("Contact added");
            });
          }}
        >
          <p className="help-text">
            Add someone who has registered in this demo. Try <b>riley</b>, or
            ask a friend to create an account.
          </p>
          <label>
            Username or phone number
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={64}
              placeholder="e.g. riley"
            />
          </label>
          <button className="primary wide" disabled={busy}>
            Add contact <UserPlus size={17} />
          </button>
        </form>
      ) : (
        <>
          {tab === "chat" && (
            <button
              className="note-self-row"
              disabled={busy}
              onClick={() => void action(async () => {
                const conversation = await api<{ id: number }>(
                  "/conversations/direct", token, post({ user_id: me.id }),
                );
                await refresh();
                onCreated(conversation.id);
              })}
            >
              <NotebookPen size={20} aria-hidden="true" />
              <span><strong>Note to Self</strong><small>Keep a thought for later</small></span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          )}
          {tab === "group" && (
            <label>
              Group name
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="Give your group a name"
              />
            </label>
          )}
          <input
            className="contact-search"
            aria-label="Search contacts"
            placeholder="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="contact-list">
            {people.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                className="person-row"
                onClick={() =>
                  tab === "group"
                    ? setMembers((prev) =>
                        prev.includes(p.id)
                          ? prev.filter((id) => id !== p.id)
                          : [...prev, p.id],
                      )
                    : void action(async () => {
                        const c = await api<{ id: number }>(
                          "/conversations/direct",
                          token,
                          post({ user_id: p.id }),
                        );
                        await refresh();
                        onCreated(c.id);
                      })
                }
              >
                <Avatar value={p.avatar} />
                <span>
                  <strong>{p.display_name}</strong>
                  <small>@{p.username}</small>
                </span>
                {tab === "group" ? (
                  <span
                    className={`checkbox ${members.includes(p.id) ? "checked" : ""}`}
                  >
                    {members.includes(p.id) && <Check size={15} />}
                  </span>
                ) : (
                  <ChevronRight size={17} />
                )}
              </button>
            ))}
            {!people.length && (
              <p className="help-text">
                No contacts found. Add a contact to get started.
              </p>
            )}
          </div>
          {tab === "group" && (
            <button
              className="primary wide"
              disabled={busy || !name.trim() || !members.length}
              onClick={() =>
                void action(async () => {
                  const c = await api<{ id: number }>(
                    "/conversations/group",
                    token,
                    post({ name, member_ids: members }),
                  );
                  await refresh();
                  onCreated(c.id);
                })
              }
            >
              Create group · {members.length} selected <Users size={18} />
            </button>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
export function Details({
  token,
  me,
  chat,
  contacts,
  onClose,
  refresh,
  notify,
}: Common & {
  me: User;
  chat: Conversation;
  contacts: User[];
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isAdmin = chat.members.find((m) => m.id === me.id)?.role === "admin";
  const [timerBusy, setTimerBusy] = useState(false);
  const [addId, setAddId] = useState("");
  const [groupName, setGroupName] = useState(chat.name || "");
  const [activity, setActivity] = useState<{action: string; detail: string | null; created_at: string; actor_name: string; target_name: string | null}[]>([]);
  useEffect(() => {
    if (chat.kind === "group") {
      void api<typeof activity>(`/conversations/${chat.id}/audit`, token).then(setActivity).catch(() => {});
    }
  }, [chat.id, chat.kind, token]);
  async function mutate(path: string, options: RequestInit, message: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await api(path, token, options);
      await refresh();
      const recent = await api<typeof activity>(`/conversations/${chat.id}/audit`, token).catch(() => []);
      setActivity(recent);
      notify(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function change(uid: number, remove = false) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/conversations/${chat.id}/members${remove ? `/${uid}` : ""}`,
        token,
        remove ? { method: "DELETE" } : post({ user_id: uid }),
      );
      await refresh();
      setAddId("");
      notify(remove ? "Member removed" : "Member added");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Conversation details" onClose={onClose}>
      <div className="detail-hero">
        <Avatar value={avatar(chat, me.id)} />
        <h2>{title(chat, me.id)}</h2>
        <p>
          {chat.kind === "group"
            ? `${chat.members.length} members`
            : "Direct conversation"}
        </p>
      </div>
      {chat.kind === "group" && isAdmin && (
        <form onSubmit={(e) => {
          e.preventDefault();
          void mutate(`/conversations/${chat.id}/name`, { method: "PATCH", body: JSON.stringify({name: groupName}) }, "Group renamed");
        }}>
          <label>Group name
            <input aria-label="Group name" value={groupName} maxLength={80} onChange={(e) => setGroupName(e.target.value)} required />
          </label>
          <button className="primary" disabled={busy || !groupName.trim() || groupName.trim() === chat.name}>Save name</button>
        </form>
      )}
      <div className="timer-setting">
        <label>
          Disappearing messages
          <select
            aria-label="Disappearing messages timer"
            value={chat.disappear_seconds}
            disabled={timerBusy || (chat.kind === "group" && !isAdmin)}
            onChange={async (e) => {
              setTimerBusy(true);
              setError("");
              try {
                await api(`/conversations/${chat.id}/timer`, token, {
                  method: "PATCH",
                  body: JSON.stringify({ seconds: Number(e.target.value) }),
                });
                await refresh();
                notify("Timer updated for new messages.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setTimerBusy(false);
              }
            }}
          >
            {[
              [0, "Off"],
              [10, "10 seconds (demo)"],
              [60, "1 minute"],
              [3600, "1 hour"],
              [86400, "1 day"],
              [604800, "1 week"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="help-text">
          New messages disappear after this time from sending, including their
          attachments and reactions. Existing message timers stay unchanged.
          {chat.kind === "group" && !isAdmin
            ? " Only the group admin can change this."
            : ""}
        </p>
      </div>
      <h3 className="section-label">
        {chat.kind === "group" ? "Members" : "People"}
      </h3>
      {chat.members.map((p) => (
        <div className="person-row" key={p.id}>
          <Avatar value={p.avatar} small />
          <span>
            <strong>
              {p.display_name}
              {p.id === me.id ? " (you)" : ""}
            </strong>
            <small>
              {chat.kind === "group" && p.role === "admin"
                ? "Group admin"
                : `@${p.username}`}
            </small>
          </span>
          {isAdmin && chat.kind === "group" && (
            <span className="member-actions">
              {p.id !== me.id && <button className="text-button" disabled={busy} onClick={() => void mutate(`/conversations/${chat.id}/members/${p.id}/role`, {method: "PATCH", body: JSON.stringify({role: p.role === "admin" ? "member" : "admin"})}, p.role === "admin" ? "Admin removed" : "Admin added")}>{p.role === "admin" ? "Demote" : "Make admin"}</button>}
              {p.role !== "admin" && <button className="text-button danger" disabled={busy} onClick={() => void change(p.id, true)}>Remove</button>}
            </span>
          )}
        </div>
      ))}
      {isAdmin && chat.kind === "group" && (
        <div className="add-member">
          <label>
            Add a member
            <select
              aria-label="Choose member to add"
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
            >
              <option value="">Choose a contact</option>
              {contacts
                .filter((p) => !chat.members.some((m) => m.id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={!addId || busy}
            onClick={() => void change(Number(addId))}
          >
            Add
          </button>
        </div>
      )}
      {chat.kind === "group" && (
        <>
          <h3 className="section-label">Recent activity</h3>
          <div className="activity-list">
            {activity.map((item, i) => <p className="help-text" key={`${item.created_at}-${i}`}>
              <strong>{item.actor_name}</strong> {({group_created: "created the group", group_renamed: "renamed the group", member_added: "added", member_removed: "removed", admin_promoted: "promoted", admin_demoted: "demoted", member_left: "left the group", timer_changed: "changed the disappearing timer"} as Record<string,string>)[item.action] || item.action} {item.target_name && !["member_left"].includes(item.action) ? item.target_name : ""}{item.action === "group_renamed" ? ` to ${item.detail}` : ""}
            </p>)}
          </div>
          <button className="text-button danger" disabled={busy} onClick={() => void mutate(`/conversations/${chat.id}/leave`, {method: "DELETE"}, "Left group").then((ok) => { if (ok) onClose(); })}>Leave group</button>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="help-text">
        Messages are stored in this demo’s SQLite database. This demo does not
        provide end-to-end encryption.
      </p>
    </Modal>
  );
}
export function Settings({
  token,
  me,
  onClose,
  onProfile,
  onLogout,
  dark,
  setDark,
  notify,
}: Common & {
  me: User;
  onProfile: (u: User) => void;
  onLogout: () => Promise<void>;
  dark: boolean;
  setDark: (v: boolean) => void;
}) {
  const [name, setName] = useState(me.display_name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Settings" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const u = await api<User>("/me", token, {
              method: "PATCH",
              body: JSON.stringify({ display_name: name, avatar }),
            });
            onProfile(u);
            notify("Profile updated");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="profile-summary">
          <Avatar value={avatar} />
          <span>
            <strong>{me.display_name}</strong>
            <small>@{me.username}</small>
          </span>
        </div>
        <label>
          Display name
          <input
            value={name}
            required
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="avatar-picker">
          {AVATARS.map((a) => (
            <button
              type="button"
              aria-label={`Choose ${a} avatar`}
              aria-pressed={a === avatar}
              key={a}
              className={a === avatar ? "chosen" : ""}
              onClick={() => setAvatar(a)}
            >
              {a}
            </button>
          ))}
        </div>
        <button className="primary wide" disabled={busy || !name.trim()}>
          Save profile
        </button>
      </form>
      <details className="shortcuts-help">
        <summary>Keyboard shortcuts</summary>
        <dl>
          <dt>Ctrl / ⌘ K</dt>
          <dd>Search conversations</dd>
          <dt>Ctrl / ⌘ N</dt>
          <dd>New conversation</dd>
          <dt>Ctrl / ⌘ Shift F</dt>
          <dd>Search this chat</dd>
          <dt>Enter / Shift Enter</dt>
          <dd>Send / new line</dd>
          <dt>Escape</dt>
          <dd>Dismiss picker, reply, dialog or chat</dd>
        </dl>
      </details>
      <div className="settings-list">
        <button onClick={() => setDark(!dark)}>
          {dark ? <Moon size={20} /> : <Sun size={20} />}
          <span>
            Appearance<small>{dark ? "Dark" : "Light"} · click to switch</small>
          </span>
          <span className={`toggle ${dark ? "on" : ""}`} />
        </button>
        <button
          onClick={() =>
            notify(
              "Privacy settings are coming soon. Encryption is simulated in this demo.",
            )
          }
        >
          <Shield size={20} />
          <span>
            Privacy<small>Demo encryption</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button
          onClick={() =>
            notify(
              "Messages show in-app notifications. System notification settings are coming soon.",
            )
          }
        >
          <Bell size={20} />
          <span>
            Notifications<small>In-app message alerts</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button onClick={() => notify("Linked devices are coming soon.")}>
          <Monitor size={20} />
          <span>
            Linked devices<small>Coming soon</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <button className="danger" onClick={() => void onLogout()}>
          <LogOut size={20} />
          <span>Log out</span>
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="demo-note">
        Signal-inspired student project · Not affiliated with Signal.
      </p>
    </Modal>
  );
}
