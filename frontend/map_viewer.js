const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");

const AMENITY_ICONS = {
  'hospital': '🏥',
  'police': '👮',
  'fire_station': '🚒',
  'school': '🏫',
  'university': '🎓',
  'library': '📚',
  'pharmacy': '💊',
  'restaurant': '🍽️',
  'cafe': '☕',
  'parking': '🅿️',
  'bank': '🏦',
  'post_office': '📫'
};

let ways = [];  // zostaw dla kompatybilności wstecznej
let roads = {
  regular: [],
  bridge: [],
  tunnel: []  // dodaj tunele
};

let footpaths = []; // ścieżki
let railways = {
  rail: {
    regular: [],
    bridge: [],
    tunnel: []
  },
  tram: {
    regular: [],
    bridge: [],
    tunnel: []
  },
  subway: {
    regular: [],
    bridge: [],
    tunnel: []
  }
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

// Na początku pliku, dodaj nowe struktury
let buildings = {
  landuse: {
    residential: [],  // zwykłe budynki mieszkalne
    industrial: []    // budynki przemysłowe
  },
  amenities: [],      // budynki użyteczności publicznej
  parks: []          // parks and leisure areas
};

// Na początku pliku, dodaj strukturę na dzielnice
let suburbs = [];

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

      // Sprawdź czy to dzielnica
      const tags = Array.from(node.querySelectorAll("tag"));
      const isSuburb = tags.some(tag => 
        tag.getAttribute("k") === "place" && 
        tag.getAttribute("v") === "suburb"
      );

      if (isSuburb) {
        const nameTag = tags.find(tag => tag.getAttribute("k") === "name");
        if (nameTag) {
          suburbs.push({
            lat,
            lon,
            name: nameTag.getAttribute("v")
          });
        }
      }
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

      const isLanduse = tags.some(tag => tag.getAttribute("k") === "landuse");
      const isOffice = tags.some(tag => tag.getAttribute("k") === "office");
      const isAmenity = tags.some(tag => tag.getAttribute("k") === "amenity");
      const isPark = tags.some(tag => 
        tag.getAttribute("k") === "leisure" && 
        tag.getAttribute("v") === "park"
      );

      if (isLanduse || isOffice || isAmenity || isPark) {
        // Sprawdź czy way jest zamknięty (pierwszy i ostatni punkt są te same)
        if (nds[0].lat === nds[nds.length-1].lat && nds[0].lon === nds[nds.length-1].lon) {
          if (isPark) {
            buildings.parks.push({
              points: nds,
              type: 'park'
            });
          } else if (isLanduse || isOffice) {
            let landUseType;
            if (isOffice) {
              landUseType = "residential"; // Traktuj office jak residential
            } else {
              const landUseTag = tags.find(tag => tag.getAttribute("k") === "landuse");
              landUseType = landUseTag.getAttribute("v");
              if (!(landUseType === "industrial")) {
                landUseType = "residential";  // Domyślny typ dla innych landuse
              }
            }
            buildings.landuse[landUseType].push({
              points: nds,
              type: landUseType
            });
          } else if (isAmenity) {  // Przenieś na ten sam poziom co if (isLanduse)
            const amenityTag = tags.find(tag => tag.getAttribute("k") === "amenity");
            buildings.amenities.push({
              points: nds,
              type: 'amenity',
              amenityType: amenityTag.getAttribute("v")
            });
          }
          return  // Przenieś return na koniec całego bloku
        }
      }

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
          const isBridge = tags.some(tag => 
            tag.getAttribute("k") === "bridge" && 
            tag.getAttribute("v") === "yes"
          );
          const isTunnel = tags.some(tag => 
            tag.getAttribute("k") === "tunnel" && 
            tag.getAttribute("v") === "yes"
          );

          let category = 'regular';
          if (isBridge) category = 'bridge';
          else if (isTunnel) category = 'tunnel';

          railways[mode][category].push({
            points: nds,
            type: "railway",
            mode: mode
          });
          return;
        }

        const isFootway = tags.some(tag => 
          tag.getAttribute("k") === "highway" && 
          tag.getAttribute("v") === "footway"
        );
        if (isFootway) {
          footpaths.push({
            points: nds,
            type: 'footway'
          });
          return;
        }


        const isRoad = tags.some(tag => tag.getAttribute("k") === "maxspeed");
        if (isRoad) {
          let maxSpeed = 30;
          let lanes = 2; // domyślna liczba pasów
          
          const speedTag = tags.find(tag => tag.getAttribute("k") === "maxspeed");
          if (speedTag) {
            const speed = parseInt(speedTag.getAttribute("v"), 10);
            if (speed > 0) maxSpeed = speed;
          }

          const lanesTag = tags.find(tag => tag.getAttribute("k") === "lanes");
          if (lanesTag) {
            const numLanes = parseInt(lanesTag.getAttribute("v"), 10);
            if (numLanes > 0) lanes = numLanes;
          }

          const isBridge = tags.some(tag => 
            tag.getAttribute("k") === "bridge" && 
            tag.getAttribute("v") === "yes"
          );
          const isTunnel = tags.some(tag => 
            tag.getAttribute("k") === "tunnel" && 
            tag.getAttribute("v") === "yes"
          );

          let category = 'regular';
          if (isBridge) category = 'bridge';
          else if (isTunnel) category = 'tunnel';

          roads[category].push({
            points: nds,
            type: 'road',
            maxSpeed: maxSpeed,
            lanes: lanes // dodajemy informację o liczbie pasów
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
      ...footpaths.flatMap(way => way.points),
      ...roads.regular.flatMap(way => way.points),
      ...roads.bridge.flatMap(way => way.points),
      ...roads.tunnel.flatMap(way => way.points),
      ...railways.rail.regular.flatMap(way => way.points),
      ...railways.rail.bridge.flatMap(way => way.points),
      ...railways.rail.tunnel.flatMap(way => way.points),
      ...railways.tram.regular.flatMap(way => way.points),
      ...railways.tram.bridge.flatMap(way => way.points),
      ...railways.subway.regular.flatMap(way => way.points),
      ...railways.subway.bridge.flatMap(way => way.points),
      ...railways.subway.tunnel.flatMap(way => way.points),
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

  if (scale > 3) {
  // 2. Rysuj budynki
  ctx.setLineDash([]);

  // Rysuj parki
  ctx.fillStyle = "#90EE90";  // Jasny zielony kolor
  for (const park of buildings.parks) {
    ctx.beginPath();
    drawPath(park.points);
    ctx.closePath();
    ctx.fill();
    
    // Kontur
    ctx.lineWidth = 0.1 * scale;
    ctx.strokeStyle = "#228B22";  // Ciemniejszy zielony na kontur
    ctx.stroke();
  }

  // Rysuj landuse residential
  ctx.fillStyle = "#e8d8c1";  // Kolor do zmiany
  for (const building of buildings.landuse.residential) {
    ctx.beginPath();
    drawPath(building.points);
    ctx.closePath();
    ctx.fill();
    
    // Kontur
    ctx.lineWidth = 0.1 * scale;
    ctx.strokeStyle = "#666666";
    ctx.stroke();
  }

  // Rysuj landuse industrial
  ctx.fillStyle = "#e0dede";  // Kolor do zmiany
  for (const building of buildings.landuse.industrial) {
    ctx.beginPath();
    drawPath(building.points);
    ctx.closePath();
    ctx.fill();
    
    // Kontur
    ctx.lineWidth = 0.1 * scale;
    ctx.strokeStyle = "#666666";
    ctx.stroke();
  }

  for (const building of buildings.amenities) {
    ctx.fillStyle = "#f2d4c8";  // Kolor wypełnienia
    ctx.beginPath();
    drawPath(building.points);
    ctx.closePath();
    ctx.fill();
    
    // Kontur
    ctx.lineWidth = 0.1 * scale;
    ctx.strokeStyle = "#666666";
    ctx.stroke();
    if (scale > 3 && building.amenityType) {
      // Oblicz środek poligonu
      const center = {
      lat: building.points.reduce((sum, p) => sum + p.lat, 0) / building.points.length,
      lon: building.points.reduce((sum, p) => sum + p.lon, 0) / building.points.length
      };
      const [x, y] = toXY(center);
      // Dobierz ikonę na podstawie typu amenity
      const icon = AMENITY_ICONS[building.amenityType] || '🏢';
      
      // Ustaw rozmiar czcionki dla ikony - skalowany ze zoomem, ale z limitem
      const iconSize = Math.max(1*scale, 10);
      ctx.font = `${iconSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      // Narysuj ikonę
      ctx.fillStyle = "#000000";
      ctx.fillText(icon, x, y);
    }
  }}

  


  // Tunele kolejowe
  for (const mode of ['subway', 'rail']) {
    for (const railway of railways[mode].tunnel) {
      ctx.beginPath();
      ctx.setLineDash([1 * scale, 1 * scale]);
      ctx.lineWidth = mode === 'subway' ? 0.5 * scale : 
                     0.4 * scale;
      ctx.strokeStyle = mode === 'subway' ? "#323a53" : 
                       "#666666";
      drawPath(railway.points);
      ctx.stroke();

      if (mode === 'rail') {
        // Białe kreski na torach
        ctx.beginPath();
        ctx.setLineDash([0.4*scale, 0.4*scale]);
        ctx.lineWidth = 0.2 * scale;
        ctx.strokeStyle = "#FFFFFF";
        drawPath(railway.points);
        ctx.stroke();
      }
    }
  }
  // Tunele drogowe
  for (const road of roads.tunnel) {
    let width;
    let roadColor;
    if (road.maxSpeed <= 30) {
      roadColor = "#f7fabe"; // żółty
      width = 0.2 * road.lanes; // bazowa szerokość * liczba pasów
    } else if (road.maxSpeed <= 40) {
      roadColor = "#f7fabe"; // żółty
      width = 0.2 * road.lanes;
    } else if (road.maxSpeed <= 95) {
      roadColor = "#fcd5a3"; // pomarańczowy
      width = 0.2 * road.lanes;
    } else {
      roadColor = "#e891a1"; // czerwony
      width = 0.2 * road.lanes;
    }

    ctx.beginPath();
    ctx.setLineDash([1 * scale, 1 * scale]);  // przerywana linia dla tuneli
    ctx.lineWidth = width * scale;
    ctx.strokeStyle = roadColor;
    drawPath(road.points);
    ctx.stroke();
  }


  // Drogi normalne
  ctx.setLineDash([]); // Resetuj linię przerywaną
for (const road of roads.regular) {
  let width;
  let roadColor;
  
  // Najpierw sprawdź prędkość i ustaw kolory
  if (road.maxSpeed <= 30) {
    // Małe drogi rysuj tylko przy dużym przybliżeniu
    if (scale <= 4) continue;
    roadColor = "#f7fabe"; // żółty
    width = 0.2 * road.lanes;
  } else if (road.maxSpeed <= 40) {
    // Również małe drogi
    if (scale <= 4) continue;
    roadColor = "#f7fabe"; // żółty
    width = 0.2 * road.lanes;
  } else if (road.maxSpeed <= 95) {
    roadColor = "#fcd5a3"; // pomarańczowy
    width = 0.2 * road.lanes;
  } else {
    roadColor = "#e891a1"; // czerwony
    width = 0.2 * road.lanes;
  }

  // Rysuj drogę
  ctx.beginPath();
  ctx.lineWidth = width * scale;
  ctx.strokeStyle = roadColor;
  drawPath(road.points);
  ctx.stroke();
}

// Zwykłe koleje bez tramwajów
  for (const mode of ['subway', 'rail']) {
    for (const railway of railways[mode].regular) {
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.lineWidth = mode === 'subway' ? 0.5 * scale : 
                     0.4 * scale;
      ctx.strokeStyle = mode === 'subway' ? "#323a53" : 
                       "#666666";
      drawPath(railway.points);
      ctx.stroke();

      if (mode === 'rail') {
        // Białe kreski na torach
        ctx.beginPath();
        ctx.setLineDash([0.4*scale, 0.4*scale]);
        ctx.lineWidth = 0.2 * scale;
        ctx.strokeStyle = "#FFFFFF";
        drawPath(railway.points);
        ctx.stroke();
      }
    }
  }

  if (scale > 12) {
  // Teraz ścieżki
  ctx.setLineDash([0.1*scale, 0.1*scale]);
  ctx.lineWidth = 0.1 * scale;
  ctx.strokeStyle = "#f8c5bd";
  for (const footway of footpaths) {
    ctx.beginPath();
    drawPath(footway.points);
    ctx.stroke();
  }
  }


  ctx.setLineDash([]); // Resetuj linię przerywaną przed rysowaniem mostów
  for (const road of roads.bridge) {
    let width;
    let roadColor;
    if (road.maxSpeed <= 30) {
      roadColor = "#f7fabe"; // żółty
      width = 0.2 * road.lanes;
    } else if (road.maxSpeed <= 40 && road.lanes <= 2) {
      roadColor = "#f7fabe"; // żółty
      width = 0.2 * road.lanes;
    } else if (road.maxSpeed <= 95 || road.lanes > 2) {
      roadColor = "#fcd5a3"; // pomarańczowy
      width = 0.2 * road.lanes;
    } else {
      roadColor = "#e891a1"; // czerwony
      width = 0.2 * road.lanes;
    }

    // Cień/kontur
    ctx.beginPath();
    ctx.lineWidth = (width + 0.2) * scale;
    ctx.strokeStyle = "#000000";
    drawPath(road.points);
    ctx.stroke();

    // Tło
    ctx.beginPath();
    ctx.lineWidth = (width + 0.1) * scale;
    ctx.strokeStyle = "#ffffff";
    drawPath(road.points);
    ctx.stroke();

    // Właściwa droga
    ctx.beginPath();
    ctx.lineWidth = width * scale;
    ctx.strokeStyle = roadColor;
    drawPath(road.points);
    ctx.stroke();
  }

  // Tramwaje
  if (scale > 4) {
  for (const railway of railways.tram.regular) {
      ctx.beginPath();
      ctx.lineWidth = 0.2 * scale;
      ctx.strokeStyle = "#FF0000";
      drawPath(railway.points);
      ctx.stroke();
      }
  }

  
  // Na końcu mosty kolejowe
  for (const mode of ['subway', 'rail']) {
    for (const railway of railways[mode].bridge) {
      // Cień/kontur
      ctx.beginPath();
      ctx.setLineDash([]);
      ctx.lineWidth = (mode === 'subway' ? 0.7 : 
                      0.6) * scale;
      ctx.strokeStyle = "#000000";
      drawPath(railway.points);
      ctx.stroke();

      // Tło
      ctx.beginPath();
      ctx.lineWidth = (mode === 'subway' ? 0.6 : 
                      0.5) * scale;
      ctx.strokeStyle = "#ffffff";
      drawPath(railway.points);
      ctx.stroke();

      // Właściwa linia
      ctx.beginPath();
      ctx.lineWidth = (mode === 'subway' ? 0.5 : 
                      0.4) * scale;
      ctx.strokeStyle = mode === 'subway' ? "#323a53" : 
                       "#666666";
      drawPath(railway.points);
      ctx.stroke();

      if (mode === 'rail') {
        // Kreski na torach
        ctx.beginPath();
        ctx.setLineDash([0.4*scale, 0.4*scale]);
        ctx.lineWidth = 0.2 * scale;
        ctx.strokeStyle = "#FFFFFF";
        drawPath(railway.points);
        ctx.stroke();
      }
    }
  }

  // Rysuj nazwy dzielnic na samym końcu
  const fontSize = scale > 5 ? 2*scale : 10;
ctx.font = `${fontSize}px Calibri`;
ctx.fillStyle = "#000000";
ctx.textAlign = "center";
ctx.textBaseline = "middle";

  for (const suburb of suburbs) {
    const [x, y] = toXY(suburb);
    
    // Dodaj białe tło pod tekstem dla lepszej czytelności
    const text = suburb.name;
    // const metrics = ctx.measureText(text);
    // const padding = 0.2 * scale;
    
    // ctx.fillStyle = "rgba(255, 255, 255, 0)";
    // ctx.fillRect(
    //   x - metrics.width/2 - padding,
    //   y - 0.4 * scale - padding,
    //   metrics.width + 2*padding,
    //   0.8 * scale + 2*padding
    // );
    
    // Narysuj tekst
    ctx.fillStyle = "#000000";
    ctx.fillText(text, x, y);
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
const MAX_ZOOM = 20;
const MIN_ZOOM = 1;

// Zmodyfikuj event listener dla wheel
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  
  const zoomIntensity = 0.1;
  const zoom = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
  
  // Sprawdź czy nowy scale nie przekroczy MAX_ZOOM
  const newScale = scale * zoom;
  if (newScale > MAX_ZOOM || newScale < MIN_ZOOM) {
    return; // Przerwij jeśli przekraczamy maksymalny zoom
  }
  
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const mapX = (mouseX - offsetX) / scale;
  const mapY = (mouseY - offsetY) / scale;

  scale = newScale;
  
  offsetX = mouseX - mapX * scale;
  offsetY = mouseY - mapY * scale;
  
  requestDraw();
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
