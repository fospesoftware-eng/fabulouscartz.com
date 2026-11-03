import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Ban, FileCheck2, ShieldCheck, Star, Store } from "lucide-react";
import type { KycDoc, Seller } from "../../shared/marketplace";
import { Drawer, Modal } from "../components/overlay";
import { Badge, Button, EmptyState, ErrorState, SearchInput, TableSkeleton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { marketplace } from "../lib/marketplace";
import { useDebounced, useResource } from "../lib/hooks";
import { dateMedium, foldWords, money, num } from "../lib/utils";

function kycTone(status: Seller["kycStatus"]): "warning" | "positive" | "danger" {
  return status === "pending" ? "warning" : status === "approved" ? "positive" : "danger";
}

function SellerCard({ seller, onOpen }: { seller: Seller; onOpen: () => void }) {
  return (
    <button type="button" className="pipeline-card" onClick={onOpen} aria-label={`Open ${seller.name}`}>
      <div className="pipeline-card-head">
        <span className="seller-avatar" style={{ background: `linear-gradient(135deg, hsl(${seller.hue} 34% 22%), hsl(${seller.hue + 22} 44% 42%))` }}>
          {seller.name.slice(0, 1)}
        </span>
        <div className="pipeline-identity">
          <strong>{seller.name}</strong>
          <span>
            {seller.city}, {seller.state} · {foldWords(seller.storeType)}
          </span>
        </div>
        <Badge tone={seller.status === "suspended" ? "danger" : kycTone(seller.kycStatus)}>
          {foldWords(seller.status === "suspended" ? "suspended" : seller.kycStatus)}
        </Badge>
      </div>
      <div className="pipeline-metrics">
        <span><em>GMV</em>{money(seller.gmv, { compact: true })}</span>
        <span><em>Commission</em>{seller.commissionRate}%</span>
        <span><em>Rating</em><b><Star size={11} /> {seller.rating.toFixed(1)}</b></span>
      </div>
      <div className="pipeline-foot">
        <span>{num(seller.orders)} orders · joined {dateMedium(seller.joinedAt)}</span>
        <ArrowRight size={13} />
      </div>
    </button>
  );
}

function DocRow({ doc }: { doc: KycDoc }) {
  return (
    <div className="kyc-doc">
      <span className={`kyc-doc-icon kyc-${doc.status}`}><FileCheck2 size={15} /></span>
      <div className="kyc-doc-copy">
        <strong>{doc.label}</strong>
        <span>{doc.fileName} · uploaded {dateMedium(doc.uploadedAt)}</span>
      </div>
      <Badge tone={doc.status === "verified" ? "positive" : doc.status === "rejected" ? "danger" : "warning"}>{foldWords(doc.status)}</Badge>
    </div>
  );
}

export function SellersPage() {
  const { user } = useAuth();
  const { notify } = useUI();
  const canMoney = user?.role !== "fulfilment";
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 280);
  const [selected, setSelected] = useState<Seller | null>(null);
  const [reason, setReason] = useState("");
  const [commission, setCommission] = useState(0);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useResource(() => marketplace.sellers({ pageSize: 100 }), []);
  const workspace = useResource(() => marketplace.seller(selected?.id ?? ""), [selected?.id], { enabled: Boolean(selected) });

  const open = (seller: Seller) => {
    setSelected(seller);
    setReason("");
    setCommission(seller.commissionRate);
    setSuspendReason("");
  };

  const review = async (decision: "approve" | "reject") => {
    if (!selected) return;
    if (decision === "reject" && reason.trim().length < 4) {
      notify({ kind: "error", title: "Add a rejection reason", description: "A short reason is required so the seller can fix their documents." });
      return;
    }
    setBusy(true);
    try {
      const updated = await marketplace.reviewSeller(selected.id, decision, decision === "reject" ? reason : undefined);
      setSelected(updated);
      workspace.reload();
      list.reload();
      notify({ kind: "success", title: `KYC ${decision === "approve" ? "approved" : "rejected"}`, description: `${updated.name} moved to the ${updated.kycStatus} pipeline.` });
    } catch (cause) {
      notify({ kind: "error", title: "Review not saved", description: cause instanceof Error ? cause.message : "The API rejected the review." });
    } finally {
      setBusy(false);
    }
  };

  const saveCommission = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await marketplace.setCommission(selected.id, commission);
      setSelected(updated);
      list.reload();
      notify({ kind: "success", title: "Commission updated", description: `${updated.name} now pays ${updated.commissionRate}%.` });
    } catch (cause) {
      notify({ kind: "error", title: "Commission not saved", description: cause instanceof Error ? cause.message : "Only admins and managers can change commission." });
    } finally {
      setBusy(false);
    }
  };

  const suspend = async () => {
    if (!selected || suspendReason.trim().length < 4) return;
    setBusy(true);
    try {
      const updated = await marketplace.suspendSeller(selected.id, suspendReason);
      setSelected(updated);
      setSuspendOpen(false);
      list.reload();
      notify({ kind: "success", title: updated.status === "suspended" ? "Seller suspended" : "Seller reactivated", description: `${updated.name} · ${suspendReason}` });
    } catch (cause) {
      notify({ kind: "error", title: "Status not changed", description: cause instanceof Error ? cause.message : "Only admins and managers can suspend sellers." });
    } finally {
      setBusy(false);
    }
  };

  if (list.error) return <ErrorState title="The seller pipeline is offline" body={list.error} onRetry={list.reload} />;

  const sellers = list.data?.data ?? [];
  const query = debounced.toLowerCase();
  const filtered = sellers.filter((seller) => !query || [seller.name, seller.city, seller.ownerName].join(" ").toLowerCase().includes(query));
  const pending = filtered.filter((seller) => seller.kycStatus === "pending");
  const approved = filtered.filter((seller) => seller.kycStatus === "approved" && seller.status === "active");
  const suspended = filtered.filter((seller) => seller.status === "suspended" || seller.kycStatus === "rejected");

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Marketplace</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Sellers</span>
          </nav>
          <p className="eyebrow page-eyebrow">Marketplace partners</p>
          <h1 className="page-title">Stores worth trusting.</h1>
          <p className="page-description">
            Vet the storefront, review KYC documents and keep commission honest. Every decision lands in the audit trail.
          </p>
        </div>
        <div className="page-actions">
          <SearchInput value={q} onChange={setQ} placeholder="Search store, owner or city…" />
          <Link to="/payouts" className="inline-link">Payouts <ArrowRight size={12} /></Link>
        </div>
      </div>

      {list.loading ? (
        <div className="pipeline-board sk-board"><TableSkeleton rows={4} /></div>
      ) : (
        <div className="pipeline-board">
          {[
            { key: "pending", label: "Awaiting KYC", items: pending, note: `${pending.length} applications in review` },
            { key: "approved", label: "Approved", items: approved, note: `${approved.length} stores trading` },
            { key: "suspended", label: "Suspended / rejected", items: suspended, note: `${suspended.length} need resolution` },
          ].map((column) => (
            <section key={column.key} className="pipeline-column" aria-label={column.label}>
              <header className="pipeline-column-head">
                <div>
                  <h2>{column.label}</h2>
                  <p>{column.note}</p>
                </div>
                <span className="pipeline-count">{column.items.length}</span>
              </header>
              <div className="pipeline-list">
                {column.items.length ? (
                  column.items.map((seller) => <SellerCard key={seller.id} seller={seller} onOpen={() => open(seller)} />)
                ) : (
                  <div className="pipeline-empty"><Store size={18} /><span>Nothing in this lane.</span></div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        width={640}
        eyebrow="Seller workspace"
        title={selected?.name ?? "Seller"}
        subtitle={selected ? `${selected.ownerName} · ${selected.city}, ${selected.state} · joined ${dateMedium(selected.joinedAt)}` : undefined}
        actions={selected ? <Badge tone={selected.status === "suspended" ? "danger" : kycTone(selected.kycStatus)}>{foldWords(selected.status === "suspended" ? "suspended" : selected.kycStatus)}</Badge> : null}
        footer={
          selected ? (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
              <Button variant={selected.status === "suspended" ? "outline" : "danger"} disabled={!canMoney} title={canMoney ? undefined : "Fulfilment cannot change seller status"} onClick={() => setSuspendOpen(true)}>
                {selected.status === "suspended" ? <BadgeCheck size={14} /> : <Ban size={14} />} {selected.status === "suspended" ? "Reactivate seller" : "Suspend seller"}
              </Button>
            </>
          ) : null
        }
      >
        {workspace.loading ? <TableSkeleton rows={6} /> : workspace.data ? (
          <div className="stack-18">
            <div className="workspace-stats">
              <div><span>Lifetime GMV</span><strong>{money(workspace.data.seller.gmv, { compact: true })}</strong></div>
              <div><span>Orders</span><strong>{num(workspace.data.seller.orders)}</strong></div>
              <div><span>Rating</span><strong>{workspace.data.seller.rating.toFixed(1)} <Star size={12} /></strong></div>
              <div><span>Commission</span><strong>{workspace.data.seller.commissionRate}%</strong></div>
            </div>

            <section className="panel-block">
              <div className="panel-block-head">
                <div>
                  <h3><ShieldCheck size={15} /> KYC documents</h3>
                  <p>Review each document before approving the store.</p>
                </div>
                <Badge tone={kycTone(workspace.data.seller.kycStatus)}>{foldWords(workspace.data.seller.kycStatus)}</Badge>
              </div>
              <div className="kyc-doc-list">
                {workspace.data.seller.kycDocs.map((doc) => <DocRow key={doc.id} doc={doc} />)}
              </div>
              {workspace.data.seller.kycStatus === "pending" ? (
                <div className="kyc-review">
                  <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required to reject)" aria-label="KYC review reason" />
                  <div className="row">
                    <Button variant="primary" loading={busy} onClick={() => void review("approve")}><BadgeCheck size={14} /> Approve KYC</Button>
                    <Button variant="outline" loading={busy} onClick={() => void review("reject")}>Reject</Button>
                  </div>
                </div>
              ) : workspace.data.seller.rejectionReason ? (
                <p className="form-error">Rejected: {workspace.data.seller.rejectionReason}</p>
              ) : null}
            </section>

            <section className="panel-block">
              <div className="panel-block-head">
                <div>
                  <h3>Commission editor</h3>
                  <p>Applies to every marketplace order from this store.</p>
                </div>
              </div>
              <div className="commission-editor">
                <div className="input-group">
                  <input className="input" type="number" min={0} max={40} step={0.5} value={commission} onChange={(event) => setCommission(Number(event.target.value))} disabled={!canMoney} aria-label="Commission rate" />
                  <span className="input-suffix">%</span>
                </div>
                <Button variant="gold" loading={busy} disabled={!canMoney} title={canMoney ? undefined : "Fulfilment cannot change commission"} onClick={() => void saveCommission()}>Save rate</Button>
              </div>
              {!canMoney ? <p className="hint">Fulfilment can review rentals and bookings, but money terms are admin/manager only.</p> : null}
            </section>

            <section className="panel-block">
              <div className="panel-block-head">
                <div><h3>Listings</h3><p>{workspace.data.listings.length} rental listings owned by this store.</p></div>
                <Link to="/listings" className="inline-link">Moderation <ArrowRight size={12} /></Link>
              </div>
              {workspace.data.listings.length ? (
                <div className="mini-table">
                  <div className="mini-table-head"><span>Listing</span><span>Status</span><span>Rate</span><span>Deposit</span></div>
                  {workspace.data.listings.map((listing) => (
                    <div key={listing.id} className="mini-table-row">
                      <span className="cell-title">{listing.title}<em className="cell-sub">{listing.category} · {listing.city}</em></span>
                      <span><Badge tone={listing.status === "approved" ? "positive" : listing.status === "pending" ? "warning" : "danger"}>{foldWords(listing.status)}</Badge></span>
                      <span className="mono">{money(listing.dailyRate)}/day</span>
                      <span className="mono">{money(listing.deposit)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="hint">This seller has no rental listings yet.</p>}
            </section>

            <section className="panel-block">
              <div className="panel-block-head"><div><h3>Payout history</h3><p>Gross, commission, refunds and net per period.</p></div></div>
              {workspace.data.payouts.length ? (
                <div className="mini-table">
                  <div className="mini-table-head"><span>Period</span><span>Gross</span><span>Net</span><span>Status</span></div>
                  {workspace.data.payouts.map((payout) => (
                    <div key={payout.id} className="mini-table-row">
                      <span className="mono">{payout.period}</span>
                      <span className="mono">{money(payout.gross)}</span>
                      <span className="mono">{money(payout.net)}</span>
                      <span><Badge tone={payout.status === "paid" ? "positive" : payout.status === "failed" ? "danger" : "gold"}>{payout.status}</Badge></span>
                    </div>
                  ))}
                </div>
              ) : <p className="hint">No payouts have been scheduled yet.</p>}
            </section>
          </div>
        ) : <EmptyState title="Seller not loaded" body="Try closing and reopening the workspace." />}
      </Drawer>

      <Modal
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title={selected?.status === "suspended" ? "Reactivate this seller?" : "Suspend this seller?"}
        description={selected?.status === "suspended" ? "The store returns to the approved pipeline and can trade again." : "Listings stop accepting new bookings immediately. Existing rentals continue."}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} disabled={suspendReason.trim().length < 4} onClick={() => void suspend()}>Confirm</Button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">Reason</span>
          <textarea className="textarea" value={suspendReason} onChange={(event) => setSuspendReason(event.target.value)} placeholder="Explain the decision for the audit trail…" />
        </label>
      </Modal>
    </div>
  );
}
