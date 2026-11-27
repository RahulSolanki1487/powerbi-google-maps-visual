# Angular test harness for the Google Maps visual

Runs the real visual (`../src/visual.ts`) in a plain browser tab, with a mock Power BI host and a DataView built from CSV. Use it to try the visual without Power BI.

## Run

```bash
cd sample-angular-app
npm install
npm run dev        # rebuilds the visual on every change + ng serve on http://localhost:4200
```

`npm start` builds the visual once and then serves. `npm run build:visual` only rebuilds the bundle.

After the visual rebuilds, click **Reload visual** in the page (or refresh).

## Using it

Click **How to setup** in the page header (or open `/?setup`) for step-by-step instructions: Google key, building the `.pbiviz`, using it in Power BI Desktop/Service, and embedding the report in your own app. The same steps are in the repo's root README.

1. Paste a Google Maps API key and press **Apply** (it is kept in `localStorage`; nothing is sent anywhere except Google). Use API restrictions rather than HTTP-referrer restrictions, or add `http://localhost:4200/*`.
2. Pick an example from the **Examples** menu: pins, bubbles, labels, legend colors, gradient, clustering, routes, geodesic lines, WKT polygons, GeoJSON geometry, choropleth, heatmap, geocoding, map type & layers, or everything together. Each one loads its own data, role mapping and format settings and redraws the map. Open one directly with `?scenario=<id>`, for example `http://localhost:4200/?scenario=heatmap`. You can also upload your own CSV and map each column to a data role.
3. Edit the **Format objects** JSON to try format-pane settings (names match `capabilities.json`).
4. Click markers/shapes to see selection, hover for tooltips, right-click for the context-menu event. The log shows what the visual asked the host to do.

## How it works

| File | Purpose |
|---|---|
| `scripts/build-visual.mjs` | esbuild bundle of `../src/visual.ts` (+ `style/visual.less`) into `public/visual/` |
| `src/app/scenarios/scenarios.ts` | The example menu: add an entry here to add an example (no other code changes) |
| `public/geojson/zones.geojson` | Boundaries used by the choropleth example |
| `src/app/mock/mock-host.ts` | Fake `IVisualHost`: selection manager, tooltips, colour palette, rendering events |
| `src/app/mock/dataview-builder.ts` | CSV → `DataView` table with data roles |
| `src/app/visual-loader.ts` | Loads the bundle and returns the `Visual` class |

Not covered: report-page tooltips, bookmarks, real cross-visual filtering and the format pane (use `pbiviz start` for those).
