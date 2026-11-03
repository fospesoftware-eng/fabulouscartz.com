import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import { Sparkline } from "./charts";
import { Card } from "./ui";
import { marketplace } from "../lib/marketplace";
import { useResource } from "../lib/hooks";
import { money, num } from "../lib/utils";

export function RentalPulse({ range }: { range: number }) {
  const analytics = useResource(() => marketplace.analytics(range), [range]);
  const data = analytics.data;

  return (
    <section className="rental-pulse" aria-label="Rental operations">
      <Card className="rental-tile" data-accent="emerald">
        <span className="kpi-label">Rental revenue · {range}d</span>
        <strong>{data ? money(data.rentalRevenue, { compact: true }) : "—"}</strong>
        <em>{data ? `${num(data.activeBookings)} bookings contributing` : "Loading the rental book"}</em>
        <div className="rental-spark">
          <Sparkline values={(data?.revenueSeries ?? []).map((point) => point.value)} tone="emerald" height={28} />
        </div>
      </Card>
      <Card className="rental-tile" data-accent="gold">
        <span className="kpi-label">Deposit funds held</span>
        <strong>{data ? money(data.depositsHeld, { compact: true }) : "—"}</strong>
        <em>{data ? `${num(data.overdueCount)} overdue · ${money(data.gmvSellers, { compact: true })} seller GMV` : "Nobody has overrun yet"}</em>
        <div className="rental-spark">
          <Sparkline values={[38, 44, 41, 49, 53, 57, 61, 64]} tone="gold" height={28} />
        </div>
      </Card>
      <Card className="rental-tile" data-accent="rose">
        <span className="kpi-label">Overdue</span>
        <strong>{data ? num(data.overdueCount) : "—"}</strong>
        <em>Return window breached</em>
        <div className="rental-spark">
          <Sparkline values={[2, 1, 0, 2, 3, 2, 4, data?.overdueCount ?? 0]} tone="rose" height={28} />
        </div>
      </Card>
      <Card className="rental-tile" data-accent="slate">
        <span className="kpi-label">Utilization</span>
        <strong>{data ? `${Math.round(data.utilization)}%` : "—"}</strong>
        <em>Live listings in rotation</em>
        <div className="rental-spark">
          <Sparkline values={[41, 44, 47, 51, 55, 58, 62, data?.utilization ?? 0]} tone="emerald" height={28} />
        </div>
      </Card>
      <Card className="rental-tile" data-accent="emerald">
        <span className="kpi-label">Active rentals</span>
        <strong>{data ? num(data.activeBookings) : "—"}</strong>
        <em>Dispatched, in use or return due</em>
        <div className="rental-spark">
          <Sparkline values={[4, 6, 5, 7, 9, 8, 10, data?.activeBookings ?? 0]} tone="emerald" height={28} />
        </div>
      </Card>
      <Card className="rental-tile" data-accent="gold">
        <span className="kpi-label">Seller GMV</span>
        <strong>{data ? money(data.gmvSellers, { compact: true }) : "—"}</strong>
        <em>{data ? `${num(data.pendingKyc)} KYC reviews waiting` : "Lifetime across approved sellers"}</em>
        <div className="rental-spark">
          <Sparkline values={[120, 134, 141, 155, 166, 177, 184, data?.gmvSellers ? data.gmvSellers / 3 : 0]} tone="gold" height={28} />
        </div>
      </Card>
    </section>
  );
}

type FeedItem = {
  key: string;
  tone: "danger" | "gold" | "emerald" | "slate";
  text: string;
  go: () => void;
};

/* Compact live feed: one KPI-tile height, a single marquee line of
   clickable attention items. Pauses on hover, has a keyboard toggle and
   starts paused when the operator prefers reduced motion. */
export function AttentionFeed({ lowStockCount }: { lowStockCount: number }) {
  const navigate = useNavigate();
  const overdue = useResource(() => marketplace.overdue(), []);
  const sellers = useResource(() => marketplace.sellers({ kycStatus: "pending", pageSize: 5 }), []);
  const listings = useResource(() => marketplace.listings({ status: "pending" }), []);
  const payouts = useResource(() => marketplace.payouts({ status: "due" }), []);

  const [paused, setPaused] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [hovered, setHovered] = useState(false);
  const still = paused || hovered;

  const items: FeedItem[] = [];

  (overdue.data?.data ?? []).slice(0, 2).forEach((row) => {
    items.push({
      key: `overdue-${row.booking.id}`,
      tone: "danger",
      text: `${row.booking.number} overdue · ${row.daysLate} days late · ${money(row.accruedLateFee, { compact: true })} fee`,
      go: () => navigate(`/bookings?booking=${row.booking.id}`),
    });
  });

  (sellers.data?.data ?? []).slice(0, 2).forEach((seller) => {
    items.push({
      key: `kyc-${seller.id}`,
      tone: "gold",
      text: `Seller “${seller.name}” KYC pending · ${seller.city}, ${seller.state}`,
      go: () => navigate("/sellers"),
    });
  });

  (listings.data?.data ?? []).slice(0, 2).forEach((listing) => {
    items.push({
      key: `listing-${listing.id}`,
      tone: "emerald",
      text: `“${listing.title}” awaiting moderation · ${listing.sellerName}`,
      go: () => navigate("/listings"),
    });
  });

  const duePayouts = payouts.data?.data.length ?? 0;
  if (duePayouts > 0) {
    items.push({
      key: "payouts-due",
      tone: "gold",
      text: `${duePayouts} payouts due · ${money(payouts.data?.summary.due ?? 0, { compact: true })} unsettled`,
      go: () => navigate("/payouts"),
    });
  }

  if (lowStockCount > 0) {
    items.push({
      key: "low-stock",
      tone: "slate",
      text: `${lowStockCount} SKUs low stock · reorder before the weekend`,
      go: () => navigate("/inventory?status=low"),
    });
  }

  const total =
    (overdue.data?.data.length ?? 0) +
    (sellers.data?.facets.pending ?? 0) +
    (listings.data?.facets.pending ?? 0) +
    duePayouts +
    lowStockCount;

  return (
    <Card className="attention-feed">
      <div className="attention-feed-head">
        <span className="attention-feed-label">
          <span className="live-dot" aria-hidden="true" />
          Needs attention
          <span className="attention-count" aria-label={`${total} open items`}>
            {total}
          </span>
        </span>
        <button
          type="button"
          className="attention-toggle"
          onClick={() => setPaused((current) => !current)}
          aria-pressed={paused}
          aria-label={paused ? "Play needs-attention feed" : "Pause needs-attention feed"}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          <span>{paused ? "Play" : "Pause"}</span>
        </button>
      </div>

      <div
        className="attention-feed-window"
        data-paused={still ? "true" : "false"}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {items.length ? (
          <div className="attention-track">
            {[0, 1].map((run) => (
              <div className="attention-run" key={run} aria-hidden={run === 1 ? true : undefined}>
                {items.map((item) => (
                  <Fragment key={`${item.key}-${run}`}>
                    <button
                      type="button"
                      className={`attention-feed-item is-${item.tone}`}
                      onClick={item.go}
                      tabIndex={run === 1 ? -1 : 0}
                      title={item.text}
                    >
                      <span className="attention-feed-dot" aria-hidden="true" />
                      <span className="attention-feed-text">{item.text}</span>
                    </button>
                    <span className="attention-sep" aria-hidden="true" />
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="attention-feed-idle">All clear — no overdue returns, KYC reviews or payouts waiting.</p>
        )}
      </div>
    </Card>
  );
}
