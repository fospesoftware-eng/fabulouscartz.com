import { Link } from "react-router-dom";

/**
 * Verbatim replica of the lockup the deployed storefront serves in its header
 * (https://fabulous.fospe.com): five gold petal ellipses + a centre dot in a
 * 24×24 viewBox, followed by "Fabulous" in Playfair Display italic 500.
 * Geometry, proportions and gold (#B8913A / #E6CE85) are unchanged; only the
 * surrounding text colour follows the console theme, exactly as the live
 * header switches cream → ink as it scrolls over the hero.
 */
function PetalMark() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <ellipse cx="12" cy="6.6" rx="2" ry="4.5" transform="rotate(0 12 12)" stroke="var(--gold)" strokeWidth="1.7" fill="none" />
      <ellipse cx="12" cy="6.6" rx="2" ry="4.5" transform="rotate(72 12 12)" stroke="var(--gold)" strokeWidth="1.7" fill="none" />
      <ellipse cx="12" cy="6.6" rx="2" ry="4.5" transform="rotate(144 12 12)" stroke="var(--gold)" strokeWidth="1.7" fill="none" />
      <ellipse cx="12" cy="6.6" rx="2" ry="4.5" transform="rotate(216 12 12)" stroke="var(--gold)" strokeWidth="1.7" fill="none" />
      <ellipse cx="12" cy="6.6" rx="2" ry="4.5" transform="rotate(288 12 12)" stroke="var(--gold)" strokeWidth="1.7" fill="none" />
      <circle cx="12" cy="12" r="1.7" fill="var(--gold)" />
    </svg>
  );
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="Fabulous — home">
      {compact ? (
        <span className="brand-petal-standalone">
          <PetalMark />
        </span>
      ) : (
        <span className="brand-lockup">
          <span className="brand-petal">
            <PetalMark />
          </span>
          Fabulous
        </span>
      )}
    </Link>
  );
}
