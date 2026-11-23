/** The world map: countries colored by leading genre, zoom, and regions when zoomed in. */

import { geoCentroid, geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { type Selection, pointer, select } from "d3-selection";
import "d3-transition";
import { type D3ZoomEvent, type ZoomBehavior, type ZoomTransform, zoom, zoomIdentity, zoomTransform } from "d3-zoom";
import type { Feature, Geometry, MultiLineString } from "geojson";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

import { atlasName } from "../countries";
import { esc } from "../format";
import type { AppState } from "../state";
import type { Stats } from "../stats";
import type { GenreColors } from "./colors";

/** from this zoom level on, countries split into regions */
const REGION_ZOOM = 3;
type CountryFeature = Feature<Geometry, { name: string }>;
type RegionFeature = Feature<Geometry, { r: number }> & { country?: string };
export type Point = [number, number];

export interface MapEvents {
  /** a country (region null) or region was clicked */
  select(country: string, region: number | null, at: Point): void;
  /** a click outside any country with bands */
  background(): void;
  /** region mode turned on/off by zooming */
  regionalChanged(regional: boolean): void;
}

export class WorldMap {
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly shapes: Selection<SVGPathElement, CountryFeature, SVGGElement, unknown>;
  private readonly regionLayer: Selection<SVGGElement, unknown, null, undefined>;
  private readonly countryMesh: Selection<SVGPathElement, MultiLineString, null, undefined>;
  private readonly projection = geoNaturalEarth1();
  private readonly path = geoPath(this.projection);
  private readonly zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  private readonly features: CountryFeature[];
  /** world-atlas name -> Metal Archives country */
  private readonly fromAtlas = new Map<string, string>();
  private readonly loading = new Set<string>();
  private loadTimer: ReturnType<typeof setTimeout> | undefined;
  regional = false;
  /** genre highlighted from the legend */
  focus: string | null = null;

  constructor(
    svgElement: SVGSVGElement,
    private readonly stage: HTMLElement,
    private readonly tip: HTMLElement,
    topology: Topology<{ countries: GeometryCollection<{ name: string }> }>,
    private readonly state: AppState,
    private readonly colors: GenreColors,
    private readonly events: MapEvents,
  ) {
    for (const name of state.countries.keys()) this.fromAtlas.set(atlasName(name), name);
    this.svg = select(svgElement);
    const root = this.svg.append("g");
    const countries = feature(topology, topology.objects.countries) as unknown as { features: CountryFeature[] };
    this.features = countries.features.filter((f) => f.properties.name !== "Antarctica");
    root.append("path").datum({ type: "Sphere" }).attr("class", "sphere");
    root.append("path").datum(geoGraticule10()).attr("class", "grat");
    this.shapes = root
      .selectAll<SVGPathElement, CountryFeature>("path.country")
      .data(this.features)
      .join("path")
      .attr("class", "country");
    this.regionLayer = root.append("g").attr("class", "rlayer").attr("display", "none");
    this.countryMesh = root
      .append("path")
      .datum(mesh(topology, topology.objects.countries, (a, b) => a !== b))
      .attr("class", "cmesh")
      .attr("display", "none");

    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 60])
      .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        root.attr("transform", e.transform.toString());
        this.onZoom(e.transform);
      });
    this.svg.call(this.zoomBehavior).on("dblclick.zoom", null);
    this.bindCountries();
    this.layout();
    new ResizeObserver(() => this.layout()).observe(stage);
  }

  countryOf(feature: CountryFeature): string | undefined {
    return this.fromAtlas.get(feature.properties.name);
  }

  zoomBy(factor: number): void {
    this.zoomBehavior.scaleBy(this.svg.transition().duration(250), factor);
  }

  resetZoom(): void {
    this.zoomBehavior.transform(this.svg.transition().duration(350), zoomIdentity);
  }

  /** Where a country is on screen (for placing its card). */
  anchorOf(country: string): Point {
    const f = this.features.find((x) => x.properties.name === atlasName(country));
    const projected = f && this.projection(geoCentroid(f));
    if (!projected) return [this.stage.clientWidth / 2, 80];
    return zoomTransform(this.svg.node()!).apply(projected);
  }

  highlight(country: string | null, region: number | null): void {
    this.shapes.classed("sel", (d) => region == null && this.countryOf(d) === country);
    this.regionPaths().classed("sel", (f) => region != null && f.country === country && f.properties.r === region);
  }

  /** Colors countries and regions for the current counts and legend focus. */
  paint(): void {
    const { state, colors } = this;
    this.shapes
      .classed("has", (d) => {
        const c = this.countryOf(d);
        return !!c && state.stats(c).bands > 0;
      })
      .attr("fill", (d) => {
        const c = this.countryOf(d);
        const genre = c ? state.leadingGenre(state.stats(c)) : null;
        return genre ? colors.of(genre) : colors.land;
      })
      .classed("dim", (d) => {
        if (!this.focus) return false;
        const c = this.countryOf(d);
        return !c || colors.legendKey(state.leadingGenre(state.stats(c))) !== this.focus;
      });
    this.regionPaths()
      .classed("has", (f) => this.regionStats(f).bands > 0)
      .attr("fill", (f) => {
        const genre = state.leadingGenre(this.regionStats(f));
        return genre ? colors.of(genre) : colors.land;
      })
      .classed("dim", (f) => !!this.focus && colors.legendKey(state.leadingGenre(this.regionStats(f))) !== this.focus);
  }

  private regionPaths(): Selection<SVGPathElement, RegionFeature, SVGGElement, unknown> {
    return this.regionLayer.selectAll<SVGPathElement, RegionFeature>("path.region");
  }

  private regionStats(f: RegionFeature): Stats {
    return this.state.unitStats(f.country!, f.properties.r);
  }

  private layout(): void {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    this.svg.attr("viewBox", [0, 0, w, h].join(" "));
    this.projection.fitExtent(
      [
        [8, 8],
        [w - 8, h - 8],
      ],
      { type: "Sphere" },
    );
    this.svg.selectAll<SVGPathElement, never>("path").attr("d", (d) => this.path(d) ?? "");
  }

  private markUnder(): void {
    this.shapes.classed("under", (d) => {
      const c = this.countryOf(d);
      return this.regional && !!c && this.state.regions.has(c);
    });
  }

  private onZoom(transform: ZoomTransform): void {
    const regional = transform.k >= REGION_ZOOM;
    if (regional !== this.regional) {
      this.regional = regional;
      this.regionLayer.attr("display", regional ? null : "none");
      this.countryMesh.attr("display", regional ? null : "none");
      this.markUnder();
      this.events.regionalChanged(regional);
    }
    if (regional) {
      clearTimeout(this.loadTimer);
      this.loadTimer = setTimeout(() => this.loadVisibleRegions(transform), 120);
    }
  }

  /** Loads the regions of the countries on screen that are big enough to tell regions apart. */
  private loadVisibleRegions(transform: ZoomTransform): void {
    const width = this.stage.clientWidth;
    const height = this.stage.clientHeight;
    for (const f of this.features) {
      const country = this.countryOf(f);
      if (!country || !this.state.countries.get(country)?.r || this.loading.has(country)) continue;
      const [[x0, y0], [x1, y1]] = this.path.bounds(f);
      const [a0, b0] = transform.apply([x0, y0]);
      const [a1, b1] = transform.apply([x1, y1]);
      if (a1 < 0 || b1 < 0 || a0 > width || b0 > height) continue; // off screen
      if (a1 - a0 < 30 && b1 - b0 < 30) continue; // still too small
      void this.loadRegions(country);
    }
  }

  private async loadRegions(country: string): Promise<void> {
    this.loading.add(country);
    let regions;
    try {
      regions = await this.state.loadRegions(country);
    } catch {
      this.loading.delete(country); // try again on the next zoom
      return;
    }
    const fills = regions.file.fills.features as RegionFeature[];
    for (const f of fills) f.country = country;
    const group = this.regionLayer.append("g");
    const paths = group
      .selectAll<SVGPathElement, RegionFeature>("path.region")
      .data(fills)
      .join("path")
      .attr("class", "region")
      .attr("d", (d) => this.path(d) ?? "");
    group
      .append("path")
      .datum(regions.file.borders)
      .attr("class", "rborder")
      .attr("d", (d) => this.path(d) ?? "");
    paths
      .on("mousemove", (e: MouseEvent, f) =>
        this.showTip(e, regions.names[f.properties.r] ?? "", this.state.countryName(country), this.regionStats(f)),
      )
      .on("mouseleave", () => (this.tip.hidden = true))
      .on("click", (e: MouseEvent, f) => {
        e.stopPropagation();
        if (!this.regionStats(f).bands) return;
        this.tip.hidden = true;
        this.events.select(country, f.properties.r, pointer(e, this.stage));
      });
    this.markUnder();
    this.paint();
  }

  private bindCountries(): void {
    this.shapes
      .on("mousemove", (e: MouseEvent, d) => {
        const c = this.countryOf(d);
        this.showTip(e, c ? this.state.countryName(c) : d.properties.name, null, c ? this.state.stats(c) : null);
      })
      .on("mouseleave", () => (this.tip.hidden = true))
      .on("click", (e: MouseEvent, d) => {
        const c = this.countryOf(d);
        if (!c || !this.state.stats(c).bands) return;
        this.tip.hidden = true;
        this.events.select(c, null, pointer(e, this.stage));
      });
    this.svg.on("click", (e: MouseEvent) => {
      if (!(e.target as Element).classList.contains("has")) this.events.background();
    });
  }

  private showTip(e: MouseEvent, title: string, subtitle: string | null, stats: Stats | null): void {
    const [x, y] = pointer(e, this.stage);
    const genre = this.state.leadingGenre(stats ?? undefined);
    const t = this.state.t;
    this.tip.innerHTML =
      `<b>${esc(title)}</b>` +
      (subtitle ? `<span class="m">${esc(subtitle)}</span>` : "") +
      (stats?.bands && genre
        ? `<span class="m">${t("bands", stats.bands)}</span><span><span class="sw" style="background:${this.colors.of(genre)}"></span>${esc(genre)}</span>`
        : `<span class="m">${stats ? t("tipNoneSel") : t("tipNone")}</span>`);
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${y}px`;
    this.tip.hidden = false;
  }
}
