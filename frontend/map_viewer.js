const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");

let ways = [];  // zostaw dla kompatybilności wstecznej
let roads = [];  // drogi
let railways = {
  rail: [],     // zwykłe koleje
  tram: [],     // tramwaje
  subway: []    // metro
};
let regularWays = []; // pozostałe ścieżki

let nodes = {};
let bounds;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let lastX, lastY;
let isAnimationScheduled = false;

let waterAreas = [];  // Tablica na obszary wodne
let waterRelations = []; // Tablica na relacje wody
let waterWays = new Map(); // Mapa do przechowywania water ways przed przetworzeniem ich do relations

function resizeCanvas() {
  const padding = 40; // 20px padding z każdej strony
  const availableWidth = window.innerWidth - padding;
  const availableHeight = window.innerHeight - padding;
  const size = Math.min(availableWidth, availableHeight);
  
  canvas.width = size;
  canvas.height = size;
}

fetch('/map.osm')
  .then(res => res.text())
  .then(xmlText => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");

    // Najpierw zbierz wszystkie node'y
    xml.querySelectorAll("node").forEach(node => {
      const id = node.getAttribute("id");
      const lat = parseFloat(node.getAttribute("lat"));
      const lon = parseFloat(node.getAttribute("lon"));
      nodes[id] = { lat, lon };
    });

    // Najpierw zbierzmy wszystkie way'e które są częścią relacji wody
    let waterRelationWays = new Set();
    xml.querySelectorAll("relation").forEach(relation => {
      const tags = Array.from(relation.querySelectorAll("tag"));
      const isWaterMultipolygon = tags.some(tag => 
        tag.getAttribute("k") === "natural" && 
        tag.getAttribute("v") === "water"
      ) && tags.some(tag => 
        tag.getAttribute("k") === "type" && 
        tag.getAttribute("v") === "multipolygon"
      );

      if (isWaterMultipolygon) {
        const members = Array.from(relation.querySelectorAll("member"));
        members.forEach(member => {
          waterRelationWays.add(member.getAttribute("ref"));
        });
      }
    });

    // Potem parsuj ways
    xml.querySelectorAll("way").forEach(way => {
      const id = way.getAttribute("id");
      const tags = Array.from(way.querySelectorAll("tag"));
      
      const nds = Array.from(way.querySelectorAll("nd"))
        .map(nd => nodes[nd.getAttribute("ref")])
        .filter(Boolean);

      if (nds.length < 2) return;

      // Sprawdź czy to woda albo część relacji wody
      const isWater = tags.some(tag => 
        tag.getAttribute("k") === "natural" && 
        tag.getAttribute("v") === "water"
      );

      if (isWater || waterRelationWays.has(id)) {
        waterWays.set(id, nds);
        // Nie używamy return, żeby punkty były uwzględnione w bounds
      }

      // Sprawdź, czy nie jest to trasa promowa lub linia energetyczna
      const shouldIgnore = tags.some(tag => 
        (tag.getAttribute("k") === "seamark:type" && tag.getAttribute("v") === "ferry_route") ||
        (tag.getAttribute("k") === "power" && tag.getAttribute("v") === "line")
      );

      // Dodaj do ways tylko jeśli nie powinno być ignorowane i nie jest wodą
      if (!shouldIgnore && !isWater) {
        const isRailway = tags.some(tag => 
          tag.getAttribute("k") === "railway" &&
          (tag.getAttribute("v") === "rail" || tag.getAttribute("v") === "tram" || tag.getAttribute("v") === "subway")
        );

        if (isRailway) {
          const railwayTag = tags.find(tag => tag.getAttribute("k") === "railway");
          const mode = railwayTag ? railwayTag.getAttribute("v") : "rail";
          railways[mode].push({
            points: nds,
            type: "railway",
            mode: mode
          });
          return;
        }

        const isRoad = tags.some(tag => tag.getAttribute("k") === "maxspeed");
        if (isRoad) {
          let maxSpeed = 30;
          const speedTag = tags.find(tag => tag.getAttribute("k") === "maxspeed");
          if (speedTag) {
            const speed = parseInt(speedTag.getAttribute("v"), 10);
            if (speed > 0) maxSpeed = speed;
          }
          roads.push({
            points: nds,
            type: 'road',
            maxSpeed: maxSpeed
          });
        } else {
          regularWays.push({
            points: nds,
            type: 'regular'
          });
        }
      }
    });


    // Parsuj relacje wody
    xml.querySelectorAll("relation").forEach(relation => {
      const tags = Array.from(relation.querySelectorAll("tag"));
      const isWaterMultipolygon = tags.some(tag => 
        tag.getAttribute("k") === "natural" && 
        tag.getAttribute("v") === "water"
      ) && tags.some(tag => 
        tag.getAttribute("k") === "type" && 
        tag.getAttribute("v") === "multipolygon"
      );

      if (isWaterMultipolygon) {
        const members = Array.from(relation.querySelectorAll("member"));
        

        const outer = members
          .filter(m => m.getAttribute("role") === "outer")
          .map(m => {
            const ref = m.getAttribute("ref");
            const wayPoints = waterWays.get(ref);
            return wayPoints;
          })
          .filter(Boolean);
        
        const inner = members
          .filter(m => m.getAttribute("role") === "inner")
          .map(m => {
            const ref = m.getAttribute("ref");
            const wayPoints = waterWays.get(ref);
            return wayPoints;
          })
          .filter(Boolean);


        if (outer.length > 0) {
          waterAreas.push({
            outer: outer,
            inner: inner,
            id: relation.getAttribute("id"),
            type: 'multipolygon'
          });
        }
      }
    });

    // Przed obliczaniem bounds, zbierz wszystkie punkty ze wszystkich źródeł
    const allPoints = [
      ...regularWays.flatMap(way => way.points),
      ...roads.flatMap(way => way.points),
      ...railways.rail.flatMap(way => way.points),
      ...railways.tram.flatMap(way => way.points),
      ...railways.subway.flatMap(way => way.points),
      ...Array.from(waterWays.values()).flat()
    ];

    // Oblicz bounds na podstawie wszystkich punktów
    const lats = allPoints.map(p => p.lat);
    const lons = allPoints.map(p => p.lon);
    bounds = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
    };

    draw();
  });

