const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");

let ways = [];  // Zmiana struktury - będziemy przechowywać {points: [], type: string}
let nodes = {};
let bounds;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let lastX, lastY;
let isAnimationScheduled = false;


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

    xml.querySelectorAll("node").forEach(node => {
      const id = node.getAttribute("id");
      const lat = parseFloat(node.getAttribute("lat"));
      const lon = parseFloat(node.getAttribute("lon"));
      nodes[id] = { lat, lon };
    });

    xml.querySelectorAll("way").forEach(way => {
      const tags = Array.from(way.querySelectorAll("tag"));
      
      // Sprawdź, czy nie jest to trasa promowa lub linia energetyczna
      const shouldIgnore = tags.some(tag => 
        (tag.getAttribute("k") === "seamark:type" && tag.getAttribute("v") === "ferry_route") ||
        (tag.getAttribute("k") === "power" && tag.getAttribute("v") === "line")
      );

      // Dodaj do ways tylko jeśli nie powinno być ignorowane
      if (!shouldIgnore) {
        const nds = Array.from(way.querySelectorAll("nd"))
          .map(nd => nodes[nd.getAttribute("ref")])
          .filter(Boolean);
        
        if (nds.length >= 2) {
          // Sprawdź czy to linia kolejowa lub droga
          const isRailway = tags.some(tag => 
            tag.getAttribute("k") === "railway" &&
            (tag.getAttribute("v") === "rail" || tag.getAttribute("v") === "tram")
          );
          
          const isRoad = tags.some(tag => 
            tag.getAttribute("k") === "maxspeed" //||
            //tag.getAttribute("k") === "highway"
          );
          
          ways.push({
            points: nds,
            type: isRailway ? 'railway' : (isRoad ? 'road' : 'regular')
          });
        }
      }
    });

    const all = ways.flatMap(way => way.points);
    const lats = all.map(p => p.lat);
    const lons = all.map(p => p.lon);
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

  // Jedna pętla zamiast trzech
  for (const way of ways) {
    if (way.type === 'road') {
      // Casing
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "black";
      drawPath(way.points);
      ctx.stroke();

      // Fill
      ctx.beginPath();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#fcdc4d";
      drawPath(way.points);
      ctx.stroke();
    } else if (way.type === 'railway') {
      ctx.beginPath();
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#666666";
      drawPath(way.points);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "black";
      drawPath(way.points);
      ctx.stroke();
    }
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
