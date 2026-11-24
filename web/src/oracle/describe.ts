/** How a query reads to the viewer: the "understood as" chips under each answer. */

import type { Translate } from "../i18n";
import { type Query, STATUSES } from "./query";

export function describeQuery(query: Query, t: Translate, countryName: (country: string) => string): string[] {
  const field = t("oField");
  const chips = [t("oIntents")[query.intent]];
  if (query.intent === "unsupported") return chips;
  if (query.groupBy) chips.push(t("oGroupBy")[query.groupBy]);
  if (query.band) chips.push(`${field.band}: ${query.band}`);
  if (query.genre) chips.push(`${field.genre}: ${query.genre.join(" + ")}`);
  if (query.country) chips.push(`${field.country}: ${countryName(query.country)}`);
  if (query.location) chips.push(`${field.location}: ${query.location}`);
  if (query.status) chips.push(t("status")[STATUSES.indexOf(query.status) + 1]!);
  const from = query.formedFrom ?? null;
  const to = query.formedTo ?? null;
  if (from && to) chips.push(from === to ? t("oFormedRow", from) : t("yrRange", from, to));
  else if (from) chips.push(t("yrFrom", from));
  else if (to) chips.push(t("yrTo", to));
  if (query.themes) chips.push(`${field.themes}: ${query.themes.join(" + ")}`);
  if (query.label) chips.push(`${field.label}: ${query.label}`);
  if (query.member) chips.push(`${field.member}: ${query.member}`);
  if (query.role) chips.push(`${field.role}: ${query.role}`);
  if (query.album) chips.push(`${field.album}: ${query.album}`);
  if (query.albumType) chips.push(`${field.albumType}: ${query.albumType}`);
  if (query.releasedFrom || query.releasedTo)
    chips.push(t("oReleased", query.releasedFrom ?? null, query.releasedTo ?? null));
  if (query.sort && query.sort !== "relevance") chips.push(t("oSorts")[query.sort]);
  if (query.limit) chips.push(t("oLimit", query.limit));
  return chips;
}
