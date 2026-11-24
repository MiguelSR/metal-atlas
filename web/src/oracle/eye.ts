/** The Oracle's emblem: an all-seeing eye in a triangle, with rays and a glow (inline SVG, colors from the theme). */

const RAYS = 24;

export function eyeSvg(): string {
  const rays = Array.from({ length: RAYS }, (_, i) => {
    const angle = (i / RAYS) * 2 * Math.PI;
    const inner = i % 2 ? 46 : 42;
    const outer = i % 2 ? 54 : 60;
    const x = (r: number): string => (64 + r * Math.cos(angle)).toFixed(1);
    const y = (r: number): string => (66 + r * Math.sin(angle)).toFixed(1);
    return `<line x1="${x(inner)}" y1="${y(inner)}" x2="${x(outer)}" y2="${y(outer)}"/>`;
  }).join("");
  return `<svg class="oeye" viewBox="0 0 128 128" aria-hidden="true">
    <defs>
      <radialGradient id="oe-glow"><stop offset="0" stop-color="var(--gold)" stop-opacity=".45"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></radialGradient>
      <radialGradient id="oe-iris" cx=".42" cy=".4" r=".6"><stop offset="0" stop-color="#f6dc93"/><stop offset=".5" stop-color="#c08e34"/><stop offset="1" stop-color="#4a3410"/></radialGradient>
    </defs>
    <circle class="oe-glow" cx="64" cy="66" r="62" fill="url(#oe-glow)"/>
    <g class="oe-rays">${rays}</g>
    <path class="oe-tri" d="M64 22 L104 92 L24 92 Z"/>
    <g class="oe-eye">
      <path class="oe-white" d="M38 72 Q64 50 90 72 Q64 94 38 72 Z"/>
      <circle cx="64" cy="72" r="10" fill="url(#oe-iris)"/>
      <circle cx="64" cy="72" r="4.2" fill="var(--ground)"/>
      <circle cx="61" cy="69" r="1.8" fill="#fff" opacity=".85"/>
    </g>
  </svg>`;
}
