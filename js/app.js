// ── VIEWER LOCATION — detected from browser, falls back to Buenos Aires ──
let MY_COORDS = [-58.3816, -34.6037];
let MY_TZ     = Intl.DateTimeFormat().resolvedOptions().timeZone
                || 'America/Argentina/Buenos_Aires';

// Ask for real location on load
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => {
      MY_COORDS = [pos.coords.longitude, pos.coords.latitude];
      // Refresh any open detail card with updated distance
      if (selectedId && cardMode === 'detail') {
        const p = TEAM.find(x => x.id === selectedId);
        if (p) refreshTime(p);
      }
    },
    () => { /* permission denied — keep Buenos Aires fallback */ }
  );
}

// ── CONFIG — loaded from Vercel Environment Variables via /api/config ──
// No credentials are stored in this file.
let JSONBIN_BIN_ID     = '';
let JSONBIN_MASTER_KEY = '';
let IMGBB_KEY          = '';
let ADMIN_PASSWORD     = '';

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Config fetch failed');
    const cfg = await res.json();
    JSONBIN_BIN_ID     = cfg.jsonbinId     || '';
    JSONBIN_MASTER_KEY = cfg.jsonbinKey    || '';
    IMGBB_KEY          = cfg.imgbbKey      || '';
    ADMIN_PASSWORD     = cfg.adminPassword || '';
    mapboxgl.accessToken = cfg.mapboxToken || '';
  } catch(e) {
    console.warn('Could not load config from /api/config:', e);
  }
}

let TEAM = [
  { id:1,  firstName:'Nico',    name:'Nicolas Muino',    role:'UI Designer',      city:'San Carlos de Bariloche', country:'Argentina',     tz:'America/Argentina/Buenos_Aires', coords:[-71.3103,-41.1335], avatar:'https://i.pravatar.cc/150?img=11', weather:'22° C Partly Cloudy' },
  { id:2,  firstName:'Johanna', name:'Johanna Sequeira', role:'Brand Designer',   city:'Buenos Aires',            country:'Argentina',     tz:'America/Argentina/Buenos_Aires', coords:[-58.3816,-34.6037], avatar:'https://i.pravatar.cc/150?img=47', weather:'19° C Sunny' },
  { id:3,  firstName:'Cami',    name:'Camila Torres',    role:'UX Researcher',    city:'São Paulo',               country:'Brazil',        tz:'America/Sao_Paulo',              coords:[-46.6333,-23.5505], avatar:'https://i.pravatar.cc/150?img=44', weather:'28° C Humid' },
  { id:4,  firstName:'Erin',    name:'Erin Ziebart',     role:'Motion Designer',  city:'Eugene, Oregon',          country:'United States', tz:'America/Los_Angeles',            coords:[-123.0868,44.0521], avatar:'https://i.pravatar.cc/150?img=49', weather:'15° C Cloudy' },
  { id:5,  firstName:'Mike',    name:'Mike Cuesta',      role:'Art Director',     city:'Miami, Florida',          country:'United States', tz:'America/New_York',               coords:[-80.1918,25.7617],  avatar:'https://i.pravatar.cc/150?img=12', weather:'31° C Clear' },
  { id:6,  firstName:'Juan',    name:'Juan Molina',      role:'Senior Designer',  city:'Miami, Florida',          country:'United States', tz:'America/New_York',               coords:[-80.3,25.85],       avatar:'https://i.pravatar.cc/150?img=15', weather:'31° C Clear' },
  { id:7,  firstName:'Dani',    name:'Dani Menendez',    role:'Visual Designer',  city:'Miami, Florida',          country:'United States', tz:'America/New_York',               coords:[-80.25,25.78],      avatar:'https://i.pravatar.cc/150?img=36', weather:'31° C Clear' },
  { id:8,  firstName:'Molly',   name:'Molly Brennan',    role:'Product Designer', city:'New York',                country:'United States', tz:'America/New_York',               coords:[-74.006,40.7128],   avatar:null, initials:'MB', weather:'12° C Overcast' },
  { id:9,  firstName:'Lauren',  name:'Lauren De Leo',    role:'Design Lead',      city:'Copenhagen',              country:'Denmark',       tz:'Europe/Copenhagen',              coords:[12.5683,55.6761],   avatar:'https://i.pravatar.cc/150?img=25', weather:'8° C Windy' },
  { id:10, firstName:'Liz',     name:'Liz Hixon',        role:'Visual Designer',  city:'Beirut',                  country:'Lebanon',       tz:'Asia/Beirut',                    coords:[35.5018,33.8938],   avatar:'https://i.pravatar.cc/150?img=32', weather:'24° C Clear' },
];

let selectedId = null, compareId = null, cardMode = null;
let useFahr = false, useKm = true;
let avMarkers = {}, clustMkrs = [], hasCmpLine = false, timerId = null;

