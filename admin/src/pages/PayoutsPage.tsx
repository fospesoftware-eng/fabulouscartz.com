import { useState } from "react";
import { ArrowRight, Banknote, CircleCheck, CircleX, Wallet } from "lucide-react";
import type { Payout } from "../../shared/marketplace";
import { Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, TableSkeleton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { marketplace } from "../lib/marketplace";
import { useResource } from "../lib/hooks";
import { money, num } from "../lib/utils";

function SummaryTile({ icon: Icon, label, value, note, accent }: { icon: typeof Wallet; label: string; value: string; note: string; accent: string }) {
  return (
    <Card className="summary-tile" data-accent={accent}>
      <div className="summary-tile-top">
        <span>{label}</span>
        <span className="kpi-icon"><Icon size={13} /></span>
      </div>
      <strong>{value}</strong>
      <em>{note}</em>
    </Card>
  );
}

export function PayoutsPage() {
  const { user } = useAuth();
  const { notify } = useUI();
  const canMoney = user?.role !== "fulfilment";
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [target, setTarget] = useState<Payout | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  const payouts = useResource(() => marketplace.payouts({ period, status }), [period, status]);

  const markPaid = async () => {
    if (!target || reference.trim().length < 3) return;
    setBusy(true);
    const snapshot = payouts.data;
    payouts.setData((current) =>
      current
        ? { ...current, data: current.data.map((row) => (row.id === target.id ? { ...row, status: "paid" as const, reference, paidAt: new Date().toISOString() } : row)) }
        : current,
    );
    try {
      const updated = await marketplace.markPaid(target.id, reference);
      payouts.setData((current) => (current ? { ...current, data: current.data.map((row) => (row.id === updated.id ? updated : row)) } : current));
      notify({ kind: "success", title: "Payout marked paid", description: `${updated.sellerName} · ${money(updated.net)} · ${reference}` });
      setTarget(null);
      setReference("");
      payouts.reload();
    } catch (cause) {
      payouts.setData(() => snapshot);
      notify({ kind: "error", title: "Payout not marked paid", description: cause instanceof Error ? cause.message : "The API rejected the update." });
    } finally {
      setBusy(false);
    }
  };

  if (payouts.error) return <ErrorState title="Payouts are offline" body={payouts.error} onRetry={payouts.reload} />;

  const summary = payouts.data?.summary;
  const rows = payouts.data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Marketplace</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Payouts</span>
          </nav>
          <p className="eyebrow page-eyebrow">Settlement</p>
          <h1 className="page-title">Every dollar accounted for.</h1>
          <p className="page-description">
            Gross, commission, refunds and net per seller period. Marking a payout paid writes a bank reference to the audit log.
          </p>
        </div>
        <div className="page-actions">
          {canMoney ? null : <span className="restricted-note">Fulfilment: payout actions are view-only</span>}
        </div>
      </div>

      <div className="summary-strip">
        <SummaryTile icon={Wallet} label="Total due" value={money(summary?.due ?? 0)} note="Awaiting bank release" accent="gold" />
        <SummaryTile icon={CircleCheck} label="Paid out" value={money(summary?.paid ?? 0)} note="Across closed periods" accent="emerald" />
        <SummaryTile icon={CircleX} label="Failed" value={money(summary?.failed ?? 0)} note="Bank rejected — needs retry" accent="rose" />
      </div>

      <div className="toolbar">
        <select className="select input-sm" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Payout period">
          <option value="">All periods</option>
          {(payouts.data?.periods ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select className="select input-sm" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Payout status">
          <option value="">All statuses</option>
          <option value="due">Due</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
        <span className="toolbar-spacer" />
        <span className="hint">{num(rows.length)} payout rows</span>
      </div>

      <Card className="table-card">
        {payouts.loading ? <TableSkeleton rows={7} /> : rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Period</th>
                  <th className="num">Gross</th>
                  <th className="num">Commission</th>
                  <th className="num">Refunds</th>
                  <th className="num">Net</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><span className="cell-title">{row.sellerName}<em className="cell-sub">{row.reference ? `Ref ${row.reference}` : "No bank reference yet"}</em></span></td>
                    <td className="mono">{row.period}</td>
                    <td className="num mono">{money(row.gross)}</td>
                    <td className="num mono muted">−{money(row.commission)}</td>
                    <td className="num mono muted">−{money(row.refunds)}</td>
                    <td className="num mono strong">{money(row.net)}</td>
                    <td><Badge tone={row.status === "paid" ? "positive" : row.status === "failed" ? "danger" : "gold"}>{row.status}</Badge></td>
                    <td className="cell-actions">
                      {row.status === "due" || row.status === "failed" ? (
                        <Button variant="gold" size="sm" disabled={!canMoney} title={canMoney ? undefined : "Fulfilment cannot release payouts"} onClick={() => { setTarget(row); setReference(""); }}>
                          <Banknote size={13} /> Mark paid
                        </Button>
                      ) : <span className="hint">{row.paidAt ? "Settled" : ""}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No payouts in this view" body="Change the period or status to see settlement rows." />}
      </Card>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="Mark payout paid"
        description={target ? `${target.sellerName} · ${target.period} · ${money(target.net)} net` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="gold" loading={busy} disabled={reference.trim().length < 3} onClick={() => void markPaid()}>
              <CircleCheck size={14} /> Confirm payment
            </Button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Bank reference</span>
          <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. ACH-20261103-8842" autoFocus />
          <span className="field-hint">Required. Appears on the payout row and audit entry.</span>
        </label>
      </Modal>
    </div>
  );
}
