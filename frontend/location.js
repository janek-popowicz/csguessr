async function loadGameData(mode = 'nmpz', city = 'Urblin') {
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

async function loadMainImage(imagePath) {
    const mainView = document.getElementById('main-view');
    // Clear previous image if exists
    mainView.innerHTML = '';
    
    const img = document.createElement('img');
    img.src = `/${imagePath}`;
    img.alt = 'Game location';
    mainView.appendChild(img);
}

// Don't load image immediately - wait for game data
export { loadGameData, loadMainImage };