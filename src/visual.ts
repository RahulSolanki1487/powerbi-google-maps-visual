"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import { VisualSettings } from "./settings";
import { loadGoogleMaps, onAuthFailure, isAuthFailed } from "./mapsLoader";
import { MapRow, ParsedData, parseData, emptyData } from "./dataParser";
import { clusterPoints, Cluster, ClusterPoint } from "./clustering";
import { createHeatmapOverlay, HeatmapOverlay } from "./heatmapOverlay";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

declare const google: any;

// powerbi.VisualUpdateType flags (const enum in the API typings).
const UPDATE_RESIZE = 4;
const UPDATE_RESIZE_END = 16;

const PIN_PATH = "M12 0C7.03 0 3 4.03 3 9c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z";
const DIM = 0.22;

/** Describes how one marker looks: color, size, shape, opacity and an optional label or cluster count. */
interface MarkerStyle {
    color: string;
    size: number;
    shape: "pin" | "circle";
    opacity: number;
    label?: string;
    clusterCount?: number;
}

/** Describes what a marker does: its click action, its tooltip content and the data rows it stands for. */
interface MarkerHandlers {
    onClick: (ev: MouseEvent | undefined) => void;
    tooltip: () => VisualTooltipDataItem[];
    ids: () => ISelectionId[];
}

/** Describes a marker on the map that remembers its data rows and can be dimmed or removed. */
interface PointHandle {
    rowIndices: number[];
    /** Dims the marker when true, or restores it to normal when false. */
    setDim(dim: boolean): void;
    /** Removes the marker from the map. */
    remove(): void;
}

/** Describes a line on the map with its data rows, the drawn path and its normal opacity. */
interface LineHandle {
    rowIndices: number[];
    polyline: any;
    baseOpacity: number;
}

/** The main Power BI visual that draws markers, lines, shapes and a heatmap on a Google map and handles selection, tooltips, legend and geocoding. */
export class Visual implements IVisual {
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private fmtService = new FormattingSettingsService();
    private settings: VisualSettings = new VisualSettings();

    private root: HTMLElement;
    private mapEl: HTMLDivElement;
    private messageEl: HTMLDivElement;
    private warnEl: HTMLDivElement;
    private legendEl: HTMLDivElement;

    private map: any = null;
    private currentMapId: string | null = null;
    private data: ParsedData = emptyData();
    private selectedKeys = new Set<string>();

    private points: PointHandle[] = [];
    private lines: LineHandle[] = [];
    private rowGeoLayer: any = null;
    private urlGeoLayer: any = null;
    private urlLoaded: string | null = null;
    private urlLoading: string | null = null;
    private joinIndex = new Map<string, number>();
    private heat: HeatmapOverlay | null = null;
    private heatOnMap = false;
    private trafficLayer: any = null;
    private transitLayer: any = null;
    private bicyclingLayer: any = null;

    private geocoder: any = null;
    private geocodeCache = new Map<string, { lat: number; lng: number } | null>();
    private geocodeAttempts = new Map<string, number>();
    private geocodeQueue: string[] = [];
    private geocodeRunning = false;
    private geocodeTimer: any = null;

    private lastFitSignature = "";
    private lastClusterZoom = -1;
    private pointsDirty = false;
    private suppressMapClickUntil = 0;
    private updateToken = 0;

    /** Sets up the visual: creates the selection manager and the page elements for map, legend, warning and message, and shows a message if the API key is rejected. */
    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.selectionManager.registerOnSelectCallback(() => this.applySelection());

        this.root = options.element;
        this.root.classList.add("gmv-root");

        this.mapEl = this.div("gmv-map");
        this.legendEl = this.div("gmv-legend");
        this.warnEl = this.div("gmv-warn");
        this.messageEl = this.div("gmv-message");

