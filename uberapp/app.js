//===========================================
// VARIABLES GLOBALES
//===========================================
let selectedRideOption = null;
let currentBookingType = 'now';
let scheduledRides = [];
let currentDriver = null;
let callInterval;
let callDuration = 0;
let map;
let pickupMarker;
let destinationMarker;
let searchTimeout;
let currentRoute = null;
let userLocationMarker = null;
let searchResults = [];

// Variables para la simulación del conductor
let driverMarker = null;
let driverMovementInterval = null;
let routeCoordinates = [];
let currentRouteIndex = 0;
let countdownInterval = null;
let totalSeconds = 0;
let arrivalTimeout = null;
let rideStatus = 'en_camino';

//===========================================
// 2. FUNCIONES DE INICIALIZACIÓN
//===========================================

// Inicialización cuando carga la página
window.onload = function() {
    initMap();
    initAutocomplete();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('schedule-date').min = tomorrow.toISOString().split('T')[0];

    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateRequestButton);
    });

    document.querySelectorAll('.ride-option').forEach((option, index) => {
        option.addEventListener('click', () => selectRideOption(index + 1));
    });
}

// Inicialización del mapa
// Función para mostrar notificaciones
function showNotification(message, duration) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, duration);
}

// Función de inicialización del mapa modificada
function initMap() {
    try {
        console.log('Inicializando mapa...');
        
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('Elemento del mapa no encontrado');
            return;
        }

        map = L.map('map', {
            center: [19.4326, -99.1332],
            zoom: 13,
            zoomControl: true,
            scrollWheelZoom: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        // Agregar control de ubicación solo si está disponible
        if (typeof L.control.locate === 'function') {
            try {
                const locateControl = L.control.locate({
                    position: 'bottomright',
                    strings: {
                        title: "Mi ubicación"
                    },
                    locateOptions: {
                        enableHighAccuracy: true
                    }
                });
                locateControl.addTo(map);
            } catch (locateError) {
                console.error('Error al agregar control de ubicación:', locateError);
            }
        } else {
            console.log('Control de ubicación no disponible');
        }

        // Obtener ubicación inicial
        getCurrentLocation();

        setTimeout(() => {
            map.invalidateSize();
        }, 100);

    } catch (error) {
        console.error('Error al inicializar el mapa:', error);
    }
}
// Inicialización del autocompletado
function initAutocomplete() {
    const searchInputs = document.querySelectorAll('.location-input input');
    
    searchInputs.forEach(input => {
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'search-results';
        input.parentNode.appendChild(resultsContainer);

        input.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            const query = this.value;
            
            if (!query) {
                resultsContainer.style.display = 'none';
                return;
            }

            searchTimeout = setTimeout(() => {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)
                    .then(response => response.json())
                    .then(data => {
                        resultsContainer.innerHTML = '';
                        data.forEach(result => {
                            const div = document.createElement('div');
                            div.className = 'search-result-item';
                            div.textContent = result.display_name;
                            div.addEventListener('click', () => {
                                input.value = result.display_name;
                                const location = [parseFloat(result.lat), parseFloat(result.lon)];
                                const type = input.id === 'pickup-location' ? 'pickup' : 'destination';
                                updateMapMarkers(type, location, result.display_name);
                                resultsContainer.style.display = 'none';
                            });
                            resultsContainer.appendChild(div);
                        });
                        resultsContainer.style.display = data.length ? 'block' : 'none';
                    });
            }, 300);
        });

        // Ocultar resultados al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.style.display = 'none';
            }
        });
    });
}

// Evento de redimensión de ventana
window.addEventListener('resize', () => {
    if (map) {
        map.invalidateSize();
    }
});

//===========================================
// 3. FUNCIONES DEL MAPA Y RUTAS
//===========================================

