import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Mail, MapPin, Pencil, Plus, Star, Store, Trash2 } from "lucide-react";
import type { Vendor } from "../../shared/types";
import { ConfirmDialog, Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Toggle } from "../components/ui";
import { useUI } from "../context/UIContext";
import { api } from "../lib/api";
import { resources } from "../lib/normalize";
import { useResource } from "../lib/hooks";
import { money } from "../lib/utils";

type VendorRow = Vendor & { productCount: number; revenue: number };

interface Draft {
  name: string;
  email: string;
  location: string;
  description: string;
  rating: number;
  active: boolean;
}

const EMPTY: Draft = { name: "", email: "", location: "", description: "", rating: 4.5, active: true };

export function VendorsPage() {
  const { notify } = useUI();
  const vendors = useResource<{ data: VendorRow[] }>(() => resources.vendors() as unknown as Promise<{ data: VendorRow[] }>, []);
  const [editing, setEditing] = useState<VendorRow | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<VendorRow | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => (vendors.data?.data ?? []).slice().sort((a, b) => a.order - b.order), [vendors.data]);

  const openNew = () => {
    setDraft(EMPTY);
    setError(null);
    setEditing("new");
  };

  const openEdit = (vendor: VendorRow) => {
    setDraft({
      name: vendor.name,
      email: vendor.email,
      location: vendor.location,
      description: vendor.description,
      rating: vendor.rating,
      active: vendor.active,
    });
    setError(null);
    setEditing(vendor);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      if (editing === "new") {
        await api.post("/vendors", draft);
        notify({ kind: "success", title: "Studio partner added", description: `${draft.name} can now be linked to products.` });
      } else {
        await api.patch(`/vendors/${editing.id}`, draft);
        notify({ kind: "success", title: "Studio partner updated", description: draft.name });
      }
      setEditing(null);
      vendors.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the vendor.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (vendor: VendorRow) => {
    try {
      const updated = await api.patch<VendorRow>(`/vendors/${vendor.id}`, { active: !vendor.active });
      vendors.setData((current) => (current ? { ...current, data: current.data.map((row) => (row.id === updated.id ? updated : row)) } : current));
      notify({ kind: "success", title: updated.active ? "Vendor active" : "Vendor paused", description: vendor.name });
    } catch (cause) {
      notify({ kind: "error", title: "Vendor not updated", description: cause instanceof Error ? cause.message : "Try again." });
    }
  };

  const move = async (vendor: VendorRow, direction: "up" | "down") => {
    try {
      await api.post(`/vendors/${vendor.id}/move`, { direction });
      vendors.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Could not reorder", description: cause instanceof Error ? cause.message : "Try again." });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/vendors/${deleting.id}`);
      notify({ kind: "success", title: "Vendor removed", description: deleting.name });
      setDeleting(null);
      vendors.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Vendor not removed", description: cause instanceof Error ? cause.message : "Products may still be linked." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Catalogue</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Vendors</span>
          </nav>
          <p className="eyebrow page-eyebrow">Studio partners</p>
          <h1 className="page-title">The makers behind the label.</h1>
          <p className="page-description">
            Eleven small studios and artisan families. Track revenue, keep contact details close and pause a partner without hiding their pieces.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<Store size={14} />} onClick={openNew}>
            New vendor
          </Button>
        </div>
      </div>

      {vendors.error ? (
        <Card><ErrorState title="Vendor book unavailable" body={vendors.error} onRetry={vendors.reload} /></Card>
      ) : (
        <Card>
          <div className="section-heading">
            <div>
              <h2>{sorted.length} partners</h2>
              <p>Ordering mirrors the storefront's “Meet the makers” rail.</p>
            </div>
            <Badge tone="gold">{sorted.filter((vendor) => vendor.active).length} active</Badge>
          </div>
          {vendors.loading ? (
            <div className="stack-18">
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className="sk sk-line" style={{ height: 64, borderRadius: 12 }} />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState icon={<Store size={22} />} title="No studio partners" body="Add the first maker to the vendor book." action={<Button variant="primary" size="sm" onClick={openNew}>New vendor</Button>} />
          ) : (
            <div className="catalogue-list">
              {sorted.map((vendor, index) => (
                <div key={vendor.id} className="catalogue-row">
                  <span className="cat-thumb-letter">{vendor.name.slice(0, 1)}</span>
                  <div className="cat-copy">
                    <strong>
                      {vendor.name}
                      {vendor.active ? <Badge tone="positive">Active</Badge> : <Badge tone="neutral">Paused</Badge>}
                      <span className="vendor-rating">
                        <Star /> {vendor.rating.toFixed(1)}
                      </span>
                    </strong>
                    <span>
                      <Mail size={9} style={{ marginRight: 4 }} /> {vendor.email} · <MapPin size={9} style={{ marginRight: 2 }} /> {vendor.location}
                    </span>
                    <span className="cat-slug">/{vendor.slug}</span>
                  </div>
                  <div className="cat-meta">
                    <span>
                      <b>{vendor.productCount}</b> pieces
                    </span>
                    <span>
                      <b>{money(vendor.revenue, { compact: true })}</b> revenue
                    </span>
                    <span>
                      <b>{vendor.sales}</b> sales
                    </span>
                  </div>
                  <div className="row-controls">
                    <div className="order-buttons">
                      <IconButton label={`Move ${vendor.name} up`} size="sm" disabled={index === 0} onClick={() => void move(vendor, "up")}>
                        <ChevronUp size={12} />
                      </IconButton>
                      <IconButton label={`Move ${vendor.name} down`} size="sm" disabled={index === sorted.length - 1} onClick={() => void move(vendor, "down")}>
                        <ChevronDown size={12} />
                      </IconButton>
                    </div>
                    <Toggle checked={vendor.active} onChange={() => void toggleActive(vendor)} label={`${vendor.name} active`} />
                    <IconButton label={`Edit ${vendor.name}`} size="sm" onClick={() => openEdit(vendor)}>
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton label={`Remove ${vendor.name}`} size="sm" tone="danger" onClick={() => setDeleting(vendor)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New studio partner" : "Edit studio partner"}
        description="Contact details, rating and storefront visibility."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} icon={<Plus size={14} />} onClick={() => void save()}>
              {editing === "new" ? "Add vendor" : "Save vendor"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Studio name" required>
            <input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Viya Crafts" />
          </Field>
          <Field label="Location">
            <input className="input" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Jaipur, India" />
          </Field>
          <Field label="Contact email" className="span-2">
            <input className="input" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="studio@example.com" />
          </Field>
          <Field label="Story" className="span-2">
            <textarea className="textarea" rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
          <Field label="Rating" hint="0–5, shown on the maker card.">
            <input className="input" type="number" min={0} max={5} step={0.1} value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) })} />
          </Field>
          <div className="flag-row" style={{ alignSelf: "end" }}>
            <div>
              <strong>Storefront visibility</strong>
              <span>Paused makers stay linked to their pieces.</span>
            </div>
            <Toggle checked={draft.active} onChange={(value) => setDraft({ ...draft, active: value })} label="Vendor active" />
          </div>
        </div>
        {error ? <p className="form-error" style={{ marginTop: 10 }}>{error}</p> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title={`Remove ${deleting?.name ?? "vendor"}?`}
        body="Only vendors with no linked products can be removed."
        confirmLabel="Remove vendor"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
