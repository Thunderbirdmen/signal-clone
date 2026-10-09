import {
  Search,
  SquarePen,
  MessageCircle,
  Phone,
  Settings,
  Users,
  Plus,
  CircleDashed,
  Pin,
  VolumeX,
  Archive,
  MoreHorizontal,
  CheckCheck,
} from "lucide-react";
import {
  Conversation,
  User,
  title,
  avatar,
  timeLabel,
  dayLabel,
} from "@/lib/api";
import { Avatar, IconButton, Receipt } from "./ui";
import { useState } from "react";
export default function Sidebar({
  me,
  chats,
  contacts,
  active,
  onSelect,
  onNew,
  onSettings,
  onContact,
  onPreference,
  onMarkRead,
  notify,
}: {
  me: User;
  chats: Conversation[];
  contacts: User[];
  active: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onSettings: () => void;
  onContact: (user: User) => void;
  onPreference: (conversation: Conversation, field: "pinned" | "muted" | "archived", value: boolean) => Promise<void>;
  onMarkRead: (id: number) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [menu, setMenu] = useState<number | null>(null);
  const query = search.toLowerCase();
  const filtered = chats.filter(
    (c) =>
      (title(c, me.id).toLowerCase().includes(query) ||
        c.members.some((m) => m.username.toLowerCase().includes(query))) &&
      (filter !== "unread" || c.unread > 0) &&
      (filter !== "groups" || c.kind === "group") &&
      (filter === "archived" ? c.archived : !c.archived),
  );
  return (
    <>
      <nav className="rail" aria-label="Main navigation">
        <button
          className="profile-button"
          title="Your profile"
          aria-label="Your profile"
          onClick={onSettings}
        >
          <Avatar value={me.avatar} small />
        </button>
        <div className="rail-links">
          <IconButton
            label="Chats"
            className="selected"
            onClick={() => {
              setFilter("all");
              setSearch("");
            }}
          >
            <MessageCircle size={23} />
          </IconButton>
          <IconButton
            label="Calls"
            onClick={() => notify("Voice and video calls are coming soon.")}
          >
            <Phone size={21} />
          </IconButton>
          <IconButton
            label="Stories"
            onClick={() => notify("Stories are coming soon.")}
          >
            <CircleDashed size={24} />
          </IconButton>
        </div>
        <IconButton label="Settings" onClick={onSettings}>
          <Settings size={22} />
        </IconButton>
      </nav>
      <aside className="sidebar">
        <header className="sidebar-heading">
          <h1>Chats</h1>
          <IconButton label="New conversation" onClick={onNew}>
            <SquarePen size={21} />
          </IconButton>
        </header>
        <div className="search">
          <Search size={18} />
          <input
            id="chat-search"
            aria-label="Search conversations and contacts"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="filters">
          {[
            ["all", "All"],
            ["unread", "Unread"],
            ["groups", "Groups"],
            ["archived", "Archived"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setFilter(id); setMenu(null); }}
              className={filter === id ? "active" : ""}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="conversation-list">
          {filtered.map((c) => (
            <div className="conversation-item" key={c.id}>
            <button
              className={`conversation ${active === c.id ? "active" : ""}`}
              onClick={() => { setMenu(null); onSelect(c.id); }}
            >
              <Avatar
                value={avatar(c, me.id)}
                online={
                  c.kind === "direct" &&
                  c.members.some((m) => m.id !== me.id && m.online)
                }
              />
              <div className="conversation-copy">
                <div className="conversation-top">
                  <strong>{title(c, me.id)}</strong>
                  {c.pinned && <Pin size={13} aria-label="Pinned" />}
                  {c.muted && <VolumeX size={13} aria-label="Muted" />}
                  <span className={c.unread ? "unread-time" : ""}>
                    {c.last_message
                      ? dayLabel(c.last_message.created_at) === "Today"
                        ? timeLabel(c.last_message.created_at)
                        : dayLabel(c.last_message.created_at)
                      : ""}
                  </span>
                </div>
                <div className="conversation-bottom">
                  <p>
                    {c.last_message?.sender_id === me.id && (
                      <Receipt status="sent" />
                    )}
                    {c.kind === "group" && c.last_message
                      ? `${c.last_message.sender_name.split(" ")[0]}: `
                      : ""}
                    {c.last_message?.body || (c.last_message?.attachment_type?.startsWith("image/") ? "Photo" : c.last_message?.attachment_type ? "Attachment" : "Start a conversation")}
                  </p>
                  {c.unread > 0 && <b className="badge">{c.unread}</b>}
                </div>
              </div>
            </button>
            <button className="conversation-options" aria-label={`Options for ${title(c, me.id)}`} aria-expanded={menu === c.id} onClick={() => setMenu(menu === c.id ? null : c.id)}><MoreHorizontal size={18} /></button>
            {menu === c.id && <div className="conversation-menu">
              <button onClick={() => { setMenu(null); void onPreference(c, "pinned", !c.pinned); }}><Pin size={15} />{c.pinned ? "Unpin chat" : "Pin chat"}</button>
              <button onClick={() => { setMenu(null); void onPreference(c, "muted", !c.muted); }}><VolumeX size={15} />{c.muted ? "Unmute notifications" : "Mute notifications"}</button>
              {c.unread > 0 && <button onClick={() => { setMenu(null); void onMarkRead(c.id); }}><CheckCheck size={15} />Mark as read</button>}
              <button onClick={() => { setMenu(null); void onPreference(c, "archived", !c.archived); }}><Archive size={15} />{c.archived ? "Unarchive chat" : "Archive chat"}</button>
            </div>}
            </div>
          ))}
          {!filtered.length && (
            <div className="list-empty">
              <Search size={25} />
              <p>
                {search
                  ? "No conversations found"
                  : filter === "unread"
                    ? "You’re all caught up"
                    : filter === "archived" ? "No archived conversations" : "No conversations yet"}
              </p>
              <button className="text-button" onClick={onNew}>
                Start a conversation
              </button>
            </div>
          )}
          {search &&
            contacts.filter((c) =>
              `${c.display_name} ${c.username}`.toLowerCase().includes(query),
            ).length > 0 && (
              <>
                <div className="list-label">CONTACTS</div>
                {contacts
                  .filter((c) =>
                    `${c.display_name} ${c.username}`
                      .toLowerCase()
                      .includes(query),
                  )
                  .map((c) => (
                    <button
                      key={c.id}
                      className="person-row"
                      onClick={() => onContact(c)}
                    >
                      <Avatar value={c.avatar} small />
                      <span>
                        <strong>{c.display_name}</strong>
                        <small>@{c.username}</small>
                      </span>
                    </button>
                  ))}
              </>
            )}
        </div>
        <div className="sidebar-footer">
          <Users size={15} />
          <span>{contacts.length} contacts</span>
          <IconButton label="Add contact or group" onClick={onNew}>
            <Plus size={18} />
          </IconButton>
        </div>
      </aside>
    </>
  );
}
