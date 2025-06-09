// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const osmtogeojson = require('osmtogeojson');
const xml2js = require('xml2js');
const app = express();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/map-data', (req, res) => {
    try {
        const osmData = fs.readFileSync(path.join(__dirname, 'example.osm'), 'utf8');
        xml2js.parseString(osmData, { explicitArray: false }, (err, result) => {
            if (err) {
                console.error('Error parsing OSM XML:', err);
                return res.status(500).send('Error parsing OSM XML');
            }
            const geojson = osmtogeojson(result.osm);
            res.json(geojson);
        });
    } catch (error) {
        console.error('Error processing OSM data:', error);
        res.status(500).send('Error processing OSM data');
    }
});

app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
