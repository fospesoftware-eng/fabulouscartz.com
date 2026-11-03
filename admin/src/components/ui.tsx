import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn, initials } from "../lib/utils";

type ButtonVariant = "primary" | "gold" | "outline" | "ghost" | "danger" | "soft";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = "outline",
  size = "md",
  icon,
  trailingIcon,
  loading,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn("btn", `btn-${variant}`, `btn-${size}`, !children && "btn-icon-only", className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="spin" /> : icon}
      {children ? <span>{children}</span> : null}
      {trailingIcon}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: "default" | "gold" | "danger";
  active?: boolean;
  size?: "sm" | "md";
  children: ReactNode;
}

export function IconButton({ label, tone = "default", active, size = "md", children, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-tone={tone}
      data-active={active || undefined}
      className={cn("icon-btn", `icon-btn-${size}`, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export type Tone = "positive" | "danger" | "warning" | "info" | "neutral" | "gold" | "emerald";

export function Badge({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("badge", `badge-${tone}`, className)}>
      {dot ? <i className="badge-dot" /> : null}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 34, tone }: { name: string; size?: number; tone?: "emerald" | "gold" | "rose" }) {
  const palette = tone ?? (["emerald", "gold", "rose"] as const)[name.length % 3];
  return (
    <span className={cn("avatar", `avatar-${palette}`)} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}>
      {initials(name)}
    </span>
  );
}

export function Card({
  children,
  className,
  padded = true,
  as = "section",
  id,
  style,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: "section" | "div" | "article";
  id?: string;
  style?: CSSProperties;
}) {
  const Tag = as;
  return <Tag className={cn("card", padded && "card-pad", className)} id={id} style={style}>{children}</Tag>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  crumbs,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: Array<{ label: string; to?: string }>;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {crumbs?.length ? (
          <nav className="crumbs" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="row" style={{ gap: 6 }}>
                {index > 0 ? <ChevronRight size={11} className="crumb-sep" /> : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="crumb-link">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="crumb-current">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        {eyebrow ? <p className="eyebrow page-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  aside,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
}) {
  return (
    <label className={cn("field", className)}>
      {label ? (
        <span className="field-label">
          <span>
            {label}
            {required ? <em className="field-req">*</em> : null}
          </span>
          {aside}
        </span>
      ) : null}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  onClear,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("search-input", className)}>
      <Search size={15} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}

function EmptyArt() {
  return (
    <svg className="state-art" viewBox="0 0 200 128" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fc-empty-emerald" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--emerald-2)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="fc-empty-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="64" r="58" fill="url(#fc-empty-emerald)" />
      <circle cx="100" cy="64" r="42" fill="none" stroke="var(--gold)" strokeOpacity="0.24" strokeWidth="1" />
      <circle cx="100" cy="64" r="30" fill="none" stroke="var(--gold)" strokeOpacity="0.16" strokeWidth="1" />
      <path d="M62 78h76" stroke="url(#fc-empty-gold)" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="74" y="54" width="52" height="24" rx="6" fill="var(--surface)" stroke="var(--gold)" strokeOpacity="0.4" strokeWidth="1.2" />
      <path d="M74 62h52" stroke="var(--gold)" strokeOpacity="0.3" strokeWidth="1" />
      <path d="M82 70h18M82 74h28" stroke="var(--ink-3)" strokeOpacity="0.55" strokeWidth="1" />
      <circle cx="113" cy="48" r="2.4" fill="var(--gold)" />
      <circle cx="70" cy="42" r="1.8" fill="var(--emerald-2)" fillOpacity="0.7" />
      <circle cx="136" cy="94" r="1.8" fill="var(--gold)" fillOpacity="0.7" />
      <path d="M44 64h10M146 64h10" stroke="var(--gold)" strokeOpacity="0.3" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="state-block">
      {icon ? (
        <div className="state-icon">{icon ?? <Inbox size={22} />}</div>
      ) : (
        <EmptyArt />
      )}
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action ? <div className="state-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "This view hit a snag", body, onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  return (
    <div className="state-block state-error">
      <div className="state-icon">
        <AlertTriangle size={20} />
      </div>
      <h3>{title}</h3>
      <p>{body ?? "The operations API did not answer. Check that the server is running on port 4000."}</p>
      {onRetry ? (
        <div className="state-action">
          <Button variant="outline" size="sm" icon={<RefreshCw size={13} />} onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span className="pagination-meta tnum">
        {start}–{end} of {total}
      </span>
      <div className="pagination-controls">
        <IconButton label="Previous page" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={15} />
        </IconButton>
        {Array.from({ length: Math.min(5, totalPages) }).map((_, index) => {
          const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
          const current = startPage + index;
          if (current > totalPages) return null;
          return (
            <button key={current} type="button" className={cn("page-dot", current === page && "is-active")} onClick={() => onPage(current)}>
              {current}
            </button>
          );
        })}
        <IconButton label="Next page" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={15} />
        </IconButton>
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn("toggle", checked && "is-on")}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-track">
        <i />
      </span>
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("segmented", `segmented-${size}`)} role="tablist">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={cn("segmented-item", option.value === value && "is-active")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StatDelta({ value, suffix = "vs previous" }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return (
    <span className={cn("delta", positive ? "delta-up" : "delta-down")}>
      {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(value).toFixed(1)}%
      {suffix ? <span className="delta-note">{suffix}</span> : null}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-spinner" role="status" aria-label={label}>
      <Loader2 size={16} className="spin" />
    </span>
  );
}

export function CheckMark() {
  return (
    <span className="check-mark">
      <Check size={13} />
    </span>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-skeleton" aria-label="Loading table">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="table-skeleton-row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((__, col) => (
            <span key={col} className="sk sk-line" style={{ width: `${70 - col * 7}%`, height: 12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}
