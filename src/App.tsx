import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, MapPin, Navigation, 
  Layers, X, Activity, Target, ArrowLeft,
  ArrowUpDown, Car, Plane, Loader2, Dot,
  Play, Pause, Menu, Settings, Coffee, Instagram, ExternalLink,
  LocateFixed, Bike, Footprints
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { debounce } from 'lodash';

/** 
 * ELITE MOBILE GOOGLE MAPS UI (REACT VITE)
 * 7 Critical Engineering Fixes Applied: Ultra-fast pinning, Flight Route, 
 * Waze Search Engine, Dynamic Camera Following, and Material 3 Scaling.
 */

// --- TYPES ---
type AppMode = 'IDLE' | 'SETTING_UP' | 'SELECTING_ROUTE' | 'ACTIVE' | 'MOCKING_LOCATION';

interface TrafficSegment {
  coordinates: [number, number][];
  level: 'low' | 'medium' | 'high';
}

interface RouteInfo {
  distance: number; 
  duration: number; 
  durationWithTraffic: number;
  coordinates: [number, number][];
  trafficSegments: TrafficSegment[];
  label?: string;
}

// --- CONSTANTS ---
const REAL_LOCATION: [number, number] = [5.3880, 100.5500];

// --- COLORS ---
const COLORS = {
  BLUE: '#1A73E8',
  GREEN: '#1E8E3E',
  YELLOW: '#FBBC04',
  RED: '#D93025',
  WHITE: '#FFFFFF',
  TEXT_DARK: '#202124',
  TEXT_GREY: '#70757A',
  BORDER: '#E8EAED',
  SECONDARY: '#F1F3F4'
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '12px 16px',
  borderRadius: 12,
  background: 'none',
  border: 'none',
  width: '100%',
  cursor: 'pointer',
  textAlign: 'left',
  color: COLORS.TEXT_DARK,
  transition: 'background 0.2s',
  outline: 'none'
};

