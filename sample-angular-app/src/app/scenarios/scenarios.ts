import { Scenario, table } from './scenario';

const CITIES: Array<[string, number, number]> = [
  ['Bengaluru', 12.9716, 77.5946], ['Mumbai', 19.076, 72.8777], ['Delhi', 28.6139, 77.209],
  ['Chennai', 13.0827, 80.2707], ['Hyderabad', 17.385, 78.4867], ['Pune', 18.5204, 73.8567],
  ['Kolkata', 22.5726, 88.3639], ['Ahmedabad', 23.0225, 72.5714], ['Jaipur', 26.9124, 75.7873]
];

/** Deterministic pseudo-random points around Indian cities, so the cluster/heatmap demos look the same each time. */
function scatter(count: number) {
  let seed = 42;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, (_, i) => {
    const [name, lat, lng] = CITIES[i % CITIES.length];
    return [`${name} #${i + 1}`, +(lat + (rand() - 0.5) * 2.4).toFixed(4), +(lng + (rand() - 0.5) * 2.4).toFixed(4), Math.round(10 + rand() * 90)];
  });
}

const cityRows = CITIES.map(([n, lat, lng], i) => [n, lat, lng, [520, 830, 760, 410, 450, 120, 95, 300, 240][i] * 1000, [18, 22, 15, 12, 20, 8, 5, 16, 11][i] / 100]);
const cityHeaders = ['Location', 'Latitude', 'Longitude', 'Sales', 'Margin'];

const circle = (lng: number, lat: number, r: number) =>
  `POLYGON ((${[0, 1, 2, 3, 4, 5, 6, 7, 0].map(k => `${(lng + r * Math.cos((k * Math.PI) / 4)).toFixed(3)} ${(lat + r * Math.sin((k * Math.PI) / 4)).toFixed(3)}`).join(', ')}))`;

