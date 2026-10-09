import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Info,
  LockKeyhole,
  Phone,
  Video,
  Smile,
  Send,
  Reply,
  X,
  Search,
  Paperclip,
  Timer,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
} from "lucide-react";
import {
  Conversation,
  Message,
  User,
  avatar,
  title,
  timeLabel,
  dayLabel,
  Upload,
  REACTIONS,
  timerLabel,
} from "@/lib/api";
import Attachment from "./Attachment";
import { Avatar, IconButton, Receipt, SignalLogo } from "./ui";
export default function Chat({
  token,
  onReact,
  onEdit,
  onDelete,
  chat,
  me,
  messages,
  connected,
  typing,
  onSend,
  onTyping,
  onBack,
  onInfo,
  notify,
  onOlder,
  hasOlder,
}: {
  token: string;
  onReact: (message: Message, emoji: string) => Promise<void>;
  onEdit: (message: Message, body: string) => Promise<boolean>;
  onDelete: (message: Message, scope: "me" | "everyone") => Promise<boolean>;
  chat: Conversation | undefined;
  me: User;
  messages: Message[];
  connected: boolean;
  typing?: string;
  onSend: (
    body: string,
    reply: Message | null,
    retry?: Message,
    upload?: Upload,
  ) => Promise<void>;
  onTyping: () => void;
  onBack: () => void;
  onInfo: () => void;
  notify: (s: string) => void;
  onOlder: () => Promise<void>;
  hasOlder: boolean;
}) {
  const [upload, setUpload] = useState<Upload | undefined>();
  const [readingFile, setReadingFile] = useState(false);
  const [reacting, setReacting] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [clock, setClock] = useState(Date.now());
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useRef(chat?.id);
  selection.current = chat?.id;
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<Message | null>(null);
  useEffect(() => {
    if (reply?.expires_at && Date.parse(reply.expires_at) <= clock)
      setReply(null);
  }, [clock]);
  const [emoji, setEmoji] = useState(false);
  const [find, setFind] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const last = useRef<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setDraft("");
    setUpload(undefined);
    setReacting(null);
    setMenu(null);
    setEditing(null);
    setReply(null);
    setFind(null);
    setEmoji(false);
    last.current = undefined;
  }, [chat?.id]);
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    if (newest !== last.current) {
      bottom.current?.scrollIntoView({
        behavior: last.current === undefined ? "instant" : "smooth",
      });
      last.current = newest;
    }
  }, [newest, chat?.id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]'))
        return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        setFind("");
      }
      if (
        event.key === "Escape" &&
        (reply || emoji || reacting !== null || find !== null || upload)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setReply(null);
        setEmoji(false);
        setReacting(null);
        setFind(null);
        setUpload(undefined);
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [reply, emoji, reacting, find, upload]);
  async function selectFile(file?: File) {
    if (!file) return;
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      notify("Choose a non-empty file up to 10 MB.");
      return;
    }
    const cid = selection.current;
    setReadingFile(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read this file."));
        reader.readAsDataURL(file);
      });
      if (selection.current === cid) setUpload({ name: file.name, data });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setReadingFile(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  if (!chat)
    return (
      <section className="empty-chat">
        <SignalLogo />
        <h2>Your conversations, together.</h2>
        <p>
          Choose a chat, or start a new conversation.
          <br />
          Good things begin with a hello.
        </p>
        <span>
          <LockKeyhole size={14} /> Signal-inspired recruitment demo
        </span>
      </section>
    );
  const other = chat.members.find((m) => m.id !== me.id);
  const visible = find
    ? messages.filter((m) => m.body.toLowerCase().includes(find.toLowerCase()))
    : messages;
  function submit() {
    if ((!draft.trim() && !upload) || readingFile) return;
    void onSend(draft, reply, undefined, upload);
    setDraft("");
    setUpload(undefined);
    setReacting(null);
    setReply(null);
    setEmoji(false);
    textarea.current?.focus();
  }
  return (
    <section className="chat-pane">
      <header className="chat-header">
        <IconButton
          className="mobile-back"
          label="Back to conversations"
          onClick={onBack}
        >
          <ArrowLeft size={22} />
        </IconButton>
        <button className="chat-identity" onClick={onInfo}>
          <Avatar value={avatar(chat, me.id)} small />
          <span>
            <strong>{title(chat, me.id)}</strong>
            <small>
              {chat.kind === "direct" && chat.members.length === 1
                ? "Notes just for this account"
                : chat.kind === "group"
                ? `${chat.members.length} members`
                : other?.online
                  ? "Online"
                  : other
                    ? `Last seen ${dayLabel(other.last_seen).toLowerCase()} at ${timeLabel(other.last_seen)}`
                    : "Offline"}
            </small>
          </span>
        </button>
        <div className="chat-actions">
          <IconButton
            label="Video call"
            onClick={() => notify("Video calls are coming soon.")}
          >
            <Video size={23} />
          </IconButton>
          <IconButton
            label="Voice call"
            onClick={() => notify("Voice calls are coming soon.")}
          >
            <Phone size={20} />
          </IconButton>
          <IconButton
            label="Search messages"
            onClick={() => setFind(find === null ? "" : null)}
          >
            <Search size={21} />
          </IconButton>
          <IconButton label="Conversation details" onClick={onInfo}>
            <Info size={21} />
          </IconButton>
        </div>
      </header>
      {chat.disappear_seconds > 0 && (
        <button className="timer-banner" onClick={onInfo}>
          <Timer size={14} /> Disappearing messages ·{" "}
          {timerLabel(chat.disappear_seconds)} after sending
        </button>
      )}
      {!connected && (
        <div className="connection-banner" role="status">
          Reconnecting to live updates… Messages will sync automatically.
        </div>
      )}
      {find !== null && (
        <div className="message-search">
          <Search size={17} />
          <input
            aria-label="Search loaded messages"
            placeholder="Search loaded messages"
            autoFocus
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          <IconButton
            label="Close message search"
            onClick={() => setFind(null)}
          >
            <X size={17} />
          </IconButton>
        </div>
      )}
      <div className="messages" role="log" aria-label="Conversation messages">
        <div className="privacy-note">
          <LockKeyhole size={12} /> This demo does not provide end-to-end encryption.
        </div>
        {hasOlder && messages.length >= 50 && (
          <button
            className="load-older"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              await onOlder();
              setLoading(false);
            }}
          >
            {loading ? "Loading…" : "Load older messages"}
          </button>
        )}
        {!messages.length && (
          <div className="chat-start">
            <Avatar value={avatar(chat, me.id)} />
            <h3>{title(chat, me.id)}</h3>
            <p>Say hello to start the conversation.</p>
          </div>
        )}
        {visible.map((m, i) => {
          const own = m.sender_id === me.id;
          const showDay =
            i === 0 ||
            dayLabel(m.created_at) !== dayLabel(visible[i - 1].created_at);
          return (
            <div key={m.client_id} id={`message-${m.id}`}>
              {showDay && (
                <div className="day-label">
                  <span>{dayLabel(m.created_at)}</span>
                </div>
              )}
              <div className={`message-row ${own ? "own" : ""}`}>
                <div className="message-bubble">
                  {!own && chat.kind === "group" && (
                    <strong className="sender-name">{m.sender_name}</strong>
                  )}
                  {m.reply_body && (
                    <button
                      type="button"
                      className="quoted"
                      title="Jump to quoted message"
                      onClick={() => {
                        const target = document.getElementById(
                          `message-${m.reply_to}`,
                        );
                        if (target) {
                          target.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                          target.animate(
                            [
                              { background: "var(--selected)" },
                              { background: "transparent" },
                            ],
                            { duration: 1200 },
                          );
                        } else
                          notify(
                            "Load older messages to find the original reply.",
                          );
                      }}
                    >
                      <strong>{m.reply_sender}</strong>
                      <p>{m.reply_body}</p>
                    </button>
                  )}
                  {m.attachment && !m.deleted_at && (
                    <Attachment message={m} token={token} notify={notify} />
                  )}
                  {editing === m.id ? (
                    <form className="message-edit" onSubmit={async (e) => {
                      e.preventDefault();
                      if (await onEdit(m, editBody)) setEditing(null);
                    }}>
                      <textarea aria-label="Edit message" value={editBody} maxLength={4000} onChange={(e) => setEditBody(e.target.value)} autoFocus />
                      <div><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={!editBody.trim()}>Save</button></div>
                    </form>
                  ) : (!m.attachment || m.body !== m.attachment.name || m.deleted_at) && (
                    <p className={`message-body ${m.deleted_at ? "deleted-message" : ""}`}>{m.body}</p>
                  )}
                  {!!m.reactions?.length && (
                    <div className="reaction-badges">
                      {Array.from(new Set(m.reactions.map((r) => r.emoji))).map(
                        (emoji) => {
                          const people = m.reactions!.filter(
                            (r) => r.emoji === emoji,
                          );
                          const mine = people.some((r) => r.user_id === me.id);
                          return (
                            <button
                              key={emoji}
                              type="button"
                              aria-pressed={mine}
                              aria-label={`${mine ? "Remove" : "Add"} ${emoji} reaction`}
                              title={people
                                .map((r) => r.display_name)
                                .join(", ")}
                              onClick={() => void onReact(m, emoji)}
                            >
                              {emoji} <span>{people.length}</span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}
                  <div className="message-meta">
                    {m.expires_at && (
                      <span
                        className="expiry-countdown"
                        title="Time until this message disappears"
                      >
                        <Timer size={11} />
                        {Math.max(
                          0,
                          Math.ceil((Date.parse(m.expires_at) - clock) / 1000),
                        )}
                        s
                      </span>
                    )}
                    <time>{timeLabel(m.created_at)}</time>
                    {m.edited_at && !m.deleted_at && <span title="Edited message">edited</span>}
                    {own && <Receipt status={m.status} />}
                  </div>
                  {m.status === "failed" && (
                    <button
                      className="retry"
                      onClick={() => void onSend(m.body, null, m)}
                    >
                      Not sent. Click to retry
                    </button>
                  )}
                </div>
                {m.id > 0 && !m.deleted_at && (
                  <div className="reaction-action">
                    <IconButton
                      label={`React to message from ${m.sender_name}`}
                      className="reply-action"
                      onClick={() =>
                        setReacting(reacting === m.id ? null : m.id)
                      }
                    >
                      <Smile size={17} />
                    </IconButton>
                    {reacting === m.id && (
                      <div
                        className="reaction-picker"
                        role="group"
                        aria-label="Choose a reaction"
                      >
                        {REACTIONS.map((emoji) => (
                          <button
                            type="button"
                            key={emoji}
                            aria-label={`React ${emoji}`}
                            onClick={() => {
                              void onReact(m, emoji);
                              setReacting(null);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {m.id > 0 && !m.deleted_at && (
                  <IconButton
                    label={`Reply to ${m.sender_name}`}
                    className="reply-action"
                    onClick={() => {
                      setReply(m);
                      textarea.current?.focus();
                    }}
                  >
                    <Reply size={17} />
                  </IconButton>
                )}
                {m.id > 0 && (
                  <div className="message-menu-wrap">
                    <IconButton label="Message actions" className="reply-action" onClick={() => setMenu(menu === m.id ? null : m.id)}><MoreHorizontal size={18} /></IconButton>
                    {menu === m.id && <div className="message-menu" role="menu">
                      {!m.deleted_at && <button role="menuitem" onClick={async () => { try { await navigator.clipboard.writeText(m.body); notify("Message copied"); } catch { notify("Could not copy message"); } setMenu(null); }}><Copy size={14} /> Copy</button>}
                      {own && !m.deleted_at && !m.attachment && <button role="menuitem" onClick={() => { setEditing(m.id); setEditBody(m.body); setMenu(null); }}><Pencil size={14} /> Edit</button>}
                      <button role="menuitem" onClick={async () => { if (await onDelete(m, "me")) notify("Message deleted for you"); setMenu(null); }}><Trash2 size={14} /> Delete for me</button>
                      {own && !m.deleted_at && <button role="menuitem" className="danger" onClick={async () => { if (!window.confirm("Delete this message for everyone?")) return; if (await onDelete(m, "everyone")) notify("Message deleted for everyone"); setMenu(null); }}><Trash2 size={14} /> Delete for everyone</button>}
                    </div>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {find && visible.length === 0 && (
          <p className="search-empty">
            No matching messages. Load older messages to search further back.
          </p>
        )}
        <div ref={bottom} />
      </div>
      <div className="composer-area">
        <div className="typing" role="status">
          {typing && (
            <>
              <span className="typing-dots">•••</span> {typing} is typing
            </>
          )}
        </div>
        {upload && (
          <div className="upload-preview">
            <Paperclip size={18} />
            <span>{upload.name}</span>
            <IconButton
              label="Remove attachment"
              onClick={() => setUpload(undefined)}
            >
              <X size={18} />
            </IconButton>
          </div>
        )}
        {readingFile && (
          <p role="status" className="help-text">
            Preparing attachment…
          </p>
        )}
        {reply && (
          <div className="reply-preview">
            <Reply size={18} />
            <span>
              <strong>Reply to {reply.sender_name}</strong>
              <p>{reply.body}</p>
            </span>
            <IconButton label="Cancel reply" onClick={() => setReply(null)}>
              <X size={18} />
            </IconButton>
          </div>
        )}
        {emoji && (
          <div className="emoji-tray">
            {[
              "😊",
              "💙",
              "👍",
              "❤️",
              "😂",
              "🎉",
              "✨",
              "☕",
              "👋",
              "🙏",
              "🔥",
              "🚀",
            ].map((e) => (
              <button
                key={e}
                aria-label={`Insert ${e}`}
                onClick={() => {
                  setDraft((d) => d + e);
                  textarea.current?.focus();
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={fileInput}
            type="file"
            className="file-input"
            aria-label="Attach image or file"
            onChange={(e) => void selectFile(e.target.files?.[0])}
          />
          <IconButton
            label="Attach image or file"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip size={21} />
          </IconButton>
          <IconButton label="Choose emoji" onClick={() => setEmoji(!emoji)}>
            <Smile size={24} />
          </IconButton>
          <textarea
            ref={textarea}
            aria-label="Write a message"
            placeholder="Message"
            rows={1}
            maxLength={4000}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onTyping();
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="submit"
            className="send-button"
            title="Send message"
            aria-label="Send message"
            disabled={(!draft.trim() && !upload) || readingFile}
          >
            <Send size={19} />
          </button>
        </form>
        <div className="composer-caption">
          Enter to send <span>·</span> Shift + Enter for a new line
        </div>
      </div>
    </section>
  );
}
