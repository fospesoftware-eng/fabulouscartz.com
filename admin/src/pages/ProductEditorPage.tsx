import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Globe2,
  ImagePlus,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { Category, Product, ProductMode, ProductStatus, Variant, Vendor } from "../../shared/types";
import { MediaPicker } from "../components/MediaPicker";
import { ConfirmDialog } from "../components/overlay";
import { Badge, Button, Card, ErrorState, Field, IconButton, Toggle } from "../components/ui";
import { useUI } from "../context/UIContext";
import { ApiError, api } from "../lib/api";
import { resources } from "../lib/normalize";
import { useResource } from "../lib/hooks";
import { cn, foldWords, money } from "../lib/utils";

type VariantDraft = Omit<Variant, "id" | "sku"> & { id?: string; sku?: string };

interface Draft {
  name: string;
  slug: string;
  description: string;
  details: string;
  price: number;
  mrp: number;
  modes: ProductMode[];
  categoryId: string;
  vendorId: string;
  images: string[];
  variants: VariantDraft[];
  tags: string[];
  status: ProductStatus;
  featured: boolean;
  newArrival: boolean;
  topSeller: boolean;
  rating: number;
  reviews: number;
}

const EMPTY: Draft = {
  name: "",
  slug: "",
  description: "",
  details: "",
  price: 0,
  mrp: 0,
  modes: ["buy"],
  categoryId: "",
  vendorId: "",
  images: [],
  variants: [
    { size: "One size", color: "Natural", price: 0, rentalPrice: 0, stock: 0, rented: 0, lowStockThreshold: 5, rentWindowDays: 5 },
  ],
  tags: [],
  status: "draft",
  featured: false,
  newArrival: true,
  topSeller: false,
  rating: 0,
  reviews: 0,
};

function fromProduct(product: Product): Draft {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    details: product.details.join("\n"),
    price: product.price,
    mrp: product.mrp ?? 0,
    modes: product.modes,
    categoryId: product.categoryId,
    vendorId: product.vendorId,
    images: product.images,
    variants: product.variants.map((variant) => ({ ...variant })),
    tags: product.tags,
    status: product.status,
    featured: product.featured,
    newArrival: product.newArrival,
    topSeller: product.topSeller,
    rating: product.rating,
    reviews: product.reviews,
  };
}

