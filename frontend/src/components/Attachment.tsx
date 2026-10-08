import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { API, Message } from "@/lib/api";

export default function Attachment({
  message,
  token,
  notify,
}: {
  message: Message;
  token: string;
  notify: (s: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = message.attachment!;
  const image = a.media_type.startsWith("image/");
  const endpoint = `${API}/conversations/${message.conversation_id}/messages/${message.id}/attachment`;
  async function fetchBlob(signal?: AbortSignal) {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: signal || AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error("Attachment is unavailable or has expired.");
    return response.blob();
  }
  useEffect(() => {
    if (!image || message.id < 0) return;
    const controller = new AbortController();
    let objectUrl = "";
    setUrl("");
    setFailed(false);
    void fetchBlob(controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Attachment bytes are immutable for a given persisted message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id, endpoint, token, image]);
  async function download() {
    setBusy(true);
    try {
      const blob = await fetchBlob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = a.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="attachment">
      {image && url && !failed && (
        <img
          className="attachment-image"
          src={url}
          alt={a.name}
          onError={() => setFailed(true)}
        />
      )}
      <button
        type="button"
        className="attachment-download"
        onClick={() => void download()}
        disabled={busy || message.id < 0}
        aria-label={`Download ${a.name}`}
      >
        <FileText size={20} />
        <span>
          <strong>{a.name}</strong>
          <small>
            {a.size < 1024 ? `${a.size} B` : `${(a.size / 1024).toFixed(1)} KB`}
            {busy
              ? " · Downloading…"
              : image && failed
                ? " · Preview unavailable"
                : ""}
          </small>
        </span>
        <Download size={17} />
      </button>
    </div>
  );
}
