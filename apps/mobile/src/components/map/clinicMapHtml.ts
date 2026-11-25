import type { ClinicRow } from '@bevital/shared';
import { COLORS } from '@bevital/shared';

export interface ClinicMapProps {
  clinics: ClinicRow[];
  selectedId?: string | null;
  onSelect?: (clinicId: string) => void;
  height?: number;
}

/**
 * Self-contained Leaflet + OpenStreetMap page. It is loaded in a WebView on phones and an <iframe> on
 * web, so one implementation serves every platform. Map tiles © OpenStreetMap contributors (attribution
 * is shown on the map). CARTO's free basemap (OSM data) is fine for testing and OSM's own public tile server blocks hosted apps; use a commercial tile provider
 * (or your own) for production traffic.
 *
 * Protocol: the page posts {type:'select', id} when a marker is tapped, and accepts {type:'focus', id}.
 */
export function buildClinicMapHtml(clinics: ClinicRow[], selectedId?: string | null): string {
  const data = clinics
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => ({
      id: c.id,
      name: c.name,
      lat: Number(c.latitude),
      lng: Number(c.longitude),
      address: [c.address_line1, `${c.postcode} ${c.city}`, c.state].filter(Boolean).join(', '),
      phone: c.phone ?? '',
    }));
  // JSON safe to embed inside a <script> tag
  const json = JSON.stringify({ clinics: data, selectedId: selectedId ?? null }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<style>
html,body,#map{height:100%;margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
.leaflet-container{background:${COLORS.surfaceAlt}}
.pin{width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${COLORS.primary};border:3px solid #fff;box-shadow:0 4px 10px rgba(16,38,26,.35);display:flex;align-items:center;justify-content:center;transition:all .2s}
.pin i{width:10px;height:10px;border-radius:50%;background:#fff;display:block}
.pin.on{background:${COLORS.lime};width:42px;height:42px}
.pin.on i{background:${COLORS.ink}}
.leaflet-popup-content-wrapper{border-radius:16px;box-shadow:0 10px 28px rgba(16,38,26,.2)}
.leaflet-popup-content{margin:14px 16px;min-width:190px}
.pop h3{margin:0 0 4px;font-size:15px;color:${COLORS.ink}}
.pop p{margin:2px 0;font-size:13px;color:${COLORS.textMuted};line-height:1.35}
.pop a{display:inline-block;margin-top:8px;margin-right:10px;padding:8px 12px;border-radius:10px;background:${COLORS.primary};color:#fff!important;text-decoration:none;font-size:13px;font-weight:600}
.pop a.alt{background:${COLORS.primaryLight};color:${COLORS.primaryDark}!important}
</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
(function(){
var CFG=${json};
var map=L.map('map',{zoomControl:true,attributionControl:true}).setView([3.139,101.6869],11);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'}).addTo(map);
function post(o){var s=JSON.stringify(o);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}else if(window.parent!==window){window.parent.postMessage(s,'*');}}
function esc(t){return String(t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function icon(on){return L.divIcon({className:'',html:'<div class="pin'+(on?' on':'')+'"><i></i></div>',iconSize:on?[42,42]:[34,34],iconAnchor:on?[21,42]:[17,34],popupAnchor:[0,on?-40:-32]});}
var markers={},bounds=[];
CFG.clinics.forEach(function(c){
  var m=L.marker([c.lat,c.lng],{icon:icon(false),title:c.name,alt:c.name}).addTo(map);
  var dir='https://www.google.com/maps/dir/?api=1&destination='+c.lat+','+c.lng;
  m.bindPopup('<div class="pop"><h3>'+esc(c.name)+'</h3><p>'+esc(c.address)+'</p>'+(c.phone?'<p>'+esc(c.phone)+'</p>':'')+'<a href="'+dir+'" target="_blank" rel="noopener">Directions</a>'+(c.phone?'<a class="alt" href="tel:'+esc(c.phone)+'">Call</a>':'')+'</div>');
  m.on('click',function(){highlight(c.id);post({type:'select',id:c.id});});
  markers[c.id]=m;bounds.push([c.lat,c.lng]);
});
function highlight(id){Object.keys(markers).forEach(function(k){markers[k].setIcon(icon(k===id));});}
window.focusClinic=function(id){var m=markers[id];if(!m)return;highlight(id);map.flyTo(m.getLatLng(),15,{duration:.6});m.openPopup();};
function fit(){map.invalidateSize();if(CFG.selectedId&&markers[CFG.selectedId]){map.setView(markers[CFG.selectedId].getLatLng(),14);}else if(bounds.length>1){map.fitBounds(bounds,{padding:[40,40],maxZoom:14});}else if(bounds.length===1){map.setView(bounds[0],14);}}
fit();setTimeout(fit,150);setTimeout(fit,600);window.addEventListener('load',fit);window.addEventListener('resize',fit);
if(window.ResizeObserver){new ResizeObserver(function(){map.invalidateSize();}).observe(document.getElementById('map'));}
if(CFG.selectedId&&markers[CFG.selectedId]){highlight(CFG.selectedId);}
window.addEventListener('message',function(e){try{var d=typeof e.data==='string'?JSON.parse(e.data):e.data;if(d&&d.type==='focus')window.focusClinic(d.id);}catch(_){}});
})();
</script></body></html>`;
}
