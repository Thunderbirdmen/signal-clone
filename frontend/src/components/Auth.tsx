import { useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
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
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function changeMode(next: Mode) {
    setMode(next);
    setStep("details");
    setError("");
    setOtp("");
  }

  async function submit() {
    if (step === "details") {
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
          ? { username: username.trim(), otp }
          : { username: username.trim(), display_name: name.trim(), avatar, otp }),
      );
      onLogin(result.token, result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function chooseDemo(username: string) {
    setUsername(username);
    setStep("verify");
    setOtp("");
    setShowDemo(false);
    setError("");
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
            <span className="auth-eyebrow">{mode === "signup" ? "GET STARTED" : "WELCOME BACK"} · {step === "details" ? "1 OF 2" : "2 OF 2"}</span>
            <h2>{step === "verify" ? "Verify your account" : mode === "signin" ? "Sign in" : "Create your account"}</h2>
            <p>{step === "verify" ? `Enter the mock verification code for ${username.trim()}.` : mode === "signin" ? "Enter your username or phone number to continue." : "Choose how people will find and recognize you."}</p>
          </div>
          <div className="auth-tabs" role="group" aria-label="Account action">
            <button type="button" aria-pressed={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => changeMode("signin")} disabled={busy}>Sign in</button>
            <button type="button" aria-pressed={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")} disabled={busy}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            {step === "verify" ? <>
              <div className="auth-verification-icon"><LockKeyhole size={26} aria-hidden="true" /></div>
              <label>6-digit verification code<input className="auth-code-input" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required placeholder="••••••" disabled={busy} /></label>
              <p className="auth-otp-note">This assignment uses a fixed mock code: <strong>123456</strong>. No SMS is sent and this does not verify phone ownership.</p>
              <button className="auth-back" type="button" onClick={() => { setStep("details"); setOtp(""); setError(""); }} disabled={busy}><ArrowLeft size={16} /> Change {mode === "signin" ? "account" : "account details"}</button>
            </> : <>
            {mode === "signup" && <label>Display name<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Your name" disabled={busy} /></label>}
            <label>Username or phone number<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={64} spellCheck={false} placeholder="Username or phone number" disabled={busy} /></label>
            {mode === "signup" && <p className="auth-field-help">A phone number is a demo identifier; no text message will be sent.</p>}
            {mode === "signup" && <>
              <div className="auth-avatar-label">Choose an avatar</div>
              <div className="avatar-picker" role="group" aria-label="Profile avatar">{AVATARS.map((a) => <button type="button" aria-label={`Choose ${a} avatar`} aria-pressed={avatar === a} key={a} className={avatar === a ? "chosen" : ""} onClick={() => setAvatar(a)} disabled={busy}>{a}</button>)}</div>
            </>}
            </>}
            {error && <p role="alert" className="error auth-error">{error}</p>}
            <button className="primary wide auth-submit" disabled={busy}>{busy ? "Connecting…" : step === "details" ? "Continue" : mode === "signin" ? "Verify and sign in" : "Verify and create account"}{!busy && <ArrowRight size={18} aria-hidden="true" />}</button>
          </form>
          {mode === "signin" && step === "details" && <><div className="demo-divider"><span>Try a demo account</span></div>
          <button type="button" className="auth-demo-toggle" aria-expanded={showDemo} onClick={() => setShowDemo((value) => !value)} disabled={busy}>{showDemo ? "Hide sample accounts" : "Try a sample account"}</button>
          {showDemo && <div className="demo-buttons">
            <button type="button" disabled={busy} onClick={() => chooseDemo("alex")}>🌿 Alex</button>
            <button type="button" disabled={busy} onClick={() => chooseDemo("maya")}>🌸 Maya</button>
            <button type="button" disabled={busy} onClick={() => chooseDemo("jordan")}>🏔️ Jordan</button>
          </div>}</>}
          <p className="demo-note"><LockKeyhole size={14} aria-hidden="true" /> Public demonstration: messages are not end-to-end encrypted. Do not share private information.</p>
        </section>
      </div>
      <footer>Built for the SDE fullstack assignment</footer>
    </main>
  );
}