        onAuthFailure(() => this.showMessage(
            "Google rejected the API key",
            "Check that the key is valid, billing is enabled, and the Maps JavaScript API (plus Geocoding API if used) is enabled. " +
            "Power BI hosts visuals in a sandboxed iframe with a null origin, so HTTP-referrer restrictions on the key will block it — use API restrictions instead."
        ));
    }

    // ------------------------------------------------------------------ update

    /** Handles each Power BI update by reading settings and data, checking the API key, loading Google Maps and redrawing the map. */
    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.settings = this.fmtService.populateFormattingSettingsModel(VisualSettings, dataView);

            const t = options.type;
            if (this.map && (t === UPDATE_RESIZE || t === UPDATE_RESIZE_END || t === (UPDATE_RESIZE | UPDATE_RESIZE_END))) {
                // Google Maps follows its container size on its own.
                this.host.eventService.renderingFinished(options);
                return;
            }

            const key = (this.settings.map.apiKey.value || "").trim();
            if (!key) {
                this.showMessage(
                    "Google Maps for Power BI",
                    "Open Format visual → Map and paste your Google Maps API key. Then add Latitude + Longitude, an address in Location " +
                    "(turn on Geocoding), a Path ID for lines, or a Geometry column (GeoJSON / WKT) for shapes."
                );
                this.host.eventService.renderingFinished(options);
                return;
            }
            if (isAuthFailed()) {
                this.host.eventService.renderingFailed(options, "Google Maps API key rejected");
                return;
            }

            this.data = parseData(dataView, this.host, this.settings);
            const token = ++this.updateToken;

            loadGoogleMaps(key)
                .then(() => {
                    if (token !== this.updateToken) { return; }
                    this.hideMessage();
                    this.ensureMap();
                    this.applyGeocodeCache();
                    this.queueGeocoding();
                    this.renderAll();
                    this.host.eventService.renderingFinished(options);
                })
                .catch((e: Error) => {
                    this.showMessage("Google Maps could not be loaded", e.message);
                    this.host.eventService.renderingFailed(options, e.message);
                });
        } catch (e) {
            const msg = (e && (e as Error).message) || String(e);
            this.showMessage("Something went wrong", msg);
            this.host.eventService.renderingFailed(options, msg);
        }
    }

    /** Returns the formatting model that Power BI shows in the format pane. */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.fmtService.buildFormattingModel(this.settings);
    }

    /** Cleans up the map when Power BI removes the visual. */
    public destroy(): void {
        this.destroyMap();
    }

    // ------------------------------------------------------------------ map lifecycle

    /** Creates the Google map if needed, or rebuilds it when the map ID changed, and hooks up click, right click and idle events. */
    private ensureMap(): void {
        const s = this.settings.map;
        const mapId = (s.mapId.value || "").trim() || null;

        // A Map ID can only be set when the map is constructed.
        if (this.map && this.currentMapId !== mapId) { this.destroyMap(); }

        if (!this.map) {
            this.map = new google.maps.Map(this.mapEl, {
                center: { lat: s.defaultLat.value, lng: s.defaultLng.value },
                zoom: s.defaultZoom.value,
                mapId: mapId || undefined,
                gestureHandling: "greedy",
                clickableIcons: false
            });
            this.currentMapId = mapId;
            this.lastFitSignature = "";
            this.lastClusterZoom = -1;

            this.map.addListener("click", () => {
                if (Date.now() < this.suppressMapClickUntil) { return; }
                this.selectionManager.clear().then(() => this.applySelection());
            });
            this.map.addListener("contextmenu", (e: any) => {
                if (e && e.domEvent) {
                    this.selectionManager.showContextMenu({} as ISelectionId, this.pos(e.domEvent));
                }
            });
            this.map.addListener("idle", () => this.onIdle());

            this.rowGeoLayer = this.createDataLayer(f => {
                const i = f.getProperty("__row");
                return typeof i === "number" ? i : undefined;
            });
            this.urlGeoLayer = this.createDataLayer(f => this.urlRowFor(f));

            this.geocoder = new google.maps.Geocoder();
            this.trafficLayer = new google.maps.TrafficLayer();
            this.transitLayer = new google.maps.TransitLayer();
            this.bicyclingLayer = new google.maps.BicyclingLayer();
            this.heat = createHeatmapOverlay();
            this.heatOnMap = false;
            this.urlLoaded = null;
        }

        let styles: any = null;
        const styleText = (s.styleJson.value || "").trim();
        if (!mapId && styleText) {
            try { styles = JSON.parse(styleText); } catch { this.showWarning("Style JSON is not valid JSON and was ignored."); }
        }

        this.map.setOptions({
            mapTypeId: s.mapType.value.value,
            zoomControl: s.zoomControl.value,
            mapTypeControl: s.mapTypeControl.value,
            streetViewControl: s.streetViewControl.value,
            fullscreenControl: s.fullscreenControl.value,
            styles: mapId ? undefined : styles
        });

        this.trafficLayer.setMap(s.traffic.value ? this.map : null);
        this.transitLayer.setMap(s.transit.value ? this.map : null);
        this.bicyclingLayer.setMap(s.bicycling.value ? this.map : null);
    }

    /** Removes all markers, lines, layers and listeners and discards the map. */
    private destroyMap(): void {
        if (!this.map) { return; }
        this.clearPoints();
        this.clearLines();
        if (this.heat) { this.heat.setMap(null); }
        [this.rowGeoLayer, this.urlGeoLayer, this.trafficLayer, this.transitLayer, this.bicyclingLayer]
            .forEach(l => { if (l) { l.setMap(null); } });
        google.maps.event.clearInstanceListeners(this.map);
        this.mapEl.replaceChildren();
        this.map = null;
        this.rowGeoLayer = this.urlGeoLayer = null;
        this.heat = null;
        this.heatOnMap = false;
        this.urlLoaded = this.urlLoading = null;
    }

    /** Runs when the map stops moving, redrawing clustered markers if the zoom changed and refreshing the heatmap. */
    private onIdle(): void {
        if (!this.map) { return; }
        const zoom = this.map.getZoom();
        if (this.settings.markers.cluster.value && (this.pointsDirty || zoom !== this.lastClusterZoom)) {
            this.pointsDirty = false;
            this.renderPoints();
            this.applySelection();
        }
        if (this.heat && this.heatOnMap) { this.heat.draw(); }
    }

    // ------------------------------------------------------------------ rendering

    /** Redraws everything on the map: shapes, lines, markers, heatmap and legend, then fits the view and applies the selection. */
    private renderAll(): void {
        if (!this.map) { return; }
        this.clearWarning();
        this.rebuildJoinIndex();
        this.renderGeometryRows();
        this.renderUrlGeo();
        this.renderLines();
        this.renderPoints();
        this.renderHeatmap();
        this.renderLegend();
        this.fitIfNeeded();
        this.applySelection();
    }

    /** Draws the markers, grouping nearby points into clusters when clustering is on, and skips points that belong to hidden path lines. */
    private renderPoints(): void {
        this.clearPoints();
        const ms = this.settings.markers;
        if (!ms.show.value || !this.map) { return; }

        const ls = this.settings.lines;
        const hidePathPoints = this.data.roles["pathId"] && ls.show.value && !ls.showPathPoints.value;

        const pts: ClusterPoint[] = [];
        this.data.rows.forEach(r => {
            if (r.lat === undefined || r.lng === undefined) { return; }
            if (hidePathPoints && r.pathId !== undefined) { return; }
            pts.push({ lat: r.lat, lng: r.lng, rowIndex: r.index });
        });
        if (!pts.length) { return; }

        const zoom = this.map.getZoom();
        this.lastClusterZoom = zoom;

        if (ms.cluster.value && pts.length > 1 && zoom < 18) {
            const proj = this.map.getProjection();
            if (!proj) { this.pointsDirty = true; return; }
            const clusters = clusterPoints(pts, zoom, ms.clusterRadius.value, (lat, lng) => {
                const p = proj.fromLatLngToPoint(new google.maps.LatLng(lat, lng));
                return { x: p.x, y: p.y };
            });
            clusters.forEach(c => this.points.push(
                c.rowIndices.length === 1 ? this.createRowMarker(this.data.rows[c.rowIndices[0]]) : this.createClusterMarker(c)
            ));
        } else {
            const max = Math.max(1, Math.floor(ms.maxMarkers.value || 5000));
            pts.slice(0, max).forEach(p => this.points.push(this.createRowMarker(this.data.rows[p.rowIndex])));
            if (pts.length > max) {
                this.showWarning(`Showing ${max.toLocaleString()} of ${pts.length.toLocaleString()} points. Turn on clustering or raise "Max markers".`);
            }
        }
    }

    /** Creates a marker for a single data row with its color, size, shape, label, click action and tooltip. */
    private createRowMarker(row: MapRow): PointHandle {
        const ms = this.settings.markers;
        return this.createMarker(
            { lat: row.lat, lng: row.lng },
            {
                color: row.color,
                size: this.markerSize(row),
                shape: ms.shape.value.value as "pin" | "circle",
                opacity: clamp01(ms.opacity.value / 100),
                label: ms.showLabels.value ? (row.location || row.legend) : undefined
            },
            [row.index],
            {
                onClick: ev => this.onRowsClick([row.index], ev),
                tooltip: () => this.rowTooltip(row),
                ids: () => [row.id]
            }
        );
    }

    /** Creates a marker for a cluster of rows, sized by the count and colored by the most common legend group, which zooms in when clicked. */
    private createClusterMarker(c: Cluster): PointHandle {
        const rows = c.rowIndices.map(i => this.data.rows[i]);
        const n = rows.length;
        const counts = new Map<string, { color: string; n: number }>();
        rows.forEach(r => {
            const k = r.legend || "";
            const e = counts.get(k) || { color: r.color, n: 0 };
            e.n++;
            counts.set(k, e);
        });
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1].n - a[1].n);

        return this.createMarker(
            { lat: c.lat, lng: c.lng },
            {
                color: sorted[0][1].color,
                size: Math.round(28 + Math.log10(n) * 10),
                shape: "circle",
                opacity: 0.9,
                clusterCount: n
            },
            c.rowIndices,
            {
                onClick: ev => {
                    this.suppressMapClickUntil = Date.now() + 400;
                    if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
                        this.onRowsClick(c.rowIndices, ev);
                        return;
                    }
                    const b = new google.maps.LatLngBounds();
                    rows.forEach(r => b.extend({ lat: r.lat, lng: r.lng }));
                    if (b.getNorthEast().equals(b.getSouthWest())) {
                        this.map.setCenter(b.getCenter());
                        this.map.setZoom(this.map.getZoom() + 2);
                    } else {
                        this.map.fitBounds(b, 40);
                    }
                },
                tooltip: () => {
                    const items: VisualTooltipDataItem[] = [{ displayName: "Points", value: n.toLocaleString() }];
                    sorted.slice(0, 6).forEach(([name, e]) => {
                        if (name) { items.push({ displayName: name, value: e.n.toLocaleString(), color: e.color }); }
                    });
                    items.push({ displayName: "", value: "Click to zoom · Ctrl+click to select" });
                    return items;
                },
                ids: () => rows.map(r => r.id)
            }
        );
    }

    /** Creates an Advanced Marker when a Map ID is set, otherwise a classic marker. */
    private createMarker(pos: { lat: number; lng: number }, style: MarkerStyle, rowIndices: number[], h: MarkerHandlers): PointHandle {
        const useAdvanced = !!this.currentMapId && google.maps.marker && google.maps.marker.AdvancedMarkerElement;
        const isCluster = style.clusterCount !== undefined;

        if (useAdvanced) {
            const content = document.createElement("div");
            content.className = "gmv-marker";

            if (isCluster) {
                content.classList.add("gmv-cluster", "gmv-centered");
                content.style.width = content.style.height = `${style.size}px`;
                content.style.background = style.color;
                content.textContent = compactCount(style.clusterCount);
            } else if (style.shape === "pin") {
                content.appendChild(pinSvg(style.color, style.size));
            } else {
                content.classList.add("gmv-dot", "gmv-centered");
                content.style.width = content.style.height = `${style.size}px`;
                content.style.background = style.color;
            }
            if (style.label) {
                const lab = document.createElement("div");
                lab.className = "gmv-label";
                lab.textContent = style.label;
                content.appendChild(lab);
            }
            content.style.opacity = String(style.opacity);

            const marker = new google.maps.marker.AdvancedMarkerElement({ map: this.map, position: pos, content });
            marker.addListener("click", (e: any) => h.onClick(e && e.domEvent));
            this.attachDomTooltip(content, h);
            content.addEventListener("contextmenu", (ev: MouseEvent) => {
                ev.preventDefault();
                ev.stopPropagation();
                const ids = h.ids();
                this.selectionManager.showContextMenu(ids[0] || ({} as ISelectionId), this.pos(ev));
            });

            return {
                rowIndices,
                setDim: (dim: boolean) => { content.style.opacity = String(dim ? DIM : style.opacity); },
                remove: () => { marker.map = null; google.maps.event.clearInstanceListeners(marker); }
            };
        }

        // Classic marker with an SVG symbol (works with Style JSON, no Map ID needed).
        let icon: any;
        let label: any;
        if (isCluster) {
            icon = { path: google.maps.SymbolPath.CIRCLE, scale: style.size / 2, fillColor: style.color, fillOpacity: 0.9, strokeColor: "#ffffff", strokeWeight: 2 };
            label = { text: compactCount(style.clusterCount), color: "#ffffff", fontSize: "12px", fontWeight: "700" };
        } else if (style.shape === "pin") {
            icon = {
                path: PIN_PATH, anchor: new google.maps.Point(12, 24), scale: style.size / 24,
                fillColor: style.color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1.2,
                labelOrigin: new google.maps.Point(12, 32)
            };
        } else {
            icon = {
                path: google.maps.SymbolPath.CIRCLE, scale: style.size / 2,
                fillColor: style.color, fillOpacity: 0.85, strokeColor: "#ffffff", strokeWeight: 1.5,
                labelOrigin: new google.maps.Point(0, 2.6)
            };
        }
        if (!isCluster && style.label) {
            label = { text: style.label, color: "#202124", fontSize: "11px", fontWeight: "600" };
        }

        const marker = new google.maps.Marker({ map: this.map, position: pos, icon, label, opacity: style.opacity, optimized: true });
        marker.addListener("click", (e: any) => h.onClick(e && e.domEvent));
        marker.addListener("mouseover", (e: any) => this.showTooltip(e && e.domEvent, h.tooltip(), h.ids()));
        marker.addListener("mouseout", () => this.hideTooltip());
        marker.addListener("rightclick", (e: any) => {
            if (e && e.domEvent) {
                const ids = h.ids();
                this.selectionManager.showContextMenu(ids[0] || ({} as ISelectionId), this.pos(e.domEvent));
            }
        });

        return {
            rowIndices,
            setDim: (dim: boolean) => marker.setOpacity(dim ? DIM : style.opacity),
            remove: () => { google.maps.event.clearInstanceListeners(marker); marker.setMap(null); }
        };
    }

    /** Draws a line for each path by grouping rows by path ID, ordering them and adding optional arrows and click handling. */
    private renderLines(): void {
        this.clearLines();
        const ls = this.settings.lines;
        if (!ls.show.value || !this.data.roles["pathId"] || !this.map) { return; }

        const groups = new Map<string, MapRow[]>();
        this.data.rows.forEach(r => {
            if (r.pathId === undefined || r.lat === undefined || r.lng === undefined) { return; }
            const g = groups.get(r.pathId) || [];
            g.push(r);
            groups.set(r.pathId, g);
        });

        groups.forEach((rows, pathId) => {
            if (rows.length < 2) { return; }
            rows.sort(byPathOrder);

            const color = ls.colorByData.value ? rows[0].color : ls.color.value.value;
            const baseOpacity = clamp01(ls.opacity.value / 100);
            const width = Math.max(1, ls.width.value);
            const icons = ls.arrows.value
                ? [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5, strokeColor: color, fillColor: color, fillOpacity: 1 }, offset: "50%", repeat: "140px" }]
                : [];
            const path = rows.map(r => ({ lat: r.lat, lng: r.lng }));

            const polyline = new google.maps.Polyline({
                map: this.map, path, strokeColor: color, strokeOpacity: baseOpacity, strokeWeight: width,
                geodesic: ls.geodesic.value, icons, clickable: true, zIndex: 2
            });

            const rowIndices = rows.map(r => r.index);
            const ids = () => rows.map(r => r.id);
            const tooltip = (): VisualTooltipDataItem[] => {
                const km = google.maps.geometry && google.maps.geometry.spherical
                    ? google.maps.geometry.spherical.computeLength(polyline.getPath()) / 1000
                    : NaN;
                const items: VisualTooltipDataItem[] = [
                    { displayName: "Path", value: pathId, color },
                    { displayName: "Points", value: rows.length.toLocaleString() }
                ];
                if (isFinite(km)) { items.push({ displayName: "Length", value: `${km.toLocaleString(undefined, { maximumFractionDigits: 2 })} km` }); }
                if (rows[0].legend) { items.push({ displayName: this.data.legendTitle || "Legend", value: rows[0].legend }); }
                return items;
            };

            polyline.addListener("click", (e: any) => this.onRowsClick(rowIndices, e && e.domEvent));
            polyline.addListener("mouseover", (e: any) => {
                polyline.setOptions({ strokeWeight: width + 2 });
                this.showTooltip(e && e.domEvent, tooltip(), ids());
            });
            polyline.addListener("mousemove", (e: any) => this.showTooltip(e && e.domEvent, tooltip(), ids(), true));
            polyline.addListener("mouseout", () => {
                polyline.setOptions({ strokeWeight: width });
                this.hideTooltip();
            });
            polyline.addListener("contextmenu", (e: any) => {
                if (e && e.domEvent) { this.selectionManager.showContextMenu(rows[0].id, this.pos(e.domEvent)); }
            });

            this.lines.push({ rowIndices, polyline, baseOpacity });
        });
    }

    /** Draws the shapes found in the geometry column and shows a warning if some could not be drawn. */
    private renderGeometryRows(): void {
        const layer = this.rowGeoLayer;
        if (!layer) { return; }
        layer.forEach((f: any) => layer.remove(f));
        if (!this.settings.geography.show.value || !this.data.roles["geometry"]) { return; }

        let failed = 0;
        this.data.rows.forEach(r => r.geometries.forEach(g => {
            try {
                layer.addGeoJson({ type: "Feature", geometry: g, properties: { __row: r.index } });
            } catch {
                failed++;
            }
        }));
        if (failed) { this.showWarning(`${failed} geometr${failed === 1 ? "y" : "ies"} could not be drawn (invalid GeoJSON/WKT).`); }
        this.styleDataLayers();
    }

    /** Downloads the boundary file from the configured address and draws it on the map, warning when it cannot be loaded. */
    private renderUrlGeo(): void {
        const layer = this.urlGeoLayer;
        if (!layer) { return; }
        const g = this.settings.geography;
        const url = (g.geoJsonUrl.value || "").trim();

        if (!g.show.value || !url) {
            if (this.urlLoaded) { layer.forEach((f: any) => layer.remove(f)); }
            this.urlLoaded = this.urlLoading = null;
            return;
        }
        if (url === this.urlLoaded) { this.styleDataLayers(); return; }
        if (url === this.urlLoading) { return; }

        this.urlLoading = url;
        fetch(url)
            .then(r => { if (!r.ok) { throw new Error(`HTTP ${r.status}`); } return r.json(); })
            .then(json => {
                if (this.urlLoading !== url || !this.urlGeoLayer) { return; }
                layer.forEach((f: any) => layer.remove(f));
                layer.addGeoJson(json);
                this.urlLoaded = url;
                this.urlLoading = null;
                this.styleDataLayers();
                this.lastFitSignature = "";
                this.fitIfNeeded();
            })
            .catch((e: Error) => {
                this.urlLoading = null;
                this.showWarning(`Could not load GeoJSON (${e.message}). Add its host to WebAccess in capabilities.json and re-package.`);
            });
    }

    /** Shows, updates or hides the heatmap using the data points and heatmap settings. */
    private renderHeatmap(): void {
        if (!this.heat) { return; }
        const h = this.settings.heatmap;
        if (!h.show.value) {
            if (this.heatOnMap) { this.heat.setMap(null); this.heatOnMap = false; }
            return;
        }
        if (!this.heatOnMap) { this.heat.setMap(this.map); this.heatOnMap = true; }
        const pts = this.data.rows
            .filter(r => r.lat !== undefined && r.lng !== undefined)
            .map(r => ({ lat: r.lat, lng: r.lng, weight: r.size !== undefined ? Math.max(0, r.size) : 1 }));
        this.heat.setData(pts, h.radius.value, clamp01(h.opacity.value / 100), h.intensity.value);
    }

    /** Rebuilds the legend box with a title and color swatches, limited to 25 entries, or hides it when there is nothing to show. */
    private renderLegend(): void {
        const l = this.settings.legend;
        const items = this.data.legend;
        this.legendEl.replaceChildren();
        if (!l.show.value || !items.length) { this.legendEl.style.display = "none"; return; }
        this.legendEl.style.display = "block";

        const title = (l.title.value || "").trim() || this.data.legendTitle;
        if (title) {
            const t = document.createElement("div");
            t.className = "gmv-legend-title";
            t.textContent = title;
            this.legendEl.appendChild(t);
        }
        const MAX = 25;
        items.slice(0, MAX).forEach(it => {
            const row = document.createElement("div");
            row.className = "gmv-legend-item";
            const sw = document.createElement("span");
            sw.className = "gmv-swatch";
            sw.style.background = it.color;
            const tx = document.createElement("span");
            tx.textContent = it.name;
            row.appendChild(sw);
            row.appendChild(tx);
            this.legendEl.appendChild(row);
        });
        if (items.length > MAX) {
            const more = document.createElement("div");
            more.className = "gmv-legend-more";
            more.textContent = `+${items.length - MAX} more`;
            this.legendEl.appendChild(more);
        }
    }

    // ------------------------------------------------------------------ data layers (shapes)

    /** Creates a map data layer for shapes that handles click, hover and tooltip events by finding the data row for each shape. */
    private createDataLayer(resolveRow: (feature: any) => number | undefined): any {
        const layer = new google.maps.Data({ map: this.map });

        const tooltipFor = (feature: any): { items: VisualTooltipDataItem[]; ids: ISelectionId[] } => {
            const i = resolveRow(feature);
            if (i !== undefined) {
                const row = this.data.rows[i];
                return { items: this.rowTooltip(row), ids: [row.id] };
            }
            const prop = (this.settings.geography.joinProperty.value || "name").trim();
            const v = feature.getProperty(prop);
            return { items: v !== undefined ? [{ displayName: prop, value: String(v) }] : [], ids: [] };
        };

        layer.addListener("click", (e: any) => {
            this.suppressMapClickUntil = Date.now() + 400;
            const i = resolveRow(e.feature);
            if (i !== undefined) { this.onRowsClick([i], e.domEvent); }
        });
        layer.addListener("mouseover", (e: any) => {
            layer.overrideStyle(e.feature, { strokeWeight: Math.max(1, this.settings.geography.strokeWidth.value) + 2, zIndex: 5 });
            const t = tooltipFor(e.feature);
            if (t.items.length) { this.showTooltip(e.domEvent, t.items, t.ids); }
        });
        layer.addListener("mousemove", (e: any) => {
            const t = tooltipFor(e.feature);
            if (t.items.length) { this.showTooltip(e.domEvent, t.items, t.ids, true); }
        });
        layer.addListener("mouseout", () => {
            layer.revertStyle();
            this.hideTooltip();
        });
        layer.addListener("contextmenu", (e: any) => {
            const i = resolveRow(e.feature);
            if (e.domEvent) {
                this.selectionManager.showContextMenu(i !== undefined ? this.data.rows[i].id : ({} as ISelectionId), this.pos(e.domEvent));
            }
        });
        return layer;
    }

    /** Rebuilds the lookup from location names to data row numbers used to match shapes to rows. */
    private rebuildJoinIndex(): void {
        this.joinIndex.clear();
        this.data.rows.forEach(r => { if (r.location) { this.joinIndex.set(norm(r.location), r.index); } });
    }

    /** Finds the data row that matches a boundary shape using its chosen property, or nothing if there is no match. */
    private urlRowFor(feature: any): number | undefined {
        const prop = (this.settings.geography.joinProperty.value || "name").trim();
        const v = feature.getProperty(prop);
        return v === undefined || v === null ? undefined : this.joinIndex.get(norm(String(v)));
    }

    /** Styles the shape layers by row color, opacity and border, dimming unselected shapes and hiding or graying unmatched ones. */
    private styleDataLayers(): void {
        const g = this.settings.geography;
        const fillOpacity = clamp01(g.fillOpacity.value / 100);
        const stroke = g.strokeColor.value.value;
        const strokeWidth = Math.max(0, g.strokeWidth.value);
        const has = this.selectedKeys.size > 0;

        const styleFor = (rowIndex: number | undefined, feature: any, unmatchedVisible: boolean) => {
            const type: string = feature.getGeometry() ? feature.getGeometry().getType() : "";
            const isLine = type.indexOf("LineString") >= 0;
            const isPoint = type.indexOf("Point") >= 0;

            if (rowIndex === undefined) {
                if (!unmatchedVisible) { return { visible: false }; }
                const c = g.unmatchedColor.value.value;
                return {
                    fillColor: c, fillOpacity: fillOpacity * 0.6, strokeColor: isLine ? c : stroke,
                    strokeWeight: strokeWidth, strokeOpacity: 0.9, clickable: true,
                    icon: isPoint ? { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: c, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1 } : undefined
                };
            }
            const row = this.data.rows[rowIndex];
            const dim = has && !this.selectedKeys.has(row.key);
            return {
                fillColor: row.color,
                fillOpacity: dim ? fillOpacity * 0.25 : fillOpacity,
                strokeColor: isLine ? row.color : stroke,
                strokeWeight: isLine ? Math.max(2, strokeWidth + 1) : strokeWidth,
                strokeOpacity: dim ? 0.3 : 1,
                clickable: true,
                zIndex: dim ? 1 : 3,
                icon: isPoint
                    ? { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: row.color, fillOpacity: dim ? DIM : 1, strokeColor: "#fff", strokeWeight: 1 }
                    : undefined
            };
        };

        if (this.rowGeoLayer) {
            this.rowGeoLayer.setStyle((f: any) => {
                const i = f.getProperty("__row");
                return styleFor(typeof i === "number" ? i : undefined, f, true);
            });
        }
        if (this.urlGeoLayer) {
            this.urlGeoLayer.setStyle((f: any) => styleFor(this.urlRowFor(f), f, true));
        }
    }

    // ------------------------------------------------------------------ selection, tooltips

    /** Selects the given rows in Power BI when clicked, adding to the selection if a modifier key is held. */
    private onRowsClick(rowIndices: number[], ev: MouseEvent | undefined): void {
        this.suppressMapClickUntil = Date.now() + 400;
        const ids = rowIndices.map(i => this.data.rows[i].id);
        const multi = !!ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey);
        this.selectionManager.select(ids, multi).then(() => this.applySelection());
    }

    /** Reads the current Power BI selection and dims markers, lines and shapes that are not selected. */
    private applySelection(): void {
        const sel = (this.selectionManager.getSelectionIds() || []) as ISelectionId[];
        this.selectedKeys = new Set(sel.map(s => (s.getKey ? s.getKey() : JSON.stringify(s))));
        const has = this.selectedKeys.size > 0;
        const isSel = (i: number) => this.selectedKeys.has(this.data.rows[i].key);

        this.points.forEach(p => p.setDim(has && !p.rowIndices.some(isSel)));
        this.lines.forEach(l => l.polyline.setOptions({
            strokeOpacity: has && !l.rowIndices.some(isSel) ? l.baseOpacity * DIM : l.baseOpacity
        }));
        this.styleDataLayers();
    }

    /** Builds the tooltip items for a row, falling back to latitude and longitude and noting when the position was geocoded. */
    private rowTooltip(row: MapRow): VisualTooltipDataItem[] {
        const items = row.tooltips.slice();
        if (!items.length && row.lat !== undefined) {
            items.push({ displayName: "Latitude", value: row.lat.toFixed(6) });
            items.push({ displayName: "Longitude", value: row.lng.toFixed(6) });
        }
        if (row.geocoded) { items.push({ displayName: "Position", value: "Geocoded by Google" }); }
        return items;
    }

    /** Makes an element show, move and hide the Power BI tooltip as the mouse enters, moves over and leaves it. */
    private attachDomTooltip(el: HTMLElement, h: MarkerHandlers): void {
        el.addEventListener("mouseenter", (ev: MouseEvent) => this.showTooltip(ev, h.tooltip(), h.ids()));
        el.addEventListener("mousemove", (ev: MouseEvent) => this.showTooltip(ev, h.tooltip(), h.ids(), true));
        el.addEventListener("mouseleave", () => this.hideTooltip());
    }

    /** Shows or moves the Power BI tooltip at the mouse position with the given items. */
    private showTooltip(ev: MouseEvent | undefined, items: VisualTooltipDataItem[], ids: ISelectionId[], move = false): void {
        if (!ev || !items.length) { return; }
        const p = this.pos(ev);
        const opts = { coordinates: [p.x, p.y], isTouchEvent: false, dataItems: items, identities: ids };
        if (move) { this.host.tooltipService.move(opts); } else { this.host.tooltipService.show(opts); }
    }

    /** Hides the Power BI tooltip immediately. */
    private hideTooltip(): void {
        this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
    }

    /** Converts a mouse event position into coordinates relative to the visual. */
    private pos(ev: MouseEvent): { x: number; y: number } {
        const rect = this.root.getBoundingClientRect();
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    // ------------------------------------------------------------------ fit, geocoding

    /** Moves and zooms the map to fit all points and shapes when the data changed, or to the default view when there is no data. */
    private fitIfNeeded(): void {
        if (!this.map || !this.settings.map.autoFit.value) { return; }

        let latSum = 0, lngSum = 0, pts = 0;
        this.data.rows.forEach(r => {
            if (r.lat !== undefined && r.lng !== undefined) { latSum += r.lat; lngSum += r.lng; pts++; }
        });
        let geoms = 0;
        if (this.rowGeoLayer) { this.rowGeoLayer.forEach(() => geoms++); }
        const sig = `${this.data.rows.length}|${pts}|${latSum.toFixed(5)}|${lngSum.toFixed(5)}|${geoms}|${this.urlLoaded || ""}`;
        if (sig === this.lastFitSignature) { return; }
        this.lastFitSignature = sig;

        const b = new google.maps.LatLngBounds();
        let n = 0;
        const extend = (ll: any) => { b.extend(ll); n++; };
        this.data.rows.forEach(r => { if (r.lat !== undefined && r.lng !== undefined) { extend({ lat: r.lat, lng: r.lng }); } });
        if (this.rowGeoLayer) { this.rowGeoLayer.forEach((f: any) => f.getGeometry() && f.getGeometry().forEachLatLng(extend)); }
        // Boundary files (often whole countries/world) only drive the view when nothing else is on the map.
        if (!n && this.urlGeoLayer) { this.urlGeoLayer.forEach((f: any) => f.getGeometry() && f.getGeometry().forEachLatLng(extend)); }

        if (!n) {
            const s = this.settings.map;
            this.map.setCenter({ lat: s.defaultLat.value, lng: s.defaultLng.value });
            this.map.setZoom(s.defaultZoom.value);
            return;
        }
        if (n === 1 || b.getNorthEast().equals(b.getSouthWest())) {
            this.map.setCenter(b.getCenter());
            this.map.setZoom(13);
        } else {
            this.map.fitBounds(b, 30);
        }
    }

    /** Fills in missing latitude and longitude on rows from positions already looked up by geocoding. */
    private applyGeocodeCache(): void {
        if (!this.settings.geocoding.enable.value) { return; }
        this.data.rows.forEach(r => {
            if ((r.lat === undefined || r.lng === undefined) && r.location) {
                const c = this.geocodeCache.get(norm(r.location));
                if (c) { r.lat = c.lat; r.lng = c.lng; r.geocoded = true; }
            }
        });
    }

    /** Adds location texts that still have no position to the lookup queue and starts processing it. */
    private queueGeocoding(): void {
        if (!this.settings.geocoding.enable.value || !this.geocoder) { return; }
        const queued = new Set(this.geocodeQueue.map(norm));
        this.data.rows.forEach(r => {
            if ((r.lat !== undefined && r.lng !== undefined) || !r.location) { return; }
            const k = norm(r.location);
            if (this.geocodeCache.has(k) || queued.has(k)) { return; }
            queued.add(k);
            this.geocodeQueue.push(r.location);
        });
        if (!this.geocodeRunning && this.geocodeQueue.length) { this.processGeocodeQueue(); }
    }

    /** Looks up the next queued location with the geocoder, saves the result, retries when over the limit and warns if access is denied. */
    private processGeocodeQueue(): void {
        const next = this.geocodeQueue.shift();
        if (!next || !this.geocoder) { this.geocodeRunning = false; return; }
        this.geocodeRunning = true;
        const k = norm(next);
        if (this.geocodeCache.has(k)) { this.processGeocodeQueue(); return; }

        this.geocoder.geocode({ address: next }, (results: any[], status: string) => {
            if (status === "OK" && results && results[0]) {
                const loc = results[0].geometry.location;
                this.geocodeCache.set(k, { lat: loc.lat(), lng: loc.lng() });
            } else if (status === "OVER_QUERY_LIMIT" && (this.geocodeAttempts.get(k) || 0) < 3) {
                this.geocodeAttempts.set(k, (this.geocodeAttempts.get(k) || 0) + 1);
                this.geocodeQueue.unshift(next);
                setTimeout(() => this.processGeocodeQueue(), 2000);
                return;
            } else {
                this.geocodeCache.set(k, null);
                if (status === "REQUEST_DENIED") {
                    this.showWarning("Geocoding was denied. Enable the Geocoding API for this key.");
                    this.geocodeQueue = [];
                }
            }
            this.scheduleGeocodeRender();
            setTimeout(() => this.processGeocodeQueue(), 100);
        });
    }

    /** Waits a short time after a lookup, then applies the found positions and redraws the map. */
    private scheduleGeocodeRender(): void {
        clearTimeout(this.geocodeTimer);
        this.geocodeTimer = setTimeout(() => {
            if (!this.map) { return; }
            this.applyGeocodeCache();
            this.renderAll();
        }, 600);
    }

    // ------------------------------------------------------------------ helpers

    /** Works out the marker size for a row from its size value within the range, so bubble area follows the value. */
    private markerSize(row: MapRow): number {
        const ms = this.settings.markers;
        const range = this.data.sizeRange;
        if (range && row.size !== undefined) {
            const t = range[1] === range[0] ? 1 : (row.size - range[0]) / (range[1] - range[0]);
            const a = Math.max(2, ms.minSize.value), b = Math.max(a, ms.maxSize.value);
            // Area-proportional bubbles.
            return Math.round(Math.sqrt(a * a + (b * b - a * a) * clamp01(t)));
        }
        return Math.max(4, ms.size.value);
    }

    /** Removes all markers from the map and forgets them. */
    private clearPoints(): void {
        this.points.forEach(p => p.remove());
        this.points = [];
    }

    /** Removes all lines from the map and forgets them. */
    private clearLines(): void {
        this.lines.forEach(l => { google.maps.event.clearInstanceListeners(l.polyline); l.polyline.setMap(null); });
        this.lines = [];
    }

    /** Creates a div with the given class name inside the visual and returns it. */
    private div(cls: string): HTMLDivElement {
        const d = document.createElement("div");
        d.className = cls;
        this.root.appendChild(d);
        return d;
    }

    /** Shows a centered message with a title and body text. */
    private showMessage(title: string, body: string): void {
        this.messageEl.replaceChildren();
        const t = document.createElement("div");
        t.className = "gmv-message-title";
        t.textContent = title;
        const b = document.createElement("div");
        b.className = "gmv-message-body";
        b.textContent = body;
        this.messageEl.appendChild(t);
        this.messageEl.appendChild(b);
        this.messageEl.style.display = "flex";
    }

    /** Hides the centered message. */
    private hideMessage(): void {
        this.messageEl.style.display = "none";
    }

    /** Shows a warning text on the map. */
    private showWarning(text: string): void {
        this.warnEl.textContent = text;
        this.warnEl.style.display = "block";
    }

    /** Hides the warning text. */
    private clearWarning(): void {
        this.warnEl.style.display = "none";
    }
}

