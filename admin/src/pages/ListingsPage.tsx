import { useState } from "react";
import { ArrowRight, Check, Eye, PauseCircle, ShieldAlert } from "lucide-react";
import type { RentalListing } from "../../shared/marketplace";
import { Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, Segmented } from "../components/ui";
import { useUI } from "../context/UIContext";
import { marketplace } from "../lib/marketplace";
import { useResource } from "../lib/hooks";
import { dateMedium, foldWords, money } from "../lib/utils";

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Live" },
  { value: "paused", label: "Paused" },
  { value: "suspended", label: "Suspended" },
];

export function ListingsPage() {
  const { notify } = useUI();
  const [status, setStatus] = useState("");
  const [city, setCity] = useState("");
  const [ownerType, setOwnerType] = useState("");
  const [target, setTarget] = useState<RentalListing | null>(null);
  const [action, setAction] = useState<"approve" | "pause" | "suspend">("approve");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const listings = useResource(() => marketplace.listings({ status, city, ownerType }), [status, city, ownerType]);

  const openAction = (listing: RentalListing, next: "approve" | "pause" | "suspend") => {
    setTarget(listing);
    setAction(next);
    setReason("");
  };

  const apply = async () => {
    if (!target) return;
    if (action !== "approve" && reason.trim().length < 4) {
      notify({ kind: "error", title: "Add a reason", description: "Pausing or suspending needs a moderation reason." });
      return;
    }
    setBusy(true);
    try {
      const updated = await marketplace.moderateListing(target.id, action, action === "approve" ? undefined : reason);
      listings.setData((current) => (current ? { ...current, data: current.data.map((row) => (row.id === updated.id ? updated : row)) } : current));
      notify({ kind: "success", title: `Listing ${foldWords(updated.status)}`, description: `${updated.title} · ${action === "approve" ? "visible to renters" : reason}` });
      setTarget(null);
      listings.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Moderation not saved", description: cause instanceof Error ? cause.message : "The API rejected the change." });
    } finally {
      setBusy(false);
    }
  };

  if (listings.error) return <ErrorState title="Listings are offline" body={listings.error} onRetry={listings.reload} />;

  const data = listings.data?.data ?? [];
  const facets = listings.data?.facets;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Marketplace</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Rental listings</span>
          </nav>
          <p className="eyebrow page-eyebrow">Moderation</p>
          <h1 className="page-title">What renters are allowed to see.</h1>
          <p className="page-description">
            Approve condition-graded occasion wear, pause a listing while it is cleaned, or suspend one that no longer meets the replacement-value evidence.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <Segmented value={status} onChange={setStatus} options={FILTERS} />
        <select className="select input-sm" value={city} onChange={(event) => setCity(event.target.value)} aria-label="Filter city">
          <option value="">All cities</option>
          {(listings.data?.cities ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select className="select input-sm" value={ownerType} onChange={(event) => setOwnerType(event.target.value)} aria-label="Filter owner">
          <option value="">All owners</option>
          <option value="peer">Peer-to-peer</option>
          <option value="platform">Platform studio</option>
        </select>
        <span className="toolbar-spacer" />
        <span className="hint">{facets ? `${facets.pending} pending · ${facets.approved} live` : ""}</span>
      </div>

      {listings.loading ? (
        <div className="listing-grid">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="sk sk-block" style={{ height: 330, borderRadius: 20 }} />)}
        </div>
      ) : data.length ? (
        <div className="listing-grid">
          {data.map((listing) => (
            <Card key={listing.id} className="listing-card">
              <div className="listing-media">
                <img src={listing.image} alt={listing.title} loading="lazy" />
                <span className="listing-grade">Grade {listing.conditionGrade}</span>
                <span className="listing-owner">{listing.ownerType === "platform" ? "Platform" : "Peer"}</span>
              </div>
              <div className="listing-body">
                <div className="listing-head">
                  <div>
                    <h3>{listing.title}</h3>
                    <p>{listing.sellerName} · {listing.city}, {listing.state}</p>
                  </div>
                  <Badge tone={listing.status === "approved" ? "positive" : listing.status === "pending" ? "warning" : "danger"}>{foldWords(listing.status)}</Badge>
                </div>
                <div className="listing-facts">
                  <span><em>Rate</em>{money(listing.dailyRate)}<small>/day</small></span>
                  <span><em>Deposit</em>{money(listing.deposit)}</span>
                  <span><em>Replacement</em>{money(listing.replacementValue)}</span>
                  <span><em>Rented</em>{listing.timesRented}×</span>
                </div>
                {listing.moderationReason ? <p className="listing-reason">Flagged: {listing.moderationReason}</p> : null}
                <div className="listing-actions">
                  {listing.status !== "approved" ? <Button size="sm" variant="primary" onClick={() => openAction(listing, "approve")}><Check size={13} /> Approve</Button> : null}
                  {listing.status === "approved" ? <Button size="sm" variant="outline" onClick={() => openAction(listing, "pause")}><PauseCircle size={13} /> Pause</Button> : null}
                  {listing.status !== "suspended" ? <Button size="sm" variant="ghost" onClick={() => openAction(listing, "suspend")}><ShieldAlert size={13} /> Suspend</Button> : null}
                  <span className="listing-date"><Eye size={12} /> {dateMedium(listing.submittedAt)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : <Card><EmptyState title="No listings match" body="Clear the city, owner or status filter to see the queue." /></Card>}

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={target ? `${foldWords(action)} · ${target.title}` : "Moderate listing"}
        description={target ? `${target.sellerName} · replacement value ${money(target.replacementValue)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant={action === "approve" ? "primary" : "danger"} loading={busy} onClick={() => void apply()}>
              {action === "approve" ? "Approve listing" : "Confirm"}
            </Button>
          </>
        }
      >
        {action !== "approve" ? (
          <label className="field">
            <span className="field-label">Moderation reason</span>
            <textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Visible in the audit log and on the listing card…" />
          </label>
        ) : (
          <p className="confirm-copy">The listing becomes visible to renters immediately and starts accepting bookings.</p>
        )}
      </Modal>
    </div>
  );
}
