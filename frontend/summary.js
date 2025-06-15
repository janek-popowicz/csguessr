let summaryVisible = false;

export function setSummaryState(state) {
    summaryVisible = state;
}

export function showSummary(guessCoords, actualCoords, score) {
    // Ukryj przycisk guess
    document.getElementById('guess-button').style.display = 'none';
    
    // Ukryj główny widok i kontrolki
    document.getElementById('main-view').style.display = 'none';
    document.getElementById('overlay-controls').style.display = 'none';
    
    // Powiększ mapę na cały ekran
    const mapContainer = document.getElementById('map-container');
    mapContainer.classList.add('fullscreen');
    
    // Oznacz punkty na mapie
    window.markSummaryPoints(guessCoords, actualCoords);
    
    // Dodaj informacje o wyniku
    const scoreInfo = document.createElement('div');
    scoreInfo.id = 'score-info';
    scoreInfo.innerHTML = `
        <h2>Score: ${score}</h2>
        <button id="continue-button">Continue</button>
    `;
    document.body.appendChild(scoreInfo);

    // Obsługa przycisku continue
    document.getElementById('continue-button').addEventListener('click', () => {
        // Usuń wynik
        scoreInfo.remove();
        
        // Przywróć normalny widok
        document.getElementById('main-view').style.display = 'block';
        document.getElementById('overlay-controls').style.display = 'flex';
        document.getElementById('guess-button').style.display = 'block';
        mapContainer.classList.remove('fullscreen');
        
        // Rozpocznij nową grę
        document.getElementById('new-game-button').click();
    });

    summaryVisible = true;
}