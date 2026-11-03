import { useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenText,
  Boxes,
  CircleDollarSign,
  Plus,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Tag,
  UserPlus,
  Wallet,
} from "lucide-react";
import type { DashboardData, Kpi } from "../../shared/types";
import { AreaChart, CategoryBars, DonutChart, Gauge, Sparkline } from "../components/charts";
import { UsOrderMap } from "../components/UsOrderMap";
import { AttentionFeed, RentalPulse } from "../components/RentalPulse";
import { Badge, Button, Card, ErrorState, IconButton, Segmented } from "../components/ui";
import { useUI } from "../context/UIContext";
import { api } from "../lib/api";
import { useResource } from "../lib/hooks";
import { foldWords, money, relative, STATUS_TONE } from "../lib/utils";

const KPI_ICONS: Record<string, typeof Wallet> = {
  revenue: Wallet,
  orders: ShoppingBag,
  aov: CircleDollarSign,
  customers: UserPlus,
};

const KPI_ACCENTS: Record<string, { accent: string; tone: "emerald" | "gold" | "rose" }> = {
  revenue: { accent: "emerald", tone: "emerald" },
  orders: { accent: "gold", tone: "gold" },
  aov: { accent: "rose", tone: "rose" },
  customers: { accent: "slate", tone: "emerald" },
};

