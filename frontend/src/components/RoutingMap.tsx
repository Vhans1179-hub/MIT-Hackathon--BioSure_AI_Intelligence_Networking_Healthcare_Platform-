/**
 * RoutingMap.tsx
 *
 * Google Maps view of a patient's home location and the ranked CAR-T treatment
 * centers returned by /api/v1/routing/recommend. Designed to be embedded inside
 * the EligibilityDrawer's Routing tab.
 *
 * Visual encoding:
 *   - Patient home → purple house pin
 *   - Top-ranked centers (in-network) → green numbered pins (#1, #2, ...)
 *   - Centers in top-N that are out-of-network → red pin
 *   - "nearest_overall" alternative (geographically closest, not in top-N) →
 *     orange pin with a warning marker
 *
 * Click any marker → InfoWindow with name, distance, in/out-of-network status,
 * drive-time estimate, and (if provided) a callback to surface the row in the
 * sibling list.
 */

import { useEffect, useMemo, useState } from 'react';
import { GoogleMap, MarkerF, InfoWindowF, useJsApiLoader } from '@react-google-maps/api';

export interface RankedCenter {
  rank: number;
  center_id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
  products_certified: string[];
  insurance_accepted: string[];
  trial_sites: string[];
  capacity_per_month?: number;
  current_wait_weeks?: number;
  distance: number;
  distance_unit: string;
  drive_hours_estimate: number;
  in_network: boolean;
  on_trial: boolean;
  scores: {
    clinical: number;
    distance: number;
    insurance: number;
    composite: number;
  };
  note?: string;
}

export interface PatientHome {
  city: string;
  state: string;
  country: string;
  lat: number;
  lon: number;
  insurance_type?: string;
}

interface RoutingMapProps {
  patientHome: PatientHome;
  centers: RankedCenter[];
  nearestOverall?: RankedCenter | null;
  selectedCenterId?: string | null;
  onSelectCenter?: (centerId: string) => void;
  height?: number | string;
}

const DEFAULT_CENTER_BY_COUNTRY: Record<string, { lat: number; lng: number; zoom: number }> = {
  US: { lat: 39.5, lng: -98.35, zoom: 4 },
  IN: { lat: 22.5, lng: 79.0, zoom: 5 },
};

