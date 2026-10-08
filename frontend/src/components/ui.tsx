import { X, MessageCircle, Check, CheckCheck } from "lucide-react";
import { useEffect, useRef } from "react";
export function IconButton({
  label,
  children,
  onClick,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Avatar({
  value,
  small = false,
  online = false,
}: {
  value: string;
  small?: boolean;
  online?: boolean;
}) {
  return (
    <span className={`avatar ${small ? "small" : ""}`}>
      {value}
      {online && <i className="online-dot" />}
    </span>
  );
}
export function SignalLogo() {
  return (
    <div className="signal-logo">
      <MessageCircle size={32} strokeWidth={1.8} />
    </div>
  );
}
export function Receipt({ status }: { status: string }) {
  return (
    <span className={`receipt ${status}`} title={status} aria-label={status}>
      {status === "read" || status === "delivered" ? (
        <CheckCheck size={15} />
      ) : status === "sending" ? (
        <span className="sending-dot">◷</span>
      ) : status === "failed" ? (
        <span>!</span>
      ) : (
        <Check size={15} />
      )}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const list = dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={21} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
