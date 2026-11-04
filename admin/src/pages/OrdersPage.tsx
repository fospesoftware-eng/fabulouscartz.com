import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CreditCard,
  FilterX,
  Mail,
  MapPin,
  Phone,
  Search,
  StickyNote,
  Truck,
  User,
} from "lucide-react";
import type { Order, OrderStatus, Paginated, PaymentStatus } from "../../shared/types";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "../../shared/types";
import { ConfirmDialog, Drawer } from "../components/overlay";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Pagination,
  SearchInput,
  TableSkeleton,
} from "../components/ui";
import { useUI } from "../context/UIContext";
import { resources } from "../lib/normalize";
import { useDebounced, useResource } from "../lib/hooks";
import { dateShort, dateTime, foldWords, money, STATUS_TONE } from "../lib/utils";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "processing",
  processing: "packed",
  packed: "shipped",
  shipped: "delivered",
};

const CHANNELS: Record<string, string> = {
  web: "Website",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  store: "Pop-up store",
};

function tone(status: string): "positive" | "warning" | "info" | "gold" | "danger" | "neutral" {
  return (STATUS_TONE[status] as "positive") ?? "neutral";
}

export function OrdersPage() {
  const { notify } = useUI();
  const [searchParams] = useSearchParams();
  const initialOrder = searchParams.get("order");
  const [detailId, setDetailId] = useState<string | null>(initialOrder);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 280);
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [stateFilter, setStateFilter] = useState(searchParams.get("state") ?? "");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<OrderStatus | "">("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "15");
    params.set("sort", sort);
    if (debouncedQ) params.set("q", debouncedQ);
    if (status) params.set("status", status);
    if (stateFilter) params.set("state", stateFilter);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [page, sort, debouncedQ, status, stateFilter, paymentStatus, from, to]);

  const list = useResource<Paginated<Order>>(
    () =>
      resources.orders({
        page,
        pageSize: 15,
        sort,
        q: debouncedQ,
        status,
        state: stateFilter,
        paymentStatus,
        from,
        to,
      }),
    [page, sort, debouncedQ, status, stateFilter, paymentStatus, from, to],
  );
  const detail = useResource<Order>(() => resources.order(detailId ?? ""), [detailId], { enabled: Boolean(detailId) });

  useEffect(() => {
    setSelected([]);
  }, [query]);

  const resetFilters = () => {
    setQ("");
    setStatus("");
    setStateFilter("");
    setPaymentStatus("");
    setFrom("");
    setTo("");
    setSort("newest");
    setPage(1);
  };

  const hasFilters = Boolean(q || status || stateFilter || paymentStatus || from || to || sort !== "newest");

  const updateStatus = async (order: Order, nextStatus: OrderStatus) => {
    try {
      const updated = await resources.updateOrderStatus(order.id, nextStatus);
      detail.setData(updated);
      list.setData((current) => (current ? { ...current, data: current.data.map((row) => (row.id === updated.id ? updated : row)) } : current));
      notify({ kind: "success", title: `${order.number} moved to ${foldWords(updated.status)}`, description: "The timeline and audit log were updated." });
    } catch (cause) {
      notify({ kind: "error", title: "Status not changed", description: cause instanceof Error ? cause.message : "The API rejected the update." });
    }
  };

  const updatePayment = async (_order: Order, _nextPayment: PaymentStatus) => {
    notify({ kind: "info", title: "Not available yet", description: "Payment status is owned by the payments service and cannot be edited here." });
  };

  const addNote = async (_body: string) => {
    notify({ kind: "info", title: "Not available yet", description: "Order notes cannot be written through the API." });
    return false;
  };

  const applyBulk = async () => {
    if (!bulkStatus || selected.length === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(selected.map((id) => resources.updateOrderStatus(id, bulkStatus)));
      notify({ kind: "success", title: `${selected.length} orders updated`, description: `All selected orders are now ${foldWords(bulkStatus)}.` });
      setSelected([]);
      setBulkStatus("");
      list.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Bulk update failed", description: cause instanceof Error ? cause.message : "The API rejected the batch." });
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleAll = () => {
    if (!list.data) return;
    const ids = list.data.data.map((order) => order.id);
    setSelected(selected.length === ids.length ? [] : ids);
  };

  const data = list.data;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Commerce</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Orders</span>
          </nav>
          <p className="eyebrow page-eyebrow">Order book</p>
          <h1 className="page-title">Every order, one honest view.</h1>
          <p className="page-description">
            Search the book, move fulfilment forward and keep the customer thread intact. Changes write to the audit trail immediately.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/analytics" className="inline-link">
            Order analytics <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search order, customer, city, product…" className="grow" />
        <select className="select input-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {foldWords(value)} {data?.facets?.[value] ? `· ${data.facets[value]}` : ""}
            </option>
          ))}
        </select>
        <select className="select input-sm" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1); }} aria-label="Filter by payment">
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {foldWords(value)}
            </option>
          ))}
        </select>
        <div className="date-range">
          <span>From</span>
          <input className="input input-sm" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} aria-label="From date" />
          <span>To</span>
          <input className="input input-sm" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} aria-label="To date" />
        </div>
        <select className="select input-sm" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Sort orders">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="total_desc">Highest value</option>
          <option value="total_asc">Lowest value</option>
        </select>
        {hasFilters ? (
          <IconButton label="Clear filters" onClick={resetFilters}>
            <FilterX size={15} />
          </IconButton>
        ) : null}
      </div>

      {stateFilter ? (
        <div className="filter-chip-row">
          <span className="filter-chip">
            <MapPin size={12} /> State <strong>{stateFilter}</strong>
            <button type="button" onClick={() => { setStateFilter(""); setPage(1); }} aria-label="Clear state filter">
              ×
            </button>
          </span>
        </div>
      ) : null}

      <Card className="table-card">
        {selected.length ? (
          <div className="bulk-bar">
            <strong>{selected.length} selected</strong>
            <span className="hint">Move every selected order to:</span>
            <select className="select input-sm bulk-select" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as OrderStatus | "")}>
              <option value="">Choose status…</option>
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {foldWords(value)}
                </option>
              ))}
            </select>
            <Button variant="primary" size="sm" loading={bulkLoading} disabled={!bulkStatus} onClick={() => void applyBulk()}>
              Apply to {selected.length}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}

        {list.error ? (
          <ErrorState title="Orders could not load" body={list.error} onRetry={list.reload} />
        ) : list.loading && !data ? (
          <TableSkeleton rows={8} cols={7} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title="No orders match this cut"
            body="Try widening the date range or clearing the status filter."
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : data ? (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 26 }}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        aria-label="Select all orders on this page"
                        checked={selected.length === data.data.length && data.data.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Fulfilment</th>
                    <th>Placed</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((order) => {
                    const isSelected = selected.includes(order.id);
                    return (
                      <tr
                        key={order.id}
                        className={isSelected ? "is-selected" : undefined}
                        onClick={() => setDetailId(order.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="checkbox"
                            aria-label={`Select ${order.number}`}
                            checked={isSelected}
                            onChange={() =>
                              setSelected((current) => (current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id]))
                            }
                          />
                        </td>
                        <td>
                          <span className="order-number">{order.number}</span>
                          <span className="cell-sub">{CHANNELS[order.channel] ?? order.channel}</span>
                        </td>
                        <td>
                          <span className="cell-title">{order.customerName}</span>
                          <span className="cell-sub">{order.customerEmail}</span>
                        </td>
                        <td>
                          <span className="cell-sub">
                            {order.items.reduce((total, line) => total + line.qty, 0)} units · {order.items.length} line{order.items.length === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td>
                          <span className="cell-num">{money(order.total)}</span>
                          {order.discount > 0 ? <span className="cell-sub">−{money(order.discount)} promo</span> : null}
                        </td>
                        <td>
                          <Badge tone={tone(order.paymentStatus)} dot>
                            {foldWords(order.paymentStatus)}
                          </Badge>
                        </td>
                        <td>
                          <Badge tone={tone(order.status)} dot>
                            {foldWords(order.status)}
                          </Badge>
                        </td>
                        <td>
                          <span className="cell-sub">{dateShort(order.createdAt)}</span>
                        </td>
                        <td>
                          <div className="row-action">
                            <ArrowRight size={14} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-note">
              <span>
                Showing page {data.page} of {data.totalPages} · {data.total} orders in the book
              </span>
              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
            </div>
          </>
        ) : null}
      </Card>

      <OrderDrawer
        open={Boolean(detailId)}
        order={detail.data}
        loading={detail.loading}
        error={detail.error}
        onClose={() => setDetailId(null)}
        onRetry={detail.reload}
        onStatus={updateStatus}
        onPayment={updatePayment}
        onNote={addNote}
      />
    </div>
  );
}

function OrderDrawer({
  open,
  order,
  loading,
  error,
  onClose,
  onRetry,
  onStatus,
  onPayment,
  onNote,
}: {
  open: boolean;
  order: Order | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
  onStatus: (order: Order, status: OrderStatus) => Promise<void>;
  onPayment: (order: Order, status: PaymentStatus) => Promise<void>;
  onNote: (body: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [statusDraft, setStatusDraft] = useState<OrderStatus | "">("");
  const [paymentDraft, setPaymentDraft] = useState<PaymentStatus | "">("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatusDraft(order?.status ?? "");
    setPaymentDraft(order?.paymentStatus ?? "");
    setNote("");
  }, [order?.id, order?.status, order?.paymentStatus]);

  if (!open) return null;

  const next = order ? NEXT_STATUS[order.status] : undefined;
  const units = order?.items.reduce((total, line) => total + line.qty, 0) ?? 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      eyebrow={order ? `${CHANNELS[order.channel] ?? "Web"} · ${dateTime(order.createdAt)}` : "Order detail"}
      title={order ? order.number : "Loading order…"}
      subtitle={order ? `${order.customerName} · ${order.items.length} lines · ${units} units` : undefined}
      actions={
        order ? (
          <>
            <Badge tone={tone(order.paymentStatus)} dot>
              {foldWords(order.paymentStatus)}
            </Badge>
            <Badge tone={tone(order.status)} dot>
              {foldWords(order.status)}
            </Badge>
          </>
        ) : null
      }
      footer={
        order ? (
          <div className="drawer-actions">
            {next ? (
              <Button
                variant="primary"
                icon={<Truck size={14} />}
                onClick={() => {
                  setBusy(true);
                  void onStatus(order, next).finally(() => setBusy(false));
                }}
                loading={busy}
              >
                Mark {foldWords(next)}
              </Button>
            ) : null}
            {order.status !== "cancelled" && order.status !== "returned" ? (
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                Cancel order
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose} className="grow">
              Close
            </Button>
          </div>
        ) : null
      }
    >
      {error ? (
        <ErrorState title="Order detail unavailable" body={error} onRetry={onRetry} />
      ) : loading || !order ? (
        <div className="stack-18">
          <span className="sk sk-line" style={{ width: "100%", height: 60 }} />
          <span className="sk sk-line" style={{ width: "100%", height: 120 }} />
          <span className="sk sk-line" style={{ width: "100%", height: 90 }} />
        </div>
      ) : (
        <>
          <section className="drawer-section">
            <div className="detail-grid">
              <div className="detail-card">
                <strong>
                  <User size={12} style={{ marginRight: 4 }} /> {order.customerName}
                </strong>
                <span>
                  <Mail size={10} style={{ marginRight: 4 }} /> {order.customerEmail}
                </span>
                <span>
                  <Phone size={10} style={{ marginRight: 4 }} /> {order.customerPhone}
                </span>
              </div>
              <div className="detail-card">
                <strong>
                  <MapPin size={12} style={{ marginRight: 4 }} /> Ship to
                </strong>
                <span>
                  {order.shippingAddress.line1}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pin}
                  <br />
                  {order.shippingAddress.country}
                </span>
              </div>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title">
              <span>Line items</span>
              <span className="mono">{units} units</span>
            </div>
            <div className="line-items">
              {order.items.map((line) => (
                <div key={line.id} className="line-item">
                  <img className="line-thumb" src={line.image} alt={line.name} loading="lazy" />
                  <div className="line-copy">
                    <strong>{line.name}</strong>
                    <span>
                      {line.sku} · {line.mode === "rent" ? `Rental ${line.rentalDays} days` : "Purchase"}
                    </span>
                  </div>
                  <div className="line-price">
                    {money(line.unitPrice * line.qty)}
                    <em>
                      {line.qty} × {money(line.unitPrice)}
                    </em>
                  </div>
                </div>
              ))}
            </div>
            <div className="totals-list">
              <div className="total-row">
                <span>Subtotal</span>
                <span>{money(order.subtotal)}</span>
              </div>
              {order.discount > 0 ? (
                <div className="total-row">
                  <span>Discount {order.couponCode ? `· ${order.couponCode}` : ""}</span>
                  <span>−{money(order.discount)}</span>
                </div>
              ) : null}
              <div className="total-row">
                <span>Shipping</span>
                <span>{order.shipping === 0 ? "Complimentary" : money(order.shipping)}</span>
              </div>
              <div className="total-row">
                <span>Tax</span>
                <span>{money(order.tax)}</span>
              </div>
              <div className="total-row total-grand">
                <span>Total paid</span>
                <span>{money(order.total)}</span>
              </div>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title">
              <span>
                <CreditCard size={11} style={{ marginRight: 4 }} /> Payment & fulfilment
              </span>
              <span className="mono">{foldWords(order.paymentMethod)}</span>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Fulfilment state</span>
                <div className="row" style={{ gap: 6 }}>
                  <select className="select" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as OrderStatus)}>
                    {ORDER_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {foldWords(value)}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={statusDraft === order.status || !statusDraft}
                    onClick={() => {
                      setBusy(true);
                      void onStatus(order, statusDraft as OrderStatus).finally(() => setBusy(false));
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </label>
              <label className="field">
                <span className="field-label">Payment state</span>
                <div className="row" style={{ gap: 6 }}>
                  <select className="select" value={paymentDraft} onChange={(event) => setPaymentDraft(event.target.value as PaymentStatus)}>
                    {PAYMENT_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {foldWords(value)}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={paymentDraft === order.paymentStatus || !paymentDraft}
                    onClick={() => {
                      setBusy(true);
                      void onPayment(order, paymentDraft as PaymentStatus).finally(() => setBusy(false));
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </label>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title">
              <span>
                <StickyNote size={11} style={{ marginRight: 4 }} /> Operator notes
              </span>
              <span className="mono">{order.notes.length} saved</span>
            </div>
            <form
              className="note-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!note.trim()) return;
                setSavingNote(true);
                void onNote(note.trim()).then((saved) => {
                  setSavingNote(false);
                  if (saved) setNote("");
                });
              }}
            >
              <input className="input input-sm" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for the next operator…" aria-label="New order note" />
              <Button variant="outline" size="sm" type="submit" loading={savingNote} disabled={!note.trim()}>
                Add
              </Button>
            </form>
            {order.notes.length ? (
              <div className="stack-18" style={{ marginTop: 10, gap: 8 }}>
                {order.notes.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="detail-card">
                    <strong>{entry.author}</strong>
                    <span>{entry.body}</span>
                    <span className="mono">{dateTime(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint" style={{ marginTop: 8 }}>
                No notes yet. The note thread is shared with every operator on this order.
              </p>
            )}
          </section>

          <section className="drawer-section" style={{ marginBottom: 0 }}>
            <div className="drawer-section-title">
              <span>Timeline</span>
              <span className="mono">{order.timeline.length} events</span>
            </div>
            <div className="timeline">
              {order.timeline
                .slice()
                .reverse()
                .map((event) => (
                  <div key={event.id} className="timeline-item">
                    <span className="timeline-dot" />
                    <div className="timeline-copy">
                      <strong>{event.label}</strong>
                      {event.detail ? <span>{event.detail}</span> : null}
                      <em>
                        {event.by} · {dateTime(event.at)}
                      </em>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}

      {order ? (
        <ConfirmDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title={`Cancel ${order.number}?`}
          body="The order moves to cancelled. If it was paid, the payment is automatically marked refunded and stock is not restocked automatically."
          confirmLabel="Cancel order"
          tone="danger"
          loading={busy}
          onConfirm={() => {
            setBusy(true);
            void onStatus(order, "cancelled").then(() => {
              setBusy(false);
              setCancelOpen(false);
            });
          }}
        />
      ) : null}
    </Drawer>
  );
}
