import { useMemo, useState } from "react";
import { ArrowRight, BookOpenText, Eye, EyeOff, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import type { ContentEntry } from "../../shared/types";
import { ConfirmDialog, Modal } from "../components/overlay";
import { Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Segmented } from "../components/ui";
import { useUI } from "../context/UIContext";
import { api } from "../lib/api";
import { useResource } from "../lib/hooks";
import { foldWords, relative } from "../lib/utils";

interface Draft {
  type: ContentEntry["type"];
  title: string;
  subtitle: string;
  body: string;
  image: string;
  ctaLabel: string;
  ctaHref: string;
  status: ContentEntry["status"];
}

const EMPTY: Draft = {
  type: "hero",
  title: "",
  subtitle: "",
  body: "",
  image: "",
  ctaLabel: "Explore the edit",
  ctaHref: "/shop",
  status: "draft",
};

export function ContentPage() {
  const { notify } = useUI();
  const content = useResource<{ data: ContentEntry[] }>(() => api.get<{ data: ContentEntry[] }>("/content"), []);
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<ContentEntry | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ContentEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (content.data?.data ?? []).filter((entry) => (type ? entry.type === type : true)), [content.data, type]);

  const openNew = () => {
    setDraft(EMPTY);
    setError(null);
    setEditing("new");
  };

  const openEdit = (entry: ContentEntry) => {
    setDraft({
      type: entry.type,
      title: entry.title,
      subtitle: entry.subtitle,
      body: entry.body,
      image: entry.image,
      ctaLabel: entry.ctaLabel,
      ctaHref: entry.ctaHref,
      status: entry.status,
    });
    setError(null);
    setEditing(entry);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      if (editing === "new") {
        await api.post("/content", draft);
        notify({ kind: "success", title: "Content draft created", description: draft.title });
      } else {
        await api.patch(`/content/${editing.id}`, draft);
        notify({ kind: "success", title: "Content updated", description: draft.title });
      }
      setEditing(null);
      content.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the entry.");
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (entry: ContentEntry) => {
    const next = entry.status === "published" ? "draft" : "published";
    try {
      const updated = await api.patch<ContentEntry>(`/content/${entry.id}`, { status: next });
      content.setData((current) => (current ? { ...current, data: current.data.map((row) => (row.id === updated.id ? updated : row)) } : current));
      notify({ kind: "success", title: next === "published" ? "Published to storefront" : "Unpublished", description: entry.title });
    } catch (cause) {
      notify({ kind: "error", title: "Status not changed", description: cause instanceof Error ? cause.message : "Try again." });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/content/${deleting.id}`);
      notify({ kind: "success", title: "Content removed", description: deleting.title });
      setDeleting(null);
      content.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Content not removed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Storefront</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Content</span>
          </nav>
          <p className="eyebrow page-eyebrow">Editorial desk</p>
          <h1 className="page-title">The words that sell the craft.</h1>
          <p className="page-description">
            Heroes, banners and editorial stories. Draft freely, publish with intent — every piece is timestamped and attributed.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<Plus size={14} />} onClick={openNew}>
            New entry
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "", label: "All" },
            { value: "hero", label: "Heroes" },
            { value: "banner", label: "Banners" },
            { value: "editorial", label: "Editorial" },
          ]}
        />
        <span className="toolbar-spacer" />
        <span className="hint">
          {(content.data?.data ?? []).filter((entry) => entry.status === "published").length} live ·{" "}
          {(content.data?.data ?? []).filter((entry) => entry.status === "draft").length} drafts
        </span>
      </div>

      {content.error ? (
        <Card><ErrorState title="Content unavailable" body={content.error} onRetry={content.reload} /></Card>
      ) : content.loading ? (
        <div className="content-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="sk sk-block" style={{ height: 260, borderRadius: 15 }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpenText size={22} />}
            title="Nothing on this desk"
            body="Create a hero, banner or editorial entry to fill the storefront."
            action={<Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={openNew}>New entry</Button>}
          />
        </Card>
      ) : (
        <div className="content-grid">
          {rows.map((entry) => (
            <article key={entry.id} className="content-card">
              <div className="content-image">
                {entry.image ? (
                  <img src={entry.image} alt={entry.title} loading="lazy" />
                ) : (
                  <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-4)" }}>
                    <ImageIcon size={26} />
                  </div>
                )}
                <Badge tone={entry.status === "published" ? "positive" : "warning"} dot>
                  {entry.status === "published" ? "Live" : "Draft"}
                </Badge>
              </div>
              <div className="content-body">
                <span className="eyebrow">{foldWords(entry.type)}</span>
                <h3>{entry.title}</h3>
                <p>{entry.subtitle || entry.body}</p>
              </div>
              <div className="content-meta">
                <span>
                  {entry.author} · {relative(entry.updatedAt)}
                </span>
                <div className="content-actions">
                  <IconButton label={`Edit ${entry.title}`} size="sm" onClick={() => openEdit(entry)}>
                    <Pencil size={12} />
                  </IconButton>
                  <IconButton label={entry.status === "published" ? "Unpublish" : "Publish"} size="sm" onClick={() => void togglePublish(entry)}>
                    {entry.status === "published" ? <EyeOff size={12} /> : <Eye size={12} />}
                  </IconButton>
                  <IconButton label={`Delete ${entry.title}`} size="sm" tone="danger" onClick={() => setDeleting(entry)}>
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New content entry" : "Edit content"}
        description="Storefront copy with a controlled publish state."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} icon={<Eye size={14} />} onClick={() => void save()}>
              {editing === "new" ? "Create entry" : "Save entry"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Type">
            <select className="select" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as Draft["type"] })}>
              <option value="hero">Hero</option>
              <option value="banner">Banner</option>
              <option value="editorial">Editorial</option>
            </select>
          </Field>
          <Field label="Status">
            <select className="select" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft["status"] })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
          <Field label="Title" required className="span-2">
            <input className="input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </Field>
          <Field label="Subtitle" className="span-2">
            <input className="input" value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} />
          </Field>
          <Field label="Body" className="span-2">
            <textarea className="textarea" rows={4} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
          </Field>
          <Field label="Image URL" className="span-2">
            <input className="input" value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} placeholder="/media/img/…" />
          </Field>
          <Field label="CTA label">
            <input className="input" value={draft.ctaLabel} onChange={(event) => setDraft({ ...draft, ctaLabel: event.target.value })} />
          </Field>
          <Field label="CTA link">
            <input className="input" value={draft.ctaHref} onChange={(event) => setDraft({ ...draft, ctaHref: event.target.value })} placeholder="/shop" />
          </Field>
        </div>
        {error ? <p className="form-error" style={{ marginTop: 10 }}>{error}</p> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title={`Delete “${deleting?.title ?? "entry"}”?`}
        body="This removes the entry from the content desk. Published storefront copy disappears immediately."
        confirmLabel="Delete entry"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
