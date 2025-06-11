function loadMainImage() {
    const mainView = document.getElementById('main-view');
    const img = document.createElement('img');
    img.src = '/test.png';
    img.alt = 'Game location';
    mainView.appendChild(img);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', loadMainImage);