// ── MAP ──
// ── STARTUP — config must load before map init ──
let map;
let shiftHeld = false;
document.addEventListener('keydown', e => { if (e.key === 'Shift') shiftHeld = true; });
document.addEventListener('keyup',   e => { if (e.key === 'Shift') shiftHeld = false; });

let mapLoaded = false;

(async () => {
  await loadConfig();
  await loadTeam(); // fetch team from JSONBin after config is ready

  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/klausabio/cmmza8gte00cy01s671x4b1nr',
    center: [10, 25], zoom: 1.8,
    minZoom: 1.2, maxZoom: 14,
    projection: 'mercator',
    boxZoom: false,
    config: {
      basemap: {
        theme: 'monochrome',
        lightPreset: 'day',
        font: 'Inter',
        colorLand: '#f2f2f2',
        colorWater: '#d9d9d9',
        colorPlaceLabels: '#aaaaaa',
        colorAdminBoundaries: '#cccccc',
        showPlaceLabels: true,
        showAdminBoundaries: true,
        showRoadLabels: false,
        showTransitLabels: false,
        showPointOfInterestLabels: false,
        densityPointOfInterestLabels: 0
      }
    }
  });

  map.on('load', () => {
    mapLoaded = true;
    initMarkers();
    updateClusters();

    map.on('click', e => {
      if (e.originalEvent.target === map.getCanvas() && cardMode === 'compare') closeCard();
    });

    map.on('zoomend', () => {
      lastClusterKey = '';
      updateClusters();
    });
  });
})();

// ── MARKERS ──

function initMarkers() {
  TEAM.forEach(p => mkAvatar(p));
}

function mkAvatar(p) {
  const el = document.createElement('div');
  el.className = 'av-marker';
  const inner = p.avatar
    ? `<img src="${p.avatar}" alt="${p.firstName}" loading="lazy">`
    : `<div class="av-initials">${p.initials}</div>`;
  el.innerHTML = `<div class="av-wrap">${inner}</div><div class="av-name">${p.firstName}</div>`;
  el.addEventListener('click', e => {
    e.stopPropagation();
    shiftHeld && selectedId && selectedId !== p.id
      ? triggerCompare(p.id) : selectPerson(p.id);
  });
  const marker = new mapboxgl.Marker({ element: el, anchor: 'top', offset: [0, -44] })
    .setLngLat(p.coords).addTo(map);
  avMarkers[p.id] = { marker, el };
}

let lastClusterKey = '';

function clusterKey(groups) {
  return groups.map(g => g.map(p => p.id).sort().join(',')).sort().join('|');
}

function updateClusters() {
  const zoom = map.getZoom();
  const groups = cluster(TEAM, zoom);
  const key = clusterKey(groups);
  if (key === lastClusterKey) return;
  lastClusterKey = key;

  const clusteredIds = new Set();
  groups.forEach(g => { if (g.length > 1) g.forEach(p => clusteredIds.add(p.id)); });

  // Remove old cluster bubbles
  clustMkrs.forEach(m => m.remove());
  clustMkrs = [];

  // Show/hide avatars
  TEAM.forEach(p => {
    const el = avMarkers[p.id]?.el;
    if (!el) return;
    el.style.display = clusteredIds.has(p.id) ? 'none' : 'flex';
  });

  // Create new cluster bubbles
  groups.forEach(g => { if (g.length > 1) mkCluster(g); });

  if (selectedId && avMarkers[selectedId]) avMarkers[selectedId].el.classList.add('selected');
  if (compareId  && avMarkers[compareId])  avMarkers[compareId].el.classList.add('selected');

  spreadOverlapping();
}

// Spread overlapping markers into a filled circle (concentric rings)
function spreadOverlapping() {
  const visible = TEAM.filter(p => {
    const el = avMarkers[p.id]?.el;
    return el && el.style.display !== 'none';
  });

  // Reset all to true coords first
  visible.forEach(p => {
    avMarkers[p.id].marker.setLngLat(p.coords);
  });

  const PIXEL_THRESHOLD = 20;
  const used = new Set();
  const overlapGroups = [];

  visible.forEach(p => {
    if (used.has(p.id)) return;
    const pxP = map.project(p.coords);
    const group = [p];
    used.add(p.id);
    visible.forEach(q => {
      if (p.id === q.id || used.has(q.id)) return;
      const pxQ = map.project(q.coords);
      if (Math.hypot(pxP.x - pxQ.x, pxP.y - pxQ.y) < PIXEL_THRESHOLD) {
        group.push(q);
        used.add(q.id);
      }
    });
    if (group.length > 1) overlapGroups.push(group);
  });

  overlapGroups.forEach(group => {
    const n = group.length;
    const pixels = group.map(p => map.project(p.coords));
    const cx = pixels.reduce((s, px) => s + px.x, 0) / n;
    const cy = pixels.reduce((s, px) => s + px.y, 0) / n;

    // Build concentric ring slots — ring 0 = center (1 slot),
    // ring 1 = 6 slots at radius 54px, ring 2 = 10 slots at radius 100px
    const rings = [
      { count: 1,  radius: 0  },
      { count: 6,  radius: 54 },
      { count: 10, radius: 100 },
    ];

    const positions = [];
    for (const ring of rings) {
      if (ring.radius === 0) {
        positions.push({ x: cx, y: cy });
      } else {
        for (let i = 0; i < ring.count; i++) {
          // Slight angle offset per ring so slots don't stack radially
          const offset = ring.count === 6 ? Math.PI / 6 : Math.PI / 10;
          const angle = (2 * Math.PI / ring.count) * i + offset;
          positions.push({
            x: cx + Math.cos(angle) * ring.radius,
            y: cy + Math.sin(angle) * ring.radius
          });
        }
      }
      if (positions.length >= n) break;
    }

    group.forEach((p, i) => {
      const pos = positions[i] || positions[positions.length - 1];
      const newLngLat = map.unproject([pos.x, pos.y]);
      avMarkers[p.id].marker.setLngLat([newLngLat.lng, newLngLat.lat]);
    });
  });
}

