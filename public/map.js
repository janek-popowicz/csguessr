document.getElementById('file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function () {
    const parser = new DOMParser();
    const xml = parser.parseFromString(reader.result, "application/xml");

    const nodes = {};
    xml.querySelectorAll("node").forEach(node => {
      nodes[node.getAttribute("id")] = {
        lat: parseFloat(node.getAttribute("lat")),
        lon: parseFloat(node.getAttribute("lon")),
      };
    });

    const ways = [];
    xml.querySelectorAll("way").forEach(way => {
      const nds = Array.from(way.querySelectorAll("nd")).map(nd =>
        nodes[nd.getAttribute("ref")]
      ).filter(Boolean);
      if (nds.length >= 2) {
        ways.push(nds);
      }
    });

    renderMap(ways);
  };
  reader.readAsText(file);
});

function renderMap(ways) {
  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d");

  const allCoords = ways.flat();
  const lats = allCoords.map(p => p.lat);
  const lons = allCoords.map(p => p.lon);

  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);

  function toXY(p) {
    const x = ((p.lon - minLon) / (maxLon - minLon)) * canvas.width;
    const y = ((maxLat - p.lat) / (maxLat - minLat)) * canvas.height;
    return [x, y];
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;

  for (const way of ways) {
    ctx.beginPath();
    for (let i = 0; i < way.length; i++) {
      const [x, y] = toXY(way[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
