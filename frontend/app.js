
let userToken =
    localStorage.getItem(
        "chargelens_token"
    );
let currentUser = null;
/* =========================================================
   CHARGELENS DRIVER APPLICATION
========================================================= */

const API_BASE = "";


/* =========================================================
   GLOBAL STATE
========================================================= */

let stations = [];

let filteredStations = [];

let stationFilters = {
    search: "",
    status: "all",
    confidence: "all",
    connector: "all",
    power: "all"
};
let favoriteStationIds = new Set();

let map = null;

let markers = {};

let selectedStation = null;

let selectedReportType = null;

let verificationEmail = null;
let verificationToken = null;


/* =========================================================
   LOCATION STATE
========================================================= */

let currentUserLocation = null;

let locationRequestStarted = false;


/* =========================================================
   START APPLICATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializeMap();

        initializeAuthentication();

        setupUI();

        setupReportUI();

        setupCommunity();

        loadStations().then(
            () => {

                setupStationFilters();

            }
        );

        requestUserLocation();

    }
);


/* =========================================================
   MAP
========================================================= */

function initializeMap() {

    const mapElement =
        document.getElementById("map");


    if (!mapElement) {

        console.error(
            "ChargeLens: map element not found."
        );

        return;

    }


    map = L.map(
        mapElement,
        {
            zoomControl: true,
            attributionControl: true,
            preferCanvas: true
        }
    );


    /* -----------------------------------------------------
       DARK CARTO MAP
    ----------------------------------------------------- */

    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
            subdomains: "abcd",

            maxZoom: 19,

            minZoom: 4,

            updateWhenIdle: true,

            keepBuffer: 4,

            attribution:
                '&copy; OpenStreetMap contributors &copy; CARTO'
        }
    ).addTo(map);


    /* -----------------------------------------------------
   INITIAL INDIA VIEW
----------------------------------------------------- */

map.setView(
    [
        20.5937,
        78.9629
    ],
    5,
    {
        animate: false
    }
);


    /* -----------------------------------------------------
       FORCE LEAFLET TO RECALCULATE SIZE
    ----------------------------------------------------- */

    setTimeout(() => {

        if (map) {

            map.invalidateSize(true);

        }

    }, 100);


    setTimeout(() => {

        if (map) {

            map.invalidateSize(true);

        }

    }, 500);


    /* -----------------------------------------------------
       WATCH MAP CONTAINER SIZE
    ----------------------------------------------------- */

    if (
        typeof ResizeObserver !==
        "undefined"
    ) {

        const observer =
            new ResizeObserver(() => {

                if (map) {

                    map.invalidateSize(true);

                }

            });


        observer.observe(
            mapElement
        );

    }


    /* -----------------------------------------------------
       BROWSER RESIZE
    ----------------------------------------------------- */

    window.addEventListener(
        "resize",
        () => {

            if (map) {

                map.invalidateSize(true);

            }

        }
    );

}


/* =========================================================
   FIT MAP AROUND ALL STATIONS
========================================================= */

function fitMapToStations() {

    if (
        !map ||
        !stations.length
    ) {

        return;

    }


    const validStations =
        stations.filter(
            station =>

                Number.isFinite(
                    Number(
                        station.latitude
                    )
                )

                &&

                Number.isFinite(
                    Number(
                        station.longitude
                    )
                )
        );


    if (!validStations.length) {

        map.setView(
            [
                12.9716,
                77.5946
            ],
            12
        );

        return;

    }


    const bounds =
        L.latLngBounds(
            validStations.map(
                station => [

                    Number(
                        station.latitude
                    ),

                    Number(
                        station.longitude
                    )

                ]
            )
        );


    map.fitBounds(
        bounds,
        {

            padding:
                [
                    80,
                    80
                ],

            maxZoom:
                14,

            animate:
                false

        }
    );

}

/* =========================================================
   DISTANCE / NEARBY STATION HELPERS
========================================================= */

function getDistanceInMeters(
    latitude1,
    longitude1,
    latitude2,
    longitude2
) {

    const earthRadius = 6371000;

    const lat1 =
        Number(latitude1) * Math.PI / 180;

    const lat2 =
        Number(latitude2) * Math.PI / 180;

    const deltaLat =
        (Number(latitude2) - Number(latitude1))
        * Math.PI / 180;

    const deltaLon =
        (Number(longitude2) - Number(longitude1))
        * Math.PI / 180;

    const a =
        Math.sin(deltaLat / 2) ** 2
        +
        Math.cos(lat1)
        * Math.cos(lat2)
        * Math.sin(deltaLon / 2) ** 2;

    const c =
        2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadius * c;

}


function updateStationDistances() {

    if (!Array.isArray(stations)) {

        return;

    }


    stations =
        stations.map(station => {

            const latitude =
                Number(station.latitude);

            const longitude =
                Number(station.longitude);


            if (
                !currentUserLocation ||
                !Number.isFinite(latitude) ||
                !Number.isFinite(longitude)
            ) {

                return {
                    ...station,
                    distance_meters: null
                };

            }


            return {
                ...station,

                distance_meters:
                    getDistanceInMeters(
                        currentUserLocation.latitude,
                        currentUserLocation.longitude,
                        latitude,
                        longitude
                    )

            };

        });

}


function sortStationsByDistance() {

    if (!Array.isArray(stations)) {

        return;

    }


    stations.sort((a, b) => {

        const distanceA =
            Number.isFinite(
                Number(a.distance_meters)
            )
                ? Number(a.distance_meters)
                : Number.POSITIVE_INFINITY;


        const distanceB =
            Number.isFinite(
                Number(b.distance_meters)
            )
                ? Number(b.distance_meters)
                : Number.POSITIVE_INFINITY;


        if (distanceA !== distanceB) {

            return distanceA - distanceB;

        }


        return (
            Number(b.confidence_score || 0)
            -
            Number(a.confidence_score || 0)
        );

    });

}


function formatStationDistance(
    distanceMeters
) {

    if (
        !Number.isFinite(
            Number(distanceMeters)
        )
    ) {

        return null;

    }


    const distance =
        Number(distanceMeters);


    if (distance < 1000) {

        return `${Math.round(distance)} m away`;

    }


    return `${(distance / 1000).toFixed(1)} km away`;

}

updateStationDistances();

sortStationsByDistance();


/* =========================================================
   LOAD STATIONS
========================================================= */

async function loadStations() {

    const stationList =
        document.getElementById(
            "stationList"
        );


    try {

        const response =
            await fetch(
                `${API_BASE}/api/stations`
            );


        if (!response.ok) {

            throw new Error(
                "Unable to load stations."
            );

        }


      stations =
    await response.json();


updateStationDistances();

sortStationsByDistance();


populateConnectorFilter();

applyStationFilters();


        /* -------------------------------------------------
           IMPORTANT MAP FIX
        ------------------------------------------------- */

        setTimeout(
            () => {

                if (map) {

                    map.invalidateSize(
                        true
                    );

                    fitMapToStations();

                }

            },
            400
        );

    }


    catch (error) {

        console.error(
            "Station loading error:",
            error
        );


        if (!stationList) {

            return;

        }


        stationList.innerHTML = `

            <div class="loading-state">

                <p>
                    Unable to load charging stations.
                </p>

                <button
                    class="secondary-button"
                    id="retryStationsButton"
                    type="button"
                >
                    Retry
                </button>

            </div>

        `;


        document
            .getElementById(
                "retryStationsButton"
            )
            ?.addEventListener(
                "click",
                loadStations
            );

    }

}


/* =========================================================
   LOAD NEARBY REAL STATIONS
========================================================= */

async function loadNearbyStations() {

    if (!currentUserLocation) {

        return;

    }


    const stationList =
        document.getElementById(
            "stationList"
        );


    if (stationList) {

        stationList.innerHTML = `

            <div class="loading-state">

                <p>
                    Finding nearby charging stations...
                </p>

            </div>

        `;

    }


    try {

        const params =
            new URLSearchParams({

                latitude:
                    String(
                        currentUserLocation.latitude
                    ),

                longitude:
                    String(
                        currentUserLocation.longitude
                    ),

                radius_km:
                    "25",

                max_results:
                    "100"

            });


        const response =
            await fetch(
                `${API_BASE}/api/stations/nearby?${params.toString()}`,
                {
                    method:
                        "GET",

                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Unable to find nearby stations."
            );

        }


        stations =
            await response.json();


        /*
         * Recalculate our client-side distance
         * and sort the stations again.
         */

        updateStationDistances();

        sortStationsByDistance();


        populateConnectorFilter();

        applyStationFilters();


        setTimeout(
            () => {

                if (map) {

                    map.invalidateSize(
                        true
                    );

                }

            },
            200
        );


        console.log(
            "Nearby ChargeLens stations loaded:",
            stations.length
        );

    }

    catch (error) {

        console.error(
            "Nearby station loading error:",
            error
        );


        /*
         * Do not destroy the existing station
         * list if nearby lookup fails.
         */

        loadStations();

    }

}


/* =========================================================
   REAL-TIME STATION SYNCHRONIZATION
========================================================= */

/*
 * ChargeLens MVP real-time refresh.
 *
 * Every 10 seconds we ask the backend for the latest
 * active station information.
 *
 * This means when another user submits a report,
 * other users can see the updated station status
 * without manually refreshing the page.
 */

const STATION_SYNC_INTERVAL =
    10000;


let stationSyncTimer = null;

let stationSyncRunning = false;


/* =========================================================
   START REAL-TIME SYNC
========================================================= */

function startStationRealtimeSync() {

    /*
     * Prevent multiple timers from being created.
     */

    stopStationRealtimeSync();


    /*
     * Start the first refresh after 10 seconds.
     */

    stationSyncTimer =
        setInterval(
            () => {

                refreshStationsSilently();

            },
            STATION_SYNC_INTERVAL
        );


    console.log(
        "ChargeLens real-time station sync started."
    );

}


/* =========================================================
   STOP REAL-TIME SYNC
========================================================= */

function stopStationRealtimeSync() {

    if (
        stationSyncTimer !== null
    ) {

        clearInterval(
            stationSyncTimer
        );

        stationSyncTimer =
            null;

    }

}


/* =========================================================
   SILENT STATION REFRESH
========================================================= */

async function refreshStationsSilently() {

    /*
     * Don't start another request if the previous
     * synchronization request is still running.
     */

    if (stationSyncRunning) {

        return;

    }


    stationSyncRunning =
        true;


    try {

        let stationApiUrl =
            "/api/stations";


        if (currentUserLocation) {

            const params =
                new URLSearchParams({

                    latitude:
                        String(
                            currentUserLocation.latitude
                        ),

                    longitude:
                        String(
                            currentUserLocation.longitude
                        ),

                    radius_km:
                        "25",

                    max_results:
                        "100"

                });


            stationApiUrl =
                `/api/stations/nearby?${params.toString()}`;

        }


        const response =
            await fetch(
                stationApiUrl,
                {

                    method:
                        "GET",

                    cache:
                        "no-store"

                }
            );


        if (!response.ok) {

            throw new Error(
                "Unable to synchronize stations."
            );

        }


        const updatedStations =
            await response.json();


        if (
            !Array.isArray(
                updatedStations
            )
        ) {

            throw new Error(
                "Invalid station data received."
            );

        }


        /*
         * Check whether station data actually changed.
         */

        const oldData =
            JSON.stringify(
                stations
                    .map(
                        station => ({

                            id:
                                station.id,

                            status:
                                station.status,

                            confidence_score:
                                station.confidence_score,

                            last_verified_at:
                                station.last_verified_at,

                            is_active:
                                station.is_active

                        })
                    )
            );


        const newData =
            JSON.stringify(
                updatedStations
                    .map(
                        station => ({

                            id:
                                station.id,

                            status:
                                station.status,

                            confidence_score:
                                station.confidence_score,

                            last_verified_at:
                                station.last_verified_at,

                            is_active:
                                station.is_active

                        })
                    )
            );


        /*
         * Nothing changed.
         * Don't redraw the UI unnecessarily.
         */

        if (
            oldData ===
            newData
        ) {

            return;

        }


        /*
         * Remember the station currently selected
         * by the user.
         */

        const selectedStationId =
            selectedStation
                ? selectedStation.id
                : null;


        /*
         * Replace the station data with the
         * latest backend version.
         */

        stations =
            updatedStations;


        /*
         * Rebuild the station cards.
         */

        populateConnectorFilter();

        applyStationFilters();


        /*
         * Restore selected station after
         * the cards/markers are rebuilt.
         */

        if (
            selectedStationId !== null
        ) {

            const updatedSelectedStation =
                stations.find(
                    station =>
                        Number(
                            station.id
                        ) ===
                        Number(
                            selectedStationId
                        )
                );


            if (
                updatedSelectedStation
            ) {

                selectedStation =
                    updatedSelectedStation;


                /*
                 * Restore selected card.
                 */

                document
                    .querySelectorAll(
                        ".station-card"
                    )
                    .forEach(
                        card => {

                            card.classList.toggle(
                                "selected",
                                Number(
                                    card.dataset.id
                                ) ===
                                Number(
                                    selectedStationId
                                )
                            );

                        }
                    );

            }

            else {

                selectedStation =
                    null;

            }

        }


        /*
         * Make sure Leaflet recalculates its
         * dimensions after marker updates.
         */

        setTimeout(
            () => {

                if (map) {

                    map.invalidateSize(
                        true
                    );

                }

            },
            100
        );


        console.log(
            "ChargeLens station data synchronized."
        );

    }


    catch (error) {

        /*
         * Real-time sync should never break
         * the rest of the application.
         */

        console.warn(
            "Station synchronization failed:",
            error.message
        );

    }


    finally {

        stationSyncRunning =
            false;

    }

}


/* =========================================================
   PAGE VISIBILITY
========================================================= */

document.addEventListener(
    "visibilitychange",
    () => {

        /*
         * When the user leaves the browser tab,
         * stop polling to save resources.
         */

        if (
            document.hidden
        ) {

            stopStationRealtimeSync();

            return;

        }


        /*
         * When the user comes back,
         * immediately synchronize once
         * and restart the timer.
         */

        refreshStationsSilently();

        startStationRealtimeSync();

    }
);


/* =========================================================
   START SYNC WHEN PAGE IS READY
========================================================= */

window.addEventListener(
    "load",
    () => {

        startStationRealtimeSync();

    }
);

/* =========================================================
   RENDER STATIONS
========================================================= */

