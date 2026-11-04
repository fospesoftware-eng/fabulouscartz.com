import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Bell, Building2, CreditCard, KeyRound, Pencil, Plus, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import type { PaymentMethod, Role, Settings, User } from "../../shared/types";
import { ROLES } from "../../shared/types";
import { ConfirmDialog, Modal } from "../components/overlay";
import { Avatar, Badge, Button, Card, ErrorState, Field, IconButton, Segmented, Toggle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { api } from "../lib/api";
import { resources } from "../lib/normalize";
import { useResource } from "../lib/hooks";
import { foldWords, relative } from "../lib/utils";

const PAYMENT_META: Array<{ key: PaymentMethod; label: string; mark: string; tone: string }> = [
  { key: "phonepe", label: "PhonePe", mark: "Pe", tone: "" },
  { key: "gpay", label: "Google Pay", mark: "G", tone: "is-gold" },
  { key: "upi", label: "UPI", mark: "UP", tone: "is-rose" },
  { key: "card", label: "Card", mark: "••", tone: "" },
  { key: "cod", label: "Cash on delivery", mark: "₹", tone: "is-gold" },
];

const NOTIFICATION_META: Array<{ key: keyof Settings["notifications"]; title: string; body: string }> = [
  { key: "orderCreated", title: "New order received", body: "Push a notification to the console whenever an order lands." },
  { key: "lowStock", title: "Low stock warnings", body: "Alert when a SKU hits its threshold after an adjustment or sale." },
  { key: "dailyDigest", title: "Daily digest", body: "A 7am summary of yesterday's revenue, orders and stock signals." },
  { key: "refundRequests", title: "Refund requests", body: "Flag cancellations and returns that need a payment decision." },
  { key: "newCustomer", title: "New customer", body: "Notify the team when a first-time buyer joins the book." },
];

interface TeamDraft {
  name: string;
  email: string;
  title: string;
  role: Role;
  password: string;
}

const EMPTY_TEAM: TeamDraft = { name: "", email: "", title: "", role: "fulfilment", password: "" };

export function SettingsPage() {
  const { user } = useAuth();
  const { notify } = useUI();
  const settings = useResource<Settings>(() => resources.settings(), []);
  const team = useResource<{ data: User[] }>(() => resources.team(), []);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [member, setMember] = useState<User | "new" | null>(null);
  const [teamDraft, setTeamDraft] = useState<TeamDraft>(EMPTY_TEAM);
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setDraft(settings.data);
      setDirty(false);
    }
  }, [settings.data]);

  const update = (patch: Partial<Settings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  };

  const updateBrand = (patch: Partial<Settings["brand"]>) => {
    setDraft((current) => (current ? { ...current, brand: { ...current.brand, ...patch } } : current));
    setDirty(true);
  };

  const updatePayment = (key: PaymentMethod, value: boolean) => {
    setDraft((current) => (current ? { ...current, payments: { ...current.payments, [key]: value } } : current));
    setDirty(true);
  };

  const updateNotification = (key: keyof Settings["notifications"], value: boolean) => {
    setDraft((current) => (current ? { ...current, notifications: { ...current.notifications, [key]: value } } : current));
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await api.patch<Settings>("/settings", draft);
      settings.setData(updated);
      setDraft(updated);
      setDirty(false);
      notify({ kind: "success", title: "Settings saved", description: "Brand, commerce and notification rules are live." });
    } catch (cause) {
      notify({ kind: "error", title: "Settings not saved", description: cause instanceof Error ? cause.message : "Check the values and try again." });
    } finally {
      setSaving(false);
    }
  };

  const openNewMember = () => {
    setTeamDraft(EMPTY_TEAM);
    setTeamError(null);
    setMember("new");
  };

  const openEditMember = (entry: User) => {
    setTeamDraft({ name: entry.name, email: entry.email, title: entry.title, role: entry.role, password: "" });
    setTeamError(null);
    setMember(entry);
  };

  const saveMember = async () => {
    if (!member) return;
    setTeamSaving(true);
    setTeamError(null);
    try {
      if (member === "new") {
        await api.post("/team", teamDraft);
        notify({ kind: "success", title: "Team member added", description: `${teamDraft.name} · ${teamDraft.role}` });
      } else {
        const payload = { name: teamDraft.name, title: teamDraft.title, role: teamDraft.role, password: teamDraft.password || undefined };
        await api.patch(`/team/${member.id}`, payload);
        notify({ kind: "success", title: "Team member updated", description: teamDraft.name });
      }
      setMember(null);
      team.reload();
    } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : "Could not save the team member.");
    } finally {
      setTeamSaving(false);
    }
  };

  const removeMember = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/team/${deleting.id}`);
      notify({ kind: "success", title: "Team member removed", description: deleting.name });
      setDeleting(null);
      team.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Member not removed", description: cause instanceof Error ? cause.message : "At least one admin must remain." });
    } finally {
      setBusy(false);
    }
  };

  if (settings.error) {
    return <Card><ErrorState title="Settings unavailable" body={settings.error} onRetry={settings.reload} /></Card>;
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Workspace</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Settings</span>
          </nav>
          <p className="eyebrow page-eyebrow">Administration</p>
          <h1 className="page-title">The rules underneath.</h1>
          <p className="page-description">
            Brand voice, money conventions, payment rails and who gets notified. Admin-only; every save is audited.
          </p>
        </div>
        <div className="page-actions">
          <Badge tone="gold">
            <ShieldCheck size={11} /> Admin only
          </Badge>
        </div>
      </div>

      {settings.loading || !draft ? (
        <div className="stack-18">
          <span className="sk sk-line" style={{ height: 44, borderRadius: 12 }} />
          <span className="sk sk-block" style={{ height: 380, borderRadius: 18 }} />
        </div>
      ) : (
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            <a href="#brand"><Building2 size={13} /> Brand</a>
            <a href="#commerce"><CreditCard size={13} /> Commerce</a>
            <a href="#payments"><CreditCard size={13} /> Payments</a>
            <a href="#notifications"><Bell size={13} /> Notifications</a>
            <a href="#team"><Users size={13} /> Team</a>
          </nav>

          <div className="settings-main">
            <Card className="form-section settings-section" id="brand">
              <div className="form-section-head">
                <div>
                  <h2>Brand</h2>
                  <p>How the label introduces itself across receipts, emails and the console.</p>
                </div>
                <BadgeCheck size={16} style={{ color: "var(--gold)" }} />
              </div>
              <div className="form-grid">
                <Field label="Brand name">
                  <input className="input" value={draft.brand.name} onChange={(event) => updateBrand({ name: event.target.value })} />
                </Field>
                <Field label="Support email">
                  <input className="input" type="email" value={draft.brand.email} onChange={(event) => updateBrand({ email: event.target.value })} />
                </Field>
                <Field label="Tagline" className="span-2">
                  <input className="input" value={draft.brand.tagline} onChange={(event) => updateBrand({ tagline: event.target.value })} />
                </Field>
                <Field label="Support phone">
                  <input className="input" value={draft.brand.supportPhone} onChange={(event) => updateBrand({ supportPhone: event.target.value })} />
                </Field>
                <Field label="Registered address">
                  <input className="input" value={draft.brand.address} onChange={(event) => updateBrand({ address: event.target.value })} />
                </Field>
              </div>
            </Card>

            <Card className="form-section settings-section" id="commerce">
              <div className="form-section-head">
                <div>
                  <h2>Commerce</h2>
                  <p>Currency, tax and shipping arithmetic applied to every new order.</p>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Currency">
                  <Segmented
                    value={draft.currency}
                    onChange={(value) => update({ currency: value })}
                    options={[
                      { value: "USD", label: "USD $" },
                      { value: "INR", label: "INR ₹" },
                      { value: "GBP", label: "GBP £" },
                    ]}
                  />
                </Field>
                <Field label="Tax rate" hint="Percentage applied to the subtotal.">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={draft.taxRate}
                    onChange={(event) => update({ taxRate: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Flat shipping">
                  <input className="input" type="number" min={0} value={draft.shippingFlat} onChange={(event) => update({ shippingFlat: Number(event.target.value) })} />
                </Field>
                <Field label="Free shipping over">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={draft.freeShippingThreshold}
                    onChange={(event) => update({ freeShippingThreshold: Number(event.target.value) })}
                  />
                </Field>
              </div>
            </Card>

            <Card className="form-section settings-section" id="payments">
              <div className="form-section-head">
                <div>
                  <h2>Payments</h2>
                  <p>One line, five rails. Toggle each without leaving the row.</p>
                </div>
                <Badge tone="info">{Object.values(draft.payments).filter(Boolean).length} enabled</Badge>
              </div>
              <div className="pay-line">
                {PAYMENT_META.map((method) => (
                  <div key={method.key} className="pay-tile">
                    <span className={`pay-mark ${method.tone}`}>{method.mark}</span>
                    <span className="grow">
                      <strong>{method.label}</strong>
                      <span>{draft.payments[method.key] ? "Enabled" : "Off"}</span>
                    </span>
                    <Toggle checked={draft.payments[method.key]} onChange={(value) => updatePayment(method.key, value)} label={`${method.label} payments`} />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="form-section settings-section" id="notifications">
              <div className="form-section-head">
                <div>
                  <h2>Notifications</h2>
                  <p>What reaches the console bell. In-app only; no external email in this build.</p>
                </div>
                <Bell size={16} style={{ color: "var(--gold)" }} />
              </div>
              {NOTIFICATION_META.map((pref) => (
                <div key={pref.key} className="pref-row">
                  <div>
                    <strong>{pref.title}</strong>
                    <span>{pref.body}</span>
                  </div>
                  <Toggle checked={draft.notifications[pref.key]} onChange={(value) => updateNotification(pref.key, value)} label={pref.title} />
                </div>
              ))}
            </Card>

            <Card className="form-section settings-section" id="team">
              <div className="form-section-head">
                <div>
                  <h2>Team & roles</h2>
                  <p>Access is scoped: admins configure, managers curate, fulfilment moves orders.</p>
                </div>
                <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={openNewMember}>
                  Add member
                </Button>
              </div>
              {team.error ? (
                <ErrorState title="Team unavailable" body={team.error} onRetry={team.reload} />
              ) : team.loading ? (
                <div className="stack-18">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span key={index} className="sk sk-line" style={{ height: 40 }} />
                  ))}
                </div>
              ) : (
                <div className="team-list">
                  {team.data?.data.map((entry) => (
                    <div key={entry.id} className="team-row">
                      <div className="team-person">
                        <Avatar name={entry.name} size={28} />
                        <div>
                          <strong>
                            {entry.name} {entry.id === user?.id ? <Badge tone="gold">You</Badge> : null}
                          </strong>
                          <span>
                            {entry.email} · {entry.title}
                          </span>
                        </div>
                      </div>
                      <Badge tone={entry.role === "admin" ? "gold" : entry.role === "manager" ? "info" : "neutral"} dot>
                        {foldWords(entry.role)}
                      </Badge>
                      <span className="cell-sub">{relative(entry.lastActiveAt)}</span>
                      <div className="team-controls">
                        <IconButton label={`Edit ${entry.name}`} size="sm" onClick={() => openEditMember(entry)}>
                          <Pencil size={12} />
                        </IconButton>
                        <IconButton
                          label={`Remove ${entry.name}`}
                          size="sm"
                          tone="danger"
                          disabled={entry.id === user?.id}
                          onClick={() => setDeleting(entry)}
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="save-bar">
              <span>{dirty ? "Unsaved changes across brand, commerce or notifications." : "All settings are saved."}</span>
              <Button variant="primary" icon={<Save size={14} />} loading={saving} disabled={!dirty} onClick={() => void save()}>
                Save settings
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(member)}
        onClose={() => setMember(null)}
        title={member === "new" ? "Add team member" : "Edit team member"}
        description="Roles determine which workspaces and mutations are available."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMember(null)}>Cancel</Button>
            <Button variant="primary" loading={teamSaving} icon={<KeyRound size={14} />} onClick={() => void saveMember()}>
              {member === "new" ? "Create account" : "Save member"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Full name" required>
            <input className="input" value={teamDraft.name} onChange={(event) => setTeamDraft({ ...teamDraft, name: event.target.value })} />
          </Field>
          <Field label="Email" required>
            <input
              className="input"
              type="email"
              value={teamDraft.email}
              disabled={member !== "new"}
              onChange={(event) => setTeamDraft({ ...teamDraft, email: event.target.value })}
            />
          </Field>
          <Field label="Job title" required>
            <input className="input" value={teamDraft.title} onChange={(event) => setTeamDraft({ ...teamDraft, title: event.target.value })} />
          </Field>
          <Field label="Role">
            <select className="select" value={teamDraft.role} onChange={(event) => setTeamDraft({ ...teamDraft, role: event.target.value as Role })}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {foldWords(role)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={member === "new" ? "Password" : "New password"} hint={member === "new" ? "Minimum 8 characters." : "Leave blank to keep the current password."} className="span-2">
            <input
              className="input"
              type="password"
              value={teamDraft.password}
              onChange={(event) => setTeamDraft({ ...teamDraft, password: event.target.value })}
              placeholder="••••••••"
            />
          </Field>
        </div>
        {teamError ? <p className="form-error" style={{ marginTop: 10 }}>{teamError}</p> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void removeMember()}
        title={`Remove ${deleting?.name ?? "member"}?`}
        body="Their session ends immediately. The last admin account cannot be removed."
        confirmLabel="Remove member"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
