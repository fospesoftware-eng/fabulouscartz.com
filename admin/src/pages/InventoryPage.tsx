import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Boxes, ClipboardList, History, Layers, Minus, Plus, RotateCcw, Search } from "lucide-react";
import type { InventoryRow, Paginated, StockMovement } from "../../shared/types";
import { Drawer } from "../components/overlay";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Pagination,
  SearchInput,
  Segmented,
  Spinner,
  TableSkeleton,
} from "../components/ui";
import { useUI } from "../context/UIContext";
import { resources } from "../lib/normalize";
import { useDebounced, useResource } from "../lib/hooks";
import { dateTime, foldWords, money } from "../lib/utils";

const REASONS = [
  "Restock received",
  "Damaged in transit",
  "Cycle count correction",
  "Rental returned late",
  "Sample sold at pop-up",
  "Shrinkage",
];

interface InventoryData {
  data: InventoryRow[];
  summary: { units: number; rented: number; low: number; out: number; value: number };
  updatedAt: string;
}

function rowTone(status: string): "positive" | "warning" | "danger" {
  if (status === "out") return "danger";
  if (status === "low") return "warning";
  return "positive";
}

export function InventoryPage() {
  const { notify } = useUI();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<"levels" | "movements">("levels");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 280);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [movementPage, setMovementPage] = useState(1);
  const [movementQ, setMovementQ] = useState("");
  const movementDebounced = useDebounced(movementQ, 280);

  const levels = useResource<InventoryData>(
    () => resources.inventory({ status, q: debouncedQ }) as Promise<InventoryData>,
    [status, debouncedQ],
  );

  const movements = useResource<Paginated<StockMovement>>(
    () =>
      resources.movements({
        page: movementPage,
        pageSize: 12,
        q: movementDebounced,
        sku: historyFor ?? undefined,
      }) as Promise<Paginated<StockMovement>>,
    [movementPage, movementDebounced, historyFor],
  );

  const summary = levels.data?.summary;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Commerce</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Inventory</span>
          </nav>
          <p className="eyebrow page-eyebrow">Stock control</p>
          <h1 className="page-title">Every unit accounted for.</h1>
          <p className="page-description">
            Per-SKU stock, rental windows and reasoned adjustments. Nothing moves without a reason code and an audit entry.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/products" className="inline-link">
            Catalogue <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="summary-strip">
        <div className="summary-card">
          <span>Units on hand</span>
          <strong>{summary?.units ?? "—"}</strong>
          <em>Across all SKUs</em>
        </div>
        <div className="summary-card">
          <span>Out on rent</span>
          <strong>{summary?.rented ?? "—"}</strong>
          <em>Returning over the next weeks</em>
        </div>
        <div className="summary-card is-alert">
          <span>Low stock</span>
          <strong>{summary?.low ?? "—"}</strong>
          <em>At or under threshold</em>
        </div>
        <div className="summary-card is-alert">
          <span>Sold out</span>
          <strong>{summary?.out ?? "—"}</strong>
          <em>Needs restock</em>
        </div>
        <div className="summary-card">
          <span>Stock value</span>
          <strong>{summary ? money(summary.value, { compact: true }) : "—"}</strong>
          <em>At retail price</em>
        </div>
      </div>

      <div className="toolbar">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "levels", label: "Stock levels" },
            { value: "movements", label: "Movement log" },
          ]}
        />
        {tab === "levels" ? (
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Search SKU, product, size, colour…" className="grow" />
            <Segmented
              size="sm"
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: "All" },
                { value: "low", label: `Low${summary ? ` · ${summary.low}` : ""}` },
                { value: "out", label: `Out${summary ? ` · ${summary.out}` : ""}` },
                { value: "healthy", label: "Healthy" },
              ]}
            />
          </>
        ) : (
          <>
            <SearchInput value={movementQ} onChange={(value) => { setMovementQ(value); setMovementPage(1); }} placeholder="Search SKU, reason, operator…" className="grow" />
            {historyFor ? (
              <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={() => setHistoryFor(null)}>
                Clear {historyFor}
              </Button>
            ) : null}
          </>
        )}
      </div>

      {tab === "levels" ? (
        <Card className="table-card">
          {levels.error ? (
            <ErrorState title="Stock levels unavailable" body={levels.error} onRetry={levels.reload} />
          ) : levels.loading && !levels.data ? (
            <TableSkeleton rows={8} cols={7} />
          ) : levels.data && levels.data.data.length === 0 ? (
            <EmptyState icon={<Search size={22} />} title="No SKUs in this cut" body="Try another status or clear the search." />
          ) : levels.data ? (
            <>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Piece / SKU</th>
                      <th>Variant</th>
                      <th>On hand</th>
                      <th>Rented</th>
                      <th>Available</th>
                      <th>Threshold</th>
                      <th>Status</th>
                      <th>Rent window</th>
                      <th aria-label="Adjust" />
                    </tr>
                  </thead>
                  <tbody>
                    {levels.data.data.map((row) => (
                      <tr key={row.sku}>
                        <td>
                          <div className="product-preview">
                            <img src={row.image} alt={row.productName} loading="lazy" />
                            <div>
                              <span className="cell-title">{row.productName}</span>
                              <span className="cell-sub mono">{row.sku}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="cell-title" style={{ fontSize: 11 }}>{row.size}</span>
                          <span className="cell-sub">
                            <i className="swatch" style={{ marginRight: 5 }} /> {row.color}
                          </span>
                        </td>
                        <td>
                          <span className="cell-num">{row.stock}</span>
                        </td>
                        <td>
                          <span className="cell-sub">{row.rented}</span>
                        </td>
                        <td>
                          <span className="cell-num">{row.available}</span>
                        </td>
                        <td>
                          <span className="cell-sub">{row.lowStockThreshold}</span>
                        </td>
                        <td>
                          <Badge tone={rowTone(row.status)} dot>
                            {row.status === "out" ? "Sold out" : row.status === "low" ? "Low" : "Healthy"}
                          </Badge>
                        </td>
                        <td>
                          <span className="cell-sub">{row.rentWindowDays} days</span>
                        </td>
                        <td>
                          <div className="row-menu">
                            <Button variant="outline" size="sm" icon={<Plus size={12} />} onClick={() => setAdjusting(row)}>
                              Adjust
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { setHistoryFor(row.sku); setTab("movements"); setMovementPage(1); }}>
                              <History size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-note">
                <span>
                  {levels.data.data.length} SKUs · snapshot {dateTime(levels.data.updatedAt)}
                </span>
                <span className="mono">Rented units count against availability</span>
              </div>
            </>
          ) : null}
        </Card>
      ) : (
        <Card className="table-card">
          {movements.error ? (
            <ErrorState title="Movement log unavailable" body={movements.error} onRetry={movements.reload} />
          ) : movements.loading && !movements.data ? (
            <TableSkeleton rows={8} cols={6} />
          ) : movements.data && movements.data.data.length === 0 ? (
            <EmptyState icon={<ClipboardList size={22} />} title="No movements recorded" body="Adjustments and rental returns will appear here." />
          ) : movements.data ? (
            <>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>SKU / piece</th>
                      <th>Reason</th>
                      <th>Change</th>
                      <th>Stock after</th>
                      <th>Operator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.data.data.map((movement) => (
                      <tr key={movement.id}>
                        <td>
                          <span className="cell-sub">{dateTime(movement.at)}</span>
                        </td>
                        <td>
                          <span className="cell-title" style={{ fontSize: 11 }}>{movement.productName}</span>
                          <span className="cell-sub mono">{movement.sku}</span>
                        </td>
                        <td>
                          <span className="reason-tag">{movement.reason}</span>
                          {movement.note ? <span className="cell-sub">{movement.note}</span> : null}
                        </td>
                        <td>
                          <span className={`movement-delta ${movement.delta > 0 ? "is-up" : "is-down"}`}>
                            {movement.delta > 0 ? "+" : ""}
                            {movement.delta}
                          </span>
                        </td>
                        <td>
                          <span className="movement-chain">
                            {movement.previous} → {movement.next}
                          </span>
                        </td>
                        <td>
                          <span className="cell-sub">{movement.actor}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-note">
                <span>
                  {movements.data.total} movements · page {movements.data.page} of {movements.data.totalPages}
                </span>
                <Pagination
                  page={movements.data.page}
                  totalPages={movements.data.totalPages}
                  total={movements.data.total}
                  pageSize={movements.data.pageSize}
                  onPage={setMovementPage}
                />
              </div>
            </>
          ) : null}
        </Card>
      )}

      <AdjustDrawer
        row={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={() => {
          levels.reload();
          movements.reload();
        }}
        notify={notify}
      />
    </div>
  );
}

function AdjustDrawer({
  row,
  onClose,
  onSaved,
  notify,
}: {
  row: InventoryRow | null;
  onClose: () => void;
  onSaved: () => void;
  notify: ReturnType<typeof useUI>["notify"];
}) {
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!row) return null;
  const next = row.stock + delta;
  const invalid = next < 0 || next < row.rented || delta === 0;

  const step = (amount: number) => setDelta((current) => current + amount);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await resources.adjustInventoryBySku(row.sku, delta, reason, note);
      notify({
        kind: "success",
        title: "Stock adjusted",
        description: `${row.sku} · ${delta > 0 ? "+" : ""}${delta} → ${next} on hand.`,
      });
      onSaved();
      onClose();
      setDelta(1);
      setReason(REASONS[0]);
      setNote("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Adjustment rejected.");
      notify({ kind: "error", title: "Adjustment failed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width={460}
      eyebrow="Stock adjustment"
      title={row.productName}
      subtitle={`${row.size} · ${row.color} · ${row.sku}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={invalid} onClick={() => void submit()} icon={<Layers size={14} />}>
            Record adjustment
          </Button>
        </>
      }
    >
      <div className="adjust-form">
        <div className="sku-panel">
          <img src={row.image} alt={row.productName} />
          <div>
            <strong>{row.productName}</strong>
            <span>{row.sku}</span>
            <span>
              {row.stock} on hand · {row.rented} rented · {row.available} available
            </span>
          </div>
        </div>

        <Field label="Change in stock" hint="Positive to receive, negative to write off.">
          <div className="stepper">
            <button type="button" onClick={() => step(-1)} aria-label="Decrease by one">
              <Minus size={14} />
            </button>
            <input
              type="number"
              value={delta}
              onChange={(event) => setDelta(Number(event.target.value) || 0)}
              aria-label="Adjustment amount"
            />
            <button type="button" onClick={() => step(1)} aria-label="Increase by one">
              <Plus size={14} />
            </button>
          </div>
          <div className="chip-list" style={{ marginTop: 8 }}>
            {[-10, -5, -1, 1, 5, 10].map((amount) => (
              <button key={amount} type="button" className="chip" onClick={() => setDelta(amount)}>
                {amount > 0 ? `+${amount}` : amount}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Reason code" required>
          <select className="select" value={reason} onChange={(event) => setReason(event.target.value)}>
            {REASONS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Note" hint="Optional context for the next operator.">
          <textarea className="textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} placeholder="Supplier invoice #…" />
        </Field>

        <div className="adjust-preview">
          <span>Stock after adjustment</span>
          <b className={invalid ? "is-invalid" : ""}>{next}</b>
        </div>
        {invalid ? (
          <p className="form-error">
            {next < 0
              ? "Stock cannot go below zero."
              : next < row.rented
                ? `At least ${row.rented} units are out on rent.`
                : "Enter a non-zero change."}
          </p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        {busy ? (
          <div className="row" style={{ gap: 6 }}>
            <Spinner /> <span className="hint">Recording…</span>
          </div>
        ) : null}
        <p className="hint">
          Adjustments write a stock movement, an audit entry and a low-stock notification when the threshold is crossed.
        </p>
      </div>
    </Drawer>
  );
}
