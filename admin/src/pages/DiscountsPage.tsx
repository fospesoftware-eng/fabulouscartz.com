import { useMemo, useState } from "react";
import { ArrowRight, BadgePercent, CheckCircle2, Pencil, Plus, Tag, TicketPercent, Trash2, XCircle } from "lucide-react";
import type { Coupon, CouponValidation } from "../../shared/types";
import { ConfirmDialog, Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Toggle } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { api } from "../lib/api";
import { useResource } from "../lib/hooks";
import { dateShort, money } from "../lib/utils";

interface Draft {
  code: string;
  description: string;
  type: Coupon["type"];
  value: number;
  minSpend: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number;
  active: boolean;
  appliesTo: string;
}

const EMPTY: Draft = {
  code: "",
  description: "",
  type: "percent",
  value: 10,
  minSpend: 0,
  startsAt: "2026-11-01",
  endsAt: "2027-01-31",
  usageLimit: 50,
  active: true,
  appliesTo: "all",
};

const toIso = (date: string) => `${date}T00:00:00+05:30`;

export function DiscountsPage() {
  const { notify } = useUI();
  const { user } = useAuth();
  const coupons = useResource<{ data: Coupon[] }>(() => api.get<{ data: Coupon[] }>("/discounts"), []);
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkCode, setCheckCode] = useState("WELCOME10");
  const [checkSubtotal, setCheckSubtotal] = useState(120);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CouponValidation | null>(null);

  const rows = useMemo(() => (coupons.data?.data ?? []).slice().sort((a, b) => Number(b.active) - Number(a.active)), [coupons.data]);
  const activeCount = rows.filter((coupon) => coupon.active).length;

  const openNew = () => {
    setDraft(EMPTY);
    setError(null);
    setEditing("new");
  };

  const openEdit = (coupon: Coupon) => {
    setDraft({
      code: coupon.code,
      description: coupon.description,
      type: coupon.type,
      value: coupon.value,
      minSpend: coupon.minSpend,
      startsAt: coupon.startsAt.slice(0, 10),
      endsAt: coupon.endsAt.slice(0, 10),
      usageLimit: coupon.usageLimit,
      active: coupon.active,
      appliesTo: coupon.appliesTo,
    });
    setError(null);
    setEditing(coupon);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { ...draft, code: draft.code.toUpperCase(), startsAt: toIso(draft.startsAt), endsAt: toIso(draft.endsAt) };
      if (editing === "new") {
        await api.post("/discounts", payload);
        notify({ kind: "success", title: "Coupon created", description: `${draft.code.toUpperCase()} is ready to validate.` });
      } else {
        await api.patch(`/discounts/${editing.id}`, payload);
        notify({ kind: "success", title: "Coupon updated", description: draft.code.toUpperCase() });
      }
      setEditing(null);
      coupons.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the coupon.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (coupon: Coupon) => {
    try {
      const updated = await api.patch<Coupon>(`/discounts/${coupon.id}`, { active: !coupon.active });
      coupons.setData((current) => (current ? { ...current, data: current.data.map((row) => (row.id === updated.id ? updated : row)) } : current));
      notify({ kind: "success", title: updated.active ? "Coupon activated" : "Coupon paused", description: updated.code });
    } catch (cause) {
      notify({ kind: "error", title: "Coupon not updated", description: cause instanceof Error ? cause.message : "Try again." });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/discounts/${deleting.id}`);
      notify({ kind: "success", title: "Coupon deleted", description: deleting.code });
      setDeleting(null);
      coupons.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Coupon not deleted", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const validate = async () => {
    setChecking(true);
    setResult(null);
    try {
      const response = await api.post<CouponValidation>("/discounts/validate", { code: checkCode.toUpperCase(), subtotal: checkSubtotal });
      setResult(response);
    } catch (cause) {
      notify({ kind: "error", title: "Validation call failed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Growth</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Discounts</span>
          </nav>
          <p className="eyebrow page-eyebrow">Promotions</p>
          <h1 className="page-title">Generosity, with rules.</h1>
          <p className="page-description">
            Percentage and flat coupons with windows, thresholds and usage ceilings. Validate a code against a basket before it reaches checkout.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<TicketPercent size={14} />} onClick={openNew}>
            New coupon
          </Button>
        </div>
      </div>

      <div className="discount-layout">
        <Card>
          <div className="section-heading">
            <div>
              <h2>{rows.length} coupons</h2>
              <p>{activeCount} active in the current window.</p>
            </div>
            <Badge tone="gold">{activeCount} live</Badge>
          </div>

          {coupons.error ? (
            <ErrorState title="Coupons unavailable" body={coupons.error} onRetry={coupons.reload} />
          ) : coupons.loading ? (
            <div className="stack-18">
              {Array.from({ length: 4 }).map((_, index) => (
                <span key={index} className="sk sk-line" style={{ height: 74, borderRadius: 13 }} />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<BadgePercent size={22} />}
              title="No coupons on the counter"
              body="Create a code to reward first orders or quiet-season carts."
              action={<Button variant="primary" size="sm" onClick={openNew}>New coupon</Button>}
            />
          ) : (
            <div className="coupon-list">
              {rows.map((coupon) => {
                const usage = coupon.usageLimit > 0 ? Math.min(100, (coupon.used / coupon.usageLimit) * 100) : 0;
                return (
                  <div key={coupon.id} className={`coupon-card ${coupon.active ? "" : "is-inactive"}`}>
                    <span className="coupon-code">{coupon.code}</span>
                    <div className="coupon-copy">
                      <strong>
                        {coupon.type === "percent" ? `${coupon.value}% off` : `${money(coupon.value)} off`}
                        {coupon.appliesTo !== "all" ? <span className="cell-sub" style={{ display: "inline", marginLeft: 6 }}>category only</span> : null}
                      </strong>
                      <span>{coupon.description}</span>
                      <div className="coupon-meta">
                        <span>
                          Min <b>{money(coupon.minSpend)}</b>
                        </span>
                        <span>
                          Ends <b>{dateShort(coupon.endsAt)}</b>
                        </span>
                        <span>
                          Used <b>{coupon.used}</b> / {coupon.usageLimit}
                        </span>
                      </div>
                      <div className="usage-bar">
                        <i style={{ width: `${usage}%` }} />
                      </div>
                    </div>
                    <div className="coupon-side">
                      <Toggle checked={coupon.active} onChange={() => void toggle(coupon)} label={`${coupon.code} active`} />
                      <div className="row" style={{ gap: 3 }}>
                        <IconButton label={`Edit ${coupon.code}`} size="sm" onClick={() => openEdit(coupon)}>
                          <Pencil size={12} />
                        </IconButton>
                        {user?.role === "admin" ? (
                          <IconButton label={`Delete ${coupon.code}`} size="sm" tone="danger" onClick={() => setDeleting(coupon)}>
                            <Trash2 size={12} />
                          </IconButton>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="validate-card">
          <div className="panel-head">
            <div>
              <h2>Validate a code</h2>
              <p>Test a basket without touching real orders.</p>
            </div>
            <Tag size={16} style={{ color: "var(--gold)" }} />
          </div>
          <div className="stack-18" style={{ gap: 10 }}>
            <Field label="Coupon code">
              <input
                className="input mono"
                value={checkCode}
                onChange={(event) => setCheckCode(event.target.value.toUpperCase())}
                placeholder="WELCOME10"
              />
            </Field>
            <Field label="Basket subtotal">
              <input
                className="input"
                type="number"
                min={0}
                value={checkSubtotal}
                onChange={(event) => setCheckSubtotal(Number(event.target.value))}
              />
            </Field>
            <Button variant="primary" loading={checking} onClick={() => void validate()} icon={<BadgePercent size={14} />}>
              Validate coupon
            </Button>
          </div>
          {result ? (
            <div className={`validate-result ${result.valid ? "is-valid" : "is-invalid"}`}>
              <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                {result.valid ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                <strong>{result.message}</strong>
              </div>
              {result.valid ? (
                <span>
                  Discount <b>{money(result.discount)}</b> · basket becomes <b>{money(result.total)}</b> · code {result.code}
                </span>
              ) : (
                <span>Try another active code or lower the minimum spend.</span>
              )}
            </div>
          ) : (
            <p className="hint" style={{ marginTop: 10 }}>
              Validation checks activity, date window, minimum spend, usage ceiling and applicability.
            </p>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New coupon" : editing ? `Edit ${editing.code}` : "Coupon"}
        description="Rules are enforced server-side at validation and checkout."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} icon={<Plus size={14} />} onClick={() => void save()}>
              {editing === "new" ? "Create coupon" : "Save coupon"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Code" required>
            <input className="input mono" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} placeholder="WELCOME10" />
          </Field>
          <Field label="Type">
            <select className="select" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Draft["type"] })}>
              <option value="percent">Percentage</option>
              <option value="flat">Flat amount</option>
            </select>
          </Field>
          <Field label="Value" required hint={draft.type === "percent" ? "Percent off, e.g. 10" : "Dollar amount off"}>
            <input className="input" type="number" min={0} value={draft.value} onChange={(event) => setDraft({ ...draft, value: Number(event.target.value) })} />
          </Field>
          <Field label="Minimum spend">
            <input className="input" type="number" min={0} value={draft.minSpend} onChange={(event) => setDraft({ ...draft, minSpend: Number(event.target.value) })} />
          </Field>
          <Field label="Starts">
            <input className="input" type="date" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} />
          </Field>
          <Field label="Ends">
            <input className="input" type="date" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} />
          </Field>
          <Field label="Usage limit">
            <input className="input" type="number" min={1} value={draft.usageLimit} onChange={(event) => setDraft({ ...draft, usageLimit: Number(event.target.value) })} />
          </Field>
          <Field label="Applies to">
            <select className="select" value={draft.appliesTo} onChange={(event) => setDraft({ ...draft, appliesTo: event.target.value })}>
              <option value="all">Entire order</option>
              <option value="category">Selected category</option>
            </select>
          </Field>
          <Field label="Description" className="span-2">
            <input className="input" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="10% off your first cart" />
          </Field>
          <div className="span-2 flag-row">
            <div>
              <strong>Active</strong>
              <span>Inactive coupons fail validation immediately.</span>
            </div>
            <Toggle checked={draft.active} onChange={(value) => setDraft({ ...draft, active: value })} label="Coupon active" />
          </div>
        </div>
        {error ? <p className="form-error" style={{ marginTop: 10 }}>{error}</p> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title={`Delete ${deleting?.code ?? "coupon"}?`}
        body="The code stops validating immediately. Orders that already used it keep their discount."
        confirmLabel="Delete coupon"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
