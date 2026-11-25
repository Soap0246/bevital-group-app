"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export interface MapClinic {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  active: boolean;
}

/** Interactive Leaflet + OpenStreetMap map of all clinics (© OpenStreetMap contributors). */
export function ClinicsMap({ clinics, height = 360 }: { clinics: MapClinic[]; height?: number }) {
  const el = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView([3.139, 101.6869], 11);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const bounds: Array<[number, number]> = [];
      for (const c of clinics) {
        const color = c.active ? "var(--bv-primary)" : "var(--bv-text-subtle)";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #fff;box-shadow:0 4px 10px rgba(16,38,26,.35);display:flex;align-items:center;justify-content:center"><i style="width:10px;height:10px;border-radius:50%;background:#fff;display:block"></i></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 34],
          popupAnchor: [0, -32],
        });
        L.marker([c.lat, c.lng], { icon, title: c.name, alt: c.name })
          .addTo(map)
          .bindPopup(
            `<strong>${esc(c.name)}</strong><br/>${esc(c.address)}${c.phone ? `<br/>${esc(c.phone)}` : ""}<br/><a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank" rel="noopener noreferrer">Directions</a>${c.active ? "" : "<br/><em>Inactive</em>"}`,
          );
        bounds.push([c.lat, c.lng]);
      }
      const fit = () => {
        map?.invalidateSize();
        if (bounds.length > 1) map?.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        else if (bounds.length === 1) map?.setView(bounds[0], 14);
      };
      fit();
      setTimeout(fit, 200);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [clinics]);

  return <div ref={el} role="region" aria-label="Map of BeVital clinics" style={{ height }} className="z-0 w-full overflow-hidden rounded-2xl border border-line" />;
}
