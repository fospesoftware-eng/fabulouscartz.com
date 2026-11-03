import { useState } from "react";
import { ArrowRight, Lock, ShieldCheck, TimerReset, Wallet } from "lucide-react";
import type { Booking, DepositRow, DepositState } from "../../shared/marketplace";
import { Drawer, Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, Segmented, TableSkeleton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { marketplace } from "../lib/marketplace";
import { useResource } from "../lib/hooks";
import { dateMedium, dateTime, foldWords, money } from "../lib/utils";

const FILTERS = [
  { value: "", label: "All" },
  { value: "authorized", label: "Held" },
  { value: "captured", label: "Captured" },
  { value: "released", label: "Released" },
];

function toneFor(state: DepositState): "gold" | "danger" | "positive" | "neutral" {
  return state === "authorized" ? "gold" : state === "captured" ? "danger" : state === "released" ? "positive" : "neutral";
}

export function DepositsPage() {
  const { user } = useAuth();
  const { notify } = useUI();
  const canMoney = user?.role !== "fulfilment";
  const [state, setState] = useState("");
  const [target, setTarget] = useState<DepositRow | null>(null);
  const [mode, setMode] = useState<"capture" | "release" | null>(null);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [ledgerId, setLedgerId] = useState<string | null>(null);

  const deposits = useResource(() => marketplace.deposits(state || undefined), [state]);
  const booking = useResource(() => marketplace.booking(ledgerId ?? ""), [ledgerId], { enabled: Boolean(ledgerId) });

  const open = (row: DepositRow, next: "capture" | "release") => {
    setTarget(row);
    setMode(next);
    setAmount(row.amount);
    setReason("");
  };

  const submit = async () => {
    if (!target || !mode || reason.trim().length < 4) return;
    setBusy(true);
    try {
      const updated = mode === "capture"
        ? await marketplace.captureDeposit(target.bookingId, amount, reason)
        : await marketplace.releaseDeposit(target.bookingId, reason);
      notify({
        kind: "success",
        title: mode === "capture" ? "Deposit captured" : "Deposit released",
        description: `${updated.number} · ${money(mode === "capture" ? updated.depositCaptured ?? amount : updated.deposit)} · ${reason}`,
      });
      deposits.reload();
      if (ledgerId) booking.reload();
      setTarget(null);
      setMode(null);
    } catch (cause) {
      notify({ kind: "error", title: "Deposit action failed", description: cause instanceof Error ? cause.message : "Only admins and managers can move deposit money." });
    } finally {
      setBusy(false);
    }
  };

  if (deposits.error) return <ErrorState title="Deposits are offline" body={deposits.error} onRetry={deposits.reload} />;

  const rows = deposits.data?.data ?? [];
  const held = rows.filter((row) => row.state === "authorized");
  const heldTotal = held.reduce((sum, row) => sum + row.amount, 0);
  const expiring = held.filter((row) => row.daysToExpiry <= 5).length;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Rentals</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Deposits</span>
          </nav>
          <p className="eyebrow page-eyebrow">Money held</p>
          <h1 className="page-title">Deposits with a paper trail.</h1>
          <p className="page-description">
            Every authorized hold, its age and expiry, and the capture or release decision behind it.
          </p>
        </div>
        <div className="page-actions">
          {canMoney ? null : <span className="restricted-note"><Lock size={12} /> View-only for fulfilment</span>}
        </div>
      </div>

      <div className="summary-strip">
        <Card className="summary-tile" data-accent="gold">
          <div className="summary-tile-top"><span>Currently held</span><span className="kpi-icon"><Wallet size={13} /></span></div>
          <strong>{money(heldTotal)}</strong><em>{held.length} active holds</em>
        </Card>
        <Card className="summary-tile" data-accent="rose">
          <div className="summary-tile-top"><span>Expiring soon</span><span className="kpi-icon"><TimerReset size={13} /></span></div>
          <strong>{expiring}</strong><em>within five days</em>
        </Card>
        <Card className="summary-tile" data-accent="emerald">
          <div className="summary-tile-top"><span>Captured</span><span className="kpi-icon"><ShieldCheck size={13} /></span></div>
          <strong>{money(rows.filter((row) => row.state === "captured").reduce((sum, row) => sum + row.amount, 0))}</strong><em>damage claims upheld</em>
        </Card>
      </div>

      <div className="toolbar">
        <Segmented value={state} onChange={setState} options={FILTERS} />
        <span className="toolbar-spacer" />
        <span className="hint">{rows.length} deposit rows</span>
      </div>

      <Card className="table-card">
        {deposits.loading ? <TableSkeleton rows={7} /> : rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Booking</th><th>Renter</th><th>Listing</th><th className="num">Amount</th><th>State</th><th className="num">Age</th><th className="num">Expiry</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.bookingId}>
                    <td><span className="cell-title mono">{row.number}<em className="cell-sub">{row.sellerName}</em></span></td>
                    <td>{row.renterName}</td>
                    <td className="muted">{row.listingTitle}</td>
                    <td className="num mono strong">{money(row.amount)}</td>
                    <td><Badge tone={toneFor(row.state)}>{row.state === "authorized" ? "held" : row.state}</Badge></td>
                    <td className="num mono">{row.ageDays}d</td>
                    <td className="num mono">{row.daysToExpiry <= 0 ? "Expired" : `${row.daysToExpiry}d`}</td>
                    <td className="cell-actions">
                      <Button size="sm" variant="ghost" onClick={() => setLedgerId(row.bookingId)}>Ledger</Button>
                      {row.state === "authorized" ? (
                        <>
                          <Button size="sm" variant="outline" disabled={!canMoney} title={canMoney ? undefined : "Fulfilment cannot release deposits"} onClick={() => open(row, "release")}>Release</Button>
                          <Button size="sm" variant="danger" disabled={!canMoney} title={canMoney ? undefined : "Fulfilment cannot capture deposits"} onClick={() => open(row, "capture")}>Capture</Button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No deposits in this state" body="Switch the filter to see held, captured or released money." />}
      </Card>

      <Modal
        open={Boolean(mode && target)}
        onClose={() => { setMode(null); setTarget(null); }}
        title={mode === "capture" ? "Capture deposit" : "Release deposit"}
        description={target ? `${target.number} · ${target.renterName} · held ${money(target.amount)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setMode(null); setTarget(null); }}>Cancel</Button>
            <Button variant={mode === "capture" ? "danger" : "primary"} loading={busy} disabled={reason.trim().length < 4 || (mode === "capture" && amount <= 0)} onClick={() => void submit()}>
              {mode === "capture" ? `Capture ${money(amount)}` : "Release in full"}
            </Button>
          </>
        }
      >
        <div className="stack-16">
          {mode === "capture" ? (
            <label className="field">
              <span className="field-label">Amount to capture</span>
              <div className="input-group">
                <input className="input" type="number" min={1} max={target?.amount ?? 0} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
                <span className="input-suffix">USD</span>
              </div>
            </label>
          ) : <p className="confirm-copy">The full {target ? money(target.amount) : "amount"} returns to the renter's card. The hold closes immediately.</p>}
          <label className="field">
            <span className="field-label">Reason</span>
            <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={mode === "capture" ? "Damage evidence, inspection notes…" : "Inspection passed, returned in full…"} />
          </label>
        </div>
      </Modal>

      <Drawer
        open={Boolean(ledgerId)}
        onClose={() => setLedgerId(null)}
        width={520}
        eyebrow="Deposit ledger"
        title={booking.data ? `${booking.data.number} · ${booking.data.renterName}` : "Ledger"}
        subtitle={booking.data?.listingTitle}
      >
        {booking.loading ? <TableSkeleton rows={5} /> : booking.data ? (
          <div className="stack-18">
            <div className="workspace-stats">
              <div><span>Held</span><strong>{money(booking.data.deposit)}</strong></div>
              <div><span>State</span><strong className="small-strong">{booking.data.depositState === "authorized" ? "Held" : foldWords(booking.data.depositState)}</strong></div>
              <div><span>Booking total</span><strong>{money(booking.data.total)}</strong></div>
              <div><span>Authorized</span><strong className="small-strong">{dateMedium(booking.data.createdAt)}</strong></div>
            </div>
            <section className="panel-block">
              <div className="panel-block-head"><div><h3>Money trail</h3><p>Authorization, capture and release events.</p></div></div>
              <ol className="booking-timeline">
                {booking.data.timeline.filter((event) => /deposit|payment|completed/i.test(event.label)).map((event, index) => (
                  <li key={`${event.at}-${index}`}><span className="timeline-dot" /><div><strong>{event.label}</strong><p>{event.detail}</p><em>{dateTime(event.at)} · {event.actor}</em></div></li>
                ))}
              </ol>
            </section>
            {booking.data.depositReason ? <div className="ledger-note"><Badge tone={toneFor(booking.data.depositState)}>{booking.data.depositState === "authorized" ? "held" : booking.data.depositState}</Badge><p>{booking.data.depositReason}</p></div> : null}
          </div>
        ) : <EmptyState title="Ledger not loaded" body="Close and reopen the drawer." />}
      </Drawer>
    </div>
  );
}