function mkCluster(group) {
  const el = document.createElement('div');
  el.className = 'clust';
  el.textContent = group.length;
  el.addEventListener('click', e => {
    e.stopPropagation();
    const b = new mapboxgl.LngLatBounds();
    group.forEach(p => b.extend(p.coords));
    map.fitBounds(b, { padding: 140, maxZoom: 11, duration: 700 });
  });
  const lng = group.reduce((s, p) => s + p.coords[0], 0) / group.length;
  const lat = group.reduce((s, p) => s + p.coords[1], 0) / group.length;
  const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lng, lat]).addTo(map);
  clustMkrs.push(m);
}

function cluster(team, zoom) {
  // At high zoom always show everyone individually
  if (zoom >= 10) return team.map(p => [p]);

  const PIXEL_THRESH = 50;
  const used = new Set(), groups = [];

  team.forEach((p, i) => {
    if (used.has(i)) return;
    const pxP = map.project(p.coords);
    const g = [p]; used.add(i);
    team.forEach((q, j) => {
      if (i === j || used.has(j)) return;
      const pxQ = map.project(q.coords);
      if (Math.hypot(pxP.x - pxQ.x, pxP.y - pxQ.y) < PIXEL_THRESH) {
        g.push(q); used.add(j);
      }
    });
    groups.push(g);
  });
  return groups;
}

// ── SELECTION ──
function selectPerson(id) {
  if (selectedId && avMarkers[selectedId]) avMarkers[selectedId].el.classList.remove('selected');
  if (compareId  && avMarkers[compareId])  avMarkers[compareId].el.classList.remove('selected');
  if (hasCmpLine) removeCmpLine();
  selectedId = id; compareId = null;
  if (avMarkers[id]) avMarkers[id].el.classList.add('selected');
  const p = TEAM.find(x => x.id === id); if (!p) return;
  showDetail(p);
  map.flyTo({ center: p.coords, zoom: Math.max(map.getZoom(), 2.8), duration: 700 });
  syncListActive(id);
}

function triggerCompare(id2) {
  compareId = id2;
  if (avMarkers[id2]) avMarkers[id2].el.classList.add('selected');
  const p1 = TEAM.find(x => x.id === selectedId), p2 = TEAM.find(x => x.id === id2);
  if (!p1 || !p2) return;
  showCompare(p1, p2); drawCmpLine(p1, p2);
  const b = new mapboxgl.LngLatBounds(); b.extend(p1.coords); b.extend(p2.coords);
  map.fitBounds(b, { padding: 200, maxZoom: 9, duration: 800 });
}

// ── WEATHER ──
// WMO weather code → human readable label (official WMO 4677 codes)
function wmoLabel(code) {
  const codes = {
    0: 'Clear Sky',
    1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Icy Fog',
    51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
    56: 'Freezing Drizzle', 57: 'Heavy Freezing Drizzle',
    61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
    66: 'Freezing Rain', 67: 'Heavy Freezing Rain',
    71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
    85: 'Snow Showers', 86: 'Heavy Snow Showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with Hail', 99: 'Heavy Thunderstorm'
  };
  return codes[code] || 'Cloudy';
}

