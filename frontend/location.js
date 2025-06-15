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

async function loadMainImage(imagePaths, city = 'Urblin', mode = MODE) {
    const mainView = document.getElementById('main-view');
    mainView.innerHTML = '';

    console.log('Mode:', mode, 'Is Array:', Array.isArray(imagePaths), 'Image Paths:', imagePaths);

    if (mode === 'nmpz' || !Array.isArray(imagePaths)) {
        // Tryb NMPZ - pojedynczy obraz
        const img = document.createElement('img');
        img.src = `/${city}/${mode}/${imagePaths}`;
        img.alt = 'Game location';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        mainView.appendChild(img);
    } else {
        // Tryb NM - panorama 360
        const panoramaContainer = document.createElement('div');
        panoramaContainer.id = 'panorama-container';
        panoramaContainer.style.overflow = 'hidden';
        panoramaContainer.style.width = '100%';
        panoramaContainer.style.height = '100%';
        panoramaContainer.style.position = 'relative';
        panoramaContainer.style.cursor = 'grab';

        const imageStrip = document.createElement('div');
        imageStrip.id = 'image-strip';
        imageStrip.style.display = 'flex';
        imageStrip.style.height = '100%';

        const loadPromises = imagePaths.map((path, index) => {
            return new Promise((resolve) => {
                const img = document.createElement('img');
                img.src = `/${city}/${mode}/${path}`;
                img.alt = `Location view ${index + 1}`;
                img.className = 'panorama-image';
                img.style.height = '100%';
                img.style.flex = '0 0 auto';
                img.style.transition = 'opacity 0.3s ease-out';
                img.draggable = false; // Prevent dragging
                img.onload = () => resolve(img);
            });
        });

        const loadedImages = await Promise.all(loadPromises);

        // Add images with blending masks
        loadedImages.forEach((img, i) => {
            const mask = document.createElement('div');
            mask.style.position = 'relative';
            mask.style.height = '100%';
            mask.style.flex = '0 0 auto';
            mask.appendChild(img);

            const gradientOverlay = document.createElement('div');
            gradientOverlay.style.position = 'absolute';
            gradientOverlay.style.top = 0;
            gradientOverlay.style.bottom = 0;
            gradientOverlay.style.left = 0;
            gradientOverlay.style.right = 0;
            gradientOverlay.style.background = 'linear-gradient(to right, rgba(0,0,0,0.1), rgba(0,0,0,0), rgba(0,0,0,0.1))';
            mask.appendChild(gradientOverlay);

            imageStrip.appendChild(mask);
        });

        // Clone first four images to end
        for (let i = 0; i < 4; i++) {
            imageStrip.appendChild(loadedImages[i].cloneNode(true));
        }

        panoramaContainer.appendChild(imageStrip);
        mainView.appendChild(panoramaContainer);

        // Initialize controls and set initial position
        initializePanoramaControls(loadedImages);
    }
}

function initializePanoramaControls(loadedImages) {
    const container = document.getElementById('panorama-container');
    const strip = document.getElementById('image-strip');
    let isDragging = false;
    let startX;
    let scrollLeft;
    let momentum = 0;
    let lastX;
    let animationFrame;
    let currentScale = 1;
    const MIN_SCALE = 1;
    const MAX_SCALE = 3;
    let startY;
    let scrollTop;

    // Set initial scroll position to the 4th image
    setTimeout(() => {
        const fourthImage = loadedImages[3];
        if (fourthImage) {
            // Calculate the total width of first three images
            const offset = loadedImages.slice(0, 3).reduce((total, img) => {
                return total + img.offsetWidth;
            }, 0);
            
            // Set scroll position to show the fourth image
            container.scrollLeft = offset;
        }
    }, 0);

    function updateScroll() {
        if (Math.abs(momentum) > 0.1) {
            container.scrollLeft += momentum;
            
            if (currentScale > 1) {
                // Apply momentum to vertical scroll only when zoomed
                container.scrollTop += momentum * 0.5; // Reduced vertical momentum for better control
            }
            
            momentum *= 0.93;
            animationFrame = requestAnimationFrame(updateScroll);
        }
    }

    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.pageX;
        startY = e.pageY;
        scrollLeft = container.scrollLeft;
        scrollTop = container.scrollTop;
        lastX = e.pageX;
        momentum = 0;
        cancelAnimationFrame(animationFrame);
        container.style.cursor = 'grabbing';
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const dx = startX - e.pageX;
        const dy = startY - e.pageY;
        const x = e.pageX;
        momentum = (lastX - x) * 0.9;
        lastX = x;

        if (currentScale > 1) {
            // Allow both horizontal and vertical scrolling when zoomed
            container.scrollLeft = scrollLeft + dx;
            container.scrollTop = scrollTop + dy;
        } else {
            // Only horizontal scrolling when not zoomed
            container.scrollLeft = scrollLeft + dx;
        }
    });

    function stopDragging() {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = 'grab';
            requestAnimationFrame(updateScroll);
        }
    }

    container.addEventListener('mouseup', stopDragging);
    container.addEventListener('mouseleave', stopDragging);

    container.addEventListener("wheel", (e) => {
        e.preventDefault();
        
        const zoomIntensity = 0.2;
        const zoom = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
        
        const newScale = currentScale * zoom;
        if (newScale > MAX_SCALE || newScale < MIN_SCALE) {
            return;
        }
        
        // Get mouse position relative to container
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Calculate scroll position before zoom
        const beforeZoomX = mouseX + container.scrollLeft;
        const beforeZoomY = mouseY + container.scrollTop;

        // Apply new scale
        currentScale = newScale;
        strip.style.transform = `scale(${currentScale})`;
        strip.style.transformOrigin = '0 0';

        // Calculate new scroll position
        container.scrollLeft = (beforeZoomX * zoom) - mouseX;
        container.scrollTop = (beforeZoomY * zoom) - mouseY;
    });
}

window.loadGameData = loadGameData;
window.loadMainImage = loadMainImage;