function KpiCard({ kpi, lead }: { kpi: Kpi; lead: boolean }) {
  const Icon = KPI_ICONS[kpi.key] ?? Sparkles;
  const accent = KPI_ACCENTS[kpi.key] ?? { accent: "emerald", tone: "emerald" as const };

  const tilt = (event: React.PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--kx", (x * 2).toFixed(3));
    event.currentTarget.style.setProperty("--ky", (y * 2).toFixed(3));
  };

  const flatten = (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--kx", "0");
    event.currentTarget.style.setProperty("--ky", "0");
  };

  return (
    <article
      className={`kpi-card ${lead ? "kpi-lead" : ""}`}
      data-accent={accent.accent}
      onPointerMove={tilt}
      onPointerLeave={flatten}
    >
      <div className="kpi-top">
        <span className="kpi-label">{kpi.label}</span>
        <span
          className="kpi-ring"
          style={{ "--pct": `${Math.min(100, Math.abs(kpi.delta))}%` } as CSSProperties}
          role="img"
          aria-label={`${kpi.delta >= 0 ? "Up" : "Down"} ${Math.abs(kpi.delta).toFixed(1)} percent versus the previous period`}
        >
          <span className="kpi-ring-core">{Math.abs(kpi.delta).toFixed(1)}%</span>
        </span>
      </div>
      <p className="kpi-value">{kpi.display}</p>
      <div className="kpi-meta">
        <span className="kpi-icon">
          <Icon size={13} />
        </span>
        <span className="truncate">{kpi.meta}</span>
      </div>
      <div className="kpi-spark">
        <Sparkline values={kpi.sparkline} tone={lead ? "gold" : accent.tone} height={36} />
      </div>
    </article>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { notify } = useUI();
  const deckRef = useRef<HTMLElement>(null);
  const [range, setRange] = useState(30);

  const trackPointer = (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    element.style.setProperty("--px", x.toFixed(3));
    element.style.setProperty("--py", y.toFixed(3));
  };

  const resetPointer = (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--px", "0");
    event.currentTarget.style.setProperty("--py", "0");
  };
  const { data, error, loading, reload } = useResource<DashboardData>(
    () => api.get<DashboardData>(`/dashboard?range=${range}`),
    [range],
  );

  const refresh = () => {
    reload();
    notify({ kind: "info", title: "Refreshing the deck", description: "Pulling the latest order and stock signals." });
  };

  if (error) {
    return <ErrorState title="The command deck is offline" body={error} onRetry={reload} />;
  }

  if (loading || !data) {
    return (
      <div className="stack-18">
        <div className="sk sk-block" style={{ height: 168, borderRadius: 24 }} />
        <div className="kpi-grid" style={{ marginTop: -42 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="kpi-card">
              <span className="sk sk-line" style={{ width: "55%", height: 10 }} />
              <span className="sk sk-line" style={{ width: "72%", height: 26, marginTop: 12 }} />
              <span className="sk sk-line" style={{ width: "90%", height: 12, marginTop: 12 }} />
            </div>
          ))}
        </div>
        <div className="dash-grid">
          <div className="sk sk-block" style={{ height: 320, borderRadius: 18 }} />
          <div className="sk sk-block" style={{ height: 320, borderRadius: 18 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="stack-18">
      <section
        className="command-deck"
        ref={deckRef}
        onPointerMove={trackPointer}
        onPointerLeave={resetPointer}
      >
        <div className="deck-layer deck-mesh" aria-hidden="true" />
        <div className="deck-layer deck-orb deck-orb-a" aria-hidden="true" />
        <div className="deck-layer deck-orb deck-orb-b" aria-hidden="true" />
        <div className="deck-grain" aria-hidden="true" />
        <div className="deck-head">
          <div>
            <p className="deck-eyebrow">
              <span className="live-dot" /> Operations live · {new Date().toLocaleDateString("en-US", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
            <h1 className="deck-title">
              {data.greeting.split(",")[0]}, <em>{data.greeting.split(",")[1]?.trim()}</em>
            </h1>
            <p className="deck-sub">
              {money(data.totals.revenue)} across {data.totals.orders} orders in the last {range} days. {data.fulfilment.pending} orders still need a
              dispatch decision.
            </p>
          </div>
          <div className="deck-actions">
            <Segmented
              size="sm"
              value={range}
              onChange={setRange}
              options={[
                { value: 7, label: "7 days" },
                { value: 30, label: "30 days" },
                { value: 90, label: "90 days" },
              ]}
            />
            <IconButton label="Refresh dashboard" onClick={refresh}>
              <RefreshCw size={15} />
            </IconButton>
          </div>
        </div>

        <div className="deck-quick">
          <button type="button" className="quick-action" onClick={() => navigate("/products/new")}>
            <Plus size={13} /> New product
          </button>
          <button type="button" className="quick-action" onClick={() => navigate("/inventory?status=low")}>
            <Boxes size={13} /> Adjust stock
          </button>
          <button type="button" className="quick-action" onClick={() => navigate("/discounts")}>
            <Tag size={13} /> Build a coupon
          </button>
          <button type="button" className="quick-action" onClick={() => navigate("/content")}>
            <BookOpenText size={13} /> Edit storefront copy
          </button>
        </div>

        <div className="deck-ticker" aria-hidden="true">
          <div className="deck-ticker-track">
            {[
              `Revenue ${money(data.totals.revenue, { compact: true })} across ${range} days`,
              `${data.fulfilment.pending} orders waiting to dispatch`,
              ...data.recentOrders.slice(0, 4).map((order) => `${order.number} · ${money(order.total)} · ${foldWords(order.status)}`),
              ...data.lowStock.slice(0, 2).map((row) => `Low stock · ${row.productName} (${row.stock} left)`),
            ]
              .concat(
                [
                  `Revenue ${money(data.totals.revenue, { compact: true })} across ${range} days`,
                  `${data.fulfilment.pending} orders waiting to dispatch`,
                  ...data.recentOrders.slice(0, 4).map((order) => `${order.number} · ${money(order.total)} · ${foldWords(order.status)}`),
                  ...data.lowStock.slice(0, 2).map((row) => `Low stock · ${row.productName} (${row.stock} left)`),
                ],
              )
              .map((label, index) => (
                <span className="deck-tick" key={`${index}-${label}`}>
                  <i />
                  {label}
                </span>
              ))}
          </div>
        </div>
      </section>

      <section className="kpi-grid" aria-label="Key performance indicators">
        {data.kpis.map((kpi, index) => (
          <KpiCard key={kpi.key} kpi={kpi} lead={index === 0} />
        ))}
      </section>

      <RentalPulse range={range} />

      <div className="dash-two">
        <Card>
          <div className="panel-head">
            <div>
              <h2>Category mix</h2>
              <p>Where the revenue is coming from</p>
            </div>
            <Link to="/analytics" className="inline-link">
              Deep dive <ArrowRight size={12} />
            </Link>
          </div>
          {data.categoryMix.length ? (
            <div className="cat-mix">
              <DonutChart
                data={data.categoryMix}
                size={158}
                centerValue={money(data.totals.revenue, { compact: true })}
                centerLabel="Revenue"
              />
              <CategoryBars data={data.categoryMix} />
            </div>
          ) : (
            <p className="hint">No category revenue in this window.</p>
          )}
        </Card>

        <Card>
          <div className="panel-head">
            <div>
              <h2>Bestsellers</h2>
              <p>Pieces earning their place</p>
            </div>
            <Link to="/products" className="inline-link">
              Catalogue <ArrowRight size={12} />
            </Link>
          </div>
          <div className="top-list">
            {data.topProducts.slice(0, 5).map((product, index) => (
              <button key={product.id} type="button" className="top-item" onClick={() => navigate(`/products/${product.id}`)}>
                <span className="top-rank">{String(index + 1).padStart(2, "0")}</span>
                <img src={product.image} alt={product.name} loading="lazy" />
                <span className="top-copy">
                  <strong>{product.name}</strong>
                  <span>{product.category}</span>
                </span>
                <span className="top-value">
                  {money(product.revenue)}
                  <em>{product.units} units</em>
                </span>
              </button>
            ))}
            {data.topProducts.length === 0 ? <p className="hint">No sales recorded in this window.</p> : null}
          </div>
        </Card>
      </div>

      <AttentionFeed lowStockCount={data.lowStock.length} />

      <Card className="dash-map">
        <UsOrderMap range={range} />
      </Card>

      <div className="dash-grid">
        <Card className="dash-sales">
          <div className="panel-head">
            <div>
              <h2>Revenue pulse</h2>
              <p>Daily takings across the last {range} days, gross of tax and shipping.</p>
            </div>
            <div className="sales-legend">
              <span>
                <i style={{ background: "var(--emerald-2)" }} /> Revenue
              </span>
              <span>
                <i style={{ background: "var(--gold)" }} /> Trend
              </span>
            </div>
          </div>
          <AreaChart data={data.revenueSeries} height={268} label="Revenue" />
        </Card>

        <Card className="gauge-panel">
          <div className="panel-head" style={{ width: "100%" }}>
            <div>
              <h2>Fulfilment</h2>
              <p>Order book health</p>
            </div>
            <Badge tone={data.fulfilment.rate >= 70 ? "positive" : "warning"} dot>
              {data.fulfilment.rate >= 70 ? "Healthy" : "Watch"}
            </Badge>
          </div>
          <Gauge value={data.fulfilment.rate} label="dispatched" sublabel={`${data.fulfilment.pending} waiting`} />
          <div className="gauge-stats">
            <div className="gauge-stat">
              <b>{data.fulfilment.dispatched}</b>
              <span>Dispatched</span>
            </div>
            <div className="gauge-stat">
              <b>{data.fulfilment.pending}</b>
              <span>In queue</span>
            </div>
            <div className="gauge-stat">
              <b>{data.fulfilment.returned}</b>
              <span>Returned</span>
            </div>
          </div>
          <Link to="/orders" className="inline-link" style={{ marginTop: 12 }}>
            Open order book <ArrowRight size={12} />
          </Link>
        </Card>
      </div>

      <div className="dash-lower">
        <Card>
          <div className="panel-head">
            <div>
              <h2>Recent orders</h2>
              <p>The latest six movements through the book</p>
            </div>
            <Link to="/orders" className="inline-link">
              All orders <ArrowRight size={12} />
            </Link>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.id} onClick={() => navigate(`/orders?order=${order.id}`)} style={{ cursor: "pointer" }}>
                    <td>
                      <span className="order-number">{order.number}</span>
                    </td>
                    <td>
                      <span className="cell-title">{order.customerName}</span>
                      <span className="cell-sub">{order.shippingAddress.city}</span>
                    </td>
                    <td>
                      <span className="cell-num">{money(order.total)}</span>
                    </td>
                    <td>
                      <Badge tone={(STATUS_TONE[order.status] as "positive") ?? "neutral"} dot>
                        {foldWords(order.status)}
                      </Badge>
                    </td>
                    <td>
                      <span className="cell-sub">{relative(order.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="dash-side">
          <Card>
            <div className="panel-head">
              <div>
                <h2>Running low</h2>
                <p>SKUs at or under threshold</p>
              </div>
              <Link to="/inventory?status=low" className="inline-link">
                Adjust <ArrowRight size={12} />
              </Link>
            </div>
            {data.lowStock.length ? (
              data.lowStock.map((row) => (
                <div key={row.sku} className="low-item">
                  <img className="thumb thumb-sm" src={row.image} alt={row.productName} loading="lazy" />
                  <div className="low-copy">
                    <strong>{row.productName}</strong>
                    <span>
                      {row.size} · {row.sku}
                    </span>
                  </div>
                  <span className="low-count">{row.stock}</span>
                </div>
              ))
            ) : (
              <p className="hint">Every SKU is comfortably above its reorder threshold.</p>
            )}
          </Card>

          <Card>
            <div className="panel-head">
              <div>
                <h2>Recent activity</h2>
                <p>Audited operator actions</p>
              </div>
              <Link to="/audit" className="inline-link">
                Log <ArrowRight size={12} />
              </Link>
            </div>
            <div className="activity-list">
              {data.activity.slice(0, 5).map((event) => (
                <div key={event.id} className="activity-item">
                  <span className="activity-icon">
                    <ReceiptText size={13} />
                  </span>
                  <div className="activity-copy">
                    <strong>{event.label}</strong>
                    <span className="truncate">{event.detail || event.by}</span>
                  </div>
                  <span className="activity-time">{relative(event.at)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