async function fetchWeather(coords) {
  const [lng, lat] = coords;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode&temperature_unit=celsius&timezone=auto`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const label = wmoLabel(data.current.weathercode);
    return { tempC: temp, label };
  } catch(e) {
    return null;
  }
}

function fmtWeatherData(data) {
  if (!data) return '—';
  const temp = useFahr
    ? `${Math.round(data.tempC * 9/5 + 32)}° F`
    : `${data.tempC}° C`;
  return `${temp} ${data.label}`;
}

// ── CARDS ──
function showDetail(p) {
  cardMode = 'detail';
  document.getElementById('card-detail').style.display = 'block';
  document.getElementById('card-compare').style.display = 'none';
  document.getElementById('card-list').style.display = 'none';
  document.getElementById('card').classList.add('visible');
  const fb = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=444&color=fff&size=128`;
  document.getElementById('d-av').src = p.avatar || fb;
  document.getElementById('d-name').textContent = p.name;
  document.getElementById('d-role').textContent = p.role;
  document.getElementById('d-location').textContent = `${p.city}, ${p.country}`;

  // Birthday
  const birthdayEl  = document.getElementById('d-birthday');
  const birthdayTxt = document.getElementById('d-birthday-text');
  const birthdaySoon = document.getElementById('d-birthday-soon');
  if (p.birthday) {
    const [yyyy, mm, dd] = p.birthday.split('-').map(Number);
    const formatted = new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    birthdayTxt.textContent = formatted;
    const today = new Date();
    const thisYear = today.getFullYear();
    let next = new Date(thisYear, mm - 1, dd);
    if (next < today) next = new Date(thisYear + 1, mm - 1, dd);
    const daysUntil = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
    birthdaySoon.style.display = daysUntil <= 30 ? 'inline-flex' : 'none';
    birthdayEl.classList.add('visible');
  } else {
    birthdayEl.classList.remove('visible');
  }

  // Show loading while fetching weather
  document.getElementById('d-weather').textContent = 'Loading…';
  fetchWeather(p.coords).then(data => {
    p._weather = data; // cache on person object
    if (selectedId === p.id) {
      document.getElementById('d-weather').textContent = fmtWeatherData(data);
    }
  });

  refreshTime(p);
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => refreshTime(p), 15000);
}

function refreshTime(p) {
  const now = new Date();
  document.getElementById('d-time').textContent = new Intl.DateTimeFormat('en-US', { timeZone: p.tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
  const diff = tzDiff(MY_TZ, p.tz);
  document.getElementById('d-diff').textContent = diff === 0 ? 'Same time zone' : diff > 0 ? `+${diff}h from you` : `${diff}h from you`;
  document.getElementById('d-dist').textContent = fmtDist(haversine(MY_COORDS, p.coords));

  // Local hour and day in person's timezone
  const localHour    = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: p.tz, hour: 'numeric', hour12: false }).format(now));
  const localWeekday = new Intl.DateTimeFormat('en-US', { timeZone: p.tz, weekday: 'short' }).format(now);
  const isWeekend    = localWeekday === 'Sat' || localWeekday === 'Sun';
  const statusEl = document.getElementById('d-status');

  if (isWeekend) {
    statusEl.className = 'd-status weekend';
    statusEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>Weekend`;
  } else if (localHour >= 9 && localHour < 18) {
    statusEl.className = 'd-status working';
    statusEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>Working hours`;
  } else if (localHour >= 18 && localHour < 23) {
    statusEl.className = 'd-status after';
    statusEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8"/><path d="M12 11v11"/><path d="M17 3H7l5 8z"/></svg>After hours`;
  } else {
    statusEl.className = 'd-status sleeping';
    statusEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Sleeping`;
  }
}

function showCompare(p1, p2) {
  cardMode = 'compare';
  document.getElementById('card-detail').style.display = 'none';
  document.getElementById('card-compare').style.display = 'block';
  document.getElementById('card-list').style.display = 'none';
  document.getElementById('card').classList.add('visible');
  const fb = p => `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=444&color=fff&size=128`;
  document.getElementById('c-av1').src = p1.avatar || fb(p1);
  document.getElementById('c-av2').src = p2.avatar || fb(p2);
  document.getElementById('c-n1').textContent = p1.firstName;
  document.getElementById('c-n2').textContent = p2.firstName;
  document.getElementById('c-c1').textContent = p1.city;
  document.getElementById('c-c2').textContent = p2.city;
  document.getElementById('c-dist').textContent = fmtDist(haversine(p1.coords, p2.coords));
  const diff = tzDiff(p1.tz, p2.tz);
  document.getElementById('c-tdiff').textContent = diff === 0 ? 'Same time zone' : diff > 0 ? `+${diff}h` : `${diff}h`;
  document.getElementById('c-overlap').textContent = `${Math.max(0, 8 - Math.abs(diff))}h overlap`;
}

function showList() {
  cardMode = 'list';
  document.getElementById('card-detail').style.display = 'none';
  document.getElementById('card-compare').style.display = 'none';
  document.getElementById('card-list').style.display = 'block';
  document.getElementById('card').classList.add('visible');
  document.getElementById('lst-sub').textContent = `${TEAM.length} people across the globe`;
  const el = document.getElementById('t-list');
  el.innerHTML = '';
  TEAM.forEach(p => {
    const row = document.createElement('div');
    row.className = 't-row' + (selectedId === p.id ? ' active' : '');
    row.dataset.id = p.id;
    const fb = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=444&color=fff&size=96`;
    row.innerHTML = `
      <img class="t-av" src="${p.avatar || fb}" alt="${p.name}" loading="lazy">
      <div class="t-info">
        <div class="t-name">${p.name}</div>
        <div class="t-loc">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${p.city}, ${p.country}
        </div>
      </div>`;
    row.addEventListener('mouseenter', () => {
      const m = avMarkers[p.id];
      if (m) { m.el.classList.add('pulse'); setTimeout(() => m.el.classList.remove('pulse'), 700); }
    });
    row.addEventListener('click', () => { closeCard(); setTimeout(() => selectPerson(p.id), 80); });
    el.appendChild(row);
  });
}

