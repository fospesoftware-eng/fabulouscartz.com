import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { ArrowUpRight, Minus, Plus, RotateCcw, ShoppingBag } from "lucide-react";
// @ts-ignore us-atlas ships raw TopoJSON without declarations
import topology from "us-atlas/states-10m.json";
import type { UsMapData, UsStateDetail, UsStateOrders } from "../../shared/types";
import { api } from "../lib/api";
import { Skeleton, useResource } from "../lib/hooks";
import { money, relative } from "../lib/utils";
import { Badge, Button, ErrorState, IconButton, Segmented } from "./ui";
import { Drawer } from "./overlay";

const MAP_W = 975;
const MAP_H = 610;
const LEVEL_COLORS = ["", "var(--map-l1)", "var(--map-l2)", "var(--map-l3)", "var(--map-l4)"];
const METRICS = [
  { value: "orders" as const, label: "Orders" },
  { value: "revenue" as const, label: "Revenue" },
  { value: "aov" as const, label: "AOV" },
];

type Metric = "orders" | "revenue" | "aov";

interface Shape {
  name: string;
  d: string;
  cx: number;
  cy: number;
}

const topo = topology as unknown as {
  objects: { states: unknown };
};
const collection = feature(topo as never, topo.objects.states as never) as unknown as {
  type: "FeatureCollection";
  features: Array<{ properties: { name: string }; geometry: unknown }>;
};
const projection = geoAlbersUsa();
projection.fitExtent(
  [
    [12, 12],
    [MAP_W - 12, MAP_H - 12],
  ],
  collection as never,
);
const path = geoPath(projection);

const SHAPES: Shape[] = collection.features
  .map((shape) => {
    const d = path(shape as never);
    const centroid = d ? path.centroid(shape as never) : [0, 0];
    return { name: shape.properties.name, d: d ?? "", cx: centroid[0], cy: centroid[1] };
  })
  .filter((shape) => shape.d);

function metricValue(state: UsStateOrders, metric: Metric): number {
  if (metric === "revenue") return state.revenue;
  if (metric === "aov") return state.aov;
  return state.orders;
}

function metricLabel(value: number, metric: Metric): string {
  if (metric === "revenue" || metric === "aov") return money(value, { compact: true });
  return String(value);
}