export const SCENARIOS: Scenario[] = [
  {
    id: 'pins', title: 'Pins',
    description: 'Classic pin markers from Latitude + Longitude. Hover for tooltips, click to select (others dim), click the map to clear.',
    table: table(['Location', 'Latitude', 'Longitude'], CITIES.map(([n, lat, lng]) => [n, lat, lng])),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude' },
    objects: { markers: { shape: 'pin', cluster: false } }
  },
  {
    id: 'bubbles', title: 'Bubbles (size)',
    description: 'Circle markers whose area scales with the Size measure (Sales).',
    table: table(cityHeaders, cityRows),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', Sales: 'size' },
    objects: { markers: { shape: 'circle', cluster: false, minSize: 10, maxSize: 50 }, dataColors: { useGradient: false } }
  },
  {
    id: 'labels', title: 'Marker labels',
    description: 'Labels shown on the markers using the Location text.',
    table: table(['Location', 'Latitude', 'Longitude'], CITIES.map(([n, lat, lng]) => [n, lat, lng])),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude' },
    objects: { markers: { shape: 'circle', cluster: false, showLabels: true, size: 28 } }
  },
  {
    id: 'legend', title: 'Legend colors',
    description: 'Marker color per Legend category, plus the legend box. Toggle "legend.show" in the JSON to hide it.',
    table: table(['Location', 'Latitude', 'Longitude', 'Category'], CITIES.map(([n, lat, lng], i) => [n, lat, lng, ['Store', 'Warehouse', 'Office'][i % 3]])),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', Category: 'legend' },
    objects: { markers: { shape: 'circle', cluster: false }, legend: { show: true, title: 'Site type' } }
  },
  {
    id: 'gradient', title: 'Gradient color',
    description: 'Color from light to dark by the "Color saturation" measure (Margin) when there is no Legend.',
    table: table(cityHeaders, cityRows),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', Margin: 'colorValue' },
    objects: { markers: { shape: 'circle', cluster: false, size: 30 }, dataColors: { useGradient: true, minColor: { solid: { color: '#FDE7E4' } }, maxColor: { solid: { color: '#B31412' } } } }
  },
  {
    id: 'cluster', title: 'Clustering',
    description: '300 points grouped into numbered clusters that split as you zoom. Click a cluster to zoom in; Ctrl+click selects all its points.',
    table: table(['Location', 'Latitude', 'Longitude', 'Sales'], scatter(300)),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', Sales: 'size' },
    objects: { markers: { shape: 'circle', cluster: true, clusterRadius: 60 } }
  },
  {
    id: 'routes', title: 'Lines / routes',
    description: 'Rows sharing a Path ID become one line, ordered by Path order. Direction arrows and path-point markers are on.',
    table: table(['Location', 'Latitude', 'Longitude', 'RouteId', 'Seq'], [
      ['Truck 1 - Pune', 18.5204, 73.8567, 'T1', 1], ['Truck 1 - Mumbai', 19.076, 72.8777, 'T1', 2],
      ['Truck 1 - Surat', 21.1702, 72.8311, 'T1', 3], ['Truck 1 - Ahmedabad', 23.0225, 72.5714, 'T1', 4],
      ['Truck 2 - Hyderabad', 17.385, 78.4867, 'T2', 1], ['Truck 2 - Bengaluru', 12.9716, 77.5946, 'T2', 2],
      ['Truck 2 - Chennai', 13.0827, 80.2707, 'T2', 3]
    ]),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', RouteId: 'pathId', Seq: 'pathOrder' },
    objects: { lines: { show: true, colorByData: false, color: '#4285F4', width: 4, arrows: true, showPathPoints: true }, markers: { cluster: false } }
  },
  {
    id: 'geodesic', title: 'Geodesic lines',
    description: 'Long-distance flights drawn as great-circle curves (Geodesic on).',
    table: table(['Location', 'Latitude', 'Longitude', 'RouteId', 'Seq'], [
      ['Delhi', 28.6139, 77.209, 'DEL-LHR-JFK', 1], ['London', 51.47, -0.4543, 'DEL-LHR-JFK', 2], ['New York', 40.6413, -73.7781, 'DEL-LHR-JFK', 3],
      ['Mumbai', 19.0896, 72.8656, 'BOM-SIN-SYD', 1], ['Singapore', 1.3644, 103.9915, 'BOM-SIN-SYD', 2], ['Sydney', -33.9399, 151.1753, 'BOM-SIN-SYD', 3]
    ]),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', RouteId: 'pathId', Seq: 'pathOrder' },
    objects: { lines: { show: true, geodesic: true, arrows: true, width: 3 }, markers: { cluster: false, shape: 'circle', size: 14 }, mapSettings: { defaultZoom: 2 } }
  },
  {
    id: 'wkt', title: 'Polygons (WKT)',
    description: 'A Geometry column holding WKT, like SQL geography.STAsText(). Shapes are filled by Legend color.',
    table: table(['Location', 'Category', 'Geometry'], [
      ['Bengaluru zone', 'Zone A', 'POLYGON ((77.50 12.90, 77.70 12.90, 77.70 13.05, 77.50 13.05, 77.50 12.90))'],
      ['Mumbai zone', 'Zone B', 'POLYGON ((72.80 18.90, 72.98 18.90, 72.98 19.20, 72.80 19.20, 72.80 18.90))'],
      ['Delhi zone', 'Zone A', circle(77.209, 28.6139, 0.2)],
      ['Chennai zone', 'Zone B', circle(80.2707, 13.0827, 0.15)]
    ]),
    roles: { Location: 'location', Category: 'legend', Geometry: 'geometry' },
    objects: { geography: { show: true, fillOpacity: 60, strokeColor: '#FFFFFF', strokeWidth: 2 }, legend: { show: true } }
  },
  {
    id: 'geojson', title: 'GeoJSON geometry',
    description: 'A Geometry column holding GeoJSON text: a polygon, a line and a point in the same column.',
    table: table(['Location', 'Category', 'Geometry'], [
      ['Delivery zone', 'Polygon', JSON.stringify({ type: 'Polygon', coordinates: [[[77.4, 12.8], [77.8, 12.8], [77.8, 13.15], [77.4, 13.15], [77.4, 12.8]]] })],
      ['Highway', 'Line', JSON.stringify({ type: 'LineString', coordinates: [[77.59, 12.97], [78.0, 13.3], [78.47, 17.38]] })],
      ['Depot', 'Point', JSON.stringify({ type: 'Point', coordinates: [77.5946, 12.9716] })]
    ]),
    roles: { Location: 'location', Category: 'legend', Geometry: 'geometry' },
    objects: { geography: { show: true, fillOpacity: 50 }, lines: { width: 5 } }
  },
  {
    id: 'choropleth', title: 'Choropleth (GeoJSON URL)',
    description: 'Boundaries loaded from a GeoJSON URL (here served by this app) and joined to Location through the "name" property, colored by Margin.',
    table: table(['Location', 'Sales', 'Margin'], [['North', 700, 0.22], ['Central', 300, 0.12], ['West', 650, 0.18], ['East', 400, 0.08], ['South', 900, 0.3]]),
    roles: { Location: 'location', Sales: 'size', Margin: 'colorValue' },
    objects: {
      geography: { show: true, geoJsonUrl: '{origin}/geojson/zones.geojson', joinProperty: 'name', fillOpacity: 70, strokeColor: '#333333' },
      dataColors: { useGradient: true, minColor: { solid: { color: '#E8F1FB' } }, maxColor: { solid: { color: '#0B3D91' } } },
      markers: { show: false }
    }
  },
  {
    id: 'heatmap', title: 'Heatmap',
    description: 'Custom canvas heatmap of 300 points, weighted by Size. Markers are hidden.',
    table: table(['Location', 'Latitude', 'Longitude', 'Sales'], scatter(300)),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', Sales: 'size' },
    objects: { heatmap: { show: true, radius: 30, opacity: 70, intensity: 1 }, markers: { show: false } }
  },
  {
    id: 'geocoding', title: 'Geocoding (addresses)',
    description: 'Only addresses, no coordinates: the visual looks up positions with the Geocoding API (throttled, cached). Needs the Geocoding API enabled on your key.',
    needsGeocoding: true,
    table: table(['Location'], [['Gateway of India, Mumbai'], ['India Gate, New Delhi'], ['Charminar, Hyderabad'], ['Lalbagh, Bengaluru']]),
    roles: { Location: 'location' },
    objects: { geocoding: { enable: true }, markers: { cluster: false, shape: 'pin' } }
  },
  {
    id: 'mapstyle', title: 'Map type & layers',
    description: 'Satellite imagery with traffic, transit and bicycling layers on. Change mapType to roadmap / hybrid / terrain in the JSON.',
    table: table(['Location', 'Latitude', 'Longitude'], CITIES.slice(0, 3).map(([n, lat, lng]) => [n, lat, lng])),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude' },
    objects: { mapSettings: { mapType: 'hybrid', traffic: true, transit: true, bicycling: true, fullscreenControl: true }, markers: { cluster: false } }
  },
  {
    id: 'bigdata', title: 'Large data (500k rows)',
    description: '500,000 points delivered in 30,000-row chunks, like Power BI does. The map draws the first chunk, a status note counts the rows as chunks arrive, and the full set is drawn at the end. Zoom and pan: only the visible area is clustered.',
    table: () => table(['Location', 'Latitude', 'Longitude', 'Sales'], scatter(500000)),
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', Sales: 'size' },
    objects: { markers: { shape: 'circle', cluster: true, clusterRadius: 60, maxMarkers: 3000 }, dataLoading: { loadAll: true, maxRows: 500000 } }
  },
  {
    id: 'everything', title: 'Everything (sample.csv)',
    description: 'The repo sample: stores, warehouses, two truck routes and two WKT zones in one table.',
    csvUrl: 'sample-data/sample.csv',
    roles: { Location: 'location', Latitude: 'latitude', Longitude: 'longitude', Category: 'legend', Sales: 'size', Margin: 'colorValue', RouteId: 'pathId', Seq: 'pathOrder', Geometry: 'geometry' },
    objects: { markers: { shape: 'circle', cluster: false }, lines: { show: true }, geography: { show: true }, legend: { show: true } }
  }
];
