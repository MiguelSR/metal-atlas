/** Text helpers. */

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** Escapes text for HTML content and attribute values. */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Lowercase without accents: "Motörhead" -> "motorhead". Keeps the length of plain-ASCII names. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Metal Archives' default URL slug of a band name ("Iron Maiden" -> "Iron_Maiden"). */
export function slugOf(name: string): string {
  return encodeURIComponent(name.replace(/ /g, "_")).replace(
    /[!'()*]/g,
    (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function bandUrl(id: number, name: string, slug?: string | 0 | null): string {
  const path = typeof slug === "string" && slug !== "" ? slug : slugOf(name); // 0 or nothing: the default slug
  return `https://www.metal-archives.com/bands/${path}/${id}`;
}

export function numberFormatter(lang: string): (n: number) => string {
  const format = new Intl.NumberFormat(lang === "es" ? "es-ES" : "en-US");
  return (n) => format.format(n);
}

/** `text` with its first occurrence of `query` (both folded) wrapped in <mark>, escaped. */
export function highlight(text: string, query: string): string {
  const folded = fold(text);
  const at = query ? folded.indexOf(query) : -1;
  if (at < 0 || folded.length !== text.length) return esc(text);
  return `${esc(text.slice(0, at))}<mark>${esc(text.slice(at, at + query.length))}</mark>${esc(text.slice(at + query.length))}`;
}
