const express = require('express');
const path = require('path');
const app = express();

// Serwujemy frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// Serwujemy plik .osm
app.get('/map.osm', (req, res) => {
  res.sendFile(path.join(__dirname, 'resources', 'Urblin', 'urblin.osm'));
});

// Endpoint dla dowolnego obrazu
app.get('/:filename', (req, res) => {
  const filename = req.params.filename;
  // Sprawdź czy to na pewno plik obrazu
  if (filename.match(/\.(png|jpg|jpeg|gif)$/i)) {
    res.sendFile(path.join(__dirname, 'resources', 'Urblin', filename));
  } else {
    res.status(400).send('Dozwolone tylko pliki obrazów');
  }
});

app.listen(3000, () => {
  console.log('Serwer działa na http://localhost:3000');
});

app.get('/get_game', (req, res) => {
  const gameData = {
    name: 'Urblin',
    description: 'Gra planszowa osadzona w fikcyjnym mieście Urblin.',
    image: '/26-April-21-43-06-05.png',
    map: '/map.osm'
  };
  res.json(gameData);
});