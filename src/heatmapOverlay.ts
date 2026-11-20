"use strict";

/**
 * Canvas heatmap drawn in a google.maps.OverlayView.
 * Google removed google.maps.visualization.HeatmapLayer in May 2026, so the visual
 * ships its own. The class is created at runtime because OverlayView only exists
 * after the Maps API has loaded.
 */

export interface HeatPoint { lat: number; lng: number; weight: number; }

export interface HeatmapOverlay {
    setMap(map: any): void;
    setData(points: HeatPoint[], radius: number, opacity: number, intensity: number): void;
    draw(): void;
}

let HeatmapClass: any = null;

export function createHeatmapOverlay(): HeatmapOverlay {
    const google = (window as any).google;
    if (!HeatmapClass) {
        HeatmapClass = class extends google.maps.OverlayView {
            private canvas: HTMLCanvasElement;
            private points: HeatPoint[] = [];
            private radius = 25;
            private intensity = 1;
            private palette: Uint8ClampedArray = buildPalette();

            constructor() {
                super();
                this.canvas = document.createElement("canvas");
                this.canvas.style.position = "absolute";
                this.canvas.style.pointerEvents = "none";
            }

            onAdd() {
                this.getPanes().overlayLayer.appendChild(this.canvas);
            }

            onRemove() {
                if (this.canvas.parentNode) { this.canvas.parentNode.removeChild(this.canvas); }
            }

            setData(points: HeatPoint[], radius: number, opacity: number, intensity: number) {
                this.points = points;
                this.radius = Math.max(2, radius);
                this.intensity = Math.max(0.05, intensity);
                this.canvas.style.opacity = String(Math.min(1, Math.max(0, opacity)));
                this.draw();
            }

            draw() {
                const map = this.getMap();
                const proj = this.getProjection();
                if (!map || !proj) { return; }

                const div = map.getDiv();
                const w = div.offsetWidth, h = div.offsetHeight;
                if (!w || !h) { return; }

                // Pin the canvas to the visible viewport.
                const tlLatLng = proj.fromContainerPixelToLatLng(new google.maps.Point(0, 0));
                const tl = proj.fromLatLngToDivPixel(tlLatLng);
                this.canvas.style.left = `${tl.x}px`;
                this.canvas.style.top = `${tl.y}px`;
                this.canvas.width = w;
                this.canvas.height = h;

                const ctx = this.canvas.getContext("2d");
                ctx.clearRect(0, 0, w, h);
                if (!this.points.length) { return; }

                const r = this.radius;
                const maxW = this.points.reduce((m, p) => Math.max(m, p.weight), 0) || 1;

                for (const p of this.points) {
                    const px = proj.fromLatLngToContainerPixel(new google.maps.LatLng(p.lat, p.lng));
                    if (!px || px.x < -r || px.y < -r || px.x > w + r || px.y > h + r) { continue; }
                    const a = Math.min(1, (p.weight / maxW) * 0.35 * this.intensity);
                    const g = ctx.createRadialGradient(px.x, px.y, 0, px.x, px.y, r);
                    g.addColorStop(0, `rgba(0,0,0,${a})`);
                    g.addColorStop(1, "rgba(0,0,0,0)");
                    ctx.fillStyle = g;
                    ctx.fillRect(px.x - r, px.y - r, r * 2, r * 2);
                }

                // Colorize the alpha channel.
                const img = ctx.getImageData(0, 0, w, h);
                const d = img.data;
                for (let i = 3; i < d.length; i += 4) {
                    const alpha = d[i];
                    if (!alpha) { continue; }
                    const o = alpha * 4;
                    d[i - 3] = this.palette[o];
                    d[i - 2] = this.palette[o + 1];
                    d[i - 1] = this.palette[o + 2];
                    d[i] = Math.min(255, alpha * 1.6);
                }
                ctx.putImageData(img, 0, 0);
            }
        };
    }
    return new HeatmapClass() as HeatmapOverlay;
}

function buildPalette(): Uint8ClampedArray {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 1;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0.0, "rgba(0,0,255,1)");
    g.addColorStop(0.35, "rgba(0,255,255,1)");
    g.addColorStop(0.55, "rgba(0,255,0,1)");
    g.addColorStop(0.75, "rgba(255,255,0,1)");
    g.addColorStop(1.0, "rgba(255,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 1);
    return ctx.getImageData(0, 0, 256, 1).data;
}
