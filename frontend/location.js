import { MODE, CITY } from './script.js';

async function loadGameData({ mode = MODE, city = CITY }) {
    try {
        const response = await fetch(`/get_game?mode=${mode}&city=${city}`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading game data:', error);
        return null;
    }
}

async function loadMainImage(imagePath, city = 'Urblin', mode = MODE) {
    const mainView = document.getElementById('main-view');
    // Clear previous image if exists
    mainView.innerHTML = '';
    
    const img = document.createElement('img');
    img.src = `/${city}/${mode}/${imagePath}`; // Dodajemy miasto i tryb do ścieżki
    img.alt = 'Game location';
    mainView.appendChild(img);
}

// Make functions globally available
window.loadGameData = loadGameData;
window.loadMainImage = loadMainImage;