function syncListActive(id) {
  document.querySelectorAll('.t-row').forEach(r => r.classList.toggle('active', +r.dataset.id === id));
}

function closeCard() {
  const card = document.getElementById('card');
  card.classList.remove('visible');
  card.style.left = ''; card.style.top = ''; // reset drag position
  if (selectedId && avMarkers[selectedId]) avMarkers[selectedId].el.classList.remove('selected');
  if (compareId  && avMarkers[compareId])  avMarkers[compareId].el.classList.remove('selected');
  if (hasCmpLine) removeCmpLine();
  if (timerId) { clearInterval(timerId); timerId = null; }
  selectedId = compareId = cardMode = null;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-home').classList.add('active');
  resetMapView();
}

// ── COMPARE LINE ──
let cmpPeople = null;

function drawCmpLine(p1, p2) {
  removeCmpLine();
  cmpPeople = [p1, p2];
  _renderCmpLine();
  map.on('move', _renderCmpLine);
}

function _renderCmpLine() {
  if (!cmpPeople) return;
  const [p1, p2] = cmpPeople;

  // Recalculate avatar centers at current zoom every time
  const offset = 25; // px from coord to avatar vertical center
  const toGeo = (coords) => {
    const px = map.project(coords);
    const pt = map.unproject([px.x, px.y - offset]);
    return [pt.lng, pt.lat];
  };

  const start = toGeo(p1.coords);
  const end   = toGeo(p2.coords);
  const dLng  = end[0] - start[0];
  const dLat  = end[1] - start[1];
  const dist  = Math.hypot(dLng, dLat);
  const steps = 80;
  const lineCoords = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    lineCoords.push([
      start[0] + dLng * t,
      start[1] + dLat * t + Math.sin(Math.PI * t) * dist * 0.1
    ]);
  }

  const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords } };

  if (map.getSource('cl')) {
    map.getSource('cl').setData(geojson);
  } else {
    map.addSource('cl', { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'cl', type: 'line', source: 'cl',
      paint: { 'line-color': '#008BFF', 'line-width': 2, 'line-dasharray': [4, 5], 'line-opacity': 0.85 }
    });
  }
  hasCmpLine = true;
}

function removeCmpLine() {
  map.off('move', _renderCmpLine);
  cmpPeople = null;
  if (map.getLayer('cl')) map.removeLayer('cl');
  if (map.getSource('cl')) map.removeSource('cl');
  hasCmpLine = false;
}

// ── NAV ──
function navClick(section) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + section)?.classList.add('active');
  if (section === 'team') showList();
  else if (section === 'home') {
    if (cardMode) closeCard();
    clearSearch();
    resetMapView();
  }
}

function resetMapView() {
  map.flyTo({ center: [10, 25], zoom: 1.8, duration: 900 });
}

// ── SEARCH ──
function handleSearch(v) {
  const wrap = document.getElementById('search-wrap');
  wrap.classList.toggle('has-value', v.length > 0);
  const q = v.trim().toLowerCase(); if (!q) return;
  const m = TEAM.find(p =>
    p.name.toLowerCase().includes(q) ||
    p.city.toLowerCase().includes(q) ||
    p.country.toLowerCase().includes(q)
  );
  if (m) selectPerson(m.id);
}

function clearSearch() {
  const input = document.getElementById('search');
  input.value = '';
  document.getElementById('search-wrap').classList.remove('has-value');
  if (cardMode) closeCard();
  resetMapView();
}

// ── UNITS ──
function toggleTemp() {
  useFahr = !useFahr;
  document.getElementById('tog-temp').classList.toggle('right', useFahr);
  if (selectedId && cardMode === 'detail') {
    const p = TEAM.find(x => x.id === selectedId);
    if (p && p._weather) {
      document.getElementById('d-weather').textContent = fmtWeatherData(p._weather);
    }
  }
}
function toggleDist() {
  useKm = !useKm;
  document.getElementById('tog-dist').classList.toggle('right', !useKm);
  if (selectedId) {
    const p = TEAM.find(x=>x.id===selectedId), p2 = compareId ? TEAM.find(x=>x.id===compareId) : null;
    if (p && cardMode==='detail')   document.getElementById('d-dist').textContent  = fmtDist(haversine(MY_COORDS, p.coords));
    if (p && p2 && cardMode==='compare') document.getElementById('c-dist').textContent = fmtDist(haversine(p.coords, p2.coords));
  }
}

