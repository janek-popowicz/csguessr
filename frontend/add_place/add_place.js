let selectedCoordinates = null;

// Wait for map_viewer.js to load and initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the map
    fetch('/map.osm')
        .then(res => res.text())
        .then(xmlText => {
            window.parseOSMData(xmlText);
            window.draw();
        });

    // Add click handler for the map
    const canvas = document.getElementById('map');
    canvas.addEventListener('click', (e) => {
        selectedCoordinates = window.getClickedCoordinates(e);
    });

    // Function to generate image previews
    function handleImagePreview(files) {
        const container = document.getElementById('preview-container');
        container.innerHTML = '';

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.classList.add('preview-image');
                container.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    }

    // Handle form submission
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!selectedCoordinates) {
            alert('Please select a location on the map');
            return;
        }

        const files = document.getElementById('images').files;
        if (files.length === 0) {
            alert('Please select at least one image');
            return;
        }

        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('images', file);
        });
        formData.append('coordinates', JSON.stringify(selectedCoordinates));

        try {
            const response = await fetch('/add_location', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                alert('Location added successfully!');
                document.getElementById('upload-form').reset();
                document.getElementById('preview-container').innerHTML = '';
                selectedCoordinates = null;
                window.resetMapState(); // Reset map markers
            } else {
                throw new Error('Failed to add location');
            }
        } catch (error) {
            alert('Error adding location: ' + error.message);
        }
    });

    // Handle image selection
    document.getElementById('images').addEventListener('change', (e) => {
        handleImagePreview(e.target.files);
    });
});