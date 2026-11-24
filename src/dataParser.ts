"use strict";

import powerbi from "powerbi-visuals-api";
import { VisualSettings } from "./settings";
import { GeoJsonGeometry, parseGeometryCell } from "./geometry";

import DataView = powerbi.DataView;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

/** Describes one row of map data, including its position, legend value, size, color, shapes and tooltip items. */
export interface MapRow {
    index: number;
    id: ISelectionId;
    key: string;
    location?: string;
    lat?: number;
    lng?: number;
    geocoded?: boolean;
    legend?: string;
    size?: number;
    colorValue?: number;
    pathId?: string;
    pathOrder?: number | string;
    geometries: GeoJsonGeometry[];
    tooltips: VisualTooltipDataItem[];
    color: string;
}

/** Describes one legend entry with a name and its color. */
export interface LegendItem { name: string; color: string; }

/** Holds the parsed result of the data: all rows, which fields are filled, the legend and the size and color ranges. */
export interface ParsedData {
    rows: MapRow[];
    roles: { [role: string]: boolean };
    legend: LegendItem[];
    legendTitle: string;
    sizeRange: [number, number] | null;
    colorRange: [number, number] | null;
}

const SINGLE_ROLES = ["location", "latitude", "longitude", "legend", "size", "colorValue", "pathId", "pathOrder", "geometry"];

/** Returns a parsed data result with no rows, no legend and no ranges. */
export function emptyData(): ParsedData {
    return { rows: [], roles: {}, legend: [], legendTitle: "", sizeRange: null, colorRange: null };
}

/** Reads the Power BI table and turns each row into a map row with position, legend, size, color, shapes and tooltips, also working out the legend and the value ranges. */
export function parseData(dataView: DataView | undefined, host: IVisualHost, settings: VisualSettings): ParsedData {
    const table = dataView && dataView.table;
    if (!table || !table.rows || !table.columns) { return emptyData(); }

    const cols = table.columns;
    const idx: { [role: string]: number } = {};
    const roles: { [role: string]: boolean } = {};
    SINGLE_ROLES.forEach(role => {
        const i = cols.findIndex(c => !!(c.roles && c.roles[role]));
        idx[role] = i;
        roles[role] = i >= 0;
    });
    const tooltipCols = cols
        .map((c, i) => ({ c, i }))
        .filter(x => !!(x.c.roles && x.c.roles["tooltips"]));

    const rows: MapRow[] = [];
    let sizeMin = Infinity, sizeMax = -Infinity, colMin = Infinity, colMax = -Infinity;

    table.rows.forEach((r, rowIndex) => {
        const get = (role: string) => (idx[role] >= 0 ? r[idx[role]] : undefined);
        const id = host.createSelectionIdBuilder().withTable(table, rowIndex).createSelectionId();

        const row: MapRow = {
            index: rows.length,
            id,
            key: id.getKey ? id.getKey() : String(rowIndex),
            location: toStr(get("location")),
            lat: toNum(get("latitude")),
            lng: toNum(get("longitude")),
            legend: toStr(get("legend")),
            size: toNum(get("size")),
            colorValue: toNum(get("colorValue")),
            pathId: toStr(get("pathId")),
            pathOrder: toOrder(get("pathOrder")),
            geometries: roles["geometry"] ? parseGeometryCell(get("geometry")) : [],
            tooltips: [],
            color: settings.dataColors.defaultColor.value.value
        };

        if (row.lat !== undefined && (row.lat < -90 || row.lat > 90)) { row.lat = undefined; }
        if (row.lng !== undefined && (row.lng < -180 || row.lng > 180)) { row.lng = undefined; }

        if (row.size !== undefined) { sizeMin = Math.min(sizeMin, row.size); sizeMax = Math.max(sizeMax, row.size); }
        if (row.colorValue !== undefined) { colMin = Math.min(colMin, row.colorValue); colMax = Math.max(colMax, row.colorValue); }

        // Tooltips: every bound field, in a sensible order.
        const tipRoles = ["location", "legend", "pathId", "size", "colorValue"];
        tipRoles.forEach(role => {
            if (idx[role] >= 0 && r[idx[role]] !== null && r[idx[role]] !== undefined) {
                row.tooltips.push({ displayName: cols[idx[role]].displayName, value: formatValue(r[idx[role]], cols[idx[role]]) });
            }
        });
        tooltipCols.forEach(t => {
            row.tooltips.push({ displayName: t.c.displayName, value: formatValue(r[t.i], t.c) });
        });

        rows.push(row);
    });

    // Colors: legend category > gradient > default.
    const legend: LegendItem[] = [];
    const seen = new Map<string, string>();
    const colorRange: [number, number] | null = isFinite(colMin) ? [colMin, colMax] : null;
    const dc = settings.dataColors;

    rows.forEach(row => {
        if (row.legend !== undefined) {
            let c = seen.get(row.legend);
            if (!c) {
                c = host.colorPalette.getColor(row.legend).value;
                seen.set(row.legend, c);
                legend.push({ name: row.legend, color: c });
            }
            row.color = c;
        } else if (dc.useGradient.value && colorRange && row.colorValue !== undefined) {
            const t = colorRange[1] === colorRange[0] ? 1 : (row.colorValue - colorRange[0]) / (colorRange[1] - colorRange[0]);
            row.color = lerpColor(dc.minColor.value.value, dc.maxColor.value.value, t);
        }
    });

    return {
        rows,
        roles,
        legend,
        legendTitle: idx["legend"] >= 0 ? cols[idx["legend"]].displayName : "",
        sizeRange: isFinite(sizeMin) ? [sizeMin, sizeMax] : null,
        colorRange
    };
}

/** Converts a value to a number, or returns nothing when it is empty or not a valid number. */
function toNum(v: any): number | undefined {
    if (v === null || v === undefined || v === "") { return undefined; }
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isFinite(n) ? n : undefined;
}

/** Converts a value to trimmed text, or returns nothing when it is empty; dates become standard date text. */
function toStr(v: any): string | undefined {
    if (v === null || v === undefined) { return undefined; }
    if (v instanceof Date) { return v.toISOString(); }
    const s = String(v).trim();
    return s ? s : undefined;
}

/** Turns a value into something sortable: dates become timestamps, numeric values become numbers and anything else becomes text. */
function toOrder(v: any): number | string | undefined {
    if (v === null || v === undefined) { return undefined; }
    if (v instanceof Date) { return v.getTime(); }
    const n = toNum(v);
    return n !== undefined ? n : String(v);
}

/** Formats a value for display, using percent style for percent columns and locale formatting for numbers and dates. */
function formatValue(v: any, col: DataViewMetadataColumn): string {
    if (v === null || v === undefined) { return ""; }
    if (v instanceof Date) { return v.toLocaleString(); }
    if (typeof v === "number") {
        const fmt = col.format || "";
        if (fmt.indexOf("%") >= 0) { return `${(v * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`; }
        return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
    }
    return String(v);
}

/** Blends two hex colors by a fraction between 0 and 1 and returns the mixed color as hex. */
export function lerpColor(a: string, b: string, t: number): string {
    const pa = hexToRgb(a), pb = hexToRgb(b);
    const k = Math.min(1, Math.max(0, t));
    const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * k));
    return `#${c.map(x => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Converts a hex color, short or long form, into red, green and blue numbers. */
function hexToRgb(hex: string): number[] {
    let h = (hex || "#000000").replace("#", "");
    if (h.length === 3) { h = h.split("").map(x => x + x).join(""); }
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
