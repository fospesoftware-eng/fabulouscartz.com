import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Eye, EyeOff, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import type { Category, Paginated, Product } from "../../shared/types";
import { ConfirmDialog, Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Toggle } from "../components/ui";
import { useUI } from "../context/UIContext";
import { api } from "../lib/api";
import { useResource } from "../lib/hooks";
import { cn } from "../lib/utils";

interface Draft {
  name: string;
  tagline: string;
  description: string;
  image: string;
  accent: string;
  visible: boolean;
}

const EMPTY: Draft = { name: "", tagline: "", description: "", image: "", accent: "#1B6B43", visible: true };

export function CategoriesPage() {
  const { notify } = useUI();
  const categories = useResource<{ data: Category[] }>(() => api.get<{ data: Category[] }>("/categories"), []);
  const products = useResource<Paginated<Product>>(() => api.get<Paginated<Product>>("/products?pageSize=100"), []);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const product of products.data?.data ?? []) {
      map[product.categoryId] = (map[product.categoryId] ?? 0) + 1;
    }
    return map;
  }, [products.data]);

  const sorted = useMemo(() => {
    const rows = categories.data?.data ?? [];
    return rows.slice().sort((a, b) => a.order - b.order);
  }, [categories.data]);

  const openNew = () => {
    setDraft(EMPTY);
    setError(null);
    setEditing("new");
  };

  const openEdit = (category: Category) => {
    setDraft({
      name: category.name,
      tagline: category.tagline,
      description: category.description,
      image: category.image,
      accent: category.accent,
      visible: category.visible,
    });
    setError(null);
    setEditing(category);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      if (editing === "new") {
        await api.post("/categories", draft);
        notify({ kind: "success", title: "Category created", description: `${draft.name} is ready to organise pieces.` });
      } else {
        await api.patch(`/categories/${editing.id}`, draft);
        notify({ kind: "success", title: "Category updated", description: draft.name });
      }
      setEditing(null);
      categories.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the category.");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisible = async (category: Category) => {
    try {
      const updated = await api.patch<Category>(`/categories/${category.id}`, { visible: !category.visible });
      categories.setData((current) => (current ? { ...current, data: current.data.map((row) => (row.id === updated.id ? updated : row)) } : current));
      notify({ kind: "success", title: updated.visible ? "Category visible" : "Category hidden", description: category.name });
    } catch (cause) {
      notify({ kind: "error", title: "Visibility not changed", description: cause instanceof Error ? cause.message : "Try again." });
    }
  };

  const move = async (category: Category, direction: "up" | "down") => {
    try {
      await api.post(`/categories/${category.id}/move`, { direction });
      categories.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Could not reorder", description: cause instanceof Error ? cause.message : "Try again." });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/categories/${deleting.id}`);
      notify({ kind: "success", title: "Category deleted", description: deleting.name });
      setDeleting(null);
      categories.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Category not deleted", description: cause instanceof Error ? cause.message : "Move its products first." });
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
            <span className="crumb-current">Categories</span>
          </nav>
          <p className="eyebrow page-eyebrow">Storefront taxonomy</p>
          <h1 className="page-title">Shelves with a point of view.</h1>
          <p className="page-description">
            Order, name and art-direct the categories customers browse. Visibility is instant; deletions are guarded when products still live inside.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<FolderPlus size={14} />} onClick={openNew}>
            New category
          </Button>
        </div>
      </div>

      {categories.error ? (
        <Card><ErrorState title="Categories unavailable" body={categories.error} onRetry={categories.reload} /></Card>
      ) : (
        <Card>
          <div className="section-heading">
            <div>
              <h2>{sorted.length} categories</h2>
              <p>Drag-free ordering with explicit up/down controls.</p>
            </div>
            <Badge tone="info">{sorted.filter((category) => category.visible).length} visible</Badge>
          </div>
          {categories.loading ? (
            <div className="stack-18">
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className="sk sk-line" style={{ height: 62, borderRadius: 12 }} />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={<FolderPlus size={22} />}
              title="No categories yet"
              body="Create the first shelf to start organising the catalogue."
              action={<Button variant="primary" size="sm" onClick={openNew}>New category</Button>}
            />
          ) : (
            <div className="catalogue-list">
              {sorted.map((category, index) => (
                <div key={category.id} className="catalogue-row">
                  {category.image ? (
                    <img className="cat-thumb" src={category.image} alt={category.name} loading="lazy" />
                  ) : (
                    <span className="cat-thumb-letter" style={{ background: category.accent }}>
                      {category.name.slice(0, 1)}
                    </span>
                  )}
                  <div className="cat-copy">
                    <strong>
                      {category.name}
                      <i className="swatch" style={{ background: category.accent }} aria-hidden="true" />
                      {category.visible ? <Badge tone="positive">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>}
                    </strong>
                    <span>{category.tagline || category.description}</span>
                    <span className="cat-slug">/{category.slug}</span>
                  </div>
                  <div className="cat-meta">
                    <span>
                      <b>{counts[category.id] ?? 0}</b> products
                    </span>
                    <span>
                      Order <b>{index + 1}</b>
                    </span>
                  </div>
                  <div className="row-controls">
                    <div className="order-buttons">
                      <IconButton label={`Move ${category.name} up`} size="sm" disabled={index === 0} onClick={() => void move(category, "up")}>
                        <ChevronUp size={12} />
                      </IconButton>
                      <IconButton label={`Move ${category.name} down`} size="sm" disabled={index === sorted.length - 1} onClick={() => void move(category, "down")}>
                        <ChevronDown size={12} />
                      </IconButton>
                    </div>
                    <IconButton label={`Toggle ${category.name} visibility`} size="sm" onClick={() => void toggleVisible(category)}>
                      {category.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </IconButton>
                    <IconButton label={`Edit ${category.name}`} size="sm" onClick={() => openEdit(category)}>
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton label={`Delete ${category.name}`} size="sm" tone="danger" onClick={() => setDeleting(category)}>
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
        title={editing === "new" ? "New category" : "Edit category"}
        description="Category copy, art direction and visibility."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} icon={<Plus size={14} />} onClick={() => void save()}>
              {editing === "new" ? "Create category" : "Save category"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Name" required>
            <input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Handmade Jewelry" />
          </Field>
          <Field label="Accent colour" hint="Used for the storefront chip.">
            <input type="color" className="input" value={draft.accent} onChange={(event) => setDraft({ ...draft, accent: event.target.value })} style={{ padding: 4 }} />
          </Field>
          <Field label="Tagline" className="span-2">
            <input className="input" value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} placeholder="Heirlooms in miniature" />
          </Field>
          <Field label="Description" className="span-2">
            <textarea className="textarea" rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </Field>
          <Field label="Image URL" hint="Paste a path from the media library, e.g. /media/img/…" className="span-2">
            <input className="input" value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} placeholder="/media/img/products/..." />
          </Field>
          <div className="span-2 flag-row">
            <div>
              <strong>Visible on storefront</strong>
              <span>Hidden categories still keep their products.</span>
            </div>
            <Toggle checked={draft.visible} onChange={(value) => setDraft({ ...draft, visible: value })} label="Category visibility" />
          </div>
        </div>
        {error ? <p className="form-error" style={{ marginTop: 10 }}>{error}</p> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title={`Delete ${deleting?.name ?? "category"}?`}
        body="Only empty categories can be deleted. Move its products to another shelf first."
        confirmLabel="Delete category"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
