'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ArcLayer } from '@deck.gl/layers';
import {
  MARKER_LAYERS, MARKER_ICON_SVG, MARKER_ICON_SIZE,
  markerImageId, markerImages, markerIconImage,
  renderMarkerIcon,
} from './mapMarkers';

interface OsirisMapProps {
  data: any;
  activeLayers: Record<string, boolean>;
  onEntityClick?: (entity: any) => void;
  onMouseCoords?: (coords: { lat: number; lng: number }) => void;
  onRightClick?: (coords: { lat: number; lng: number }) => void;
  onViewStateChange?: (vs: { zoom: number; latitude: number }) => void;
  flyToLocation?: { lat: number; lng: number; ts: number } | null;
  projection?: 'mercator' | 'globe';
  mapStyle?: string;
  sweepData?: any;
  scanTargets?: any[];
  demoMode?: boolean;
  theme?: 'core' | 'ghost';
}

function computeSolarTerminator(): [number, number][] {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const decRad = declination * Math.PI / 180;
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const subsolarLng = (12 - utcHours) * 15;
  const points: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += 2) {
    const lngRad = (lng - subsolarLng) * Math.PI / 180;
    const lat = Math.atan(-Math.cos(lngRad) / Math.tan(decRad)) * 180 / Math.PI;
    points.push([lng, lat]);
  }
  const darkSide = declination >= 0 ? -90 : 90;
  points.push([180, darkSide]);
  points.push([-180, darkSide]);
  points.push(points[0]);
  return points;
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

// Split a satellite ground track into segments that never jump across the
// antimeridian (±180° longitude), so the orbit line hugs the globe instead of
// drawing a straight streak across it. Returns GeoJSON LineString features.
function splitTrackFeatures(track: [number, number][], color: string): any[] {
  if (!track || track.length < 2) return [];
  const segments: [number, number][][] = [];
  let cur: [number, number][] = [track[0]];
  for (let i = 1; i < track.length; i++) {
    const [plng] = track[i - 1];
    const [lng, lat] = track[i];
    if (Math.abs(lng - plng) > 180) {
      // crossed the antimeridian — break the line here
      segments.push(cur);
      cur = [[lng, lat]];
    } else {
      cur.push([lng, lat]);
    }
  }
  if (cur.length > 1) segments.push(cur);
  return segments
    .filter(s => s.length > 1)
    .map(s => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: s }, properties: { color } }));
}

// Icon sprites are rasterized at this device-pixel ratio and added with a
// matching pixelRatio so they stay crisp on Retina/HiDPI screens. addImage
// defaults to pixelRatio 1, which the GPU upscales on a 2× display → blur.
const ICON_DPR = 2;

