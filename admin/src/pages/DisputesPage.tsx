import { useState } from "react";
import { ArrowRight, Gavel, Lock } from "lucide-react";
import type { Dispute } from "../../shared/marketplace";
import { Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, Segmented, TableSkeleton } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { marketplace } from "../lib/marketplace";
import { useResource } from "../lib/hooks";
import { dateMedium, foldWords, money } from "../lib/utils";

const OUTCOMES = [
  { value: "renter_pays", label: "Renter pays", hint: "Deposit retained in full or to the claim amount." },
  { value: "split", label: "Split", hint: "Claim split between renter and owner." },
  { value: "owner_pays", label: "Owner pays", hint: "Owner absorbs the loss; deposit released." },
  { value: "refunded", label: "Refunded", hint: "Full deposit returns to the renter." },
] as const;

export function DisputesPage() {
  const { user } = useAuth();
  const { notify } = useUI();
  const canMoney = user?.role !== "fulfilment";
  const [status, setStatus] = useState("open");
  const [target, setTarget] = useState<Dispute | null>(null);
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]["value"]>("renter_pays");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const disputes = useResource(() => marketplace.disputes(status || undefined), [status]);

  const openResolve = (dispute: Dispute) => {
    setTarget(dispute);
    setOutcome("renter_pays");
    setAmount(0);
    setNote("");
  };

  const resolve = async () => {
    if (!target || note.trim().length < 6) return;
    setBusy(true);
    try {
      await marketplace.resolveDispute(target.id, outcome, amount, note);
      disputes.reload();
      notify({ kind: "success", title: "Dispute resolved", description: `${target.number} · ${foldWords(outcome)} · ${money(amount)}` });
      setTarget(null);
    } catch (cause) {
      notify({ kind: "error", title: "Resolution not saved", description: cause instanceof Error ? cause.message : "Only admins and managers can resolve disputes." });
    } finally {
      setBusy(false);
    }
  };

  if (disputes.error) return <ErrorState title="Disputes are offline" body={disputes.error} onRetry={disputes.reload} />;

  const rows = disputes.data?.data ?? [];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Rentals</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Disputes</span>
          </nav>
          <p className="eyebrow page-eyebrow">Claims desk</p>
          <h1 className="page-title">Decisions with evidence.</h1>
          <p className="page-description">
            Photographic evidence, a money outcome and a written decision note. Resolving a dispute closes its booking.
          </p>
        </div>
        <div className="page-actions">
          <Segmented value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "", label: "All" }]} />
        </div>
      </div>

      {!canMoney ? <div className="restricted-banner"><Lock size={14} /> Fulfilment can review evidence but cannot decide money outcomes.</div> : null}

      {disputes.loading ? <TableSkeleton rows={4} /> : rows.length ? (
        <div className="dispute-grid">
          {rows.map((dispute) => (
            <Card key={dispute.id} className="dispute-card">
              <div className="dispute-head">
                <div>
                  <span className="eyebrow">{dispute.number} · opened {dateMedium(dispute.openedAt)}</span>
                  <h3>{dispute.listingTitle}</h3>
                  <p>{dispute.renterName} vs {dispute.ownerName}</p>
                </div>
                <Badge tone={dispute.status === "open" ? "danger" : "positive"}>{dispute.status}</Badge>
              </div>
              <p className="dispute-reason">{dispute.reason}</p>
              <div className="dispute-evidence">
                {dispute.evidence.map((image, index) => (
                  <button key={`${dispute.id}-${index}`} type="button" className="evidence-thumb" onClick={() => notify({ kind: "info", title: "Evidence photo", description: `Claim ${dispute.number} · photo ${index + 1} of ${dispute.evidence.length}` })}>
                    <img src={image} alt={`Evidence ${index + 1}`} loading="lazy" />
                  </button>
                ))}
                <span className="hint">{dispute.evidence.length} photos</span>
              </div>
              {dispute.status === "resolved" ? (
                <div className="dispute-outcome">
                  <span className="mono">{foldWords(dispute.outcome ?? "resolved")} · {money(dispute.amount ?? 0)}</span>
                  <p>{dispute.note}</p>
                </div>
              ) : (
                <div className="dispute-actions">
                  <Button size="sm" variant="primary" disabled={!canMoney} title={canMoney ? undefined : "Fulfilment cannot decide money outcomes"} onClick={() => openResolve(dispute)}>
                    <Gavel size={13} /> Resolve claim
                  </Button>
                  <span className="hint">Booking {dispute.number} closes after resolution.</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : <Card><EmptyState title="No disputes here" body="Switch the filter or return to the overdue queue to raise one." /></Card>}

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="Resolve dispute"
        description={target ? `${target.number} · ${target.listingTitle}` : undefined}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={note.trim().length < 6} onClick={() => void resolve()}>
              <Gavel size={14} /> Record decision
            </Button>
          </>
        }
      >
        <div className="stack-18">
          <div className="outcome-grid">
            {OUTCOMES.map((option) => (
              <button key={option.value} type="button" className={`outcome-option ${outcome === option.value ? "is-selected" : ""}`} onClick={() => setOutcome(option.value)} aria-pressed={outcome === option.value}>
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </button>
            ))}
          </div>
          <div className="inline-fields">
            <label className="field">
              <span className="field-label">Amount</span>
              <div className="input-group">
                <input className="input" type="number" min={0} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
                <span className="input-suffix">USD</span>
              </div>
            </label>
            <div className="field">
              <span className="field-label">Evidence</span>
              <div className="dispute-evidence compact">
                {target?.evidence.map((image, index) => <img key={index} src={image} alt="" />)}
              </div>
            </div>
          </div>
          <label className="field">
            <span className="field-label">Decision note</span>
            <textarea className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was decided, why, and what the renter/owner were told…" />
            <span className="field-hint">Minimum 6 characters. Written to the booking timeline and audit log.</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
