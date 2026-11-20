# Google Maps visual for Power BI

A Power BI custom visual (`pbiviz`, API 5.x, TypeScript) that puts a Google Map in any report. You can import it into any report and drive it from data fields.

## Features

| Area | What it does |
|---|---|
| **Pins / bubbles** | Pin or circle markers. Size scales by area from a measure. Color comes from Legend or a gradient. Optional labels. |
| **Clustering** | Built-in grid clustering, recalculated on zoom. Click a cluster to zoom in; Ctrl+click selects all its points. |
| **Lines / routes** | Rows with the same **Path ID**, sorted by **Path order**, become polylines. Options: geodesic, direction arrows, length in the tooltip. |
| **Geography (shapes)** | A **Geometry** column holding GeoJSON *or* WKT (Point/Line/Polygon/Multi*/GeometryCollection). This works directly with SQL `geography.STAsText()`. |
| **Choropleth** | **GeoJSON URL** for boundaries (states, districts, pincodes). Features join to the **Location** field through a property name (default `name`) and are colored by Legend or a gradient. |
| **Heatmap** | Custom canvas heatmap, weighted by Size. Google removed its own HeatmapLayer in May 2026, so the visual draws its own. |
| **Geocoding** | Rows that have **Location** but no lat/long are geocoded with Google, cached for the session and throttled. |
| **Map options** | Roadmap / satellite / hybrid / terrain, Style JSON, Map ID (cloud styling and Advanced Markers), traffic / transit / bicycling layers, auto-zoom to data, controls on/off. |
| **Power BI integration** | Cross-filtering and highlighting (click, Ctrl+click, click the map to clear), bookmark-aware selection, native tooltips plus report-page tooltips, right-click context menu (drill-through), legend, landing page, up to 30,000 rows. |

## Data fields

| Field | Use |
|---|---|
| Location / Address / Key | Point name, an address to geocode, or the GeoJSON join key |
| Latitude, Longitude | Decimal degrees. Set them to **Don't summarize**. |
| Legend | Category color |
| Size / Weight | Bubble size and heatmap weight |
| Color saturation | Gradient color (when Legend is empty) |
| Path / Route ID + Path order | Lines |
| Geometry (GeoJSON / WKT) | Shapes per row |
| Tooltips | Extra tooltip measures |

## Build

Requirements: Node 18+.

```bash
npm install -g powerbi-visuals-tools     # gives the `pbiviz` command
npm install
pbiviz install-cert                      # one time, for the dev server
pbiviz start                             # live dev in Power BI Service (Developer visual)
pbiviz package                           # -> dist/googleMapsVisual*.pbiviz
```

If `npm install` reports version conflicts, bump `powerbi-visuals-api` in `package.json` and `apiVersion` in `pbiviz.json` to the version that `pbiviz new test` generates on your machine.

Import the `.pbiviz` file through **Visualizations → … → Import a visual from a file**, or publish it to your tenant through **Admin portal → Organizational visuals** so every report can use it.

## Google setup

1. In Google Cloud Console, enable **Maps JavaScript API**, plus **Geocoding API** if you use geocoding, and turn on billing.
2. Create an API key. **Use API restrictions, not HTTP-referrer restrictions.** Power BI runs visuals in a sandboxed iframe with a `null` origin, so referrer-restricted keys are rejected.
3. Optional: create a **Map ID** (JavaScript, vector). It enables Advanced Markers and cloud-based styling. `DEMO_MAP_ID` works for testing. With a Map ID set, *Style JSON* is ignored (Google's rule), so style the map in the Cloud Console instead.
4. Paste the key in **Format visual → Map → Google Maps API key**.

> The key is saved in the report, so anyone who can edit the report can read it. Use a dedicated key with API restrictions and quotas.

## Things to know

- **Not AppSource-certifiable.** Certified visuals may not call external services. Distribute this one as an organizational visual. The `WebAccess` privilege in `capabilities.json` lists the Google domains it needs.
- **GeoJSON URLs** must be on a host listed in `WebAccess` (`raw.githubusercontent.com` is included as an example). Add your own host and re-package.
- **Changing the API key** requires reloading the report page, because Google Maps can only be loaded once per page.
- **Geocoding** costs money per request and is rate-limited. For more than a few hundred addresses, geocode once in your pipeline (Power Query, SQL) and store lat/long.
- **Performance.** Tens of thousands of points work with clustering on. Without clustering, the *Max markers* setting caps rendering (default 5,000).
- **Deprecated Google features avoided:** `HeatmapLayer` and `KmlLayer` (removed), the Drawing library (deprecated). Classic `Marker` is used only when no Map ID is set.
- **Licensing.** Your use must follow the Google Maps Platform Terms, including attribution, which the map shows automatically.

## Project layout

```
capabilities.json      data roles, formatting objects, WebAccess privilege
pbiviz.json            visual metadata
src/visual.ts          map lifecycle, markers, clusters, lines, shapes, selection, tooltips, geocoding
src/settings.ts        Format pane (formatting model)
src/dataParser.ts      table dataView -> rows, colors, tooltips
src/geometry.ts        GeoJSON / WKT parsing
src/clustering.ts      grid clustering
src/heatmapOverlay.ts  canvas heatmap OverlayView
src/mapsLoader.ts      Google Maps script loader + auth-failure hook
style/visual.less      styles
sample-data/sample.csv stores, routes and WKT zones to try it out
```

## Trying the sample

Load `sample-data/sample.csv`, then map:

- Location → Location
- Latitude / Longitude → Latitude / Longitude
- Category → Legend
- Sales → Size
- RouteId → Path ID
- Seq → Path order
- Geometry → Geometry
