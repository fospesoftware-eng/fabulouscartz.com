import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Crown, Mail, MapPin, Phone, Search, Tag } from "lucide-react";
import type { Customer, Order, Paginated } from "../../shared/types";
import { Drawer } from "../components/overlay";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Pagination,
  SearchInput,
  TableSkeleton,
} from "../components/ui";
import { useUI } from "../context/UIContext";
import { api } from "../lib/api";
import { useDebounced, useResource } from "../lib/hooks";
import { dateShort, foldWords, money, relative, STATUS_TONE } from "../lib/utils";

const CUSTOMER_SEGMENTS: Customer["segment"][] = ["VIP", "Repeat", "New", "At risk", "Wholesale"];

interface CustomerDetail {
  customer: Customer;
  orders: Order[];
}

function segmentTone(segment: string): "gold" | "positive" | "info" | "warning" | "neutral" {
  if (segment === "VIP") return "gold";
  if (segment === "New") return "info";
  if (segment === "At risk") return "warning";
  if (segment === "Repeat" || segment === "Wholesale") return "positive";
  return "neutral";
}

export function CustomersPage() {
  const navigate = useNavigate();
  const { notify } = useUI();
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 280);
  const [segment, setSegment] = useState("");
  const [sort, setSort] = useState("ltv");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("pageSize", "12");
  query.set("sort", sort);
  if (debouncedQ) query.set("q", debouncedQ);
  if (segment) query.set("segment", segment);

  const list = useResource<Paginated<Customer>>(() => api.get<Paginated<Customer>>(`/customers?${query.toString()}`), [page, sort, debouncedQ, segment]);
  const data = list.data;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Relationships</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Customers</span>
          </nav>
          <p className="eyebrow page-eyebrow">Customer book</p>
          <h1 className="page-title">People, not rows.</h1>
          <p className="page-description">
            Lifetime value, buying rhythm and the little notes that make a repeat visit feel personal.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/analytics" className="inline-link">
            Cohort analytics <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search name, email, city…" className="grow" />
        <select className="select input-sm" value={segment} onChange={(event) => { setSegment(event.target.value); setPage(1); }} aria-label="Filter segment">
          <option value="">All segments</option>
          {CUSTOMER_SEGMENTS.map((value) => (
            <option key={value} value={value}>
              {value} {data?.facets?.[value] ? `· ${data.facets[value]}` : ""}
            </option>
          ))}
        </select>
        <select className="select input-sm" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Sort customers">
          <option value="ltv">Highest lifetime value</option>
          <option value="recent">Most recent order</option>
          <option value="orders">Most orders</option>
        </select>
      </div>

      <Card className="table-card">
        {list.error ? (
          <ErrorState title="Customer book unavailable" body={list.error} onRetry={list.reload} />
        ) : list.loading && !data ? (
          <TableSkeleton rows={8} cols={6} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title="No customers match"
            body="Try clearing the segment filter or widening the search."
            action={<Button variant="outline" size="sm" onClick={() => { setQ(""); setSegment(""); }}>Clear filters</Button>}
          />
        ) : data ? (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>City</th>
                    <th>Segment</th>
                    <th>Orders</th>
                    <th>Lifetime value</th>
                    <th>Last order</th>
                    <th>Joined</th>
                    <th aria-label="Open" />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((customer) => (
                    <tr key={customer.id} onClick={() => setDetailId(customer.id)} style={{ cursor: "pointer" }}>
                      <td>
                        <div className="customer-cell">
                          <Avatar name={customer.name} size={28} />
                          <div>
                            <strong>{customer.name}</strong>
                            <span>{customer.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="cell-title" style={{ fontSize: 11 }}>{customer.city}</span>
                        <span className="cell-sub">{customer.phone}</span>
                      </td>
                      <td>
                        <Badge tone={segmentTone(customer.segment)} dot>
                          {customer.segment}
                        </Badge>
                      </td>
                      <td>
                        <span className="cell-num">{customer.ordersCount}</span>
                      </td>
                      <td>
                        <span className="ltv-cell">{money(customer.lifetimeValue)}</span>
                      </td>
                      <td>
                        <span className="cell-sub">{customer.lastOrderAt ? relative(customer.lastOrderAt) : "Never"}</span>
                      </td>
                      <td>
                        <span className="cell-sub">{dateShort(customer.createdAt)}</span>
                      </td>
                      <td>
                        <div className="row-action">
                          <ArrowRight size={14} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-note">
              <span>
                {data.total} customers · page {data.page} of {data.totalPages}
              </span>
              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
            </div>
          </>
        ) : null}
      </Card>

      <CustomerDrawer
        id={detailId}
        onClose={() => setDetailId(null)}
        onNavigateOrder={(orderId) => navigate(`/orders?order=${orderId}`)}
        onSaved={() => list.reload()}
        notify={notify}
      />
    </div>
  );
}

function CustomerDrawer({
  id,
  onClose,
  onNavigateOrder,
  onSaved,
  notify,
}: {
  id: string | null;
  onClose: () => void;
  onNavigateOrder: (orderId: string) => void;
  onSaved: () => void;
  notify: ReturnType<typeof useUI>["notify"];
}) {
  const detail = useResource<CustomerDetail>(() => api.get<CustomerDetail>(`/customers/${id}`), [id], { enabled: Boolean(id) });
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [segment, setSegment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (detail.data) {
      setNotes(detail.data.customer.notes);
      setSegment(detail.data.customer.segment);
    }
  }, [detail.data]);

  if (!id) return null;
  const customer = detail.data?.customer;

  const save = async (patch: Partial<Customer>) => {
    if (!customer) return;
    setBusy(true);
    try {
      const updated = await api.patch<Customer>(`/customers/${customer.id}`, patch);
      detail.setData((current) => (current ? { ...current, customer: updated } : current));
      notify({ kind: "success", title: "Customer updated", description: `${updated.name} · ${updated.segment}` });
      onSaved();
    } catch (cause) {
      notify({ kind: "error", title: "Could not save customer", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const addTag = () => {
    const value = tagInput.trim();
    if (!value || !customer || customer.tags.includes(value)) return;
    void save({ tags: [...customer.tags, value] });
    setTagInput("");
  };

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      width={560}
      eyebrow="Customer profile"
      title={customer?.name ?? "Loading customer…"}
      subtitle={customer ? `${customer.city} · joined ${dateShort(customer.createdAt)}` : undefined}
      actions={customer ? <Badge tone={segmentTone(customer.segment)} dot>{customer.segment}</Badge> : null}
      footer={
        customer ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void save({ notes })}>
              Save profile
            </Button>
          </>
        ) : null
      }
    >
      {detail.error ? (
        <ErrorState title="Profile unavailable" body={detail.error} onRetry={detail.reload} />
      ) : detail.loading || !customer ? (
        <div className="stack-18">
          <span className="sk sk-line" style={{ width: "100%", height: 64 }} />
          <span className="sk sk-line" style={{ width: "100%", height: 80 }} />
          <span className="sk sk-line" style={{ width: "100%", height: 120 }} />
        </div>
      ) : (
        <>
          <div className="profile-head">
            <Avatar name={customer.name} size={52} />
            <div className="profile-head-copy">
              <h3>{customer.name}</h3>
              <span>
                <Mail size={10} style={{ marginRight: 4 }} /> {customer.email}
              </span>
              <span>
                <Phone size={10} style={{ marginRight: 4 }} /> {customer.phone} · <MapPin size={10} style={{ marginRight: 2 }} /> {customer.city}
              </span>
            </div>
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <strong>{money(customer.lifetimeValue, { compact: true })}</strong>
              <span>Lifetime value</span>
            </div>
            <div className="profile-stat">
              <strong>{customer.ordersCount}</strong>
              <span>Orders</span>
            </div>
            <div className="profile-stat">
              <strong>{customer.ordersCount ? money(customer.lifetimeValue / customer.ordersCount, { compact: true }) : "—"}</strong>
              <span>Avg order</span>
            </div>
          </div>

          <section className="drawer-section">
            <div className="drawer-section-title">
              <span>Segment</span>
              <Crown size={12} style={{ color: "var(--gold)" }} />
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <select className="select" value={segment} onChange={(event) => setSegment(event.target.value as Customer["segment"])} style={{ maxWidth: 190 }}>
                {CUSTOMER_SEGMENTS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" disabled={busy || segment === customer.segment} onClick={() => void save({ segment: segment as Customer["segment"] })}>
                Move segment
              </Button>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title">
              <span>
                <Tag size={11} style={{ marginRight: 4 }} /> Tags
              </span>
              <span className="mono">{customer.tags.length}</span>
            </div>
            <div className="chip-list">
              {customer.tags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                  <button type="button" aria-label={`Remove ${tag}`} onClick={() => void save({ tags: customer.tags.filter((entry) => entry !== tag) })}>
                    ×
                  </button>
                </span>
              ))}
              {customer.tags.length === 0 ? <span className="hint">No tags yet.</span> : null}
            </div>
            <div className="tag-input" style={{ marginTop: 9 }}>
              <input
                className="input input-sm"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add a tag…"
                aria-label="New customer tag"
              />
              <Button variant="outline" size="sm" disabled={!tagInput.trim() || busy} onClick={addTag}>
                Add
              </Button>
            </div>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-title">
              <span>Private notes</span>
              <span className="mono">Visible to operators</span>
            </div>
            <Field label="Notes">
              <textarea className="textarea" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Sizing preferences, gifting occasions, return history…" />
            </Field>
            <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
              <Button variant="outline" size="sm" loading={busy} onClick={() => void save({ notes })}>
                Save notes
              </Button>
            </div>
          </section>

          <section className="drawer-section" style={{ marginBottom: 0 }}>
            <div className="drawer-section-title">
              <span>Recent orders</span>
              <span className="mono">{detail.data?.orders.length ?? 0}</span>
            </div>
            {detail.data?.orders.length ? (
              <div className="profile-orders">
                {detail.data.orders.slice(0, 6).map((order) => (
                  <button key={order.id} type="button" className="profile-order" onClick={() => onNavigateOrder(order.id)}>
                    <span className="grow">
                      <strong>{order.number}</strong>
                      <span>
                        {dateShort(order.createdAt)} · {order.items.length} lines
                      </span>
                    </span>
                    <Badge tone={(STATUS_TONE[order.status] as "positive") ?? "neutral"} dot>
                      {foldWords(order.status)}
                    </Badge>
                    <span className="cell-num">{money(order.total)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="hint">No orders recorded for this customer yet.</p>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}