function renderStations(
    stationsToRender = stations
) {

    const list =
        document.getElementById(
            "stationList"
        );


    const count =
        document.getElementById(
            "stationCount"
        );


    if (!list || !count) {

        return;

    }


    if (!stationsToRender.length) {

        count.textContent =
            "0 stations found";


        list.innerHTML = `

            <div class="loading-state">

                <p>
                    No charging stations match your filters.
                </p>

            </div>

        `;


        return;

    }


    count.textContent =
        `${stationsToRender.length} stations found`;


    list.innerHTML =
        stationsToRender
            .map(
                station =>
                    createStationCard(
                        station
                    )
            )
            .join("");


    /*
     * Clicking a station card opens
     * the station details modal.
     */

    document
        .querySelectorAll(
            ".station-card"
        )
        .forEach(
            card => {

                card.addEventListener(
                    "click",
                    event => {

                        /*
                         * Do NOT open the station modal
                         * when the favorite star is clicked.
                         */

                        if (
                            event.target.closest(
                                ".station-favorite-star"
                            )
                        ) {

                            return;

                        }


                        selectStation(
                            Number(
                                card.dataset.id
                            )
                        );

                    }
                );

            }
        );


    /*
     * Favorite star buttons.
     */

    document
        .querySelectorAll(
            ".station-favorite-star"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    async event => {

                        event.stopPropagation();


                        const stationId =
                            Number(
                                button.dataset
                                    .favoriteStationId
                            );


                        const station =
                            stations.find(
                                item =>
                                    Number(
                                        item.id
                                    ) ===
                                    stationId
                            );


                        if (!station) {

                            return;

                        }


                        await toggleFavoriteStation(
                            station
                        );


                        /*
                         * Redraw cards so the
                         * star changes immediately.
                         */

                        applyStationFilters();

                    }
                );

            }
        );

}
/* =========================================================
   STATION CARD
========================================================= */

function createStationCard(
    station
) {

    const scoreClass =
        getScoreClass(
            station.confidence_score
        );


    const statusClass =
        getStatusClass(
            station.status
        );


    const isSaved =
        favoriteStationIds.has(
            Number(
                station.id
            )
        );


    return `

        <article
            class="station-card"
            data-id="${station.id}"
        >

            <div class="station-top">

                <div>

                    <div class="station-name">

                        ${escapeHtml(
                            station.name
                        )}

                    </div>


                    <div class="station-operator">

                        ${escapeHtml(
                            station.operator_name
                        )}

                    </div>

                </div>


                <div
                    style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                    "
                >

                    <button
                        type="button"
                        class="
                            station-favorite-star
                            ${isSaved ? "saved" : ""}
                        "
                        data-favorite-station-id="${station.id}"
                        aria-label="${
                            isSaved
                                ? "Remove from saved stations"
                                : "Save station"
                        }"
                        title="${
                            isSaved
                                ? "Remove from saved stations"
                                : "Save station"
                        }"
                    >

                        ${
                            isSaved
                                ? "★"
                                : "☆"
                        }

                    </button>


                    <div
                        class="
                            confidence
                            ${scoreClass}
                        "
                    >

                        ${Math.round(
                            station.confidence_score
                        )}%

                    </div>

                </div>

            </div>


            <div class="station-meta">

                <span class="meta-chip">

                    ${escapeHtml(
                        station.connector_type
                    )}

                </span>


                <span class="meta-chip">

                    ${station.power_kw} kW

                </span>


                <span class="meta-chip">

                    ₹${station.price_per_kwh}/kWh

                </span>


                ${
                    formatStationDistance(
                        station.distance_meters
                    )

                    ? `

                        <span
                            class="
                                meta-chip
                                station-distance
                            "
                        >

                            📍
                            ${formatStationDistance(
                                station.distance_meters
                            )}

                        </span>

                    `

                    : ""
                }

            </div>


            <div class="status-row">

                <span
                    class="
                        status-dot
                        ${statusClass}
                    "
                ></span>


                ${formatStatus(
                    station.status
                )}

            </div>


        </article>

    `;

}

/* =========================================================
   MAP MARKERS
========================================================= */

function renderMarkers(
    stationsToRender = stations
) {

    if (!map) {

        return;

    }


    /* -----------------------------------------------------
       REMOVE OLD MARKERS
    ----------------------------------------------------- */

    Object
        .values(markers)
        .forEach(
            marker => {

                map.removeLayer(
                    marker
                );

            }
        );


    markers = {};


    /* -----------------------------------------------------
       CREATE NEW MARKERS
    ----------------------------------------------------- */

    stationsToRender.forEach(
        station => {

            const latitude =
                Number(
                    station.latitude
                );


            const longitude =
                Number(
                    station.longitude
                );


            /* ---------------------------------------------
               SKIP INVALID COORDINATES
            --------------------------------------------- */

            if (
                !Number.isFinite(
                    latitude
                )

                ||

                !Number.isFinite(
                    longitude
                )
            ) {

                console.warn(
                    "Invalid station coordinates:",
                    station
                );

                return;

            }


            /* ---------------------------------------------
               CONFIDENCE COLOR
            --------------------------------------------- */

            const score =
                Math.round(
                    Number(
                        station.confidence_score
                    ) || 0
                );


            let markerColor =
                "#f25d5d";


            if (score >= 90) {

                markerColor =
                    "#41e39b";

            }

            else if (score >= 70) {

                markerColor =
                    "#eebe53";

            }


            /* ---------------------------------------------
               CHARGELENS MARKER
            --------------------------------------------- */

            const markerIcon =
                L.divIcon({

                    className:
                        "chargelens-marker-wrapper",

                    html: `

    <div
        style="
            position:relative;
            width:42px;
            height:42px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#07100d;
            border:3px solid ${markerColor};
            color:${markerColor};
            font-size:10px;
            font-weight:900;
            box-shadow:
                0 0 18px ${markerColor}77,
                0 5px 18px rgba(0,0,0,.55);
        "
    >

        ${score}


        ${
            favoriteStationIds.has(
                Number(
                    station.id
                )
            )

                ? `

                    <div
                        style="
                            position:absolute;
                            top:-10px;
                            right:-9px;
                            width:20px;
                            height:20px;
                            border-radius:50%;
                            display:flex;
                            align-items:center;
                            justify-content:center;
                            background:#07100d;
                            border:2px solid #41e39b;
                            color:#41e39b;
                            font-size:13px;
                            font-weight:900;
                            box-shadow:
                                0 0 10px
                                rgba(65,227,155,.45);
                        "
                    >

                        ★

                    </div>

                `

                : ""
        }

    </div>

`,
                    iconSize:
                        [
                            42,
                            42
                        ],

                    iconAnchor:
                        [
                            21,
                            21
                        ],

                    popupAnchor:
                        [
                            0,
                            -21
                        ]

                });


            /* ---------------------------------------------
               CREATE MARKER
            --------------------------------------------- */

            const marker =
                L.marker(
                    [
                        latitude,
                        longitude
                    ],
                    {
                        icon:
                            markerIcon
                    }
                );


            /* ---------------------------------------------
               POPUP
            --------------------------------------------- */

            marker.bindPopup(`

                <div>

                    <div
                        style="
                            font-size:13px;
                            font-weight:800;
                        "
                    >

                        ${escapeHtml(
                            station.name
                        )}

                    </div>


                    <div
                        style="
                            margin-top:6px;
                            color:${markerColor};
                            font-size:11px;
                            font-weight:800;
                        "
                    >

                        ${score}%
                        Charging Confidence

                    </div>


                    <div
                        style="
                            margin-top:5px;
                            color:#91a39b;
                            font-size:10px;
                        "
                    >

                        ${formatStatus(
                            station.status
                        )}

                    </div>

                </div>

            `);


            /* ---------------------------------------------
               CLICK MARKER
            --------------------------------------------- */

            marker.on(
                "click",
                () => {

                    selectStation(
                        station.id
                    );

                }
            );


            marker.addTo(
                map
            );


            markers[
                station.id
            ] = marker;

        }
    );

}


/* =========================================================
   SELECT STATION
========================================================= */

function selectStation(
    stationId
) {

    const station =
        stations.find(
            item =>
                item.id ===
                stationId
        );


    if (!station) {

        return;

    }


    selectedStation =
        station;


    document
        .querySelectorAll(
            ".station-card"
        )
        .forEach(
            card => {

                card.classList.toggle(
                    "selected",
                    Number(
                        card.dataset.id
                    ) === stationId
                );

            }
        );


    if (
        map &&
        markers[stationId]
    ) {

        map.setView(
            [
                station.latitude,
                station.longitude
            ],
            14,
            {
                animate: true
            }
        );


        markers[
            stationId
        ].openPopup();

    }


    showStationModal(
        station
    );

}


/* =========================================================
   STATION DETAIL MODAL
========================================================= */

async function showStationModal(
    station
) {

    const modal =
        document.getElementById(
            "stationModal"
        );


    const content =
        document.getElementById(
            "modalContent"
        );


    if (!modal || !content) {

        return;

    }


    /* -----------------------------------------------------
       SHOW INITIAL LOADING STATE
    ----------------------------------------------------- */

    content.innerHTML = `

        <div class="section-eyebrow">
            CHARGING STATION
        </div>


        <div class="modal-title">

            ${escapeHtml(
                station.name
            )}

        </div>


        <div class="modal-operator">

            ${escapeHtml(
                station.operator_name
            )}

        </div>


        <div class="loading-state">

            <div class="loading-spinner"></div>

            <p>
                Calculating charging confidence...
            </p>

        </div>

    `;


    modal.classList.add(
        "open"
    );


    /* -----------------------------------------------------
       FETCH CONFIDENCE + REPORT HISTORY
    ----------------------------------------------------- */

    try {

        const [
            confidenceResponse,
            reportsResponse
        ] = await Promise.all([

            fetch(
                `/api/stations/${station.id}/confidence`
            ),

            fetch(
                `/api/stations/${station.id}/reports`
            )

        ]);


        if (
            !confidenceResponse.ok ||
            !reportsResponse.ok
        ) {

            throw new Error(
                "Unable to load station intelligence."
            );

        }


        const confidenceData =
            await confidenceResponse.json();


        const reports =
            await reportsResponse.json();


        renderStationConfidenceModal(
            station,
            confidenceData,
            reports
        );

    }


    catch (error) {

        console.error(
            "Confidence details error:",
            error
        );


        /*
         * Fallback to basic station details.
         */

        renderBasicStationModal(
            station
        );

    }

}


/* =========================================================
   RENDER CONFIDENCE MODAL
========================================================= */

function renderStationConfidenceModal(
    station,
    confidenceData,
    reports
) {

    const modal =
        document.getElementById(
            "stationModal"
        );


    const content =
        document.getElementById(
            "modalContent"
        );


    const confidence =
        confidenceData.confidence;


    const score =
        Math.round(
            confidence.score
        );


    const level =
        confidence.level ||
        "UNKNOWN";


    const factors =
        confidence.factors ||
        {};


    const explanation =
        confidence.explanation ||
        [];


    const scorePercent =
        Math.max(
            0,
            Math.min(
                100,
                score
            )
        );


    const levelClass =
        score >= 70
            ? "good"
            : "";


    content.innerHTML = `

        <div class="section-eyebrow">
            CHARGING STATION
        </div>


        <div class="modal-title">

            ${escapeHtml(
                station.name
            )}

        </div>


        <div class="modal-operator">

            ${escapeHtml(
                station.operator_name
            )}

        </div>


        <!-- =============================================
             CONFIDENCE OVERVIEW
        ============================================== -->

        <div class="confidence-overview">


            <div
                class="confidence-ring"
                style="--score:${scorePercent}%"
            >

                <div
                    class="confidence-ring-content"
                >

                    <div
                        class="confidence-ring-score"
                    >

                        ${score}

                    </div>


                    <div
                        class="confidence-ring-label"
                    >

                        Confidence

                    </div>

                </div>

            </div>


            <div
                class="confidence-overview-info"
            >

                <div
                    class="confidence-level ${levelClass}"
                >

                    ${escapeHtml(
                        level
                    )}

                </div>


                <div
                    class="confidence-description"
                >

                    How confident ChargeLens is
                    that this charger will be
                    reliable when you arrive.

                </div>

            </div>


        </div>


        <!-- =============================================
             WHY THIS SCORE?
        ============================================== -->

        <div
            class="confidence-section-title"
        >

            Why this score?

        </div>


        <div
            class="confidence-factors"
        >

            ${createConfidenceFactor(
                "Recent verification",
                factors.recent_verification
            )}


            ${createConfidenceFactor(
                "Driver reports",
                factors.user_reports
            )}


            ${createConfidenceFactor(
                "Report consistency",
                factors.report_consistency
            )}


            ${createConfidenceFactor(
                "Historical reliability",
                factors.historical_reliability
            )}


            ${createConfidenceFactor(
                "Data freshness",
                factors.data_freshness
            )}


            ${createConfidenceFactor(
                "Current status",
                factors.current_status
            )}

        </div>


        <!-- =============================================
             EXPLANATION
        ============================================== -->

        <div
            class="confidence-section-title"
        >

            ChargeLens analysis

        </div>


        <div
            class="confidence-explanation"
        >

            ${
                explanation.length

                ? explanation
                    .map(
                        item => `

                            <div
                                class="explanation-item"
                            >

                                <span
                                    class="explanation-check"
                                >
                                    ✓
                                </span>

                                <span>
                                    ${escapeHtml(
                                        item
                                    )}
                                </span>

                            </div>

                        `
                    )
                    .join("")

                : `

                    <div
                        class="no-reports"
                    >
                        Not enough information yet.
                    </div>

                `
            }

        </div>


        <!-- =============================================
             RECENT REPORTS
        ============================================== -->

        <div
            class="confidence-section-title"
        >

            Recent driver reports

        </div>


        <div
            class="recent-reports"
        >

            ${
                reports.length

                ? reports
                    .slice(0, 5)
                    .map(
                        report =>
                            createRecentReport(
                                report
                            )
                    )
                    .join("")

                : `

                    <div class="no-reports">

                        No driver reports yet.

                    </div>

                `
            }

        </div>


        <!-- =============================================
             STATION DETAILS
        ============================================== -->

        <div
            class="confidence-section-title"
        >

            Station details

        </div>


        <div class="detail-grid">


            <div class="detail-item">

                <div class="detail-label">
                    Connector
                </div>

                <div class="detail-value">

                    ${escapeHtml(
                        station.connector_type
                    )}

                </div>

            </div>


            <div class="detail-item">

                <div class="detail-label">
                    Charging Power
                </div>

                <div class="detail-value">

                    ${station.power_kw} kW

                </div>

            </div>


            <div class="detail-item">

                <div class="detail-label">
                    Price
                </div>

                <div class="detail-value">

                    ₹${station.price_per_kwh}/kWh

                </div>

            </div>


            <div class="detail-item">

                <div class="detail-label">
                    Last Verified
                </div>

                <div class="detail-value">

                    ${formatLastVerified(
                        station.last_verified_at
                    )}

                </div>

            </div>


        </div>


        <!-- =============================================
             ACTIONS
        ============================================== -->
<div
    class="
        modal-actions
        confidence-details-actions
    "
>

    <button
        class="primary-button"
        id="navigateButton"
        type="button"
    >
        Navigate
    </button>


    <button
        class="secondary-button"
        id="favoriteButton"
        type="button"
    >
        ☆ Save station
    </button>


    <button
        class="secondary-button"
        id="reportButton"
        type="button"
    >
        Report status
    </button>

</div>

    `;


    document
        .getElementById(
            "navigateButton"
        )
        ?.addEventListener(
            "click",
            navigateToStation
        );
        setupFavoriteButton(
    station
);


    document
        .getElementById(
            "reportButton"
        )
        ?.addEventListener(
            "click",
            openReportModal
        );

}


