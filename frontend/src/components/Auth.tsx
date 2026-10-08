import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { api, post, User, AVATARS } from "@/lib/api";
import { SignalLogo } from "./ui";

type Mode = "signin" | "signup";

export default function Auth({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("💙");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setPassword("");
    setConfirmation("");
    setShowPassword(false);
  }

  async function submit() {
    if (mode === "signup" && password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string; user: User }>(
        mode === "signin" ? "/auth/login" : "/auth/register",
        null,
        post(mode === "signin"
          ? { username: username.trim(), password }
          : { username: username.trim(), display_name: name.trim(), avatar, password }),
      );
      onLogin(result.token, result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function enterDemo(username: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string; user: User }>(
        "/auth/demo", null, post({ username }),
      );
      onLogin(result.token, result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-intro">
          <div className="auth-brand"><SignalLogo /><span>Signal Clone</span></div>
          <div className="auth-intro-copy">
            <span className="auth-eyebrow">STAY CONNECTED</span>
            <h1>Conversations that feel close.</h1>
            <p>Bring your people together with direct messages, groups, replies, and more in one familiar space.</p>
          </div>
          <div className="auth-intro-foot"><ShieldCheck size={18} aria-hidden="true" /><span>Educational project · Not an official Signal app</span></div>
        </aside>
        <section className="auth-card" aria-label="Account access">
          <div className="auth-mobile-brand"><SignalLogo /><span>Signal Clone</span></div>
          <div className="auth-heading">
            <span className="auth-eyebrow">YOUR ACCOUNT</span>
            <h2>{mode === "signin" ? "Welcome back" : "Create an account"}</h2>
            <p>{mode === "signin" ? "Sign in to continue your conversations." : "Choose a username and a strong password to get started."}</p>
          </div>
          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => changeMode("signin")} disabled={busy}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")} disabled={busy}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {mode === "signup" && <label>Display name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Your name" disabled={busy} /></label>}
            <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={64} spellCheck={false} placeholder="Your username" disabled={busy} /></label>
            <label>Password<span className="auth-password-field">
              <input type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 12 : 1} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder={mode === "signup" ? "At least 12 characters" : "Enter your password"} disabled={busy} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} disabled={busy}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span></label>
            {mode === "signup" && <><label>Confirm password<input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required placeholder="Re-enter your password" disabled={busy} /></label>
              <div className="auth-avatar-label">Choose an avatar</div>
              <div className="avatar-picker" role="group" aria-label="Profile avatar">{AVATARS.map((a) => <button type="button" aria-label={`Choose ${a} avatar`} aria-pressed={avatar === a} key={a} className={avatar === a ? "chosen" : ""} onClick={() => setAvatar(a)} disabled={busy}>{a}</button>)}</div>
            </>}
            {error && <p role="alert" className="error auth-error">{error}</p>}
            <button className="primary wide auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}{!busy && <ArrowRight size={18} aria-hidden="true" />}</button>
          </form>
          <div className="demo-divider"><span>or try a sample account</span></div>
          <div className="demo-buttons">
            <button type="button" disabled={busy} onClick={() => void enterDemo("alex")}>🌿 Alex</button>
            <button type="button" disabled={busy} onClick={() => void enterDemo("maya")}>🌸 Maya</button>
            <button type="button" disabled={busy} onClick={() => void enterDemo("jordan")}>🏔️ Jordan</button>
          </div>
          <p className="demo-note"><LockKeyhole size={14} aria-hidden="true" /> This is a public demo. Messages are not end-to-end encrypted; do not share private information.</p>
        </section>
      </div>
      <footer>Signal-inspired recruitment project</footer>
    </main>
  );
}