function OsirisMap({ data, activeLayers, onEntityClick, onMouseCoords, onRightClick, onViewStateChange, flyToLocation, projection = 'globe', mapStyle = 'dark', sweepData, scanTargets = [], demoMode = false, theme = 'core' }: OsirisMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const prevStyleRef = useRef(mapStyle);

  // ── deck.gl 3D overlay (elevated flight arcs) ──
  const deckOverlayRef = useRef<any>(null);
  const flightArcRef = useRef<any[]>([]);   // [{ source:[lng,lat], target:[lng,lat] }]
  const satByIdRef = useRef<Map<string, any>>(new Map()); // noradId/name → sat (for on-click orbit)

  // Rebuild the deck.gl layers from the current refs and push to the overlay.
  const updateDeck = useCallback(() => {
    const overlay = deckOverlayRef.current;
    if (!overlay) return;
    const layers: any[] = [];
    if (flightArcRef.current.length) {
      layers.push(new ArcLayer({
        id: 'flight-arc-3d',
        data: flightArcRef.current,
        getSourcePosition: (d: any) => d.source,
        getTargetPosition: (d: any) => d.target,
        getSourceColor: [26, 115, 232],
        getTargetColor: [255, 82, 82],
        getHeight: 0.35,
        getWidth: 2.5,
        widthUnits: 'pixels',
        parameters: { depthTest: false },
      }));
    }
    overlay.setProps({ layers });
  }, []);

  // Create aircraft icon on canvas (for WebGL symbol layer)
  const createIcon = useCallback((map: maplibregl.Map, id: string, color: string, size: number) => {
    if (map.hasImage(id)) return;
    const canvas = document.createElement('canvas');
    canvas.width = size * ICON_DPR; canvas.height = size * ICON_DPR;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ICON_DPR, ICON_DPR);
    const cx = size / 2, cy = size / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.4);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.1);
    ctx.lineTo(cx - size * 0.4, cy + size * 0.2);
    ctx.lineTo(cx - size * 0.4, cy + size * 0.3);
    ctx.lineTo(cx - size * 0.12, cy + size * 0.15);
    ctx.lineTo(cx, cy + size * 0.35);
    ctx.lineTo(cx + size * 0.12, cy + size * 0.15);
    ctx.lineTo(cx + size * 0.4, cy + size * 0.3);
    ctx.lineTo(cx + size * 0.4, cy + size * 0.2);
    ctx.lineTo(cx + size * 0.12, cy + size * 0.1);
    ctx.closePath();
    ctx.fill();
    map.addImage(id, { width: size * ICON_DPR, height: size * ICON_DPR, data: new Uint8Array(ctx.getImageData(0, 0, size * ICON_DPR, size * ICON_DPR).data) }, { pixelRatio: ICON_DPR });
  }, []);

  const createDot = useCallback((map: maplibregl.Map, id: string, color: string, size: number) => {
    if (map.hasImage(id)) return;
    const canvas = document.createElement('canvas');
    canvas.width = size * ICON_DPR; canvas.height = size * ICON_DPR;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ICON_DPR, ICON_DPR);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
    ctx.fill();
    map.addImage(id, { width: size * ICON_DPR, height: size * ICON_DPR, data: new Uint8Array(ctx.getImageData(0, 0, size * ICON_DPR, size * ICON_DPR).data) }, { pixelRatio: ICON_DPR });
  }, []);

  // Satellite icon (body + solar panels)
  const createSatelliteIcon = useCallback((map: maplibregl.Map, id: string, color: string, size: number) => {
    if (map.hasImage(id)) return;
    const canvas = document.createElement('canvas');
    canvas.width = size * ICON_DPR; canvas.height = size * ICON_DPR;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ICON_DPR, ICON_DPR);
    const cx = size / 2, cy = size / 2, s = size;

    // Solar panel wings
    ctx.fillStyle = '#5C6BC0';
    ctx.fillRect(cx - s * 0.45, cy - s * 0.08, s * 0.35, s * 0.16);
    ctx.fillRect(cx + s * 0.1, cy - s * 0.08, s * 0.35, s * 0.16);

    // Panel grid lines
    ctx.strokeStyle = '#7986CB';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(cx - s * 0.45, cy - s * 0.08, s * 0.35, s * 0.16);
    ctx.strokeRect(cx + s * 0.1, cy - s * 0.08, s * 0.35, s * 0.16);

    // Satellite body (rounded rect)
    ctx.fillStyle = color;
    const bx = cx - s * 0.08, by = cy - s * 0.15, bw = s * 0.16, bh = s * 0.3;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 2);
    ctx.fill();

    // Antenna
    ctx.strokeStyle = '#B0BEC5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, by);
    ctx.lineTo(cx, by - s * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, by - s * 0.15, s * 0.04, 0, Math.PI * 2);
    ctx.stroke();

    map.addImage(id, { width: size * ICON_DPR, height: size * ICON_DPR, data: new Uint8Array(ctx.getImageData(0, 0, size * ICON_DPR, size * ICON_DPR).data) }, { pixelRatio: ICON_DPR });
  }, []);

  // Military icon (stealth/fighter jet silhouette)
  const createMilitaryIcon = useCallback((map: maplibregl.Map, id: string, color: string, size: number) => {
    if (map.hasImage(id)) return;
    const canvas = document.createElement('canvas');
    canvas.width = size * ICON_DPR; canvas.height = size * ICON_DPR;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ICON_DPR, ICON_DPR);
    const cx = size / 2, cy = size / 2, s = size;

    ctx.fillStyle = color;
    ctx.beginPath();
    // Stealth/delta wing shape — angular, aggressive
    ctx.moveTo(cx, cy - s * 0.42);           // nose
    ctx.lineTo(cx - s * 0.15, cy + s * 0.05); // left cockpit
    ctx.lineTo(cx - s * 0.42, cy + s * 0.28); // left wing tip
    ctx.lineTo(cx - s * 0.38, cy + s * 0.32);
    ctx.lineTo(cx - s * 0.12, cy + s * 0.18); // left tail
    ctx.lineTo(cx - s * 0.08, cy + s * 0.38); // left exhaust
    ctx.lineTo(cx, cy + s * 0.34);            // center exhaust
    ctx.lineTo(cx + s * 0.08, cy + s * 0.38); // right exhaust
    ctx.lineTo(cx + s * 0.12, cy + s * 0.18); // right tail
    ctx.lineTo(cx + s * 0.38, cy + s * 0.32);
    ctx.lineTo(cx + s * 0.42, cy + s * 0.28); // right wing tip
    ctx.lineTo(cx + s * 0.15, cy + s * 0.05); // right cockpit
    ctx.closePath();
    ctx.fill();

    map.addImage(id, { width: size * ICON_DPR, height: size * ICON_DPR, data: new Uint8Array(ctx.getImageData(0, 0, size * ICON_DPR, size * ICON_DPR).data) }, { pixelRatio: ICON_DPR });
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // ── DEMO MODE SPINNING ──
    let spinReq: number | undefined = undefined;
    let isSpinning = false;
    
    const startSpinning = () => {
      if (!map) return;
      isSpinning = true;
      let lastTime = performance.now();
      
      const frame = (time: number) => {
        if (!isSpinning) return;
        
        // Only spin if the user is not actively dragging or zooming the map
        if (!map.isMoving() && !map.isZooming()) {
          const dt = time - lastTime;
          const center = map.getCenter();
          // Adjust spin speed: 0.5 degrees per second
          center.lng += (0.5 * dt) / 1000;
          map.setCenter(center);
        }
        
        lastTime = time;
        spinReq = requestAnimationFrame(frame);
      };
      
      spinReq = requestAnimationFrame(frame);
    };

    if (demoMode) {
      startSpinning();
    } else {
      isSpinning = false;
      if (spinReq) cancelAnimationFrame(spinReq);
    }

    return () => {
      isSpinning = false;
      if (spinReq) cancelAnimationFrame(spinReq);
      if (typeof window !== 'undefined' && (window as any)._globeSpinTimer) {
        clearInterval((window as any)._globeSpinTimer);
      }
    };
  }, [mapReady, demoMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    
    // Select basemap style
    const styleUrl = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [25.48, 42.70], zoom: 6.5, minZoom: 1.5, maxZoom: 18,
      attributionControl: false,
      maxPitch: 85,
      transformRequest: (url: string) => {
        // Route all CARTO CDN requests through the internal Next.js proxy API
        if (url.includes('cartocdn.com')) {
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
          return { url: `${baseUrl}/api/proxy-tiles?url=${encodeURIComponent(url)}` };
        }
        return { url };
      },
    });

    map.on('load', () => {
      mapRef.current = map;

      // deck.gl overlay for true-3D elevated arcs (flight routes + satellite orbits)
      try {
        const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
        map.addControl(overlay as any);
        deckOverlayRef.current = overlay;
      } catch (e) { console.error('[OSIRIS] deck.gl overlay init failed:', e); }

      // Theme colors
      const isGhost = theme === 'ghost';
      const phantomPurple = '#B388FF';
      const phantomDark = '#1A0040';
      const cameraColor = isGhost ? '#B388FF' : '#00E676';
      const flightCom = isGhost ? phantomPurple : '#1A73E8';
      const flightPriv = isGhost ? phantomPurple : '#FFD700';
      const flightGov = isGhost ? phantomPurple : '#FF9500';
      const flightMil = isGhost ? phantomPurple : '#FF3D3D';

      // Create icons — OSIRIS Unified Palette
      createIcon(map, 'plane-cyan', flightCom, 24);   
      createIcon(map, 'plane-green', flightPriv, 24);   
      createIcon(map, 'plane-pink', flightGov, 24);    
      createIcon(map, 'plane-red', flightMil, 24);     
      createIcon(map, 'plane-grey', isGhost ? phantomPurple : '#546E7A', 24);    
      createDot(map, 'dot-gold', isGhost ? phantomPurple : '#1A73E8', 8);
      createDot(map, 'dot-red', isGhost ? phantomPurple : '#D32F2F', 10);
      createDot(map, 'dot-orange', isGhost ? phantomPurple : '#E65100', 10);
      createDot(map, 'dot-green', isGhost ? phantomPurple : '#26A69A', 10);
      createDot(map, 'dot-fire', isGhost ? phantomPurple : '#E65100', 10);
      createDot(map, 'dot-cctv', cameraColor, 10);
      createSatelliteIcon(map, 'satellite-icon', '#B388FF', 24);
      createMilitaryIcon(map, 'mil-icon', '#EF5350', 24);

      // Track arrow icon (small triangle for flight path direction)
      {
        const s = 12, c = document.createElement('canvas');
        c.width = s * ICON_DPR; c.height = s * ICON_DPR;
        const ctx = c.getContext('2d')!;
        ctx.scale(ICON_DPR, ICON_DPR);
        ctx.fillStyle = '#00E676';
        ctx.beginPath();
        ctx.moveTo(1, 1);
        ctx.lineTo(s - 1, s / 2);
        ctx.lineTo(1, s - 1);
        ctx.closePath();
        ctx.fill();
        map.addImage('track-arrow', { width: s * ICON_DPR, height: s * ICON_DPR, data: new Uint8Array(ctx.getImageData(0, 0, s * ICON_DPR, s * ICON_DPR).data) }, { pixelRatio: ICON_DPR });
      }

      const sources = ['flights','military','jets','private-fl','satellites','orbit','earthquakes','gdelt','gps-jamming','day-night','cctv','fires','weather','infrastructure','maritime','maritime-choke','maritime-ships','live-news','sigint-news','conflict-zones', 'war-alerts-targets', 'war-alerts-lines', 'balloons', 'radiation', 'ip-sweep-devices', 'ip-sweep-pulse', 'ip-sweep-connections', 'scan-targets', 'malware-nodes', 'network-mesh', 'flight-route', 'flight-track', 'ransomware', 'eurepoc', 'power_plants', 'cables'];
      sources.forEach(s => map.addSource(s, { type: 'geojson', data: EMPTY_FC }));
      map.addSource('threat-intel-nodes', { type: 'geojson', data: EMPTY_FC });
map.addSource('drop-nodes', { type: 'geojson', data: EMPTY_FC });
map.addSource('tor-nodes', { type: 'geojson', data: EMPTY_FC });
map.addSource('cve-nodes', { type: 'geojson', data: EMPTY_FC });
map.addSource('mitre-nodes', { type: 'geojson', data: EMPTY_FC });
      map.addSource('cable-landing-points', { type: 'geojson', data: EMPTY_FC });
      map.addSource('ndbc-buoys', { type: 'geojson', data: EMPTY_FC });

      // Warning icon generator (parameterized — eliminates 3x copy-paste)
      const createWarningIcon = (id: string, color: string) => {
        const s = 20;
        const c = document.createElement('canvas');
        c.width = s * ICON_DPR; c.height = s * ICON_DPR;
        const ctx = c.getContext('2d')!;
        ctx.scale(ICON_DPR, ICON_DPR);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s/2, 1);
        ctx.lineTo(s - 1, s - 1);
        ctx.lineTo(1, s - 1);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('!', s/2, s - 4);
        map.addImage(id, { width: s * ICON_DPR, height: s * ICON_DPR, data: new Uint8Array(ctx.getImageData(0, 0, s * ICON_DPR, s * ICON_DPR).data) }, { pixelRatio: ICON_DPR });
      };
      createWarningIcon('warn-icon', '#D32F2F');
      createWarningIcon('warn-orange', '#E65100');
      createWarningIcon('warn-yellow', '#F9A825');

      map.addLayer({ id: 'conflict-icons', type: 'symbol', source: 'conflict-zones', layout: {
        'icon-image': ['match', ['get','severity'], 'war','warn-icon', 'high','warn-orange', 'warn-yellow'],
        'icon-size': ['interpolate',['linear'],['zoom'], 1,0.6, 4,0.8, 8,1],
        'icon-allow-overlap': true,
        'text-field': ['get','label'],
        'text-size': ['interpolate',['linear'],['zoom'], 1,7, 4,9, 8,11],
        'text-font': ['Open Sans Bold'],
        'text-offset': [0, 1.4],
        'text-allow-overlap': false,
      }, paint: {
        'text-color': ['match', ['get','severity'], 'war','#D32F2F', 'high','#E65100', '#F9A825'],
        'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.9,
      }});


      // Day/Night
      map.addLayer({ id: 'day-night-fill', type: 'fill', source: 'day-night', paint: { 'fill-color': isGhost ? '#0D0030' : '#000022', 'fill-opacity': 0.35 }});

      // Earthquakes — amber threat spectrum
      map.addLayer({ id: 'eq-circles', type: 'circle', source: 'earthquakes', paint: {
        'circle-radius': ['interpolate',['linear'],['get','magnitude'], 2.5,3, 5,8, 7,14],
        'circle-color': ['interpolate',['linear'],['get','magnitude'], 2.5,'#F9A825', 4,'#E65100', 6,'#D32F2F'],
        'circle-opacity': 0.55, 'circle-blur': 0.3, 'circle-stroke-width': 1, 'circle-stroke-color': '#F9A825', 'circle-stroke-opacity': 0.25,
      }});
      map.addLayer({ id: 'eq-label', type: 'symbol', source: 'earthquakes', filter: ['>=',['get','magnitude'],4.5], layout: {
        'text-field': ['concat','M',['to-string',['coalesce',['get','magnitude'],0]]], 'text-size': 9, 'text-font': ['Open Sans Regular'], 'text-offset': [0,1.5],
      }, paint: { 'text-color': '#B26A00', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1 }});

      // Fires — burnt sienna
      map.addLayer({ id: 'fires-heat', type: 'circle', source: 'fires', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,4, 10,8],
        'circle-color': '#E65100', 'circle-opacity': 0.45, 'circle-blur': 0.5,
      }});

      // CCTV — outer glow ring (black/white depending on theme)
      map.addLayer({ id: 'cctv-glow', type: 'circle', source: 'cctv', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,9, 14,12],
        'circle-color': '#000000', 'circle-opacity': 0.35, 'circle-blur': 1,
      }});
      // CCTV — main dot
      map.addLayer({ id: 'cctv-dots', type: 'circle', source: 'cctv', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2.5, 5,4, 10,6, 14,8],
        'circle-color': cameraColor, 'circle-opacity': 0.9,
        'circle-stroke-width': 2.5, 'circle-stroke-color': '#000000', 'circle-stroke-opacity': 0.9,
      }});
      // CCTV — labels at zoom 10+
      map.addLayer({ id: 'cctv-label', type: 'symbol', source: 'cctv', minzoom: 10, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.8], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': cameraColor, 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.8 }});

      // GDELT



      // ══ NETWORK INTEL — Live Malware (abuse.ch) — crimson threat ══
      map.addLayer({ id: 'malware-glow', type: 'circle', source: 'malware-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,12, 10,20],
        'circle-color': '#D32F2F', 'circle-opacity': 0.06, 'circle-blur': 0.5,
      }});
      map.addLayer({ id: 'malware-dots', type: 'circle', source: 'malware-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,4, 10,6],
        'circle-color': '#D32F2F',
        'circle-opacity': 0.9,
        'circle-stroke-width': 1, 'circle-stroke-color': '#000000', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'malware-label', type: 'symbol', source: 'malware-nodes', minzoom: 5, layout: {
        'text-field': ['get','malware'], 'text-size': 8, 'text-font': ['JetBrains Mono Bold', 'Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-max-width': 10, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#D32F2F', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.85 }});

      // ══ RANSOMWARE — Ransomware.live victims — crimson threat ══
      map.addLayer({ id: 'ransomware-glow', type: 'circle', source: 'ransomware', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,12, 10,20],
        'circle-color': '#D32F2F', 'circle-opacity': 0.06, 'circle-blur': 0.5,
      }});
      map.addLayer({ id: 'ransomware-dots', type: 'circle', source: 'ransomware', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,4, 10,6],
        'circle-color': '#D32F2F',
        'circle-opacity': 0.9,
        'circle-stroke-width': 1, 'circle-stroke-color': '#000000', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'ransomware-label', type: 'symbol', source: 'ransomware', minzoom: 5, layout: {
        'text-field': ['get','group_name'], 'text-size': 8, 'text-font': ['JetBrains Mono Bold', 'Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-max-width': 10, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#D32F2F', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.85 }});

      // ══ EuRepoC — cyber-incident dataset (local) — type-coloured ══
      map.addLayer({ id: 'eurepoc-glow', type: 'circle', source: 'eurepoc', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,12, 10,20],
        'circle-color': ['get','color'], 'circle-opacity': 0.06, 'circle-blur': 0.5,
      }});
      map.addLayer({ id: 'eurepoc-dots', type: 'circle', source: 'eurepoc', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,4, 10,6],
        'circle-color': ['get','color'],
        'circle-opacity': 0.9,
        'circle-stroke-width': 1, 'circle-stroke-color': '#000000', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'eurepoc-label', type: 'symbol', source: 'eurepoc', minzoom: 5, layout: {
        'text-field': ['get','name'], 'text-size': 8, 'text-font': ['JetBrains Mono Bold', 'Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#C2185B', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.85 }});

      // ══ NETWORK INTEL — Threat Intel (Blocklist.de, SSL Blacklist, PhishTank) ══
      map.addLayer({ id: 'threat-intel-glow', type: 'circle', source: 'threat-intel-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,12, 10,20],
        'circle-color': ['match', ['get','threat_type'],
          'blocklist_de','#FF6D00',
          'ssl_blacklist','#FF1744',
          'phishing','#AA00FF',
          'abuseipdb','#1A73E8',
          '#AA00FF'],
        'circle-opacity': 0.06, 'circle-blur': 0.5,
      }});
      map.addLayer({ id: 'threat-intel-dots', type: 'circle', source: 'threat-intel-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,4, 10,6],
        'circle-color': ['match', ['get','threat_type'],
          'blocklist_de','#FF6D00',
          'ssl_blacklist','#FF1744',
          'phishing','#AA00FF',
          'abuseipdb','#1A73E8',
          '#AA00FF'],
        'circle-opacity': 0.9,
        'circle-stroke-width': 1, 'circle-stroke-color': '#000000', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'threat-intel-label', type: 'symbol', source: 'threat-intel-nodes', minzoom: 5, layout: {
        'text-field': ['get','malware'], 'text-size': 8, 'text-font': ['JetBrains Mono Bold', 'Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-max-width': 10, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#FF6D00', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.85 }});

      // ══ CYBER INTEL — Spamhaus DROP (Routing Intelligence) ══
      map.addLayer({ id: 'drop-glow', type: 'circle', source: 'drop-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,20, 5,40, 10,80],
        'circle-color': '#FF9100', 'circle-opacity': 0.04, 'circle-blur': 0.8,
      }});
      map.addLayer({ id: 'drop-dots', type: 'circle', source: 'drop-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,8],
        'circle-color': '#FF9100', 'circle-opacity': 0.7,
        'circle-stroke-width': 1, 'circle-stroke-color': '#000', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'drop-label', type: 'symbol', source: 'drop-nodes', minzoom: 6, layout: {
        'text-field': ['get','cidr'], 'text-size': 7, 'text-font': ['JetBrains Mono Bold', 'Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-max-width': 14,
      }, paint: { 'text-color': '#E65100', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.8 }});

      // ══ CYBER INTEL — Tor Exit Nodes ══
      map.addLayer({ id: 'tor-glow', type: 'circle', source: 'tor-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,10, 10,18],
        'circle-color': '#6D28D9', 'circle-opacity': 0.06, 'circle-blur': 0.5,
      }});
      map.addLayer({ id: 'tor-dots', type: 'circle', source: 'tor-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,3.5, 10,5],
        'circle-color': '#6D28D9', 'circle-opacity': 0.85,
        'circle-stroke-width': 1, 'circle-stroke-color': '#000', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'tor-label', type: 'symbol', source: 'tor-nodes', minzoom: 7, layout: {
        'text-field': ['get','ip'], 'text-size': 7, 'text-font': ['JetBrains Mono Bold', 'Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-max-width': 14,
      }, paint: { 'text-color': '#6D28D9', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.8 }});

      // ══ CYBER INTEL — CVE Feed (Vulnerability Intelligence) ══
      map.addLayer({ id: 'cve-glow', type: 'circle', source: 'cve-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,8, 5,16, 10,30],
        'circle-color': ['case', ['>=', ['get','cvss'], 9], '#FF1744', ['>=', ['get','cvss'], 7], '#FF6D00', ['>=', ['get','cvss'], 4], '#FF9100', '#1A73E8'],
        'circle-opacity': 0.04, 'circle-blur': 0.7,
      }});
      map.addLayer({ id: 'cve-dots', type: 'circle', source: 'cve-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,10],
        'circle-color': ['case', ['>=', ['get','cvss'], 9], '#FF1744', ['>=', ['get','cvss'], 7], '#FF6D00', ['>=', ['get','cvss'], 4], '#FF9100', '#1A73E8'],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#000', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'cve-label', type: 'symbol', source: 'cve-nodes', minzoom: 5, layout: {
        'text-field': ['concat',['get','title'],' ','CVSS:',['to-string',['coalesce',['get','cvss'],0]]],
        'text-size': 7, 'text-font': ['JetBrains Mono Bold', 'Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-max-width': 14,
      }, paint: { 'text-color': ['case', ['>=', ['get','cvss'], 7], '#FF6D00', '#1A73E8'], 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.85 }});

      // ══ CYBER INTEL — MITRE ATT&CK (APT Group Intelligence) ══
      map.addLayer({ id: 'mitre-glow', type: 'circle', source: 'mitre-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,12, 5,25, 10,50],
        'circle-color': '#00E676', 'circle-opacity': 0.04, 'circle-blur': 0.8,
      }});
      map.addLayer({ id: 'mitre-dots', type: 'circle', source: 'mitre-nodes', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,8, 10,14],
        'circle-color': '#00E676', 'circle-opacity': 0.9,
        'circle-stroke-width': 2, 'circle-stroke-color': '#000', 'circle-stroke-opacity': 0.8,
      }});
      map.addLayer({ id: 'mitre-label', type: 'symbol', source: 'mitre-nodes', minzoom: 3, layout: {
        'text-field': ['concat',['get','name'],'\n[',['get','country'],']'],
        'text-size': 8, 'text-font': ['JetBrains Mono Bold', 'Open Sans Bold'],
        'text-offset': [0, 1.8], 'text-max-width': 14,
      }, paint: { 'text-color': '#1E8E3E', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.85 }});

      // ── NETWORK INTEL MESH (SDK STYLE) ──
      map.addLayer({ id: 'network-mesh-atmo', type: 'line', source: 'network-mesh', paint: {

        'line-width': ['interpolate',['linear'],['zoom'], 1, 2, 5, 4, 10, 8],
        'line-opacity': 0.08,
        'line-blur': 4,
      }});
      map.addLayer({ id: 'network-mesh-glow', type: 'line', source: 'network-mesh', paint: {

        'line-width': ['interpolate',['linear'],['zoom'], 1, 1, 5, 2, 10, 4],
        'line-opacity': 0.2,
        'line-blur': 1.5,
      }});
      map.addLayer({ id: 'network-mesh-core', type: 'line', source: 'network-mesh', paint: {

        'line-width': ['interpolate',['linear'],['zoom'], 1, 0.2, 5, 0.5, 10, 1.5],
        'line-opacity': 0.4,
      }});


      map.addLayer({ id: 'gdelt-dots', type: 'circle', source: 'gdelt', paint: {
        'circle-radius': 4, 'circle-color': '#D32F2F', 'circle-opacity': 0.5, 'circle-stroke-width': 1, 'circle-stroke-color': '#D32F2F', 'circle-stroke-opacity': 0.25,
      }});

      // GPS Jamming — H3 hex polygons from gpsjam.org
      map.addLayer({ id: 'jam-fill', type: 'fill', source: 'gps-jamming', paint: {
        'fill-color': ['get','color'], 'fill-opacity': ['get','opacity'],
      }});
      map.addLayer({ id: 'jam-line', type: 'line', source: 'gps-jamming', paint: {
        'line-color': ['get','color'], 'line-width': 1, 'line-opacity': 0.4,
      }});
      map.addLayer({ id: 'jam-label', type: 'symbol', source: 'gps-jamming', layout: {
        'text-field': ['concat',['to-string',['*',['get','ratio'],100]],'%'], 'text-size': 9, 'text-font': ['Open Sans Bold'], 'text-allow-overlap': true,
      }, paint: { 'text-color': '#E8EAED', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5 }});

      // Weather Events (NASA EONET) — deep violet
      map.addLayer({ id: 'weather-glow', type: 'circle', source: 'weather', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,11, 10,16],
        'circle-color': '#7E57C2', 'circle-opacity': 0.08, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'weather-dots', type: 'circle', source: 'weather', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,8],
        'circle-color': ['match', ['get','icon'], 'cyclone','#7E57C2', 'volcano','#D32F2F', '#7E57C2'],
        'circle-opacity': 0.75,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#7E57C2', 'circle-stroke-opacity': 0.35,
      }});
      map.addLayer({ id: 'weather-label', type: 'symbol', source: 'weather', layout: {
        'text-field': ['get','title'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 2], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#7E57C2', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1, 'text-opacity': 0.8 }});

      // NDBC buoys — in-situ sea/air temp, NOAA/NASA diverging RdBu palette
      // (cold blue → ~15°C white → hot deep red), matching the temperature fields.
      const tempColor: any = ['interpolate', ['linear'], ['get', 'temp'],
        -30, '#053061', -18, '#2166ac', -8, '#4393c3', 0, '#92c5de', 8, '#d1e5f0',
        15, '#f7f7f7', 21, '#fddbc7', 26, '#f4a582', 31, '#d6604d', 38, '#b2182b', 45, '#67001f'];
      map.addLayer({ id: 'buoy-glow', type: 'circle', source: 'ndbc-buoys', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,9, 10,16],
        'circle-color': tempColor, 'circle-opacity': 0.18, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'buoy-dots', type: 'circle', source: 'ndbc-buoys', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2.2, 5,4, 10,7],
        'circle-color': tempColor,
        'circle-stroke-color': 'rgba(6,8,15,0.8)', 'circle-stroke-width': 0.6,
      }});
      map.addLayer({ id: 'buoy-label', type: 'symbol', source: 'ndbc-buoys', minzoom: 4, layout: {
        'text-field': ['concat', ['to-string', ['round', ['get', 'temp']]], '°'],
        'text-size': ['interpolate',['linear'],['zoom'], 4,9, 8,12], 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 1], 'text-allow-overlap': false,
      }, paint: { 'text-color': '#E1F5FE', 'text-halo-color': 'rgba(6,8,15,0.95)', 'text-halo-width': 1.4 }});

      // Nuclear Infrastructure — teal / amber risk
      map.addLayer({ id: 'infra-glow', type: 'circle', source: 'infrastructure', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,8, 5,14, 10,22],
        'circle-color': ['case', ['in', 'SEISMIC RISK', ['get', 'status']], '#E65100', '#26A69A'],
        'circle-opacity': 0.08, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'infra-dots', type: 'circle', source: 'infrastructure', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,10],
        'circle-color': ['case', 
          ['in', 'SEISMIC RISK', ['get', 'status']], '#E65100',
          ['==', ['get','status'], 'Active Conflict Zone'], '#D32F2F', 
          ['==', ['get','status'], 'Destroyed / Decommissioning'], '#546E7A', 
          '#26A69A'
        ],
        'circle-opacity': 0.75,
        'circle-stroke-width': 1.5, 'circle-stroke-color': ['case', ['in', 'SEISMIC RISK', ['get', 'status']], '#E65100', '#26A69A'], 'circle-stroke-opacity': 0.35,
      }});
      map.addLayer({ id: 'infra-label', type: 'symbol', source: 'infrastructure', minzoom: 5, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 2], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': ['case', ['in', 'SEISMIC RISK', ['get', 'status']], '#E65100', '#26A69A'], 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1, 'text-opacity': 0.7 }});

      // ══ POWER PLANTS — Global Power Plant Database — teal spectrum ══
      map.addLayer({ id: 'power-plants-glow', type: 'circle', source: 'power_plants', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,10, 10,16],
        'circle-color': ['match', ['get','fuel_type'], 'Solar','#F9A825', 'Wind','#4FC3F7', 'Hydro','#1565C0', 'Nuclear','#D32F2F', 'Coal','#424242', 'Oil','#795548', 'Gas','#78909C', 'Biomass','#66BB6A', 'Geothermal','#E65100', 'Waste','#8D6E63', 'Petcoke','#37474F', '#26A69A'],
        'circle-opacity': 0.06, 'circle-blur': 0.5,
      }});
      map.addLayer({ id: 'power-plants-dots', type: 'circle', source: 'power_plants', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,3.5, 10,5],
        'circle-color': ['match', ['get','fuel_type'], 'Solar','#F9A825', 'Wind','#4FC3F7', 'Hydro','#1565C0', 'Nuclear','#D32F2F', 'Coal','#424242', 'Oil','#795548', 'Gas','#78909C', 'Biomass','#66BB6A', 'Geothermal','#E65100', 'Waste','#8D6E63', 'Petcoke','#37474F', '#26A69A'],
        'circle-opacity': 0.85,
        'circle-stroke-width': 1, 'circle-stroke-color': '#000', 'circle-stroke-opacity': 0.7,
      }});
      map.addLayer({ id: 'power-plants-label', type: 'symbol', source: 'power_plants', minzoom: 6, layout: {
        'text-field': ['get','name'], 'text-size': 8, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.5], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#0F766E', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1, 'text-opacity': 0.75 }});

      // Satellites — symbol layer with satellite icon + orbit ground track
      map.addLayer({ id: 'sat-glow', type: 'circle', source: 'satellites', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,6], 'circle-color': ['get','color'], 'circle-opacity': 0.3, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'sat-dots', type: 'symbol', source: 'satellites', layout: {
        'icon-image': 'satellite-icon', 'icon-size': ['interpolate',['linear'],['zoom'], 1,0.55, 5,0.8, 10,1.05],
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
      }, paint: {
        'icon-color': ['get','color'],
      }});
      map.addLayer({ id: 'sat-label', type: 'symbol', source: 'satellites', minzoom: 6, layout: {
        'text-field': ['get','name'], 'text-size': 8, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.2], 'text-max-width': 10, 'text-allow-overlap': false,
      }, paint: {
        'text-color': ['get','color'], 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1,
      }});

      // Satellite orbit — native maplibre line so it hugs the globe surface
      // correctly (no clipping through the sphere, correct at poles/antimeridian).
      // Populated with ONLY the clicked satellite's ground track (see sat click).
      map.addLayer({ id: 'orbit-line-glow', type: 'line', source: 'orbit', paint: {
        'line-color': ['coalesce', ['get', 'color'], '#B388FF'],
        'line-width': ['interpolate',['linear'],['zoom'], 1, 2.5, 6, 4],
        'line-opacity': 0.25, 'line-blur': 3,
      }});
      map.addLayer({ id: 'orbit-line', type: 'line', source: 'orbit', paint: {
        'line-color': ['coalesce', ['get', 'color'], '#B388FF'],
        'line-width': ['interpolate',['linear'],['zoom'], 1, 1, 6, 1.8],
        'line-opacity': 0.9,
      }});

      // Maritime — ports & naval bases — ocean teal
      map.addLayer({ id: 'maritime-glow', type: 'circle', source: 'maritime', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,12, 10,20],
        'circle-color': ['match', ['get','type'], 'naval','#D32F2F', 'energy','#E65100', '#26C6DA'],
        'circle-opacity': 0.08, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'maritime-dots', type: 'circle', source: 'maritime', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,9],
        'circle-color': ['match', ['get','type'], 'naval','#D32F2F', 'energy','#E65100', '#26C6DA'],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1.5, 'circle-stroke-color': ['match', ['get','type'], 'naval','#D32F2F', 'energy','#E65100', '#26C6DA'], 'circle-stroke-opacity': 0.35,
      }});
      map.addLayer({ id: 'maritime-label', type: 'symbol', source: 'maritime', minzoom: 4, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.8], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#0E7490', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1, 'text-opacity': 0.7 }});

      // Maritime chokepoints — amber threat spectrum
      map.addLayer({ id: 'choke-glow', type: 'circle', source: 'maritime-choke', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,10, 5,18, 10,28],
        'circle-color': '#E65100', 'circle-opacity': 0.1, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'choke-dots', type: 'circle', source: 'maritime-choke', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,7, 10,12],
        'circle-color': ['match', ['get','risk'], 'CRITICAL','#D32F2F', 'HIGH','#E65100', 'ELEVATED','#F9A825', '#26A69A'],
        'circle-opacity': 0.85,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#E65100', 'circle-stroke-opacity': 0.4,
      }});
      map.addLayer({ id: 'choke-label', type: 'symbol', source: 'maritime-choke', minzoom: 3, layout: {
        'text-field': ['get','name'], 'text-size': 10, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 2], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#E65100', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1, 'text-opacity': 0.9 }});

      // Live News — muted rose
      map.addLayer({ id: 'news-glow', type: 'circle', source: 'live-news', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,8, 5,14, 10,22],
        'circle-color': '#EC407A', 'circle-opacity': 0.08, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'news-dots', type: 'circle', source: 'live-news', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,10],
        'circle-color': '#EC407A', 'circle-opacity': 0.8,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#EC407A', 'circle-stroke-opacity': 0.4,
      }});
      map.addLayer({ id: 'news-label', type: 'symbol', source: 'live-news', minzoom: 4, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.8], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#EC407A', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1, 'text-opacity': 0.8 }});

      // SIGINT RSS news - gold markers
      map.addLayer({ id: 'sigint-news-glow', type: 'circle', source: 'sigint-news', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,6, 5,10, 10,18],
        'circle-color': '#1A73E8', 'circle-opacity': 0.12, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'sigint-news-dots', type: 'circle', source: 'sigint-news', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,8],
        'circle-color': '#1A73E8', 'circle-opacity': 0.9,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#FFF8DC', 'circle-stroke-opacity': 0.6,
      }});
      map.addLayer({ id: 'sigint-news-label', type: 'symbol', source: 'sigint-news', minzoom: 5, layout: {
        'text-field': ['get','source'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.6], 'text-max-width': 10, 'text-allow-overlap': false,
      }, paint: { 'text-color': '#1A73E8', 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1, 'text-opacity': 0.85 }});

      // ══ IP SWEEP — Neighborhood device visualization ══
      map.addLayer({ id: 'sweep-connections', type: 'line', source: 'ip-sweep-connections', paint: {
        'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.3, 'line-dasharray': [2, 4],
      }});
      map.addLayer({ id: 'sweep-pulse-ring', type: 'circle', source: 'ip-sweep-pulse', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 8,40, 12,80, 16,160],
        'circle-color': 'transparent', 'circle-opacity': 0.6,
        'circle-stroke-width': 2, 'circle-stroke-color': '#FF3D3D', 'circle-stroke-opacity': 0.4,
      }});
      map.addLayer({ id: 'sweep-device-glow', type: 'circle', source: 'ip-sweep-devices', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 8,8, 12,16, 16,30],
        'circle-color': ['get', 'color'], 'circle-opacity': 0.15, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'sweep-device-dots', type: 'circle', source: 'ip-sweep-devices', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 8,3, 12,6, 16,10],
        'circle-color': ['get', 'color'], 'circle-opacity': 0.95,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-opacity': 0.6,
      }});
      map.addLayer({ id: 'sweep-device-labels', type: 'symbol', source: 'ip-sweep-devices', minzoom: 13, layout: {
        'text-field': ['concat', ['get', 'device_type'], '\n', ['get', 'ip']],
        'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 2.2], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: {
        'text-color': ['get', 'color'], 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1.5, 'text-opacity': 0.9,
      }});

      // ══ SCAN TARGETS — Geolocated individual scans ══
      // Recon/OSINT findings — colour by threat verdict so malicious findings
      // (URLhaus, isMalicious, DNS-threat…) read crimson like the live threat
      // layers, while clean/info lookups stay cyan.
      map.addLayer({ id: 'scan-targets-glow', type: 'circle', source: 'scan-targets', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,12, 5,25, 10,40],
        'circle-color': ['case', ['==', ['get','malicious'], true], '#D32F2F', '#00E5FF'], 'circle-opacity': 0.15, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'scan-targets-dots', type: 'circle', source: 'scan-targets', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,5, 5,8, 10,12],
        'circle-color': ['case', ['==', ['get','malicious'], true], '#D32F2F', '#00E5FF'], 'circle-opacity': 0.9,
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#ECEFF1', 'circle-stroke-opacity': 0.7,
      }});
      map.addLayer({ id: 'scan-targets-label', type: 'symbol', source: 'scan-targets', layout: {
        'text-field': ['get', 'id'], 'text-size': 11, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 2], 'text-max-width': 14, 'text-allow-overlap': false,
      }, paint: {
        // Brighter text + a DARK halo so the label reads on both the light
        // (cream) and dark map themes — a white halo washed out on the light map.
        'text-color': ['case', ['==', ['get','malicious'], true], '#FF5252', '#00E5FF'],
        'text-halo-color': 'rgba(8,10,18,0.95)', 'text-halo-width': 2, 'text-opacity': 1,
      }});

      // Flight layers (WebGL symbol — GPU rendered, handles 50K+ smooth)
      const flightLayers = [
        { id: 'fl-commercial', src: 'flights', icon: 'plane-cyan' },
        { id: 'fl-private', src: 'private-fl', icon: 'plane-green' },
        { id: 'fl-jets', src: 'jets', icon: 'plane-pink' },
        { id: 'fl-military', src: 'military', icon: 'plane-red' },
      ];
      flightLayers.forEach(l => {
        map.addLayer({ id: l.id, type: 'symbol', source: l.src, layout: {
          'icon-image': l.icon, 'icon-size': ['interpolate',['linear'],['zoom'], 1,0.55, 5,0.8, 10,1.05],
          'icon-rotate': ['get','heading'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        }, paint: { 'icon-opacity': 0.85 }});
      });

      // Flight route arcs (drawn dynamically on click)
      // Flight origin→destination routes are now drawn as elevated 3D arcs via
      // the deck.gl ArcLayer (see updateDeck), not flat ground lines.

      map.addLayer({ id: 'flight-track-atmo', type: 'line', source: 'flight-track', layout: { visibility: 'none' }, paint: {
        'line-color': '#00E676', 'line-width': 4, 'line-opacity': 0.12, 'line-blur': 5,
      }});
      map.addLayer({ id: 'flight-track-glow', type: 'line', source: 'flight-track', layout: { visibility: 'none' }, paint: {
        'line-color': '#00E676', 'line-width': 2, 'line-opacity': 0.35, 'line-blur': 2,
      }});
      map.addLayer({ id: 'flight-track-core', type: 'line', source: 'flight-track', layout: { visibility: 'none' }, paint: {
        'line-color': '#00E676', 'line-width': 1.2, 'line-opacity': 0.7,
      }      });
      map.addLayer({ id: 'flight-track-arrows', type: 'symbol', source: 'flight-track', layout: { visibility: 'none',
        'symbol-placement': 'line', 'symbol-spacing': 150, 'icon-image': 'track-arrow',
        'icon-size': 0.5, 'icon-allow-overlap': true,
      }, paint: { 'icon-opacity': 0.5 }});

      // Balloons (moving entities)
      map.addLayer({ id: 'balloon-dots', type: 'circle', source: 'balloons', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,3, 5,5, 10,7],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-stroke-opacity': 0.5,
      }});
      map.addLayer({ id: 'balloon-label', type: 'symbol', source: 'balloons', minzoom: 4, layout: {
        'text-field': ['get','callsign'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.2], 'text-max-width': 12, 'text-allow-overlap': false,
      }, paint: { 'text-color': ['get', 'color'], 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1 }});

      // Radiation — violet base, threat spectrum for danger/warning
      map.addLayer({ id: 'rad-glow', type: 'circle', source: 'radiation', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,10, 5,20, 10,40],
        'circle-color': ['match', ['get','status'], 'DANGER','#D32F2F', 'WARNING','#E65100', '#7E57C2'],
        'circle-opacity': 0.12, 'circle-blur': 1,
      }});
      map.addLayer({ id: 'rad-dots', type: 'circle', source: 'radiation', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,4, 5,6, 10,8],
        'circle-color': ['match', ['get','status'], 'DANGER','#D32F2F', 'WARNING','#E65100', '#7E57C2'],
        'circle-opacity': 0.85,
        'circle-stroke-width': 1.5, 'circle-stroke-color': ['match', ['get','status'], 'DANGER','#D32F2F', 'WARNING','#E65100', '#7E57C2'], 'circle-stroke-opacity': 0.35,
      }});
      map.addLayer({ id: 'rad-label', type: 'symbol', source: 'radiation', minzoom: 5, layout: {
        'text-field': ['concat', ['to-string', ['coalesce', ['get','reading'], 0]], ' nSv/h'], 'text-size': 9, 'text-font': ['Open Sans Bold'],
        'text-offset': [0, 1.5], 'text-allow-overlap': false,
      }, paint: { 'text-color': ['match', ['get','status'], 'DANGER','#D32F2F', 'WARNING','#E65100', '#9CCC65'], 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1 }});

      // ══ SUBMARINE CABLES — standalone layer (all cables, uniform amber) ══
      map.addLayer({ id: 'cables-line', type: 'line', source: 'cables', paint: {
        'line-color': ['coalesce', ['get', 'color'], '#FF6D00'],
        'line-width': ['interpolate',['linear'],['zoom'], 1, 1, 5, 1.5, 10, 2.5],
        'line-opacity': ['interpolate',['linear'],['zoom'], 1, 0.45, 5, 0.6, 10, 0.8],
      }});
      map.addLayer({ id: 'cables-glow', type: 'line', source: 'cables', paint: {
        'line-color': '#FF6D00',
        'line-width': ['interpolate',['linear'],['zoom'], 1, 3, 5, 6, 10, 10],
        'line-opacity': 0.08,
        'line-blur': 3,
      }});

      // Cable highlight layer (visible on click, hidden by default)
      map.addLayer({
        id: 'cable-highlight',
        type: 'line',
        source: 'cables',
        layout: { visibility: 'none' },
        paint: {
          'line-color': 'rgba(255,200,50,0.9)',
          'line-width': 4,
          'line-opacity': 0.9,
        }
      });

      // Cable Landing Points — visible dots at cable origin/termination stations
      map.addLayer({ id: 'cable-landing-points-dots', type: 'circle', source: 'cable-landing-points', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1, 2, 5, 3, 10, 5],
        'circle-color': '#FF6D00',
        'circle-opacity': 0.9,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#000',
        'circle-stroke-opacity': 0.5,
      }});


      // Maritime Ships (moving entities) — ocean teal family
      map.addLayer({ id: 'ship-dots', type: 'circle', source: 'maritime-ships', paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 1,2, 5,4, 10,6],
        'circle-color': ['match', ['get','type'], 'military','#D32F2F', 'tanker','#E65100', 'cargo','#26C6DA', '#B0BEC5'],
        'circle-opacity': 0.75,
      }});
      map.addLayer({ id: 'ship-label', type: 'symbol', source: 'maritime-ships', minzoom: 5, layout: {
        'text-field': ['get','name'], 'text-size': 9, 'text-font': ['Open Sans Regular'],
        'text-offset': [0, 1.2], 'text-allow-overlap': false,
      }, paint: { 'text-color': ['match', ['get','type'], 'military','#D32F2F', 'tanker','#E65100', 'cargo','#26C6DA', '#B0BEC5'], 'text-halo-color': 'rgba(6,8,15,0.9)', 'text-halo-width': 1 }});

      // ── Per-layer marker icons (tinted lucide glyphs on top of glow halos) ──
      // Icons sit above the existing dots; layers toggle by emptying their
      // source, so these symbol layers hide automatically when a layer is off.
      for (const m of MARKER_LAYERS) {
        if (!map.getSource(m.source)) continue;
        for (const { icon, color } of markerImages(m)) {
          const imgId = markerImageId(icon, color);
          if (!map.hasImage(imgId)) {
            const img = renderMarkerIcon(MARKER_ICON_SVG[icon], color);
            map.addImage(imgId, img, { pixelRatio: ICON_DPR });
          }
        }
        const layerId = `${m.source}-marker`;
        if (!map.getLayer(layerId)) {
          map.addLayer({
            id: layerId,
            type: 'symbol',
            source: m.source,
            layout: {
              'icon-image': markerIconImage(m) as any,
              'icon-size': MARKER_ICON_SIZE as any,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          });
        }
      }

      setMapReady(true);
    });

    // Events
    let lastMove = 0;
    map.on('mousemove', e => {
      const now = Date.now();
      if (now - lastMove > 100) {
        lastMove = now;
        onMouseCoords?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    });
    map.on('contextmenu', e => { e.preventDefault(); onRightClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }); });
    map.on('moveend', () => {
      const c = map.getCenter();
      onViewStateChange?.({ zoom: map.getZoom(), latitude: c.lat });
    });

    // ── POPUP HELPER ──
    const popup = (coords: any, html: string) => {
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '420px', offset: 14 }).setLngLat(coords).setHTML(html).addTo(map);
    };
    const pStyle = `background:#FFFFFF;color:#202124;backdrop-filter:blur(16px);border-radius:12px;padding:16px;font-family:'JetBrains Mono',monospace;box-shadow:0 1px 3px rgba(60,64,67,0.2),0 4px 16px rgba(60,64,67,0.15);`;
    const linkStyle = `display:inline-block;margin-top:8px;padding:5px 12px;font-size:10px;letter-spacing:0.12em;text-decoration:none;border-radius:5px;font-family:'JetBrains Mono',monospace;`;
    // ── Flights (with FlightAware + ADS-B Exchange links + enriched route) ──
    const enrichmentCache = new Map<string, any>();
    ['fl-commercial','fl-private','fl-jets','fl-military'].forEach(layer => {
      map.on('click', layer, e => {
        if (!e.features?.length) return;
        const p = e.features[0].properties as any;
        const coords = (e.features[0].geometry as any).coordinates;
        const cs = (p.callsign||'').trim();
        const icao24 = (p.icao24||'').trim();
        const showPopup = (extra: string) => popup(coords, `<div style="${pStyle}border:1px solid rgba(26,115,232,0.3);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#1A73E8;font-size:16px;font-weight:700;letter-spacing:0.1em;">${cs}</span>
            <span style="color:#6F8092;font-size:10px;">${icao24}</span>
          </div>
          ${extra}
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px;margin-top:8px;">
            <div><span style="color:#6F8092;font-size:9px;">MODEL</span><br/><span style="color:#1E293B;">${p.model||'—'}</span></div>
            <div><span style="color:#6F8092;font-size:9px;">ALT</span><br/><span style="color:#1A73E8;">${p.alt?Math.round(p.alt)+'m':'—'}</span></div>
            <div><span style="color:#6F8092;font-size:9px;">SPEED</span><br/><span style="color:#1E293B;">${p.speed_knots||'—'}kt</span></div>
            <div><span style="color:#6F8092;font-size:9px;">HDG</span><br/><span style="color:#1E293B;">${Math.round(p.heading||0)}°</span></div>
            <div><span style="color:#6F8092;font-size:9px;">REG</span><br/><span style="color:#1E293B;">${p.registration||'—'}</span></div>
            <div><span style="color:#6F8092;font-size:9px;">POS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(2)},${coords[0].toFixed(2)}</span></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">
            <a href="https://www.flightaware.com/live/flight/${cs}" target="_blank" style="${linkStyle}color:#1A73E8;border:1px solid rgba(26,115,232,0.4);background:rgba(26,115,232,0.1);">⚡ FLIGHTAWARE</a>
            <a href="https://globe.adsbexchange.com/?icao=${icao24}" target="_blank" style="${linkStyle}color:#1A73E8;border:1px solid rgba(0,229,255,0.4);background:rgba(0,229,255,0.1);">📡 ADS-B</a>
            <a href="https://www.radarbox.com/data/flights/${cs}" target="_blank" style="${linkStyle}color:#FF69B4;border:1px solid rgba(255,105,180,0.4);background:rgba(255,105,180,0.1);">📍 RADARBOX</a>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;">
            <button onclick="window.openOsirisIntel({ callsign: '${cs}', icao24: '${icao24}', model: '${p.model||''}', registration: '${p.registration||''}' })" style="flex:1;padding:6px 12px;background:rgba(26,115,232,0.15);border:1px solid rgba(26,115,232,0.5);color:#1A73E8;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.1em;border-radius:4px;cursor:pointer;">[ INTEL ]</button>
            <button onclick="window.showFlightTrack('${icao24}', '${cs}')" style="flex:1;padding:6px 12px;background:rgba(0,230,118,0.15);border:1px solid rgba(0,230,118,0.5);color:#00E676;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.1em;border-radius:4px;cursor:pointer;">[ TRACK ]</button>
          </div>
        </div>`);

        // Show initial popup with loading indicator
        showPopup(`<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:9px;color:#6F8092;">
          <span style="display:inline-block;width:8px;height:8px;border:1px solid #1A73E8;border-top-color:transparent;border-radius:50%;animation:osiris-spin .6s linear infinite;"></span>
          LOADING ROUTE...
        </div>`);

        // ── Enrichment fetch ──
        const cacheKey = `${cs}|${icao24}`;
        const cached = enrichmentCache.get(cacheKey);
        const enrichmentPromise = cached
          ? Promise.resolve(cached)
          : fetch(`/api/flight/enrich?callsign=${encodeURIComponent(cs)}&icao24=${icao24}`, { cache: 'no-store' })
              .then(r => r.ok ? r.json() : null)
              .catch(() => null);

        enrichmentPromise.then(data => {
          if (!data) {
            showPopup(`<div style="font-size:9px;color:#6F8092;margin-bottom:6px;">ROUTE: NOT FOUND</div>`);
            return;
          }
          enrichmentCache.set(cacheKey, data);

          const r = data.route;
          const ac = data.aircraft;

          // Build route HTML
          let routeHtml = '';
          if (r) {
            const origin = r.origin;
            const dest = r.destination;
            const airline = r.airline;

            if (origin && dest) {
              // Draw the origin→destination route as an elevated 3D arc (deck.gl).
              flightArcRef.current = [{
                source: [origin.lng, origin.lat],
                target: [dest.lng, dest.lat],
              }];
              updateDeck();

              routeHtml = `<div style="margin-bottom:8px;padding:6px 8px;background:rgba(26,115,232,0.08);border:1px solid rgba(26,115,232,0.2);border-radius:4px;">
                <div style="font-size:9px;color:#6F8092;letter-spacing:0.1em;margin-bottom:4px;">═ FLIGHT ROUTE ═</div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:10px;">
                  <span style="color:#1A73E8;">🛫</span>
                  <span style="color:#1E293B;"><strong>${origin.iata || origin.icao}</strong> ${origin.municipality}, ${origin.country}</span>
                  <span style="color:#FF5252;">🛬</span>
                  <span style="color:#1E293B;"><strong>${dest.iata || dest.icao}</strong> ${dest.municipality}, ${dest.country}</span>
                </div>
                ${airline ? `<div style="margin-top:4px;font-size:9px;color:#1A73E8;">✈ ${airline.name} · ${airline.country}${airline.iata ? ' ('+airline.iata+')' : ''}</div>` : ''}
              </div>`;
            } else if (airline) {
              routeHtml = `<div style="margin-bottom:8px;padding:4px 6px;background:rgba(26,115,232,0.08);border:1px solid rgba(26,115,232,0.2);border-radius:4px;font-size:9px;">
                <span style="color:#1A73E8;">✈ ${airline.name}</span>
                <span style="color:#6F8092;"> · ${airline.country}</span>
              </div>`;
            }
          }

          // Build aircraft detail
          let acHtml = '';
          if (ac) {
            acHtml = `<div style="font-size:9px;color:#6F8092;margin-top:2px;">
              ${ac.icao_type ? ac.icao_type : ac.type || ''}${ac.manufacturer ? ' · '+ac.manufacturer : ''}${ac.owner ? ' · '+ac.owner : ''}
            </div>`;
          }

          showPopup(routeHtml + acHtml);
        });
      });
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    });

    // ── Great-circle arc helper ──
    function greatCircleArc(lng1: number, lat1: number, lng2: number, lat2: number, steps: number = 32): [number, number][] {
      const toRad = (d: number) => d * Math.PI / 180;
      const toDeg = (r: number) => r * 180 / Math.PI;
      const pts: [number, number][] = [];
      const dLng = toRad(lng2 - lng1);
      const lat1r = toRad(lat1);
      const lat2r = toRad(lat2);
      const lng1r = toRad(lng1);
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const A = Math.sin((1 - f) * Math.PI / 2) / Math.sin(Math.PI / 2);
        const B = Math.sin(f * Math.PI / 2) / Math.sin(Math.PI / 2);
        const x = A * Math.cos(lat1r) * Math.cos(lng1r) + B * Math.cos(lat2r) * Math.cos(lng1r + dLng);
        const y = A * Math.cos(lat1r) * Math.sin(lng1r) + B * Math.cos(lat2r) * Math.sin(lng1r + dLng);
        const z = A * Math.sin(lat1r) + B * Math.sin(lat2r);
        const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
        const lng = toDeg(Math.atan2(y, x));
        pts.push([lng, lat]);
      }
      return pts;
    }

    // ── CCTV (metadata popup + opens CameraViewer panel) ──
    map.on('click', 'cctv-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const dotColor = '#7E57C2';
      const streamType = p.stream_type || 'jpg';
      const camMeta = [
        ['SOURCE', p.source || '—'],
        ['CITY', p.city || '—'],
        ['COUNTRY', p.country || '—'],
        ['FEED TYPE', streamType.toUpperCase()],
      ].map(([k, v]) => `<div><span style="color:#6F8092;font-size:8px;">${k}</span><br/><span style="color:#1E293B;font-size:9px;">${v}</span></div>`).join('');
      popup(coords, `<div style="${pStyle}border:1px solid ${dotColor}40;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${dotColor}40;padding-bottom:6px;margin-bottom:8px;">
          <div style="color:${dotColor};font-size:11px;font-weight:700;letter-spacing:0.05em;">${p.name || 'CCTV Camera'}</div>
          <div style="color:#6F8092;font-size:8px;">${coords[1].toFixed(3)}, ${coords[0].toFixed(3)}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          ${camMeta}
        </div>
        <button onclick="window.openOsirisIntel({ type: 'cctv', id: '${p.id}', name: '${p.name?.replace(/'/g, '\\\'') || ''}', city: '${p.city || ''}', country: '${p.country || ''}', source: '${p.source || ''}', feed_url: '${p.feed_url || ''}', stream_url: '${p.stream_url || ''}', stream_type: '${p.stream_type || ''}', external_url: '${p.external_url || ''}', lat: ${coords[1]}, lng: ${coords[0]} })" style="width:100%;padding:7px 12px;background:linear-gradient(90deg,${dotColor}15 0%,${dotColor}25 100%);border:1px solid ${dotColor}80;color:${dotColor};font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;border-radius:4px;cursor:pointer;">OPEN FEED</button>
      </div>`);
      map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 13), duration: 1000 });
    });

    // ── Earthquakes (with USGS link) ──
    map.on('click', 'eq-circles', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,149,0,0.3);">
        <div style="color:#FF9500;font-size:14px;font-weight:700;margin-bottom:4px;">M${p.magnitude} EARTHQUAKE</div>
        <div style="font-size:9px;color:#1E293B;margin-bottom:8px;">${p.place||'Unknown location'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;">
          <div><span style="color:#6F8092;">DEPTH</span><br/><span style="color:#1E293B;">${p.depth||'—'}km</span></div>
          <div><span style="color:#6F8092;">COORDS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(3)}, ${coords[0].toFixed(3)}</span></div>
          <div><span style="color:#6F8092;">SOURCE</span><br/><span style="color:#FFB74D;">${p.source||'USGS'}</span></div>
        </div>
        ${p.url ? `<a href="${p.url}" target="_blank" style="${linkStyle}color:#FF9500;border:1px solid rgba(255,149,0,0.4);background:rgba(255,149,0,0.1);">📊 ${p.source||'USGS'} DETAILS</a>` : ''}
      </div>`);
    });

    // ── Satellites (SatNOGS powered + SatNOGS DB enrichment) ──
    const enrichCache = new Map<string, any>();
    map.on('click', 'sat-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const noradId = p.noradId || '';
      const satName = p.name || 'Unknown';

      // Draw ONLY this satellite's orbit as a native maplibre line on the globe
      // (antimeridian-split so it hugs the sphere and is correct at the poles).
      const sat = satByIdRef.current.get(String(noradId)) || satByIdRef.current.get(String(satName));
      if (sat?.groundTrack?.length) {
        setGeo('orbit', splitTrackFeatures(sat.groundTrack as [number, number][], sat.color || '#B388FF'));
      }

      const showPopup = (extra: string) => popup(coords, `<div style="${pStyle}border:1px solid rgba(179,136,255,0.3);">
        ${extra}
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#6F8092;">MISSION</span><br/><span style="color:${p.color||'#aaa'};">${p.mission||'Unknown'}</span></div>
          <div><span style="color:#6F8092;">ALT</span><br/><span style="color:#1A73E8;">${p.alt ? p.alt+' km' : '—'}</span></div>
          <div><span style="color:#6F8092;">POS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(2)}°, ${coords[0].toFixed(2)}°</span></div>
        </div>
        ${noradId ? `<a href="https://db.satnogs.org/satellite/${noradId}/" target="_blank" style="display:block;text-align:center;padding:4px;margin-top:6px;font-size:8px;font-family:monospace;letter-spacing:0.1em;text-decoration:none;color:#1A73E8;border:1px solid rgba(0,229,255,0.4);background:rgba(0,229,255,0.1);border-radius:2px;cursor:pointer;">🔭 SOURCE: SATNOGS</a>` : ''}
      </div>`);

      // Show initial popup with loading
      const loadingHtml = `<div style="color:#1A73E8;font-size:13px;font-weight:700;letter-spacing:0.1em;margin-bottom:6px;">🛰️ ${satName}${noradId ? ' <span style="color:#6F8092;font-size:9px;font-weight:400;">NORAD: '+noradId+'</span>' : ''}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:9px;color:#6F8092;">
          <span style="display:inline-block;width:8px;height:8px;border:1px solid #1A73E8;border-top-color:transparent;border-radius:50%;animation:osiris-spin .6s linear infinite;"></span>
          LOADING SATNOGS DATA...
        </div>`;
      showPopup(loadingHtml);

      if (!noradId) return;

      // ── Enrichment fetch ──
      const cached = enrichCache.get(noradId);
      const promise = cached
        ? Promise.resolve(cached)
        : fetch(`/api/satellites/enrich?noradId=${noradId}`, { cache: 'no-store' })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null);

      promise.then(data => {
        if (!data) {
          showPopup(`<div style="color:#1A73E8;font-size:13px;font-weight:700;letter-spacing:0.1em;margin-bottom:6px;">🛰️ ${satName}${noradId ? ' <span style="color:#6F8092;font-size:9px;font-weight:400;">NORAD: '+noradId+'</span>' : ''}</div>
            <div style="font-size:9px;color:#6F8092;margin-bottom:6px;">ENRICHMENT NOT FOUND</div>`);
          return;
        }
        enrichCache.set(noradId, data);

        const sat = data.satellite;
        const txs: any[] = data.transmitters || [];

        // Build header
        let headerHtml = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="color:#1A73E8;font-size:13px;font-weight:700;letter-spacing:0.1em;">🛰️ ${sat?.name || satName}</div>
          ${noradId ? `<div style="color:#6F8092;font-size:9px;font-family:monospace;">#${noradId}</div>` : ''}
        </div>`;

        // Satellite metadata section
        let metaHtml = '';
        if (sat) {
          const rows: string[] = [];
          if (sat.countries) rows.push(`<div><span style="color:#6F8092;">COUNTRIES</span><br/><span style="color:#1E293B;">${sat.countries}</span></div>`);
          if (sat.status) rows.push(`<div><span style="color:#6F8092;">STATUS</span><br/><span style="color:${sat.status === 'alive' ? '#00E676' : '#FF5252'};">${sat.status.toUpperCase()}</span></div>`);
          if (sat.operator) rows.push(`<div><span style="color:#6F8092;">OPERATOR</span><br/><span style="color:#1E293B;">${sat.operator}</span></div>`);
          if (sat.launched) rows.push(`<div><span style="color:#6F8092;">LAUNCHED</span><br/><span style="color:#1E293B;">${sat.launched.split('T')[0]}</span></div>`);
          if (sat.decayed) rows.push(`<div><span style="color:#6F8092;">DECAYED</span><br/><span style="color:#FF5252;">${sat.decayed.split('T')[0]}</span></div>`);

          if (rows.length > 0) {
            metaHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;padding:6px;background:rgba(26,115,232,0.06);border-radius:4px;">${rows.join('')}</div>`;
          }
        }

        // Orbital catalog section (Celestrak SATCAT — KeepTrack-style)
        let orbitalHtml = '';
        const orb = data.orbital;
        if (orb) {
          const cell = (label: string, val: any, unit = '', color = '#1E293B') =>
            (val !== null && val !== undefined && val !== '')
              ? `<div><span style="color:#6F8092;">${label}</span><br/><span style="color:${color};">${val}${unit}</span></div>` : '';
          const cells = [
            cell('TYPE', orb.object_type),
            cell('COSPAR', orb.intl_designator),
            cell('OWNER', orb.owner),
            cell('INCL', orb.inclination_deg, '°', '#1A73E8'),
            cell('PERIOD', orb.period_min, ' min', '#1A73E8'),
            cell('APOGEE', orb.apogee_km, ' km', '#1A73E8'),
            cell('PERIGEE', orb.perigee_km, ' km', '#1A73E8'),
            cell('RCS', orb.rcs_m2, ' m²'),
            cell('LAUNCH', orb.launch_date),
            cell('SITE', orb.launch_site),
          ].filter(Boolean);
          if (cells.length) {
            orbitalHtml = `<div style="margin-bottom:8px;padding:6px;background:rgba(179,136,255,0.07);border:1px solid rgba(179,136,255,0.2);border-radius:4px;">
              <div style="font-size:8px;color:#6F8092;letter-spacing:0.1em;margin-bottom:4px;">═ ORBITAL CATALOG (CELESTRAK) ═</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:9px;">${cells.join('')}</div>
            </div>`;
          }
        }

        // Transmitters section
        let txHtml = '';
        if (txs.length > 0) {
          const lines = txs.map((tx: any, i: number) => {
            const freq = (hz: number | null) => hz ? (hz >= 1e9 ? (hz/1e9).toFixed(3)+' GHz' : hz >= 1e6 ? (hz/1e6).toFixed(2)+' MHz' : (hz/1e3).toFixed(1)+' kHz') : '—';
            return `<div style="padding:4px 0;${i > 0 ? 'border-top:1px solid rgba(179,136,255,0.15);' : ''}">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#1A73E8;font-size:9px;font-weight:bold;">${tx.description || tx.type || 'Transmitter'}</span>
                <span style="color:${tx.alive ? '#00E676' : '#6F8092'};font-size:8px;">${tx.status?.toUpperCase() || (tx.alive ? 'ACTIVE' : 'INACTIVE')}</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:8px;margin-top:2px;">
                ${tx.downlink_low ? `<div><span style="color:#6F8092;">⬇ DL</span> <span style="color:#1A73E8;">${freq(tx.downlink_low)}</span></div>` : ''}
                ${tx.uplink_low ? `<div><span style="color:#6F8092;">⬆ UL</span> <span style="color:#FFD740;">${freq(tx.uplink_low)}</span></div>` : ''}
                ${tx.mode ? `<div><span style="color:#6F8092;">🔊 MODE</span> <span style="color:#1E293B;">${tx.mode}</span></div>` : ''}
                ${tx.baud ? `<div><span style="color:#6F8092;">⚡ BAUD</span> <span style="color:#1E293B;">${tx.baud}</span></div>` : ''}
              </div>
              ${tx.type ? `<div style="font-size:7px;color:#6F8092;margin-top:2px;">${tx.type}${tx.service && tx.service !== 'Unknown' ? ' · '+tx.service : ''}</div>` : ''}
            </div>`;
          });
          txHtml = `<div style="margin-top:6px;padding:6px;background:rgba(60,64,67,0.06);border-radius:4px;">
            <div style="font-size:8px;color:#6F8092;letter-spacing:0.1em;margin-bottom:4px;">═ TRANSMITTERS (${txs.length}) ═</div>
            ${lines.join('')}
          </div>`;
        }

        // Website link
        const webHtml = sat?.website
          ? `<a href="${sat.website}" target="_blank" style="display:inline-block;margin-top:6px;padding:3px 8px;font-size:8px;color:#1A73E8;border:1px solid rgba(26,115,232,0.4);background:rgba(26,115,232,0.1);border-radius:4px;text-decoration:none;font-family:'JetBrains Mono',monospace;">🌐 OFFICIAL SITE</a>`
          : '';

        showPopup(headerHtml + metaHtml + orbitalHtml + txHtml + webHtml);
      });
    });

    // ── Fires (with NASA FIRMS link) ──
    map.on('click', 'fires-heat', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const isVolcano = p.type === 'volcano';
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,107,0,0.3);">
        <div style="color:#FF6B00;font-size:12px;font-weight:700;margin-bottom:6px;">${isVolcano ? '🌋 ' + (p.title || 'VOLCANO') : '🔥 ACTIVE FIRE DETECTED'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#6F8092;">BRIGHTNESS</span><br/><span style="color:#FF6B00;">${p.brightness||'—'}K</span></div>
          <div><span style="color:#6F8092;">FIRE POWER</span><br/><span style="color:#FFB74D;">${p.frp ? Number(p.frp).toFixed(1)+' MW' : '—'}</span></div>
          <div><span style="color:#6F8092;">SATELLITE</span><br/><span style="color:#1E293B;">${p.satellite||'—'}</span></div>
          <div><span style="color:#6F8092;">CONFIDENCE</span><br/><span style="color:#1E293B;">${p.confidence||'—'}${p.daynight ? ' · '+String(p.daynight).toUpperCase() : ''}</span></div>
          <div style="grid-column:1/3;"><span style="color:#6F8092;">COORDS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
        <a href="https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;l:noaa20-viirs,viirs,modis_a,modis_t;@${coords[0]},${coords[1]},10z" target="_blank" style="${linkStyle}color:#FF6B00;border:1px solid rgba(255,107,0,0.4);background:rgba(255,107,0,0.1);">🛰️ NASA FIRMS MAP</a>
      </div>`);
    });

    // ── Malware Threats (Abuse.ch) ──
    map.on('click', 'malware-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const tType = (p.threat_type || 'MALWARE').toUpperCase();
      const statusColor = p.status === 'online' ? '#39FF14' : '#FF1744';
      
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,23,68,0.4);box-shadow:inset 0 0 12px rgba(255,23,68,0.1);">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,23,68,0.3);padding-bottom:6px;margin-bottom:8px;">
          <div style="color:#FF1744;font-size:12px;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 4px rgba(255,23,68,0.5);">[ ${tType} ]</div>
          <div style="color:#6F8092;font-size:9px;">${p.country || 'UNKNOWN'}</div>
        </div>
        <div style="color:#1E293B;font-size:11px;font-weight:bold;margin-bottom:10px;">${p.malware || 'Unidentified Threat Payload'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:12px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">TARGET IP</span><br/><span style="color:#1A73E8;font-family:monospace;">${p.ip}</span></div>
          <div><span style="color:#6F8092;">STATUS</span><br/><span style="color:${statusColor};">${(p.status||'UNKNOWN').toUpperCase()}</span></div>
        </div>
        <div style="display:flex;gap:6px;">
          <a href="https://feodotracker.abuse.ch/browse/" target="_blank" style="${linkStyle}flex:1;text-align:center;color:#1E293B;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);">THREAT INTEL ↗</a>
        </div>
        <button onclick="window.openOsirisIntel({ type: 'ip', ip: '${p.ip}', threat_type: '${p.malware || p.threat_type || ''}', status: '${p.status || ''}' })" style="width:100%;margin-top:8px;padding:8px 12px;background:linear-gradient(90deg, rgba(255,23,68,0.1) 0%, rgba(255,23,68,0.2) 100%);border:1px solid rgba(255,23,68,0.6);color:#FF1744;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;border-radius:4px;cursor:pointer;transition:all 0.2s;">DEEP DIVE ANALYTICS</button>
      </div>`);
    });

    // ── Threat Intel (Blocklist.de, SSL Blacklist, PhishTank) ──
    map.on('click', 'threat-intel-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const tType = (p.threat_type || 'THREAT').toUpperCase();
      const dotColor = tType.includes('BLOCKLIST') ? '#FF6D00' : tType.includes('SSL') ? '#FF1744' : '#AA00FF';
      popup(coords, `<div style="${pStyle}border:1px solid ${dotColor}40;box-shadow:inset 0 0 12px ${dotColor}15;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${dotColor}40;padding-bottom:6px;margin-bottom:8px;">
          <div style="color:${dotColor};font-size:12px;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 4px ${dotColor}50;">[ ${tType} ]</div>
          <div style="color:#6F8092;font-size:9px;">${p.country || 'UNKNOWN'}</div>
        </div>
        <div style="color:#1E293B;font-size:11px;font-weight:bold;margin-bottom:10px;">${p.malware || 'Threat'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:12px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">IP</span><br/><span style="color:#1A73E8;font-family:monospace;">${p.ip}</span></div>
          <div><span style="color:#6F8092;">STATUS</span><br/><span style="color:#39FF14;">ACTIVE</span></div>
        </div>
        ${p.url ? `<div style="font-size:9px;margin-bottom:8px;word-break:break-all;"><span style="color:#6F8092;">URL</span><br/><span style="color:#1E293B;">${p.url}</span></div>` : ''}
        <button onclick="window.openOsirisIntel({ type: 'ip', ip: '${p.ip}', threat_type: '${p.threat_type || ''}', status: 'active' })" style="width:100%;margin-top:8px;padding:8px 12px;background:linear-gradient(90deg, ${dotColor}15 0%, ${dotColor}25 100%);border:1px solid ${dotColor}80;color:${dotColor};font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;border-radius:4px;cursor:pointer;transition:all 0.2s;">DEEP DIVE ANALYTICS</button>
      </div>`);
    });

    // ── Cyber Intel — Spamhaus DROP (Routing Intelligence) ──
    map.on('click', 'drop-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid #FF910040;box-shadow:inset 0 0 12px #FF910015;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #FF910040;padding-bottom:6px;margin-bottom:8px;">
          <div style="color:#FF9100;font-size:12px;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 4px #FF910050;">[ SPAMHAUS DROP ]</div>
          <div style="color:#6F8092;font-size:9px;">${p.country || 'UNKNOWN'}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:12px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">CIDR</span><br/><span style="color:#1A73E8;font-family:monospace;">${p.cidr}</span></div>
          <div><span style="color:#6F8092;">SAMPLE IP</span><br/><span style="color:#39FF14;font-family:monospace;">${p.ip}</span></div>
        </div>
        <div style="font-size:9px;color:#6F8092;">Hostile network block tracked by Spamhaus DROP project</div>
        <button onclick="window.openOsirisIntel({ type: 'ip', ip: '${p.ip}', threat_type: 'bgp_route', status: 'blocked' })" style="width:100%;margin-top:8px;padding:8px 12px;background:linear-gradient(90deg,#FF910015 0%,#FF910025 100%);border:1px solid #FF910080;color:#FF9100;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;border-radius:4px;cursor:pointer;transition:all 0.2s;">DEEP DIVE ANALYTICS</button>
      </div>`);
    });

    // ── Cyber Intel — Tor Exit Nodes ──
    map.on('click', 'tor-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid #6D28D940;box-shadow:inset 0 0 12px #6D28D915;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #6D28D940;padding-bottom:6px;margin-bottom:8px;">
          <div style="color:#6D28D9;font-size:12px;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 4px #6D28D950;">[ TOR EXIT NODE ]</div>
          <div style="color:#6F8092;font-size:9px;">${p.country || 'UNKNOWN'}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:12px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">IP</span><br/><span style="color:#1A73E8;font-family:monospace;">${p.ip}</span></div>
          <div><span style="color:#6F8092;">NETWORK</span><br/><span style="color:#39FF14;font-family:monospace;">TOR</span></div>
        </div>
        <div style="font-size:9px;color:#6F8092;">This IP is a known Tor exit relay — traffic originates from the Tor anonymity network</div>
        <button onclick="window.openOsirisIntel({ type: 'ip', ip: '${p.ip}', threat_type: 'tor_exit', status: 'active' })" style="width:100%;margin-top:8px;padding:8px 12px;background:linear-gradient(90deg,#6D28D915 0%,#6D28D925 100%);border:1px solid #6D28D980;color:#6D28D9;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;border-radius:4px;cursor:pointer;transition:all 0.2s;">DEEP DIVE ANALYTICS</button>
      </div>`);
    });

    // ── Cyber Intel — Active CVE Threats ──
    map.on('click', 'cve-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const cveColor = p.cvss >= 9 ? '#FF1744' : p.cvss >= 7 ? '#FF6D00' : p.cvss >= 4 ? '#FF9100' : '#1A73E8';
      popup(coords, `<div style="${pStyle}border:1px solid ${cveColor}40;box-shadow:inset 0 0 12px ${cveColor}15;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${cveColor}40;padding-bottom:6px;margin-bottom:8px;">
          <div style="color:${cveColor};font-size:12px;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 4px ${cveColor}50;">[ ${p.title} ]</div>
          <div style="color:#6F8092;font-size:9px;">CVSS ${p.cvss}</div>
        </div>
        <div style="font-size:10px;color:#1E293B;margin-bottom:10px;line-height:1.4;">${p.summary || 'No description available'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:12px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">SEVERITY</span><br/><span style="color:${cveColor};font-weight:bold;">${p.severity}</span></div>
          <div><span style="color:#6F8092;">VENDORS</span><br/><span style="color:#39FF14;">${p.vendors || 'N/A'}</span></div>
        </div>
        <button onclick="window.openOsirisIntel({ type: 'cve', id: '${p.title}', cvss: ${p.cvss}, severity: '${p.severity}' })" style="width:100%;margin-top:8px;padding:8px 12px;background:linear-gradient(90deg,${cveColor}15 0%,${cveColor}25 100%);border:1px solid ${cveColor}80;color:${cveColor};font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;border-radius:4px;cursor:pointer;transition:all 0.2s;">DEEP DIVE ANALYTICS</button>
      </div>`);
    });

    // ── Cyber Intel — MITRE ATT&CK (APT Groups) ──
    map.on('click', 'mitre-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const techIds = p.techniques?.length ? p.techniques.split(',') : [];
      const techNames = p.technique_names?.length ? p.technique_names.split('|') : [];
      const techDescs = p.technique_descriptions?.length ? p.technique_descriptions.split('|') : [];
      const techRows = techIds.map((id: string, i: number) => {
        const name = techNames[i] || id;
        const desc = techDescs[i] || '';
        return `<div style="background:rgba(0,230,118,0.06);border-left:2px solid #00E67660;padding:4px 6px;margin-bottom:4px;border-radius:0 3px 3px 0;">
          <div style="display:flex;gap:6px;align-items:baseline;">
            <span style="color:#1A73E8;font-family:monospace;font-size:8px;font-weight:700;">${id}</span>
            <span style="color:#1E293B;font-size:9px;font-weight:600;">${name}</span>
          </div>
          ${desc ? `<div style="color:#8A8A84;font-size:8px;margin-top:2px;line-height:1.4;">${desc}</div>` : ''}
        </div>`;
      }).join('');
      popup(coords, `<div style="${pStyle}border:1px solid #00E67640;box-shadow:inset 0 0 12px #00E67615;max-width:280px;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #00E67640;padding-bottom:6px;margin-bottom:8px;">
          <div style="color:#00E676;font-size:12px;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 4px #00E67650;">[ ${p.name} ]</div>
          <div style="color:#6F8092;font-size:9px;">${p.country || 'UNKNOWN'}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:10px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">GROUP ID</span><br/><span style="color:#1A73E8;font-family:monospace;">${p.group_id}</span></div>
          <div><span style="color:#6F8092;">COUNTRY</span><br/><span style="color:#39FF14;">${p.country}</span></div>
        </div>
        <div style="font-size:8px;color:#6F8092;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px;">TECHNIQUES (${techIds.length})</div>
        ${techRows}
        <div style="border-top:1px solid #00E67620;margin-top:8px;padding-top:6px;">
          <button onclick="window.openOsirisIntel({ type: 'apt', group: '${p.name}', group_id: '${p.group_id}', country: '${p.country}', techniques: '${p.techniques || ''}' })" style="width:100%;padding:7px 12px;background:linear-gradient(90deg,#00E67615 0%,#00E67625 100%);border:1px solid #00E67680;color:#00E676;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;border-radius:4px;cursor:pointer;">DEEP DIVE ANALYTICS</button>
        </div>
      </div>`);
    });

    // ── GDELT Conflicts (with source article) ──
    map.on('click', 'gdelt-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      
      // Map coordinates to Liveuamap regions
      let sourceUrl = p.url || '';
      if (!sourceUrl || sourceUrl.includes('google.com')) {
        const [lng, lat] = coords;
        if (lat > 44 && lat < 53 && lng > 22 && lng < 40) sourceUrl = 'https://liveuamap.com/'; // Ukraine
        else if (lat > 30 && lat < 33 && lng > 34 && lng < 36) sourceUrl = 'https://israelpalestine.liveuamap.com/'; // Gaza
        else if (lat > 33 && lat < 34.5 && lng > 35 && lng < 36.5) sourceUrl = 'https://lebanon.liveuamap.com/'; // Lebanon
        else if (lat > 32 && lat < 37 && lng > 35 && lng < 42) sourceUrl = 'https://syria.liveuamap.com/'; // Syria
        else if (lat > 10 && lat < 22 && lng > 22 && lng < 38) sourceUrl = 'https://sudan.liveuamap.com/'; // Sudan
        else if (lat > 12 && lat < 20 && lng > 42 && lng < 55) sourceUrl = 'https://yemen.liveuamap.com/'; // Yemen
        else sourceUrl = 'https://liveuamap.com/'; // Global fallback
      }

      const catLabel = (p.category || (p.type ? String(p.type).toUpperCase() : 'INCIDENT'));
      const isLiveua = sourceUrl.includes('liveuamap.com');
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,61,61,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="color:#FF3D3D;font-size:12px;font-weight:700;">⚠️ ${catLabel}</div>
          ${p.source ? `<div style="color:#6F8092;font-size:8px;letter-spacing:0.1em;">${p.source}</div>` : ''}
        </div>
        <div style="font-size:9px;color:#1E293B;margin-bottom:8px;line-height:1.4;">${p.name||'Unclassified incident'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:6px;">
          ${p.source === 'ACLED'
            ? `<div><span style="color:#6F8092;">FATALITIES</span><br/><span style="color:#FF1744;font-weight:700;">${p.fatalities ?? 0}</span></div>
               <div><span style="color:#6F8092;">DATE</span><br/><span style="color:#1E293B;">${p.date||'—'}</span></div>
               ${p.actors ? `<div style="grid-column:1/3;"><span style="color:#6F8092;">ACTORS</span><br/><span style="color:#FFB74D;">${p.actors}</span></div>` : ''}
               <div style="grid-column:1/3;"><span style="color:#6F8092;">LOCATION</span><br/><span style="color:#1E293B;">${p.country || ''} · ${coords[1].toFixed(2)}°, ${coords[0].toFixed(2)}°</span></div>`
            : `<div><span style="color:#6F8092;">REPORTS</span><br/><span style="color:#FF8A80;">${p.count||1}</span></div>
               <div><span style="color:#6F8092;">COORDS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(2)}°, ${coords[0].toFixed(2)}°</span></div>`}
        </div>
        <a href="${sourceUrl}" target="_blank" style="${linkStyle}flex:1;text-align:center;color:#FF3D3D;border:1px solid rgba(255,61,61,0.4);background:rgba(255,61,61,0.15);display:inline-block;width:100%;box-sizing:border-box;margin-top:4px;">[ ${p.source === 'ACLED' ? 'ACLED RECORD' : isLiveua ? 'LIVEUAMAP' : 'OPEN SOURCE'} ↗ ]</a>
      </div>`);
    });

    // ── Global Event / Conflict Markers ──
    map.on('click', 'conflict-icons', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.severity === 'war' ? '#FF1744' : p.severity === 'high' ? '#FF9500' : '#FFD500';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}40;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:6px;">⚠️ ${p.label || 'WARNING EVENT'}</div>
        <div style="font-size:10px;color:#1E293B;margin-bottom:8px;line-height:1.4;">${p.description || 'Global event detected at this location.'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#6F8092;">SEVERITY</span><br/><span style="color:${color};">${(p.severity||'unknown').toUpperCase()}</span></div>
          <div><span style="color:#6F8092;">COORDS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
        ${p.sourceUrl ? `<a href="${p.sourceUrl}" target="_blank" style="${linkStyle}flex:1;text-align:center;color:${color};border:1px solid ${color}40;background:${color}15;display:inline-block;width:100%;box-sizing:border-box;margin-top:4px;">[ OPEN SOURCE ↗ ]</a>` : ''}
      </div>`);
    });


    // ── Generic hover for clickables ──
    ['conflict-icons','cctv-dots','eq-circles','sat-dots','sat-label','fires-heat','gdelt-dots','weather-dots','infra-dots','maritime-dots','choke-dots','news-dots','sigint-news-dots','balloon-dots','rad-dots','ship-dots','sweep-device-dots','scan-targets-dots','malware-dots','ransomware-dots','eurepoc-dots','power-plants-dots','cables-line','cable-landing-points-dots'].forEach(layer => {
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    });

    // ── Scan Targets click ──
    map.on('click', 'scan-targets-dots', (e: any) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = e.features[0].geometry.coordinates.slice();
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,61,61,0.5);">
        <div style="color:#FF3D3D;font-size:12px;font-weight:700;margin-bottom:6px;">🎯 TARGET: ${p.id}</div>
        <div style="font-size:9px;color:#1E293B;margin-bottom:8px;">${p.city || 'Unknown'}, ${p.country || 'Unknown'} — ${p.isp || 'Unknown ISP'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;">
          <div><span style="color:#6F8092;">TYPE</span><br/><span style="color:#1A73E8;">${(p.type || 'UNKNOWN').toUpperCase()}</span></div>
          <div><span style="color:#6F8092;">COORDS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
        <button onclick="window.openOsirisIntel({ type: 'ip', ip: '${p.id}' })" style="width:100%;margin-top:8px;padding:6px 12px;background:rgba(255,109,0,0.15);border:1px solid rgba(255,109,0,0.5);color:#FF6D00;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.1em;border-radius:4px;cursor:pointer;">[ IP INTEL DEEP DIVE ]</button>
      </div>`);
    });

    // ── SCM Suppliers ──
    map.on('click', 'scm-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.risk_level === 'CRITICAL' ? '#FF1744' : p.risk_level === 'HIGH' ? '#FF9500' : '#00BCD4';
      const activeThreats = p.active_threats ? JSON.parse(p.active_threats) : [];
      
      let threatsHtml = '';
      if (activeThreats.length > 0) {
        threatsHtml = `<div style="margin-top:8px;padding-top:6px;border-top:1px solid ${color}40;color:${color};font-size:9px;font-weight:bold;">
          ACTIVE THREATS:<br/>${activeThreats.map((t: string) => `⚠ ${t}`).join('<br/>')}
        </div>`;
      }

      popup(coords, `<div style="${pStyle}border:1px solid ${color}40;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:4px;">🏢 ${p.name}</div>
        <div style="font-size:9px;color:#5F6368;margin-bottom:8px;">${p.category} | ${p.city}, ${p.country}</div>
        <div style="display:grid;grid-template-columns:1fr;gap:4px;font-size:11px;">
          <div><span style="color:#6F8092;font-size:9px;">SCM RISK LEVEL</span><br/><span style="color:${color};font-weight:bold;">${p.risk_level}</span></div>
        </div>
        ${threatsHtml}
      </div>`);
    });

    // ── IP Sweep device click ──
    map.on('click', 'sweep-device-dots', (e: any) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = e.features[0].geometry.coordinates.slice();
      const ports = JSON.parse(p.ports || '[]');
      const vulns = JSON.parse(p.vulns || '[]');
      const hostnames = JSON.parse(p.hostnames || '[]');
      const riskColors: Record<string, string> = { CRITICAL: '#FF3D3D', HIGH: '#FF6B00', MEDIUM: '#FFD700', LOW: '#76FF03', INFO: '#6F8092' };
      popup(coords, `<div style="font-family:monospace;font-size:11px;color:#1E293B;">
        <div style="font-size:13px;font-weight:bold;margin-bottom:6px;color:${p.color};">${p.device_type}</div>
        <div style="font-size:12px;margin-bottom:8px;color:#202124;">${p.ip}</div>
        ${hostnames.length > 0 ? `<div style="font-size:9px;color:#8A8880;margin-bottom:6px;">${hostnames.join(', ')}</div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
          <div><span style="color:#6F8092;">PORTS</span><br/><span style="color:#1E293B;">${ports.length}</span></div>
          <div><span style="color:#6F8092;">RISK</span><br/><span style="color:${riskColors[p.risk_level] || '#666'};">${p.risk_level}</span></div>
        </div>
        <div style="font-size:9px;color:#8A8880;margin-bottom:6px;">Open: ${ports.slice(0, 12).join(', ')}${ports.length > 12 ? ' ...' : ''}</div>
        ${vulns.length > 0 ? `<div style="font-size:9px;color:#FF3D3D;margin-bottom:6px;">⚠ CVEs: ${vulns.slice(0, 5).join(', ')}${vulns.length > 5 ? ` +${vulns.length - 5} more` : ''}</div>` : ''}
        <button onclick="window.openOsirisIntel({ type: 'ip', ip: '${p.ip}' })" style="width:100%;margin-top:6px;padding:6px 12px;background:rgba(255,109,0,0.15);border:1px solid rgba(255,109,0,0.5);color:#FF6D00;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.1em;border-radius:4px;cursor:pointer;">[ IP INTEL DEEP DIVE ]</button>
      </div>`);
    });

    // ── Balloons / Sondes ──
    map.on('click', 'balloon-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid ${p.color}40;">
        <div style="color:${p.color};font-size:12px;font-weight:700;letter-spacing:0.1em;margin-bottom:4px;">🎈 ${p.callsign}</div>
        <div style="font-size:9px;color:#5F6368;margin-bottom:8px;">${p.type.toUpperCase()} / STATUS: ${p.status.toUpperCase()}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;">
          <div><span style="color:#6F8092;">ALTITUDE</span><br/><span style="color:#1E293B;">${p.altitude} m</span></div>
          <div><span style="color:#6F8092;">SPEED</span><br/><span style="color:#1E293B;">${Math.round(p.speed)} km/h</span></div>
          <div><span style="color:#6F8092;">VERT RATE</span><br/><span style="color:${p.verticalRate > 0 ? '#00E676' : '#FF3D3D'};">${p.verticalRate.toFixed(1)} m/s</span></div>
          <div><span style="color:#6F8092;">TEMP</span><br/><span style="color:#1E293B;">${p.temperature}°C</span></div>
        </div>
      </div>`);
    });

    // ── Radiation ──
    map.on('click', 'rad-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.status === 'DANGER' ? '#FF1744' : p.status === 'WARNING' ? '#FF9500' : '#AB47BC';
      popup(coords, `<div style="${pStyle}border:1px solid ${color}40;">
        <div style="color:${color};font-size:12px;font-weight:700;margin-bottom:4px;">☢️ ${p.name}</div>
        <div style="font-size:9px;color:#5F6368;margin-bottom:8px;">${p.city}, ${p.country}</div>
        <div style="display:grid;grid-template-columns:1fr;gap:4px;font-size:11px;">
          <div><span style="color:#6F8092;font-size:9px;">READING</span><br/><span style="color:${color};font-weight:bold;">${p.reading} nSv/h</span></div>
          <div><span style="color:#6F8092;font-size:9px;">STATUS</span><br/><span style="color:${color};">${p.status}</span></div>
          <div><span style="color:#6F8092;font-size:9px;">NETWORK</span><br/><span style="color:#1E293B;">${p.network}</span></div>
        </div>
      </div>`);
    });

    // ── Maritime Ships ──
    map.on('click', 'ship-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const color = p.type === 'military' ? '#FF1744' : p.type === 'tanker' ? '#FF9500' : '#1A73E8';
      const icon = p.type === 'military' ? '⚔️' : p.type === 'tanker' ? '🛢️' : '🚢';
      
      popup(coords, `<div style="${pStyle}border:1px solid ${color}60;box-shadow:inset 0 0 12px ${color}15;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${color}40;padding-bottom:6px;margin-bottom:8px;">
          <div style="color:${color};font-size:12px;font-weight:700;letter-spacing:0.1em;">${icon} [ ${(p.type||'VESSEL').toUpperCase()} ]</div>
          <div style="color:#6F8092;font-size:9px;">FLAG: ${p.flag||'UNK'}</div>
        </div>
        <div style="color:#1E293B;font-size:11px;font-weight:bold;margin-bottom:10px;">${p.name || 'UNIDENTIFIED VESSEL'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:8px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">SPEED</span><br/><span style="color:${color};font-family:monospace;">${Number(p.speed).toFixed(1)} kn</span></div>
          <div><span style="color:#6F8092;">HEADING</span><br/><span style="color:${color};font-family:monospace;">${Number(p.heading).toFixed(0)}°</span></div>
          <div><span style="color:#6F8092;">LATITUDE</span><br/><span style="color:#1E293B;font-family:monospace;">${coords[1].toFixed(4)}°</span></div>
          <div><span style="color:#6F8092;">LONGITUDE</span><br/><span style="color:#1E293B;font-family:monospace;">${coords[0].toFixed(4)}°</span></div>
        </div>
        <div><span style="color:#6F8092;font-size:9px;">DESTINATION: </span><span style="color:#1E293B;font-size:9px;">${p.destination || 'UNKNOWN'}</span></div>
        <a href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${p.mmsi}" target="_blank" style="${linkStyle}flex:1;text-align:center;color:${color};border:1px solid ${color}40;background:${color}15;display:inline-block;width:100%;box-sizing:border-box;margin-top:4px;">[ OPEN SOURCE ↗ ]</a>
      </div>`);
    });

    // ── Weather Events (NASA EONET) ──
    map.on('click', 'weather-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const iconEmoji = p.icon === 'cyclone' ? '🌀' : p.icon === 'volcano' ? '🌋' : p.icon === 'flood' ? '🌊' : p.icon === 'drought' ? '🏜️' : p.icon === 'tsunami' ? '🌊' : '⚡';
      const sevColor = p.severity === 'high' ? '#FF1744' : p.severity === 'medium' ? '#FF9500' : '#FFD700';
      popup(coords, `<div style="${pStyle}border:1px solid rgba(224,64,251,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="color:#C026D3;font-size:14px;font-weight:700;">${iconEmoji} ${p.type || 'Weather Event'}</div>
          ${p.provider ? `<div style="color:#6F8092;font-size:8px;letter-spacing:0.1em;">${p.provider}</div>` : ''}
        </div>
        <div style="font-size:10px;color:#1E293B;margin-bottom:8px;line-height:1.4;">${p.title || 'Unknown event'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#6F8092;">SEVERITY</span><br/><span style="color:${sevColor};">${(p.severity||'low').toUpperCase()}</span></div>
          ${p.area ? `<div><span style="color:#6F8092;">AREA</span><br/><span style="color:#1E293B;">${p.area}</span></div>` : `<div><span style="color:#6F8092;">COORDS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(2)}°, ${coords[0].toFixed(2)}°</span></div>`}
        </div>
        ${p.source ? `<a href="${p.source}" target="_blank" style="${linkStyle}color:#C026D3;border:1px solid rgba(224,64,251,0.4);background:rgba(224,64,251,0.1);display:inline-block;width:100%;box-sizing:border-box;text-align:center;">📡 ${p.provider || 'SOURCE'} ↗</a>` : ''}
      </div>`);
    });

    // ── Nuclear Infrastructure ──
    map.on('click', 'infra-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const statusColor = p.status.includes('SEISMIC RISK') ? '#FF9500' : p.status === 'Active Conflict Zone' ? '#FF1744' : p.status === 'Operational' ? '#76FF03' : '#757575';
      popup(coords, `<div style="${pStyle}border:1px solid rgba(118,255,3,0.3);">
        <div style="color:#76FF03;font-size:14px;font-weight:700;margin-bottom:4px;">☢️ ${p.name || 'Nuclear Facility'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#6F8092;">STATUS</span><br/><span style="color:${statusColor};">${p.status || '—'}</span></div>
          <div><span style="color:#6F8092;">CITY</span><br/><span style="color:#1E293B;">${p.city || '—'}, ${p.country || ''}</span></div>
          <div><span style="color:#6F8092;">REACTORS</span><br/><span style="color:#76FF03;">${p.reactors || '—'}</span></div>
          <div><span style="color:#6F8092;">CAPACITY</span><br/><span style="color:#1E293B;">${p.capacityMW ? p.capacityMW.toLocaleString() + ' MW' : '—'}</span></div>
          <div><span style="color:#6F8092;">OWNER</span><br/><span style="color:#1E293B;">${p.owner || '—'}</span></div>
          <div><span style="color:#6F8092;">COORDS</span><br/><span style="color:#1E293B;">${coords[1].toFixed(3)}°, ${coords[0].toFixed(3)}°</span></div>
        </div>
        <a href="https://www.google.com/maps/@${coords[1]},${coords[0]},14z/data=!3m1!1e3" target="_blank" style="${linkStyle}color:#76FF03;border:1px solid rgba(118,255,3,0.4);background:rgba(118,255,3,0.1);">SATELLITE VIEW</a>
      </div>`);
    });

    // ── Maritime Ports & Naval Bases ──
    map.on('click', 'maritime-dots', e => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = (e.features![0].geometry as any).coordinates;
      const typeColor = p.type === 'naval' ? '#FF3D3D' : p.type === 'energy' ? '#FF9500' : '#00BCD4';
      const typeLabel = p.type === 'naval' ? 'NAVAL BASE' : p.type === 'energy' ? 'ENERGY PORT' : 'CONTAINER PORT';
      
      const congestionHtml = p.congestion ? `
        <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
            <div><span style="color:#6F8092;font-size:9px;">CONGESTION</span><br/><span style="color:${p.congestion === 'SEVERE' ? '#FF1744' : p.congestion === 'CONGESTED' ? '#FF9500' : '#00E676'};font-weight:bold;font-size:10px;">${p.congestion}</span></div>
            <div><span style="color:#6F8092;font-size:9px;">EST. DWELL TIME</span><br/><span style="color:#1E293B;font-weight:bold;font-size:10px;">${p.dwell_time || 'Unknown'}</span></div>
          </div>
        </div>` : '';

      popup(coords, `<div style="${pStyle}border:1px solid ${typeColor}40;">
        <div style="color:${typeColor};font-weight:bold;font-size:11px;margin-bottom:4px;">${p.name}</div>
        <div style="color:#5F6368;font-size:9px;margin-bottom:6px;">${typeLabel} — ${p.country}</div>
        ${p.volume ? `<div style="font-size:9px;color:#5F6368;">Volume: <span style="color:${typeColor};font-weight:bold;">${p.volume}</span></div>` : ''}
        ${p.fleet ? `<div style="font-size:9px;color:#5F6368;">Fleet: <span style="color:${typeColor};font-weight:bold;">${p.fleet}</span></div>` : ''}
        ${p.rank ? `<div style="font-size:9px;color:#5F6368;">Global Rank: <span style="color:${typeColor};font-weight:bold;">#${p.rank}</span></div>` : ''}
        ${congestionHtml}
      </div>`);
    });

    // ── Maritime Chokepoints ──
    map.on('click', 'choke-dots', e => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const coords = (e.features![0].geometry as any).coordinates;
      const riskCol = p.risk === 'CRITICAL' ? '#FF1744' : p.risk === 'HIGH' ? '#FF9500' : p.risk === 'ELEVATED' ? '#FFD700' : '#00E676';
      popup(coords, `<div style="${pStyle}border:1px solid ${riskCol}40;">
        <div style="color:#FF9500;font-weight:bold;font-size:11px;margin-bottom:4px;">${p.name}</div>
        <div style="font-size:9px;color:#5F6368;">Traffic: <span style="color:#202124;">${p.traffic}</span></div>
        <div style="font-size:9px;color:#5F6368;">Risk: <span style="color:${riskCol};font-weight:bold;">${p.risk}</span></div>
      </div>`);
    });

    // ── Live News (opens feed viewer) ──
    map.on('click', 'news-dots', e => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      onEntityClick?.({
        type: 'live_news',
        name: p.name,
        city: p.city,
        country: p.country,
        url: p.url,
        category: p.category,
        embed_allowed: p.embed_allowed !== false && p.embed_allowed !== 'false',
      });
    });

    // ── Ransomware Victims (Ransomware.live) ──
    map.on('click', 'ransomware-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,23,68,0.4);box-shadow:inset 0 0 12px rgba(255,23,68,0.1);">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,23,68,0.3);padding-bottom:6px;margin-bottom:8px;">
          <div style="color:#FF1744;font-size:12px;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 4px rgba(255,23,68,0.5);">[ RANSOMWARE ]</div>
          <div style="color:#6F8092;font-size:9px;">${p.country || p.country_code || 'UNKNOWN'}</div>
        </div>
        <div style="color:#1E293B;font-size:11px;font-weight:bold;margin-bottom:10px;">${p.post_title || 'Ransomware Incident'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:12px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">GROUP</span><br/><span style="color:#1A73E8;font-weight:bold;">${p.group_name || '—'}</span></div>
          <div><span style="color:#6F8092;">SECTOR</span><br/><span style="color:#1E293B;">${p.activity || '—'}</span></div>
          <div><span style="color:#6F8092;">DISCOVERED</span><br/><span style="color:#1E293B;">${p.discovered || '—'}</span></div>
          <div><span style="color:#6F8092;">PUBLISHED</span><br/><span style="color:#1E293B;">${p.published || '—'}</span></div>
        </div>
        ${p.revenue ? `<div style="font-size:9px;color:#6F8092;margin-bottom:4px;">Revenue: <span style="color:#1A73E8;">$${Number(p.revenue).toLocaleString()}</span></div>` : ''}
        ${p.employees ? `<div style="font-size:9px;color:#6F8092;margin-bottom:4px;">Employees: <span style="color:#1E293B;">${Number(p.employees).toLocaleString()}</span></div>` : ''}
        ${p.website ? `<a href="${p.website}" target="_blank" style="${linkStyle}color:#FF1744;border:1px solid rgba(255,23,68,0.4);background:rgba(255,23,68,0.1);">LEAK SITE ↗</a>` : ''}
        <button onclick="window.openOsirisIntel({ type: 'ip', ip: '${p.group_name || ''}', threat_type: 'ransomware', status: 'active' })" style="width:100%;margin-top:8px;padding:8px 12px;background:linear-gradient(90deg, rgba(255,23,68,0.1) 0%, rgba(255,23,68,0.2) 100%);border:1px solid rgba(255,23,68,0.6);color:#FF1744;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:bold;letter-spacing:0.15em;border-radius:4px;cursor:pointer;transition:all 0.2s;">DEEP DIVE ANALYTICS</button>
      </div>`);
    });

    // ── EuRepoC Cyber Incidents (local dataset) ──
    map.on('click', 'eurepoc-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      popup(coords, `<div style="${pStyle}border:1px solid rgba(194,24,91,0.4);box-shadow:inset 0 0 12px rgba(194,24,91,0.1);">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(194,24,91,0.3);padding-bottom:6px;margin-bottom:8px;">
          <div style="color:#C2185B;font-size:12px;font-weight:700;letter-spacing:0.1em;text-shadow:0 0 4px rgba(194,24,91,0.5);">[ CYBER INCIDENT ]</div>
          <div style="color:#6F8092;font-size:9px;">${p.year || '—'}</div>
        </div>
        <div style="color:#1E293B;font-size:11px;font-weight:bold;margin-bottom:10px;">${p.name || 'Cyber Incident'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:12px;background:rgba(60,64,67,0.06);padding:6px;border-radius:4px;">
          <div><span style="color:#6F8092;">TYPE</span><br/><span style="color:#1E293B;">${p.incident_type || '—'}</span></div>
          <div><span style="color:#6F8092;">START</span><br/><span style="color:#1E293B;">${p.start_date || '—'}</span></div>
          <div><span style="color:#6F8092;">TARGET</span><br/><span style="color:#1A73E8;font-weight:bold;">${p.receiver_country || '—'}</span></div>
          <div><span style="color:#6F8092;">SECTOR</span><br/><span style="color:#1E293B;">${p.receiver_category || '—'}</span></div>
          <div><span style="color:#6F8092;">INITIATOR</span><br/><span style="color:#1E293B;">${p.initiator_country || 'Unattributed'}</span></div>
          <div><span style="color:#6F8092;">ACTOR TYPE</span><br/><span style="color:#1E293B;">${p.initiator_category || '—'}</span></div>
        </div>
        <div style="font-size:9px;color:#6F8092;">Source: EuRepoC global dataset (local)</div>
      </div>`);
    });

    // ── Power Plants (WRI Global Database) ──
    map.on('click', 'power-plants-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const fuelColor = p.fuel_type === 'Solar' ? '#F9A825' : p.fuel_type === 'Wind' ? '#4FC3F7' : p.fuel_type === 'Hydro' ? '#1565C0' : p.fuel_type === 'Nuclear' ? '#D32F2F' : p.fuel_type === 'Coal' ? '#424242' : '#26A69A';
      popup(coords, `<div style="${pStyle}border:1px solid ${fuelColor}40;">
        <div style="color:${fuelColor};font-size:13px;font-weight:700;margin-bottom:4px;">⚡ ${p.name || 'Power Plant'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#6F8092;">FUEL TYPE</span><br/><span style="color:${fuelColor};font-weight:bold;">${p.fuel_type || '—'}</span></div>
          <div><span style="color:#6F8092;">CAPACITY</span><br/><span style="color:#1E293B;">${p.capacity_mw ? Number(p.capacity_mw).toLocaleString() + ' MW' : '—'}</span></div>
          <div><span style="color:#6F8092;">COUNTRY</span><br/><span style="color:#1E293B;">${p.country_long || p.country || '—'}</span></div>
          <div><span style="color:#6F8092;">YEAR</span><br/><span style="color:#1E293B;">${p.commissioning_year || '—'}</span></div>
        </div>
        ${p.owner ? `<div style="font-size:9px;color:#6F8092;">Owner: <span style="color:#1E293B;">${p.owner}</span></div>` : ''}
        <a href="https://www.google.com/maps/@${coords[1]},${coords[0]},14z" target="_blank" style="${linkStyle}color:${fuelColor};border:1px solid ${fuelColor}40;background:${fuelColor}10;">SATELLITE VIEW</a>
      </div>`);
    });

    // ── Submarine Cables ──
    // Hide cable highlight on any map click
    map.on('click', () => {
      if (map.getLayer('cable-highlight')) {
        map.setLayoutProperty('cable-highlight', 'visibility', 'none');
      }
    });

    map.on('click', 'cables-line', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = e.lngLat;
      const cableColor = p.color || '#FF6D00';
      const cableUrl = p.id ? `https://www.submarinecablemap.com/cable/${p.id}` : 'https://www.submarinecablemap.com/';

      // Set cable highlight
      if (map.getLayer('cable-highlight') && p.feature_id) {
        map.setFilter('cable-highlight', ['==', ['get', 'feature_id'], p.feature_id]);
        map.setLayoutProperty('cable-highlight', 'visibility', 'visible');
      }

      const length = p.length || '—';
      const rfsYear = p.rfs_year || '—';
      const owners = p.owners || '—';
      const landingPts = p.landing_points
        ? `${Array.isArray(p.landing_points) ? p.landing_points.length : 0} landing points`
        : '—';

      popup([coords.lng, coords.lat], `<div style="${pStyle}border:1px solid ${cableColor}40;">
        <div style="color:${cableColor};font-size:13px;font-weight:700;margin-bottom:4px;">🔌 ${p.name || 'Submarine Cable'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:9px;margin-bottom:8px;">
          <div><span style="color:#6F8092;">LENGTH</span><br/><span style="color:#1E293B;">${length}</span></div>
          <div><span style="color:#6F8092;">RFS YEAR</span><br/><span style="color:#1E293B;">${rfsYear}</span></div>
          <div><span style="color:#6F8092;">OWNERS</span><br/><span style="color:#1E293B;">${owners}</span></div>
          <div><span style="color:#6F8092;">LANDING PTS</span><br/><span style="color:#1E293B;">${landingPts}</span></div>
        </div>
        <a href="${cableUrl}" target="_blank" rel="noopener noreferrer" style="${linkStyle}color:${cableColor};border:1px solid ${cableColor}40;background:${cableColor}15;">VIEW ON SUBMARINECABLEMAP ↗</a>
      </div>`);
    });

    map.on('click', 'cable-landing-points-dots', e => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as any;
      const coords = (e.features[0].geometry as any).coordinates;
      const lpUrl = p.id ? `https://www.submarinecablemap.com/landing-point/${p.id}` : 'https://www.submarinecablemap.com/';
      popup(coords, `<div style="${pStyle}border:1px solid rgba(255,109,0,0.4);">
        <div style="color:#FF6D00;font-size:12px;font-weight:700;margin-bottom:4px;">📍 ${p.name || 'Landing Point'}</div>
        <a href="${lpUrl}" target="_blank" rel="noopener noreferrer" style="${linkStyle}color:#FF6D00;border:1px solid rgba(255,109,0,0.4);background:rgba(255,109,0,0.1);">VIEW ON SUBMARINECABLEMAP ↗</a>
      </div>`);
    });

    (window as any).showFlightTrack = async (icao24: string, callsign: string) => {
      try {
        const res = await fetch(`/api/flights/tracks?icao24=${encodeURIComponent(icao24)}`, { cache: 'no-store' });
        const data = await res.json();
        if (data?.geojson) {
          const trackSrc = mapRef.current?.getSource('flight-track') as any;
          if (trackSrc) {
            trackSrc.setData(data.geojson);
            mapRef.current?.setLayoutProperty('flight-track-atmo', 'visibility', 'visible');
            mapRef.current?.setLayoutProperty('flight-track-glow', 'visibility', 'visible');
            mapRef.current?.setLayoutProperty('flight-track-core', 'visibility', 'visible');
            mapRef.current?.setLayoutProperty('flight-track-arrows', 'visibility', 'visible');
          }
          const coords = data.geojson?.geometry?.coordinates;
          if (coords?.length > 1) {
            const bounds = coords.reduce(
              (b: any, c: number[]) => b.extend([c[0], c[1]]),
              new maplibregl.LngLatBounds(coords[0], coords[0])
            );
            mapRef.current?.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 2000 });
          }
        }
      } catch (e) {
        console.warn('[TRACK] Failed to load flight track:', e);
      }
    };
    (window as any).hideFlightTrack = () => {
      mapRef.current?.setLayoutProperty('flight-track-atmo', 'visibility', 'none');
      mapRef.current?.setLayoutProperty('flight-track-glow', 'visibility', 'none');
      mapRef.current?.setLayoutProperty('flight-track-core', 'visibility', 'none');
      mapRef.current?.setLayoutProperty('flight-track-arrows', 'visibility', 'none');
      const src = mapRef.current?.getSource('flight-track') as any;
      if (src) src.setData(EMPTY_FC);
    };

    return () => {
      map.remove(); mapRef.current = null;
      delete (window as any).showFlightTrack;
      delete (window as any).hideFlightTrack;
    };
  }, []);

  // Day/Night
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const update = () => {
      const src = map.getSource('day-night') as any;
      if (!src) return;
      if (!activeLayers.day_night) { src.setData(EMPTY_FC); return; }
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [computeSolarTerminator()] }, properties: {} }] });
    };
    update();
    const iv = setInterval(update, 300000); // 5 min (was 1 min — shadow barely moves)
    return () => clearInterval(iv);
  }, [mapReady, activeLayers.day_night]);

  // Helper to set GeoJSON
  const setGeo = useCallback((source: string, features: any[]) => {
    const src = mapRef.current?.getSource(source) as any;
    if (src) src.setData({ type: 'FeatureCollection', features });
  }, []);

  const setVis = useCallback((ids: string[], visible: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    ids.forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none'); });
  }, []);

  // Temperature — two independent, smoothly-interpolated fields (ocean SST + land
  // 2m air temp), each rendered server-side to a coastline-clipped PNG and projected
  // as an image overlay. Separate Sea/Land toggles avoid blending the two across the
  // coastline (different physical quantities), so transitions are a clean clip.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    // World quad (TL, TR, BR, BL); fields span ±80° latitude.
    const WORLD_QUAD: [[number, number], [number, number], [number, number], [number, number]] =
      [[-180, 80], [180, 80], [180, -80], [-180, -80]];

    const ensureField = (layerId: string, sourceId: string, url: string, on: boolean) => {
      if (on && !map.getLayer(layerId)) {
        try {
          if (!map.getSource(sourceId)) map.addSource(sourceId, { type: 'image', url, coordinates: WORLD_QUAD });
          // Insert at the bottom of the data stack so all markers stay on top.
          const below = map.getLayer('conflict-icons') ? 'conflict-icons' : undefined;
          map.addLayer({ id: layerId, type: 'raster', source: sourceId, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.92, 'raster-fade-duration': 300 } }, below);
        } catch (e) { console.error(`[OSIRIS] ${layerId} init failed:`, e); }
      }
      setVis([layerId], on);
    };

    ensureField('temp-ocean-field', 'temp-ocean-src', '/api/temperature/field?domain=ocean&source=open-meteo', !!activeLayers.temperature_sea);
    ensureField('temp-ocean-oisst-field', 'temp-ocean-oisst-src', '/api/temperature/field?domain=ocean&source=noaa-oisst', !!activeLayers.temperature_sea_oisst);
    ensureField('temp-land-field', 'temp-land-src', '/api/temperature/field?domain=land&source=open-meteo', !!activeLayers.temperature_land);
  }, [mapReady, activeLayers.temperature_sea, activeLayers.temperature_sea_oisst, activeLayers.temperature_land, setVis]);

  // NDBC buoys — in-situ sea/air temperature station markers.
  useEffect(() => {
    if (!mapReady) return;
    const on = !!activeLayers.buoy_temps;
    const buoys = on && (data as any).buoys ? (data as any).buoys : [];
    setGeo('ndbc-buoys', buoys.map((b: any) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.lng, b.lat] },
      properties: { id: b.id, temp: b.temp, waterTemp: b.waterTemp, airTemp: b.airTemp, time: b.time },
    })));
    setVis(['buoy-glow', 'buoy-dots', 'buoy-label'], on);
  }, [mapReady, (data as any).buoys, activeLayers.buoy_temps, setGeo, setVis]);

  // Flight data → GeoJSON (GPU rendered)
  useEffect(() => {
    if (!mapReady) return;
    const toFeatures = (arr: any[], decimate: number = 1) => {
      let filtered = arr || [];
      if (decimate > 1) {
        filtered = filtered.filter((_, i) => i % decimate === 0);
      }
      return filtered.map((f: any) => ({
        type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [f.lng, f.lat] },
        properties: { callsign: f.callsign, heading: f.heading || 0, alt: f.alt, model: f.model, speed_knots: f.speed_knots, registration: f.registration, icao24: f.icao24 },
      }));
    };
    setGeo('flights', activeLayers.flights ? toFeatures(data.commercial_flights) : []);
    setGeo('private-fl', activeLayers.private ? toFeatures(data.private_flights, 2) : []);
    setGeo('jets', activeLayers.jets ? toFeatures(data.private_jets, 2) : []);
    setGeo('military', activeLayers.military ? toFeatures(data.military_flights) : []);
  }, [mapReady, data.commercial_flights, data.private_flights, data.private_jets, data.military_flights, activeLayers.flights, activeLayers.private, activeLayers.jets, activeLayers.military]);

    // Update aircraft icon colors dynamically on theme switch
    useEffect(() => {
      if (!mapReady || !mapRef.current) return;
      const map = mapRef.current;
      
      const isGhost = theme === 'ghost';
      const phantomPurple = '#B388FF';
      const ghostPriv = '#CE93D8';
      const ghostGov = '#D500F9';

      const flightCom = isGhost ? phantomPurple : '#1A73E8';
      const flightPriv = isGhost ? ghostPriv : '#FFD700';
      const flightGov = isGhost ? ghostGov : '#FF9500';
      const flightMil = '#FF0000';

      const updateMapIcon = (id: string, color: string, size: number) => {
        if (!map.hasImage(id)) return;
        const canvas = document.createElement('canvas');
        canvas.width = size * ICON_DPR; canvas.height = size * ICON_DPR;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(ICON_DPR, ICON_DPR);
        const cx = size / 2, cy = size / 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size * 0.4);
        ctx.lineTo(cx - size * 0.12, cy + size * 0.1);
        ctx.lineTo(cx - size * 0.4, cy + size * 0.2);
        ctx.lineTo(cx - size * 0.4, cy + size * 0.3);
        ctx.lineTo(cx - size * 0.12, cy + size * 0.15);
        ctx.lineTo(cx, cy + size * 0.35);
        ctx.lineTo(cx + size * 0.12, cy + size * 0.15);
        ctx.lineTo(cx + size * 0.4, cy + size * 0.3);
        ctx.lineTo(cx + size * 0.4, cy + size * 0.2);
        ctx.lineTo(cx + size * 0.12, cy + size * 0.1);
        ctx.closePath();
        ctx.fill();
        map.updateImage(id, { width: size * ICON_DPR, height: size * ICON_DPR, data: new Uint8Array(ctx.getImageData(0, 0, size * ICON_DPR, size * ICON_DPR).data) });
      };

      updateMapIcon('plane-cyan', flightCom, 24);
      updateMapIcon('plane-green', flightPriv, 24);
      updateMapIcon('plane-pink', flightGov, 24);
      updateMapIcon('plane-red', flightMil, 24);
      updateMapIcon('plane-grey', isGhost ? phantomPurple : '#546E7A', 24);


    }, [mapReady, theme]);

  // ── DECOUPLED LAYER RENDERERS (Performance Optimized) ──

  useEffect(() => {
    if (!mapReady) return;
    setGeo('earthquakes', activeLayers.earthquakes && data.earthquakes ? data.earthquakes.map((eq: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [eq.lng, eq.lat] }, properties: { magnitude: eq.magnitude, place: eq.place, depth: eq.depth, source: eq.source || 'USGS', url: eq.url || '' } })) : []);
  }, [mapReady, data.earthquakes, activeLayers.earthquakes, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    const sats = activeLayers.satellites && data.satellites ? data.satellites : [];
    setGeo('satellites', sats.length ? sats.map((s: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties: { name: s.name, color: s.color, mission: s.mission, alt: s.alt, noradId: s.noradId } })) : []);
    // Index satellites by id/name so a single orbit can be drawn on click.
    // We do NOT render all orbits at once (that blankets the globe) — the
    // elevated 3D orbit path is shown only for the satellite the user clicks.
    const byId = new Map<string, any>();
    if (sats.length) {
      for (const s of sats) {
        if (!s.groundTrack || !s.groundTrack.length) continue;
        if (s.noradId != null) byId.set(String(s.noradId), s);
        if (s.name) byId.set(String(s.name), s);
      }
    }
    satByIdRef.current = byId;
    // Clear any previously-shown orbit when the satellite layer reloads/toggles off.
    if (!sats.length) setGeo('orbit', []);
  }, [mapReady, data.satellites, activeLayers.satellites, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('gdelt', activeLayers.global_incidents && data.gdelt ? data.gdelt.map((e: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { name: e.name, category: e.category || '', type: e.type || '', source: e.source || '', url: e.url || '', count: e.count || 1, fatalities: e.fatalities ?? '', actors: e.actors || '', country: e.country || '', date: e.date || '' } })) : []);
  }, [mapReady, data.gdelt, activeLayers.global_incidents, setGeo]);

  // Malware Threats
  useEffect(() => {
    if (!mapReady) return;
    setGeo('malware-nodes', activeLayers.malware && data.malware_threats ? data.malware_threats.map((t: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] }, properties: { ip: t.ip, malware: t.malware, status: t.status, threat_type: t.threat_type, country: t.country } })) : []);
  }, [mapReady, data.malware_threats, activeLayers.malware, setGeo]);

  // Threat Intel (Blocklist.de, SSL Blacklist, PhishTank)
  useEffect(() => {
    if (!mapReady) return;
    const anyActive = activeLayers.blocklist || activeLayers.phishing || activeLayers.ssl_blacklist;
    setGeo('threat-intel-nodes', anyActive && data.threat_intel ? data.threat_intel.map((t: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] }, properties: { ip: t.ip, malware: t.malware, threat_type: t.threat_type, country: t.country, url: t.url || '' } })) : []);
  }, [mapReady, data.threat_intel, activeLayers.blocklist, activeLayers.phishing, activeLayers.ssl_blacklist, setGeo]);

  // Cyber Intel — Spamhaus DROP (BGP routing hostile CIDRs)
  useEffect(() => {
    if (!mapReady) return;
    setGeo('drop-nodes', activeLayers.bgp_routes && data.cyber_intel?.spamhaus_drop ? data.cyber_intel.spamhaus_drop.map((t: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] }, properties: { cidr: t.cidr, ip: t.sample_ip, country: t.country, source: t.source, threat_type: t.threat_type } })) : []);
  }, [mapReady, data.cyber_intel, activeLayers.bgp_routes, setGeo]);

  // Cyber Intel — Tor Exit Nodes
  useEffect(() => {
    if (!mapReady) return;
    setGeo('tor-nodes', activeLayers.tor_nodes && data.cyber_intel?.tor_exit_nodes ? data.cyber_intel.tor_exit_nodes.map((t: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] }, properties: { ip: t.ip, country: t.country, source: t.source, threat_type: t.threat_type } })) : []);
  }, [mapReady, data.cyber_intel?.tor_exit_nodes, activeLayers.tor_nodes, setGeo]);

  // Cyber Intel — Active CVE Threats
  useEffect(() => {
    if (!mapReady) return;
    setGeo('cve-nodes', activeLayers.cve_feed && data.cyber_intel?.cve_nodes ? data.cyber_intel.cve_nodes.map((t: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] }, properties: { title: t.title, cvss: t.cvss, severity: t.severity, summary: t.summary?.slice(0, 120), vendors: t.vendors?.join(','), source: t.source, threat_type: t.threat_type } })) : []);
  }, [mapReady, data.cyber_intel?.cve_nodes, activeLayers.cve_feed, setGeo]);

  // Cyber Intel — MITRE ATT&CK (APT Groups)
  useEffect(() => {
    if (!mapReady) return;
    setGeo('mitre-nodes', activeLayers.mitre_attack && data.cyber_intel?.mitre_nodes ? data.cyber_intel.mitre_nodes.map((t: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] }, properties: { name: t.name, group_id: t.id, country: t.country, techniques: t.techniques?.join(','), technique_names: t.technique_names?.join('|'), technique_descriptions: t.technique_descriptions?.join('|'), source: t.source, threat_type: t.threat_type } })) : []);
  }, [mapReady, data.cyber_intel?.mitre_nodes, activeLayers.mitre_attack, setGeo]);

  // Network Mesh Generation (Nearest Neighbor Lattice)
  useEffect(() => {
    if (!mapReady) return;
    const meshLinks: any[] = [];
    
    // Generate Malware Botnet Mesh
    if (activeLayers.malware && data.malware_threats && data.malware_threats.length > 1) {
      const nodes = data.malware_threats;
      for (let i = 0; i < nodes.length; i++) {
        // Connect each to next 2 for a global web
        for (let j = 1; j <= 2; j++) {
          const target = nodes[(i + j) % nodes.length];
          meshLinks.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[nodes[i].lng, nodes[i].lat], [target.lng, target.lat]] },
            properties: { threat_type: 'malware' }
          });
        }
      }
    }
    setGeo('network-mesh', meshLinks);
  }, [mapReady, activeLayers.malware, data.malware_threats, setGeo]);


  useEffect(() => {
    if (!mapReady) return;
    setGeo('gps-jamming', activeLayers.gps_jamming && data.gps_jamming ? data.gps_jamming : []);
  }, [mapReady, data.gps_jamming, activeLayers.gps_jamming, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('cctv', activeLayers.cctv && data.cameras ? data.cameras.map((c: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { id: c.id, name: c.name, city: c.city, country: c.country, source: c.source, feed_url: c.feed_url, stream_url: c.stream_url, stream_type: c.stream_type, external_url: c.external_url } })) : []);
  }, [mapReady, data.cameras, activeLayers.cctv, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('fires', activeLayers.fires && data.fires ? data.fires.map((f: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { brightness: f.brightness, satellite: f.satellite || '', confidence: f.confidence || '', frp: f.frp || 0, daynight: f.daynight || '', type: f.type || 'fire', title: f.title || '' } })) : []);
  }, [mapReady, data.fires, activeLayers.fires, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('weather', activeLayers.weather && data.weather_events ? data.weather_events.map((w: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [w.lng, w.lat] }, properties: { title: w.title, type: w.type, icon: w.icon, severity: w.severity, source: w.source, id: w.id, provider: w.provider || '', area: w.area || '' } })) : []);
  }, [mapReady, data.weather_events, activeLayers.weather, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('infrastructure', activeLayers.infrastructure && data.infrastructure ? data.infrastructure.map((i: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [i.lng, i.lat] }, properties: { name: i.name, city: i.city, country: i.country, status: i.status, reactors: i.reactors, capacityMW: i.capacityMW, owner: i.owner } })) : []);
  }, [mapReady, data.infrastructure, activeLayers.infrastructure, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('maritime', activeLayers.maritime && data.maritime_ports ? data.maritime_ports.map((p: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { name: p.name, country: p.country, type: p.type, volume: p.volume, fleet: p.fleet, rank: p.rank } })) : []);
    setGeo('maritime-choke', activeLayers.maritime && data.maritime_chokepoints ? data.maritime_chokepoints.map((c: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lng, c.lat] }, properties: { name: c.name, traffic: c.traffic, risk: c.risk } })) : []);
    setGeo('maritime-ships', activeLayers.maritime && data.maritime_ships ? data.maritime_ships.map((s: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lng, s.lat] }, properties: { name: s.name || s.mmsi?.toString(), type: s.type || 'cargo', speed: s.speed, heading: s.heading, destination: s.destination, flag: s.flag } })) : []);
  }, [mapReady, data.maritime_ports, data.maritime_chokepoints, data.maritime_ships, activeLayers.maritime, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('balloons', activeLayers.balloons && data.balloons ? data.balloons.map((b: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [b.lng, b.lat] }, properties: { callsign: b.callsign, type: b.type, status: b.status, altitude: b.altitude, speed: b.speed, verticalRate: b.verticalRate, temperature: b.temperature, color: b.color } })) : []);
  }, [mapReady, data.balloons, activeLayers.balloons, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('radiation', activeLayers.radiation && data.radiation ? data.radiation.map((r: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lng, r.lat] }, properties: { name: r.name, city: r.city, country: r.country, reading: r.reading, status: r.status, network: r.network } })) : []);
  }, [mapReady, data.radiation, activeLayers.radiation, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('live-news', activeLayers.live_news && data.live_feeds ? data.live_feeds.map((f: any) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { name: f.name, city: f.city, country: f.country, url: f.url, category: f.category, embed_allowed: f.embed_allowed !== false } })) : []);
  }, [mapReady, data.live_feeds, activeLayers.live_news, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    const items = data.news || [];
    setGeo('sigint-news', activeLayers.news_intel && items.length > 0
      ? items.filter((n: any) => n.coords?.length === 2).map((n: any) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [n.coords[1], n.coords[0]] },
          properties: { title: n.title, source: n.source, risk_score: n.risk_score, link: n.link }
        }))
      : []);
  }, [mapReady, data.news, activeLayers.news_intel, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('cables', activeLayers.cables && data.submarine_cables ? data.submarine_cables.map((c: any) => ({
      type: 'Feature', geometry: c.geometry,
      properties: { name: c.properties?.name, color: c.properties?.color, length_km: c.properties?.length_km, rfs_year: c.properties?.rfs_year, owners: c.properties?.owners, landing_points: c.properties?.landing_points }
    })) : []);
    setGeo('cable-landing-points', activeLayers.cables && data.submarine_cables_landing_points ? data.submarine_cables_landing_points.map((lp: any) => ({
      type: 'Feature', geometry: lp.geometry,
      properties: { name: lp.properties?.name }
    })) : []);
  }, [mapReady, data.submarine_cables, data.submarine_cables_landing_points, activeLayers.cables, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('ransomware', activeLayers.ransomware && data.ransomware ? data.ransomware.map((r: any) => ({
      type: 'Feature', geometry: r.geometry,
      properties: { ...r.properties }
    })) : []);
  }, [mapReady, data.ransomware, activeLayers.ransomware, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('eurepoc', activeLayers.eurepoc && data.eurepoc ? data.eurepoc.map((r: any) => ({
      type: 'Feature', geometry: r.geometry,
      properties: { ...r.properties }
    })) : []);
  }, [mapReady, data.eurepoc, activeLayers.eurepoc, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    setGeo('power_plants', activeLayers.power_plants && data.power_plants ? data.power_plants.map((p: any) => ({
      type: 'Feature', geometry: p.geometry,
      properties: { ...p.properties }
    })) : []);
  }, [mapReady, data.power_plants, activeLayers.power_plants, setGeo]);

  useEffect(() => {
    if (!mapReady) return;
    // 🔴 CONFLICT ZONES - center-point warning markers 🔴
    const CONFLICT_ZONES = [
      { label: 'UKRAINE WAR', severity: 'war', lat: 48.5, lng: 31.2, description: 'Live reporting: Ongoing Russian invasion of Ukraine and active frontlines.', sourceUrl: 'https://liveuamap.com/' },
      { label: 'GAZA CONFLICT', severity: 'war', lat: 31.35, lng: 34.35, description: 'Live reporting: Active military operations and humanitarian crisis in Gaza.', sourceUrl: 'https://israelpalestine.liveuamap.com/' },
      { label: 'LEBANON BORDER', severity: 'high', lat: 33.377, lng: 35.483, description: 'Live reporting: An airstrike targeted the city of Nabatieh.', sourceUrl: 'https://lebanon.liveuamap.com/en/2026/6-june-11-an-airstrike-targeted-the-city-of-nabatieh' },
      { label: 'SUDAN CIVIL WAR', severity: 'war', lat: 15.0, lng: 30.0, description: 'Live reporting: Armed conflict between SAF and RSF factions across Sudan.', sourceUrl: 'https://sudan.liveuamap.com/' },
      { label: 'MYANMAR CONFLICT', severity: 'war', lat: 19.5, lng: 96.5, description: 'Live reporting: Internal conflict and military junta opposition operations.', sourceUrl: 'https://myanmar.liveuamap.com/' },
      { label: 'DRC EASTERN CONFLICT', severity: 'war', lat: -1.0, lng: 28.5, description: 'M23 rebel offensive and regional instability.' },
      { label: 'YEMEN WAR', severity: 'war', lat: 15.5, lng: 48.0, description: 'Houthi militant operations and Red Sea maritime threats.', sourceUrl: 'https://yemen.liveuamap.com/' },
      { label: 'SYRIA', severity: 'high', lat: 35.0, lng: 38.5, description: 'Live reporting: Ongoing civil war and localized insurgencies.', sourceUrl: 'https://syria.liveuamap.com/' },
      { label: 'TAIWAN STRAIT', severity: 'elevated', lat: 24.0, lng: 119.5, description: 'Elevated military drills and regional tension.' },
      { label: 'KOREAN DMZ', severity: 'elevated', lat: 38.3, lng: 127.0, description: 'Ongoing cross-border tension and military posturing.' },
      { label: 'SAHEL INSTABILITY', severity: 'high', lat: 14.0, lng: 5.0, description: 'Insurgencies and military coups across the Sahel region.' },
      { label: 'SOMALIA', severity: 'high', lat: 5.0, lng: 46.0, description: 'Al-Shabaab insurgency and counter-terrorism operations.' },
      { label: 'RED SEA THREAT', severity: 'high', lat: 16.0, lng: 40.0, description: 'Houthi anti-ship missile and drone attacks on maritime traffic.', sourceUrl: 'https://yemen.liveuamap.com/' },
    ];
    const conflictFeatures = CONFLICT_ZONES.map(z => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [z.lng, z.lat] },
      properties: { label: z.label, severity: z.severity, description: z.description, sourceUrl: z.sourceUrl },
    }));
    setGeo('conflict-zones', conflictFeatures);
  }, [mapReady, setGeo]);


  // Visibility
  useEffect(() => {
    if (!mapReady) return;
    setVis(['eq-circles','eq-label'], activeLayers.earthquakes);
    setVis(['sat-glow','sat-dots','sat-label','orbit-line'], activeLayers.satellites);
    setVis(['gdelt-dots'], activeLayers.global_incidents);

    setVis(['malware-glow','malware-dots','malware-label'], activeLayers.malware);
    setVis(['network-mesh-atmo', 'network-mesh-glow', 'network-mesh-core'], activeLayers.internet_outages || activeLayers.malware);
    setVis(['threat-intel-glow','threat-intel-dots','threat-intel-label'], activeLayers.blocklist || activeLayers.phishing || activeLayers.ssl_blacklist);
    setVis(['drop-glow','drop-dots','drop-label'], activeLayers.bgp_routes);
    setVis(['tor-glow','tor-dots','tor-label'], activeLayers.tor_nodes);
    setVis(['cve-glow','cve-dots','cve-label'], activeLayers.cve_feed);
    setVis(['mitre-glow','mitre-dots','mitre-label'], activeLayers.mitre_attack);
    setVis(['jam-fill','jam-line','jam-label'], activeLayers.gps_jamming);
    setVis(['day-night-fill'], activeLayers.day_night);
      setVis(['fl-commercial'], activeLayers.flights);
      setVis(['fl-private'], activeLayers.private);
      setVis(['fl-jets'], activeLayers.jets);
      setVis(['fl-military'], activeLayers.military);
      setVis(['flight-track-atmo','flight-track-glow','flight-track-core','flight-track-arrows'], activeLayers.flight_track);
    setVis(['cctv-glow','cctv-dots','cctv-label'], activeLayers.cctv);
    setVis(['fires-heat'], activeLayers.fires);
    setVis(['weather-glow','weather-dots','weather-label'], activeLayers.weather);
    setVis(['infra-glow','infra-dots','infra-label'], activeLayers.infrastructure);
    setVis(['maritime-glow','maritime-dots','maritime-label'], activeLayers.maritime);
    setVis(['choke-glow','choke-dots','choke-label'], activeLayers.maritime);
    setVis(['ship-dots','ship-label'], activeLayers.maritime);
    setVis(['news-glow','news-dots','news-label'], activeLayers.live_news);
    setVis(['sigint-news-glow','sigint-news-dots','sigint-news-label'], activeLayers.news_intel);
    setVis(['conflict-icons'], activeLayers.conflict_zones !== false);

    setVis(['balloon-dots','balloon-label'], activeLayers.balloons);
    setVis(['rad-glow','rad-dots','rad-label'], activeLayers.radiation);
    setVis(['cables-line','cables-glow','cable-landing-points-dots'], activeLayers.cables);
    setVis(['ransomware-glow','ransomware-dots','ransomware-label'], activeLayers.ransomware);
    setVis(['eurepoc-glow','eurepoc-dots','eurepoc-label'], activeLayers.eurepoc);
    setVis(['power-plants-glow','power-plants-dots','power-plants-label'], activeLayers.power_plants);
    // Sweep layers always visible when data is present (controlled by useEffect)
    setVis(['sweep-connections','sweep-pulse-ring','sweep-device-glow','sweep-device-dots','sweep-device-labels'], true);
  }, [mapReady, activeLayers, setVis]);

  // IP Sweep visualization
  useEffect(() => {
    if (!mapReady) return;
    if (!sweepData?.devices?.length) {
      setGeo('ip-sweep-devices', []);
      setGeo('ip-sweep-pulse', []);
      setGeo('ip-sweep-connections', []);
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    const { center, devices } = sweepData;
    const centerCoord: [number, number] = [center.lng, center.lat];

    // Switch to globe and fly to the sweep location
    try {
      (map as any).setProjection({ type: 'globe' });
      map.setSky({ 'sky-color': '#0A0A0F', 'sky-horizon-blend': 0.02, 'horizon-color': '#0A0A0F', 'horizon-fog-blend': 0.02 });
    } catch { /* projection may not be supported */ }

    map.flyTo({ center: centerCoord, zoom: 14, pitch: 50, bearing: -20, duration: 3000, essential: true });

    // Set center pulse
    setGeo('ip-sweep-pulse', [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: centerCoord },
      properties: { ip: sweepData.target_ip },
    }]);

    // Build device features spread in a circle around center
    const allDeviceFeatures = devices.map((d: any, i: number) => {
      const angle = (i / devices.length) * Math.PI * 2;
      const radius = 0.001 + ((i % 7 + 1) * 0.0004);
      const dLng = centerCoord[0] + Math.cos(angle) * radius * (1 / Math.cos(center.lat * Math.PI / 180));
      const dLat = centerCoord[1] + Math.sin(angle) * radius;
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [dLng, dLat] },
        properties: {
          ip: d.ip, device_type: d.device_type, device_icon: d.device_icon,
          color: d.device_color, risk_level: d.risk_level,
          ports: JSON.stringify(d.ports), hostnames: JSON.stringify(d.hostnames),
          vulns: JSON.stringify(d.vulns), cpes: JSON.stringify(d.cpes), tags: JSON.stringify(d.tags),
        },
      };
    });

    // Connection lines from center to each device
    const connectionFeatures = allDeviceFeatures.map((f: any) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [centerCoord, f.geometry.coordinates] },
      properties: { color: f.properties.color },
    }));

    // Stagger the appearance after 3s flyTo completes
    const timer = setTimeout(() => {
      setGeo('ip-sweep-connections', connectionFeatures);
      const batchSize = 5;
      const batches = Math.ceil(allDeviceFeatures.length / batchSize);
      for (let b = 0; b < batches; b++) {
        setTimeout(() => {
          setGeo('ip-sweep-devices', allDeviceFeatures.slice(0, (b + 1) * batchSize));
        }, b * 100);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [mapReady, sweepData, setGeo]);

  // Scan Targets visualization
  useEffect(() => {
    if (!mapReady || !mapRef.current || !scanTargets) return;
    const map = mapRef.current;
    
    const features = scanTargets.map(t => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [t.lng, t.lat] },
      properties: { ...t }
    }));
    
    const src = map.getSource('scan-targets') as maplibregl.GeoJSONSource;
    if (src) src.setData({ type: 'FeatureCollection', features });
  }, [scanTargets, mapReady]);

  // Fly-to
  useEffect(() => {
    if (!mapReady || !mapRef.current || !flyToLocation) return;
    mapRef.current.flyTo({ center: [flyToLocation.lng, flyToLocation.lat], zoom: 8, duration: 2000 });
  }, [mapReady, flyToLocation]);

  // Dynamic projection switching (lightweight — no terrain DEM)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    try {
      (map as any).setProjection({ type: projection });
      if (projection === 'globe') {
        map.easeTo({ pitch: 20, duration: 1200 });
        try {
          (map as any).setSky({
            'sky-color': '#04040A',
            'sky-horizon-blend': 0.5,
            'horizon-color': '#0a0a1a',
            'horizon-fog-blend': 0.3,
            'fog-color': '#04040A',
            'fog-ground-blend': 0.9,
          });
        } catch (e) { console.warn('[OSIRIS] Suppressed error:', e instanceof Error ? e.message : e); }
      } else {
        map.easeTo({ pitch: 0, duration: 800 });
      }
    } catch (e) {
      console.warn('Projection switch failed:', e);
    }
  }, [mapReady, projection]);

  // 3D Terrain & Buildings layer
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const enabled = activeLayers.terrain_3d;

    try {
      if (enabled) {
        // ── 3D BUILDINGS SOURCE (OpenFreeMap CDN — no API key, globally cached) ──
        if (!map.getSource('osiris-buildings')) {
          map.addSource('osiris-buildings', {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
          });
        }

        // ── 3D BUILDING EXTRUSION LAYER ──
        if (!map.getLayer('osiris-3d-buildings')) {
          map.addLayer({
            id: 'osiris-3d-buildings',
            source: 'osiris-buildings',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14.5,
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['get', 'render_height'],
                0, '#1a1a2e',
                20, '#16213e',
                50, '#0f3460',
                120, '#533483',
                300, '#e94560',
              ],
              'fill-extrusion-height': [
                'interpolate', ['linear'], ['zoom'],
                14.5, 0,
                15.5, ['get', 'render_height']
              ],
              'fill-extrusion-base': [
                'interpolate', ['linear'], ['zoom'],
                14.5, 0,
                15.5, ['get', 'render_min_height']
              ],
              'fill-extrusion-opacity': [
                'interpolate', ['linear'], ['zoom'],
                14.5, 0,
                15, 0.7,
              ],
            },
          });
        }

        // Pitch the camera to reveal the 3D skyline
        if (map.getPitch() < 40) {
          map.easeTo({ pitch: 50, duration: 1200 });
        }

      } else {
        // ── DISABLE 3D ──
        if (map.getLayer('osiris-3d-buildings')) map.removeLayer('osiris-3d-buildings');
      }
    } catch (e) {
      console.warn('[OSIRIS] 3D terrain toggle error:', e);
    }
  }, [mapReady, activeLayers.terrain_3d]);

  // Satellite / Dark style switching
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (mapStyle === prevStyleRef.current) return;
    prevStyleRef.current = mapStyle;
    const map = mapRef.current;

    try {
      if (mapStyle !== 'dark') {
        // Add satellite raster tiles
        if (!map.getSource('satellite-tiles')) {
          map.addSource('satellite-tiles', {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            maxzoom: 18,
          });
          map.addLayer({ id: 'satellite-layer', type: 'raster', source: 'satellite-tiles', paint: { 'raster-opacity': 0.85 } }, 'day-night-fill');
        } else {
          map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
        }
      } else {
        if (map.getLayer('satellite-layer')) {
          map.setLayoutProperty('satellite-layer', 'visibility', 'none');
        }
      }
    } catch (e) {
      console.warn('Style switch failed:', e);
    }
  }, [mapReady, mapStyle]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" />;
}

export default memo(OsirisMap);