// ── UTILS ──
function haversine([lo1,la1],[lo2,la2]) {
  const R=6371,r=Math.PI/180,dLa=(la2-la1)*r,dLo=(lo2-lo1)*r;
  const a=Math.sin(dLa/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function fmtDist(km) { return useKm ? `${Math.round(km).toLocaleString()} km away` : `${Math.round(km*0.621371).toLocaleString()} mi away`; }
function tzDiff(tz1,tz2) {
  const off=tz=>{const s=new Intl.DateTimeFormat('en-US',{timeZone:tz,timeZoneName:'shortOffset'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value||'GMT+0';const m=s.match(/GMT([+-])(\d+)(?::(\d+))?/);if(!m)return 0;return(m[1]==='+'?1:-1)*(+m[2]+(+m[3]||0)/60);};
  return Math.round(off(tz2)-off(tz1));
}
function fmtWeather(s) { return useFahr ? s.replace(/(\d+)°\s*C/,(_,c)=>`${Math.round(+c*9/5+32)}° F`) : s; }

// ── SETTINGS ──
function setFont(font) {
  // Set the base font family — CSS font-weight values (400, 500, 600, 700)
  // are shared between Geist and Geist Mono, so weights map automatically.
  // We just swap the family name; the browser picks the right weight variant.
  document.documentElement.style.setProperty('--app-font', `'${font}'`);
  document.getElementById('font-geist').classList.toggle('active', font === 'Geist');
  document.getElementById('font-mono').classList.toggle('active', font === 'Geist Mono');
}
function openSettings() {
  document.getElementById('settings-overlay').classList.add('visible');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-settings').classList.add('active');
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('visible');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-home').classList.add('active');
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('settings-overlay')) closeSettings();
}

function logoHover() {
  const digits = [0,1,3,4,5,6,7,8,9];
  const d = digits[Math.floor(Math.random() * digits.length)];
  document.getElementById('logo-2-text').textContent = d;
}
function logoReset() {
  document.getElementById('logo-2-text').textContent = '2';
}

// ── DRAG ──
(function() {
  const card = document.getElementById('card');
  let dragging = false, startX, startY, origLeft, origTop;

  card.addEventListener('mousedown', e => {
    // Don't drag if clicking a button, input or interactive element
    if (e.target.closest('button, input, a, .tog, .av-marker')) return;
    dragging = true;
    card.classList.add('dragging');
    const rect = card.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    origLeft = rect.left; origTop = rect.top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    card.style.left = (origLeft + dx) + 'px';
    card.style.top  = (origTop  + dy) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
  });
})();

// ── SCROLLBAR — show on scroll, hide after idle ──
(function() {
  const list = document.getElementById('t-list');
  if (!list) return;
  let hideTimer;
  list.addEventListener('scroll', () => {
    list.classList.add('scrolling');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => list.classList.remove('scrolling'), 1000);
  });
})();
function openInfo() {
  document.getElementById('info-overlay').classList.add('visible');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-info').classList.add('active');
}
function closeInfo() {
  document.getElementById('info-overlay').classList.remove('visible');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-home').classList.add('active');
}
function handleInfoOverlayClick(e) {
  if (e.target === document.getElementById('info-overlay')) closeInfo();
}
// ── JSONBIN: LOAD & SAVE ──

async function loadTeam() {
  if (!JSONBIN_BIN_ID) return;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_MASTER_KEY, 'X-Bin-Meta': 'false' }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) {
      TEAM.length = 0;
      data.forEach(m => TEAM.push(m));
      if (mapLoaded) rebuildMapMarkers();
    }
  } catch(e) { console.warn('JSONBin load failed, using defaults:', e); }
}

async function saveTeam() {
  if (!JSONBIN_BIN_ID) {
    showMgrSaving('⚠️ JSONBin not configured — changes only visible to you.');
    setTimeout(() => hideMgrSaving(), 3000);
    return;
  }
  showMgrSaving('Saving…');
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(TEAM)
    });
    if (!res.ok) throw new Error(res.status);
    showMgrSaving('✓ Saved');
    setTimeout(() => hideMgrSaving(), 1500);
  } catch(e) {
    showMgrSaving('Save failed — check your JSONBin config.');
    setTimeout(() => hideMgrSaving(), 3000);
  }
}

function showMgrSaving(msg) {
  const el = document.getElementById('mgr-saving');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideMgrSaving() {
  document.getElementById('mgr-saving').style.display = 'none';
}

// ── GEOCODING ──

async function geocode(city) {
  const q = encodeURIComponent(city);
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' } }
  );
  const data = await res.json();
  if (!data.length) return null;

  const r = data[0];
  const coords = [parseFloat(r.lon), parseFloat(r.lat)];
  const country = r.address?.country || '';

  // Get timezone from timeapi.io using the coordinates
  let tz = 'America/New_York';
  try {
    const tzRes = await fetch(
      `https://timeapi.io/api/timezone/coordinate?latitude=${coords[1]}&longitude=${coords[0]}`
    );
    if (tzRes.ok) {
      const tzData = await tzRes.json();
      if (tzData.timeZone) tz = tzData.timeZone;
    }
  } catch(e) { /* fallback to default */ }

  return { coords, country, tz };
}