export function UsOrderMap({ range }: { range: number }) {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<Metric>("orders");
  const [selected, setSelected] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const map = useResource<UsMapData>(() => api.get<UsMapData>(`/map/states?range=${range}`), [range]);
  const selectedState = map.data?.states.find((state) => state.name === selected);
  const detail = useResource<UsStateDetail>(
    () => api.get<UsStateDetail>(`/map/states/${selectedState?.code ?? ""}?range=${range}`),
    [selectedState?.code, range],
    { enabled: Boolean(selectedState) },
  );

  const states = map.data?.states ?? [];
  const max = useMemo(() => Math.max(1, ...states.map((state) => metricValue(state, metric))), [states, metric]);
  const ranked = useMemo(
    () =>
      states
        .filter((state) => metricValue(state, metric) > 0)
        .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
        .slice(0, 10),
    [states, metric],
  );
  const active = selected ? states.find((state) => state.name === selected) : undefined;
  const hoveredState = hover ? states.find((state) => state.name === hover.name) : undefined;

  const cuts = [max * 0.25, max * 0.5, max * 0.75];
  const level = (value: number) => {
    if (value <= 0) return 0;
    if (value <= cuts[0]) return 1;
    if (value <= cuts[1]) return 2;
    if (value <= cuts[2]) return 3;
    return 4;
  };
  const rangeLabel = (index: number) => {
    const low = index === 0 ? 1 : Math.round(cuts[index - 1]) + 1;
    const high = index === 3 ? Math.round(max) : Math.round(cuts[index]);
    return `${metricLabel(low, metric)}–${metricLabel(high, metric)}`;
  };

  const selectState = (name: string) =>
    setSelected((current) => {
      if (current === name) {
        setBriefOpen(false);
        return null;
      }
      setBriefOpen(true);
      return name;
    });

  const tooltipPosition = (event: { clientX: number; clientY: number }) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = board.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * MAP_W;
      const py = ((event.clientY - rect.top) / rect.height) * MAP_H;
      const factor = event.deltaY < 0 ? 1.16 : 1 / 1.16;
      setView((current) => {
        const k = Math.min(5, Math.max(1, current.k * factor));
        if (k === current.k) return current;
        return { k, x: current.x + (current.k - k) * (px - MAP_W / 2), y: current.y + (current.k - k) * (py - MAP_H / 2) };
      });
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, ox: view.x, oy: view.y, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((event.clientX - drag.x) / rect.width) * MAP_W;
    const dy = ((event.clientY - drag.y) / rect.height) * MAP_H;
    if (!drag.moved && Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 4) {
      drag.moved = true;
      // Capture only once a real drag starts, so plain clicks still reach the state shapes.
      boardRef.current?.setPointerCapture(event.pointerId);
    }
    if (drag.moved) setView((current) => ({ ...current, x: drag.ox + dx, y: drag.oy + dy }));
  };

  const endDrag = () => {
    suppressClick.current = Boolean(dragRef.current?.moved);
    dragRef.current = null;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 60);
  };

  useEffect(() => {
    if (!selected && !briefOpen && !hover) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHover(null);
        setBriefOpen(false);
        setSelected(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, briefOpen, hover]);

  const transform = `translate(${view.x} ${view.y}) translate(${MAP_W / 2} ${MAP_H / 2}) scale(${view.k}) translate(${-MAP_W / 2} ${-MAP_H / 2})`;

  return (
    <div className="usmap-wrap">
      <div className="usmap-head">
        <div>
          <p className="eyebrow">Destination intelligence</p>
          <h3>Orders across the United States</h3>
          <p className="usmap-sub">
            {map.data ? `${map.data.totals.orders} US-destined orders · ${money(map.data.totals.revenue, { compact: true })} revenue` : "Loading state volumes…"}
          </p>
        </div>
        <Segmented size="sm" value={metric} options={METRICS} onChange={(next) => setMetric(next)} />
      </div>

      <div className="usmap-body">
        <div className="usmap-board-col">
          {map.loading && !map.data ? (
            <div className="usmap-skeleton">
              <Skeleton width="100%" height={330} />
            </div>
          ) : map.error ? (
            <ErrorState body={map.error} onRetry={map.reload} />
          ) : (
            <div
              className="usmap-board"
              ref={boardRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={() => {
                endDrag();
                setHover(null);
              }}
            >
              <div className="usmap-zoom">
                <IconButton
                  label="Zoom in"
                  onClick={() => setView((current) => ({ ...current, k: Math.min(5, current.k * 1.25) }))}
                >
                  <Plus size={15} />
                </IconButton>
                <IconButton
                  label="Zoom out"
                  onClick={() => setView((current) => ({ ...current, k: Math.max(1, current.k / 1.25) }))}
                >
                  <Minus size={15} />
                </IconButton>
                <IconButton label="Reset map" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
                  <RotateCcw size={14} />
                </IconButton>
              </div>
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="usmap-svg" role="group" aria-label="United States order choropleth">
                <g transform={transform}>
                  {SHAPES.map((shape) => {
                    const state = states.find((entry) => entry.name === shape.name);
                    const value = state ? metricValue(state, metric) : 0;
                    const step = level(value);
                    const isActive = selected === shape.name;
                    const isHover = hover?.name === shape.name;
                    return (
                      <path
                        key={shape.name}
                        d={shape.d}
                        className={`usmap-state level-${step}${isActive ? " is-selected" : ""}${isHover ? " is-hover" : ""}`}
                        fill={step ? LEVEL_COLORS[step] : "var(--map-empty)"}
                        role="button"
                        tabIndex={0}
                        aria-label={`${shape.name}: ${state?.orders ?? 0} orders, ${money(state?.revenue ?? 0, { compact: true })} revenue`}
                        aria-pressed={isActive}
                        onPointerEnter={(event) => {
                          setHover({ name: shape.name, ...tooltipPosition(event) });
                        }}
                        onPointerMove={(event) => setHover({ name: shape.name, ...tooltipPosition(event) })}
                        onClick={() => {
                          if (suppressClick.current) return;
                          selectState(shape.name);
                        }}
                        onFocus={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          const board = boardRef.current?.getBoundingClientRect();
                          if (board) setHover({ name: shape.name, x: rect.left - board.left + rect.width / 2, y: rect.top - board.top });
                        }}
                        onBlur={() => setHover(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectState(shape.name);
                          }
                        }}
                      />
                    );
                  })}
                </g>
              </svg>

              {hoveredState && hover ? (
                <div className="usmap-tip" style={{ left: hover.x, top: hover.y }}>
                  <strong>{hoveredState.name}</strong>
                  <dl>
                    <div>
                      <dt>Orders</dt>
                      <dd>{hoveredState.orders}</dd>
                    </div>
                    <div>
                      <dt>Revenue</dt>
                      <dd>{money(hoveredState.revenue, { compact: true })}</dd>
                    </div>
                    <div>
                      <dt>AOV</dt>
                      <dd>{money(hoveredState.aov)}</dd>
                    </div>
                    <div>
                      <dt>Share</dt>
                      <dd>{hoveredState.share}%</dd>
                    </div>
                  </dl>
                  <span className="usmap-tip-hint">Click to open state brief</span>
                </div>
              ) : null}
            </div>
          )}

          <div className="usmap-legend" aria-label="Colour legend">
            <span className="usmap-legend-item">
              <i className="usmap-swatch level-0" /> No orders
            </span>
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className="usmap-legend-item">
                <i className={`usmap-swatch level-${index + 1}`} /> {rangeLabel(index)}
              </span>
            ))}
          </div>
        </div>

        <aside className="usmap-rank" aria-label="Top states">
          <header>
            <h4>Top states</h4>
            <span>by {METRICS.find((entry) => entry.value === metric)?.label.toLowerCase()}</span>
          </header>
          <ol>
            {ranked.map((state, index) => (
              <li key={state.code}>
                <button type="button" onClick={() => selectState(state.name)} className={selected === state.name ? "is-active" : ""}>
                  <span className="usmap-rank-no">{String(index + 1).padStart(2, "0")}</span>
                  <span className="usmap-rank-name">
                    {state.name}
                    <em>{state.orders} orders · {money(state.revenue, { compact: true })}</em>
                  </span>
                  <span className="usmap-rank-value">{metricLabel(metricValue(state, metric), metric)}</span>
                  <i style={{ width: `${Math.max(6, (metricValue(state, metric) / max) * 100)}%` }} />
                </button>
              </li>
            ))}
            {!ranked.length && !map.loading ? <li className="usmap-rank-empty">No US orders in this window yet.</li> : null}
          </ol>
        </aside>
      </div>

      {active && detail.data && !detail.loading ? (
        <section className="usmap-state-table">
          <header>
            <span className="eyebrow">Order book · {active.name}</span>
            <div className="row">
              <span className="usmap-chip">
                {active.orders} orders<span>·</span>{money(active.revenue, { compact: true })}
              </span>
              <Button variant="ghost" onClick={() => navigate(`/orders?state=${encodeURIComponent(active.name)}`)}>
                Open filtered orders
              </Button>
              <Button variant="ghost" onClick={() => { setSelected(null); setBriefOpen(false); }}>
                Clear
              </Button>
            </div>
          </header>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Ship to</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {detail.data.recentOrders.map((order) => (
                  <tr key={order.id} onClick={() => navigate(`/orders?order=${order.id}`)} style={{ cursor: "pointer" }}>
                    <td><span className="order-number">{order.number}</span></td>
                    <td>
                      <span className="cell-title">{order.customerName}</span>
                      <span className="cell-sub">{order.customerEmail}</span>
                    </td>
                    <td>
                      <span className="cell-title">{order.shippingAddress.city}</span>
                      <span className="cell-sub">{order.shippingAddress.state}</span>
                    </td>
                    <td><span className="cell-num">{money(order.total)}</span></td>
                    <td>
                      <Badge tone={order.status === "delivered" ? "positive" : order.status === "cancelled" ? "danger" : "neutral"}>
                        {order.status}
                      </Badge>
                    </td>
                    <td><span className="cell-sub">{relative(order.createdAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Drawer
        open={briefOpen && Boolean(active)}
        onClose={() => setBriefOpen(false)}
        width={470}
        eyebrow="State brief"
        title={active ? active.name : "State"}
        subtitle={active ? `${active.share}% of US order volume · ${range} day window` : undefined}
        footer={
          active ? (
            <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
              <Button variant="ghost" onClick={() => { setSelected(null); setBriefOpen(false); }}>
                Clear selection
              </Button>
              <Button variant="primary" icon={<ArrowUpRight size={14} />} onClick={() => navigate(`/orders?state=${encodeURIComponent(active.name)}`)}>
                Open orders
              </Button>
            </div>
          ) : undefined
        }
      >
        {detail.loading || !detail.data ? (
          <div className="usmap-detail-loading">
            <Skeleton width="100%" height={64} />
            <Skeleton width="100%" height={130} />
          </div>
        ) : detail.data ? (
          <StateBrief detail={detail.data} />
        ) : null}
      </Drawer>
    </div>
  );
}

function StateBrief({ detail }: { detail: UsStateDetail }) {
  const state = detail.state;
  return (
    <div className="usmap-brief">
      <div className="usmap-brief-stats">
        <div>
          <span>Orders</span>
          <strong>{state.orders}</strong>
        </div>
        <div>
          <span>Revenue</span>
          <strong>{money(state.revenue, { compact: true })}</strong>
        </div>
        <div>
          <span>AOV</span>
          <strong>{money(state.aov)}</strong>
        </div>
        <div>
          <span>Share</span>
          <strong>{state.share}%</strong>
        </div>
      </div>

      <section className="usmap-brief-section">
        <p className="eyebrow">Top pieces</p>
        {detail.topProducts.length ? (
          <ul className="usmap-products">
            {detail.topProducts.map((product) => (
              <li key={product.id}>
                {product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="usmap-product-fallback" />}
                <div>
                  <strong>{product.name}</strong>
                  <em>
                    {product.category} · {product.units} units
                  </em>
                </div>
                <span>{money(product.revenue, { compact: true })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="usmap-muted">No product mix in this window.</p>
        )}
      </section>

      <section className="usmap-brief-section">
        <p className="eyebrow">Recent orders</p>
        {detail.recentOrders.length ? (
          <ul className="usmap-orders">
            {detail.recentOrders.map((order) => (
              <li key={order.id}>
                <span className="usmap-order-icon">
                  <ShoppingBag size={14} />
                </span>
                <div>
                  <strong>
                    {order.number} · {order.customerName}
                  </strong>
                  <em>
                    {order.shippingAddress.city} · {relative(order.createdAt)}
                  </em>
                </div>
                <div className="usmap-order-meta">
                  <strong>{money(order.total)}</strong>
                  <Badge tone={order.status === "delivered" ? "positive" : order.status === "cancelled" ? "danger" : "neutral"}>
                    {order.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="usmap-muted">No recent orders in this state.</p>
        )}
      </section>
    </div>
  );
}
