const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const app = express();
const multer = require('multer');

async function giveGame(city, mode) {
    try {
        // Declare cityPath outside the if statements
        let cityPath;
        
        // Set cityPath based on mode
        if (mode === 'nmpz') {
            cityPath = path.join(__dirname, 'resources', city, 'nmpz');
        } else if (mode === 'nm') {
            cityPath = path.join(__dirname, 'resources', city, 'nm');
        } else {
            throw new Error('Invalid mode specified');
        }

        const files = await fs.readdir(cityPath);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        if (jsonFiles.length === 0) {
            throw new Error('No locations found for this city');
        }

        // Pick a random json file
        const randomJson = jsonFiles[Math.floor(Math.random() * jsonFiles.length)];
        const locationData = JSON.parse(
            await fs.readFile(path.join(cityPath, randomJson), 'utf8')
        );

        // Prepare response based on mode
        const response = {
            loc_id: locationData['loc.id']
        };

        if (mode === 'nmpz') {
            // For NMPZ mode, return only one random image
            const randomImage = locationData.images[
                Math.floor(Math.random() * locationData.images.length)
            ];
            response.images = [randomImage];
        } else if (mode === 'nm') {
            // For NM mode, return all images
            response.images = locationData.images;
        }

        return response;
    } catch (error) {
        console.error('Error in giveGame:', error);
        throw error;
    }
}

// Serwujemy frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// Endpoint dla gry
app.get('/get_game', async (req, res) => {
    try {
        const { city = 'Urblin', mode = 'nmpz' } = req.query;
        const gameData = await giveGame(city, mode);
        res.json(gameData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate game' });
    }
});

// Serwujemy plik .osm
app.get('/map/:city/:mode', (req, res) => {
    const city = req.params.city || 'Urblin';
    const mode = req.params.mode || 'nmpz';
    res.sendFile(path.join(__dirname, 'resources', city, `${city.toLowerCase()}.osm`));
});

// Endpoint dla dowolnego obrazu z danego miasta
app.get('/:city/:mode/:filename', (req, res) => {
    const { city, mode, filename } = req.params;
    
    // Sprawdź czy to na pewno plik obrazu
    if (filename.match(/\.(png|jpg|jpeg|gif)$/i)) {
        res.sendFile(path.join(__dirname, 'resources', city, mode, filename));
    } else {
        res.status(400).send('Dozwolone tylko pliki obrazów');
    }
});

function calculateScore(guessCoords, actualCoords) {
    // Prosta funkcja do obliczania dystansa między dwoma punktami
    // Można to rozbudować o bardziej zaawansowane metody
    const dx = guessCoords[0] - actualCoords[0];
    const dy = guessCoords[1] - actualCoords[1];
    const distance = (Math.sqrt(dx * dx + dy * dy)*2);
    if (distance < 0.01) { // 5k
      return 5000;
    }
    // zaokrąglij score
    console.log(`Dystans: ${distance}`);
    return Math.max(Math.round(5000 - (distance * 5000)), 0);
}

app.post('/submit_guess', express.json(), async (req, res) => {
    try {
        const { loc_id, coordinates , mode} = req.body;
        
        // Wczytaj prawidłowe koordynaty z pliku JSON
        const cityPath = path.join(__dirname, 'resources', 'Urblin', mode);
        const locationData = JSON.parse(
            await fs.readFile(path.join(cityPath, `${loc_id}.json`), 'utf8')
        );
        
        // Oblicz dystans między punktami (można dodać później)
        const score = calculateScore(coordinates, locationData.coords);
        
        res.json({ 
            score,
            actual_coords: locationData.coords 
        });
    } catch (error) {
        console.error('Error processing guess:', error);
        res.status(500).json({ error: 'Failed to process guess' });
    }
});

// Dodaj obsługę przesyłania plików
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, path.join(__dirname, 'resources', 'Urblin'));
    },
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Endpoint do dodawania nowej lokacji
app.post('/add_location', upload.array('images'), async (req, res) => {
    try {
        const coordinates = JSON.parse(req.body.coordinates);
        const images = req.files.map(file => file.filename);
        
        // Stwórz nowy plik JSON dla lokacji
        const locationData = {
            'loc.id': Date.now().toString(),
            coords: coordinates,
            images: images
        };

        // Zapisz plik JSON
        await fs.writeFile(
            path.join(__dirname, 'resources', 'Urblin', `${locationData['loc.id']}.json`),
            JSON.stringify(locationData, null, 2)
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error adding location:', error);
        res.status(500).json({ error: 'Failed to add location' });
    }
});

app.listen(3000, () => {
    console.log('Serwer działa na http://localhost:3000');
});