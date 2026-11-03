import { useState } from "react";
import { ArrowRight, ClipboardList, Search, ShieldCheck } from "lucide-react";
import type { AuditEntry, Paginated } from "../../shared/types";
import { Avatar, Badge, Card, EmptyState, ErrorState, Pagination, SearchInput, TableSkeleton } from "../components/ui";
import { api } from "../lib/api";
import { useDebounced, useResource } from "../lib/hooks";
import { foldWords, relative } from "../lib/utils";

const ENTITIES = ["order", "product", "inventory", "customer", "category", "vendor", "content", "discount", "settings", "team", "auth"];

export function AuditPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 280);
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("pageSize", "20");
  if (debouncedQ) query.set("q", debouncedQ);
  if (entity) query.set("entity", entity);

  const audit = useResource<Paginated<AuditEntry>>(() => api.get<Paginated<AuditEntry>>(`/audit?${query.toString()}`), [page, debouncedQ, entity]);
  const data = audit.data;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-copy">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crumb-current">Workspace</span>
            <ArrowRight size={11} className="crumb-sep" />
            <span className="crumb-current">Audit log</span>
          </nav>
          <p className="eyebrow page-eyebrow">Accountability</p>
          <h1 className="page-title">Everything leaves a trace.</h1>
          <p className="page-description">
            Sign-ins, status moves, stock corrections and settings changes — attributed, timed and immutable.
          </p>
        </div>
        <div className="page-actions">
          <Badge tone="positive" dot>
            <ShieldCheck size={11} /> Append-only
          </Badge>
        </div>
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search actor, action, detail…" className="grow" />
        <select className="select input-sm" value={entity} onChange={(event) => { setEntity(event.target.value); setPage(1); }} aria-label="Filter entity">
          <option value="">All entities</option>
          {ENTITIES.map((value) => (
            <option key={value} value={value}>
              {foldWords(value)} {data?.facets?.[value] ? `· ${data.facets[value]}` : ""}
            </option>
          ))}
        </select>
      </div>

      <Card>
        {audit.error ? (
          <ErrorState title="Audit log unavailable" body={audit.error} onRetry={audit.reload} />
        ) : audit.loading && !data ? (
          <TableSkeleton rows={10} cols={3} />
        ) : data && data.data.length === 0 ? (
          <EmptyState icon={<Search size={22} />} title="No entries match" body="Try a different actor, action or entity." />
        ) : data ? (
          <>
            <div className="audit-list">
              {data.data.map((entry) => (
                <div key={entry.id} className="audit-row">
                  <Avatar name={entry.actor} size={28} />
                  <div className="audit-copy">
                    <strong>
                      <span className="audit-action">
                        {entry.action}
                        <Badge tone={entry.actorRole === "admin" ? "gold" : entry.actorRole === "manager" ? "info" : "neutral"}>{foldWords(entry.actorRole)}</Badge>
                      </span>
                    </strong>
                    <span>
                      {entry.actor} · {entry.detail || `${entry.entity} ${entry.entityId}`}
                    </span>
                  </div>
                  <span className="audit-time">
                    {relative(entry.at)}
                    <br />
                    <span className="mono">{entry.entity}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="table-note">
              <span>
                {data.total} entries · page {data.page} of {data.totalPages}
              </span>
              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} />
            </div>
          </>
        ) : null}
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <ClipboardList size={13} style={{ color: "var(--gold)" }} />
          <span className="hint">Entries are written by the API on every mutation and are never edited after creation.</span>
        </div>
      </Card>
    </div>
  );
}