export function ProductEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useUI();
  const isNew = !id;
  const product = useResource<Product>(() => resources.product(id ?? ""), [id], { enabled: !isNew });
  const categories = useResource<{ data: Category[] }>(() => resources.categories(), []);
  const vendors = useResource<{ data: Vendor[] }>(() => resources.vendors(), []);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAction, setSavedAction] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (product.data) {
      setDraft(fromProduct(product.data));
      setDirty(false);
    }
  }, [product.data]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setSavedAction(null);
  };

  const updateVariant = <K extends keyof VariantDraft>(index: number, key: K, value: VariantDraft[K]) => {
    setDraft((current) => {
      const variants = current.variants.map((variant, position) => (position === index ? { ...variant, [key]: value } : variant));
      return { ...current, variants };
    });
    setDirty(true);
    setSavedAction(null);
  };

  const addVariant = () => {
    update("variants", [
      ...draft.variants,
      {
        size: "",
        color: "",
        price: draft.price,
        rentalPrice: draft.modes.includes("rent") ? Math.round(draft.price * 0.18) : 0,
        stock: 0,
        rented: 0,
        lowStockThreshold: 5,
        rentWindowDays: 5,
      },
    ]);
  };

  const removeVariant = (index: number) => {
    update(
      "variants",
      draft.variants.filter((_, position) => position !== index),
    );
  };

  const payload = (statusOverride?: ProductStatus) => ({
    name: draft.name,
    slug: draft.slug || undefined,
    description: draft.description,
    details: draft.details.split("\n").map((line) => line.trim()).filter(Boolean),
    price: draft.price,
    mrp: draft.mrp > 0 ? draft.mrp : undefined,
    modes: draft.modes,
    categoryId: draft.categoryId,
    vendorId: draft.vendorId,
    images: draft.images,
    variants: draft.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku || undefined,
      size: variant.size,
      color: variant.color,
      price: variant.price,
      rentalPrice: variant.rentalPrice,
      stock: variant.stock,
      rented: variant.rented,
      lowStockThreshold: variant.lowStockThreshold,
      rentWindowDays: variant.rentWindowDays,
    })),
    tags: draft.tags,
    status: statusOverride ?? draft.status,
    featured: draft.featured,
    newArrival: draft.newArrival,
    topSeller: draft.topSeller,
    rating: draft.rating,
    reviews: draft.reviews,
  });

  const save = async (statusOverride?: ProductStatus) => {
    setFormError(null);
    setFieldErrors({});
    setSaving(true);
    try {
      const saved = isNew
        ? await api.post<Product>("/products", payload(statusOverride))
        : await api.patch<Product>(`/products/${id}`, payload(statusOverride));
      setDraft(fromProduct(saved));
      setDirty(false);
      setSavedAction(statusOverride === "published" ? "published" : "saved");
      notify({
        kind: "success",
        title: isNew ? "Product created" : statusOverride === "published" ? "Product is live" : "Changes saved",
        description: `${saved.name} · ${foldWords(saved.status)}`,
      });
      if (isNew) navigate(`/products/${saved.id}`);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFormError(cause.message);
        setFieldErrors(cause.fields ?? {});
        notify({ kind: "error", title: "Product not saved", description: cause.message });
      } else {
        setFormError("The API could not be reached.");
      }
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!id) return;
    setArchiving(true);
    try {
      await api.del(`/products/${id}`);
      notify({ kind: "success", title: "Product archived", description: "It is no longer visible on the storefront." });
      setArchiveOpen(false);
      navigate("/products");
    } catch (cause) {
      notify({ kind: "error", title: "Archive failed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setArchiving(false);
    }
  };

  const addTag = () => {
    const value = tagInput.trim();
    if (!value || draft.tags.includes(value)) return;
    update("tags", [...draft.tags, value]);
    setTagInput("");
  };

  const toggleMode = (mode: ProductMode) => {
    if (draft.modes.includes(mode)) {
      if (draft.modes.length === 1) return;
      update("modes", draft.modes.filter((entry) => entry !== mode));
    } else {
      update("modes", [...draft.modes, mode]);
    }
  };

  const previewImage = draft.images[0];
  const totalStock = useMemo(() => draft.variants.reduce((total, variant) => total + variant.stock, 0), [draft.variants]);
  const title = isNew ? "New piece" : draft.name || "Untitled piece";

  if (!isNew && product.error) {
    return <ErrorState title="Product could not load" body={product.error} onRetry={product.reload} />;
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-link" onClick={() => navigate("/products")} role="link" tabIndex={0}>
              Products
            </span>
            <Chevron />
            <span className="crumb-current">{isNew ? "New piece" : title}</span>
          </nav>
          <p className="eyebrow page-eyebrow">{isNew ? "Catalogue · draft" : `Catalogue · ${draft.status}`}</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-description">
            {isNew
              ? "Write the story, set the price, define variants. Save as a draft until the piece is ready to meet the storefront."
              : `Last saved ${product.data ? foldWords(draft.status) : ""} · ${draft.variants.length} variants · ${totalStock} units on hand`}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => navigate("/products")}>
            Catalogue
          </Button>
          <Button variant="primary" icon={<Save size={14} />} loading={saving} onClick={() => void save()}>
            {isNew ? "Save draft" : "Save changes"}
          </Button>
        </div>
      </div>

      {formError ? <div className="login-error" style={{ marginBottom: 14 }}>{formError}</div> : null}

      <div className="editor-layout">
        <div className="editor-main">
          <Card className="form-section">
            <div className="form-section-head">
              <div>
                <h2>The story</h2>
                <p>How the piece reads to a customer on the storefront.</p>
              </div>
              {savedAction ? <Badge tone="positive" dot>{savedAction === "published" ? "Live" : "Saved"}</Badge> : dirty ? <Badge tone="warning">Unsaved</Badge> : null}
            </div>
            <div className="form-grid">
              <Field label="Product name" required error={fieldErrors.name} className="span-2">
                <input className="input" value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Crimson bridal lehenga" />
              </Field>
              <Field label="Slug" hint="Leave blank to generate from the name." className="span-2">
                <input className="input" value={draft.slug} onChange={(event) => update("slug", event.target.value)} placeholder="crimson-bridal-lehenga" />
              </Field>
              <Field label="Short description" required error={fieldErrors.description} className="span-2">
                <textarea
                  className="textarea"
                  rows={3}
                  value={draft.description}
                  onChange={(event) => update("description", event.target.value)}
                  placeholder="Hand-embroidered silk with a zardozi border…"
                />
              </Field>
              <Field label="Details" hint="One line per bullet. These appear as the piece's spec list." className="span-2">
                <textarea
                  className="textarea"
                  rows={4}
                  value={draft.details}
                  onChange={(event) => update("details", event.target.value)}
                  placeholder={"Hand-finished zardozi embroidery\nDry clean only\nMade in India"}
                />
              </Field>
              <Field label="Tags" className="span-2">
                <div className="tag-input">
                  <input
                    className="input"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Bridal, Handmade, Festive…"
                  />
                  <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={addTag}>
                    Add
                  </Button>
                </div>
                {draft.tags.length ? (
                  <div className="chip-list" style={{ marginTop: 8 }}>
                    {draft.tags.map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                        <button type="button" aria-label={`Remove ${tag}`} onClick={() => update("tags", draft.tags.filter((entry) => entry !== tag))}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </Field>
            </div>
          </Card>

          <Card className="form-section">
            <div className="form-section-head">
              <div>
                <h2>Imagery</h2>
                <p>The first frame becomes the storefront card. 4:5 crops work best.</p>
              </div>
              <Button variant="outline" size="sm" icon={<ImagePlus size={13} />} onClick={() => setPickerOpen(true)}>
                Add media
              </Button>
            </div>
            <div className="image-strip">
              {draft.images.map((url, index) => (
                <div key={`${url}-${index}`} className="image-tile">
                  <img src={url} alt={`${draft.name} frame ${index + 1}`} />
                  {index === 0 ? <Badge tone="gold" className="image-primary">Cover</Badge> : null}
                  <button type="button" aria-label="Remove image" onClick={() => update("images", draft.images.filter((_, position) => position !== index))}>
                    <X size={11} />
                  </button>
                </div>
              ))}
              <button type="button" className="image-add" onClick={() => setPickerOpen(true)}>
                <ImagePlus size={18} />
                <span>Add frame</span>
              </button>
            </div>
            {fieldErrors.images ? <p className="form-error">{fieldErrors.images}</p> : null}
          </Card>

          <Card className="form-section">
            <div className="form-section-head">
              <div>
                <h2>Variants & stock</h2>
                <p>Each size and colour is its own SKU with its own promise of availability.</p>
              </div>
              <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={addVariant}>
                Add variant
              </Button>
            </div>
            <div className="variant-editor">
              <div className="variant-row variant-head">
                <span>Size</span>
                <span>Colour</span>
                <span>SKU</span>
                <span>Price $</span>
                <span>Rent $</span>
                <span>Stock</span>
                <span>Low at</span>
                <span>Rent days</span>
                <span />
              </div>
              {draft.variants.map((variant, index) => (
                <div key={variant.id ?? `new-${index}`} className="variant-row">
                  <input className="input" value={variant.size} onChange={(event) => updateVariant(index, "size", event.target.value)} placeholder="Size" title="Size" />
                  <input className="input" value={variant.color} onChange={(event) => updateVariant(index, "color", event.target.value)} placeholder="Colour" title="Colour" />
                  <input className="input" value={variant.sku ?? ""} onChange={(event) => updateVariant(index, "sku", event.target.value)} placeholder="Auto" title="SKU" />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={variant.price}
                    onChange={(event) => updateVariant(index, "price", Number(event.target.value))}
                    title="Variant price"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={variant.rentalPrice}
                    onChange={(event) => updateVariant(index, "rentalPrice", Number(event.target.value))}
                    disabled={!draft.modes.includes("rent")}
                    title="Rental price"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={variant.stock}
                    onChange={(event) => updateVariant(index, "stock", Number(event.target.value))}
                    title="Stock"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={variant.lowStockThreshold}
                    onChange={(event) => updateVariant(index, "lowStockThreshold", Number(event.target.value))}
                    title="Low stock threshold"
                  />
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={variant.rentWindowDays}
                    onChange={(event) => updateVariant(index, "rentWindowDays", Number(event.target.value))}
                    title="Rent window days"
                  />
                  <IconButton
                    label="Remove variant"
                    size="sm"
                    tone="danger"
                    disabled={draft.variants.length === 1}
                    onClick={() => removeVariant(index)}
                  >
                    <Trash2 size={12} />
                  </IconButton>
                </div>
              ))}
            </div>
            {fieldErrors.variants ? <p className="form-error">{fieldErrors.variants}</p> : null}
            <p className="hint" style={{ marginTop: 10 }}>
              {draft.variants.length} variants · {totalStock} units on hand · {draft.variants.reduce((total, variant) => total + variant.rented, 0)} out on rent.
              Empty SKUs are generated automatically on save.
            </p>
          </Card>
        </div>

        <aside className="editor-aside">
          <Card className="status-panel">
            <div className="form-section-head" style={{ marginBottom: 10 }}>
              <div>
                <h2 style={{ fontSize: 16 }}>Publication</h2>
                <p>Visibility & commercial flags</p>
              </div>
            </div>
            <Field label="Status">
              <select className="select" value={draft.status} onChange={(event) => update("status", event.target.value as ProductStatus)}>
                <option value="draft">Draft — hidden</option>
                <option value="published">Published — live</option>
                {draft.status === "archived" ? <option value="archived">Archived</option> : null}
              </select>
            </Field>

            <div className="divider" />

            <div className="flag-row">
              <div>
                <strong>Featured</strong>
                <span>Pin to the storefront hero rail</span>
              </div>
              <Toggle checked={draft.featured} onChange={(value) => update("featured", value)} label="Featured" />
            </div>
            <div className="flag-row">
              <div>
                <strong>New arrival</strong>
                <span>Show in the new-in edit</span>
              </div>
              <Toggle checked={draft.newArrival} onChange={(value) => update("newArrival", value)} label="New arrival" />
            </div>
            <div className="flag-row">
              <div>
                <strong>Top seller</strong>
                <span>Eligible for bestseller rails</span>
              </div>
              <Toggle checked={draft.topSeller} onChange={(value) => update("topSeller", value)} label="Top seller" />
            </div>

            <div className="divider" />
            <div className="form-grid" style={{ gap: 8 }}>
              <Field label="Rating">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={draft.rating}
                  onChange={(event) => update("rating", Number(event.target.value))}
                />
              </Field>
              <Field label="Reviews">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={draft.reviews}
                  onChange={(event) => update("reviews", Number(event.target.value))}
                />
              </Field>
            </div>

            <div className="divider" />
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving} onClick={() => void save()}>
                Save
              </Button>
              <Button
                variant="gold"
                size="sm"
                icon={<Globe2 size={13} />}
                loading={saving}
                onClick={() => void save(draft.status === "published" ? "draft" : "published")}
              >
                {draft.status === "published" ? "Unpublish" : "Publish"}
              </Button>
            </div>
            {!isNew && draft.status !== "archived" ? (
              <Button variant="ghost" size="sm" icon={<Archive size={13} />} style={{ marginTop: 8, width: "100%" }} onClick={() => setArchiveOpen(true)}>
                Archive piece
              </Button>
            ) : null}
          </Card>

          <Card className="form-section">
            <h2 className="serif" style={{ fontSize: 16, marginBottom: 12 }}>
              <Sparkles size={14} style={{ color: "var(--gold)" }} /> Organisation
            </h2>
            <Field label="Category" error={fieldErrors.categoryId}>
              <select className="select" value={draft.categoryId} onChange={(event) => update("categoryId", event.target.value)}>
                <option value="">Choose category…</option>
                {categories.data?.data.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <div style={{ height: 10 }} />
            <Field label="Studio partner" error={fieldErrors.vendorId}>
              <select className="select" value={draft.vendorId} onChange={(event) => update("vendorId", event.target.value)}>
                <option value="">Choose vendor…</option>
                {vendors.data?.data.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </Field>
          </Card>

          <Card className="form-section">
            <h2 className="serif" style={{ fontSize: 16, marginBottom: 12 }}>
              <Star size={14} style={{ color: "var(--gold)" }} /> Price & modes
            </h2>
            <div className="form-grid" style={{ gap: 8 }}>
              <Field label="Price (USD)" required error={fieldErrors.price}>
                <input className="input" type="number" min={0} value={draft.price} onChange={(event) => update("price", Number(event.target.value))} />
              </Field>
              <Field label="MRP" hint="Optional compare-at price">
                <input className="input" type="number" min={0} value={draft.mrp} onChange={(event) => update("mrp", Number(event.target.value))} />
              </Field>
            </div>
            <div className="chip-list" style={{ marginTop: 10 }}>
              {(["buy", "rent"] as ProductMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn("chip", draft.modes.includes(mode) && "is-on")}
                  style={
                    draft.modes.includes(mode)
                      ? { borderColor: "color-mix(in oklab, var(--gold) 50%, var(--line))", background: "color-mix(in oklab, var(--gold) 9%, transparent)" }
                      : undefined
                  }
                  onClick={() => toggleMode(mode)}
                >
                  {mode === "buy" ? "Purchase" : "Rental"}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {money(draft.price)} · {draft.modes.map((mode) => (mode === "buy" ? "buy" : "rent")).join(" & ")}
            </p>
          </Card>

          {previewImage ? (
            <Card padded={false} className="content-card">
              <div className="content-image">
                <img src={previewImage} alt="Storefront preview" />
                <Badge tone="gold">{draft.status === "published" ? "Live" : "Preview"}</Badge>
              </div>
              <div className="content-body">
                <h3>{draft.name || "Untitled piece"}</h3>
                <p>{draft.description || "Add a short description to preview the storefront card."}</p>
                <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
                  <span className="serif" style={{ fontSize: 16 }}>{money(draft.price)}</span>
                  <Link to="/products" className="inline-link">
                    Catalogue <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(urls) => {
          update("images", [...new Set([...draft.images, ...urls])]);
          setFieldErrors((current) => ({ ...current, images: "" }));
        }}
        selected={draft.images}
      />

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => void archive()}
        title="Archive this piece?"
        body="It disappears from the storefront immediately. Existing orders keep their snapshot."
        confirmLabel="Archive"
        tone="danger"
        loading={archiving}
      />

      <div className="editor-actions" style={{ marginTop: 16 }}>
        <span className="hint">
          {dirty ? "You have unsaved changes." : "Everything is saved."} {savedAction ? "Last action landed." : null}
        </span>
        <span className="grow" />
        <Button variant="ghost" size="sm" onClick={() => navigate("/products")}>
          Discard & close
        </Button>
        <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving} onClick={() => void save()}>
          {isNew ? "Save draft" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function Chevron() {
  return <ArrowRight size={11} className="crumb-sep" />;
}
