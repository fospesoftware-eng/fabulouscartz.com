import { useState } from "react";
import { ArrowRight, Download, RefreshCw, TrendingUp } from "lucide-react";
import type { AnalyticsData, Category, SeriesPoint } from "../../shared/types";
import { AreaChart, CategoryBars, DonutChart, MiniBars, Sparkline } from "../components/charts";
import { Badge, Button, Card, ErrorState, Segmented, StatDelta } from "../components/ui";
import { useUI } from "../context/UIContext";
import { api, downloadCsv } from "../lib/api";
import { useResource } from "../lib/hooks";
import { dateShort, money, num } from "../lib/utils";

function delta(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function AnalyticsPage() {
  const { notify } = useUI();
  const [range, setRange] = useState(30);
  const [categoryId, setCategoryId] = useState("");
  const [exporting, setExporting] = useState(false);
  const categories = useResource<{ data: Category[] }>(() => api.get<{ data: Category[] }>("/categories"), []);

  const params = new URLSearchParams();
  params.set("range", String(range));
  if (categoryId) params.set("categoryId", categoryId);

  const analytics = useResource<AnalyticsData>(() => api.get<AnalyticsData>(`/analytics?${params.toString()}`), [range, categoryId]);
  const data = analytics.data;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadCsv(`/analytics/export.csv?${params.toString()}`, `fabulouscartz-analytics-${range}d.csv`);
      notify({ kind: "success", title: "CSV exported", description: `Analytics for the last ${range} days.` });
    } catch (cause) {
      notify({ kind: "error", title: "Export failed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setExporting(false);
    }
  };

  const daily = data?.series.slice(-12).reverse() ?? [];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Intelligence</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Analytics</span>
          </nav>
          <p className="eyebrow page-eyebrow">Performance</p>
          <h1 className="page-title">The shape of the business.</h1>
          <p className="page-description">
            Revenue, payment behaviour, category contribution and the pieces carrying the quarter. Export the raw cut whenever you need it.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="outline" icon={<RefreshCw size={14} />} onClick={analytics.reload}>
            Refresh
          </Button>
          <Button variant="primary" icon={<Download size={14} />} loading={exporting} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: 7, label: "7 days" },
            { value: 30, label: "30 days" },
            { value: 90, label: "90 days" },
          ]}
        />
        <select className="select input-sm" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Filter category">
          <option value="">All categories</option>
          {categories.data?.data.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <span className="toolbar-spacer" />
        <span className="hint">
          Compared with the previous {range} days · {data ? `${data.series.length} day series` : "loading"}
        </span>
      </div>

      {analytics.error ? (
        <Card><ErrorState title="Analytics unavailable" body={analytics.error} onRetry={analytics.reload} /></Card>
      ) : analytics.loading || !data ? (
        <div className="stack-18">
          <div className="analytics-stats">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="stat-tile">
                <span className="sk sk-line" style={{ width: 80, height: 9 }} />
                <span className="sk sk-line" style={{ width: 110, height: 24, marginTop: 10 }} />
              </div>
            ))}
          </div>
          <div className="sk sk-block" style={{ height: 340, borderRadius: 18 }} />
        </div>
      ) : (
        <>
          <div className="analytics-stats">
            <div className="stat-tile">
              <span>Revenue</span>
              <strong>{money(data.totals.revenue)}</strong>
              <div className="kpi-meta">
                <StatDelta value={delta(data.totals.revenue, data.previous.revenue)} />
              </div>
              <div style={{ height: 26, marginTop: 6 }}>
                <Sparkline values={data.series.map((point) => point.revenue)} height={26} />
              </div>
            </div>
            <div className="stat-tile">
              <span>Orders</span>
              <strong>{num(data.totals.orders)}</strong>
              <div className="kpi-meta">
                <StatDelta value={delta(data.totals.orders, data.previous.orders)} />
              </div>
              <div style={{ height: 26, marginTop: 6 }}>
                <Sparkline values={data.series.map((point) => point.orders)} tone="gold" height={26} />
              </div>
            </div>
            <div className="stat-tile">
              <span>Average order</span>
              <strong>{money(data.totals.aov)}</strong>
              <div className="kpi-meta">
                <StatDelta value={delta(data.totals.aov, data.previous.aov)} />
              </div>
            </div>
            <div className="stat-tile">
              <span>Units sold</span>
              <strong>{num(data.totals.units)}</strong>
              <div className="kpi-meta">
                <span className="delta-note">across {data.totals.orders} orders</span>
              </div>
            </div>
            <div className="stat-tile">
              <span>New customers</span>
              <strong>{num(data.totals.newCustomers)}</strong>
              <div className="kpi-meta">
                <span className="delta-note">first orders in window</span>
              </div>
            </div>
            <div className="stat-tile">
              <span>Refund value</span>
              <strong>{money(data.totals.refunds)}</strong>
              <div className="kpi-meta">
                <span className="delta-note">cancelled or returned</span>
              </div>
            </div>
          </div>

          <div className="analytics-grid">
            <Card>
              <div className="panel-head">
                <div>
                  <h2>Revenue & order rhythm</h2>
                  <p>Daily gross revenue across the selected window</p>
                </div>
                <SalesLegend />
              </div>
              <AreaChart data={data.series} height={300} />
            </Card>
            <Card>
              <div className="panel-head">
                <div>
                  <h2>Payment mix</h2>
                  <p>Where customers choose to pay</p>
                </div>
                <TrendingUp size={16} style={{ color: "var(--gold)" }} />
              </div>
              <DonutChart
                data={data.paymentMix}
                size={170}
                centerValue={`${data.totals.orders}`}
                centerLabel="Orders"
              />
            </Card>
          </div>

          <div className="analytics-lower">
            <Card>
              <div className="panel-head">
                <div>
                  <h2>Category contribution</h2>
                  <p>Revenue share by shelf</p>
                </div>
                <Badge tone="gold">{data.categoryMix.length} shelves</Badge>
              </div>
              <CategoryBars data={data.categoryMix} />
            </Card>
            <Card className="channel-panel">
              <div className="panel-head">
                <div>
                  <h2>Channel mix</h2>
                  <p>Orders by originating channel</p>
                </div>
              </div>
              <MiniBars data={data.channelMix} />
            </Card>
          </div>

          <Card style={{ marginTop: 14 }}>
            <div className="panel-head">
              <div>
                <h2>Day book</h2>
                <p>The last twelve trading days, newest first</p>
              </div>
              <span className="hint">CSV export includes the full window</span>
            </div>
            <div className="table-wrap">
              <table className="tbl analytics-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Revenue</th>
                    <th>Orders</th>
                    <th>Avg order</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((point: SeriesPoint) => (
                    <tr key={point.date}>
                      <td>
                        <span className="cell-sub">{dateShort(point.date)}</span>
                      </td>
                      <td>
                        <span className="cell-num">{money(point.revenue)}</span>
                      </td>
                      <td>
                        <span className="cell-sub">{point.orders}</span>
                      </td>
                      <td>
                        <span className="cell-sub">{point.orders ? money(point.revenue / point.orders) : "—"}</span>
                      </td>
                      <td>
                        <Sparkline values={data.series.slice(0, data.series.findIndex((entry) => entry.date === point.date) + 1).map((entry) => entry.revenue)} height={22} fill={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SalesLegend() {
  return (
    <div className="sales-legend">
      <span>
        <i style={{ background: "var(--emerald-2)" }} /> Revenue
      </span>
      <span>
        <i style={{ background: "var(--gold)" }} /> Trend
      </span>
    </div>
  );
}
