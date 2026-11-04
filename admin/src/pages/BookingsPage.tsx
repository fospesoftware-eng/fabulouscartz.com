import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, Lock, MessageSquare, ShieldCheck } from "lucide-react";
import type { Booking, BookingState, DepositState } from "../../shared/marketplace";
import { BOOKING_STATES } from "../../shared/marketplace";
import { Drawer, Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, SearchInput } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { marketplace } from "../lib/marketplace";
import { useDebounced, useResource } from "../lib/hooks";
import { dateShort, dateTime, foldWords, money } from "../lib/utils";

const STATE_TONE: Record<BookingState, "positive" | "warning" | "danger" | "info" | "gold" | "neutral"> = {
  requested: "warning",
  approved: "info",
  deposit_authorized: "gold",
  dispatched: "info",
  in_use: "positive",
  return_due: "warning",
  returned: "info",
  inspection: "gold",
  completed: "neutral",
  overdue: "danger",
  disputed: "danger",
};

const DEPOSIT_TONE: Record<DepositState, "neutral" | "gold" | "danger" | "positive"> = {
  none: "neutral",
  authorized: "gold",
  captured: "danger",
  released: "positive",
};

function depositLabel(state: DepositState): string {
  if (state === "authorized") return "held";
  if (state === "none") return "not placed";
  return state;
}

function depositBadge(state: DepositState): string {
  if (state === "none") return "No hold";
  return depositLabel(state);
}

function BookingCard({ booking, onOpen }: { booking: Booking; onOpen: () => void }) {
  return (
    <button type="button" className="booking-card" onClick={onOpen} aria-label={`Open ${booking.number}`}>
      <div className="booking-thumb">
        <img src={booking.listingImage} alt="" loading="lazy" />
        <span className="booking-days">{booking.days}d</span>
      </div>
      <div className="booking-card-copy">
        <div className="booking-card-head">
          <strong>{booking.listingTitle}</strong>
          <Badge tone={DEPOSIT_TONE[booking.depositState]}>
            {booking.depositState === "none" ? "No hold" : `Deposit ${depositLabel(booking.depositState)}`}
          </Badge>
        </div>
        <p className="booking-people">{booking.renterName} → {booking.ownerName}</p>
        <div className="booking-dates"><CalendarDays size={11} /> {dateShort(booking.startDate)} → {dateShort(booking.endDate)}</div>
        <div className="booking-money">
          <span>{money(booking.total)}</span>
          <em>{money(booking.deposit)} deposit</em>
        </div>
      </div>
    </button>
  );
}

