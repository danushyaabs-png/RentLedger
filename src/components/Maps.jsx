// Maps with Leaflet + OpenStreetMap (free, no API key).

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const INDIA = [20.59, 78.96];

const pin = L.divIcon({
  className: "map-pin",
  html: '<svg viewBox="0 0 24 24" width="34" height="34"><path fill="#D9A12B" stroke="#15263A" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#15263A"/></svg>',
  iconSize: [34, 34],
  iconAnchor: [17, 33],
});

function useLeafletMap(ref, { center, zoom, interactive = true }) {
  const map = useRef(null);
  useEffect(() => {
    if (!ref.current || map.current) return;
    map.current = L.map(ref.current, {
      center,
      zoom,
      scrollWheelZoom: false,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      zoomControl: interactive,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    // Leaflet needs a size recalculation when shown inside a dialog that just opened.
    setTimeout(() => map.current?.invalidateSize(), 150);
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return map;
}

/** Read-only map with a pin. */
export function MapView({ lat, lng, height = 220 }) {
  const ref = useRef(null);
  const map = useLeafletMap(ref, { center: [lat, lng], zoom: 15 });
  useEffect(() => {
    if (!map.current) return;
    const m = L.marker([lat, lng], { icon: pin }).addTo(map.current);
    map.current.setView([lat, lng], 15);
    return () => m.remove();
  }, [lat, lng, map]);
  return <div ref={ref} className="map" style={{ height }} />;
}

/**
 * Pick a location: search an address (OpenStreetMap Nominatim) or click the map to drop a pin.
 * value: { lat, lng } or null.  onChange(value).  onAddress(text) suggests a readable address.
 */
export function LocationPicker({ value, onChange, onAddress }) {
  const ref = useRef(null);
  const map = useLeafletMap(ref, { center: value ? [value.lat, value.lng] : INDIA, zoom: value ? 15 : 4 });
  const marker = useRef(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  // Click on the map to place the pin
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const onClick = (e) => onChange({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) });
    m.on("click", onClick);
    return () => m.off("click", onClick);
  }, [map, onChange]);

  // Keep the marker in sync with the value
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { icon: pin, draggable: true }).addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current.getLatLng();
        onChange({ lat: round(p.lat), lng: round(p.lng) });
      });
    } else {
      marker.current.setLatLng([value.lat, value.lng]);
    }
  }, [value, map, onChange]);

  async function search(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError("");
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&q=${encodeURIComponent(q)}`;
      const list = await fetch(url, { headers: { "Accept-Language": "en" } }).then((r) => r.json());
      setResults(list);
      if (!list.length) setError("No places found. Try a nearby landmark or area name.");
    } catch {
      setError("Map search isn't reachable right now. You can still click the map to drop a pin.");
    } finally {
      setSearching(false);
    }
  }

  function choose(r) {
    const v = { lat: round(Number(r.lat)), lng: round(Number(r.lon)) };
    onChange(v);
    map.current?.setView([v.lat, v.lng], 16);
    setResults(null);
    onAddress?.(shortAddress(r));
  }

  return (
    <div className="picker">
      <div className="picker-search">
        <input
          type="search"
          value={query}
          placeholder="Search an address or area"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search(e)}
          aria-label="Search for a place"
        />
        <button type="button" className="btn btn-ghost" onClick={search} disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </div>
      {results?.length > 0 && (
        <ul className="picker-results">
          {results.map((r) => (
            <li key={r.place_id}>
              <button type="button" onClick={() => choose(r)}>
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="muted small">{error}</p>}
      <div ref={ref} className="map" style={{ height: 240 }} />
      <p className="muted small picker-hint">
        {value ? (
          <>
            Pinned at {value.lat}, {value.lng}. Drag the pin to adjust.{" "}
            <button type="button" className="link-btn" onClick={() => onChange(null)}>
              Remove pin
            </button>
          </>
        ) : (
          "Search above, or click the map to drop a pin on the exact spot."
        )}
      </p>
    </div>
  );
}

const round = (n) => Math.round(n * 1e6) / 1e6;

function shortAddress(r) {
  const a = r.address || {};
  const area = a.suburb || a.neighbourhood || a.village || a.town || a.city_district;
  const city = a.city || a.town || a.county || a.state_district;
  const parts = [area, city !== area ? city : null, a.state].filter(Boolean);
  return parts.length ? parts.join(", ") : r.display_name;
}