// ── TEAM MANAGER UI ──

function openManageTeam() {
  closeSettings();
  document.getElementById('pwd-input').value = '';
  document.getElementById('pwd-input').classList.remove('error');
  document.getElementById('pwd-error').style.display = 'none';
  document.getElementById('pwd-overlay').classList.add('visible');
  setTimeout(() => document.getElementById('pwd-input').focus(), 100);
}

function closePwdModal() {
  document.getElementById('pwd-overlay').classList.remove('visible');
}

function handlePwdOverlayClick(e) {
  if (e.target === document.getElementById('pwd-overlay')) closePwdModal();
}

function checkPassword() {
  const val = document.getElementById('pwd-input').value;
  if (val === ADMIN_PASSWORD) {
    closePwdModal();
    openMgr();
  } else {
    document.getElementById('pwd-input').classList.add('error');
    document.getElementById('pwd-error').style.display = 'block';
    document.getElementById('pwd-input').select();
  }
}

function openMgr() {
  renderMgrList();
  document.getElementById('mgr-overlay').classList.add('visible');
}

function closeMgr() {
  document.getElementById('mgr-overlay').classList.remove('visible');
}

function handleMgrOverlayClick(e) {
  if (e.target === document.getElementById('mgr-overlay')) closeMgr();
}

