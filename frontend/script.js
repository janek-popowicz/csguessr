document.addEventListener('DOMContentLoaded', async () => {
    const newGameButton = document.getElementById('new-game-button');
    let currentGame = null;

    async function startNewGame() {
        const gameData = await window.loadGameData('nmpz');
        if (gameData) {
            currentGame = gameData;
            await window.loadMainImage(gameData.images[0]);
            console.log('New game started:', gameData.loc_id);
        }
    }

    newGameButton.addEventListener('click', startNewGame);

    // Start first game automatically
    startNewGame();

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
                    coordinates: guessCoordinates
                })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const result = await response.json();
            console.log('Guess result:', result);
            // Tu możesz dodać kod wyświetlający wynik
            
        } catch (error) {
            console.error('Error submitting guess:', error);
        }
    });

    let guessCoordinates = [];
    
    const mapContainer = document.getElementById('map-container');
    const canvas = document.getElementById('map');
    
    mapContainer.addEventListener('mouseenter', () => {
        mapContainer.classList.add('expanded');
        requestAnimationFrame(resizeCanvas);
    });
    
    mapContainer.addEventListener('mouseleave', () => {
        mapContainer.classList.remove('expanded');
        requestAnimationFrame(resizeCanvas);
    });

    // Dodaj event listener na kliknięcie mapy
    canvas.addEventListener('click', (e) => {
        if (!e.target.closest('#guess-button')) { // Ignoruj kliknięcia w przycisk
            const coords = window.getClickedCoordinates(e);
            guessCoordinates = coords
            console.log('Clicked coordinates:', coords);
        }
    });
});