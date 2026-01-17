// D3 and TopoJSON utility for world map rendering
import * as d3 from "d3";
import { feature } from "topojson-client";

export type CountryStatus = "visited" | "wishlist" | undefined;

const COLORS = {
  default: "#4a5568",
  visited: "#4caf50",
  wishlist: "#ffc107",
  hover: "#6b7280",
  stroke: "#1a1a2e",
};

export function createTravelMap(
  container: HTMLElement,
  statuses: Record<string, CountryStatus>,
  onCountryClick: (id: string, status: CountryStatus) => void
) {
  let currentStatuses = { ...statuses };

  const containerRect = container.getBoundingClientRect();
  const width = containerRect.width || 1000;
  const height = containerRect.height || 600;

  container.innerHTML = "";

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "100%");

  // Add gradient background
  const defs = svg.append("defs");
  const gradient = defs
    .append("linearGradient")
    .attr("id", "ocean-gradient")
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "100%")
    .attr("y2", "100%");
  gradient.append("stop").attr("offset", "0%").attr("stop-color", "#1a1a2e");
  gradient.append("stop").attr("offset", "100%").attr("stop-color", "#16213e");

  svg
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "url(#ocean-gradient)");

  // Create zoom behavior
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  const g = svg.append("g");

  // Tooltip
  const tooltip = d3
    .select(container)
    .append("div")
    .attr("class", "map-tooltip")
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "rgba(0, 0, 0, 0.85)")
    .style("color", "#fff")
    .style("padding", "8px 12px")
    .style("border-radius", "8px")
    .style("font-size", "14px")
    .style("opacity", 0)
    .style("z-index", 1000)
    .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)");

  let pathsGroup: d3.Selection<SVGGElement, unknown, null, undefined>;

  async function init() {
    const world = (await d3.json(import.meta.env.BASE_URL + "world-110m.json")) as any;
    const countries = feature(world, world.objects.countries) as any;
    const features = countries.features as GeoJSON.Feature[];

    const projection = d3
      .geoNaturalEarth1()
      .fitSize([width - 40, height - 40], countries)
      .translate([width / 2, height / 2]);

    const path = d3.geoPath(projection);

    pathsGroup = g.append("g");

    pathsGroup
      .selectAll<SVGPathElement, GeoJSON.Feature>("path")
      .data(features)
      .join("path")
      .attr("d", path)
      .attr("fill", (d: any) => getColor(d.id))
      .attr("stroke", COLORS.stroke)
      .attr("stroke-width", 0.5)
      .attr("cursor", "pointer")
      .on("mouseover", function (event, d: any) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("stroke-width", 2)
          .attr("stroke", "#00d9ff");

        const name = d.properties?.name || "Unknown";
        const status = currentStatuses[d.id];
        let statusText = "";
        if (status === "visited") statusText = " ✅ Visited";
        else if (status === "wishlist") statusText = " ⭐ Want to visit";

        tooltip
          .html(`<strong>${name}</strong>${statusText}`)
          .style("opacity", 1);
      })
      .on("mousemove", function (event) {
        const [x, y] = d3.pointer(event, container);
        tooltip.style("left", x + 15 + "px").style("top", y - 10 + "px");
      })
      .on("mouseout", function () {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("stroke-width", 0.5)
          .attr("stroke", COLORS.stroke);
        tooltip.style("opacity", 0);
      })
      .on("click", function (event, d: any) {
        event.stopPropagation();
        const currentStatus = currentStatuses[d.id];
        let newStatus: CountryStatus;

        // Cycle through: none -> visited -> wishlist -> none
        if (!currentStatus) newStatus = "visited";
        else if (currentStatus === "visited") newStatus = "wishlist";
        else newStatus = undefined;

        onCountryClick(d.id, newStatus);
      });
  }

  function getColor(id: string): string {
    const status = currentStatuses[id];
    if (status === "visited") return COLORS.visited;
    if (status === "wishlist") return COLORS.wishlist;
    return COLORS.default;
  }

  function updateStatuses(newStatuses: Record<string, CountryStatus>) {
    currentStatuses = { ...newStatuses };
    if (pathsGroup) {
      pathsGroup
        .selectAll<SVGPathElement, GeoJSON.Feature>("path")
        .transition()
        .duration(300)
        .attr("fill", (d: any) => getColor(d.id));
    }
  }

  init();

  return { updateStatuses };
}