/* =========================================================
   CONFIDENCE FACTOR
========================================================= */

function createConfidenceFactor(
    label,
    value
) {

    const score =
        Math.round(
            Number(value || 0)
        );


    const safeScore =
        Math.max(
            0,
            Math.min(
                100,
                score
            )
        );


    return `

        <div class="confidence-factor">

            <div class="factor-top">

                <span
                    class="factor-name"
                >
                    ${label}
                </span>


                <span
                    class="factor-value"
                >
                    ${safeScore}%
                </span>

            </div>


            <div class="factor-bar">

                <div
                    class="factor-fill"
                    style="width:${safeScore}%"
                ></div>

            </div>

        </div>

    `;

}


/* =========================================================
   RECENT REPORT
========================================================= */

function createRecentReport(
    report
) {

    const type =
        String(
            report.report_type || "unknown"
        ).toLowerCase();


    let dotClass =
        "report-neutral";


    if (
        type === "working" ||
        type === "available"
    ) {

        dotClass =
            "report-positive";

    }


    if (
        type === "busy" ||
        type === "queue"
    ) {

        dotClass =
            "report-warning";

    }


    if (
        type === "broken" ||
        type === "maintenance" ||
        type === "payment_problem" ||
        type === "slow_charging"
    ) {

        dotClass =
            "report-negative";

    }


    return `

        <div
            class="recent-report"
        >

            <div
                class="recent-report-left"
            >

                <span
                    class="
                        recent-report-dot
                        ${dotClass}
                    "
                ></span>


                <span
                    class="recent-report-type"
                >

                    ${formatReportType(
                        type
                    )}

                </span>

            </div>


            <span
                class="recent-report-time"
            >

                ${formatLastVerified(
                    report.created_at
                )}

            </span>

        </div>

    `;

}


/* =========================================================
   REPORT TYPE TEXT
========================================================= */

function formatReportType(
    type
) {

    const labels = {

        working:
            "Working normally",

        available:
            "Working normally",

        busy:
            "Busy / queue",

        queue:
            "Busy / queue",

        broken:
            "Charger not working",

        maintenance:
            "Under maintenance",

        payment_problem:
            "Payment problem",

        slow_charging:
            "Charging slower than expected"

    };


    return (
        labels[type] ||
        "Status report"
    );

}


/* =========================================================
   BASIC FALLBACK MODAL
========================================================= */

function renderBasicStationModal(
    station
) {

    const content =
        document.getElementById(
            "modalContent"
        );


    if (!content) {

        return;

    }


    const scoreClass =
        getScoreClass(
            station.confidence_score
        );


    const statusClass =
        getStatusClass(
            station.status
        );


    content.innerHTML = `

        <div class="modal-title">

            ${escapeHtml(
                station.name
            )}

        </div>


        <div class="modal-operator">

            ${escapeHtml(
                station.operator_name
            )}

        </div>


        <div class="modal-confidence">

            <div>

                <div
                    class="modal-score ${scoreClass}"
                >

                    ${Math.round(
                        station.confidence_score
                    )}%

                </div>


                <div class="modal-score-label">

                    Charging Confidence

                </div>

            </div>


            <div class="status-row">

                <span
                    class="
                        status-dot
                        ${statusClass}
                    "
                ></span>

                ${formatStatus(
                    station.status
                )}

            </div>

        </div>


        <div class="detail-grid">

            <div class="detail-item">

                <div class="detail-label">
                    Connector
                </div>

                <div class="detail-value">

                    ${escapeHtml(
                        station.connector_type
                    )}

                </div>

            </div>


            <div class="detail-item">

                <div class="detail-label">
                    Power
                </div>

                <div class="detail-value">

                    ${station.power_kw} kW

                </div>

            </div>

        </div>

    `;

}


/* =========================================================
   NAVIGATE
========================================================= */

function navigateToStation() {

    if (!selectedStation) {

        return;

    }


    const url =
        `https://www.google.com/maps/dir/?api=1&destination=${selectedStation.latitude},${selectedStation.longitude}`;


    window.open(
        url,
        "_blank"
    );

}


/* =========================================================
   USER LOCATION
========================================================= */

let userLocationMarker = null;

let userLocationCircle = null;


function requestUserLocation() {

    if (locationRequestStarted) {

        return;

    }


    locationRequestStarted =
        true;


    updateHeroLocationState(
        "Detecting your location..."
    );


    if (!navigator.geolocation) {

        updateHeroLocationState(
            "Location unavailable"
        );

        console.warn(
            "ChargeLens: geolocation is not supported by this browser."
        );

        return;

    }


    navigator.geolocation.getCurrentPosition(

        async position => {

            currentUserLocation = {

                latitude:
                    position.coords.latitude,

                longitude:
                    position.coords.longitude,

                accuracy:
                    position.coords.accuracy

            };


            console.log(
                "ChargeLens location access granted.",
                currentUserLocation
            );


            /*
             * Calculate distances to stations.
             */

            updateStationDistances();

            sortStationsByDistance();

            populateConnectorFilter();

            applyStationFilters();


            /*
             * Load nearby stations using
             * the user's actual GPS location.
             */

            await loadNearbyStations();


            /*
             * Show user's location on map.
             */

            showUserLocationOnMap();


            /*
             * Detect city from GPS coordinates.
             */

            await updateHeroLocationFromCoordinates(

                currentUserLocation.latitude,

                currentUserLocation.longitude

            );

        },


        error => {

            console.warn(
                "ChargeLens location access was not granted:",
                error.message
            );


            if (
                error.code ===
                error.PERMISSION_DENIED
            ) {

                updateHeroLocationState(
                    "Location permission needed"
                );

            }

            else {

                updateHeroLocationState(
                    "Location unavailable"
                );

            }

        },


        {

            enableHighAccuracy:
                true,

            timeout:
                10000,

            maximumAge:
                30000

        }

    );

}

/* =========================================================
   SHOW USER LOCATION ON MAP
========================================================= */

function showUserLocationOnMap() {

    if (
        !map ||
        !currentUserLocation
    ) {

        return;

    }


    const latitude =
        Number(
            currentUserLocation.latitude
        );


    const longitude =
        Number(
            currentUserLocation.longitude
        );


    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        return;

    }


    /* -----------------------------------------------------
       REMOVE OLD USER LOCATION
    ----------------------------------------------------- */

    if (userLocationMarker) {

        map.removeLayer(
            userLocationMarker
        );

        userLocationMarker =
            null;

    }


    if (userLocationCircle) {

        map.removeLayer(
            userLocationCircle
        );

        userLocationCircle =
            null;

    }


    /* -----------------------------------------------------
       USER LOCATION ICON
    ----------------------------------------------------- */

    const userIcon =
        L.divIcon({

            className:
                "chargelens-user-location",

            html: `

                <div
                    style="
                        width:18px;
                        height:18px;
                        border-radius:50%;
                        background:#41e39b;
                        border:4px solid #06100c;
                        box-shadow:
                            0 0 0 4px rgba(65,227,155,0.22),
                            0 0 18px rgba(65,227,155,0.65);
                    "
                ></div>

            `,

            iconSize:
                [
                    18,
                    18
                ],

            iconAnchor:
                [
                    9,
                    9
                ]

        });


    /* -----------------------------------------------------
       CREATE USER MARKER
    ----------------------------------------------------- */

    userLocationMarker =
        L.marker(
            [
                latitude,
                longitude
            ],
            {
                icon:
                    userIcon,

                interactive:
                    false
            }
        )
        .addTo(
            map
        );


    /* -----------------------------------------------------
       ACCURACY CIRCLE
    ----------------------------------------------------- */

    if (
        Number.isFinite(
            Number(
                currentUserLocation.accuracy
            )
        )
    ) {

        userLocationCircle =
            L.circle(
                [
                    latitude,
                    longitude
                ],
                {

                    radius:
                        Math.max(
                            20,
                            Number(
                                currentUserLocation.accuracy
                            )
                        ),

                    color:
                        "#41e39b",

                    weight:
                        1,

                    opacity:
                        0.35,

                    fillColor:
                        "#41e39b",

                    fillOpacity:
                        0.05,

                    interactive:
                        false

                }
            )
            .addTo(
                map
            );

    }


    /* -----------------------------------------------------
       CENTER MAP ON USER
    ----------------------------------------------------- */

    map.setView(
        [
            latitude,
            longitude
        ],
        13,
        {
            animate:
                true
        }
    );


    /* -----------------------------------------------------
       MAP SIZE FIX
    ----------------------------------------------------- */

    setTimeout(
        () => {

            if (map) {

                map.invalidateSize(
                    true
                );

            }

        },
        250
    );

}

/* =========================================================
   GET CURRENT USER LOCATION
========================================================= */

function getCurrentUserLocation() {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            if (!navigator.geolocation) {

                reject(
                    new Error(
                        "Location access is not supported by your browser."
                    )
                );

                return;

            }


            navigator.geolocation.getCurrentPosition(

                position => {

                    currentUserLocation = {

    latitude:
        position.coords.latitude,

    longitude:
        position.coords.longitude,

    accuracy:
        position.coords.accuracy

};


updateStationDistances();

sortStationsByDistance();


resolve(
    currentUserLocation
);
                },


                error => {

                    if (
                        error.code ===
                        error.PERMISSION_DENIED
                    ) {

                        reject(
                            new Error(
                                "Location permission is required to report a charging station."
                            )
                        );

                        return;

                    }


                    reject(
                        new Error(
                            "Unable to determine your current location."
                        )
                    );

                },


                {

                    enableHighAccuracy:
                        true,

                    timeout:
                        10000,

                    maximumAge:
                        0

                }

            );

        }
    );

}


/* =========================================================
   REPORT MODAL
========================================================= */

function openReportModal() {

    if (!selectedStation) {

        return;

    }


    if (!userToken) {

        closeStationModal();

        openLoginModal();

        showSignIn();

        return;

    }


    selectedReportType =
        null;


    document
        .querySelectorAll(
            ".report-option"
        )
        .forEach(
            option => {

                option.classList.remove(
                    "selected"
                );

            }
        );


    const stationName =
        document.getElementById(
            "reportStationName"
        );


    if (stationName) {

        stationName.textContent =
            selectedStation.name;

    }


    const comment =
        document.getElementById(
            "reportComment"
        );


    if (comment) {

        comment.value = "";

    }


    const message =
        document.getElementById(
            "reportMessage"
        );


    if (message) {

        message.textContent =
            "";

    }


    document
        .getElementById(
            "reportModal"
        )
        ?.classList.add(
            "open"
        );

}


/* =========================================================
   CLOSE REPORT MODAL
========================================================= */

function closeReportModal() {

    document
        .getElementById(
            "reportModal"
        )
        ?.classList.remove(
            "open"
        );

}


/* =========================================================
   REPORT UI SETUP
========================================================= */

function setupReportUI() {

    document
        .getElementById(
            "reportModalClose"
        )
        ?.addEventListener(
            "click",
            closeReportModal
        );


    document
        .getElementById(
            "reportModal"
        )
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target.id ===
                    "reportModal"
                ) {

                    closeReportModal();

                }

            }
        );


    document
        .querySelectorAll(
            ".report-option"
        )
        .forEach(
            option => {

                option.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".report-option"
                            )
                            .forEach(
                                item => {

                                    item.classList.remove(
                                        "selected"
                                    );

                                }
                            );


                        option.classList.add(
                            "selected"
                        );


                        selectedReportType =
                            option.dataset.reportType;

                    }
                );

            }
        );


    document
        .getElementById(
            "submitReportButton"
        )
        ?.addEventListener(
            "click",
            submitReport
        );

}


/* =========================================================
   SUBMIT REPORT
========================================================= */

