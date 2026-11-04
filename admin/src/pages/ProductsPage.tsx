import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  Copy,
  Eye,
  EyeOff,
  FilterX,
  Gem,
  PackagePlus,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import type { Category, Paginated, Product, Vendor } from "../../shared/types";
import { ConfirmDialog } from "../components/overlay";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Pagination,
  SearchInput,
  Segmented,
  TableSkeleton,
} from "../components/ui";
import { useUI } from "../context/UIContext";
import { resources } from "../lib/normalize";
import { useDebounced, useResource } from "../lib/hooks";
import { dateShort, foldWords, money, STATUS_TONE } from "../lib/utils";

function stockTotal(product: Product): number {
  return product.variants.reduce((total, variant) => total + variant.stock, 0);
}

function statusTone(status: string): "positive" | "warning" | "neutral" {
  return (STATUS_TONE[status] as "positive") ?? "neutral";
}

export function ProductsPage() {
  const navigate = useNavigate();
  const { notify } = useUI();
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 280);
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [mode, setMode] = useState("");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmArchive, setConfirmArchive] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useResource<Paginated<Product>>(
    () =>
      resources.products({
        page,
        pageSize: 12,
        sort,
        q: debouncedQ,
        status,
        categoryId,
        vendorId,
        mode,
      }),
    [page, sort, debouncedQ, status, categoryId, vendorId, mode],
  );
  const categories = useResource<{ data: Category[] }>(() => resources.categories(), []);
  const vendors = useResource<{ data: Vendor[] }>(() => resources.vendors(), []);

  const categoryName = (id: string) => categories.data?.data.find((entry) => entry.id === id)?.name ?? "Unassigned";
  const vendorName = (id: string) => vendors.data?.data.find((entry) => entry.id === id)?.name ?? "Unassigned";

  const resetFilters = () => {
    setQ("");
    setStatus("");
    setCategoryId("");
    setVendorId("");
    setMode("");
    setSort("updated");
    setPage(1);
  };

  const hasFilters = Boolean(q || status || categoryId || vendorId || mode || sort !== "updated");

  const toggleAll = () => {
    if (!list.data) return;
    const ids = list.data.data.map((product) => product.id);
    setSelected(selected.length === ids.length ? [] : ids);
  };

  const duplicate = async (_product: Product) => {
    notify({ kind: "info", title: "Not available yet", description: "Duplicating a product has no API endpoint. Create it from the editor instead." });
  };

  const togglePublish = async (product: Product) => {
    const nextStatus = product.status === "published" ? "draft" : "published";
    try {
      const updated = await resources.updateProductStatus(product.id, nextStatus === "published");
      list.setData((current) => (current ? { ...current, data: current.data.map((row) => (row.id === updated.id ? updated : row)) } : current));
      notify({
        kind: "success",
        title: nextStatus === "published" ? "Published to the storefront" : "Moved back to draft",
        description: product.name,
      });
    } catch (cause) {
      notify({ kind: "error", title: "Visibility not changed", description: cause instanceof Error ? cause.message : "Try again." });
    }
  };

  const archive = async () => {
    if (!confirmArchive) return;
    setBusy(true);
    try {
      await resources.archiveProduct(confirmArchive.id);
      notify({ kind: "success", title: "Product archived", description: `${confirmArchive.name} is hidden from the storefront.` });
      setConfirmArchive(null);
      list.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Archive failed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (action: "publish" | "unpublish" | "archive") => {
    if (!selected.length) return;
    setBusy(true);
    try {
      await Promise.all(
        selected.map((id) => (action === "archive" ? resources.archiveProduct(id) : resources.updateProductStatus(id, action === "publish"))),
      );
      notify({ kind: "success", title: `${selected.length} products updated`, description: `Bulk action: ${action}.` });
      setSelected([]);
      list.reload();
    } catch (cause) {
      notify({ kind: "error", title: "Bulk action failed", description: cause instanceof Error ? cause.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const data = list.data;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Commerce</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Products</span>
          </nav>
          <p className="eyebrow page-eyebrow">Catalogue</p>
          <h1 className="page-title">The collection, curated.</h1>
          <p className="page-description">
            Every piece carries its own story, variants and stock promise. Draft quietly, publish deliberately.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => navigate("/products/new")}>
            New product
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search name, vendor, tag…" className="grow" />
        <Segmented
          size="sm"
          value={status}
          onChange={(value) => { setStatus(value); setPage(1); }}
          options={[
            { value: "", label: `All${data?.facets?.all ? ` · ${data.facets.all}` : ""}` },
            { value: "published", label: `Live${data?.facets?.published ? ` · ${data.facets.published}` : ""}` },
            { value: "draft", label: `Drafts${data?.facets?.draft ? ` · ${data.facets.draft}` : ""}` },
            { value: "archived", label: "Archived" },
          ]}
        />
        <select className="select input-sm" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }} aria-label="Filter category">
          <option value="">All categories</option>
          {categories.data?.data.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select className="select input-sm" value={vendorId} onChange={(event) => { setVendorId(event.target.value); setPage(1); }} aria-label="Filter vendor">
          <option value="">All vendors</option>
          {vendors.data?.data.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
        <select className="select input-sm" value={mode} onChange={(event) => { setMode(event.target.value); setPage(1); }} aria-label="Filter mode">
          <option value="">Buy & rent</option>
          <option value="buy">Buy only</option>
          <option value="rent">Rent only</option>
        </select>
        <select className="select input-sm" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Sort products">
          <option value="updated">Recently updated</option>
          <option value="name">Name A–Z</option>
          <option value="price_desc">Price high → low</option>
          <option value="price_asc">Price low → high</option>
          <option value="stock">Lowest stock</option>
        </select>
        {hasFilters ? (
          <IconButton label="Clear filters" onClick={resetFilters}>
            <FilterX size={15} />
          </IconButton>
        ) : null}
      </div>

      <Card className="table-card">
        {selected.length ? (
          <div className="bulk-bar">
            <strong>{selected.length} selected</strong>
            <Button variant="outline" size="sm" icon={<Eye size={13} />} loading={busy} onClick={() => void bulk("publish")}>
              Publish
            </Button>
            <Button variant="outline" size="sm" icon={<EyeOff size={13} />} loading={busy} onClick={() => void bulk("unpublish")}>
              To draft
            </Button>
            <Button variant="danger" size="sm" icon={<Archive size={13} />} loading={busy} onClick={() => void bulk("archive")}>
              Archive
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        ) : null}

        {list.error ? (
          <ErrorState title="Catalogue could not load" body={list.error} onRetry={list.reload} />
        ) : list.loading && !data ? (
          <TableSkeleton rows={7} cols={8} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            icon={<Gem size={22} />}
            title="No pieces on this shelf"
            body="Adjust the filters or add a new product to the catalogue."
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => navigate("/products/new")}>
                  New product
                </Button>
              )
            }
          />
        ) : data ? (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 26 }}>
                      <input
                        type="checkbox"
                        className="checkbox"
                        aria-label="Select all products on this page"
                        checked={selected.length === data.data.length && data.data.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>Piece</th>
                    <th>Category / vendor</th>
                    <th>Modes</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((product) => {
                    const stock = stockTotal(product);
                    const isSelected = selected.includes(product.id);
                    return (
                      <tr key={product.id} className={isSelected ? "is-selected" : undefined} onClick={() => navigate(`/products/${product.id}`)} style={{ cursor: "pointer" }}>
                        <td onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="checkbox"
                            aria-label={`Select ${product.name}`}
                            checked={isSelected}
                            onChange={() =>
                              setSelected((current) => (current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id]))
                            }
                          />
                        </td>
                        <td>
                          <div className="product-preview">
                            <img src={product.images[0]} alt={product.name} loading="lazy" />
                            <div style={{ minWidth: 0 }}>
                              <span className="cell-title">{product.name}</span>
                              <span className="cell-sub">
                                {product.variants.length} variants · {product.reviews} reviews
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="cell-title" style={{ fontSize: 11 }}>{categoryName(product.categoryId)}</span>
                          <span className="cell-sub">{vendorName(product.vendorId)}</span>
                        </td>
                        <td>
                          <div className="mode-tags">
                            {product.modes.map((entry) => (
                              <span key={entry} className={`mode-tag ${entry === "rent" ? "is-rent" : ""}`}>
                                {entry}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className="cell-num">{money(product.price)}</span>
                          {product.mrp && product.mrp > product.price ? <span className="cell-sub">MRP {money(product.mrp)}</span> : null}
                        </td>
                        <td>
                          <div className="stock-meter">
                            <span>{stock}</span>
                            <span className={`stock-track ${stock === 0 ? "is-out" : stock < 8 ? "is-low" : ""}`}>
                              <i style={{ width: `${Math.min(100, stock * 4)}%` }} />
                            </span>
                          </div>
                        </td>
                        <td>
                          <Badge tone={statusTone(product.status)} dot>
                            {foldWords(product.status)}
                          </Badge>
                        </td>
                        <td>
                          <span className="cell-sub">{dateShort(product.updatedAt)}</span>
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="row-menu">
                            <IconButton label={`Edit ${product.name}`} size="sm" onClick={() => navigate(`/products/${product.id}`)}>
                              <Pencil size={13} />
                            </IconButton>
                            <IconButton label={`Duplicate ${product.name}`} size="sm" onClick={() => void duplicate(product)}>
                              <Copy size={13} />
                            </IconButton>
                            <IconButton
                              label={product.status === "published" ? `Unpublish ${product.name}` : `Publish ${product.name}`}
                              size="sm"
                              onClick={() => void togglePublish(product)}
                            >
                              {product.status === "published" ? <EyeOff size={13} /> : <Eye size={13} />}
                            </IconButton>
                            {product.status !== "archived" ? (
                              <IconButton label={`Archive ${product.name}`} size="sm" tone="danger" onClick={() => setConfirmArchive(product)}>
                                <Archive size={13} />
                              </IconButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-note">
              <span>
                {data.total} pieces · page {data.page} of {data.totalPages}
              </span>
              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
            </div>
          </>
        ) : null}
      </Card>

      <div className="row" style={{ marginTop: 14, gap: 10 }}>
        <Link to="/categories" className="inline-link">
          <PackagePlus size={13} /> Manage categories
        </Link>
        <Link to="/vendors" className="inline-link">
          <Search size={13} /> Studio partners
        </Link>
      </div>

      <ConfirmDialog
        open={Boolean(confirmArchive)}
        onClose={() => setConfirmArchive(null)}
        onConfirm={() => void archive()}
        title="Archive this piece?"
        body={`${confirmArchive?.name ?? "This product"} will be removed from the storefront. Existing orders keep their record.`}
        confirmLabel="Archive product"
        tone="danger"
        loading={busy}
      />
    </div>
  );
}
