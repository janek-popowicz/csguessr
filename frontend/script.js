document.addEventListener('DOMContentLoaded', () => {
    // Initialize guess button
    const guessButton = document.getElementById('guess-button');
    guessButton.addEventListener('click', () => {
        console.log('Guess button clicked!');
        // Add guess logic here later
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