async function submitReport() {

    const message =
        document.getElementById(
            "reportMessage"
        );


    if (!selectedStation) {

        return;

    }


    if (!selectedReportType) {

        if (message) {

            message.textContent =
                "Please select what happened at the charger.";

            message.style.color =
                "#f25d5d";

        }

        return;

    }


    if (!userToken) {

        closeReportModal();

        openLoginModal();

        showSignIn();

        return;

    }


    const comment =
        document
            .getElementById(
                "reportComment"
            )
            ?.value
            .trim()
            ||
            null;


    const submitButton =
        document.getElementById(
            "submitReportButton"
        );


    try {

        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.textContent =
                "Checking location...";

        }


        if (message) {

            message.textContent =
                "Checking your current location...";

            message.style.color =
                "#8fa29a";

        }


        /*
         * Get a fresh GPS reading at report time.
         */

        const location =
            await getCurrentUserLocation();


        if (message) {

            message.textContent =
                "Location received. Checking station proximity...";

        }


        if (submitButton) {

            submitButton.textContent =
                "Submitting...";

        }


        const response =
            await fetch(
                "/api/reports",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${userToken}`

                    },

                    body:
                        JSON.stringify({

                            station_id:
                                selectedStation.id,

                            report_type:
                                selectedReportType,

                            comment:
                                comment,

                            latitude:
                                location.latitude,

                            longitude:
                                location.longitude

                        })

                }
            );


        const data =
            await response.json();


        if (
            response.status ===
            401
        ) {

            localStorage.removeItem(
                "chargelens_token"
            );


            userToken =
                null;


            throw new Error(
                "Your session has expired. Please sign in again."
            );

        }


        if (
            response.status ===
            403
        ) {

            throw new Error(
                data.detail ||
                "You must be near this charging station to submit a report."
            );

        }


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Unable to submit report."
            );

        }


        if (message) {

            const distance =
                Number(
                    data?.station?.distance_meters
                );


            if (
                Number.isFinite(
                    distance
                )
            ) {

                message.textContent =
                    `Thanks! Report recorded. You were ${Math.round(distance)}m from the station.`;

            }

            else {

                message.textContent =
                    "Thanks! Your report has been recorded.";

            }


            message.style.color =
                "#41e39b";

        }


        /*
         * Refresh station status and confidence.
         */

        await loadStations();


        /*
         * Close after a short delay.
         */

        setTimeout(
            () => {

                closeReportModal();

            },
            1400
        );

    }


    catch (error) {

        console.error(
            "Report error:",
            error
        );


        if (message) {

            message.textContent =
                error.message ||
                "Unable to submit report.";

            message.style.color =
                "#f25d5d";

        }

    }


    finally {

        if (submitButton) {

            submitButton.disabled =
                false;

            submitButton.textContent =
                "Submit report";

        }

    }

}


/* =========================================================
   AUTHENTICATION
========================================================= */

function openLoginModal() {

    document
        .getElementById(
            "loginModal"
        )
        ?.classList.add(
            "open"
        );

}


function closeLoginModal() {

    document
        .getElementById(
            "loginModal"
        )
        ?.classList.remove(
            "open"
        );

}

function showSignIn() {

    document
        .getElementById("signInTab")
        ?.classList.add("active");

    document
        .getElementById("signUpTab")
        ?.classList.remove("active");

    document
        .getElementById("authTabs")
        ?.classList.remove("hidden");

    document
        .getElementById("loginForm")
        ?.classList.remove("hidden");

    document
        .getElementById("registerStepEmail")
        ?.classList.add("hidden");

    document
        .getElementById("registerStepCode")
        ?.classList.add("hidden");

    document
        .getElementById("registerPasswordForm")
        ?.classList.add("hidden");

    const title =
        document.getElementById("authTitle");

    const subtitle =
        document.getElementById("authSubtitle");

    if (title) {
        title.textContent =
            "Welcome back to ChargeLens";
    }

    if (subtitle) {
        subtitle.textContent =
            "Sign in to continue to your ChargeLens experience.";
    }
}


function showSignUp() {

    document
        .getElementById("signUpTab")
        ?.classList.add("active");

    document
        .getElementById("signInTab")
        ?.classList.remove("active");


    document
        .getElementById("authTabs")
        ?.classList.remove("hidden");


    document
        .getElementById("loginForm")
        ?.classList.add("hidden");

    document
        .getElementById("registerStepEmail")
        ?.classList.remove("hidden");

    document
        .getElementById("registerStepCode")
        ?.classList.add("hidden");

    document
        .getElementById("registerPasswordForm")
        ?.classList.add("hidden");


    const title =
        document.getElementById("authTitle");

    const subtitle =
        document.getElementById("authSubtitle");


    if (title) {
        title.textContent =
            "Create your ChargeLens account";
    }

    if (subtitle) {
        subtitle.textContent =
            "Verify your email first, then your account opens automatically.";
    }

}

/* =========================================================
   LOGIN
========================================================= */

async function loginUser(
    email,
    password
) {

    const response =
        await fetch(
            "/api/auth/login",
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json"

                },

                body:
                    JSON.stringify({

                        email:
                            email,

                        password:
                            password

                    })

            }
        );


    let data = null;


    try {

        data =
            await response.json();

    }

    catch {

        data = {};

    }


    if (!response.ok) {

        let message =
            "Login failed.";


        if (
            typeof data.detail ===
            "string"
        ) {

            message =
                data.detail;

        }


        else if (
            Array.isArray(
                data.detail
            )
        ) {

            message =
                data.detail
                    .map(
                        item => {

                            if (
                                typeof item ===
                                "string"
                            ) {

                                return item;

                            }


                            return (
                                item.msg ||
                                item.message ||
                                "Invalid request."
                            );

                        }
                    )
                    .join(", ");

        }


        else if (
            data.detail &&
            typeof data.detail ===
                "object"
        ) {

            message =
                data.detail.message ||
                data.detail.msg ||
                JSON.stringify(
                    data.detail
                );

        }


        throw new Error(
            message
        );

    }


    if (!data.access_token) {

        throw new Error(
            "Login succeeded but no access token was returned."
        );

    }


    userToken =
        data.access_token;


    localStorage.setItem(
        "chargelens_token",
        userToken
    );

    return data;

}

async function requestVerificationCode(email) {

    const response =
        await fetch(
            "/api/auth/request-code",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    email: email
                })
            }
        );

    let data = {};

    try {
        data = await response.json();
    }
    catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.detail ||
            "Unable to send verification code."
        );
    }

    return data;
}


async function verifyVerificationCode(
    email,
    code
) {

    const response =
        await fetch(
            "/api/auth/verify-code",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    email: email,
                    code: code
                })
            }
        );

    let data = {};

    try {
        data = await response.json();
    }
    catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.detail ||
            "Unable to verify the verification code."
        );
    }

    return data;
}


async function registerVerifiedUser(
    email,
    password,
    verificationToken
) {

    const response =
        await fetch(
            "/api/auth/register-verified",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    email: email,
                    password: password,
                    verification_token:
                        verificationToken
                })
            }
        );

    let data = {};

    try {
        data = await response.json();
    }
    catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.detail ||
            "Unable to create account."
        );
    }

    if (!data.access_token) {
        throw new Error(
            "Account created but no login token was returned."
        );
    }

    userToken =
        data.access_token;

    localStorage.setItem(
        "chargelens_token",
        userToken
    );

    return data;
}


/* -------------------------------------------------------
   CREATE ACCOUNT — SEND VERIFICATION CODE
------------------------------------------------------- */

document
    .getElementById(
        "sendVerificationButton"
    )
    ?.addEventListener(
        "click",
        async () => {

            const email =
                document
                    .getElementById(
                        "registerEmail"
                    )
                    .value
                    .trim();

            const message =
                document.getElementById(
                    "registerMessage"
                );


            if (!email) {

                message.textContent =
                    "Please enter your email.";

                message.style.color =
                    "#f25d5d";

                return;
            }


            message.textContent =
                "Sending verification code...";

            message.style.color =
                "#8fa29a";


            try {

                await requestVerificationCode(
                    email
                );


                verificationEmail =
                    email;


                document
                    .getElementById(
                        "verificationEmail"
                    )
                    .textContent =
                    email;


                document
                    .getElementById(
                        "registerStepEmail"
                    )
                    .classList.add(
                        "hidden"
                    );


                document
                    .getElementById(
                        "registerStepCode"
                    )
                    .classList.remove(
                        "hidden"
                    );


                message.textContent = "";

            }
            catch (error) {

                console.error(
                    "Verification code error:",
                    error
                );

                message.textContent =
                    error.message ||
                    "Unable to send verification code.";

                message.style.color =
                    "#f25d5d";
            }
        }
    );


/* -------------------------------------------------------
   CREATE ACCOUNT — VERIFY CODE
------------------------------------------------------- */

document
    .getElementById(
        "verifyCodeButton"
    )
    ?.addEventListener(
        "click",
        async () => {

            const email =
                verificationEmail ||
                document
                    .getElementById(
                        "registerEmail"
                    )
                    .value
                    .trim();

            const code =
                document
                    .getElementById(
                        "verificationCode"
                    )
                    .value
                    .trim();

            const message =
                document.getElementById(
                    "verificationMessage"
                );


            if (!/^\d{6}$/.test(code)) {

                message.textContent =
                    "Enter the 6-digit verification code.";

                message.style.color =
                    "#f25d5d";

                return;
            }


            message.textContent =
                "Verifying email...";

            message.style.color =
                "#8fa29a";


            try {

                const data =
                    await verifyVerificationCode(
                        email,
                        code
                    );


                verificationToken =
                    data.verification_token;


                document
                    .getElementById(
                        "verifiedRegisterEmail"
                    )
                    .value =
                    email;


                document
                    .getElementById(
                        "registerStepCode"
                    )
                    .classList.add(
                        "hidden"
                    );


                document
                    .getElementById(
                        "registerPasswordForm"
                    )
                    .classList.remove(
                        "hidden"
                    );


                message.textContent =
                    "Email verified successfully.";

                message.style.color =
                    "#41e39b";

            }
            catch (error) {

                console.error(
                    "Verification error:",
                    error
                );

                message.textContent =
                    error.message ||
                    "Verification failed.";

                message.style.color =
                    "#f25d5d";
            }
        }
    );


/* -------------------------------------------------------
   CREATE ACCOUNT — FINAL PASSWORD
------------------------------------------------------- */

document
    .getElementById(
        "registerPasswordForm"
    )
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const email =
                document
                    .getElementById(
                        "verifiedRegisterEmail"
                    )
                    .value
                    .trim();


            const password =
                document
                    .getElementById(
                        "verifiedRegisterPassword"
                    )
                    .value;


            const confirmation =
                document
                    .getElementById(
                        "verifiedRegisterConfirmPassword"
                    )
                    .value;


            const message =
                document.getElementById(
                    "passwordRegisterMessage"
                );


            if (password.length < 8) {

                message.textContent =
                    "Password must be at least 8 characters.";

                message.style.color =
                    "#f25d5d";

                return;
            }


            if (password !== confirmation) {

                message.textContent =
                    "Passwords do not match.";

                message.style.color =
                    "#f25d5d";

                return;
            }


            if (!verificationToken) {

                message.textContent =
                    "Email verification has expired. Please start again.";

                message.style.color =
                    "#f25d5d";

                return;
            }


            message.textContent =
                "Creating your account...";

            message.style.color =
                "#8fa29a";


            try {

                await registerVerifiedUser(
                    email,
                    password,
                    verificationToken
                );


                message.textContent =
                    "Account created. Welcome to ChargeLens!";

                message.style.color =
                    "#41e39b";


                setTimeout(
                    () => {

                        closeLoginModal();


                        document
                            .getElementById(
                                "registerPasswordForm"
                            )
                            .reset();


                        document
                            .getElementById(
                                "verificationCode"
                            )
                            .value =
                            "";


                        verificationToken =
                            null;

                        verificationEmail =
                            null;

                    },
                    700
                );

            }
            catch (error) {

                console.error(
                    "Account creation error:",
                    error
                );

                message.textContent =
                    error.message ||
                    "Unable to create account.";

                message.style.color =
                    "#f25d5d";
            }
        }
    );


/* -------------------------------------------------------
   RESEND VERIFICATION CODE
------------------------------------------------------- */

document
    .getElementById(
        "resendCodeButton"
    )
    ?.addEventListener(
        "click",
        async () => {

            const email =
                verificationEmail ||
                document
                    .getElementById(
                        "registerEmail"
                    )
                    .value
                    .trim();

            const message =
                document.getElementById(
                    "verificationMessage"
                );


            if (!email) {
                return;
            }


            const button =
                document.getElementById(
                    "resendCodeButton"
                );


            button.disabled =
                true;

            button.textContent =
                "Sending...";


            try {

                await requestVerificationCode(
                    email
                );


                message.textContent =
                    "A new verification code was sent.";

                message.style.color =
                    "#41e39b";

            }
            catch (error) {

                message.textContent =
                    error.message ||
                    "Unable to resend code.";

                message.style.color =
                    "#f25d5d";
            }
            finally {

                setTimeout(
                    () => {

                        button.disabled =
                            false;

                        button.textContent =
                            "Resend code";

                    },
                    60000
                );
            }
        }
    );

    /* =========================================================
   AUTHENTICATED USER NAVBAR / PROFILE
========================================================= */

async function loadCurrentUser() {

    if (!userToken) {

        currentUser = null;

        updateAuthNavbar();

        return null;
    }


    try {

        const response =
            await fetch(
                "/api/me",
                {
                    headers: {
                        "Authorization":
                            `Bearer ${userToken}`
                    },
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            if (
                response.status === 401
            ) {

                localStorage.removeItem(
                    "chargelens_token"
                );

                userToken = null;

                currentUser = null;

                updateAuthNavbar();
            }

            return null;
        }


        currentUser =
            await response.json();


        updateAuthNavbar();

        return currentUser;

    }
    catch (error) {

        console.warn(
            "Unable to load current user:",
            error
        );

        return null;
    }
}


/* =========================================================
   UPDATE NAVBAR
========================================================= */

function updateAuthNavbar() {

    const navRight =
        document.querySelector(
            ".nav-right"
        );


    if (!navRight) {

        return;
    }


    /* -----------------------------------------------------
       LOGGED OUT
    ----------------------------------------------------- */

    if (!userToken || !currentUser) {

        navRight.innerHTML = `

            <button
                class="login-button"
                id="loginButton"
                type="button"
            >
                Sign in
            </button>

            <button
                class="create-account-button"
                id="createAccountButton"
                type="button"
            >
                Create account
            </button>

        `;


        setupAuthNavbarButtons();

        return;
    }


    /* -----------------------------------------------------
       LOGGED IN
    ----------------------------------------------------- */

    const email =
        currentUser.email ||
        "ChargeLens user";


    const displayName =
        email
            .split("@")[0]
            .replace(/[._-]+/g, " ")
            .replace(
                /\b\w/g,
                character =>
                    character.toUpperCase()
            );


    const initial =
        displayName
            .charAt(0)
            .toUpperCase() ||
        "U";


    navRight.innerHTML = `

        <div
            class="profile-menu-wrapper"
            id="profileMenuWrapper"
        >

            <button
                type="button"
                class="profile-button"
                id="profileButton"
                aria-expanded="false"
            >

                <span
                    class="profile-avatar"
                >
                    ${escapeHtml(initial)}
                </span>

                <span
                    class="profile-button-name"
                >
                    ${escapeHtml(displayName)}
                </span>

                <span
                    class="profile-chevron"
                >
                    ▾
                </span>

            </button>


            <div
                class="profile-dropdown"
                id="profileDropdown"
            >

                <div
                    class="profile-dropdown-header"
                >

                    <div
                        class="profile-dropdown-avatar"
                    >
                        ${escapeHtml(initial)}
                    </div>

                    <div>

                        <strong>
                            ${escapeHtml(displayName)}
                        </strong>

                        <small>
                            ${escapeHtml(email)}
                        </small>

                        <span
                            class="profile-verified-badge"
                        >
                            ✓ Verified
                        </span>

                    </div>

                </div>


                <div
                    class="profile-dropdown-divider"
                ></div>


                <button
                    type="button"
                    class="profile-menu-item"
                    id="profileViewButton"
                >
                    <span>👤</span>
                    My profile
                </button>


                <button
                    type="button"
                    class="profile-menu-item"
                    id="profileReportsButton"
                >
                    <span>📋</span>
                    My reports
                </button>


                <button
                    type="button"
                    class="profile-menu-item"
                    id="profileSavedButton"
                >
                    <span>☆</span>
                    Saved stations
                </button>


                <div
                    class="profile-dropdown-divider"
                ></div>


                <button
                    type="button"
                    class="profile-menu-item profile-logout"
                    id="logoutButton"
                >
                    <span>↪</span>
                    Sign out
                </button>

            </div>

        </div>
    `;


    setupProfileMenu();
}


/* =========================================================
   AUTH NAVBAR BUTTONS
========================================================= */

function setupAuthNavbarButtons() {

    document
        .getElementById(
            "loginButton"
        )
        ?.addEventListener(
            "click",
            () => {

                openLoginModal();

                showSignIn();

            }
        );


    document
        .getElementById(
            "createAccountButton"
        )
        ?.addEventListener(
            "click",
            () => {

                openLoginModal();

                showSignUp();

            }
        );
}


/* =========================================================
   PROFILE MENU
========================================================= */

function setupProfileMenu() {

    const button =
        document.getElementById(
            "profileButton"
        );

    const dropdown =
        document.getElementById(
            "profileDropdown"
        );


    if (!button || !dropdown) {

        return;
    }


    button.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            const isOpen =
                dropdown.classList.toggle(
                    "open"
                );


            button.setAttribute(
                "aria-expanded",
                String(isOpen)
            );
        }
    );


    document.addEventListener(
        "click",
        event => {

            if (
                !event.target.closest(
                    "#profileMenuWrapper"
                )
            ) {

                dropdown.classList.remove(
                    "open"
                );

                button.setAttribute(
                    "aria-expanded",
                    "false"
                );
            }
        }
    );


    document
        .getElementById(
            "profileViewButton"
        )
        ?.addEventListener(
            "click",
            () => {

                dropdown.classList.remove(
                    "open"
                );

                openProfileModal();

            }
        );


    document
        .getElementById(
            "profileReportsButton"
        )
        ?.addEventListener(
            "click",
            () => {

                dropdown.classList.remove(
                    "open"
                );

                openProfileModal(
                    "reports"
                );

            }
        );


    document
        .getElementById(
            "profileSavedButton"
        )
        ?.addEventListener(
            "click",
            () => {

                dropdown.classList.remove(
                    "open"
                );

                openProfileModal(
                    "saved"
                );

            }
        );


    document
        .getElementById(
            "logoutButton"
        )
        ?.addEventListener(
            "click",
            logoutUser
        );
}


/* =========================================================
   PROFILE MODAL
========================================================= */

function ensureProfileModal() {

    if (
        document.getElementById(
            "profileModal"
        )
    ) {

        return;
    }


    const overlay =
        document.createElement(
            "div"
        );


    overlay.id =
        "profileModal";

    overlay.className =
        "modal-overlay";


    overlay.innerHTML = `

        <div
            class="profile-modal"
        >

            <button
                type="button"
                class="modal-close"
                id="profileModalClose"
                aria-label="Close profile"
            >
                ×
            </button>


            <div
                class="profile-modal-top"
            >

                <div
                    class="profile-modal-avatar"
                    id="profileModalAvatar"
                >
                    U
                </div>

                <div>

                    <div
                        class="profile-modal-name"
                        id="profileModalName"
                    >
                        ChargeLens user
                    </div>

                    <div
                        class="profile-modal-email"
                        id="profileModalEmail"
                    >
                        user@example.com
                    </div>

                    <div
                        class="profile-modal-status"
                    >
                        ✓ Verified account
                    </div>

                </div>

            </div>


            <div
                class="profile-stat-grid"
            >

                <div
                    class="profile-stat"
                >
                    <strong
                        id="profileReportCount"
                    >
                        —
                    </strong>
                    <span>
                        Reports
                    </span>
                </div>


                <div
                    class="profile-stat"
                >
                    <strong
                        id="profileSavedCount"
                    >
                        —
                    </strong>
                    <span>
                        Saved
                    </span>
                </div>


                <div
                    class="profile-stat"
                >
                    <strong
                        id="profileCommunityCount"
                    >
                        —
                    </strong>
                    <span>
                        Community
                    </span>
                </div>

            </div>


            <div
                class="profile-modal-section"
            >

                <div
                    class="profile-section-title"
                >
                    Account
                </div>


                <div
                    class="profile-detail-row"
                >
                    <span>Email</span>
                    <strong
                        id="profileDetailEmail"
                    >
                        —
                    </strong>
                </div>


                <div
                    class="profile-detail-row"
                >
                    <span>Status</span>
                    <strong>
                        Verified
                    </strong>
                </div>


                <div
                    class="profile-detail-row"
                >
                    <span>Role</span>
                    <strong
                        id="profileDetailRole"
                    >
                        User
                    </strong>
                </div>

            </div>


            <button
                type="button"
                class="profile-modal-logout"
                id="profileModalLogout"
            >
                Sign out
            </button>

        </div>
    `;


    document.body.appendChild(
        overlay
    );


    document
        .getElementById(
            "profileModalClose"
        )
        ?.addEventListener(
            "click",
            closeProfileModal
        );


    overlay.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                overlay
            ) {

                closeProfileModal();

            }
        }
    );


    document
        .getElementById(
            "profileModalLogout"
        )
        ?.addEventListener(
            "click",
            logoutUser
        );
}


/* =========================================================
   OPEN PROFILE
========================================================= */

async function openProfileModal(
    section = "profile"
) {

    ensureProfileModal();


    if (
        !currentUser
    ) {

        return;
    }


    const modal =
        document.getElementById(
            "profileModal"
        );


    const email =
        currentUser.email ||
        "ChargeLens user";


    const displayName =
        email
            .split("@")[0]
            .replace(/[._-]+/g, " ")
            .replace(
                /\b\w/g,
                character =>
                    character.toUpperCase()
            );


    const initial =
        displayName
            .charAt(0)
            .toUpperCase() ||
        "U";


    document
        .getElementById(
            "profileModalAvatar"
        )
        .textContent =
        initial;


    document
        .getElementById(
            "profileModalName"
        )
        .textContent =
        displayName;


    document
        .getElementById(
            "profileModalEmail"
        )
        .textContent =
        email;


    document
        .getElementById(
            "profileDetailEmail"
        )
        .textContent =
        email;


    document
        .getElementById(
            "profileDetailRole"
        )
        .textContent =
        currentUser.role || "user";


    /* Basic profile counts.
       These are intentionally safe defaults
       until dedicated profile statistics
       endpoints are added. */

    try {

    const activityResponse =
        await fetch(
            "/api/me/activity",
            {
                headers: {
                    "Authorization":
                        `Bearer ${userToken}`
                },

                cache:
                    "no-store"
            }
        );


    if (!activityResponse.ok) {

        throw new Error(
            "Unable to load profile activity."
        );

    }


    const activity =
        await activityResponse.json();


    document
        .getElementById(
            "profileReportCount"
        )
        .textContent =
        activity.reports ?? 0;


    document
        .getElementById(
            "profileSavedCount"
        )
        .textContent =
        activity.saved_stations ?? 0;


    document
        .getElementById(
            "profileCommunityCount"
        )
        .textContent =
        activity.community_activity ?? 0;

}
catch (error) {

    console.warn(
        "Profile activity loading failed:",
        error
    );


    document
        .getElementById(
            "profileReportCount"
        )
        .textContent =
        "0";


    document
        .getElementById(
            "profileSavedCount"
        )
        .textContent =
        "0";


    document
        .getElementById(
            "profileCommunityCount"
        )
        .textContent =
        "0";
}

    modal.classList.add(
        "open"
    );
}


/* =========================================================
   CLOSE PROFILE
========================================================= */

function closeProfileModal() {

    document
        .getElementById(
            "profileModal"
        )
        ?.classList.remove(
            "open"
        );
}


/* =========================================================
   LOGOUT
========================================================= */

function logoutUser() {

    localStorage.removeItem(
        "chargelens_token"
    );

    userToken =
        null;

    currentUser =
        null;


    closeProfileModal();


    updateAuthNavbar();


    console.log(
        "ChargeLens: user signed out."
    );
}


/* =========================================================
   INITIAL AUTH STATE
========================================================= */

async function initializeAuthentication() {

    ensureProfileModal();

    await loadCurrentUser();

}

/* =========================================================
   UI EVENTS
========================================================= */

function setupUI() {

 setupAuthNavbarButtons();


    document
        .getElementById(
            "modalClose"
        )
        ?.addEventListener(
            "click",
            closeStationModal
        );


    document
        .getElementById(
            "loginClose"
        )
        ?.addEventListener(
            "click",
            closeLoginModal
        );


    document
        .getElementById(
            "signInTab"
        )
        ?.addEventListener(
            "click",
            showSignIn
        );


    document
        .getElementById(
            "signUpTab"
        )
        ?.addEventListener(
            "click",
            showSignUp
        );


    document
    .getElementById(
        "loginForm"
    )
    ?.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const email =
                document
                    .getElementById(
                        "loginEmail"
                    )
                    .value
                    .trim();


            const password =
                document
                    .getElementById(
                        "loginPassword"
                    )
                    .value;


            const error =
                document.getElementById(
                    "loginError"
                );


            if (error) {
                error.textContent = "";
            }


            try {

                await loginUser(
                    email,
                    password
                );


                /* ---------------------------------------------
                   GET CURRENT USER
                --------------------------------------------- */

                const meResponse =
                    await fetch(
                        "/api/me",
                        {
                            headers: {
                                "Authorization":
                                    `Bearer ${userToken}`
                            }
                        }
                    );


                if (!meResponse.ok) {

                    throw new Error(
                        "Unable to verify your account."
                    );

                }


                currentUser =
                    await meResponse.json();


                /* ---------------------------------------------
                   ADMIN / OWNER
                --------------------------------------------- */

                if (
                    currentUser.role ===
                        "owner"
                    ||
                    currentUser.role ===
                        "admin"
                ) {

                    window.location.href =
                        "/admin/";

                    return;
                }


                /* ---------------------------------------------
                   NORMAL DRIVER
                --------------------------------------------- */

                closeLoginModal();


                document
                    .getElementById(
                        "loginForm"
                    )
                    .reset();


                /*
                 * Refresh navbar/profile state.
                 */

                updateAuthNavbar();


                console.log(
                    "ChargeLens: signed in successfully."
                );

            }

            catch (errorObject) {

                console.error(
                    "ChargeLens login error:",
                    errorObject
                );


                if (error) {

                    error.textContent =
                        errorObject.message ||
                        "Unable to sign in.";

                }

            }

        }
    );
    /* -------------------------------------------------------
       SEARCH
    ------------------------------------------------------- */

    document
        .getElementById(
            "searchButton"
        )
        ?.addEventListener(
            "click",
            performSearch
        );


    document
        .getElementById(
            "searchInput"
        )
        ?.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter"
                ) {

                    performSearch();

                }

            }
        );


    /* -------------------------------------------------------
       FILTER
    ------------------------------------------------------- */

    document
        .getElementById(
            "filterButton"
        )
        ?.addEventListener(
            "click",
            () => {

                alert(
                    "Smart filters are coming next."
                );

            }
        );


    /* -------------------------------------------------------
       START EXPLORING
    ------------------------------------------------------- */

    document
        .getElementById(
            "startExploringButton"
        )
        ?.addEventListener(
            "click",
            () => {

                document
                    .querySelector(
                        ".app-section"
                    )
                    ?.scrollIntoView(
                        {
                            behavior:
                                "smooth"
                        }
                    );

            }
        );


    /* -------------------------------------------------------
       CLOSE STATION MODAL
    ------------------------------------------------------- */

    document
        .getElementById(
            "stationModal"
        )
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target.id ===
                    "stationModal"
                ) {

                    closeStationModal();

                }

            }
        );


    /* -------------------------------------------------------
       CLOSE AUTH MODAL
    ------------------------------------------------------- */

    document
        .getElementById(
            "loginModal"
        )
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target.id ===
                    "loginModal"
                ) {

                    closeLoginModal();

                }

            }
        );

}


/* =========================================================
   SEARCH
========================================================= */

function performSearch() {

    const input =
        document.getElementById(
            "searchInput"
        );


    if (!input || !map) {

        return;

    }


    const query =
        input.value
            .trim()
            .toLowerCase();


    if (!query) {

        map.setView(
            [
                12.9716,
                77.5946
            ],
            12
        );

        return;

    }


    const results =
        stations.filter(
            station => {

                const name =
                    String(
                        station.name ??
                        ""
                    ).toLowerCase();


                const operator =
                    String(
                        station.operator_name ??
                        ""
                    ).toLowerCase();


                const address =
                    String(
                        station.address ??
                        ""
                    ).toLowerCase();


                return (
                    name.includes(query) ||
                    operator.includes(query) ||
                    address.includes(query)
                );

            }
        );


    if (!results.length) {

        alert(
            "No matching charging station found."
        );

        return;

    }


    if (results.length === 1) {

        selectStation(
            results[0].id
        );

        return;

    }


    const bounds =
        L.latLngBounds(
            results.map(
                station => [
                    station.latitude,
                    station.longitude
                ]
            )
        );


    map.fitBounds(
        bounds,
        {
            padding:
                [
                    50,
                    50
                ]
        }
    );

}


/* =========================================================
   CLOSE STATION MODAL
========================================================= */

function closeStationModal() {

    document
        .getElementById(
            "stationModal"
        )
        ?.classList.remove(
            "open"
        );

}


/* =========================================================
   SCORE
========================================================= */

function getScoreClass(
    score
) {

    const value =
        Number(score);


    if (value >= 90) {

        return "high";

    }


    if (value >= 70) {

        return "medium";

    }


    return "low";

}


/* =========================================================
   STATUS
========================================================= */

function getStatusClass(
    status
) {

    const value =
        String(status)
            .toLowerCase();


    if (
        value === "available" ||
        value === "working"
    ) {

        return "available";

    }


    if (
        value === "busy" ||
        value === "queue"
    ) {

        return "busy";

    }


    if (
        value === "maintenance" ||
        value === "broken"
    ) {

        return "maintenance";

    }


    return "unknown";

}


function formatStatus(
    status
) {

    const value =
        String(status)
            .toLowerCase();


    const labels = {

        available:
            "Available",

        working:
            "Working normally",

        busy:
            "Busy / possible queue",

        maintenance:
            "Under maintenance",

        broken:
            "Reported not working",

        unknown:
            "Status unknown"

    };


    return (
        labels[value] ||
        "Status unknown"
    );

}


/* =========================================================
   LAST VERIFIED
========================================================= */

function formatLastVerified(
    timestamp
) {

    if (!timestamp) {

        return "Not verified yet";

    }


    const date =
        new Date(timestamp);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "Recently";

    }


    const minutes =
        Math.floor(
            (
                Date.now() -
                date.getTime()
            ) / 60000
        );


    if (minutes < 1) {

        return "Just now";

    }


    if (minutes < 60) {

        return `${minutes} min ago`;

    }


    const hours =
        Math.floor(
            minutes / 60
        );


    if (hours < 24) {

        return `${hours} hr ago`;

    }


    return date.toLocaleDateString();

}


/* =========================================================
   HTML SAFETY
========================================================= */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}

/* =========================================================
   EV COMMUNITY
========================================================= */

let communityPosts = [];

let communityCategory =
    "all";


/* =========================================================
   SETUP COMMUNITY
========================================================= */

function setupCommunity() {

    createCommunityNavigation();

    createCommunitySection();

    createCommunityModal();

    loadCommunityPosts();

}


/* =========================================================
   COMMUNITY NAVIGATION
========================================================= */

function createCommunityNavigation() {

    const nav =
        document.querySelector(
            ".nav-links"
        );

    if (!nav) {

        return;

    }


    if (
        document.getElementById(
            "communityNavLink"
        )
    ) {

        return;

    }


    const link =
        document.createElement(
            "a"
        );


    link.id =
        "communityNavLink";


    link.href =
        "#community";


    link.className =
        "nav-link";


    link.textContent =
        "EV Community";


    link.addEventListener(
        "click",
        event => {

            event.preventDefault();

            document
                .getElementById(
                    "community"
                )
                ?.scrollIntoView({
                    behavior:
                        "smooth"
                });

        }
    );


    nav.appendChild(
        link
    );

}


/* =========================================================
   COMMUNITY SECTION
========================================================= */

function createCommunitySection() {

    if (
        document.getElementById(
            "community"
        )
    ) {

        return;

    }


    const main =
        document.querySelector(
            "main"
        );


    const howSection =
        document.getElementById(
            "how-it-works"
        );


    if (!main) {

        return;

    }


    const section =
        document.createElement(
            "section"
        );


    section.id =
        "community";


    section.className =
        "community-section";


    section.innerHTML = `

        <div class="community-header">

            <div>

                <p class="section-eyebrow">
                    EV COMMUNITY
                </p>


                <h2>
                    Talk. Share. Help other EV drivers.
                </h2>


                <p>
                    Ask questions, share charging experiences,
                    report useful tips and help the EV community.
                </p>

            </div>


            <button
                type="button"
                class="primary-button"
                id="createCommunityPostButton"
            >
                + Create Post
            </button>

        </div>


        <div class="community-controls">

            <button
                type="button"
                class="community-filter active"
                data-community-category="all"
            >
                All
            </button>


            <button
                type="button"
                class="community-filter"
                data-community-category="charging"
            >
                Charging
            </button>


            <button
                type="button"
                class="community-filter"
                data-community-category="stations"
            >
                Stations
            </button>


            <button
                type="button"
                class="community-filter"
                data-community-category="road_trip"
            >
                Road Trips
            </button>


            <button
                type="button"
                class="community-filter"
                data-community-category="ev_tips"
            >
                EV Tips
            </button>


            <button
                type="button"
                class="community-filter"
                data-community-category="help"
            >
                Help
            </button>


            <button
                type="button"
                class="community-filter"
                data-community-category="news"
            >
                News
            </button>

        </div>


        <div
            id="communityPosts"
            class="community-posts"
        >

            <div class="loading-state">

                <div class="loading-spinner"></div>

                <p>
                    Loading EV Community...
                </p>

            </div>

        </div>

    `;


    if (howSection) {

        main.insertBefore(
            section,
            howSection
        );

    }

    else {

        main.appendChild(
            section
        );

    }


    document
        .getElementById(
            "createCommunityPostButton"
        )
        ?.addEventListener(
            "click",
            openCreateCommunityPost
        );


    document
        .querySelectorAll(
            ".community-filter"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        communityCategory =
                            button.dataset
                                .communityCategory;

                        document
                            .querySelectorAll(
                                ".community-filter"
                            )
                            .forEach(
                                item => {

                                    item.classList.toggle(
                                        "active",
                                        item ===
                                            button
                                    );

                                }
                            );

                        renderCommunityPosts();

                    }
                );

            }
        );

}


/* =========================================================
   COMMUNITY POST MODAL
========================================================= */

function createCommunityModal() {

    if (
        document.getElementById(
            "communityPostModal"
        )
    ) {

        return;

    }


    const modal =
        document.createElement(
            "div"
        );


    modal.id =
        "communityPostModal";


    modal.className =
        "modal-overlay";


    modal.innerHTML = `

        <div class="community-modal">

            <button
                type="button"
                class="modal-close"
                id="communityModalClose"
            >
                ×
            </button>


            <div id="communityModalContent">

                <div class="section-eyebrow">
                    EV COMMUNITY
                </div>

            </div>

        </div>

    `;


    document.body.appendChild(
        modal
    );


    document
        .getElementById(
            "communityModalClose"
        )
        ?.addEventListener(
            "click",
            closeCommunityModal
        );


    modal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                modal
            ) {

                closeCommunityModal();

            }

        }
    );

}


/* =========================================================
   LOAD COMMUNITY POSTS
========================================================= */

async function loadCommunityPosts() {

    const container =
        document.getElementById(
            "communityPosts"
        );


    if (!container) {

        return;

    }


    try {

        const response =
            await fetch(
                `${API_BASE}/api/community/posts`,
                {
                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Unable to load community posts."
            );

        }


        communityPosts =
            await response.json();


        renderCommunityPosts();

    }

    catch (error) {

        console.error(
            "Community loading error:",
            error
        );


        container.innerHTML = `

            <div class="loading-state">

                <p>
                    Unable to load EV Community.
                </p>

                <button
                    type="button"
                    class="secondary-button"
                    id="retryCommunityButton"
                >
                    Retry
                </button>

            </div>

        `;


        document
            .getElementById(
                "retryCommunityButton"
            )
            ?.addEventListener(
                "click",
                loadCommunityPosts
            );

    }

}


/* =========================================================
   RENDER COMMUNITY POSTS
========================================================= */

function renderCommunityPosts() {

    const container =
        document.getElementById(
            "communityPosts"
        );


    if (!container) {

        return;

    }


    let filteredPosts =
        communityPosts;


    if (
        communityCategory !==
        "all"
    ) {

        filteredPosts =
            communityPosts.filter(
                post =>
                    post.category ===
                    communityCategory
            );

    }


    if (!filteredPosts.length) {

        container.innerHTML = `

            <div class="community-empty">

                <div class="community-empty-icon">
                    ⚡
                </div>

                <h3>
                    No posts yet
                </h3>

                <p>
                    Be the first EV driver to start
                    a conversation.
                </p>

                <button
                    type="button"
                    class="primary-button"
                    onclick="openCreateCommunityPost()"
                >
                    Create the first post
                </button>

            </div>

        `;

        return;

    }


    container.innerHTML =
        filteredPosts
            .map(
                post =>
                    createCommunityPostCard(
                        post
                    )
            )
            .join("");


    container
        .querySelectorAll(
            ".community-post-card"
        )
        .forEach(
            card => {

                card.addEventListener(
                    "click",
                    event => {

                        /*
                         * If the user clicked the station
                         * button, do not open the post.
                         */
                        if (
                            event.target.closest(
                                ".community-post-station"
                            )
                        ) {
                            return;
                        }

                        openCommunityPost(
                            Number(
                                card.dataset.id
                            )
                        );

                    }
                );

            }
        );


    /*
     * Station buttons.
     */
    container
        .querySelectorAll(
            ".community-post-station"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();


                        const stationId =
                            Number(
                                button.dataset.stationId
                            );


                        if (
                            !Number.isFinite(
                                stationId
                            )
                        ) {
                            return;
                        }


                        /*
                         * Use the same station object
                         * already loaded in ChargeLens.
                         */
                        const station =
                            stations.find(
                                item =>
                                    Number(
                                        item.id
                                    ) ===
                                    stationId
                            );


                        if (station) {
                            selectStation(
                                stationId
                            );

                            return;
                        }


                        /*
                         * Fallback: get station from backend
                         * if it isn't currently in the local list.
                         */
                        openCommunityLinkedStation(
                            stationId
                        );

                    }
                );

            }
        );

}


/* =========================================================
   COMMUNITY POST CARD
========================================================= */

function createCommunityPostCard(
    post
) {

    const category =
        formatCommunityCategory(
            post.category
        );


    const date =
        formatCommunityDate(
            post.created_at
        );


    const station =
        post.station;


    const stationHTML =
        station

            ? `

                <button
                    type="button"
                    class="community-post-station"
                    data-station-id="${station.id}"
                >

                    <span>
                        ⚡
                    </span>

                    <span>

                        ${escapeHtml(
                            station.name
                        )}

                    </span>

                    <span
                        style="
                            margin-left:auto;
                            font-size:10px;
                            color:#6f8279;
                        "
                    >
                        View station →
                    </span>

                </button>

            `

            : "";


    return `

        <article
            class="community-post-card"
            data-id="${post.id}"
        >

            <div class="community-post-top">

                <span
                    class="community-category"
                >
                    ${escapeHtml(
                        category
                    )}
                </span>


                <span
                    class="community-post-date"
                >
                    ${escapeHtml(
                        date
                    )}
                </span>

            </div>


            <h3
                class="community-post-title"
            >
                ${escapeHtml(
                    post.title
                )}
            </h3>


            ${stationHTML}


            <p
                class="community-post-content"
            >
                ${escapeHtml(
                    post.content
                )}
            </p>


            <div
                class="community-post-footer"
            >

                <span>
                    EV Driver #${post.author?.id || "User"}
                </span>


                <span>
                    💬 ${post.comment_count || 0}
                </span>

            </div>

        </article>

    `;

}


/* =========================================================
   OPEN CREATE POST
========================================================= */

function openCreateCommunityPost() {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        openLoginModal();

        showSignIn();

        return;

    }


    const modal =
        document.getElementById(
            "communityPostModal"
        );


    const content =
        document.getElementById(
            "communityModalContent"
        );


    if (!modal || !content) {

        return;

    }


    /*
     * Get active stations already loaded
     * into the ChargeLens app.
     */
    const activeStations =
        Array.isArray(
            stations
        )
            ? stations.filter(
                station =>
                    station.is_active !== false
            )
            : [];


    let stationOptions = `

        <option value="">
            No specific station
        </option>

    `;


    activeStations
        .sort(
            (a, b) =>
                String(
                    a.name || ""
                )
                .localeCompare(
                    String(
                        b.name || ""
                    )
                )
        )
        .forEach(
            station => {

                stationOptions += `

                    <option
                        value="${station.id}"
                    >

                        ${escapeHtml(
                            station.name
                        )}

                    </option>

                `;

            }
        );


    content.innerHTML = `

        <div class="section-eyebrow">
            EV COMMUNITY
        </div>


        <h2 class="modal-title">
            Create a community post
        </h2>


        <p
            style="
                color:#8fa29a;
                margin-top:8px;
                line-height:1.5;
            "
        >
            Share an EV experience, ask a question,
            or help another driver.
        </p>


        <form
            id="communityPostForm"
            style="
                margin-top:22px;
                display:grid;
                gap:12px;
            "
        >

            <label>
                Title
                <input
                    id="communityPostTitle"
                    type="text"
                    maxlength="200"
                    placeholder="Example: Is this charger working today?"
                    required
                >
            </label>


            <label>
                Charging station

                <select
                    id="communityPostStation"
                >

                    ${stationOptions}

                </select>

                <small
                    style="
                        color:#667871;
                        line-height:1.4;
                    "
                >
                    Optional. Choose a station when
                    your post is specifically about it.
                </small>

            </label>


            <label>
                Category

                <select
                    id="communityPostCategory"
                    required
                >

                    <option value="general">
                        General
                    </option>

                    <option value="charging">
                        Charging
                    </option>

                    <option value="stations">
                        Stations
                    </option>

                    <option value="road_trip">
                        Road Trip
                    </option>

                    <option value="ev_tips">
                        EV Tips
                    </option>

                    <option value="help">
                        Help
                    </option>

                    <option value="news">
                        News
                    </option>

                </select>

            </label>


            <label>
                Message

                <textarea
                    id="communityPostContent"
                    maxlength="5000"
                    rows="6"
                    placeholder="Write something useful for the EV community..."
                    required
                ></textarea>

            </label>


            <p
                id="communityPostError"
                style="
                    min-height:20px;
                    margin:0;
                    color:#f25d5d;
                "
            ></p>


            <button
                type="submit"
                class="primary-button"
                id="communityPostSubmit"
            >
                Publish Post
            </button>

        </form>

    `;


    modal.classList.add(
        "open"
    );


    document
        .getElementById(
            "communityPostForm"
        )
        ?.addEventListener(
            "submit",
            submitCommunityPost
        );

}


/* =========================================================
   SUBMIT COMMUNITY POST
========================================================= */

async function submitCommunityPost(
    event
) {

    event.preventDefault();


    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        closeCommunityModal();

        openLoginModal();

        showSignIn();

        return;

    }


    const title =
        document
            .getElementById(
                "communityPostTitle"
            )
            ?.value
            .trim();


    const category =
        document
            .getElementById(
                "communityPostCategory"
            )
            ?.value
            ?.trim()
            .toLowerCase();


    const stationId =
        document
            .getElementById(
                "communityPostStation"
            )
            ?.value
            .trim();


    const content =
        document
            .getElementById(
                "communityPostContent"
            )
            ?.value
            .trim();


    const error =
        document.getElementById(
            "communityPostError"
        );


    const submit =
        document.getElementById(
            "communityPostSubmit"
        );


    if (!title || !content) {

        if (error) {

            error.textContent =
                "Please fill in the title and message.";

        }

        return;

    }


    try {

        if (submit) {

            submit.disabled =
                true;

            submit.textContent =
                "Publishing...";

        }


        if (error) {

            error.textContent =
                "";

        }


        const payload = {

            title:
                title,

            content:
                content,

            category:
                category || "general",

            station_id:
                stationId
                    ? Number(
                        stationId
                    )
                    : null

        };


        const response =
            await fetch(
                `${API_BASE}/api/community/posts`,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`

                    },

                    body:
                        JSON.stringify(
                            payload
                        )

                }
            );


        const responseText =
            await response.text();


        let data = null;


        try {

            data =
                responseText
                    ? JSON.parse(
                        responseText
                    )
                    : null;

        }

        catch {

            data = {
                detail:
                    responseText ||
                    "Unknown server response."
            };

        }


        if (
            response.status ===
            401
        ) {

            localStorage.removeItem(
                "chargelens_token"
            );

            userToken =
                null;

            closeCommunityModal();

            openLoginModal();

            showSignIn();

            return;

        }


        if (!response.ok) {

            throw new Error(
                getCommunityApiError(
                    data,
                    "Unable to publish post."
                )
            );

        }


        /*
         * Add returned post immediately
         * to the current feed.
         */

        const createdPost =
            data?.post;


        if (createdPost) {

            communityPosts = [

                {

                    id:
                        createdPost.id,

                    title:
                        createdPost.title,

                    content:
                        createdPost.content,

                    category:
                        createdPost.category ||
                        "general",

                    author:
                        createdPost.author ||
                        {
                            id:
                                "User"
                        },

                    station:
                        createdPost.station ||
                        null,

                    comment_count:
                        0,

                    created_at:
                        createdPost.created_at,

                    updated_at:
                        createdPost.updated_at ||
                        createdPost.created_at

                },

                ...communityPosts

            ];

        }


        communityCategory =
            "all";


        document
            .querySelectorAll(
                ".community-filter"
            )
            .forEach(
                filter => {

                    filter.classList.toggle(
                        "active",
                        filter.dataset
                            .communityCategory ===
                            "all"
                    );

                }
            );


        closeCommunityModal();


        renderCommunityPosts();


        document
            .getElementById(
                "community"
            )
            ?.scrollIntoView({
                behavior:
                    "smooth"
            });


        /*
         * Refresh in background.
         */
        loadCommunityPosts()
            .catch(
                backgroundError => {

                    console.warn(
                        "Community background refresh failed:",
                        backgroundError
                    );

                }
            );

    }

    catch (error) {

        console.error(
            "Community post error:",
            error
        );


        if (error) {

            const errorElement =
                document.getElementById(
                    "communityPostError"
                );


            if (errorElement) {

                errorElement.textContent =
                    error.message ||
                    "Unable to publish post.";

            }

        }

    }

    finally {

        if (submit) {

            submit.disabled =
                false;

            submit.textContent =
                "Publish Post";

        }

    }

}