// Cast Vite env so TS doesn't complain.
const GOOGLE_MAPS_API_KEY: string =
  // @ts-expect-error - import.meta.env is provided by Vite at build time
  (import.meta.env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';

/**
 * Google Maps marker icon URL helpers.
 * Using Google Charts marker generator — simple, no extra assets to ship.
 */
function pinForRank(rank: number, color: string): string {
  // chld = "label|color" (color is hex without #)
  return `https://chart.googleapis.com/chart?chst=d_map_pin_letter&chld=${rank}|${color}|FFFFFF`;
}

const PATIENT_PIN_URL =
  'https://chart.googleapis.com/chart?chst=d_map_pin_letter&chld=H|7C3AED|FFFFFF';
const NEAREST_ALT_PIN_URL =
  'https://chart.googleapis.com/chart?chst=d_map_pin_letter&chld=!|F59E0B|FFFFFF';

const COLOR_IN_NETWORK = '22C55E';   // green
const COLOR_OUT_NETWORK = 'EF4444';  // red

export function RoutingMap({
  patientHome,
  centers,
  nearestOverall,
  selectedCenterId,
  onSelectCenter,
  height = 360,
}: RoutingMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    id: 'biosure-google-maps',
  });

  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(selectedCenterId ?? null);

  useEffect(() => {
    setActiveMarkerId(selectedCenterId ?? null);
  }, [selectedCenterId]);

  const fallbackCenter = DEFAULT_CENTER_BY_COUNTRY[patientHome.country] ?? DEFAULT_CENTER_BY_COUNTRY.US;

  // All points to fit bounds across.
  const allPoints = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = [
      { lat: patientHome.lat, lng: patientHome.lon },
      ...centers.map((c) => ({ lat: c.lat, lng: c.lon })),
    ];
    if (nearestOverall) pts.push({ lat: nearestOverall.lat, lng: nearestOverall.lon });
    return pts;
  }, [patientHome, centers, nearestOverall]);

  const onMapLoad = (map: google.maps.Map) => {
    if (allPoints.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    allPoints.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-50 border border-dashed border-gray-300 rounded"
      >
        <div className="text-center px-6">
          <p className="text-sm font-medium text-gray-700">Map unavailable</p>
          <p className="text-xs text-gray-500 mt-1">
            Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>frontend/.env</code> and restart vite.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-red-50 border border-red-200 rounded"
      >
        <p className="text-sm text-red-700 px-6">Failed to load Google Maps: {loadError.message}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-gray-50 border border-gray-200 rounded"
      >
        <p className="text-sm text-gray-500">Loading map...</p>
      </div>
    );
  }

  const handleMarkerClick = (centerId: string) => {
    setActiveMarkerId(centerId);
    onSelectCenter?.(centerId);
  };

  const renderInfoWindow = (c: RankedCenter, isNearestAlt: boolean) => (
    <InfoWindowF
      position={{ lat: c.lat, lng: c.lon }}
      onCloseClick={() => setActiveMarkerId(null)}
      options={{ pixelOffset: new google.maps.Size(0, -34) }}
    >
      <div style={{ minWidth: 200, maxWidth: 260, padding: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
          {!isNearestAlt && <span style={{ color: '#2563eb' }}>#{c.rank} </span>}
          {c.name}
        </div>
        <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 4 }}>
          {c.city}, {c.state}
        </div>
        <div style={{ fontSize: 11, color: '#1f2937' }}>
          <strong>{c.distance} {c.distance_unit}</strong>
          {' · '}~{c.drive_hours_estimate}h drive
        </div>
        <div style={{ fontSize: 11, marginTop: 4 }}>
          {c.in_network ? (
            <span style={{ color: '#15803d' }}>✓ In-network</span>
          ) : (
            <span style={{ color: '#b91c1c' }}>✗ Out-of-network</span>
          )}
          {c.on_trial && <span style={{ marginLeft: 8, color: '#1d4ed8' }}>Trial site</span>}
        </div>
        {c.current_wait_weeks !== undefined && (
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            ~{c.current_wait_weeks} week wait
          </div>
        )}
        {isNearestAlt && c.note && (
          <div style={{
            fontSize: 11, color: '#92400e', marginTop: 6,
            padding: 4, background: '#fffbeb', borderRadius: 3,
          }}>
            {c.note}
          </div>
        )}
      </div>
    </InfoWindowF>
  );

  return (
    <div className="relative" style={{ height }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%', borderRadius: 6 }}
        center={{ lat: fallbackCenter.lat, lng: fallbackCenter.lng }}
        zoom={fallbackCenter.zoom}
        onLoad={onMapLoad}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        }}
      >
        {/* Patient home pin */}
        <MarkerF
          position={{ lat: patientHome.lat, lng: patientHome.lon }}
          icon={{ url: PATIENT_PIN_URL, scaledSize: new google.maps.Size(28, 36) }}
          title={`Patient home: ${patientHome.city}, ${patientHome.state}`}
        />

        {/* Top-ranked centers */}
        {centers.map((c) => (
          <MarkerF
            key={c.center_id}
            position={{ lat: c.lat, lng: c.lon }}
            icon={{
              url: pinForRank(c.rank, c.in_network ? COLOR_IN_NETWORK : COLOR_OUT_NETWORK),
              scaledSize: new google.maps.Size(28, 36),
            }}
            title={`#${c.rank} ${c.name}`}
            onClick={() => handleMarkerClick(c.center_id)}
          >
            {activeMarkerId === c.center_id && renderInfoWindow(c, false)}
          </MarkerF>
        ))}

        {/* "Nearest overall" alternative — drawn last so it sits on top */}
        {nearestOverall && (
          <MarkerF
            position={{ lat: nearestOverall.lat, lng: nearestOverall.lon }}
            icon={{ url: NEAREST_ALT_PIN_URL, scaledSize: new google.maps.Size(28, 36) }}
            title={`${nearestOverall.name} (closest geographically — not recommended)`}
            onClick={() => handleMarkerClick(nearestOverall.center_id)}
          >
            {activeMarkerId === nearestOverall.center_id && renderInfoWindow(nearestOverall, true)}
          </MarkerF>
        )}
      </GoogleMap>

      {/* Legend — bottom-right corner so it doesn't collide with InfoWindows
          which typically open above their marker (i.e., toward the top). */}
      <div className="absolute bottom-6 right-2 bg-white/95 backdrop-blur-sm border border-gray-200 rounded shadow px-2.5 py-1.5 text-[11px] space-y-1 z-10 leading-tight">
        <div className="font-semibold text-gray-700 mb-0.5">Legend</div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#7C3AED' }} />
          Patient home
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#22C55E' }} />
          In-network
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#EF4444' }} />
          Out-of-network
        </div>
        {nearestOverall && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: '#F59E0B' }} />
            Closest (not rec.)
          </div>
        )}
      </div>
    </div>
  );
}

export default RoutingMap;
