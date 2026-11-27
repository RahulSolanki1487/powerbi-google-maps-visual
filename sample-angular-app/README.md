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

1. Paste a Google Maps API key and press **Apply** (it is kept in `localStorage`; nothing is sent anywhere except Google). Use API restrictions rather than HTTP-referrer restrictions, or add `http://localhost:4200/*`.
2. The sample data (`../sample-data/sample.csv`) loads automatically. Upload your own CSV and map each column to a data role.
3. Edit the **Format objects** JSON to try format-pane settings (names match `capabilities.json`).
4. Click markers/shapes to see selection, hover for tooltips, right-click for the context-menu event. The log shows what the visual asked the host to do.

## How it works

| File | Purpose |
|---|---|
| `scripts/build-visual.mjs` | esbuild bundle of `../src/visual.ts` (+ `style/visual.less`) into `public/visual/` |
| `src/app/mock/mock-host.ts` | Fake `IVisualHost`: selection manager, tooltips, colour palette, rendering events |
| `src/app/mock/dataview-builder.ts` | CSV → `DataView` table with data roles |
| `src/app/visual-loader.ts` | Loads the bundle and returns the `Visual` class |

Not covered: report-page tooltips, bookmarks, real cross-visual filtering and the format pane (use `pbiviz start` for those).