// Obtener ubicación actual
function getCurrentLocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLocation = [position.coords.latitude, position.coords.longitude];
                if (userLocationMarker) {
                    map.removeLayer(userLocationMarker);
                }
                
                userLocationMarker = L.marker(userLocation, {
                    icon: L.divIcon({
                        className: 'custom-marker user-location-marker',
                        html: '<i class="fas fa-circle-dot"></i>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(map);

                map.setView(userLocation, 15);
                reverseGeocode(userLocation);
            },
            (error) => {
                console.error('Error obteniendo ubicación:', error);
                showNotification('No se pudo obtener tu ubicación actual', 3000);
            }
        );
    }
}

// Geocodificación inversa
async function reverseGeocode(latlng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latlng[0]}&lon=${latlng[1]}&format=json`
        );
        const data = await response.json();
        if (data.display_name) {
            document.getElementById('pickup-location').value = data.display_name;
            updateMapMarkers('pickup', latlng, data.display_name);
        }
    } catch (error) {
        console.error('Error en geocodificación inversa:', error);
    }
}

// Actualizar marcadores en el mapa
function updateMapMarkers(type, latlng, address) {
    try {
        if (type === 'pickup') {
            if (pickupMarker) {
                map.removeLayer(pickupMarker);
            }
            pickupMarker = L.marker(latlng, {
                icon: L.divIcon({
                    className: 'custom-marker pickup-marker',
                    html: '<i class="fas fa-map-marker-alt"></i>',
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                })
            }).addTo(map);
            pickupMarker.bindPopup(`<b>Punto de recogida:</b><br>${address}`);
        } else {
            if (destinationMarker) {
                map.removeLayer(destinationMarker);
            }
            destinationMarker = L.marker(latlng, {
                icon: L.divIcon({
                    className: 'custom-marker destination-marker',
                    html: '<i class="fas fa-flag-checkered"></i>',
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                })
            }).addTo(map);
            destinationMarker.bindPopup(`<b>Destino:</b><br>${address}`);
        }

        // Calcular ruta si ambos marcadores están presentes
        if (pickupMarker && destinationMarker) {
            calculateRoute();
            const bounds = L.latLngBounds([
                pickupMarker.getLatLng(),
                destinationMarker.getLatLng()
            ]);
            map.fitBounds(bounds, { padding: [50, 50] });
        }

    } catch (error) {
        console.error('Error al actualizar marcadores:', error);
    }
}

// Calcular y mostrar ruta
async function calculateRoute() {
    if (!pickupMarker || !destinationMarker) return;

    try {
        const pickup = pickupMarker.getLatLng();
        const destination = destinationMarker.getLatLng();

        if (currentRoute) {
            map.removeLayer(currentRoute);
        }

        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
        );
        const data = await response.json();

        if (data.code === 'Ok' && data.routes && data.routes[0]) {
            const route = data.routes[0];
            
            currentRoute = L.polyline(route.geometry.coordinates.map(coord => [coord[1], coord[0]]), {
                color: '#2563eb',
                weight: 4,
                opacity: 0.7,
                lineCap: 'round',
                dashArray: '10, 10',
                className: 'animated-route'
            }).addTo(map);

            const distance = (route.distance / 1000).toFixed(1);
            const duration = Math.round(route.duration / 60);

            showRouteInfo(distance, duration);
            updatePrices(distance);
        }

    } catch (error) {
        console.error('Error calculando la ruta:', error);
        showNotification('Error al calcular la ruta', 3000);
    }
}

// Mostrar información de la ruta
function showRouteInfo(distance, duration) {
    const existingRouteInfo = document.querySelector('.route-info');
    if (existingRouteInfo) {
        existingRouteInfo.remove();
    }

    const routeInfo = document.createElement('div');
    routeInfo.className = 'route-info';
    routeInfo.innerHTML = `
        <div class="route-detail">
            <i class="fas fa-road"></i>
            <div>
                <span class="route-value">${distance} km</span>
                <span class="route-label">Distancia</span>
            </div>
        </div>
        <div class="route-detail">
            <i class="fas fa-clock"></i>
            <div>
                <span class="route-value">${duration} min</span>
                <span class="route-label">Tiempo estimado</span>
            </div>
        </div>
    `;

    const rideOptions = document.querySelector('.ride-options');
    rideOptions.insertAdjacentElement('beforebegin', routeInfo);
}

// Actualizar precios
function updatePrices(distance) {
    const rates = {
        'Comfort': 2.5,
        'UberX': 1.5,
        'Black': 3.5
    };

    const baseFares = {
        'Comfort': 5,
        'UberX': 3,
        'Black': 8
    };

    document.querySelectorAll('.ride-option').forEach(option => {
        const serviceType = option.querySelector('h3').textContent;
        const basePrice = baseFares[serviceType];
        const ratePerKm = rates[serviceType];
        const totalPrice = (basePrice + (distance * ratePerKm)).toFixed(2);
        
        const priceElement = option.querySelector('.ride-option-price');
        if (priceElement) {
            priceElement.textContent = `$${totalPrice}`;
        }
    });
}

function showConfirmation() {
    try {
        console.log('Mostrando confirmación de reserva...');
        const modal = document.getElementById('confirmation-modal');
        const details = document.getElementById('confirmation-details');
        const date = document.getElementById('schedule-date').value;
        const time = document.getElementById('schedule-time').value;
        const pickup = document.getElementById('pickup-location').value;
        const destination = document.getElementById('destination-location').value;

        // Obtener la información de ruta y precio actual
        const routeInfo = document.querySelector('.route-info');
        let distance = '0 km';
        if (routeInfo) {
            const distanceElement = routeInfo.querySelector('.route-value');
            if (distanceElement) {
                distance = distanceElement.textContent;
            }
        }

        // Obtener el precio del tipo de viaje seleccionado
        const selectedOption = document.querySelector('.ride-option.selected');
        let price = '$0.00';
        if (selectedOption) {
            const priceElement = selectedOption.querySelector('.ride-option-price');
            if (priceElement) {
                price = priceElement.textContent;
            }
        }

        details.innerHTML = `
            <p><strong>Fecha:</strong> <span>${formatDate(date)}</span></p>
            <p><strong>Hora:</strong> <span>${formatTime(time)}</span></p>
            <p><strong>Origen:</strong> <span>${pickup}</span></p>
            <p><strong>Destino:</strong> <span>${destination}</span></p>
            <p><strong>Distancia:</strong> <span>${distance}</span></p>
            <p><strong>Tipo:</strong> <span>${getRideTypeName()}</span></p>
            <p><strong>Precio estimado:</strong> <span>${price}</span></p>
        `;

        modal.style.display = 'flex';
    } catch (error) {
        console.error('Error al mostrar confirmación:', error);
        showNotification('Error al mostrar la confirmación', 3000);
    }
}

// Confirmar viaje programado
function confirmScheduledRide() {
    try {
        const ride = {
            id: Date.now(),
            date: document.getElementById('schedule-date').value,
            time: document.getElementById('schedule-time').value,
            pickup: document.getElementById('pickup-location').value,
            destination: document.getElementById('destination-location').value,
            type: getRideTypeName(),
            price: document.querySelector('.ride-option.selected .ride-option-price').textContent
        };

        scheduledRides.push(ride);
        updateScheduledRides();
        closeModal();
        clearForm();
        showNotification('Viaje programado con éxito', 3000);
    } catch (error) {
        console.error('Error al confirmar viaje:', error);
        showNotification('Error al programar el viaje', 3000);
    }
}
// Obtener nombre del tipo de viaje
function getRideTypeName() {
    const types = ['Comfort', 'UberX', 'Black'];
    return types[selectedRideOption - 1] || '';
}

// Formatear fecha
function formatDate(date) {
    try {
        return new Date(date).toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        console.error('Error al formatear fecha:', error);
        return date;
    }
}

// Formatear hora
function formatTime(time) {
    return time;
}

// Cerrar modal
function closeModal() {
    const modal = document.getElementById('confirmation-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Actualizar lista de viajes programados
function updateScheduledRides() {
    const container = document.getElementById('scheduled-rides');
    if (!container) return;

    container.innerHTML = '<h3>Viajes Programados</h3>';
    
    scheduledRides.forEach(ride => {
        container.innerHTML += `
            <div class="scheduled-ride">
                <h4>${formatDate(ride.date)} - ${ride.time}</h4>
                <p>De: ${ride.pickup}</p>
                <p>A: ${ride.destination}</p>
                <p>${ride.type} - ${ride.price}</p>
                <button onclick="cancelRide(${ride.id})" class="cancel-ride-btn">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        `;
    });
}

// Limpiar formulario
function clearForm() {
    document.getElementById('schedule-date').value = '';
    document.getElementById('schedule-time').value = '';
    document.getElementById('pickup-location').value = '';
    document.getElementById('destination-location').value = '';
    selectedRideOption = null;
    
    document.querySelectorAll('.ride-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    updateRequestButton();
}

// Cancelar viaje programado
function cancelRide(rideId) {
    try {
        const index = scheduledRides.findIndex(ride => ride.id === rideId);
        if (index !== -1) {
            scheduledRides.splice(index, 1);
            updateScheduledRides();
            showNotification('Viaje cancelado exitosamente', 3000);
        }
    } catch (error) {
        console.error('Error al cancelar viaje:', error);
        showNotification('Error al cancelar el viaje', 3000);
    }
}

//===========================================
// 4. FUNCIONES DE SOLICITUD DE VIAJE
//===========================================

// Gestión de tipo de viaje
function switchBookingType(type) {
    currentBookingType = type;
    document.querySelectorAll('.booking-type').forEach(el => {
        el.classList.remove('active');
    });
    event.target.closest('.booking-type').classList.add('active');
    
    const scheduleOptions = document.getElementById('schedule-options');
    scheduleOptions.classList.toggle('visible', type === 'schedule');
    
    updateRequestButton();
}

function selectRideOption(optionId) {
    selectedRideOption = optionId;
    
    document.querySelectorAll('.ride-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    document.querySelectorAll('.ride-option')[optionId - 1].classList.add('selected');
    updateRequestButton();
}

function updateRequestButton() {
    const pickup = document.getElementById('pickup-location').value;
    const destination = document.getElementById('destination-location').value;
    const button = document.querySelector('.request-button');
    
    if (currentBookingType === 'schedule') {
        const date = document.getElementById('schedule-date').value;
        const time = document.getElementById('schedule-time').value;
        button.disabled = !selectedRideOption || !pickup || !destination || !date || !time;
    } else {
        button.disabled = !selectedRideOption || !pickup || !destination;
    }
}

// Base de datos de conductores
const drivers = [
    {
        name: "Carlos Rodríguez",
        photo: "https://randomuser.me/api/portraits/men/32.jpg",
        rating: 4.8,
        trips: 2345,
        car: "Toyota Corolla 2020",
        plate: "ABC-123"
    },
    {
        name: "Ana Martínez",
        photo: "https://randomuser.me/api/portraits/women/44.jpg",
        rating: 4.9,
        trips: 3421,
        car: "Honda Civic 2021",
        plate: "XYZ-789"
    },
    {
        name: "Luis González",
        photo: "https://randomuser.me/api/portraits/men/45.jpg",
        rating: 4.7,
        trips: 1987,
        car: "Nissan Versa 2019",
        plate: "DEF-456"
    }
];

function getRandomDriver() {
    return drivers[Math.floor(Math.random() * drivers.length)];
}

function handleRideRequest() {
    console.log('Iniciando solicitud de viaje...');

    if (!selectedRideOption) {
        showNotification('Por favor selecciona un tipo de viaje', 3000);
        return;
    }

    if (!pickupMarker || !destinationMarker) {
        showNotification('Por favor selecciona origen y destino', 3000);
        return;
    }

    if (currentBookingType === 'schedule') {
        showConfirmation();
    } else {
        showNotification('Buscando conductor...', 3000);
        
        setTimeout(() => {
            const driver = getRandomDriver();
            currentDriver = driver;
            showDriverModal(driver);
            startETACountdown();
        }, 2000);
    }
}


function createDriverMarker(startPosition) {
    const driverIcon = L.divIcon({
        className: 'custom-marker driver-marker',
        html: '<i class="fas fa-car"></i>',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    driverMarker = L.marker(startPosition, {
        icon: driverIcon,
        zIndexOffset: 1000
    }).addTo(map);
}

// Función para simular el movimiento del conductor
function simulateDriverMovement() {
    if (!pickupMarker || !currentRoute) return;

    // Obtener las coordenadas de la ruta
    const routePath = currentRoute.getLatLngs();
    routeCoordinates = routePath.slice().reverse(); // Invertimos para ir desde el inicio

    // Crear marcador del conductor en una posición cercana al punto de inicio
    const startPosition = getRandomNearbyPoint(routeCoordinates[0]);
    createDriverMarker(startPosition);

    // Iniciar el movimiento
    currentRouteIndex = 0;
    if (driverMovementInterval) clearInterval(driverMovementInterval);
    
    driverMovementInterval = setInterval(() => {
        if (currentRouteIndex < routeCoordinates.length - 1) {
            const currentPos = driverMarker.getLatLng();
            const nextPos = routeCoordinates[currentRouteIndex + 1];
            
            // Calcular posición intermedia para movimiento suave
            const newPos = calculateIntermediatePosition(currentPos, nextPos, 0.1);
            
            // Calcular ángulo para rotar el ícono del conductor
            const angle = calculateAngle(currentPos, nextPos);
            rotateDriverMarker(angle);
            
            // Mover el marcador
            driverMarker.setLatLng(newPos);
            
            // Actualizar ETA
            updateETA(currentRouteIndex, routeCoordinates.length);
            
            currentRouteIndex++;
        } else {
            // El conductor ha llegado
            clearInterval(driverMovementInterval);
            showNotification('¡Tu conductor ha llegado!', 5000);
            if (driverMarker) {
                map.removeLayer(driverMarker);
            }
        }
    }, 1000);
}

// Función para obtener un punto aleatorio cercano
function getRandomNearbyPoint(point, radius = 0.01) {
    return [
        point.lat + (Math.random() - 0.5) * radius,
        point.lng + (Math.random() - 0.5) * radius
    ];
}

// Función para calcular posición intermedia
function calculateIntermediatePosition(pos1, pos2, factor) {
    return {
        lat: pos1.lat + (pos2.lat - pos1.lat) * factor,
        lng: pos1.lng + (pos2.lng - pos1.lng) * factor
    };
}

// Función para calcular ángulo entre dos puntos
function calculateAngle(pos1, pos2) {
    const dx = pos2.lng - pos1.lng;
    const dy = pos2.lat - pos1.lat;
    return Math.atan2(dy, dx) * 180 / Math.PI;
}

// Función para rotar el marcador del conductor
function rotateDriverMarker(angle) {
    const markerIcon = driverMarker.getElement().querySelector('i');
    if (markerIcon) {
        markerIcon.style.transform = `rotate(${angle}deg)`;
    }
}

// Función para actualizar el ETA
function updateETA(currentIndex, totalPoints) {
    const progress = currentIndex / totalPoints;
    const remainingMinutes = Math.ceil(3 * (1 - progress)); // Asumiendo 3 minutos total
    const etaElement = document.getElementById('eta-time');
    if (etaElement) {
        etaElement.textContent = `${remainingMinutes} min`;
    }
}




// Función para crear el marcador del conductor
function createDriverMarker(startPosition) {
    const driverIcon = L.divIcon({
        className: 'custom-marker driver-marker',
        html: '<i class="fas fa-car"></i>',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    driverMarker = L.marker(startPosition, {
        icon: driverIcon,
        zIndexOffset: 1000
    }).addTo(map);
}

// Función para simular el movimiento del conductor
function simulateDriverMovement() {
    if (!pickupMarker || !currentRoute) return;

    // Obtener las coordenadas de la ruta
    const routePath = currentRoute.getLatLngs();
    routeCoordinates = routePath.slice().reverse(); // Invertimos para ir desde el inicio

    // Crear marcador del conductor en una posición cercana al punto de inicio
    const startPosition = getRandomNearbyPoint(routeCoordinates[0]);
    createDriverMarker(startPosition);

    // Iniciar el movimiento
    currentRouteIndex = 0;
    if (driverMovementInterval) clearInterval(driverMovementInterval);
    
    driverMovementInterval = setInterval(() => {
        if (currentRouteIndex < routeCoordinates.length - 1) {
            const currentPos = driverMarker.getLatLng();
            const nextPos = routeCoordinates[currentRouteIndex + 1];
            
            // Calcular posición intermedia para movimiento suave
            const newPos = calculateIntermediatePosition(currentPos, nextPos, 0.1);
            
            // Calcular ángulo para rotar el ícono del conductor
            const angle = calculateAngle(currentPos, nextPos);
            rotateDriverMarker(angle);
            
            // Mover el marcador
            driverMarker.setLatLng(newPos);
            
            // Actualizar ETA
            updateETA(currentRouteIndex, routeCoordinates.length);
            
            currentRouteIndex++;
        } else {
            // El conductor ha llegado
            clearInterval(driverMovementInterval);
            showNotification('¡Tu conductor ha llegado!', 5000);
            if (driverMarker) {
                map.removeLayer(driverMarker);
            }
        }
    }, 1000);
}

// Función para obtener un punto aleatorio cercano
function getRandomNearbyPoint(point, radius = 0.01) {
    return [
        point.lat + (Math.random() - 0.5) * radius,
        point.lng + (Math.random() - 0.5) * radius
    ];
}

// Función para calcular posición intermedia
function calculateIntermediatePosition(pos1, pos2, factor) {
    return {
        lat: pos1.lat + (pos2.lat - pos1.lat) * factor,
        lng: pos1.lng + (pos2.lng - pos1.lng) * factor
    };
}

// Función para calcular ángulo entre dos puntos
function calculateAngle(pos1, pos2) {
    const dx = pos2.lng - pos1.lng;
    const dy = pos2.lat - pos1.lat;
    return Math.atan2(dy, dx) * 180 / Math.PI;
}

// Función para rotar el marcador del conductor
function rotateDriverMarker(angle) {
    const markerIcon = driverMarker.getElement().querySelector('i');
    if (markerIcon) {
        markerIcon.style.transform = `rotate(${angle}deg)`;
    }
}

// Función para actualizar el ETA
function updateETA(currentIndex, totalPoints) {
    const progress = currentIndex / totalPoints;
    const remainingMinutes = Math.ceil(3 * (1 - progress)); // Asumiendo 3 minutos total
    const etaElement = document.getElementById('eta-time');
    if (etaElement) {
        etaElement.textContent = `${remainingMinutes} min`;
    }
}

// Función para formatear el tiempo
function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;
}

// Función para iniciar el contador regresivo
function startCountdown(initialMinutes) {
    // Limpiar contador anterior si existe
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    totalSeconds = initialMinutes * 60;
    const etaElement = document.getElementById('eta-time');

    countdownInterval = setInterval(() => {
        if (totalSeconds > 0) {
            totalSeconds--;
            if (etaElement) {
                etaElement.innerHTML = `
                    <div class="countdown-timer">
                        <div class="time">${formatTime(totalSeconds)}</div>
                        <div class="time-label">tiempo estimado</div>
                    </div>
                `;
            }
        } else {
            clearInterval(countdownInterval);
            if (etaElement) {
                etaElement.innerHTML = '<span class="arrived">¡Conductor llegó!</span>';
            }
        }
    }, 1000);
}

// Función para actualizar el estado del viaje
function updateRideStatus(status) {
    rideStatus = status;
    const statusElement = document.querySelector('.status');
    if (statusElement) {
        switch (status) {
            case 'en_camino':
                statusElement.textContent = 'En camino a tu destino';
                statusElement.className = 'status status-on-way';
                break;
            case 'llegada':
                statusElement.textContent = '¡El conductor ha llegado!';
                statusElement.className = 'status status-arrived';
                showNotification('¡El conductor ha llegado a tu destino!', 5000);
                break;
            case 'finalizado':
                statusElement.textContent = 'Viaje finalizado';
                statusElement.className = 'status status-completed';
                showNotification('Viaje finalizado. ¡Gracias por viajar con nosotros!', 5000);
                break;
        }
    }
}

// Modificar la función startDriverSimulation
function startDriverSimulation() {
    if (!pickupMarker || !currentRoute) return;

    // Limpiar simulación anterior
    if (driverMovementInterval) {
        clearInterval(driverMovementInterval);
    }

    const routePath = currentRoute.getLatLngs();
    routeCoordinates = routePath.slice().reverse();
    currentRouteIndex = 0;

    const startPosition = [
        routeCoordinates[0].lat + (Math.random() - 0.5) * 0.01,
        routeCoordinates[0].lng + (Math.random() - 0.5) * 0.01
    ];

    updateDriverPosition(startPosition);

    // Calcular tiempo estimado inicial (basado en la distancia)
    const initialMinutes = Math.ceil(routeCoordinates.length / 10); // Ajustar según necesidad
    startCountdown(initialMinutes);

    driverMovementInterval = setInterval(() => {
        if (currentRouteIndex < routeCoordinates.length - 1) {
            const currentPos = driverMarker.getLatLng();
            const nextPos = routeCoordinates[currentRouteIndex + 1];
            
            const newPos = {
                lat: currentPos.lat + (nextPos.lat - currentPos.lat) * 0.1,
                lng: currentPos.lng + (nextPos.lng - currentPos.lng) * 0.1
            };
            
            const angle = Math.atan2(nextPos.lat - currentPos.lat, nextPos.lng - currentPos.lng) * 180 / Math.PI;
            
            if (driverMarker && driverMarker.getElement()) {
                const icon = driverMarker.getElement().querySelector('i');
                if (icon) {
                    icon.style.transform = `rotate(${angle}deg)`;
                }
            }
            
            driverMarker.setLatLng(newPos);            
            currentRouteIndex++;
        } else {
            clearInterval(driverMovementInterval);
            clearInterval(countdownInterval);
            driverMovementInterval = null;
            if (driverMarker && map) {
                map.removeLayer(driverMarker);
                driverMarker = null;
            }
            showNotification('¡Tu conductor ha llegado!', 5000);
            startRide(currentDriver);
        }
    }, 1000);
}


// Modificar la función showDriverModal para iniciar la simulación
function showDriverModal(driver) {
    const modal = document.getElementById('driver-modal');
    const driverCard = modal.querySelector('.driver-card');
    
    driverCard.innerHTML = `
        <div class="driver-header">
            <div class="driver-photo">
                <img src="${driver.photo}" alt="Driver Photo">
            </div>
            <div class="driver-info">
                <h3>${driver.name} está en camino</h3>
                <div class="driver-rating">
                    <i class="fas fa-star"></i>
                    <span>${driver.rating}</span> · ${driver.trips.toLocaleString()} viajes
                </div>
            </div>
        </div>
        <div class="driver-details">
            <div class="car-info">
                <i class="fas fa-car"></i>
                <div>
                    <h4>${driver.car}</h4>
                    <p>${driver.plate}</p>
                </div>
            </div>
            <div class="eta">
                <i class="fas fa-clock"></i>
                <div>
                    <h4>Tiempo estimado</h4>
                    <p id="eta-time">3 min</p>
                </div>
            </div>
        </div>
        <div class="driver-actions">
            <button class="action-button" onclick="contactDriver('call')">
                <i class="fas fa-phone"></i> Llamar
            </button>
            <button class="action-button" onclick="contactDriver('message')">
                <i class="fas fa-comment"></i> Mensaje
            </button>
            <button class="action-button" onclick="closeDriverModal()">
                <i class="fas fa-times"></i> Cerrar
            </button>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Iniciar simulación del movimiento del conductor
    simulateDriverMovement();
}

