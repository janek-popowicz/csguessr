import { showSummary } from './summary.js';

let currentGame = null;
let guessCoordinates = [];
export const CITY = 'Urblin';
export const MODE = 'nm'; // nmpz or nm

async function startNewGame() {
    if (window.resetMapState) window.resetMapState();
    const gameData = await window.loadGameData({ mode: MODE, city: CITY });  // Używamy stałej MODE
    if (gameData) {
        currentGame = gameData;
        await window.loadMainImage(gameData.images, CITY, MODE);  // Pass the whole array
        console.log('New game started:', gameData.loc_id);
    }
}

// Make startNewGame globally available
window.startNewGame = startNewGame;

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for other scripts to load
    setTimeout(async () => {
        const newGameButton = document.getElementById('new-game-button');
        newGameButton.addEventListener('click', startNewGame);

        // Start first game automatically
        startNewGame();
    }, 100);

    // Initialize guess button
    const guessButton = document.getElementById('guess-button');
    guessButton.addEventListener('click', async () => {
        if (!currentGame || !guessCoordinates) {
            console.log('No game in progress or no guess made');
            return;
        }

        try {
            const response = await fetch('/submit_guess', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    loc_id: currentGame.loc_id,
                    coordinates: guessCoordinates,
                    mode: MODE
                })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const result = await response.json();
            console.log('Guess result:', result);

            // Pokaż ekran podsumowania
            showSummary(guessCoordinates, result.actual_coords, result.score);

            // Celebration dla 5000 punktów
            if (result.score === 5000) {
                const celebration = document.getElementById('celebration');
                celebration.classList.remove('hidden');
                const audio = new Audio('data:audio/wav;base64,...');
                audio.play();
                setTimeout(() => {
                    celebration.classList.add('hidden');
                }, 1000);
            }
        } catch (error) {
            console.error('Error submitting guess:', error);
        }
    });

    const mapContainer = document.getElementById('map-container');
    
    mapContainer.addEventListener('mouseenter', () => {
        mapContainer.classList.add('expanded');
        if (window.resizeCanvas) window.resizeCanvas();
    });
    
    mapContainer.addEventListener('mouseleave', () => {
        mapContainer.classList.remove('expanded');
        if (window.resizeCanvas) window.resizeCanvas();
    });

    // Dodaj event listener na kliknięcie mapy
    const canvas = document.getElementById('map');
    canvas.addEventListener('click', (e) => {
        if (!e.target.closest('#guess-button')) { // Ignoruj kliknięcia w przycisk
            const coords = window.getClickedCoordinates(e);
            guessCoordinates = coords
            console.log('Clicked coordinates:', coords);
        }
    });
});