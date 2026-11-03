import { useState } from "react";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Booking } from "../../shared/marketplace";
import { Drawer } from "../components/overlay";
import { Badge, Button, Card, ErrorState, IconButton, Segmented } from "../components/ui";
import { marketplace } from "../lib/marketplace";
import { useResource } from "../lib/hooks";
import { dateMedium, dateShort, foldWords, isoDate, money } from "../lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATE_CLASS: Record<string, string> = {
  requested: "cal-requested",
  approved: "cal-approved",
  deposit_authorized: "cal-deposit",
  dispatched: "cal-dispatched",
  in_use: "cal-inuse",
  return_due: "cal-return",
  returned: "cal-returned",
  inspection: "cal-inspection",
  completed: "cal-completed",
  overdue: "cal-overdue",
  disputed: "cal-disputed",
};

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function overlaps(booking: Booking, dayIso: string): boolean {
  const day = new Date(`${dayIso}T12:00:00`).getTime();
  return day >= new Date(`${booking.startDate.slice(0, 10)}T00:00:00`).getTime() && day <= new Date(`${booking.endDate.slice(0, 10)}T23:59:59`).getTime();
}

export function CalendarPage() {
  const navigateTo = useNavigate();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<"month" | "week">("month");
  const [listingId, setListingId] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [jump, setJump] = useState(isoDate(today));
  const [selected, setSelected] = useState<Booking | null>(null);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = view === "month" ? startOfWeek(monthStart) : startOfWeek(cursor);
  const gridEnd = view === "month" ? addDays(gridStart, 41) : addDays(gridStart, 6);

  const calendar = useResource(
    () => marketplace.calendar({ from: isoDate(gridStart), to: isoDate(gridEnd), listingId: listingId || undefined }),
    [isoDate(gridStart), isoDate(gridEnd), listingId],
  );

  const navigate = (delta: number) => {
    if (view === "week") setCursor((current) => addDays(current, delta * 7));
    else setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const goToday = () => setCursor(view === "week" ? today : new Date(today.getFullYear(), today.getMonth(), 1));

  const jumpTo = () => {
    const parsed = new Date(`${jump}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setCursor(view === "week" ? startOfWeek(parsed) : new Date(parsed.getFullYear(), parsed.getMonth(), 1));
  };

  const bookings = calendar.data?.bookings ?? [];
  const blackouts = calendar.data?.blackouts ?? [];
  const visibleBookings = bookings.filter((booking) => {
    if (!applied) return true;
    return overlaps(booking, applied.from) || overlaps(booking, applied.to) || (new Date(`${booking.startDate.slice(0, 10)}T12:00:00`) <= new Date(`${applied.to}T12:00:00`) && new Date(`${booking.endDate.slice(0, 10)}T12:00:00`) >= new Date(`${applied.from}T12:00:00`));
  });

  const days = Array.from({ length: view === "month" ? 42 : 7 }).map((_, index) => addDays(gridStart, index));

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(cursor);
  const weekLabel = `${dateShort(gridStart)} – ${dateShort(gridEnd)}`;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Rentals</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Calendar</span>
          </nav>
          <p className="eyebrow page-eyebrow">Availability</p>
          <h1 className="page-title">The rental timeline.</h1>
          <p className="page-description">
            Bookings, blackouts and today in one grid. Arrow keys move the window; every chip opens the booking.
          </p>
        </div>
        <div className="page-actions">
          <Segmented value={view} onChange={(value) => setView(value as "month" | "week")} options={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }]} />
        </div>
      </div>

      <Card className="calendar-shell">
        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <IconButton label={`Previous ${view}`} onClick={() => navigate(-1)}><ChevronLeft size={16} /></IconButton>
            <IconButton label={`Next ${view}`} onClick={() => navigate(1)}><ChevronRight size={16} /></IconButton>
            <h2 aria-live="polite">{view === "month" ? monthLabel : weekLabel}</h2>
            <Button size="sm" variant="outline" onClick={goToday}>Today</Button>
          </div>
          <div className="calendar-tools">
            <select className="select input-sm" value={listingId} onChange={(event) => setListingId(event.target.value)} aria-label="Filter by listing">
              <option value="">All listings</option>
              {(calendar.data?.listings ?? []).map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.city}</option>)}
            </select>
            <div className="jump-control">
              <input className="input input-sm" type="date" value={jump} onChange={(event) => setJump(event.target.value)} aria-label="Jump to date" />
              <Button size="sm" onClick={jumpTo}>Jump</Button>
            </div>
            <Button size="sm" variant={applied ? "soft" : "ghost"} onClick={() => setPanelOpen((value) => !value)}>
              <Filter size={13} /> {applied ? `${dateShort(applied.from)} – ${dateShort(applied.to)}` : "Date filter"}
            </Button>
          </div>
        </div>

        {panelOpen ? (
          <div className="calendar-filter-panel">
            <label className="field">
              <span className="field-label">From</span>
              <input className="input input-sm" type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">To</span>
              <input className="input input-sm" type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} />
            </label>
            <Button size="sm" variant="primary" disabled={!filterFrom || !filterTo} onClick={() => setApplied({ from: filterFrom, to: filterTo })}>Apply range</Button>
            {applied ? <Button size="sm" variant="ghost" onClick={() => { setApplied(null); setFilterFrom(""); setFilterTo(""); }}><X size={12} /> Clear</Button> : null}
            <span className="hint">Filters the chips in the current window.</span>
          </div>
        ) : null}

        {calendar.error ? <ErrorState title="Calendar is offline" body={calendar.error} onRetry={calendar.reload} /> : (
          <div
            className={`calendar-grid calendar-${view}`}
            role="grid"
            aria-label={view === "month" ? monthLabel : weekLabel}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") { event.preventDefault(); navigate(-1); }
              if (event.key === "ArrowRight") { event.preventDefault(); navigate(1); }
              if (event.key === "Home") { event.preventDefault(); goToday(); }
            }}
          >
            {WEEKDAYS.map((day) => <div key={day} className="calendar-weekday" role="columnheader">{day}</div>)}
            {days.map((day) => {
              const key = isoDate(day);
              const dayBookings = visibleBookings.filter((booking) => overlaps(booking, key));
              const dayBlackouts = blackouts.filter((blackout) => new Date(key) >= new Date(blackout.from.slice(0, 10)) && new Date(key) <= new Date(blackout.to.slice(0, 10)));
              const outside = view === "month" && day.getMonth() !== cursor.getMonth();
              return (
                <div key={key} className={`calendar-day ${outside ? "is-outside" : ""} ${sameDay(day, today) ? "is-today" : ""} ${dayBlackouts.length ? "is-blackout" : ""}`} role="gridcell" aria-label={dateMedium(day)}>
                  <div className="calendar-day-head">
                    <span className="calendar-day-num">{day.getDate()}</span>
                    {sameDay(day, today) ? <span className="today-marker">Today</span> : null}
                    {dayBookings.length > 2 && view === "month" ? <span className="calendar-more">+{dayBookings.length - 2}</span> : null}
                  </div>
                  <div className="calendar-day-body">
                    {dayBlackouts.map((blackout) =>
                      blackout.from.slice(0, 10) === key ? (
                        <span key={blackout.id} className="cal-blackout" title={`${blackout.reason} · ${dateShort(blackout.from)}–${dateShort(blackout.to)}`}>
                          Blackout
                        </span>
                      ) : null,
                    )}
                    {dayBookings.slice(0, view === "week" ? 6 : 2).map((booking) => (
                      <button key={`${booking.id}-${key}`} type="button" className={`cal-chip ${STATE_CLASS[booking.state] ?? ""}`} onClick={() => setSelected(booking)} title={`${booking.number} · ${booking.renterName} · ${foldWords(booking.state)}`} aria-label={`${booking.number}, ${booking.renterName}, ${foldWords(booking.state)}`}>
                        <span>{booking.number}</span>
                        <em>{booking.renterName.split(" ")[0]}</em>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="calendar-legend">
          <span className="legend-title"><CalendarDays size={13} /> State</span>
          {["requested", "approved", "deposit_authorized", "in_use", "return_due", "overdue", "disputed", "completed"].map((state) => (
            <span key={state} className="legend-item"><i className={STATE_CLASS[state]} /> {foldWords(state)}</span>
          ))}
          <span className="legend-item"><i className="cal-blackout" /> Blackout</span>
        </footer>
      </Card>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        width={480}
        eyebrow={selected ? `${selected.number} · ${foldWords(selected.state)}` : "Booking"}
        title={selected?.listingTitle ?? "Booking"}
        subtitle={selected ? `${selected.renterName} · ${dateShort(selected.startDate)} → ${dateShort(selected.endDate)}` : undefined}
        footer={selected ? <Button variant="primary" onClick={() => navigateTo(`/bookings?booking=${selected.id}`)}>Open in bookings <ArrowRight size={13} /></Button> : null}
      >
        {selected ? (
          <div className="stack-18">
            <div className="workspace-stats">
              <div><span>Total</span><strong>{money(selected.total)}</strong></div>
              <div><span>Deposit</span><strong>{money(selected.deposit)}</strong></div>
              <div><span>Days</span><strong>{selected.days}</strong></div>
              <div><span>Owner</span><strong className="small-strong">{selected.ownerName}</strong></div>
            </div>
            <section className="panel-block">
              <div className="panel-block-head"><div><h3>Items</h3><p>What ships for this booking.</p></div></div>
              {selected.items.map((item) => (
                <div key={item.id} className="cal-item">
                  <img src={item.image} alt="" />
                  <div><strong>{item.name}</strong><span>{money(item.dailyRate)}/day · {item.days} days</span></div>
                  <Badge tone="neutral">{money(item.dailyRate * item.days)}</Badge>
                </div>
              ))}
            </section>
            <section className="panel-block">
              <div className="panel-block-head"><div><h3>Timeline</h3></div></div>
              <ol className="booking-timeline">
                {selected.timeline.slice(-4).map((event, index) => (
                  <li key={`${event.at}-${index}`}><span className="timeline-dot" /><div><strong>{event.label}</strong><em>{dateShort(event.at)} · {event.actor}</em></div></li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
