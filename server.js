const express = require('express');
const path = require('path');
const app = express();

// Serwujemy frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// Serwujemy plik .osm
app.get('/map.osm', (req, res) => {
  res.sendFile(path.join(__dirname, 'resources', 'Urblin', 'urblin.osm'));
});

app.listen(3000, () => {
  console.log('Serwer działa na http://localhost:3000');
});
