"use strict";

/**
 * Grid-based clustering in world-pixel space. The grid is anchored to the world,
 * so clusters stay stable while panning and only change when the zoom changes.
 */

/** Describes one map point with its latitude, longitude and the index of the data row it came from. */
export interface ClusterPoint { lat: number; lng: number; rowIndex: number; }
/** Describes a group of nearby points by its average latitude and longitude and the data rows it contains. */
export interface Cluster { lat: number; lng: number; rowIndices: number[]; }

const CELL_KEY_STRIDE = 134217728; // 2^27, larger than any cell index at zoom 21 with a 10px radius

/** Describes the rectangle of the map that is worth drawing, in degrees. West greater than east means it crosses the antimeridian. */
export interface ViewBounds { south: number; north: number; west: number; east: number; }

/** Converts a position to Google's world-pixel space (256 x 256 at zoom 0) with the Web Mercator formula, without any Google objects. */
export function toWorldPixel(lat: number, lng: number): { x: number; y: number } {
    const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
    return { x: 256 * (0.5 + lng / 360), y: 256 * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) };
}

/** Tells whether a position lies inside the bounds. */
export function viewContains(view: ViewBounds, lat: number, lng: number): boolean {
    if (lat < view.south || lat > view.north) { return false; }
    return view.west <= view.east ? lng >= view.west && lng <= view.east : lng >= view.west || lng <= view.east;
}

/**
 * Clusters only the points inside the view. If that still gives more than maxClusters groups, the radius is doubled
 * (up to four times) so the map never has to draw tens of thousands of markers.
 */
export function clusterForView(
    points: ClusterPoint[],
    zoom: number,
    radiusPx: number,
    view: ViewBounds | null,
    maxClusters: number
): Cluster[] {
    const visible = view ? points.filter(p => viewContains(view, p.lat, p.lng)) : points;
    let radius = radiusPx;
    let clusters = clusterPoints(visible, zoom, radius, toWorldPixel);
    for (let tries = 0; clusters.length > maxClusters && tries < 4; tries++) {
        radius *= 2;
        clusters = clusterPoints(visible, zoom, radius, toWorldPixel);
    }
    return clusters;
}

/** Groups nearby points into clusters by placing them in a pixel grid at the current zoom level and averaging each cell. */
export function clusterPoints(
    points: ClusterPoint[],
    zoom: number,
    radiusPx: number,
    toWorld: (lat: number, lng: number) => { x: number; y: number }
): Cluster[] {
    const scale = Math.pow(2, zoom);
    const r = Math.max(10, radiusPx);
    const cells = new Map<number, { latSum: number; lngSum: number; rows: number[] }>();

    for (const p of points) {
        const w = toWorld(p.lat, p.lng);
        // Numeric key (cell x, cell y); much faster than string keys for hundreds of thousands of points.
        const key = Math.floor((w.x * scale) / r) * CELL_KEY_STRIDE + Math.floor((w.y * scale) / r);
        let cell = cells.get(key);
        if (!cell) {
            cell = { latSum: 0, lngSum: 0, rows: [] };
            cells.set(key, cell);
        }
        cell.latSum += p.lat;
        cell.lngSum += p.lng;
        cell.rows.push(p.rowIndex);
    }

    const out: Cluster[] = [];
    cells.forEach(c => out.push({
        lat: c.latSum / c.rows.length,
        lng: c.lngSum / c.rows.length,
        rowIndices: c.rows
    }));
    return out;
}
