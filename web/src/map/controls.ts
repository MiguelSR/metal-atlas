/** Header controls: texts in the viewer's language, language switch, formation-year filter, country finder. */

import { esc } from "../format";
import { type Lang, type Translate, saveLang } from "../i18n";
import type { YearRange } from "../stats";

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const input = (id: string): HTMLInputElement => $(id) as HTMLInputElement;

/** Puts the static texts of index.html in the viewer's language. */
export function translatePage(t: Translate, lang: Lang): void {
  const text = (el: Element | null, value: string): void => {
    if (el) el.textContent = value;
  };
  const attr = (el: Element | null, name: string, value: string): void => el?.setAttribute(name, value);
  document.documentElement.lang = lang;
  text($("sub"), t("loading"));
  attr($("bq"), "placeholder", t("searchPh"));
  attr($("bq"), "aria-label", t("searchAl"));
  attr(document.querySelector(".years"), "aria-label", t("yearsAl"));
  text(document.querySelector(".years span"), t("formed"));
  attr($("yFrom"), "placeholder", t("from"));
  attr($("yFrom"), "aria-label", t("formedFromAl"));
  attr($("yTo"), "placeholder", t("to"));
  attr($("yTo"), "aria-label", t("formedToAl"));
  text($("yClear"), t("clearYears"));
  attr(document.querySelector(".presets"), "aria-label", t("presetsAl"));
  attr($("q"), "placeholder", t("countryPh"));
  attr($("q"), "aria-label", t("countryAl"));
  attr($("map"), "aria-label", t("mapAl"));
  text($("loading"), t("loadingBands"));
  attr($("zin"), "aria-label", t("zoomIn"));
  attr($("zout"), "aria-label", t("zoomOut"));
  attr($("zreset"), "aria-label", t("resetView"));
  attr($("np"), "aria-label", t("playerAl"));
  attr($("mode"), "title", t("modeTitle"));
  text($("mode"), t("modeGame"));
  const credits = document.querySelector(".credits");
  if (credits) {
    credits.innerHTML = credits.innerHTML
      .replace(/^Data:/, `${t("credData")}:`)
      .replace("· Geography:", `· ${t("credGeo")}:`);
  }
  const switcher = $("lang");
  switcher.innerHTML = lang === "es" ? "EN · <b>ES</b>" : "<b>EN</b> · ES";
  switcher.title = t("langTitle");
  switcher.setAttribute("aria-label", t("langTitle"));
  switcher.onclick = () => {
    saveLang(lang === "es" ? "en" : "es");
    location.reload();
  };
}

/** A typed year, if plausible. */
export function parseYear(value: string): number | null {
  const year = Number.parseInt(value, 10);
  return Number.isFinite(year) && year > 1900 && year < 2100 ? year : null;
}

/** From/to fields (swapped if reversed). */
export function yearRange(from: string, to: string): YearRange {
  const lo = parseYear(from);
  const hi = parseYear(to);
  return lo != null && hi != null && lo > hi ? { lo: hi, hi: lo } : { lo, hi };
}

/** The year fields, the clear button and the decade presets ("1980-1989", "-1979", "2020-"). */
export function bindYearFilter(onChange: (years: YearRange) => void): void {
  const from = input("yFrom");
  const to = input("yTo");
  const clear = $("yClear");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const apply = (): void => {
    const years = yearRange(from.value, to.value);
    clear.hidden = years.lo == null && years.hi == null;
    onChange(years);
  };
  for (const field of [from, to]) {
    field.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(apply, 250);
    });
  }
  clear.onclick = () => {
    from.value = "";
    to.value = "";
    apply();
  };
  document.querySelectorAll<HTMLElement>(".presets button").forEach((button) => {
    button.onclick = () => {
      const [a = "", z = ""] = (button.dataset.r ?? "").split("-");
      from.value = a;
      to.value = z;
      apply();
    };
  });
}

/** The country finder (a datalist of names in the viewer's language). */
export function bindCountryFinder(
  countries: string[],
  countryName: (c: string) => string,
  open: (country: string) => void,
): void {
  const sorted = [...countries].sort((a, b) => countryName(a).localeCompare(countryName(b), "en"));
  const byLabel = new Map<string, string>();
  for (const c of sorted) {
    byLabel.set(countryName(c).toLowerCase(), c);
    byLabel.set(c.toLowerCase(), c);
  }
  $("clist").innerHTML = sorted.map((c) => `<option value="${esc(countryName(c))}"></option>`).join("");
  const finder = input("q");
  finder.addEventListener("change", () => {
    const country = byLabel.get(finder.value.trim().toLowerCase());
    if (!country) return;
    open(country);
    finder.value = "";
    finder.blur();
  });
}