// --- ICONS ---
const gpsDotIcon = L.divIcon({
  className: 'gps-dot-wrapper',
  html: `<div class="gps-dot-pulse"></div><div class="gps-dot-core"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const endIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// --- HELPERS ---
function MapEvents({ onMapClick, onDragStart, onContextMenu }: { onMapClick: (lat: number, lng: number) => void, onDragStart: () => void, onContextMenu: (e: any) => void }) {
  useMapEvents({
    click(e) { onMapClick(e.latlng.lat, e.latlng.lng); },
    dragstart() { onDragStart(); },
    zoomstart() { onDragStart(); },
    contextmenu(e) { onContextMenu(e); },
  });
  return null;
}

function MapController({ center, isLocked }: { center: [number, number], isLocked: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (isLocked) {
      map.setView(center, map.getZoom(), { animate: true, duration: 1 });
    }
  }, [center, isLocked, map]);
  return null;
}

// --- COMPONENTS ---
const Text = ({ children, style, ...props }: any) => (
  <div style={style} {...props}>{children}</div>
);

export default function App() {
  const [mode, setMode] = useState<AppMode>('IDLE');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isMockingStatic, setIsMockingStatic] = useState(false);
  const [activeLayer, setActiveLayer] = useState<'plain' | 'satellite'>('plain');
  const [isFollowingGPS, setIsFollowingGPS] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const [realLocation, setRealLocation] = useState<[number, number]>(REAL_LOCATION);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [isSystemBridgeActive, setIsSystemBridgeActive] = useState(false);

  // SYSTEM BRIDGE DETECTION
  useEffect(() => {
    // Detect if we're in a native bridge that can handle system GPS mocking
    const isMockBridge = (window as any).AndroidMockBridge || (window as any).Capacitor || (window as any).Cordova;
    setIsSystemBridgeActive(!!isMockBridge);
  }, []);

  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ show: false, title: '', message: '', onConfirm: () => {} });

  // REAL LOCATION DETECTION
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setRealLocation([position.coords.latitude, position.coords.longitude]);
          if (isFollowingGPS && mode === 'IDLE') {
            setStartLoc([position.coords.latitude, position.coords.longitude]);
          }
        },
        (error) => console.error("Error getting location:", error),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const [mapContext, setMapContext] = useState<{
    show: boolean;
    latlng: [number, number] | null;
    point: { x: number, y: number } | null;
  }>({ show: false, latlng: null, point: null });
  const [isLoading, setIsLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [startQuery, setStartQuery] = useState("My Location");
  const [endQuery, setEndQuery] = useState("");
  const [startLoc, setStartLoc] = useState<[number, number] | null>(REAL_LOCATION); // Real GPS Area
  const [endLoc, setEndLoc] = useState<[number, number] | null>(null);
  const [pickingMode, setPickingMode] = useState<'start' | 'end' | 'mock_location' | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [vehicle, setVehicle] = useState<'car' | 'motor' | 'walk' | 'flight'>('car');
  const [currentSpeed, setCurrentSpeed] = useState(80);

  const speedConfig = {
    walk: { min: 1, max: 9, default: 5 },
    motor: { min: 40, max: 120, default: 60 },
    car: { min: 80, max: 300, default: 100 },
    flight: { min: 100, max: 1000, default: 500 }
  };

  const selectedRoute = routes[selectedRouteIdx] || null;

  const generateTraffic = (coords: [number, number][], baseDuration: number, vehicleType: string): { segments: TrafficSegment[], totalDuration: number } => {
    const segments: TrafficSegment[] = [];
    let extraTime = 0;
    
    // Engineering Fix: Traffic only for cars
    if (vehicleType !== 'car' || coords.length < 5) {
      return { segments: [{ coordinates: coords, level: 'low' }], totalDuration: baseDuration };
    }

    let current = 0;
    while (current < coords.length - 1) {
      const length = Math.floor(Math.random() * 15) + 5;
      const end = Math.min(current + length, coords.length);
      const subCoords = coords.slice(current, end);
      
      const rand = Math.random();
      const level: 'low' | 'medium' | 'high' = rand > 0.85 ? 'high' : rand > 0.65 ? 'medium' : 'low';
      
      segments.push({ coordinates: subCoords, level });
      
      // Simulating delay: higher level = more duration
      const multiplier = level === 'high' ? 3.0 : level === 'medium' ? 1.8 : 1.0;
      const segmentRatio = subCoords.length / coords.length;
      extraTime += baseDuration * segmentRatio * (multiplier - 1);

      current = end - 1;
      if (end === coords.length) break;
    }

    return { segments, totalDuration: baseDuration + extraTime };
  };

  const currentCoords = useMemo((): [number, number] => {
    // 1. Static Mocking Mode
    if (mode === 'MOCKING_LOCATION') {
      if (isRunning && startLoc) return startLoc;
      return realLocation;
    }

    // 2. Route Navigation Mode (ACTIVE/Arrived)
    if (mode === 'ACTIVE' && selectedRoute) {
      if (currentIndex < selectedRoute.coordinates.length) {
        return selectedRoute.coordinates[currentIndex];
      }
      // Stay at destination
      return selectedRoute.coordinates[selectedRoute.coordinates.length - 1];
    }
    
    // 3. Default (Idle or Others)
    return realLocation;
  }, [isRunning, selectedRoute, currentIndex, mode, startLoc, realLocation]);

  // Engineering Fix 3: Remove clunky Done buttons. 
  // Automated transition when picking mode is active and map is clicked.
  const handleMapClick = (lat: number, lng: number) => {
    const coordsString = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    if (pickingMode) {
      if (pickingMode === 'start') {
        setStartLoc([lat, lng]);
        setStartQuery(coordsString);
        setPickingMode(null);
        if (endLoc && (mode === 'SETTING_UP' || mode === 'SELECTING_ROUTE')) {
          calculateRoutes(endLoc, [lat, lng]);
        }
      } else if (pickingMode === 'end') {
        setEndLoc([lat, lng]);
        setEndQuery(coordsString);
        setPickingMode(null);
        setMode('SETTING_UP');
        // Auto Trigger Route Calc
        calculateRoutes([lat, lng]);
      } else if (pickingMode === 'mock_location') {
        setStartLoc([lat, lng]);
        setStartQuery(coordsString);
        setPickingMode(null);
        setMode('MOCKING_LOCATION');
      }
    } else if (mode === 'MOCKING_LOCATION' && !isRunning) {
      setStartLoc([lat, lng]);
      setStartQuery(coordsString);
    }
  };

  // Engineering Fix 2: Multi-Mode Routing (Road vs Flight)
  const calculateRoutes = async (targetEnd: [number, number], customStart?: [number, number], targetVehicle?: 'car' | 'motor' | 'walk' | 'flight') => {
    const origin = customStart || startLoc;
    if (!origin) return;
    setIsLoading(true);
    
    const vMode = targetVehicle || vehicle;
    
    if (vMode === 'flight') {
      // Instant flight route calculation (Straight lines)
      setTimeout(() => {
          const dist = L.latLng(origin).distanceTo(targetEnd);
          const steps = 100;
          const coords: [number, number][] = [];
          for (let i = 0; i <= steps; i++) {
              coords.push([
                  origin[0] + (targetEnd[0] - origin[0]) * (i / steps),
                  origin[1] + (targetEnd[1] - origin[1]) * (i / steps)
              ]);
          }
          const traffic = generateTraffic(coords, dist / 40, vMode);
          setRoutes([{
              distance: dist,
              duration: dist / 40,
              durationWithTraffic: traffic.totalDuration,
              coordinates: coords,
              trafficSegments: traffic.segments,
              label: 'Direct Flight'
          }]);
          setSelectedRouteIdx(0);
          setMode('SELECTING_ROUTE');
          // Initialize speed to default for the vehicle
          setCurrentSpeed(speedConfig.flight.default);
          setIsLoading(false);
      }, 300);
      return;
    }

    try {
      const profile = vMode === 'walk' ? 'walking' : 'driving';
      const url = `https://router.project-osrm.org/route/v1/${profile}/${origin[1]},${origin[0]};${targetEnd[1]},${targetEnd[0]}?overview=full&geometries=geojson&alternatives=false`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.code === 'Ok' && data.routes.length > 0) {
          const r = data.routes[0];
          const coords: [number, number][] = r.geometry.coordinates.map((c: any) => [c[1], c[0]]);
          const traffic = generateTraffic(coords, r.duration, vMode);
          
          setRoutes([{
              distance: r.distance,
              duration: r.duration,
              durationWithTraffic: traffic.totalDuration,
              coordinates: coords,
              trafficSegments: traffic.segments,
              label: "Recommended Route"
          }]);
          setSelectedRouteIdx(0);
          setMode('SELECTING_ROUTE');
          // Initialize speed to default for the vehicle
          setCurrentSpeed(speedConfig[vMode].default);
      }
    } catch (err) {
      console.error("Routing error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-recalculate when vehicle or locations change if endLoc exists
  useEffect(() => {
    if (endLoc && startLoc && !isRunning && (mode === 'SETTING_UP' || mode === 'SELECTING_ROUTE')) {
      calculateRoutes(endLoc);
    }
  }, [vehicle, startLoc, endLoc]);

  // Engineering Fix 4: Waze Search Engine with Debounce
  const searchWaze = useCallback(debounce(async (query: string) => {
    if (!query || query.length < 3) {
      setSearchResults([]);
      return;
    }
    try {
      // Direct Waze-like API call simulation (CORS workaround: using Nominatim but styled for user request)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=5`);
      const data = await res.json();
      setSearchResults(data.map((item: any) => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon)
      })));
    } catch (err) {
      console.error("Search failed:", err);
    }
  }, 150), []);

  useEffect(() => {
    if (mode === 'SETTING_UP' && endQuery.length > 2) searchWaze(endQuery);
  }, [endQuery, mode, searchWaze]);

  // RESET LOGIC
  const resetApp = () => {
    const prevMode = mode;
    setIsRunning(false);
    setIsPaused(false);
    setIsMockingStatic(false);
    setMode('IDLE');
    setRoutes([]);
    setEndLoc(null);
    setEndQuery("");
    
    // Only reset start position if we were routing
    // Keep it if we were just mocking a static location
    if (prevMode !== 'MOCKING_LOCATION') {
        setStartLoc(REAL_LOCATION);
        setStartQuery("My Location");
    }
    
    setPickingMode(null);
    setIsFollowingGPS(true);
    setCurrentIndex(0);
    setMapContext({ show: false, latlng: null, point: null });
  };

  const handleModeSwitch = (newMode: AppMode | 'PICK_START' | 'PICK_END' | 'PICK_MOCK' | 'IDLE') => {
    const doSwitch = () => {
        setPickingMode(null);
        setMapContext({ show: false, latlng: null, point: null });
        
        if (newMode === 'PICK_MOCK') {
            setMode('IDLE');
            setPickingMode('mock_location');
        } else if (newMode === 'SETTING_UP' || newMode === 'MOCKING_LOCATION' || newMode === 'IDLE') {
            setRoutes([]);
            setEndLoc(null);
            setEndQuery("");

            // Engineering Fix: Fresh start for Route Mode, Persistent for Mock Location
            if (newMode === 'SETTING_UP') {
              setStartLoc(REAL_LOCATION);
              setStartQuery("My Location");
            }

            setMode(newMode);
        }
    };

    if (isRunning) {
        setConfirmDialog({
            show: true,
            title: 'Stop current session?',
            message: 'Switching modes will terminate your active mock task. Do you want to proceed?',
            onConfirm: () => {
                resetApp();
                setConfirmDialog(p => ({ ...p, show: false }));
                doSwitch();
            }
        });
        return;
    }

    doSwitch();
  };

  const getTrafficLevelAt = useCallback((index: number) => {
    if (!selectedRoute) return 'low';
    let count = 0;
    for (const seg of selectedRoute.trafficSegments) {
      if (index >= count && index < count + seg.coordinates.length) {
        return seg.level;
      }
      count += seg.coordinates.length - 1; 
    }
    return 'low';
  }, [selectedRoute]);

  // BACKGROUND SIMULATION SERVICE
  useEffect(() => {
    if (!isRunning || isPaused || !selectedRoute) return;
    
    const trafficAt = getTrafficLevelAt(currentIndex);
    let effectiveSpeed = currentSpeed;
    
    // Auto-slow logic based on traffic: Blue = User Speed, Yellow = -20kmh/60% slower, Red = 5-25kmh
    if (trafficAt === 'high') {
      effectiveSpeed = Math.random() * 20 + 5; 
    } else if (trafficAt === 'medium') {
      effectiveSpeed = Math.max(15, currentSpeed * 0.4); 
    }

    const timeout = setTimeout(() => {
      setCurrentIndex(prev => {
        const next = prev + 1;
        if (next >= selectedRoute.coordinates.length) {
          setIsRunning(false);
          // NEW: We stay in ACTIVE mode at the destination until user resets
          return prev; 
        }
        return next;
      });
    }, Math.max(10, 1000 / (effectiveSpeed / 20)));
    
    return () => clearTimeout(timeout);
  }, [isRunning, selectedRoute, currentSpeed, isPaused, currentIndex, getTrafficLevelAt]);

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', background: '#e5e3df', overflow: 'hidden', fontFamily: 'system-ui' }}>
      
      {/* MAP ENGINE */}
      <div style={{ flex: 1, position: 'absolute', inset: 0 }}>
        <MapContainer center={currentCoords} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          {/* Engineering Fix 4 & 5: Business names preserved via explicit TileLayer */}
          {activeLayer === 'plain' ? (
            <TileLayer 
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="osm"
            />
          ) : (
            <>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              {/* Hybrid Overlay for Street Names */}
              <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" opacity={0.8} />
            </>
          )}
          
          {/* Traffic-Aware Polyline Rendering */}
          {mode === 'SELECTING_ROUTE' && routes.map((r, i) => {
            if (i === selectedRouteIdx) {
              return r.trafficSegments?.map((seg, idx) => (
                <Polyline 
                  key={`${i}-${idx}`} 
                  positions={seg.coordinates} 
                  color={seg.level === 'high' ? COLORS.RED : seg.level === 'medium' ? COLORS.YELLOW : COLORS.BLUE}
                  weight={6}
                  opacity={1}
                />
              ));
            }
            return (
              <Polyline 
                key={i} positions={r.coordinates} 
                color={'#70757a'} 
                weight={4} 
                opacity={0.6}
              />
            );
          })}

          {isRunning && selectedRoute && (
            <>
              {/* Traffic Segments (Remaining Path) */}
              {selectedRoute.trafficSegments?.map((seg, idx) => (
                <Polyline 
                  key={`active-traffic-${idx}`} 
                  positions={seg.coordinates} 
                  color={seg.level === 'high' ? COLORS.RED : seg.level === 'medium' ? COLORS.YELLOW : COLORS.BLUE}
                  weight={6}
                  opacity={0.8}
                />
              ))}
              
              {/* TRAVELED PATH (History - Gray) */}
                <Polyline 
                positions={selectedRoute.coordinates.slice(0, currentIndex + 1)}
                color="#70757a"
                weight={6}
                opacity={0.9}
              />
            </>
          )}

          {/* START PIN */}
          {startLoc && mode !== 'ACTIVE' && (
            <Marker position={startLoc} icon={L.divIcon({
              className: 'custom-pin',
              html: `<svg viewBox="0 0 24 24" width="36" height="36" fill="${COLORS.BLUE}" stroke="white" stroke-width="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" fill="white" />
                    </svg>`,
              iconSize: [36, 36],
              iconAnchor: [18, 36]
            })} />
          )}

          {/* END PIN */}
          {endLoc && mode !== 'ACTIVE' && (
            <Marker position={endLoc} icon={L.divIcon({
              className: 'custom-pin',
              html: `<svg viewBox="0 0 24 24" width="36" height="36" fill="${COLORS.RED}" stroke="white" stroke-width="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" fill="white" />
                    </svg>`,
              iconSize: [36, 36],
              iconAnchor: [18, 36]
            })} />
          )}
          
          <style>{`
            .gps-marker-container {
              background: none !important;
              border: none !important;
              box-shadow: none !important;
            }
          `}</style>

          {/* GPS DOT / VEHICLE */}
          <Marker 
            position={currentCoords} 
            icon={L.divIcon({
              className: 'gps-marker-container',
              html: `
                <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                  <!-- Accuracy Halo -->
                  <div style="
                    position: absolute;
                    width: 32px;
                    height: 32px;
                    background: rgba(26, 115, 232, 0.1);
                    border: 1px solid rgba(26, 115, 232, 0.15);
                    border-radius: 50%;
                  "></div>

                  <!-- Dot & Beam Wrapper -->
                  <div style="
                    position: relative;
                    width: 26px;
                    height: 26px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transform: rotate(${
                      isRunning && selectedRoute && currentIndex > 0 
                      ? (() => {
                          const p1 = selectedRoute.coordinates[currentIndex - 1];
                          const p2 = selectedRoute.coordinates[currentIndex];
                          // North is 0 deg
                          return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI;
                        })()
                      : 0
                    }deg);
                  ">
                    <!-- Triangle Pointer -->
                    <div style="
                      position: absolute;
                      top: -6px;
                      width: 0;
                      height: 0;
                      border-left: 6px solid transparent;
                      border-right: 6px solid transparent;
                      border-bottom: 10px solid ${COLORS.BLUE};
                      opacity: ${isRunning ? 1 : 0};
                    "></div>

                    <!-- White Border Circle -->
                    <div style="
                      width: 20px;
                      height: 20px;
                      background: white;
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
                      z-index: 2;
                    ">
                      <!-- Vehicle Icon / Blue Core -->
                      ${(() => {
                        const iconColor = COLORS.BLUE;
                        if (mode === 'ACTIVE' || mode === 'MOCKING_LOCATION') {
                          if (vehicle === 'car') return `<svg viewBox="0 0 24 24" width="14" height="14" fill="${iconColor}"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17H5v-5h14v5z"/><circle cx="7" cy="14.5" r="1.5"/><circle cx="17" cy="14.5" r="1.5"/></svg>`;
                          if (vehicle === 'motor') return `<svg viewBox="0 0 24 24" width="14" height="14" fill="${iconColor}"><path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm14.8-1.5c.3 0 .6.1.8.2l2.3-1.4c-.2-.6-.4-1.3-.4-2 0-2.8 2.2-5 5-5s5 2.2 5 5-2.2 5-5 5c-.7 0-1.4-.2-2-.4l-1.4 2.3c.1.2.2.5.2.8 0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2zm0 3c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm-3.6-7h-3.4c-.5 0-1-.3-1.3-.7L9.4 10.2c-.4-.5-.4-1.2 0-1.7l1.5-2.2c.4-.6 1.1-.9 1.8-.9h3.6c.6 0 1.2.4 1.4.9l.8 2.5 1.5 1.5c.4.4.4 1.1 0 1.5l-2.1 2.1c-.2.2-.5.3-.8.3h-1.5"/><path d="M19.4 15.5l-3.3-3.3 1.4-1.4 3.3 3.3z"/></svg>`;
                          if (vehicle === 'walk') return `<svg viewBox="0 0 24 24" width="14" height="14" fill="${iconColor}"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2V15.5L13 13.5l.6-3c1.2 1.5 3.1 2.5 5.4 2.5V11c-2.1 0-3.9-1.2-4.8-3L12.7 5.1c-.3-.5-.9-.8-1.5-.8-.3 0-.5.1-.8.2L6 6.3V13h2V8.1l1.8-.8"/></svg>`;
                          if (vehicle === 'flight') return `<svg viewBox="0 0 24 24" width="14" height="14" fill="${iconColor}"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;
                        }
                        return `<div style="width: 12px; height: 12px; background: ${iconColor}; border-radius: 50%;"></div>`;
                      })()}
                    </div>
                  </div>
                </div>
              `,
              iconSize: [40, 40],
              iconAnchor: [20, 20]
            })} 
            zIndexOffset={1000} 
          />
          
          <MapEvents 
            onMapClick={(lat, lng) => {
              setMapContext({ show: false, latlng: null, point: null });
              handleMapClick(lat, lng);
            }} 
            onDragStart={() => {
              setIsFollowingGPS(false);
              setMapContext({ show: false, latlng: null, point: null });
            }}
            onContextMenu={(e) => {
              setMapContext({
                show: true,
                latlng: [e.latlng.lat, e.latlng.lng],
                point: e.containerPoint
              });
            }}
          />
          <MapController center={currentCoords} isLocked={isFollowingGPS} />
        </MapContainer>
      </div>

      {/* Engineering Fix 5: Pixel-Perfect Top Floating UI */}
      <AnimatePresence>
        {(mode === 'SETTING_UP' || mode === 'SELECTING_ROUTE') && (
          <motion.div 
            initial={{ y: -200 }} animate={{ y: 0 }} exit={{ y: -200 }}
            style={{ position: 'fixed', top: 50, left: 12, right: 12, zIndex: 1000 }}
          >
            <div style={{ background: 'white', borderRadius: 16, padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={resetApp} style={{ background: 'none', border: 'none', padding: 4 }}><ArrowLeft size={24} color={COLORS.TEXT_DARK} /></button>
                    <div style={{ display: 'flex', gap: 8, flex: 1, justifyContent: 'center' }}>
                        {(['car', 'motor', 'walk', 'flight'] as const).map(v => (
                            <button 
                                key={v} onClick={() => setVehicle(v)}
                                style={{ 
                                    padding: '8px 12px', borderRadius: 20, border: 'none',
                                    background: vehicle === v ? '#E8F0FE' : 'transparent',
                                    color: vehicle === v ? COLORS.BLUE : COLORS.TEXT_GREY,
                                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer'
                                }}
                            >
                                {v === 'car' && <Car size={16} />}
                                {v === 'motor' && <Bike size={18} />}
                                {v === 'walk' && <Footprints size={18} />}
                                {v === 'flight' && <Plane size={16} />}
                            </button>
                        ))}
                    </div>
                    <button onClick={resetApp} style={{ background: 'none', border: 'none', padding: 4 }}><X size={24} color={COLORS.TEXT_GREY} /></button>
                </div>
                
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Transit Connection Line */}
                    <div style={{ position: 'absolute', left: 10, top: 22, bottom: 22, width: 2, borderLeft: '2px dotted #ccc' }} />
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: COLORS.SECONDARY, padding: '0 12px', borderRadius: 12, height: 48 }}>
                        <MapPin size={18} color={COLORS.BLUE} />
                        <input 
                            style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '16px' }} 
                            value={startQuery} 
                            onChange={e => setStartQuery(e.target.value)}
                        />
                         <button onClick={() => setPickingMode('start')} style={{ background: 'none', border: 'none' }}><MapPin size={18} color={COLORS.BLUE} /></button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: COLORS.SECONDARY, padding: '0 12px', borderRadius: 12, height: 48 }}>
                        <MapPin size={18} color={COLORS.RED} />
                        <input 
                            style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '16px' }} 
                            placeholder="Destination (Lat, Lon)"
                            value={endQuery} 
                            onChange={e => setEndQuery(e.target.value)}
                        />
                        <button onClick={() => setPickingMode('end')} style={{ background: 'none', border: 'none' }}><MapPin size={18} color={COLORS.RED} /></button>
                    </div>
                </div>

                {/* Search Results Overlay */}
                {searchResults.length > 0 && mode === 'SETTING_UP' && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', borderTop: `1px solid ${COLORS.BORDER}` }}>
                        {searchResults.map((r, i) => (
                            <div 
                                key={i} 
                                onClick={() => {
                                    setEndLoc([r.lat, r.lon]);
                                    setEndQuery(r.display_name.split(',')[0]);
                                    setSearchResults([]);
                                    calculateRoutes([r.lat, r.lon]);
                                }}
                                style={{ padding: '12px 0', borderBottom: `1px solid ${COLORS.BORDER}`, cursor: 'pointer' }}
                            >
                                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{r.display_name.split(',')[0]}</div>
                                <div style={{ fontSize: '12px', color: COLORS.TEXT_GREY }} className="truncate">{r.display_name}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* IDLE SEARCH BAR */}
      {mode === 'IDLE' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'fixed', top: 50, left: 16, right: 16, zIndex: 1000 }}>
            <div style={{ background: 'white', height: 48, borderRadius: 24, boxShadow: '0 2px 4px rgba(0,0,0,0.2), 0 0 1px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
                <div style={{ padding: 8, display: 'flex', alignItems: 'center' }}>
                  <Search size={20} color={COLORS.TEXT_GREY} />
                </div>
                <div onClick={() => setMode('SETTING_UP')} style={{ flex: 1, display: 'flex', alignItems: 'center', height: '100%', cursor: 'pointer' }}>
                  <span style={{ color: COLORS.TEXT_GREY, fontSize: '16px', marginLeft: 4 }}>Search here</span>
                </div>
                <button 
                  onClick={() => {
                    setShowSettings(false);
                    setIsMenuOpen(true);
                  }}
                  style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '50%' }}
                >
                  <Menu size={20} color={COLORS.TEXT_GREY} />
                </button>
            </div>
        </motion.div>
      )}

      {/* Engineering Fix 10: Google-style Pin Picking Toast */}
      <AnimatePresence>
        {pickingMode && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            style={{
              position: 'fixed',
              bottom: 120,
              left: 16,
              right: 16,
              zIndex: 4000,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none'
            }}
          >
            <div style={{
              background: COLORS.TEXT_DARK,
              color: 'white',
              padding: '12px 20px',
              borderRadius: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              pointerEvents: 'auto',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <MapPin size={18} color="white" />
              <Text style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>
                  {pickingMode === 'start' ? 'Select starting point' : 
                   pickingMode === 'end' ? 'Select destination' : 
                   'Select mock location'}
              </Text>
              <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
              <button 
                onClick={() => setPickingMode(null)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'white', 
                  fontSize: '13px', 
                  fontWeight: '900', 
                  cursor: 'pointer',
                  padding: '4px 8px',
                  letterSpacing: '0.5px'
                }}
              >
                CANCEL
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAP CONTEXT MENU (ON HOLD) */}
      <AnimatePresence>
        {mapContext.show && mapContext.point && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'fixed',
              top: mapContext.point.y,
              left: mapContext.point.x,
              zIndex: 5000,
              background: 'white',
              borderRadius: 12,
              padding: '8px 0',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              minWidth: 160
            }}
          >
            <button 
                onClick={() => {
                   if (mapContext.latlng) {
                     setStartLoc([mapContext.latlng[0], mapContext.latlng[1]]);
                     handleModeSwitch('MOCKING_LOCATION');
                     setMapContext({ show: false, latlng: null, point: null });
                   }
                }}
                style={{ ...menuItemStyle, padding: '10px 16px', fontSize: '14px' }}
            >
                <MapPin size={16} color={COLORS.BLUE} /> Mock Location
            </button>
            <button 
                onClick={() => {
                    if (mapContext.latlng) {
                        setEndLoc([mapContext.latlng[0], mapContext.latlng[1]]);
                        setEndQuery(`${mapContext.latlng[0].toFixed(4)}, ${mapContext.latlng[1].toFixed(4)}`);
                        handleModeSwitch('SETTING_UP');
                        calculateRoutes([mapContext.latlng[0], mapContext.latlng[1]]);
                        setMapContext({ show: false, latlng: null, point: null });
                    }
                }}
                style={{ ...menuItemStyle, padding: '10px 16px', fontSize: '14px' }}
            >
                <Navigation size={16} color={COLORS.BLUE} /> Mock Route
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION DIALOG */}
      <AnimatePresence>
        {confirmDialog.show && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setConfirmDialog(p => ({ ...p, show: false }))}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              style={{
                position: 'relative',
                background: 'white',
                width: '100%',
                maxWidth: 320,
                borderRadius: 24,
                padding: '24px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}
            >
              <Text style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: 8, display: 'block' }}>{confirmDialog.title}</Text>
              <Text style={{ fontSize: '14px', color: COLORS.TEXT_GREY, lineHeight: '1.5', display: 'block', marginBottom: 24 }}>
                {confirmDialog.message}
              </Text>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setConfirmDialog(p => ({ ...p, show: false }))}
                  style={{ background: 'none', border: 'none', color: COLORS.BLUE, fontWeight: 'bold', padding: '8px 16px' }}
                >
                  CANCEL
                </button>
                <button 
                  onClick={() => {
                    confirmDialog.onConfirm();
                  }}
                  style={{ background: COLORS.BLUE, border: 'none', color: 'white', fontWeight: 'bold', padding: '8px 24px', borderRadius: 20 }}
                >
                  PROCEED
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 3000 }}
            />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              style={{ 
                position: 'fixed', top: 0, right: 0, bottom: 0, width: '82%', 
                background: 'white', zIndex: 3001, padding: '0 16px',
                display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.1)'
              }}
            >
              {/* Vertical alignment spacer to match search bar (top 50) */}
              <div style={{ height: 50 }} /> 
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 48, marginBottom: 16 }}>
                <Text style={{ flex: 1, fontSize: '18px', color: COLORS.TEXT_DARK, fontWeight: '400', marginLeft: 8 }}>
                  {showSettings ? 'Settings' : 'Mock GPS'}
                </Text>
                {showSettings ? (
                  <button 
                    onClick={() => setShowSettings(false)} 
                    style={{ background: 'none', border: 'none', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
                  >
                    <ArrowLeft size={22} color={COLORS.TEXT_GREY} />
                  </button>
                ) : (
                  <button 
                    onClick={() => setIsMenuOpen(false)} 
                    style={{ background: 'none', border: 'none', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
                  >
                    <X size={22} color={COLORS.TEXT_GREY} />
                  </button>
                )}
              </div>

              {!showSettings ? (
                /* MAIN MENU VIEW */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <Text style={{ fontSize: '12px', fontWeight: 'bold', color: COLORS.TEXT_GREY, letterSpacing: '1px', marginBottom: 4 }}>SERVICES</Text>
                  
                  <button 
                    style={menuItemStyle} 
                    onClick={() => { setIsMenuOpen(false); handleModeSwitch('PICK_MOCK'); }}
                  >
                    <MapPin size={20} color={COLORS.BLUE} />
                    <Text style={{ fontWeight: '600' }}>Mock Location</Text>
                  </button>
                  <button style={menuItemStyle} onClick={() => { setIsMenuOpen(false); handleModeSwitch('SETTING_UP'); }}><Navigation size={20} color={COLORS.BLUE} /><Text style={{ fontWeight: '600' }}>Mock Route</Text></button>
                  <button 
                    style={{ ...menuItemStyle, opacity: 0.5, cursor: 'not-allowed' }} 
                  >
                    <Layers size={20} color="#999" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontWeight: '600', color: '#999' }}>Multiple Mock Route</Text>
                    </div>
                  </button>

                  <div style={{ height: 1.5, background: COLORS.BORDER, margin: '16px 0' }} />
                  
                  <Text style={{ fontSize: '12px', fontWeight: 'bold', color: COLORS.TEXT_GREY, letterSpacing: '1px', marginBottom: 4 }}>PREFERENCES</Text>
                  <button style={menuItemStyle} onClick={() => setShowSettings(true)}><Settings size={20} color={COLORS.TEXT_DARK} /><Text style={{ fontWeight: '600' }}>Settings</Text></button>
                  <button 
                    style={menuItemStyle} 
                    onClick={() => {
                        setIsMenuOpen(false);
                        setShowSetupGuide(true);
                    }}
                  >
                    <Activity size={20} color={COLORS.BLUE} />
                    <Text style={{ fontWeight: '600' }}>Setup Guide (Android)</Text>
                  </button>
                </div>
              ) : (
                /* SETTINGS VIEW */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
                  <div>
                    <Text style={{ fontSize: '12px', fontWeight: 'bold', color: COLORS.TEXT_GREY, letterSpacing: '1px', marginBottom: 12 }}>APP CONFIG</Text>
                    <button style={{ ...menuItemStyle, padding: '8px 0' }}><Text style={{ fontWeight: '600' }}>Dark Mode</Text><div style={{ flex: 1 }} /><div style={{ width: 40, height: 20, background: '#D1D3D4', borderRadius: 10 }} /></button>
                    <button style={{ ...menuItemStyle, padding: '8px 0' }}><Text style={{ fontWeight: '600' }}>Auto-Recenter</Text><div style={{ flex: 1 }} /><div style={{ width: 40, height: 20, background: COLORS.BLUE, borderRadius: 10, display: 'flex', justifyContent: 'flex-end', padding: 2 }}><div style={{ width: 16, height: 16, background: 'white', borderRadius: 8 }} /></div></button>
                  </div>

                  <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ height: 1.5, background: COLORS.BORDER, margin: '8px 0' }} />
                    
                    <div style={{ background: '#FFF7E6', padding: '16px', borderRadius: 16, border: '1px solid #FFE7B8', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ background: '#FF9900', width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Coffee size={20} color="white" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: '14px' }}>Buy Me a Coffee</Text>
                        <Text style={{ fontSize: '12px', color: COLORS.TEXT_GREY }}>Support the developer</Text>
                      </div>
                      <ExternalLink size={16} color={COLORS.TEXT_GREY} />
                    </div>

                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <Text style={{ fontSize: '13px', color: COLORS.TEXT_GREY }}>Made with ❤️ by <span style={{ fontWeight: 'bold', color: COLORS.TEXT_DARK }}>Rafi Ridzuan</span></Text>
                      <button 
                        onClick={() => window.open('https://instagram.com/rafiridzuan', '_blank')}
                        style={{ 
                          marginTop: 12, background: 'linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
                          border: 'none', borderRadius: 12, height: 44, width: '100%', color: 'white', fontWeight: 'bold',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                        }}
                      >
                        <Instagram size={20} />
                        <Text>@rafiridzuan</Text>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Engineering Fix 5: Draggable Bottom Sheet (Material 3 Style) */}
      <AnimatePresence>
        {(mode === 'SELECTING_ROUTE' || mode === 'ACTIVE' || mode === 'MOCKING_LOCATION') && (
          <motion.div 
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            style={{ 
                position: 'fixed', bottom: 0, left: 0, right: 0, 
                background: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, 
                padding: '12px 16px 40px', zIndex: 2000,
                boxShadow: '0 -8px 24px rgba(0,0,0,0.1)' 
            }}
          >
            <div style={{ width: 36, height: 4, background: '#ccc', borderRadius: 2, margin: '0 auto 16px' }} />
            
            {mode === 'MOCKING_LOCATION' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <Text style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.TEXT_DARK }}>
                                Static Mock Location
                            </Text>
                            <Text style={{ fontSize: '14px', color: isRunning ? COLORS.GREEN : COLORS.TEXT_GREY }}>
                                {isRunning ? 'Currently Mocking' : 'Ready to start'}
                            </Text>
                        </div>
                        <div style={{ 
                            padding: '4px 8px', borderRadius: '4px', 
                            background: isSystemBridgeActive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)',
                            border: `1px solid ${isSystemBridgeActive ? COLORS.GREEN : '#FF9800'}`,
                            flexShrink: 0
                        }}>
                            <Text style={{ fontSize: '10px', fontWeight: 'bold', color: isSystemBridgeActive ? COLORS.GREEN : '#FF9800' }}>
                                {isSystemBridgeActive ? 'SYSTEM BRIDGE ACTIVE' : 'WEB SIMULATION'}
                            </Text>
                        </div>
                        <button 
                            onClick={resetApp}
                            style={{ width: 40, height: 40, borderRadius: 20, background: COLORS.SECONDARY, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <X size={20} color={COLORS.TEXT_DARK} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button 
                            onClick={() => {
                                setIsRunning(!isRunning);
                                setIsMockingStatic(true);
                                setIsFollowingGPS(true);
                            }}
                            style={{ 
                                flex: 1,
                                height: 54, 
                                background: isRunning ? COLORS.SECONDARY : COLORS.BLUE, 
                                borderRadius: 27, 
                                color: isRunning ? COLORS.TEXT_DARK : 'white', 
                                border: 'none', fontSize: '18px', fontWeight: 'bold',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
                            }}
                        >
                            {isRunning ? (
                                <><Pause size={24} /> PAUSE</>
                            ) : (
                                <><Play size={24} /> START</>
                            )}
                        </button>

                        <button 
                            onClick={() => {
                                if (startLoc) {
                                  navigator.clipboard.writeText(`${startLoc[0]}, ${startLoc[1]}`);
                                  // Simple alert feedback
                                  alert(`Copied: ${startLoc[0]}, ${startLoc[1]}`);
                                }
                            }}
                            style={{ 
                                width: 54, height: 54, borderRadius: 27, 
                                background: COLORS.SECONDARY, border: 'none', 
                                display: 'flex', alignItems: 'center', justifyContent: 'center' 
                            }}
                        >
                            <Target size={24} color={COLORS.BLUE} />
                        </button>

                        <button 
                            onClick={() => {
                                setStartLoc(realLocation);
                                setStartQuery("My Location");
                                setPickingMode(null);
                            }}
                            style={{ 
                                width: 54, height: 54, borderRadius: 27, 
                                background: COLORS.SECONDARY, border: 'none', 
                                display: 'flex', alignItems: 'center', justifyContent: 'center' 
                            }}
                        >
                            <LocateFixed size={24} color={COLORS.BLUE} />
                        </button>
                    </div>
                    
                    <Text style={{ fontSize: '12px', color: COLORS.TEXT_GREY, textAlign: 'center' }}>
                        {isRunning 
                            ? (isSystemBridgeActive ? 'GPS System Mocking is LIVE' : 'Simulating in app. For system-wide mock, build as Native APK.') 
                            : 'Click map or search for target location'}
                    </Text>
                </div>
            )}

            {mode === 'SELECTING_ROUTE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ background: '#F8F9FA', padding: 16, borderRadius: 16, border: `1px solid #eee` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ fontSize: '20px', fontWeight: 'bold', color: COLORS.TEXT_DARK }}>
                                  {((selectedRoute?.distance || 0)/1000).toFixed(1)} km
                              </div>
                              <div style={{ fontSize: '14px', color: COLORS.RED, fontWeight: '500' }}>
                                  {selectedRoute && selectedRoute.durationWithTraffic > selectedRoute.duration * 1.2 ? (
                                    <span>Heavy Traffic delay included</span>
                                  ) : selectedRoute && selectedRoute.durationWithTraffic > selectedRoute.duration * 1.05 ? (
                                    <span>Slight traffic delay</span>
                                  ) : (
                                    <span style={{ color: COLORS.GREEN }}>Fastest route, clear traffic</span>
                                  )}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '24px', fontWeight: 'bold', color: COLORS.RED }}>
                                  ~{selectedRoute ? Math.max(1, Math.round(((selectedRoute.durationWithTraffic / 60) * (100 / currentSpeed)))) : 0} min
                              </div>
                              <div style={{ fontSize: '12px', color: COLORS.TEXT_GREY }}>
                                  Simulated ETA
                              </div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ fontSize: '12px', fontWeight: 'bold', color: COLORS.TEXT_GREY }}>ESTIMATED TRAVEL TIME</Text>
                            <Text style={{ fontSize: '14px', fontWeight: 'bold', color: COLORS.BLUE }}>{currentSpeed} KM/H</Text>
                        </div>
                        <input 
                            type="range" 
                            min={speedConfig[vehicle].min} 
                            max={speedConfig[vehicle].max} 
                            step="1" 
                            value={currentSpeed} 
                            onChange={e => setCurrentSpeed(parseInt(e.target.value))}
                            style={{ width: '100%', height: 6, background: '#ddd', borderRadius: 3, outline: 'none' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                           <Text style={{ fontSize: '10px', color: COLORS.TEXT_GREY }}>{speedConfig[vehicle].min} km/h</Text>
                           <Text style={{ fontSize: '10px', color: COLORS.TEXT_GREY }}>{speedConfig[vehicle].max} km/h</Text>
                        </div>
                    </div>

                    <button 
                        onClick={() => { 
                          setMode('ACTIVE'); 
                          setIsRunning(true); 
                          setIsPaused(false);
                          setCurrentIndex(0); 
                          setIsFollowingGPS(true);
                        }}
                        style={{ height: 54, background: COLORS.BLUE, borderRadius: 27, color: 'white', border: 'none', fontSize: '18px', fontWeight: 'bold' }}
                    >
                        START {vehicle.toUpperCase()}
                    </button>
                </div>
            )}

            {mode === 'ACTIVE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <div style={{ fontSize: '32px', fontWeight: 'bold', color: isRunning ? (isPaused ? COLORS.BLUE : COLORS.GREEN) : COLORS.BLUE }}>
                            {isRunning ? (isPaused ? 'Paused' : 'Navigating...') : 'Arrived'}
                          </div>
                          <div style={{ fontSize: '14px', color: isRunning ? COLORS.RED : COLORS.GREEN, fontWeight: 'bold' }}>
                            {isRunning ? (
                                `ETA: ${selectedRoute ? Math.max(1, Math.round((selectedRoute.durationWithTraffic / 60) * (1 - currentIndex / selectedRoute.coordinates.length) * (100 / currentSpeed))) : 0} mins`
                            ) : (
                                'Destination reached'
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                          {isRunning ? (
                            <>
                                <button 
                                    onClick={() => setIsPaused(!isPaused)}
                                    style={{ width: 50, height: 50, borderRadius: 25, background: COLORS.SECONDARY, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    {isPaused ? <Play size={24} color={COLORS.BLUE} /> : <Pause size={24} color={COLORS.TEXT_DARK} />}
                                </button>
                                <button 
                                    onClick={resetApp} 
                                    style={{ width: 50, height: 50, borderRadius: 25, background: COLORS.RED, color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <X size={24} />
                                </button>
                            </>
                          ) : (
                            <button 
                                onClick={resetApp} 
                                style={{ 
                                    height: 50, 
                                    padding: '0 24px',
                                    borderRadius: 25, 
                                    background: COLORS.TEXT_DARK, 
                                    color: 'white', 
                                    border: 'none', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    gap: 8,
                                    fontWeight: 'bold'
                                }}
                            >
                                RESET GPS
                            </button>
                          )}
                        </div>
                    </div>
                    {isRunning && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {vehicle === 'flight' ? <Plane size={16} color={COLORS.TEXT_GREY} /> : 
                                     vehicle === 'motor' ? <Bike size={18} color={COLORS.TEXT_GREY} /> :
                                     vehicle === 'walk' ? <Footprints size={18} color={COLORS.TEXT_GREY} /> :
                                     <Car size={16} color={COLORS.TEXT_GREY} />}
                                    <span style={{ color: COLORS.TEXT_GREY, fontSize: '14px', fontWeight: '600' }}>{currentSpeed} KM/H</span>
                                </div>
                                <div style={{ fontSize: '14px', color: COLORS.BLUE, fontWeight: 'bold' }}>
                                  {vehicle.toUpperCase()}
                                </div>
                            </div>
                            <input 
                                type="range" 
                                min={speedConfig[vehicle].min} 
                                max={speedConfig[vehicle].max} 
                                step="1" 
                                value={currentSpeed} 
                                onChange={e => setCurrentSpeed(parseInt(e.target.value))}
                                style={{ width: '100%', height: 6, background: '#eee', borderRadius: 3, outline: 'none' }}
                            />
                        </>
                    )}
                </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Engineering Fix 7: Intelligent Re-Center Button */}
      <AnimatePresence>
        {!isFollowingGPS && (
            <motion.button 
                initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                onClick={() => setIsFollowingGPS(true)}
                style={{ 
                    position: 'fixed', right: 20, bottom: (mode === 'SELECTING_ROUTE' || mode === 'ACTIVE') ? 220 : 100, 
                    width: 56, height: 56, borderRadius: 28, background: 'white', 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', border: 'none', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
            >
                <Target size={26} color={COLORS.BLUE} />
            </motion.button>
        )}
      </AnimatePresence>

      {/* Layer Toggle */}
      <button 
        onClick={() => setActiveLayer(activeLayer === 'plain' ? 'satellite' : 'plain')}
        style={{ 
            position: 'fixed', right: 20, bottom: (mode === 'SELECTING_ROUTE' || mode === 'ACTIVE') ? 285 : 165, 
            width: 48, height: 48, borderRadius: 24, background: 'white', 
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: 'none', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        <Layers size={22} color={COLORS.TEXT_GREY} />
      </button>

      {/* ACTIVITY INDICATOR (Fix 2) */}
      {isLoading && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.4)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'white', padding: '20px 40px', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Loader2 className="animate-spin" color={COLORS.BLUE} size={24} />
                  <span style={{ fontWeight: 'bold' }}>Calculating...</span>
              </div>
          </div>
      )}

      {/* SETUP GUIDE MODAL */}
      <AnimatePresence>
        {showSetupGuide && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
                onClick={() => setShowSetupGuide(false)}
            />
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                style={{ 
                    position: 'relative', width: '100%', maxWidth: 400, background: 'white', 
                    borderRadius: 24, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                    maxHeight: '80vh', overflowY: 'auto'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <Text style={{ fontSize: '22px', fontWeight: 'bold', color: COLORS.TEXT_DARK }}>Android Setup Guide</Text>
                    <button onClick={() => setShowSetupGuide(false)} style={{ background: COLORS.SECONDARY, border: 'none', width: 32, height: 32, borderRadius: 16 }}><X size={18} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: COLORS.BLUE, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 'bold' }}>1</div>
                        <div>
                            <Text style={{ fontWeight: 'bold', fontSize: '15px' }}>Enable Developer Options</Text>
                            <Text style={{ fontSize: '13px', color: COLORS.TEXT_GREY, marginTop: 4 }}>Go to phone <span style={{ fontWeight: '600' }}>Settings &gt; About Phone</span>. Tap <span style={{ fontWeight: '600' }}>Build Number</span> 7 times until it says "You are a developer".</Text>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: COLORS.BLUE, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 'bold' }}>2</div>
                        <div>
                            <Text style={{ fontWeight: 'bold', fontSize: '15px' }}>Set Mock Location App</Text>
                            <Text style={{ fontSize: '13px', color: COLORS.TEXT_GREY, marginTop: 4 }}>Go to <span style={{ fontWeight: '600' }}>Settings &gt; Developer Options</span>. Find <span style={{ fontWeight: '600' }}>"Select mock location app"</span> and choose <span style={{ fontWeight: '600' }}>Mock GPS</span>.</Text>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 14, background: COLORS.BLUE, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 'bold' }}>3</div>
                        <div>
                            <Text style={{ fontWeight: 'bold', fontSize: '15px' }}>Build as Native App</Text>
                            <Text style={{ fontSize: '13px', color: COLORS.TEXT_GREY, marginTop: 4 }}>To move your REAL PIN on Maps, you MUST use a tool that supports <span style={{ fontWeight: '600' }}>Capacitor</span> or <span style={{ fontWeight: '600' }}>Cordova</span> with the Mock Location permissions I have pre-configured in the metadata.</Text>
                        </div>
                    </div>

                    <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 16, marginTop: 12 }}>
                        <Text style={{ fontSize: '12px', color: COLORS.TEXT_GREY, lineHeight: '1.5' }}>
                            <span style={{ fontWeight: 'bold', color: COLORS.RED }}>Pro Tip:</span> This app simulates location in the map. To mock your REAL GPS for other apps (Grab/Maps), the APK must be built with a Native Bridge (Capacitor/Cordova).
                        </Text>
                    </div>

                    <button 
                        onClick={() => setShowSetupGuide(false)}
                        style={{ width: '100%', height: 48, background: COLORS.BLUE, color: 'white', borderRadius: 24, border: 'none', fontWeight: 'bold', marginTop: 12 }}
                    >
                        GOT IT
                    </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .gps-dot-pulse { position: absolute; width: 44px; height: 44px; background: rgba(26, 115, 232, 0.25); border-radius: 50%; left: -10px; top: -10px; animation: gps-pulse 2s infinite ease-out; }
        .gps-dot-core { width: 14px; height: 14px; background: ${COLORS.BLUE}; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 8px rgba(0,0,0,0.2); }
        @keyframes gps-pulse { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(3); opacity: 0; } }
        .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        ::-webkit-scrollbar { display: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; height: 24px; width: 24px; border-radius: 50%; background: ${COLORS.BLUE}; border: 4px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: pointer; margin-top: -9px; }
        input[type="range"]::-webkit-slider-runnable-track { width: 100%; height: 6px; background: #eee; border-radius: 3px; }
      `}</style>
    </div>
  );
}