// ---------------------------------------------------------------------- module helpers

/** Limits a number to between 0 and 1, treating invalid values as 1. */
function clamp01(v: number): number {
    return Math.min(1, Math.max(0, isFinite(v) ? v : 1));
}

/** Trims text and makes it lower case so names can be compared. */
function norm(s: string): string {
    return s.trim().toLowerCase();
}

/** Shortens a count for display, such as 1.5k or 2.0M. */
function compactCount(n: number): string {
    if (n >= 1e6) { return `${(n / 1e6).toFixed(1)}M`; }
    if (n >= 1e4) { return `${Math.round(n / 1e3)}k`; }
    if (n >= 1e3) { return `${(n / 1e3).toFixed(1)}k`; }
    return String(n);
}

/** Compares two rows by path order, using numbers when both are numeric, natural text order otherwise and row order when missing. */
function byPathOrder(a: MapRow, b: MapRow): number {
    const x = a.pathOrder, y = b.pathOrder;
    if (x === undefined && y === undefined) { return a.index - b.index; }
    if (x === undefined) { return 1; }
    if (y === undefined) { return -1; }
    if (typeof x === "number" && typeof y === "number") { return x - y; }
    return String(x).localeCompare(String(y), undefined, { numeric: true });
}

/** Builds a pin shaped icon in the given color and size as a small vector image. */
function pinSvg(color: string, size: number): SVGSVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", PIN_PATH);
    path.setAttribute("fill", color);
    path.setAttribute("stroke", "#ffffff");
    path.setAttribute("stroke-width", "1.2");
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", "12");
    dot.setAttribute("cy", "9");
    dot.setAttribute("r", "3.2");
    dot.setAttribute("fill", "#ffffff");
    svg.appendChild(path);
    svg.appendChild(dot);
    svg.style.display = "block";
    return svg;
}
