import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { ArrowUpRight, Minus, Plus, RotateCcw, ShoppingBag } from "lucide-react";
// @ts-ignore us-atlas ships raw TopoJSON without declarations
import topology from "us-atlas/states-10m.json";
import type { GeoMetric, GeoResult, GeoStateRow } from "../lib/geo";
import { resources } from "../lib/normalize";
import { Skeleton, useResource } from "../lib/hooks";
import { money } from "../lib/utils";
import { Button, EmptyState, ErrorState, IconButton, Segmented } from "./ui";
import { Drawer } from "./overlay";

const MAP_W = 975;
const MAP_H = 610;
const LEVEL_COLORS = ["", "var(--map-l1)", "var(--map-l2)", "var(--map-l3)", "var(--map-l4)"];
const METRICS = [
  { value: "orders" as const, label: "Orders" },
  { value: "revenue" as const, label: "Revenue" },
  { value: "bookings" as const, label: "Bookings" },
];
const LAYERS = [
  { value: "orders" as const, label: "Orders" },
  { value: "rentals" as const, label: "Rentals" },
];

type Layer = "orders" | "rentals";

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

function isoToday(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/* The layer decides which book is painted (orders vs rentals); the metric
   decides the measure. Booking count always switches to the rental book so the
   ranking re-ranks as soon as the metric changes. */
function valueOf(state: GeoStateRow, metric: GeoMetric, layer: Layer): number {
  const rentals = layer === "rentals" || metric === "bookings";
  if (rentals) return metric === "revenue" ? state.bookingRevenue : state.bookings;
  return metric === "revenue" ? state.orderRevenue : state.orders;
}

function measureLabel(value: number, metric: GeoMetric): string {
  return metric === "revenue" ? money(value, { compact: true }) : String(value);
}

export function UsOrderMap({ range: _range }: { range: number }) {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<GeoMetric>("orders");
  const [layer, setLayer] = useState<Layer>("orders");
  const [from, setFrom] = useState(isoToday(-365));
  const [to, setTo] = useState(isoToday());
  const [applied, setApplied] = useState({ from: isoToday(-365), to: isoToday() });
  const [selected, setSelected] = useState<string | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const geo = useResource<GeoResult>(
    () => resources.geo({ metric, from: applied.from, to: applied.to }),
    [metric, applied.from, applied.to],
  );

  const states = geo.data?.states ?? [];
  const max = useMemo(() => Math.max(1, ...states.map((state) => valueOf(state, metric, layer))), [states, metric, layer]);
  const rankIndex = useMemo(
    () => new Map((geo.data?.ranking ?? []).map((entry, index) => [entry.code, index])),
    [geo.data],
  );
  const ranked = useMemo(
    () =>
      states
        .filter((state) => valueOf(state, metric, layer) > 0)
        .sort(
          (a, b) =>
            valueOf(b, metric, layer) - valueOf(a, metric, layer) ||
            (rankIndex.get(a.code) ?? 99) - (rankIndex.get(b.code) ?? 99) ||
            a.code.localeCompare(b.code),
        )
        .slice(0, 10),
    [states, metric, layer, rankIndex],
  );
  const active = selected ? states.find((state) => state.name === selected) : undefined;
  const hoveredState = hover ? states.find((state) => state.name === hover.name) : undefined;
  const rentalsMode = layer === "rentals" || metric === "bookings";

  const cuts = [max * 0.25, max * 0.5, max * 0.75];
  const level = (value: number) => {
    if (value <= 0) return 0;
    if (value <= cuts[0]) return 1;
    if (value <= cuts[1]) return 2;
    if (value <= cuts[2]) return 3;
    return 4;
  };
  const rangeLabel = (index: number) => {
    const low = index === 0 ? 1 : Math.max(1, Math.floor(cuts[index - 1]) + 1);
    const high = Math.max(low, index === 3 ? Math.ceil(max) : Math.ceil(cuts[index]));
    return `${measureLabel(low, metric)}–${measureLabel(high, metric)}`;
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
  const isEmpty = Boolean(geo.data) && !states.some((state) => state.orders > 0 || state.bookings > 0);

  return (
    <div className="usmap-wrap">
      <div className="usmap-head">
        <div>
          <p className="eyebrow">Destination intelligence</p>
          <h3>{rentalsMode ? "Rentals across the United States" : "Orders across the United States"}</h3>
          <p className="usmap-sub">
            {geo.data
              ? `${geo.data.range.from.slice(0, 10)} → ${geo.data.range.to.slice(0, 10)} · ${geo.data.totals.orders} orders · ${geo.data.totals.bookings} rentals`
              : "Loading the API window…"}
          </p>
          <p className="usmap-sub">
            {geo.data
              ? `${geo.data.excluded.nonUsOrders} non-US orders not shown${
                  geo.data.excluded.nonUsBookings ? ` · ${geo.data.excluded.nonUsBookings} non-US rentals not shown` : ""
                }${geo.data.excluded.unknownStateOrders ? ` · ${geo.data.excluded.unknownStateOrders} orders with unknown state` : ""}`
              : "Coverage applies to US states only."}
          </p>
        </div>
        <div className="usmap-controls">
          <Segmented size="sm" value={metric} options={METRICS} onChange={(next) => setMetric(next)} />
          <Segmented size="sm" value={layer} options={LAYERS} onChange={(next) => setLayer(next)} />
          <div className="usmap-range">
            <label>
              <span>From</span>
              <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
            </label>
            <Button size="sm" variant="ghost" onClick={() => setApplied({ from, to })} disabled={geo.loading}>
              Apply
            </Button>
          </div>
        </div>
      </div>

      <div className="usmap-body">
        <div className="usmap-board-col">
          {geo.loading && !geo.data ? (
            <div className="usmap-skeleton">
              <Skeleton width="100%" height={330} />
            </div>
          ) : geo.error ? (
            <ErrorState title="Could not load the destination map" body={geo.error} onRetry={geo.reload} />
          ) : isEmpty ? (
            <EmptyState
              icon={<ShoppingBag size={20} />}
              title="No data for this period"
              body={`No US orders or rentals were recorded between ${geo.data?.range.from.slice(0, 10)} and ${geo.data?.range.to.slice(0, 10)}. ${geo.data?.excluded.nonUsOrders ?? 0} non-US orders sit outside this map.`}
            />
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
                <IconButton label="Zoom in" onClick={() => setView((current) => ({ ...current, k: Math.min(5, current.k * 1.25) }))}>
                  <Plus size={15} />
                </IconButton>
                <IconButton label="Zoom out" onClick={() => setView((current) => ({ ...current, k: Math.max(1, current.k / 1.25) }))}>
                  <Minus size={15} />
                </IconButton>
                <IconButton label="Reset map" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
                  <RotateCcw size={14} />
                </IconButton>
              </div>
              <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="usmap-svg" role="group" aria-label="United States destination choropleth">
                <g transform={transform}>
                  {SHAPES.map((shape) => {
                    const state = states.find((entry) => entry.name === shape.name);
                    const value = state ? valueOf(state, metric, layer) : 0;
                    const step = level(value);
                    const rentalOnly = Boolean(!rentalsMode && state && state.bookings > 0 && state.orders === 0);
                    const isActive = selected === shape.name;
                    const isHover = hover?.name === shape.name;
                    return (
                      <path
                        key={shape.name}
                        d={shape.d}
                        className={`usmap-state level-${step}${rentalOnly ? " is-rental-only" : ""}${isActive ? " is-selected" : ""}${isHover ? " is-hover" : ""}`}
                        fill={step ? LEVEL_COLORS[step] : "var(--map-empty)"}
                        role="button"
                        tabIndex={0}
                        aria-label={`${shape.name}: ${state?.orders ?? 0} orders, ${state?.bookings ?? 0} rentals`}
                        aria-pressed={isActive}
                        onPointerEnter={(event) => setHover({ name: shape.name, ...tooltipPosition(event) })}
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
                      <dt>Order revenue</dt>
                      <dd>{money(hoveredState.orderRevenue, { compact: true })}</dd>
                    </div>
                    <div>
                      <dt>Rentals</dt>
                      <dd>{hoveredState.bookings}</dd>
                    </div>
                    <div>
                      <dt>Rental revenue</dt>
                      <dd>{money(hoveredState.bookingRevenue, { compact: true })}</dd>
                    </div>
                  </dl>
                  <span className="usmap-tip-hint">Click to open state brief</span>
                </div>
              ) : null}
            </div>
          )}

          <div className="usmap-legend" aria-label="Colour legend">
            <span className="usmap-legend-item">
              <i className="usmap-swatch level-0" /> No {rentalsMode ? "rentals" : "orders"}
            </span>
            {!isEmpty && max > 3
              ? [0, 1, 2, 3].map((index) => (
                  <span key={index} className="usmap-legend-item">
                    <i className={`usmap-swatch level-${index + 1}`} /> {rangeLabel(index)}
                  </span>
                ))
              : null}
            {!isEmpty && max <= 3 ? (
              <span className="usmap-legend-item usmap-legend-note">Darker means more volume</span>
            ) : null}
            {!rentalsMode && !isEmpty ? (
              <span className="usmap-legend-item">
                <i className="usmap-swatch is-rental-only" /> Rental-only state
              </span>
            ) : null}
          </div>
        </div>

        <aside className="usmap-rank" aria-label="Top states">
          <header>
            <h4>Top states</h4>
            <span>by {rentalsMode ? (metric === "revenue" ? "rental revenue" : "rentals") : METRICS.find((entry) => entry.value === metric)?.label.toLowerCase()}</span>
          </header>
          <ol>
            {ranked.map((state, index) => (
              <li key={state.code}>
                <button type="button" onClick={() => selectState(state.name)} className={selected === state.name ? "is-active" : ""}>
                  <span className="usmap-rank-no">{String(index + 1).padStart(2, "0")}</span>
                  <span className="usmap-rank-name">
                    {state.name}
                    <em>
                      {state.orders} orders · {state.bookings} rentals
                    </em>
                  </span>
                  <span className="usmap-rank-value">{measureLabel(valueOf(state, metric, layer), metric)}</span>
                  <i style={{ width: `${Math.max(6, (valueOf(state, metric, layer) / max) * 100)}%` }} />
                </button>
              </li>
            ))}
            {!ranked.length && !geo.loading ? <li className="usmap-rank-empty">No US orders or rentals in this window yet.</li> : null}
          </ol>
        </aside>
      </div>

      <Drawer
        open={briefOpen && Boolean(active)}
        onClose={() => setBriefOpen(false)}
        width={470}
        eyebrow="State brief"
        title={active ? active.name : "State"}
        subtitle={active ? `${active.share.toFixed(1)}% of US orders · ${geo.data?.range.from.slice(0, 10)} → ${geo.data?.range.to.slice(0, 10)}` : undefined}
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
        {active ? (
          <div className="usmap-brief">
            <div className="usmap-brief-stats">
              <div>
                <span>Orders</span>
                <strong>{active.orders}</strong>
              </div>
              <div>
                <span>Order revenue</span>
                <strong>{money(active.orderRevenue, { compact: true })}</strong>
              </div>
              <div>
                <span>Order AOV</span>
                <strong>{money(active.aov)}</strong>
              </div>
              <div>
                <span>Rentals</span>
                <strong>{active.bookings}</strong>
              </div>
            </div>
            <p className="usmap-muted">
              {active.bookings} rental bookings worth {money(active.bookingRevenue, { compact: true })}.
              {active.orders === 0 && active.bookings > 0 ? " This state has rentals but no orders in the window." : ""}
            </p>
            <p className="usmap-muted">Per-state product mix and order history are not exposed by the API; use the orders table for details.</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
