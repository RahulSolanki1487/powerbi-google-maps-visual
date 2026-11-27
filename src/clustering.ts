"use strict";

/**
 * Grid-based clustering in world-pixel space. The grid is anchored to the world,
 * so clusters stay stable while panning and only change when the zoom changes.
 */

/** Describes one map point with its latitude, longitude and the index of the data row it came from. */
export interface ClusterPoint { lat: number; lng: number; rowIndex: number; }
/** Describes a group of nearby points by its average latitude and longitude and the data rows it contains. */
export interface Cluster { lat: number; lng: number; rowIndices: number[]; }

/** Groups nearby points into clusters by placing them in a pixel grid at the current zoom level and averaging each cell. */
export function clusterPoints(
    points: ClusterPoint[],
    zoom: number,
    radiusPx: number,
    toWorld: (lat: number, lng: number) => { x: number; y: number }
): Cluster[] {
    const scale = Math.pow(2, zoom);
    const r = Math.max(10, radiusPx);
    const cells = new Map<string, { latSum: number; lngSum: number; rows: number[] }>();

    for (const p of points) {
        const w = toWorld(p.lat, p.lng);
        const key = `${Math.floor((w.x * scale) / r)}:${Math.floor((w.y * scale) / r)}`;
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
