import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { BrandLogo } from "../components/BrandLogo";
import { Button, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

const DEMO = [
  { role: "admin", label: "Admin", email: "admin@fabulouscartz.com", password: "Admin#2026" },
  { role: "manager", label: "Manager", email: "manager@fabulouscartz.com", password: "Manager#2026" },
  { role: "fulfilment", label: "Fulfilment", email: "fulfilment@fabulouscartz.com", password: "Fulfil#2026" },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@fabulouscartz.com");
  const [password, setPassword] = useState("Admin#2026");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not reach the operations API. Is the server running on port 4000?");
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (account: (typeof DEMO)[number]) => {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
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
            <p>Sign in with your team account. Access is scoped by role and every change is audited.</p>
          </header>

          <form className="login-form" onSubmit={submit}>
            <Field label="Work email" required>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                placeholder="you@fabulouscartz.com"
                autoFocus
              />
            </Field>
            <Field label="Password" required hint="Sessions last 12 hours. Use the account menu to rotate your password.">
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="••••••••••"
              />
            </Field>

            {error ? (
              <p className="login-error">
                <LockKeyhole size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                {error}
              </p>
            ) : null}

            <Button variant="primary" size="lg" className="login-submit" type="submit" loading={loading} trailingIcon={<ArrowRight size={15} />}>
              Enter the console
            </Button>
          </form>

          <div className="login-demo">
            <span>Seeded demo accounts</span>
            <div className="demo-row">
              {DEMO.map((account) => (
                <button key={account.role} type="button" className="demo-btn" data-role={account.role} onClick={() => quickFill(account)}>
                  <i>{account.label.slice(0, 2)}</i>
                  {account.label}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              Clicking a role fills the credentials. Passwords follow the seeded pattern and are listed in
              <span className="mono"> admin/README.md</span>.
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