function toXY(p) {
  const { minLat, maxLat, minLon, maxLon } = bounds;
  const x = ((p.lon - minLon) / (maxLon - minLon)) * canvas.width * scale + offsetX;
  const y = ((maxLat - p.lat) / (maxLat - minLat)) * canvas.height * scale + offsetY;
  return [x, y];
}

function requestDraw() {
  if (!isAnimationScheduled) {
    isAnimationScheduled = true;
    requestAnimationFrame(draw);
  }
}

function draw() {
  isAnimationScheduled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Najpierw rysuj wodę
  for (const area of waterAreas) {
    if (area.type === 'multipolygon') {
      ctx.fillStyle = "#aad3df";
      
      // Reset line dash przed rysowaniem wody
      ctx.setLineDash([]);
      
      // Rozpocznij nową ścieżkę dla całego multipoligonu
      ctx.beginPath();
      
      // Najpierw rysuj outer ways
      for (const points of area.outer) {
        points.forEach((p, i) => {
          const [x, y] = toXY(p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }

      // Teraz rysuj inner ways (wyspy) w przeciwnym kierunku
      for (const points of area.inner) {
        points.forEach((p, i) => {
          const [x, y] = toXY(p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }

      // Wypełnij całość używając 'evenodd' lub 'nonzero' rule
      ctx.fill('evenodd');
      
      // Rysuj kontury
      ctx.lineWidth = 0 * scale;
      ctx.strokeStyle = "#66b8d3";
      ctx.stroke();
    }
  }

  // Metro
  for (const subway of railways.subway) {
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.lineWidth = 0.5 * scale;
    ctx.strokeStyle = "#323a53";
    drawPath(subway.points);
    ctx.stroke();
  }

  // 2. Rysuj zwykłe ścieżki
  ctx.beginPath();
  ctx.setLineDash([]);
  ctx.lineWidth = 0.1 * scale;
  ctx.strokeStyle = "black";
  for (const way of regularWays) {
    drawPath(way.points);
  }
  ctx.stroke();

  // 3. Rysuj drogi
  for (const road of roads) {
    let width;
    ctx.setLineDash([]);
    // Dynamiczne przydzielanie kolorów na podstawie prędkości
    let roadColor;
    if (road.maxSpeed <= 30) {
      roadColor = "#f7fabe"; // żółty
      width = 0.3;
    } else if (road.maxSpeed <= 40) {
      roadColor = "#f7fabe"; // żółty
      width = 0.6;
    } else if (road.maxSpeed <= 95) {
      roadColor = "#fcd5a3"; // pomarańczowy
      width = 0.9
    } else {
      roadColor = "#e891a1"; // czerwony
      width = 0.9;
    }
    // Fill
    ctx.beginPath();
    ctx.lineWidth = width * scale;
    ctx.strokeStyle = roadColor;
    drawPath(road.points);
    ctx.stroke();
  }

  // 4. Rysuj koleje
  // Zwykłe koleje
  for (const railway of railways.rail) {
    // Casing
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.lineWidth = 0.4 * scale;
    ctx.strokeStyle = "#666666";
    drawPath(railway.points);
    ctx.stroke();
    
    // Fill
    ctx.beginPath();
    ctx.setLineDash([0.4*scale, 0.4*scale]);
    ctx.lineWidth = 0.2 * scale;
    ctx.strokeStyle = "#FFFFFF";
    drawPath(railway.points);
    ctx.stroke();
  }

  // Tramwaje
  for (const tram of railways.tram) {
    ctx.beginPath();
    ctx.setLineDash([]);
    ctx.lineWidth = 0.2 * scale;
    ctx.strokeStyle = "#FF0000";
    drawPath(tram.points);
    ctx.stroke();
  }

  
}

// Dodaj helper do rysowania ścieżki
function drawPath(points) {
  points.forEach((p, i) => {
    const [x, y] = toXY(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

// Pan i zoom
canvas.addEventListener("mousedown", e => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener("mouseup", () => isDragging = false);
canvas.addEventListener("mouseleave", () => isDragging = false);
canvas.addEventListener("mousemove", e => {
  if (isDragging) {
    offsetX += e.clientX - lastX;
    offsetY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    requestDraw();
  }
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  
  const zoomIntensity = 0.1;
  const zoom = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
  
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const mapX = (mouseX - offsetX) / scale;
  const mapY = (mouseY - offsetY) / scale;

  scale *= zoom;
  
  offsetX = mouseX - mapX * scale;
  offsetY = mouseY - mapY * scale;
  
  requestDraw();
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
