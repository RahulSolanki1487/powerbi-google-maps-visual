"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

const mapTypeItems = [
    { value: "roadmap", displayName: "Roadmap" },
    { value: "satellite", displayName: "Satellite" },
    { value: "hybrid", displayName: "Hybrid" },
    { value: "terrain", displayName: "Terrain" }
];

const markerShapeItems = [
    { value: "pin", displayName: "Pin" },
    { value: "circle", displayName: "Circle / bubble" }
];

const text = (name: string, displayName: string, value = "", placeholder = "") =>
    new formattingSettings.TextInput({ name, displayName, value, placeholder });
const toggle = (name: string, displayName: string, value: boolean) =>
    new formattingSettings.ToggleSwitch({ name, displayName, value });
const num = (name: string, displayName: string, value: number) =>
    new formattingSettings.NumUpDown({ name, displayName, value });
const color = (name: string, displayName: string, value: string) =>
    new formattingSettings.ColorPicker({ name, displayName, value: { value } });

export class MapSettingsCard extends formattingSettings.SimpleCard {
    apiKey = text("apiKey", "Google Maps API key", "", "AIza...");
    mapId = text("mapId", "Map ID (Advanced Markers / cloud styling)", "", "DEMO_MAP_ID");
    mapType = new formattingSettings.ItemDropdown({ name: "mapType", displayName: "Map type", items: mapTypeItems, value: mapTypeItems[0] });
    styleJson = text("styleJson", "Style JSON (only without Map ID)", "", "[{\"featureType\":...}]");
    autoFit = toggle("autoFit", "Auto-zoom to data", true);
    defaultLat = num("defaultLat", "Default latitude", 20.5937);
    defaultLng = num("defaultLng", "Default longitude", 78.9629);
    defaultZoom = num("defaultZoom", "Default zoom", 4);
    zoomControl = toggle("zoomControl", "Zoom control", true);
    mapTypeControl = toggle("mapTypeControl", "Map type control", true);
    streetViewControl = toggle("streetViewControl", "Street View control", true);
    fullscreenControl = toggle("fullscreenControl", "Fullscreen control", false);
    traffic = toggle("traffic", "Traffic layer", false);
    transit = toggle("transit", "Transit layer", false);
    bicycling = toggle("bicycling", "Bicycling layer", false);

    name = "mapSettings";
    displayName = "Map";
    slices: formattingSettings.Slice[] = [
        this.apiKey, this.mapId, this.mapType, this.styleJson, this.autoFit,
        this.defaultLat, this.defaultLng, this.defaultZoom,
        this.zoomControl, this.mapTypeControl, this.streetViewControl, this.fullscreenControl,
        this.traffic, this.transit, this.bicycling
    ];
}

export class DataColorsCard extends formattingSettings.SimpleCard {
    defaultColor = color("defaultColor", "Default color", "#EA4335");
    useGradient = toggle("useGradient", "Gradient by 'Color saturation'", true);
    minColor = color("minColor", "Minimum color", "#FDE7E4");
    maxColor = color("maxColor", "Maximum color", "#B31412");

    name = "dataColors";
    displayName = "Data colors";
    slices: formattingSettings.Slice[] = [this.defaultColor, this.useGradient, this.minColor, this.maxColor];
}

export class MarkersCard extends formattingSettings.SimpleCard {
    show = toggle("show", "Show markers", true);
    shape = new formattingSettings.ItemDropdown({ name: "shape", displayName: "Shape", items: markerShapeItems, value: markerShapeItems[0] });
    size = num("size", "Size (px)", 22);
    minSize = num("minSize", "Min bubble size (px)", 8);
    maxSize = num("maxSize", "Max bubble size (px)", 40);
    opacity = num("opacity", "Opacity (%)", 90);
    showLabels = toggle("showLabels", "Show labels", false);
    cluster = toggle("cluster", "Cluster markers", true);
    clusterRadius = num("clusterRadius", "Cluster radius (px)", 60);
    maxMarkers = num("maxMarkers", "Max markers (unclustered)", 5000);

    name = "markers";
    displayName = "Markers";
    slices: formattingSettings.Slice[] = [
        this.show, this.shape, this.size, this.minSize, this.maxSize, this.opacity,
        this.showLabels, this.cluster, this.clusterRadius, this.maxMarkers
    ];
}

export class LinesCard extends formattingSettings.SimpleCard {
    show = toggle("show", "Show lines", true);
    colorByData = toggle("colorByData", "Color by data", true);
    color = color("color", "Line color", "#4285F4");
    width = num("width", "Width (px)", 3);
    opacity = num("opacity", "Opacity (%)", 85);
    geodesic = toggle("geodesic", "Geodesic (great-circle)", false);
    arrows = toggle("arrows", "Direction arrows", true);
    showPathPoints = toggle("showPathPoints", "Show markers on path points", false);

    name = "lines";
    displayName = "Lines / routes";
    slices: formattingSettings.Slice[] = [
        this.show, this.colorByData, this.color, this.width, this.opacity,
        this.geodesic, this.arrows, this.showPathPoints
    ];
}

export class GeographyCard extends formattingSettings.SimpleCard {
    show = toggle("show", "Show shapes", true);
    fillOpacity = num("fillOpacity", "Fill opacity (%)", 55);
    strokeColor = color("strokeColor", "Border color", "#FFFFFF");
    strokeWidth = num("strokeWidth", "Border width (px)", 1);
    geoJsonUrl = text("geoJsonUrl", "GeoJSON URL (boundaries)", "", "https://.../states.geojson");
    joinProperty = text("joinProperty", "GeoJSON property to join on 'Location'", "name", "name");
    unmatchedColor = color("unmatchedColor", "Unmatched shape color", "#CCCCCC");

    name = "geography";
    displayName = "Geography / shapes";
    slices: formattingSettings.Slice[] = [
        this.show, this.fillOpacity, this.strokeColor, this.strokeWidth,
        this.geoJsonUrl, this.joinProperty, this.unmatchedColor
    ];
}

export class HeatmapCard extends formattingSettings.SimpleCard {
    show = toggle("show", "Show heatmap", false);
    radius = num("radius", "Radius (px)", 25);
    opacity = num("opacity", "Opacity (%)", 65);
    intensity = num("intensity", "Intensity", 1);

    name = "heatmap";
    displayName = "Heatmap";
    slices: formattingSettings.Slice[] = [this.show, this.radius, this.opacity, this.intensity];
}

export class GeocodingCard extends formattingSettings.SimpleCard {
    enable = toggle("enable", "Geocode 'Location' when lat/long missing", false);

    name = "geocoding";
    displayName = "Geocoding";
    slices: formattingSettings.Slice[] = [this.enable];
}

export class LegendCard extends formattingSettings.SimpleCard {
    show = toggle("show", "Show legend", true);
    title = text("title", "Title", "");

    name = "legend";
    displayName = "Legend";
    slices: formattingSettings.Slice[] = [this.show, this.title];
}

export class VisualSettings extends formattingSettings.Model {
    map = new MapSettingsCard();
    dataColors = new DataColorsCard();
    markers = new MarkersCard();
    lines = new LinesCard();
    geography = new GeographyCard();
    heatmap = new HeatmapCard();
    geocoding = new GeocodingCard();
    legend = new LegendCard();

    cards = [this.map, this.dataColors, this.markers, this.lines, this.geography, this.heatmap, this.geocoding, this.legend];
}
