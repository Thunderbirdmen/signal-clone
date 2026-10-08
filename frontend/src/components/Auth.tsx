import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { api, post, User, AVATARS } from "@/lib/api";
import { SignalLogo } from "./ui";
export default function Auth({
  onLogin,
}: {
  onLogin: (token: string, user: User) => void;
}) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("💙");
  const [otp, setOtp] = useState("123456");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(demo?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string; user: User }>(
        "/auth/login",
        null,
        post({
          username: demo || username,
          display_name: name || undefined,
          avatar,
          otp: demo ? "123456" : otp,
          password: demo ? undefined : password || undefined,
        }),
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
      <div className="auth-card">
        <SignalLogo />
        <h1>Say hello to Signal.</h1>
        <p className="auth-subtitle">
          A little more connection.
          <br />A conversation that feels like you.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <label>
            Username or phone number
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={64}
              placeholder="e.g. alex or +919876543210"
            />
          </label>
          <label>
            Display name <span className="muted">· for new accounts</span>
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call you?"
            />
          </label>
          <label>Profile avatar</label>
          <div className="avatar-picker">
            {AVATARS.map((a) => (
              <button
                type="button"
                aria-label={`Choose ${a} avatar`}
                aria-pressed={avatar === a}
                key={a}
                className={avatar === a ? "chosen" : ""}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
          <label>
            Password <span className="muted">· required for new accounts</span>
            <input
              type="password"
              autoComplete={name ? "new-password" : "current-password"}
              minLength={password ? 12 : undefined}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 12 characters for a new account"
            />
          </label>
          <label>
            Demo verification code
            <input
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              placeholder="123456"
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? "Connecting…" : "Get started"}
            <ArrowRight size={18} />
          </button>
        </form>
        <div className="demo-divider">
          <span>or explore a demo account</span>
        </div>
        <div className="demo-buttons">
          <button disabled={busy} onClick={() => void login("alex")}>
            🌿 Alex
          </button>
          <button disabled={busy} onClick={() => void login("maya")}>
            🌸 Maya
          </button>
          <button disabled={busy} onClick={() => void login("jordan")}>
            🏔️ Jordan
          </button>
        </div>
        <p className="demo-note">
          <LockKeyhole size={13} /> Recruitment project · Mock verification
          (123456)
          <br />
          Messages in this demo are not end-to-end encrypted.
        </p>
      </div>
      <footer>Built for conversation.</footer>
    </main>
  );
}