/* =========================================================
   OPEN COMMUNITY POST
========================================================= */

async function openCommunityPost(
    postId
) {

    const modal =
        document.getElementById(
            "communityPostModal"
        );


    const content =
        document.getElementById(
            "communityModalContent"
        );


    if (!modal || !content) {

        return;

    }


    modal.classList.add(
        "open"
    );


    content.innerHTML = `

        <div class="loading-state">

            <div class="loading-spinner"></div>

            <p>
                Loading community discussion...
            </p>

        </div>

    `;


    try {

        const response =
            await fetch(
                `${API_BASE}/api/community/posts/${postId}`,
                {
                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Unable to load this discussion."
            );

        }


        const data =
            await response.json();


        renderCommunityPostDetail(
            data
        );

    }

    catch (error) {

        console.error(
            "Community detail error:",
            error
        );


        content.innerHTML = `

            <div class="loading-state">

                <p>
                    ${escapeHtml(
                        error.message ||
                        "Unable to load discussion."
                    )}
                </p>

            </div>

        `;

    }

}


/* =========================================================
   RENDER COMMUNITY POST DETAIL
========================================================= */

function renderCommunityPostDetail(
    data
) {

    const content =
        document.getElementById(
            "communityModalContent"
        );


    if (!content) {

        return;

    }


    const post =
        data.post;


    const station =
        data.post.station;


    const comments =
        Array.isArray(
            data.comments
        )
            ? data.comments
            : [];


    content.innerHTML = `

        <div class="section-eyebrow">
            ${escapeHtml(
                formatCommunityCategory(
                    post.category
                )
            )}
        </div>


        <h2 class="modal-title">
            ${escapeHtml(
                post.title
            )}
        </h2>


        ${
            station

                ? `

                    <div
                        class="community-detail-station"
                    >

                        ⚡

                        <strong>
                            ${escapeHtml(
                                station.name
                            )}
                        </strong>

                        <span>
                            Charging station
                        </span>

                    </div>

                `

                : ""
        }


        <div
            style="
                margin-top:12px;
                color:#d8e2dd;
                line-height:1.7;
                white-space:pre-wrap;
            "
        >
            ${escapeHtml(
                post.content
            )}
        </div>


        <div
            style="
                margin-top:12px;
                color:#6f8279;
                font-size:11px;
            "
        >
            EV Driver #${post.author?.id || "User"}
            ·
            ${formatCommunityDate(
                post.created_at
            )}
        </div>


        <div
            class="confidence-section-title"
            style="
                margin-top:26px;
            "
        >
            Replies
        </div>


        <div
            class="community-comments"
            id="communityComments"
        >

            ${
                comments.length
                    ? comments
                        .map(
                            comment =>
                                createCommunityComment(
                                    comment
                                )
                        )
                        .join("")
                    : `
                        <div class="no-reports">
                            No replies yet. Be the first to reply.
                        </div>
                    `
            }

        </div>


        <form
            id="communityCommentForm"
            style="
                margin-top:20px;
                display:grid;
                gap:10px;
            "
        >

            <textarea
                id="communityCommentContent"
                rows="4"
                maxlength="2000"
                placeholder="Write a helpful reply..."
                required
            ></textarea>


            <p
                id="communityCommentError"
                style="
                    min-height:20px;
                    color:#f25d5d;
                    margin:0;
                "
            ></p>


            <button
                type="submit"
                class="primary-button"
                id="communityCommentSubmit"
            >
                Reply
            </button>

        </form>

    `;


    document
        .getElementById(
            "communityCommentForm"
        )
        ?.addEventListener(
            "submit",
            event => {

                submitCommunityComment(
                    event,
                    post.id
                );

            }
        );

}