export function BookingsPage() {
  const { user } = useAuth();
  const { notify } = useUI();
  const canMoney = user?.role !== "fulfilment";
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 280);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureAmount, setCaptureAmount] = useState(0);
  const [captureReason, setCaptureReason] = useState("");

  const list = useResource(() => marketplace.bookings({ q: debounced || undefined }), [debounced]);
  const detail = useResource(() => marketplace.booking(selected?.id ?? ""), [selected?.id], { enabled: Boolean(selected) });
  const [params, setParams] = useSearchParams();
  const deepLink = params.get("booking");

  useEffect(() => {
    if (!deepLink || !list.data) return;
    const match = list.data.data.find((row) => row.id === deepLink);
    if (match) setSelected(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink, list.data]);

  const closeWorkspace = () => {
    setSelected(null);
    if (deepLink) {
      const next = new URLSearchParams(params);
      next.delete("booking");
      setParams(next, { replace: true });
    }
  };

  const move = async (to: BookingState, noteText?: string) => {
    if (!selected) return;
    setBusy(to);
    try {
      const updated = await marketplace.transition(selected.id, to, noteText);
      setSelected(updated);
      detail.setData(updated);
      list.reload();
      notify({ kind: "success", title: `${updated.number} → ${foldWords(to)}`, description: noteText || "The timeline and audit trail were updated." });
    } catch (cause) {
      notify({ kind: "error", title: "Transition blocked", description: cause instanceof Error ? cause.message : "That state change is not allowed." });
    } finally {
      setBusy(null);
    }
  };

  const capture = async () => {
    if (!selected || captureAmount <= 0 || captureReason.trim().length < 4) return;
    setBusy("capture");
    try {
      const updated = await marketplace.captureDeposit(selected.id, captureAmount, captureReason);
      setSelected(updated);
      detail.setData(updated);
      list.reload();
      setCaptureOpen(false);
      notify({ kind: "success", title: "Deposit captured", description: `${money(updated.depositCaptured ?? captureAmount)} retained · ${captureReason}` });
    } catch (cause) {
      notify({ kind: "error", title: "Capture failed", description: cause instanceof Error ? cause.message : "Only admins and managers can capture deposits." });
    } finally {
      setBusy(null);
    }
  };

  if (list.error) return <ErrorState title="Could not load the rental board" body={list.error} onRetry={list.reload} />;

  const bookings = list.data?.data ?? [];
  const board = BOOKING_STATES.map((state) => ({ state, items: bookings.filter((booking) => booking.state === state) }));
  const active = detail.data && selected ? detail.data : selected;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Rentals</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Bookings</span>
          </nav>
          <p className="eyebrow page-eyebrow">Rental operations</p>
          <h1 className="page-title">Every rental, one honest state.</h1>
          <p className="page-description">
            States only move through their valid transitions — no drag shortcuts. Deposits, inspect results and renter notes live on each booking.
          </p>
        </div>
        <div className="page-actions">
          <SearchInput value={q} onChange={setQ} placeholder="Search booking, renter, item…" />
        </div>
      </div>

      {!canMoney ? <div className="restricted-banner"><Lock size={14} /> Fulfilment can operate bookings, but deposit capture and release are restricted to admin and managers.</div> : null}

      {list.loading ? (
        <div className="booking-board sk-board"><Card className="booking-column"><div className="sk sk-block" style={{ height: 260 }} /></Card></div>
      ) : (
        <div className="booking-board" role="list" aria-label="Bookings by state">
          {board.map((column) => (
            <section key={column.state} className={`booking-column state-${column.state}`} role="listitem" aria-label={foldWords(column.state)}>
              <header className="booking-column-head">
                <span className={`state-dot tone-${STATE_TONE[column.state]}`} />
                <h2>{foldWords(column.state)}</h2>
                <span className="booking-count">{column.items.length}</span>
              </header>
              <div className="booking-column-body">
                {column.items.map((booking) => <BookingCard key={booking.id} booking={booking} onOpen={() => setSelected(booking)} />)}
                {column.items.length === 0 ? <div className="booking-empty">Nothing here</div> : null}
              </div>
            </section>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={closeWorkspace}
        width={720}
        eyebrow={active ? `${active.number} · ${foldWords(active.state)}` : "Booking workspace"}
        title={active?.listingTitle ?? "Booking"}
        subtitle={active ? `${active.renterName} · ${dateShort(active.startDate)} → ${dateShort(active.endDate)} · ${active.days} days` : undefined}
        actions={active ? <Badge tone={STATE_TONE[active.state]}>{foldWords(active.state)}</Badge> : null}
        footer={active ? (
          <div className="booking-action-bar">
            <div className="booking-action-note">
              {active.allowedTransitions.length ? `Next allowed: ${active.allowedTransitions.map(foldWords).join(" · ")}` : "This booking is closed."}
            </div>
            {active.allowedTransitions.length ? (
              <>
                {active.allowedTransitions.map((to) => (
                  <Button key={to} variant={to === "disputed" || to === "overdue" ? "outline" : "primary"} loading={busy === to} onClick={() => void move(to)}>
                    <ArrowUpRight size={13} /> {foldWords(to)}
                  </Button>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      >
        {active ? (
          <div className="stack-18">
            <div className="workspace-stats">
              <div><span>Rental fee</span><strong>{money(active.rentalFee)}</strong></div>
              <div><span>Total charged</span><strong>{money(active.total)}</strong></div>
              <div><span>Deposit · {depositLabel(active.depositState)}</span><strong>{money(active.deposit)}</strong></div>
              <div><span>Owner</span><strong className="small-strong">{active.ownerName}</strong></div>
            </div>

            <section className="panel-block">
              <div className="panel-block-head"><div><h3>Money breakdown</h3><p>Rental fee, platform commission and security deposit from the API.</p></div></div>
              <div className="money-ledger">
                <div><span>Rental fee · {active.days} days</span><strong>{money(active.rentalFee)}</strong></div>
                <div><span>Platform commission</span><strong>{money(active.tax)}</strong></div>
                <div className="money-total"><span>Charged to renter</span><strong>{money(active.total)}</strong></div>
                <div className="money-deposit">
                  <span>Security deposit · {active.depositState === "none" ? "not held yet" : depositLabel(active.depositState)}</span>
                  <strong>{money(active.deposit)}</strong>
                </div>
              </div>
            </section>

            <section className="panel-block">
              <div className="panel-block-head">
                <div><h3><ShieldCheck size={15} /> Deposit ledger</h3><p>Authorized → captured / released. Timestamped in the timeline.</p></div>
                <Badge tone={DEPOSIT_TONE[active.depositState]}>{depositBadge(active.depositState)}</Badge>
              </div>
              <div className="deposit-ledger">
                {active.depositState === "none" ? (
                  <div className="deposit-empty">
                    <strong>No hold placed yet</strong>
                    <em>The {money(active.deposit)} deposit is authorized when this booking moves to “Deposit authorized”.</em>
                  </div>
                ) : (
                  <div className="deposit-step">
                    <span className={`deposit-dot tone-${DEPOSIT_TONE[active.depositState]}`} />
                    <div><strong>{money(active.deposit)} authorized</strong><em>Card hold placed at booking · {dateTime(active.createdAt)}</em></div>
                  </div>
                )}
                {active.depositState === "captured" ? (
                  <div className="deposit-step">
                    <span className="deposit-dot tone-danger" />
                    <div><strong>{money(active.depositCaptured ?? active.deposit)} captured</strong><em>{active.depositReason ?? "Damage claim upheld"}</em></div>
                  </div>
                ) : null}
                {active.depositState === "released" ? (
                  <div className="deposit-step">
                    <span className="deposit-dot tone-positive" />
                    <div><strong>{money(active.depositReleased ?? active.deposit)} released</strong><em>{active.depositReason ?? "Returned in full after inspection"}</em></div>
                  </div>
                ) : null}
                {active.depositState === "authorized" ? (
                  <div className="deposit-actions">
                    <Button size="sm" variant="danger" disabled={!canMoney} title={canMoney ? undefined : "Fulfilment cannot capture deposits"} onClick={() => { setCaptureAmount(active.deposit); setCaptureReason(""); setCaptureOpen(true); }}>
                      Capture deposit
                    </Button>
                    <Button size="sm" variant="outline" disabled={!canMoney} title={canMoney ? undefined : "Fulfilment cannot release deposits"} onClick={() => void marketplace.releaseDeposit(active.id, "Deposit released in full").then((updated) => { setSelected(updated); detail.setData(updated); list.reload(); notify({ kind: "success", title: "Deposit released", description: `${money(updated.deposit)} returned to ${updated.renterName}.` }); }).catch((cause: unknown) => notify({ kind: "error", title: "Release failed", description: cause instanceof Error ? cause.message : "Only admins and managers can release deposits." }))}>
                      Release deposit
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="panel-block">
              <div className="panel-block-head"><div><h3><Clock3 size={15} /> Timeline</h3><p>Every state change, newest last.</p></div></div>
              <ol className="booking-timeline">
                {active.timeline.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{event.label}</strong>
                      <p>{event.detail}</p>
                      <em>{dateTime(event.at)} · {event.actor}</em>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel-block">
              <div className="panel-block-head"><div><h3><MessageSquare size={15} /> Notes</h3><p>{active.notes.length} operations notes.</p></div></div>
              {active.notes.length ? (
                <div className="notes-thread">
                  {active.notes.map((entry) => (
                    <div key={entry.id} className="note-row">
                      <div className="note-meta"><strong>{entry.author}</strong><span>{dateTime(entry.at)}</span></div>
                      <p>{entry.body}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="hint">No notes on this booking yet.</p>}
              <div className="note-composer" style={{ alignItems: "center" }}>
                <p className="hint">Writing booking notes is not available in the API yet — notes are read-only here.</p>
              </div>
            </section>
          </div>
        ) : <EmptyState title="Booking not loaded" body="Close and reopen the workspace." />}
      </Drawer>

      <Modal
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        title="Capture deposit"
        description={active ? `${active.number} · ${active.renterName} · held ${money(active.deposit)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCaptureOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy === "capture"} disabled={captureAmount <= 0 || captureReason.trim().length < 4} onClick={() => void capture()}>
              Capture {money(captureAmount)}
            </Button>
          </>
        }
      >
        <div className="stack-16">
          <label className="field">
            <span className="field-label">Amount to capture</span>
            <div className="input-group">
              <input className="input" type="number" min={1} max={active?.deposit ?? 0} value={captureAmount} onChange={(event) => setCaptureAmount(Number(event.target.value))} />
              <span className="input-suffix">USD</span>
            </div>
            <span className="field-hint">Cannot exceed the held deposit of {active ? money(active.deposit) : "—"}.</span>
          </label>
          <label className="field">
            <span className="field-label">Reason</span>
            <textarea className="textarea" value={captureReason} onChange={(event) => setCaptureReason(event.target.value)} placeholder="Damage, staining or late-return evidence…" />
          </label>
        </div>
      </Modal>
    </div>
  );
}