//===========================================
// FUNCIONES DE LLAMADA Y CHAT
//===========================================

// Función para iniciar llamada
function startCall() {
    const callModal = document.getElementById('call-modal');
    document.getElementById('calling-driver-photo').src = currentDriver.photo;
    document.getElementById('calling-driver-name').textContent = currentDriver.name;
    
    callModal.style.display = 'flex';
    
    setTimeout(() => {
        document.querySelector('.call-status').textContent = 'Conectado';
        startCallTimer();
    }, 2000);
}

// Función para el temporizador de llamada
function startCallTimer() {
    callDuration = 0;
    callInterval = setInterval(() => {
        callDuration++;
        const minutes = Math.floor(callDuration / 60);
        const seconds = callDuration % 60;
        document.getElementById('call-duration').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Función para terminar llamada
function endCall() {
    clearInterval(callInterval);
    document.getElementById('call-modal').style.display = 'none';
    showNotification('Llamada finalizada', 2000);
}

// Función para abrir el chat
function openChat() {
    const chatModal = document.getElementById('chat-modal');
    document.getElementById('chat-driver-photo').src = currentDriver.photo;
    document.getElementById('chat-driver-name').textContent = currentDriver.name;
    
    chatModal.style.display = 'flex';
    document.getElementById('chat-messages').innerHTML = '';
    
    setTimeout(() => {
        addMessage('¡Hola! Estoy en camino a recogerte.', 'received');
    }, 1000);
}

// Función para cerrar el chat
function closeChat() {
    document.getElementById('chat-modal').style.display = 'none';
}

// Función para enviar mensaje
function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message) {
        addMessage(message, 'sent');
        input.value = '';
        
        setTimeout(() => {
            const responses = [
                '¡Entendido!',
                'Perfecto, gracias por avisar',
                'Estoy a unos minutos de llegar',
                'Ok, nos vemos pronto'
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            addMessage(randomResponse, 'received');
        }, 1500);
    }
}

// Función para agregar mensaje al chat
function addMessage(text, type) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Agregar evento para enviar mensaje con Enter
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
});

