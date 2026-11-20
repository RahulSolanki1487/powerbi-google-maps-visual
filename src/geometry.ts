"use strict";

/**
 * Converts a geometry cell (GeoJSON text or WKT) into GeoJSON geometries.
 * WKT coordinate order is "lng lat" (x y), which matches GeoJSON.
 * Works with SQL Server / Azure SQL geography.STAsText() output.
 */

export interface GeoJsonGeometry {
    type: string;
    coordinates?: any;
    geometries?: GeoJsonGeometry[];
}

const NUM = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?";
const COORD_RE = new RegExp(`(${NUM})\\s+(${NUM})(?:\\s+${NUM})*`, "g");

export function parseGeometryCell(raw: unknown): GeoJsonGeometry[] {
    if (raw === null || raw === undefined) { return []; }
    const text = String(raw).trim();
    if (!text) { return []; }
    try {
        if (text[0] === "{" || text[0] === "[") {
            return parseGeoJson(JSON.parse(text));
        }
        const g = parseWkt(text);
        return g ? [g] : [];
    } catch {
        return [];
    }
}

export function parseGeoJson(obj: any): GeoJsonGeometry[] {
    if (!obj || typeof obj !== "object") { return []; }
    switch (obj.type) {
        case "FeatureCollection":
            return (obj.features || []).reduce((acc: GeoJsonGeometry[], f: any) => acc.concat(parseGeoJson(f)), []);
        case "Feature":
            return obj.geometry ? [obj.geometry] : [];
        case "Point": case "MultiPoint": case "LineString": case "MultiLineString":
        case "Polygon": case "MultiPolygon": case "GeometryCollection":
            return [obj];
        default:
            return [];
    }
}

export function parseWkt(input: string): GeoJsonGeometry | null {
    const s = input.trim().replace(/^SRID=\d+;/i, "");
    const m = /^([A-Za-z]+)\s*(?:ZM|Z|M)?\s*(\(.*\)|EMPTY)$/s.exec(s);
    if (!m) { return null; }
    const type = m[1].toUpperCase();
    const body = m[2];
    if (body.toUpperCase() === "EMPTY") { return null; }

    if (type === "GEOMETRYCOLLECTION") {
        const parts = splitTopLevel(body.slice(1, -1));
        const geometries = parts.map(p => parseWkt(p)).filter(g => !!g) as GeoJsonGeometry[];
        return { type: "GeometryCollection", geometries };
    }

    const jsonText = body
        .replace(COORD_RE, (_all, x, y) => `[${x},${y}]`)
        .replace(/\(/g, "[")
        .replace(/\)/g, "]");
    const nested = JSON.parse(jsonText);

    switch (type) {
        case "POINT":
            return { type: "Point", coordinates: nested[0] };
        case "LINESTRING":
            return { type: "LineString", coordinates: nested };
        case "POLYGON":
            return { type: "Polygon", coordinates: nested };
        case "MULTIPOINT":
            // Accept both "MULTIPOINT (1 2, 3 4)" and "MULTIPOINT ((1 2), (3 4))"
            return { type: "MultiPoint", coordinates: nested.map((p: any) => (Array.isArray(p[0]) ? p[0] : p)) };
        case "MULTILINESTRING":
            return { type: "MultiLineString", coordinates: nested };
        case "MULTIPOLYGON":
            return { type: "MultiPolygon", coordinates: nested };
        default:
            return null;
    }
}

function splitTopLevel(s: string): string[] {
    const out: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "(") { depth++; }
        else if (c === ")") { depth--; }
        else if (c === "," && depth === 0) {
            out.push(s.slice(start, i).trim());
            start = i + 1;
        }
    }
    const last = s.slice(start).trim();
    if (last) { out.push(last); }
    return out;
}