function renderMgrList() {
  const list = document.getElementById('mgr-list');
  list.innerHTML = '';
  TEAM.forEach(p => {
    const row = document.createElement('div');
    row.className = 'mgr-member';
    const avatarEl = p.avatar
      ? `<img class="mgr-av" src="${p.avatar}" alt="${p.firstName}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="mgr-av-initials" style="display:none">${getInitials(p.name)}</div>`
      : `<div class="mgr-av-initials">${p.initials || getInitials(p.name)}</div>`;
    row.innerHTML = `
      ${avatarEl}
      <div class="mgr-info">
        <div class="mgr-name">${p.name}</div>
        <div class="mgr-sub">${p.role} · ${p.city}, ${p.country}</div>
      </div>
      <div class="mgr-actions">
        <button class="mgr-btn" title="Edit" onclick="openEditForm(${p.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="mgr-btn del" title="Delete" onclick="deleteMember(${p.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;
    list.appendChild(row);
  });
}

async function deleteMember(id) {
  if (!confirm('Delete this team member?')) return;
  const idx = TEAM.findIndex(p => p.id === id);
  if (idx === -1) return;
  TEAM.splice(idx, 1);
  renderMgrList();
  rebuildMapMarkers();
  if (selectedId === id) closeCard();
  await saveTeam();
}

// ── MEMBER FORM ──

function openAddForm() {
  document.getElementById('form-title').textContent = 'Add Team Member';
  document.getElementById('form-member-id').value = '';
  document.getElementById('fi-firstname').value = '';
  document.getElementById('fi-lastname').value = '';
  document.getElementById('fi-role').value = '';
  document.getElementById('fi-city').value = '';
  document.getElementById('fi-birthday').value = '';
  document.getElementById('fi-avatar').value = '';
  document.getElementById('fi-avatar-file').value = '';
  document.getElementById('geo-status').textContent = '';
  document.getElementById('form-save-btn').disabled = false;
  setAvatarPreview(null, '?');
  document.getElementById('form-overlay').classList.add('visible');
  setTimeout(() => document.getElementById('fi-firstname').focus(), 100);
}

function openEditForm(id) {
  const p = TEAM.find(x => x.id === id);
  if (!p) return;
  document.getElementById('form-title').textContent = 'Edit Team Member';
  document.getElementById('form-member-id').value = id;
  const parts = p.name.split(' ');
  document.getElementById('fi-firstname').value = p.firstName || parts[0] || '';
  document.getElementById('fi-lastname').value = parts.slice(1).join(' ') || '';
  document.getElementById('fi-role').value = p.role || '';
  document.getElementById('fi-city').value = p.city || '';
  document.getElementById('fi-birthday').value = p.birthday || '';
  document.getElementById('fi-avatar').value = p.avatar || '';
  document.getElementById('fi-avatar-file').value = '';
  document.getElementById('geo-status').innerHTML = p.country ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${p.city}, ${p.country} · ${p.tz}` : '';
  document.getElementById('form-save-btn').disabled = false;
  const initials = p.initials || getInitials(p.name);
  setAvatarPreview(p.avatar || null, initials);
  document.getElementById('form-overlay').classList.add('visible');
}

function closeForm() {
  document.getElementById('form-overlay').classList.remove('visible');
}

function handleFormOverlayClick(e) {
  if (e.target === document.getElementById('form-overlay')) closeForm();
}

function resetGeoStatus() {
  document.getElementById('geo-status').textContent = '';
}

async function saveMember() {
  const firstName = document.getElementById('fi-firstname').value.trim();
  const lastName  = document.getElementById('fi-lastname').value.trim();
  const role      = document.getElementById('fi-role').value.trim();
  const city      = document.getElementById('fi-city').value.trim();
  const avatar    = document.getElementById('fi-avatar').value.trim() || null;
  const birthday  = document.getElementById('fi-birthday').value || null;
  const editId    = document.getElementById('form-member-id').value;

  if (!firstName || !city || !role) {
    alert('Please fill in First Name, Job Title, and City.');
    return;
  }

  const fullName = lastName ? `${firstName} ${lastName}` : firstName;
  const btn = document.getElementById('form-save-btn');
  btn.disabled = true;
  btn.textContent = 'Locating…';

  const geoEl = document.getElementById('geo-status');

  // Only re-geocode if city changed (or it's a new member)
  const existing = editId ? TEAM.find(p => p.id === parseInt(editId)) : null;
  const cityChanged = !existing || existing.city !== city;

  let coords, country, tz;

  if (cityChanged) {
    geoEl.textContent = '🔍 Looking up location…';
    try {
      const result = await geocode(city);
      if (!result) {
        geoEl.textContent = '⚠️ City not found — check the spelling and try again.';
        btn.disabled = false; btn.textContent = 'Save Member'; return;
      }
      coords  = result.coords;
      country = result.country;
      tz      = result.tz;
      geoEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${city}, ${country} · ${tz}`;
    } catch(e) {
      geoEl.textContent = '⚠️ Lookup failed — check your connection.';
      btn.disabled = false; btn.textContent = 'Save Member'; return;
    }
  } else {
    coords  = existing.coords;
    country = existing.country;
    tz      = existing.tz;
  }

  btn.textContent = 'Saving…';

  if (editId) {
    const idx = TEAM.findIndex(p => p.id === parseInt(editId));
    if (idx !== -1) {
      TEAM[idx] = {
        ...TEAM[idx],
        firstName, name: fullName, role, city, country, tz, coords,
        avatar, birthday, initials: avatar ? undefined : getInitials(fullName)
      };
    }
  } else {
    const newId = TEAM.length ? Math.max(...TEAM.map(p => p.id)) + 1 : 1;
    TEAM.push({
      id: newId, firstName, name: fullName, role, city, country, tz,
      coords, avatar, birthday, initials: avatar ? undefined : getInitials(fullName)
    });
  }

  closeForm();
  renderMgrList();
  rebuildMapMarkers();
  await saveTeam();

  btn.disabled = false;
  btn.textContent = 'Save Member';
}

// ── MAP REBUILD ──

function rebuildMapMarkers() {
  // Close any open card if its person was affected
  closeCard();

  // Remove all existing markers from the map
  Object.values(avMarkers).forEach(({ marker }) => marker.remove());
  avMarkers = {};
  clustMkrs.forEach(m => m.remove());
  clustMkrs = [];
  lastClusterKey = '';

  // Recreate
  initMarkers();
  updateClusters();
}

// ── AVATAR UPLOAD ──

function setAvatarPreview(url, fallbackText) {
  const preview = document.getElementById('av-preview');
  const removeBtn = document.getElementById('av-remove-btn');
  if (url) {
    preview.innerHTML = `<img src="${url}" alt="avatar">`;
    removeBtn.style.display = 'block';
  } else {
    preview.innerHTML = fallbackText || '?';
    removeBtn.style.display = 'none';
  }
}

function removeAvatar() {
  document.getElementById('fi-avatar').value = '';
  document.getElementById('fi-avatar-file').value = '';
  document.getElementById('av-upload-status').textContent = '';
  const fn = document.getElementById('fi-firstname').value.trim();
  const ln = document.getElementById('fi-lastname').value.trim();
  const initials = getInitials(fn + (ln ? ' ' + ln : '')) || '?';
  setAvatarPreview(null, initials);
}

async function handleAvatarFile(input) {
  const file = input.files[0];
  if (!file) return;

  // Show local preview immediately
  const localUrl = URL.createObjectURL(file);
  setAvatarPreview(localUrl, '?');

  const statusEl = document.getElementById('av-upload-status');
  statusEl.textContent = 'Uploading…';

  try {
    const base64 = await fileToBase64(file);
    const fd = new FormData();
    fd.append('image', base64.split(',')[1]); // strip data:...;base64,

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
      method: 'POST', body: fd
    });
    const data = await res.json();

    if (data.success) {
      const url = data.data.url;
      document.getElementById('fi-avatar').value = url;
      setAvatarPreview(url, '?');
      statusEl.textContent = '✓ Uploaded';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } else {
      throw new Error('Upload failed');
    }
  } catch(e) {
    statusEl.textContent = '⚠️ Upload failed — try again.';
    document.getElementById('fi-avatar').value = '';
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}



function getInitials(name) {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');
}