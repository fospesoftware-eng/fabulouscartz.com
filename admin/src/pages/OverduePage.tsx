import { useState } from "react";
import { AlertTriangle, ArrowRight, BellRing, Scale } from "lucide-react";
import type { OverdueBooking } from "../../shared/marketplace";
import { Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, TableSkeleton } from "../components/ui";
import { useUI } from "../context/UIContext";
import { marketplace } from "../lib/marketplace";
import { useResource } from "../lib/hooks";
import { dateMedium, foldWords, money } from "../lib/utils";

export function OverduePage() {
  const { notify } = useUI();
  const [busy, setBusy] = useState<string | null>(null);
  const [raised, setRaised] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<OverdueBooking | null>(null);
  const [reason, setReason] = useState("");

  const overdue = useResource(() => marketplace.overdue(), []);

  const remind = async (row: OverdueBooking) => {
    setBusy(`remind-${row.booking.id}`);
    try {
      await marketplace.remind(row.booking.id);
      setRaised((current) => new Set(current).add(row.booking.id));
      notify({ kind: "success", title: "Renter notified", description: `${row.booking.renterName} · ${row.booking.number} · reminder logged on the timeline.` });
    } catch (cause) {
      notify({ kind: "error", title: "Reminder not sent", description: cause instanceof Error ? cause.message : "The API rejected the reminder." });
    } finally {
      setBusy(null);
    }
  };

  const startDispute = async () => {
    if (!target || reason.trim().length < 6) return;
    setBusy("dispute");
    try {
      await marketplace.openDispute(target.booking.id, reason);
      notify({ kind: "success", title: "Dispute opened", description: `${target.booking.number} moved to the disputes desk.` });
      setTarget(null);
      setReason("");
      overdue.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Dispute not opened", description: cause instanceof Error ? cause.message : "The API rejected the dispute." });
    } finally {
      setBusy(null);
    }
  };

  if (overdue.error) return <ErrorState title="Overdue queue is offline" body={overdue.error} onRetry={overdue.reload} />;

  const rows = overdue.data?.data ?? [];
  const totalLate = rows.reduce((sum, row) => sum + row.accruedLateFee, 0);
  const depositAtRisk = rows.reduce((sum, row) => sum + row.depositHeld, 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Rentals</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Overdue</span>
          </nav>
          <p className="eyebrow page-eyebrow">Escalation</p>
          <h1 className="page-title">Lateness is a money problem.</h1>
          <p className="page-description">
            Days late, the fee that accrues every day, and the deposit still in hand. Notify the renter or open a dispute from here.
          </p>
        </div>
      </div>

      <div className="summary-strip">
        <Card className="summary-tile" data-accent="rose">
          <div className="summary-tile-top"><span>Overdue bookings</span><span className="kpi-icon"><AlertTriangle size={13} /></span></div>
          <strong>{rows.length}</strong><em>awaiting a return scan</em>
        </Card>
        <Card className="summary-tile" data-accent="gold">
          <div className="summary-tile-top"><span>Accrued late fees</span><span className="kpi-icon"><Scale size={13} /></span></div>
          <strong>{money(totalLate)}</strong><em>at the 50% daily rate</em>
        </Card>
        <Card className="summary-tile" data-accent="slate">
          <div className="summary-tile-top"><span>Deposits at risk</span><span className="kpi-icon"><BellRing size={13} /></span></div>
          <strong>{money(depositAtRisk)}</strong><em>still authorized</em>
        </Card>
      </div>

      <Card className="table-card">
        {overdue.loading ? <TableSkeleton rows={6} /> : rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Booking</th><th>Renter</th><th>Listing</th><th className="num">Days late</th><th className="num">Late fee</th><th className="num">Deposit held</th><th>Due back</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.booking.id}>
                    <td><span className="cell-title mono">{row.booking.number}<em className="cell-sub">{foldWords(row.booking.state)}</em></span></td>
                    <td>{row.booking.renterName}</td>
                    <td className="muted">{row.booking.listingTitle}</td>
                    <td className="num"><Badge tone="danger">{row.daysLate}d late</Badge></td>
                    <td className="num mono">{money(row.accruedLateFee)}</td>
                    <td className="num mono">{money(row.depositHeld)}</td>
                    <td className="mono">{dateMedium(row.booking.endDate)}</td>
                    <td className="cell-actions">
                      <Button size="sm" variant="outline" disabled={raised.has(row.booking.id)} loading={busy === `remind-${row.booking.id}`} onClick={() => void remind(row)}>
                        <BellRing size={12} /> {raised.has(row.booking.id) ? "Notified" : "Notify renter"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => { setTarget(row); setReason(""); }}>
                        <Scale size={12} /> Start dispute
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Nothing overdue" body="Every rental is currently inside its return window." />}
      </Card>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="Open a dispute"
        description={target ? `${target.booking.number} · ${target.booking.renterName} · ${target.daysLate} days late` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={busy === "dispute"} disabled={reason.trim().length < 6} onClick={() => void startDispute()}>Open dispute</Button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Dispute reason</span>
          <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What happened, what evidence exists, what the renter was told…" />
        </label>
      </Modal>
    </div>
  );
}
