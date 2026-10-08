import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { api, post, User, AVATARS } from "@/lib/api";
import { SignalLogo } from "./ui";

type Mode = "signin" | "signup";

export default function Auth({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<"details" | "verify">("details");
  const [showDemo, setShowDemo] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("💙");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function changeMode(next: Mode) {
    setMode(next);
    setStep("details");
    setError("");
    setPassword("");
    setConfirmation("");
    setOtp("");
    setShowPassword(false);
  }

  async function submit() {
    if (mode === "signup" && step === "details") {
      if (password !== confirmation) {
        setError("Passwords do not match.");
        return;
      }
      setError("");
      setStep("verify");
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
          : { username: username.trim(), display_name: name.trim(), avatar, password, otp }),
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
            <span className="auth-eyebrow">SIMPLE · FAMILIAR · CONNECTED</span>
            <h1>Say hello to a better conversation.</h1>
            <p>One place for the people and conversations that matter to you.</p>
            <div className="auth-chat-preview" aria-hidden="true">
              <div className="auth-preview-top"><span className="auth-preview-avatar">🌿</span><span><strong>Alex Morgan</strong><small>online</small></span><span className="auth-preview-dots">•••</span></div>
              <div className="auth-preview-messages"><span className="auth-preview-day">TODAY</span><div className="auth-preview-incoming">Hey! Ready to catch up?</div><div className="auth-preview-outgoing">Always. See you here! <span>✓✓</span></div></div>
              <div className="auth-preview-compose">Message Alex <span>☺</span></div>
            </div>
          </div>
          <div className="auth-intro-foot"><ShieldCheck size={18} aria-hidden="true" /><span>Signal-inspired educational project · Not affiliated with Signal</span></div>
        </aside>
        <section className="auth-card" aria-label="Account access">
          <div className="auth-mobile-brand"><SignalLogo /><span>Signal Clone</span></div>
          <div className="auth-heading">
            <span className="auth-eyebrow">{mode === "signup" ? `GET STARTED · ${step === "details" ? "1 OF 2" : "2 OF 2"}` : "WELCOME BACK"}</span>
            <h2>{mode === "signin" ? "Sign in" : step === "details" ? "Create your account" : "Verify your account"}</h2>
            <p>{mode === "signin" ? "Continue to your conversations." : step === "details" ? "Choose how people will find and recognize you." : `Enter the demo code to finish creating ${username.trim()}.`}</p>
          </div>
          <div className="auth-tabs" role="group" aria-label="Account action">
            <button type="button" aria-pressed={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => changeMode("signin")} disabled={busy}>Sign in</button>
            <button type="button" aria-pressed={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")} disabled={busy}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {mode === "signup" && step === "verify" ? <>
              <div className="auth-verification-icon"><LockKeyhole size={26} aria-hidden="true" /></div>
              <label>6-digit verification code<input className="auth-code-input" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required placeholder="••••••" disabled={busy} /></label>
              <p className="auth-otp-note">This assignment uses a fixed mock code: <strong>123456</strong>. No SMS is sent and this does not verify phone ownership.</p>
              <button className="auth-back" type="button" onClick={() => { setStep("details"); setError(""); }} disabled={busy}><ArrowLeft size={16} /> Edit account details</button>
            </> : <>
            {mode === "signup" && <label>Display name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Your name" disabled={busy} /></label>}
            <label>Username or phone number<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={64} spellCheck={false} placeholder="Username or phone number" disabled={busy} /></label>
            {mode === "signup" && <p className="auth-field-help">A phone number is a demo identifier; no text message will be sent.</p>}
            <label>Password<span className="auth-password-field">
              <input type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 12 : 1} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder={mode === "signup" ? "At least 12 characters" : "Enter your password"} disabled={busy} />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} disabled={busy}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span></label>
            {mode === "signup" && <><label>Confirm password<input type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required placeholder="Re-enter your password" disabled={busy} /></label>
              <div className="auth-avatar-label">Choose an avatar</div>
              <div className="avatar-picker" role="group" aria-label="Profile avatar">{AVATARS.map((a) => <button type="button" aria-label={`Choose ${a} avatar`} aria-pressed={avatar === a} key={a} className={avatar === a ? "chosen" : ""} onClick={() => setAvatar(a)} disabled={busy}>{a}</button>)}</div>
            </>}
            </>}
            {error && <p role="alert" className="error auth-error">{error}</p>}
            <button className="primary wide auth-submit" disabled={busy}>{busy ? "Connecting…" : mode === "signin" ? "Sign in" : step === "details" ? "Continue" : "Verify and create account"}{!busy && <ArrowRight size={18} aria-hidden="true" />}</button>
          </form>
          {mode === "signin" && <><div className="demo-divider"><span>New here? Explore the demo</span></div>
          <button type="button" className="auth-demo-toggle" aria-expanded={showDemo} onClick={() => setShowDemo((value) => !value)} disabled={busy}>{showDemo ? "Hide sample accounts" : "Try a sample account"}</button>
          {showDemo && <div className="demo-buttons">
            <button type="button" disabled={busy} onClick={() => void enterDemo("alex")}>🌿 Alex</button>
            <button type="button" disabled={busy} onClick={() => void enterDemo("maya")}>🌸 Maya</button>
            <button type="button" disabled={busy} onClick={() => void enterDemo("jordan")}>🏔️ Jordan</button>
          </div>}</>}
          <p className="demo-note"><LockKeyhole size={14} aria-hidden="true" /> Public demonstration: messages are not end-to-end encrypted. Do not share private information.</p>
        </section>
      </div>
      <footer>Built for the SDE fullstack assignment</footer>
    </main>
  );
}
