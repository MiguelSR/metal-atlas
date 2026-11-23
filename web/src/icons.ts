/** Inline SVG icons (decorative: buttons carry their own labels). */

const svg = (viewBox: string, path: string): string =>
  `<svg viewBox="${viewBox}" aria-hidden="true"><path d="${path}"/></svg>`;

export const ICONS = {
  play: svg("0 0 16 16", "M4.5 2.5v11l9-5.5z"),
  pause: svg("0 0 16 16", "M4 2.5h3v11H4zm5 0h3v11H9z"),
  next: svg("0 0 16 16", "M3 2.5v11l7-5.5zM11 2.5h2v11h-2z"),
  close: svg("0 0 16 16", "M4 2.6 8 6.6l4-4L13.4 4l-4 4 4 4-1.4 1.4-4-4-4 4L2.6 12l4-4-4-4z"),
  volume: svg(
    "0 0 24 24",
    "M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
  ),
  spinner: svg("0 0 16 16", "M8 1.5a6.5 6.5 0 1 0 6.5 6.5h-2A4.5 4.5 0 1 1 8 3.5z"),
} as const;
