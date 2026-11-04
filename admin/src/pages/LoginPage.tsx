import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Sparkles } from "lucide-react";
import { BrandLogo } from "../components/BrandLogo";
import { Button, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const DEMO = [
  { role: "admin", label: "Admin", username: "admin", password: "Admin#2026" },
  { role: "manager", label: "Manager", username: "manager", password: "Manager#2026" },
  { role: "fulfilment", label: "Fulfilment", username: "fulfilment", password: "Fulfil#2026" },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const next: { username?: string; password?: string } = {};
    const handle = username.trim().toLowerCase();
    if (!handle) next.username = "Username is required.";
    else if (!USERNAME_PATTERN.test(handle)) {
      next.username = "Use 3–32 characters: letters, numbers, dot, underscore or dash.";
    }
    if (!password) next.password = "Password is required.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await login(username.trim().toLowerCase(), password);
      navigate(from && !from.startsWith("/login") ? from : "/", { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Could not reach the operations API. Is the server running on port 4000?",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <section className="login-visual">
        <div className="login-visual-grid" aria-hidden="true" />
        <div className="login-brand">
          <BrandLogo />
        </div>

        <div className="login-copy">
          <p className="eyebrow">
            <Sparkles size={12} /> Fabulous Cartz · Internal
          </p>
          <h1>
            The quiet engine behind a <em>loud</em> little label.
          </h1>
          <p>
            Orders, inventory, rituals of curation and the numbers that matter — one operator console for the people who
            keep Fabulous Cartz moving.
          </p>
        </div>

        <div className="login-stats">
          <div className="login-stat">
            <strong>21</strong>
            <span>Pieces curated</span>
          </div>
          <div className="login-stat">
            <strong>11</strong>
            <span>Studio partners</span>
          </div>
          <div className="login-stat">
            <strong>6</strong>
            <span>Categories live</span>
          </div>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <header className="login-card-head">
            <p className="eyebrow">Operations console</p>
            <h2>Welcome back</h2>
            <p>Sign in with your team username. Access is scoped by role and every change is audited.</p>
          </header>

          <form className="login-form" onSubmit={submit} noValidate>
            <Field label="Username" required>
              <input
                className="input"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g. admin"
                aria-invalid={Boolean(fieldErrors.username)}
                autoFocus
              />
              {fieldErrors.username ? <span className="login-error">{fieldErrors.username}</span> : null}
            </Field>
            <Field label="Password" required hint="Sessions last 12 hours. Use the account menu to rotate your password.">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  aria-invalid={Boolean(fieldErrors.password)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="demo-btn"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {fieldErrors.password ? <span className="login-error">{fieldErrors.password}</span> : null}
            </Field>

            {error ? (
              <p className="login-error" role="alert">
                <LockKeyhole size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                {error}
              </p>
            ) : null}

            <Button variant="primary" size="lg" className="login-submit" type="submit" loading={loading} trailingIcon={<ArrowRight size={15} />}>
              Enter the console
            </Button>
          </form>

          <div className="login-demo">
            <span>Demo credentials</span>
            <p className="hint" style={{ marginTop: 8 }}>
              {DEMO.map((account) => (
                <span key={account.role} className="mono" style={{ display: "block", marginBottom: 4 }}>
                  {account.label}: {account.username} / {account.password}
                </span>
              ))}
            </p>
            <p className="hint" style={{ marginTop: 10 }}>
              Usernames are case-insensitive. Accounts are seeded by <span className="mono">npm run seed</span>.
            </p>
          </div>

          <footer className="login-foot">
            <span>© 2026 Fabulous Cartz</span>
            <span className="mono">OPS 1.0 · Secure session</span>
          </footer>
        </div>
      </section>
    </div>
  );
}