// Función para contactar al conductor
function contactDriver(type) {
    if (type === 'call') {
        startCall();
    } else if (type === 'message') {
        openChat();
    }
}

function startETACountdown() {
    let minutes = 3;
    const etaElement = document.getElementById('eta-time');
    
    const countdown = setInterval(() => {
        if (minutes > 0) {
            minutes--;
            etaElement.textContent = `${minutes} min`;
        } else {
            clearInterval(countdown);
            showNotification('¡Tu conductor ha llegado!', 5000);
            startRide(currentDriver);
            document.getElementById('driver-modal').style.display = 'none';
        }
    }, 60000);
}

function startRide(driver) {
    const currentRide = document.getElementById('current-ride');
    currentRide.style.display = 'block';
    
    const rideDetails = document.querySelector('.ride-details');
    rideDetails.innerHTML = `
        <div class="driver-info">
            <img src="${driver.photo}" alt="Driver">
            <div class="driver-details">
                <h3>${driver.name}</h3>
                <div class="rating">⭐ ${driver.rating}</div>
                <div class="car-info">${driver.car} - ${driver.plate}</div>
                <div class="status">En camino a tu destino</div>
            </div>
        </div>
    `;

    document.querySelector('.ride-options').style.display = 'none';
    document.querySelector('.request-button').style.display = 'none';
}

function contactDriver(type) {
    if (type === 'call') {
        startCall();
    } else if (type === 'message') {
        openChat();
    }
}

function closeDriverModal() {
    const modal = document.getElementById('driver-modal');
    modal.style.display = 'none';
    
    // Limpiar todos los timers
    if (driverMovementInterval) {
        clearInterval(driverMovementInterval);
        driverMovementInterval = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (arrivalTimeout) {
        clearTimeout(arrivalTimeout);
        arrivalTimeout = null;
    }
    if (driverMarker && map) {
        map.removeLayer(driverMarker);
        driverMarker = null;
    }
}