/* =========================================================
   COMMUNITY COMMENT
========================================================= */

function createCommunityComment(
    comment
) {

    return `

        <div class="community-comment">

            <div
                style="
                    font-size:10px;
                    color:#41e39b;
                    font-weight:800;
                "
            >
                EV Driver #${comment.author?.id || "User"}
            </div>


            <div
                style="
                    margin-top:6px;
                    color:#d8e2dd;
                    line-height:1.6;
                    white-space:pre-wrap;
                "
            >
                ${escapeHtml(
                    comment.content
                )}
            </div>


            <div
                style="
                    margin-top:7px;
                    color:#667871;
                    font-size:10px;
                "
            >
                ${formatCommunityDate(
                    comment.created_at
                )}
            </div>

        </div>

    `;

}


/* =========================================================
   SUBMIT COMMUNITY COMMENT
========================================================= */

async function submitCommunityComment(
    event,
    postId
) {

    event.preventDefault();


    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        closeCommunityModal();

        openLoginModal();

        showSignIn();

        return;

    }


    const textarea =
        document.getElementById(
            "communityCommentContent"
        );


    const error =
        document.getElementById(
            "communityCommentError"
        );


    const submit =
        document.getElementById(
            "communityCommentSubmit"
        );


    const content =
        textarea
            ?.value
            .trim();


    if (!content) {

        if (error) {

            error.textContent =
                "Please write a reply.";

        }

        return;

    }


    try {

        if (submit) {

            submit.disabled =
                true;

            submit.textContent =
                "Sending...";

        }


        const response =
            await fetch(
                `${API_BASE}/api/community/posts/${postId}/comments`,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`

                    },

                    body:
                        JSON.stringify({

                            content:
                                content

                        })

                }
            );


        const data =
            await response.json();


        if (
            response.status ===
            401
        ) {

            localStorage.removeItem(
                "chargelens_token"
            );

            userToken =
                null;

            closeCommunityModal();

            openLoginModal();

            showSignIn();

            return;

        }


        if (!response.ok) {

            throw new Error(
                getCommunityApiError(
                    data,
                    "Unable to add reply."
                )
            );

        }


        await openCommunityPost(
            postId
        );


        await loadCommunityPosts();

    }

    catch (error) {

        console.error(
            "Community comment error:",
            error
        );


        if (error) {

            if (error) {

                if (
                    document.getElementById(
                        "communityCommentError"
                    )
                ) {

                    document.getElementById(
                        "communityCommentError"
                    ).textContent =
                        error.message ||
                        "Unable to add reply.";

                }

            }

        }

    }

    finally {

        if (submit) {

            submit.disabled =
                false;

            submit.textContent =
                "Reply";

        }

    }

}


/* =========================================================
   CLOSE COMMUNITY MODAL
========================================================= */

function closeCommunityModal() {

    document
        .getElementById(
            "communityPostModal"
        )
        ?.classList.remove(
            "open"
        );

}


/* =========================================================
   COMMUNITY CATEGORY LABEL
========================================================= */

function formatCommunityCategory(
    category
) {

    const labels = {

        general:
            "General",

        charging:
            "Charging",

        stations:
            "Stations",

        road_trip:
            "Road Trip",

        ev_tips:
            "EV Tips",

        help:
            "Help",

        news:
            "News"

    };


    return (
        labels[
            String(
                category || ""
            ).toLowerCase()
        ]
        ||
        "General"
    );

}


/* =========================================================
   COMMUNITY DATE
========================================================= */

function formatCommunityDate(
    timestamp
) {

    if (!timestamp) {

        return "";

    }


    const date =
        new Date(
            timestamp
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    const seconds =
        Math.floor(
            (
                Date.now()
                -
                date.getTime()
            )
            /
            1000
        );


    if (
        seconds < 60
    ) {

        return "Just now";

    }


    if (
        seconds < 3600
    ) {

        return (
            Math.floor(
                seconds / 60
            )
            +
            " min ago"
        );

    }


    if (
        seconds < 86400
    ) {

        return (
            Math.floor(
                seconds / 3600
            )
            +
            " hr ago"
        );

    }


    if (
        seconds < 604800
    ) {

        return (
            Math.floor(
                seconds / 86400
            )
            +
            " days ago"
        );

    }


    return date.toLocaleDateString();

}


/* =========================================================
   COMMUNITY API ERROR
========================================================= */

function getCommunityApiError(
    data,
    fallback
) {

    if (!data) {

        return fallback;

    }


    if (
        typeof data.detail ===
        "string"
    ) {

        return data.detail;

    }


    if (
        Array.isArray(
            data.detail
        )
    ) {

        return data.detail
            .map(
                item =>
                    item.msg ||
                    item.message ||
                    String(
                        item
                    )
            )
            .join(
                ", "
            );

    }


    return fallback;

}


/* =========================================================
   COMMUNITY STYLES
========================================================= */

(function injectCommunityStyles() {

    if (
        document.getElementById(
            "chargelens-community-styles"
        )
    ) {

        return;

    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "chargelens-community-styles";


    style.textContent = `

        .community-section {

            padding:
                90px 6vw;

            background:
                #07100d;

        }


        .community-header {

            max-width:
                1180px;

            margin:
                0 auto;

            display:
                flex;

            justify-content:
                space-between;

            align-items:
                flex-end;

            gap:
                25px;

        }


        .community-header h2 {

            margin-top:
                8px;

            max-width:
                760px;

        }


        .community-header p:not(
            .section-eyebrow
        ) {

            margin-top:
                10px;

            max-width:
                700px;

            color:
                #8fa29a;

            line-height:
                1.6;

        }


        .community-controls {

            max-width:
                1180px;

            margin:
                28px auto 0;

            display:
                flex;

            gap:
                8px;

            flex-wrap:
                wrap;

        }


        .community-filter {

            border:
                1px solid
                rgba(255,255,255,.08);

            border-radius:
                999px;

            padding:
                9px 14px;

            background:
                rgba(255,255,255,.02);

            color:
                #8fa29a;

            cursor:
                pointer;

            font-size:
                12px;

        }


        .community-filter.active {

            background:
                rgba(65,227,155,.09);

            border-color:
                rgba(65,227,155,.20);

            color:
                #41e39b;

        }


        .community-posts {

            max-width:
                1180px;

            margin:
                24px auto 0;

            display:
                grid;

            grid-template-columns:
                repeat(
                    auto-fit,
                    minmax(
                        280px,
                        1fr
                    )
                );

            gap:
                14px;

        }


        .community-post-card {

            padding:
                20px;

            border:
                1px solid
                rgba(255,255,255,.07);

            border-radius:
                14px;

            background:
                rgba(255,255,255,.02);

            cursor:
                pointer;

            transition:
                transform .2s ease,
                border-color .2s ease,
                background .2s ease;

        }


        .community-post-card:hover {

            transform:
                translateY(-3px);

            border-color:
                rgba(65,227,155,.20);

            background:
                rgba(65,227,155,.025);

        }


        .community-post-top,
        .community-post-footer {

            display:
                flex;

            justify-content:
                space-between;

            align-items:
                center;

            gap:
                10px;

        }


        .community-category {

            color:
                #41e39b;

            font-size:
                10px;

            font-weight:
                850;

            text-transform:
                uppercase;

            letter-spacing:
                1px;

        }


        .community-post-date {

            color:
                #667871;

            font-size:
                10px;

        }


        .community-post-title {

            margin-top:
                14px;

            font-size:
                18px;

            line-height:
                1.3;

        }


        .community-post-content {

            margin-top:
                9px;

            color:
                #9baea5;

            line-height:
                1.6;

            display:
                -webkit-box;

            -webkit-line-clamp:
                4;

            -webkit-box-orient:
                vertical;

            overflow:
                hidden;

        }


        .community-post-footer {

            margin-top:
                18px;

            color:
                #667871;

            font-size:
                10px;

        }


        .community-empty {

            grid-column:
                1 / -1;

            padding:
                45px 20px;

            text-align:
                center;

            border:
                1px solid
                rgba(255,255,255,.07);

            border-radius:
                14px;

            background:
                rgba(255,255,255,.02);

        }


        .community-empty-icon {

            font-size:
                32px;

        }


        .community-empty h3 {

            margin-top:
                12px;

        }


        .community-empty p {

            margin:
                8px 0 18px;

            color:
                #8fa29a;

        }


        .community-modal {

            width:
                min(
                    720px,
                    calc(100vw - 32px)
                );

            max-height:
                90vh;

            overflow:
                auto;

            padding:
                28px;

            border:
                1px solid
                rgba(255,255,255,.10);

            border-radius:
                18px;

            background:
                #0b1712;

            position:
                relative;

        }


        .community-modal label {

            display:
                grid;

            gap:
                7px;

            color:
                #9baea5;

            font-size:
                12px;

        }


        .community-modal input,
        .community-modal textarea,
        .community-modal select {

            width:
                100%;

            box-sizing:
                border-box;

            padding:
                12px;

            border:
                1px solid
                rgba(255,255,255,.08);

            border-radius:
                8px;

            background:
                #07100d;

            color:
                #f4f7f5;

            font:
                inherit;

        }


        .community-modal textarea {

            resize:
                vertical;

        }


        .community-comments {

            display:
                grid;

            gap:
                9px;

        }


        .community-comment {

            padding:
                13px;

            border:
                1px solid
                rgba(255,255,255,.06);

            border-radius:
                10px;

            background:
                rgba(255,255,255,.02);

        }


        .community-post-station {

            width:
                100%;

            margin-top:
                12px;

            padding:
                9px 11px;

            display:
                flex;

            align-items:
                center;

            gap:
                7px;

            text-align:
                left;

            border:
                1px solid
                rgba(65,227,155,.18);

            border-radius:
                8px;

            background:
                rgba(65,227,155,.05);

            color:
                #41e39b;

            font-size:
                11px;

            font-weight:
                750;

            cursor:
                pointer;

            transition:
                background .2s ease,
                border-color .2s ease;

        }


        .community-post-station:hover {

            background:
                rgba(65,227,155,.09);

            border-color:
                rgba(65,227,155,.35);

        }


        .community-detail-station {

            margin-top:
                16px;

            padding:
                12px;

            display:
                flex;

            align-items:
                center;

            gap:
                8px;

            border:
                1px solid
                rgba(65,227,155,.16);

            border-radius:
                10px;

            background:
                rgba(65,227,155,.04);

            color:
                #41e39b;

        }


        .community-detail-station span {

            color:
                #71847b;

            font-size:
                10px;

        }


        @media (
            max-width: 720px
        ) {

            .community-header {

                align-items:
                    flex-start;

                flex-direction:
                    column;

            }


            .community-section {

                padding:
                    65px 18px;

            }


            .community-modal {

                padding:
                    20px;

            }

        }

    `;


    document.head.appendChild(
        style
    );

})();


/* =========================================================
   OPEN COMMUNITY-LINKED STATION
========================================================= */

async function openCommunityLinkedStation(
    stationId
) {

    try {

        const response =
            await fetch(
                `/api/stations/${stationId}/confidence`,
                {
                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                "Unable to load station."
            );

        }


        const data =
            await response.json();


        /*
         * Get the complete station from
         * the current application list if possible.
         */
        const station =
            stations.find(
                item =>
                    Number(
                        item.id
                    ) ===
                    Number(
                        stationId
                    )
            );


        if (station) {

            selectStation(
                stationId
            );

            return;

        }


        /*
         * Fallback object when the station
         * isn't currently in the main list.
         */
        const fallbackStation = {

            id:
                Number(
                    stationId
                ),

            name:
                data.station?.name ||
                "Charging Station",

            operator_name:
                data.station?.operator ||
                "Unknown",

            latitude:
                data.station?.latitude ||
                0,

            longitude:
                data.station?.longitude ||
                0,

            status:
                data.station?.status ||
                "unknown",

            confidence_score:
                data.confidence?.score ||
                0,

            last_verified_at:
                data.station?.last_verified_at ||
                null

        };


        selectedStation =
            fallbackStation;


        showStationModal(
            fallbackStation
        );

    }

    catch (error) {

        console.error(
            "Community station error:",
            error
        );


        window.alert(
            "Unable to open this charging station."
        );

    }

}


/* =========================================================
   STATION SEARCH + FILTERS
========================================================= */

function setupStationFilters() {

    if (document.getElementById("stationFilters")) {
        return;
    }

    const stationList =
        document.getElementById("stationList");

    const section = stationList?.closest("section");

    if (!stationList || !section) {
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = "stationFilters";
    wrapper.className = "station-filters";
    wrapper.innerHTML = `
        <div class="station-search-box">
            <span>🔎</span>
            <input type="search" id="stationSearchInput"
                placeholder="Search station, operator or address..."
                autocomplete="off">
        </div>
        <div class="station-filter-row">
            <select id="stationStatusFilter" class="station-filter-select">
                <option value="all">All statuses</option>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="maintenance">Maintenance</option>
                <option value="broken">Broken</option>
                <option value="unknown">Unknown</option>
            </select>
            <select id="stationConfidenceFilter" class="station-filter-select">
                <option value="all">Any confidence</option>
                <option value="high">High confidence · 80%+</option>
                <option value="good">Good confidence · 60%+</option>
                <option value="low">Low confidence · below 60%</option>
            </select>
            <select id="stationConnectorFilter" class="station-filter-select">
                <option value="all">All connectors</option>
            </select>
            <select id="stationPowerFilter" class="station-filter-select">
                <option value="all">All power</option>
                <option value="fast">Fast · 50 kW+</option>
                <option value="medium">Medium · 20–49 kW</option>
                <option value="slow">Below 20 kW</option>
            </select>
            <button type="button" id="resetStationFilters"
                class="station-filter-reset">Reset</button>
        </div>
        <div id="stationFilterSummary" class="station-filter-summary"></div>
    `;

    stationList.parentNode.insertBefore(wrapper, stationList);

    const controls = {
        stationSearchInput: "search",
        stationStatusFilter: "status",
        stationConfidenceFilter: "confidence",
        stationConnectorFilter: "connector",
        stationPowerFilter: "power"
    };

    Object.entries(controls).forEach(([id, filter]) => {
        document.getElementById(id)?.addEventListener(
            filter === "search" ? "input" : "change",
            event => {
                stationFilters[filter] = filter === "search"
                    ? event.target.value.trim().toLowerCase()
                    : event.target.value;
                applyStationFilters();
            }
        );
    });

    document.getElementById("resetStationFilters")?.addEventListener(
        "click", resetStationFilters
    );

    populateConnectorFilter();
    applyStationFilters();
}


/* =========================================================
   POPULATE CONNECTORS
========================================================= */

function populateConnectorFilter() {

    const select = document.getElementById("stationConnectorFilter");

    if (!select) {
        return;
    }

    const connectors = [...new Set(
        stations
            .map(station => String(station.connector_type || "").trim())
            .filter(value => value && value.toLowerCase() !== "unknown")
    )].sort((a, b) => a.localeCompare(b));

    select.innerHTML = `
        <option value="all">All connectors</option>
        ${connectors.map(connector => `
            <option value="${escapeHtml(connector)}">
                ${escapeHtml(connector)}
            </option>
        `).join("")}
    `;
    select.value = stationFilters.connector;
}


/* =========================================================
   APPLY FILTERS
========================================================= */

function applyStationFilters() {

    const { search, status, confidence, connector, power } = stationFilters;

    filteredStations = stations.filter(station => {
        const stationStatus = String(station.status || "unknown").toLowerCase();
        const stationConnector = String(station.connector_type || "").trim();
        const stationConfidence = Number(station.confidence_score) || 0;
        const stationPower = Number(station.power_kw) || 0;
        const searchText = [
            station.name,
            station.operator_name,
            station.address,
            station.connector_type
        ].map(value => String(value || "").toLowerCase()).join(" ");

        if (search && !searchText.includes(search)) return false;
        if (status !== "all" && stationStatus !== status) return false;
        if (connector !== "all" && stationConnector !== connector) return false;
        if (confidence === "high" && stationConfidence < 80) return false;
        if (confidence === "good" && stationConfidence < 60) return false;
        if (confidence === "low" && stationConfidence >= 60) return false;
        if (power === "fast" && stationPower < 50) return false;
        if (power === "medium" && (stationPower < 20 || stationPower >= 50)) return false;
        if (power === "slow" && stationPower >= 20) return false;

        return true;
    });

    renderStations(filteredStations);
    renderMarkers(filteredStations);
    updateStationFilterSummary();
}


function updateStationFilterSummary() {

    const summary = document.getElementById("stationFilterSummary");

    if (summary) {
        summary.textContent =
            `${filteredStations.length} of ${stations.length} stations shown`;
    }
}


function resetStationFilters() {

    stationFilters = {
        search: "",
        status: "all",
        confidence: "all",
        connector: "all",
        power: "all"
    };

    const controls = {
        stationSearchInput: "",
        stationStatusFilter: "all",
        stationConfidenceFilter: "all",
        stationConnectorFilter: "all",
        stationPowerFilter: "all"
    };

    Object.entries(controls).forEach(([id, value]) => {
        const control = document.getElementById(id);
        if (control) control.value = value;
    });

    populateConnectorFilter();
    applyStationFilters();
}


/* =========================================================
   STATION FILTER STYLES
========================================================= */

(function injectStationFilterStyles() {

    if (
        document.getElementById(
            "chargelens-station-filter-styles"
        )
    ) {
        return;
    }

    const style = document.createElement("style");
    style.id = "chargelens-station-filter-styles";
    style.textContent = `
        .station-filters {
            margin: 18px 0;
        }

        .station-search-box {
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 12px 14px;
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 10px;
            background: rgba(255,255,255,.025);
        }

        .station-search-box span {
            opacity: .7;
            font-size: 15px;
        }

        .station-search-box input {
            width: 100%;
            border: 0;
            outline: 0;
            background: transparent;
            color: #f4f7f5;
            font: inherit;
            font-size: 13px;
        }

        .station-search-box input::placeholder {
            color: #687a72;
        }

        .station-filter-row {
            margin-top: 9px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .station-filter-select,
        .station-filter-reset {
            min-height: 38px;
            padding: 0 11px;
            border: 1px solid rgba(255,255,255,.07);
            border-radius: 8px;
            background: #0a1712;
            color: #dce8e2;
            font: inherit;
            font-size: 11px;
            cursor: pointer;
        }

        .station-filter-select:focus {
            outline: 1px solid rgba(65,227,155,.30);
        }

        .station-filter-reset {
            background: rgba(65,227,155,.05);
            color: #41e39b;
        }

        .station-filter-summary {
            margin-top: 9px;
            color: #667871;
            font-size: 10px;
        }

        @media (max-width: 650px) {
            .station-filter-row {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .station-filter-reset {
                width: 100%;
            }
        }
    `;

    document.head.appendChild(style);
})();

/* =========================================================
   LOCATION-BASED HERO
========================================================= */

function updateHeroLocationState(
    text
) {

    const label =
        document.getElementById(
            "heroLocationLabel"
        );


    const searchInput =
        document.getElementById(
            "searchInput"
        );


    if (label) {

        label.textContent =
            text;

    }


    if (searchInput) {

        searchInput.placeholder =
            "Search your city or a charging station...";

    }

}


/* =========================================================
   DETECT CITY FROM GPS
========================================================= */

async function updateHeroLocationFromCoordinates(
    latitude,
    longitude
) {

    try {

        const url =
            "https://nominatim.openstreetmap.org/reverse"
            +
            "?format=jsonv2"
            +
            "&lat="
            +
            encodeURIComponent(
                latitude
            )
            +
            "&lon="
            +
            encodeURIComponent(
                longitude
            )
            +
            "&zoom=10"
            +
            "&addressdetails=1";


        const response =
            await fetch(
                url,
                {
                    headers: {

                        Accept:
                            "application/json"

                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                "Location lookup failed."
            );

        }


        const data =
            await response.json();


        const address =
            data.address ||
            {};


        const city =
            address.city
            ||
            address.town
            ||
            address.municipality
            ||
            address.city_district
            ||
            address.state_district
            ||
            address.state
            ||
            null;


        if (!city) {

            updateHeroLocationState(
                "Near your location"
            );

            return;

        }


        const label =
            document.getElementById(
                "heroLocationLabel"
            );


        const searchInput =
            document.getElementById(
                "searchInput"
            );


        if (label) {

            label.textContent =
                `Near ${city}`;

        }


        if (searchInput) {

            searchInput.placeholder =
                `Search ${city} or a charging station...`;

        }


        window.chargeLensLocation = {

            city:
                city,

            latitude:
                latitude,

            longitude:
                longitude

        };


        console.log(
            "ChargeLens detected city:",
            city
        );

    }

    catch (error) {

        console.warn(
            "Unable to detect city:",
            error
        );


        updateHeroLocationState(
            "Near your location"
        );

    }

}

/* =========================================================
   FAVORITES
========================================================= */

async function setupFavoriteButton(
    station
) {

    const button =
        document.getElementById(
            "favoriteButton"
        );


    if (!button) {

        return;

    }


    /*
     * User is not signed in.
     */

    if (!userToken) {

        button.textContent =
            "☆ Save station";

        button.disabled =
            false;

        button.onclick =
            () => {

                closeStationModal();

                openLoginModal();

                showSignIn();

            };

        return;

    }


    button.disabled =
        true;

    button.textContent =
        "Checking...";


    try {

        const response =
            await fetch(
                `/api/favorites/${station.id}/check`,
                {

                    headers: {

                        "Authorization":
                            `Bearer ${userToken}`

                    },

                    cache:
                        "no-store"

                }
            );


        if (
            response.status ===
            401
        ) {

            localStorage.removeItem(
                "chargelens_token"
            );

            userToken =
                null;


            button.disabled =
                false;

            button.textContent =
                "☆ Save station";


            button.onclick =
                () => {

                    closeStationModal();

                    openLoginModal();

                    showSignIn();

                };


            return;

        }


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Unable to check saved station."
            );

        }


        updateFavoriteButton(
            button,
            station,
            data.saved === true
        );

    }

    catch (error) {

        console.error(
            "Favorite check error:",
            error
        );


        button.disabled =
            false;

        button.textContent =
            "☆ Save station";


        button.onclick =
            () => {

                toggleFavoriteStation(
                    station
                );

            };

    }

}


/* =========================================================
   UPDATE FAVORITE BUTTON
========================================================= */

function updateFavoriteButton(
    button,
    station,
    saved
) {

    button.disabled =
        false;


    button.textContent =
        saved
            ? "★ Saved"
            : "☆ Save station";


    button.classList.toggle(
        "favorite-saved",
        saved
    );


    button.onclick =
        () => {

            toggleFavoriteStation(
                station
            );

        };

}


/* =========================================================
   SAVE / REMOVE FAVORITE
========================================================= */

async function toggleFavoriteStation(
    station
) {

    if (!userToken) {

        closeStationModal();

        openLoginModal();

        showSignIn();

        return;

    }


    const button =
        document.getElementById(
            "favoriteButton"
        );


    if (!button) {

        return;

    }


    const currentlySaved =
        button.textContent.includes(
            "Saved"
        );


    button.disabled =
        true;


    button.textContent =
        currentlySaved
            ? "Removing..."
            : "Saving...";


    try {

        const response =
            await fetch(

                `/api/favorites/${station.id}`,

                {

                    method:
                        currentlySaved
                            ? "DELETE"
                            : "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${userToken}`

                    }

                }

            );


        if (
            response.status ===
            401
        ) {

            localStorage.removeItem(
                "chargelens_token"
            );

            userToken =
                null;


            closeStationModal();

            openLoginModal();

            showSignIn();

            return;

        }


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Unable to update saved station."
            );

        }


        updateFavoriteButton(
            button,
            station,
            data.saved === true
        );

    }

    catch (error) {

        console.error(
            "Favorite update error:",
            error
        );


        button.disabled =
            false;


        button.textContent =
            currentlySaved
                ? "★ Saved"
                : "☆ Save station";


        alert(
            error.message ||
            "Unable to update saved station."
        );

    }

}