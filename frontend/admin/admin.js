/* =========================================================
   CHARGELENS ADMIN DASHBOARD
========================================================= */

let stations = [];
let reports = [];
let users = [];
let currentUser = null;

let pendingImportedStations = [];

let stationFormMap = null;
let stationFormMarker = null;

/* =========================================================
   START
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const authorised =
            await verifyAdminAccess();

        if (!authorised) {
            return;
        }

        setupNavigation();

        setupStationManagement();

        setupStationImport();

        await loadAdminData();

        renderStations();

        renderReports();

        renderConfidence();

        if (
            currentUser &&
            currentUser.role === "owner"
        ) {

            await loadUsers();

            renderUsers();

        }

    }
);


/* =========================================================
   VERIFY ADMIN
========================================================= */

async function verifyAdminAccess() {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );

    if (!token) {

        redirectToLogin();

        return false;

    }

    try {

        const response =
            await fetch(
                "/api/me",
                {
                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        if (!response.ok) {

            throw new Error(
                "Authentication failed."
            );

        }

        currentUser =
            await response.json();


        if (
            currentUser.role !== "owner" &&
            currentUser.role !== "admin"
        ) {

            showAccessDenied();

            return false;

        }


        const email =
            document.getElementById(
                "adminEmail"
            );

        if (email) {

            email.textContent =
                currentUser.email;

        }


        /*
         * Admin Access is OWNER ONLY.
         */

        if (
            currentUser.role !== "owner"
        ) {

            const accessButton =
                document.querySelector(
                    '[data-section="access"]'
                );

            if (accessButton) {

                accessButton.style.display =
                    "none";

            }


            const accessSection =
                document.getElementById(
                    "section-access"
                );

            if (accessSection) {

                accessSection.remove();

            }

        }


        return true;

    }

    catch (error) {

        console.error(
            "Admin authentication error:",
            error
        );

        localStorage.removeItem(
            "chargelens_token"
        );

        redirectToLogin();

        return false;

    }

}


/* =========================================================
   ACCESS DENIED
========================================================= */

function showAccessDenied() {

    document.body.innerHTML = `

        <div
            style="
                min-height:100vh;
                display:flex;
                align-items:center;
                justify-content:center;
                background:#06100c;
                color:#f4f7f5;
                font-family:system-ui;
                padding:20px;
                text-align:center;
            "
        >

            <div>

                <div
                    style="
                        color:#f25d5d;
                        font-size:46px;
                        font-weight:900;
                    "
                >
                    ×
                </div>

                <h1>
                    Access denied
                </h1>

                <p
                    style="
                        margin-top:10px;
                        color:#8fa29a;
                    "
                >
                    Your ChargeLens account does not
                    have administrator access.
                </p>

                <button
                    onclick="window.location.href='/'"
                    style="
                        margin-top:20px;
                        padding:12px 18px;
                        border:0;
                        border-radius:9px;
                        background:#41e39b;
                        color:#03130c;
                        font-weight:800;
                        cursor:pointer;
                    "
                >
                    Back to ChargeLens
                </button>

            </div>

        </div>

    `;

}


/* =========================================================
   REDIRECT
========================================================= */

function redirectToLogin() {

    window.location.href =
        "/";

}


/* =========================================================
   LOAD ADMIN DATA
========================================================= */

async function loadAdminData() {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );

    try {

        const [
            statsResponse,
            reportsResponse,
            stationsResponse
        ] =
            await Promise.all([

                fetch(
                    "/api/admin/stats",
                    {
                        headers: {
                            "Authorization":
                                `Bearer ${token}`
                        }
                    }
                ),

                fetch(
                    "/api/admin/reports",
                    {
                        headers: {
                            "Authorization":
                                `Bearer ${token}`
                        }
                    }
                ),

                fetch(
                    "/api/admin/stations",
                    {
                        headers: {
                            "Authorization":
                                `Bearer ${token}`
                        }
                    }
                )

            ]);


        if (
            statsResponse.status === 401 ||
            reportsResponse.status === 401 ||
            stationsResponse.status === 401
        ) {

            localStorage.removeItem(
                "chargelens_token"
            );

            redirectToLogin();

            return;

        }


        if (
            !statsResponse.ok ||
            !reportsResponse.ok ||
            !stationsResponse.ok
        ) {

            throw new Error(
                "Unable to load admin data."
            );

        }


        const stats =
            await statsResponse.json();

        reports =
            await reportsResponse.json();

        stations =
            await stationsResponse.json();


        updateStats(
            stats
        );

    }

    catch (error) {

        console.error(
            "Admin data error:",
            error
        );

    }

}


/* =========================================================
   UPDATE STATS
========================================================= */

function updateStats(
    stats
) {

    const total =
        document.getElementById(
            "totalStations"
        );

    const active =
        document.getElementById(
            "activeStations"
        );

    const average =
        document.getElementById(
            "averageConfidence"
        );

    const reportsToday =
        document.getElementById(
            "reportsToday"
        );


    if (total) {

        total.textContent =
            stats.total_stations;

    }

    if (active) {

        active.textContent =
            stats.active_stations;

    }

    if (average) {

        average.textContent =
            `${stats.average_confidence}%`;

    }

    if (reportsToday) {

        reportsToday.textContent =
            stats.reports_today;

    }


    const score =
        Number(
            stats.average_confidence
        ) || 0;


    const healthScore =
        document.getElementById(
            "healthScore"
        );

    const healthRing =
        document.getElementById(
            "healthRing"
        );


    if (healthScore) {

        healthScore.textContent =
            `${Math.round(score)}%`;

    }


    if (healthRing) {

        healthRing.style.setProperty(
            "--score",
            `${score * 3.6}deg`
        );

    }


    const healthLabel =
        document.getElementById(
            "healthLabel"
        );


    if (healthLabel) {

        healthLabel.textContent =
            getConfidenceLabel(
                score
            );

    }

}


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {

    document
        .querySelectorAll(
            ".sidebar-item"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        showSection(
                            button.dataset.section
                        );

                    }
                );

            }
        );


    document
        .querySelectorAll(
            "[data-section-jump]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        showSection(
                            button.dataset.sectionJump
                        );

                    }
                );

            }
        );


    document
        .getElementById(
            "backToApp"
        )
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    "/";

            }
        );


    document
        .getElementById(
            "logoutButton"
        )
        ?.addEventListener(
            "click",
            () => {

                localStorage.removeItem(
                    "chargelens_token"
                );

                window.location.href =
                    "/";

            }
        );

}


function showSection(
    name
) {

    document
        .querySelectorAll(
            ".sidebar-item"
        )
        .forEach(
            item => {

                item.classList.toggle(
                    "active",
                    item.dataset.section === name
                );

            }
        );


    document
        .querySelectorAll(
            ".admin-section"
        )
        .forEach(
            section => {

                section.classList.toggle(
                    "active",
                    section.id ===
                    `section-${name}`
                );

            }
        );


    const titles = {

        overview:
            "Overview",

        stations:
            "Charging stations",

        reports:
            "Driver reports",

        confidence:
            "Confidence monitoring",

        access:
            "Admin access"

    };


    const pageTitle =
        document.getElementById(
            "pageTitle"
        );


    if (pageTitle) {

        pageTitle.textContent =
            titles[name] ||
            "Overview";

    }

}


/* =========================================================
   STATION TABLE
========================================================= */

function renderStations() {

    const container =
        document.getElementById(
            "stationAdminTable"
        );


    if (!container) {
        return;
    }


    const activeCount =
        stations.filter(
            station =>
                station.is_active === true
        ).length;


    const disabledCount =
        stations.length -
        activeCount;


    const activeSummary =
        document.getElementById(
            "stationActiveSummary"
        );

    const disabledSummary =
        document.getElementById(
            "stationDisabledSummary"
        );

    const totalSummary =
        document.getElementById(
            "stationTotalSummary"
        );


    if (activeSummary) {

        activeSummary.textContent =
            activeCount;

    }


    if (disabledSummary) {

        disabledSummary.textContent =
            disabledCount;

    }


    if (totalSummary) {

        totalSummary.textContent =
            stations.length;

    }


    if (!stations.length) {

        container.innerHTML = `

            <div class="table-loading">
                No stations found.
            </div>

        `;

        return;

    }


    container.innerHTML = `

        <div class="table-row table-head">

            <div>
                Station
            </div>

            <div>
                Status
            </div>

            <div>
                Confidence
            </div>

            <div>
                Actions
            </div>

        </div>


        ${
            stations
                .map(
                    station => {

                        const score =
                            Math.round(
                                Number(
                                    station.confidence_score
                                ) || 0
                            );


                        const active =
                            station.is_active === true;


                        return `

                            <div class="table-row">

                                <div class="table-cell">

                                    <strong>
                                        ${escapeHtml(
                                            station.name
                                        )}
                                    </strong>

                                    <br>

                                    <span>
                                        ${escapeHtml(
                                            station.operator_name ||
                                            "Unknown operator"
                                        )}
                                    </span>

                                </div>


                                <div class="table-cell">

                                    ${formatStatus(
                                        station.status
                                    )}

                                    <br>

                                    <span
                                        style="
                                            font-size:8px;
                                            color:${active
                                                ? "#41e39b"
                                                : "#f25d5d"};
                                            font-weight:800;
                                        "
                                    >
                                        ${
                                            active
                                                ? "ACTIVE"
                                                : "DISABLED"
                                        }
                                    </span>

                                </div>


                                <div
                                    class="
                                        table-cell
                                        table-confidence
                                        ${getScoreClass(
                                            score
                                        )}
                                    "
                                >

                                    ${score}%

                                </div>


                                <div class="table-cell">

                                    <div class="station-actions">

                                        <button
                                            type="button"
                                            class="station-action"
                                            onclick="openEditStation(${station.id})"
                                        >
                                            Edit
                                        </button>


                                        <button
                                            type="button"
                                            class="
                                                station-action
                                                ${
                                                    active
                                                        ? "danger"
                                                        : "warning"
                                                }
                                            "
                                            onclick="toggleStation(${station.id})"
                                        >

                                            ${
                                                active
                                                    ? "Disable"
                                                    : "Enable"
                                            }

                                        </button>

                                    </div>

                                </div>

                            </div>

                        `;

                    }
                )
                .join("")
        }

    `;

}


/* =========================================================
   STATION MANAGEMENT
========================================================= */

function setupStationManagement() {

    document
        .getElementById(
            "addStationButton"
        )
        ?.addEventListener(
            "click",
            openAddStation
        );


    document
        .getElementById(
            "stationForm"
        )
        ?.addEventListener(
            "submit",
            saveStation
        );


    document
        .getElementById(
            "stationFormClose"
        )
        ?.addEventListener(
            "click",
            closeStationForm
        );


    document
        .getElementById(
            "stationFormCancel"
        )
        ?.addEventListener(
            "click",
            closeStationForm
        );


    document
        .getElementById(
            "stationFormModal"
        )
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target.id ===
                    "stationFormModal"
                ) {

                    closeStationForm();

                }

            }
        );


    document
        .getElementById(
            "searchLocationButton"
        )
        ?.addEventListener(
            "click",
            searchStationLocation
        );


    document
        .getElementById(
            "useMyLocationButton"
        )
        ?.addEventListener(
            "click",
            useMyCurrentLocation
        );


    document
        .getElementById(
            "stationAddressSearch"
        )
        ?.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Enter"
                ) {

                    event.preventDefault();

                    searchStationLocation();

                }

            }
        );

}


/* =========================================================
   MAP INITIALIZATION
========================================================= */

function initializeStationFormMap(
    latitude = 12.9716,
    longitude = 77.5946,
    zoom = 12
) {

    const mapElement =
        document.getElementById(
            "stationFormMap"
        );


    if (!mapElement) {

        console.warn(
            "stationFormMap element not found."
        );

        return;

    }


    if (
        typeof L ===
        "undefined"
    ) {

        console.error(
            "Leaflet is not loaded."
        );

        return;

    }


    if (stationFormMap) {

        stationFormMap.remove();

        stationFormMap =
            null;

        stationFormMarker =
            null;

    }


    stationFormMap =
        L.map(
            mapElement,
            {
                zoomControl:
                    true
            }
        );


    L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {

            subdomains:
                "abcd",

            maxZoom:
                19,

            attribution:
                '&copy; OpenStreetMap contributors &copy; CARTO'

        }
    ).addTo(
        stationFormMap
    );


    const lat =
        Number(latitude);


    const lon =
        Number(longitude);


    stationFormMap.setView(
        [
            Number.isFinite(lat)
                ? lat
                : 12.9716,

            Number.isFinite(lon)
                ? lon
                : 77.5946
        ],
        zoom
    );


    const markerLat =
        Number.isFinite(lat)
            ? lat
            : 12.9716;


    const markerLon =
        Number.isFinite(lon)
            ? lon
            : 77.5946;


    stationFormMarker =
        L.marker(
            [
                markerLat,
                markerLon
            ],
            {
                draggable:
                    true
            }
        )
        .addTo(
            stationFormMap
        );


    stationFormMarker.bindPopup(
        "Drag the marker or click the map."
    );


    stationFormMarker.on(
        "dragend",
        () => {

            const position =
                stationFormMarker.getLatLng();


            updateStationCoordinates(
                position.lat,
                position.lng
            );

        }
    );


    stationFormMap.on(
        "click",
        event => {

            setStationMarker(
                event.latlng.lat,
                event.latlng.lng
            );


            updateStationCoordinates(
                event.latlng.lat,
                event.latlng.lng
            );

        }
    );


    updateStationCoordinates(
        markerLat,
        markerLon
    );


    setTimeout(
        () => {

            if (stationFormMap) {

                stationFormMap.invalidateSize(
                    true
                );

            }

        },
        250
    );

}


/* =========================================================
   SET MAP MARKER
========================================================= */

function setStationMarker(
    latitude,
    longitude
) {

    if (!stationFormMap) {

        return;

    }


    if (!stationFormMarker) {

        stationFormMarker =
            L.marker(
                [
                    latitude,
                    longitude
                ],
                {
                    draggable:
                        true
                }
            )
            .addTo(
                stationFormMap
            );


        stationFormMarker.on(
            "dragend",
            () => {

                const position =
                    stationFormMarker.getLatLng();


                updateStationCoordinates(
                    position.lat,
                    position.lng
                );

            }
        );

    }

    else {

        stationFormMarker.setLatLng(
            [
                latitude,
                longitude
            ]
        );

    }


    stationFormMap.setView(
        [
            latitude,
            longitude
        ],
        15
    );

}


/* =========================================================
   COORDINATES
========================================================= */

function updateStationCoordinates(
    latitude,
    longitude
) {

    const latitudeInput =
        document.getElementById(
            "stationLatitude"
        );


    const longitudeInput =
        document.getElementById(
            "stationLongitude"
        );


    if (latitudeInput) {

        latitudeInput.value =
            Number(
                latitude
            ).toFixed(6);

    }


    if (longitudeInput) {

        longitudeInput.value =
            Number(
                longitude
            ).toFixed(6);

    }

}


/* =========================================================
   SEARCH ADDRESS
========================================================= */

async function searchStationLocation() {

    const input =
        document.getElementById(
            "stationAddressSearch"
        );


    const message =
        document.getElementById(
            "locationSearchMessage"
        );


    const query =
        input?.value.trim();


    if (!query) {

        if (message) {

            message.textContent =
                "Enter an address or place to search.";

        }

        return;

    }


    if (message) {

        message.textContent =
            "Searching location...";

    }


    const searchButton =
        document.getElementById(
            "searchLocationButton"
        );


    if (searchButton) {

        searchButton.disabled =
            true;

        searchButton.textContent =
            "Searching...";

    }


    try {

        const url =
            "https://nominatim.openstreetmap.org/search"
            +
            "?format=jsonv2"
            +
            "&limit=1"
            +
            "&countrycodes=in"
            +
            "&q="
            +
            encodeURIComponent(
                query
            );


        const response =
            await fetch(
                url,
                {
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        if (!response.ok) {

            throw new Error(
                "Location service is unavailable."
            );

        }


        const results =
            await response.json();


        if (
            !Array.isArray(results) ||
            results.length === 0
        ) {

            throw new Error(
                "Location not found. Try a more complete address."
            );

        }


        const result =
            results[0];


        const latitude =
            Number(
                result.lat
            );


        const longitude =
            Number(
                result.lon
            );


        if (
            !Number.isFinite(
                latitude
            ) ||
            !Number.isFinite(
                longitude
            )
        ) {

            throw new Error(
                "The location returned invalid coordinates."
            );

        }


        setStationMarker(
            latitude,
            longitude
        );


        updateStationCoordinates(
            latitude,
            longitude
        );


        const address =
            document.getElementById(
                "stationAddress"
            );


        if (
            address &&
            result.display_name
        ) {

            address.value =
                result.display_name;

        }


        if (message) {

            message.textContent =
                "Location found.";

        }

    }

    catch (error) {

        console.error(
            "Location search error:",
            error
        );


        if (message) {

            message.textContent =
                error.message ||
                "Unable to find location.";

        }

    }

    finally {

        if (searchButton) {

            searchButton.disabled =
                false;

            searchButton.textContent =
                "Search";

        }

    }

}


/* =========================================================
   USE CURRENT LOCATION
========================================================= */

function useMyCurrentLocation() {

    const message =
        document.getElementById(
            "locationSearchMessage"
        );


    if (
        !navigator.geolocation
    ) {

        if (message) {

            message.textContent =
                "Your browser does not support location access.";

        }

        return;

    }


    if (message) {

        message.textContent =
            "Getting your current location...";

    }


    navigator.geolocation.getCurrentPosition(

        position => {

            const latitude =
                position.coords.latitude;


            const longitude =
                position.coords.longitude;


            setStationMarker(
                latitude,
                longitude
            );


            updateStationCoordinates(
                latitude,
                longitude
            );


            if (message) {

                message.textContent =
                    "Current location selected.";

            }

        },

        error => {

            console.error(
                "Geolocation error:",
                error
            );


            if (message) {

                if (
                    error.code ===
                    error.PERMISSION_DENIED
                ) {

                    message.textContent =
                        "Location permission was denied.";

                }

                else {

                    message.textContent =
                        "Unable to get your current location.";

                }

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
   ADD STATION
========================================================= */

function openAddStation() {

    const form =
        document.getElementById(
            "stationForm"
        );


    if (!form) {

        return;

    }


    form.reset();


    const editId =
        document.getElementById(
            "editStationId"
        );


    if (editId) {

        editId.value =
            "";

    }


    document.getElementById(
        "stationFormTitle"
    ).textContent =
        "Add station";


    document.getElementById(
        "stationFormSubmit"
    ).textContent =
        "Save station";


    clearStationFormMessage();


    const searchInput =
        document.getElementById(
            "stationAddressSearch"
        );


    const locationMessage =
        document.getElementById(
            "locationSearchMessage"
        );


    if (searchInput) {

        searchInput.value =
            "";

    }


    if (locationMessage) {

        locationMessage.textContent =
            "";

    }


    const modal =
        document.getElementById(
            "stationFormModal"
        );


    if (modal) {

        modal.classList.add(
            "open"
        );

    }


    setTimeout(
        () => {

            initializeStationFormMap(
                12.9716,
                77.5946,
                12
            );

        },
        100
    );

}


/* =========================================================
   EDIT STATION
========================================================= */

function openEditStation(
    stationId
) {

    const station =
        stations.find(
            item =>
                Number(item.id) ===
                Number(stationId)
        );


    if (!station) {

        console.error(
            "Station not found:",
            stationId
        );

        return;

    }


    const fields = {

        stationName:
            station.name || "",

        stationOperator:
            station.operator_name || "",

        stationConnector:
            station.connector_type || "CCS2",

        stationAddress:
            station.address || "",

        stationLatitude:
            station.latitude ?? "",

        stationLongitude:
            station.longitude ?? "",

        stationPower:
            station.power_kw ?? 60,

        stationPrice:
            station.price_per_kwh ?? 0,

        stationStatus:
            station.status || "unknown",

        stationActive:
            String(
                station.is_active
            )

    };


    const editId =
        document.getElementById(
            "editStationId"
        );


    if (editId) {

        editId.value =
            station.id;

    }


    Object
        .entries(fields)
        .forEach(
            ([id, value]) => {

                const element =
                    document.getElementById(
                        id
                    );


                if (element) {

                    element.value =
                        value;

                }

            }
        );


    const searchInput =
        document.getElementById(
            "stationAddressSearch"
        );


    if (searchInput) {

        searchInput.value =
            station.address || "";

    }


    const locationMessage =
        document.getElementById(
            "locationSearchMessage"
        );


    if (locationMessage) {

        locationMessage.textContent =
            "";

    }


    document.getElementById(
        "stationFormTitle"
    ).textContent =
        "Edit station";


    document.getElementById(
        "stationFormSubmit"
    ).textContent =
        "Save changes";


    clearStationFormMessage();


    document
        .getElementById(
            "stationFormModal"
        )
        ?.classList.add(
            "open"
        );


    setTimeout(
        () => {

            initializeStationFormMap(
                Number(
                    station.latitude
                ),
                Number(
                    station.longitude
                ),
                15
            );

        },
        100
    );

}


/* =========================================================
   CLOSE FORM
========================================================= */

function closeStationForm() {

    const modal =
        document.getElementById(
            "stationFormModal"
        );


    if (modal) {

        modal.classList.remove(
            "open"
        );

    }


    if (stationFormMap) {

        stationFormMap.remove();

        stationFormMap =
            null;

        stationFormMarker =
            null;

    }

}


/* =========================================================
   FORM MESSAGE
========================================================= */

function clearStationFormMessage() {

    const message =
        document.getElementById(
            "stationFormMessage"
        );


    if (message) {

        message.textContent =
            "";

    }

}


/* =========================================================
   SAVE STATION
========================================================= */

async function saveStation(
    event
) {

    event.preventDefault();


    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        redirectToLogin();

        return;

    }


    const stationId =
        document.getElementById(
            "editStationId"
        )?.value.trim();


    const name =
        document.getElementById(
            "stationName"
        )?.value.trim();


    const operatorName =
        document.getElementById(
            "stationOperator"
        )?.value.trim();


    const address =
        document.getElementById(
            "stationAddress"
        )?.value.trim();


    const latitude =
        Number(
            document.getElementById(
                "stationLatitude"
            )?.value
        );


    const longitude =
        Number(
            document.getElementById(
                "stationLongitude"
            )?.value
        );


    const power =
        Number(
            document.getElementById(
                "stationPower"
            )?.value
        );


    const price =
        Number(
            document.getElementById(
                "stationPrice"
            )?.value
        );


    const connector =
        document.getElementById(
            "stationConnector"
        )?.value;


    const stationStatus =
        document.getElementById(
            "stationStatus"
        )?.value;


    const isActive =
        document.getElementById(
            "stationActive"
        )?.value ===
        "true";


    const message =
        document.getElementById(
            "stationFormMessage"
        );


    const submitButton =
        document.getElementById(
            "stationFormSubmit"
        );


    if (!name) {

        if (message) {

            message.textContent =
                "Station name is required.";

        }

        return;

    }


    if (!operatorName) {

        if (message) {

            message.textContent =
                "Operator name is required.";

        }

        return;

    }


    if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
    ) {

        if (message) {

            message.textContent =
                "Enter a valid latitude.";

        }

        return;

    }


    if (
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {

        if (message) {

            message.textContent =
                "Enter a valid longitude.";

        }

        return;

    }


    if (
        !Number.isFinite(power) ||
        power < 0
    ) {

        if (message) {

            message.textContent =
                "Enter a valid charging power.";

        }

        return;

    }


    if (
        !Number.isFinite(price) ||
        price < 0
    ) {

        if (message) {

            message.textContent =
                "Enter a valid price.";

        }

        return;

    }


    const payload = {

        name:
            name,

        operator_name:
            operatorName,

        latitude:
            latitude,

        longitude:
            longitude,

        address:
            address || "",

        connector_type:
            connector || "CCS2",

        power_kw:
            power,

        price_per_kwh:
            price,

        status:
            stationStatus || "unknown",

        is_active:
            isActive

    };


    try {

        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.textContent =
                stationId
                    ? "Saving..."
                    : "Creating...";

        }


        clearStationFormMessage();


        const url =
            stationId
                ? `/api/admin/stations/${stationId}`
                : "/api/admin/stations";


        const method =
            stationId
                ? "PATCH"
                : "POST";


        const response =
            await fetch(
                url,
                {

                    method,

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


        const data =
            await response.json();


        if (
            response.status ===
            401
        ) {

            localStorage.removeItem(
                "chargelens_token"
            );

            redirectToLogin();

            return;

        }


        if (!response.ok) {

            throw new Error(
                getApiError(
                    data,
                    "Unable to save station."
                )
            );

        }


        closeStationForm();


        await refreshStations();

        await refreshDashboardStats();

    }

    catch (error) {

        console.error(
            "Station save error:",
            error
        );


        if (message) {

            message.textContent =
                error.message ||
                "Unable to save station.";

        }

    }

    finally {

        if (submitButton) {

            submitButton.disabled =
                false;

            submitButton.textContent =
                stationId
                    ? "Save changes"
                    : "Save station";

        }

    }

}


/* =========================================================
   ENABLE / DISABLE
========================================================= */

async function toggleStation(
    stationId
) {

    const station =
        stations.find(
            item =>
                Number(item.id) ===
                Number(stationId)
        );


    if (!station) {

        return;

    }


    const active =
        station.is_active ===
        true;


    const confirmation =
        active
            ? `Disable "${station.name}" for drivers?`
            : `Enable "${station.name}" for drivers?`;


    if (
        !window.confirm(
            confirmation
        )
    ) {

        return;

    }


    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        redirectToLogin();

        return;

    }


    try {

        const response =
            await fetch(
                `/api/admin/stations/${station.id}/toggle`,
                {

                    method:
                        "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`

                    }

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

            redirectToLogin();

            return;

        }


        if (!response.ok) {

            throw new Error(
                getApiError(
                    data,
                    "Unable to change station status."
                )
            );

        }


        await refreshStations();

        await refreshDashboardStats();

    }

    catch (error) {

        console.error(
            "Station toggle error:",
            error
        );


        window.alert(
            error.message ||
            "Unable to change station status."
        );

    }

}


/* =========================================================
   REFRESH ADMIN STATIONS
========================================================= */

async function refreshStations() {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        redirectToLogin();

        return;

    }


    const response =
        await fetch(
            "/api/admin/stations",
            {
                headers: {
                    "Authorization":
                        `Bearer ${token}`
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

        redirectToLogin();

        return;

    }


    if (!response.ok) {

        throw new Error(
            "Unable to refresh stations."
        );

    }


    stations =
        await response.json();


    renderStations();

    renderConfidence();

    renderReports();

}


/* =========================================================
   REFRESH STATS
========================================================= */

async function refreshDashboardStats() {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        return;

    }


    try {

        const response =
            await fetch(
                "/api/admin/stats",
                {
                    headers: {
                        "Authorization":
                            `Bearer ${token}`
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

            redirectToLogin();

            return;

        }


        if (!response.ok) {

            return;

        }


        const stats =
            await response.json();


        updateStats(
            stats
        );

    }

    catch (error) {

        console.error(
            "Stats refresh error:",
            error
        );

    }

}


/* =========================================================
   REPORTS
========================================================= */

function renderReports() {

    const adminReports =
        document.getElementById(
            "adminReportsTable"
        );


    const overviewReports =
        document.getElementById(
            "overviewReports"
        );


    if (adminReports) {

        adminReports.innerHTML =
            buildReportTable(
                reports
            );

    }


    if (overviewReports) {

        overviewReports.innerHTML =
            buildReportTable(
                reports.slice(
                    0,
                    5
                )
            );

    }

}


function buildReportTable(
    data
) {

    if (!data.length) {

        return `
            <div class="table-loading">
                No reports found.
            </div>
        `;
    }


    return `

        <div
            class="table-row table-head"
        >

            <div>
                User
            </div>

            <div>
                Station
            </div>

            <div>
                Report
            </div>

            <div>
                Comment
            </div>

            <div>
                Time
            </div>

        </div>


        ${
            data
                .map(
                    report => {

                        const type =
                            String(
                                report.report_type ||
                                "unknown"
                            ).toLowerCase();


                        const reporterEmail =
                            report.reporter_email ||
                            "Unknown user";


                        const stationName =
                            report.station_name ||
                            `Station #${report.station_id}`;


                        return `

                            <div
                                class="table-row report-row"
                            >

                                <div
                                    class="table-cell"
                                >

                                    <div
                                        class="report-user"
                                    >
                                        ${escapeHtml(
                                            reporterEmail
                                        )}
                                    </div>

                                    <small
                                        class="report-user-id"
                                    >
                                        User #${escapeHtml(
                                            report.reporter_id ??
                                            "—"
                                        )}
                                    </small>

                                </div>


                                <div
                                    class="table-cell"
                                >

                                    <strong>
                                        ${escapeHtml(
                                            stationName
                                        )}
                                    </strong>

                                </div>


                                <div
                                    class="table-cell"
                                >

                                    <span
                                        class="
                                            report-type
                                            ${getReportClass(
                                                type
                                            )}
                                        "
                                    >
                                        ${formatReportType(
                                            type
                                        )}
                                    </span>

                                </div>


                                <div
                                    class="table-cell"
                                >

                                    ${
                                        report.comment
                                            ? escapeHtml(
                                                report.comment
                                            )
                                            : `<span
                                                class="muted"
                                            >
                                                No comment
                                            </span>`
                                    }

                                </div>


                                <div
                                    class="table-cell"
                                >
                                    ${formatDate(
                                        report.created_at
                                    )}
                                </div>

                            </div>

                        `;

                    }
                )
                .join("")
        }

    `;
}

/* =========================================================
   CONFIDENCE
========================================================= */

function renderConfidence() {

    const container =
        document.getElementById(
            "confidenceAdminGrid"
        );


    if (!container) {

        return;

    }


    if (!stations.length) {

        container.innerHTML = `

            <div class="table-loading">
                No station data available.
            </div>

        `;

        return;

    }


    container.innerHTML =
        stations
            .map(
                station => {

                    const score =
                        Math.round(
                            Number(
                                station.confidence_score
                            ) || 0
                        );


                    return `

                        <article
                            class="
                                confidence-admin-card
                            "
                        >

                            <div
                                class="
                                    station-confidence-top
                                "
                            >

                                <div>

                                    <div
                                        class="
                                            station-confidence-name
                                        "
                                    >

                                        ${escapeHtml(
                                            station.name
                                        )}

                                    </div>


                                    <div
                                        class="
                                            station-confidence-status
                                        "
                                    >

                                        ${formatStatus(
                                            station.status
                                        )}

                                    </div>

                                </div>


                                <div
                                    class="
                                        station-confidence-score
                                        ${getScoreClass(
                                            score
                                        )}
                                    "
                                >

                                    ${score}%

                                </div>

                            </div>

                        </article>

                    `;

                }
            )
            .join("");

}


/* =========================================================
   USERS
========================================================= */

async function loadUsers() {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        return;

    }


    try {

        const response =
            await fetch(
                "/api/admin/users",
                {
                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
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

            redirectToLogin();

            return;

        }


        if (!response.ok) {

            throw new Error(
                getApiError(
                    data,
                    "Unable to load users."
                )
            );

        }


        users =
            Array.isArray(
                data
            )
                ? data
                : [];

    }

    catch (error) {

        console.error(
            "Users loading error:",
            error
        );

        users = [];

    }

}


/* =========================================================
   RENDER USERS
========================================================= */

function renderUsers() {

    const container =
        document.getElementById(
            "userAdminTable"
        );


    if (!container) {

        return;

    }


    if (!users.length) {

        container.innerHTML = `

            <div class="table-loading">
                No users found.
            </div>

        `;

        return;

    }


    container.innerHTML = `

        <div class="table-row table-head">

            <div>
                User
            </div>

            <div>
                Role
            </div>

            <div>
                Status
            </div>

            <div>
                Action
            </div>

        </div>


        ${
            users
                .map(
                    user => {

                        let actionHTML =
                            "";


                        if (
                            user.role ===
                            "owner"
                        ) {

                            actionHTML = `

                                <span
                                    style="
                                        color:#41e39b;
                                        font-size:9px;
                                        font-weight:800;
                                    "
                                >
                                    OWNER
                                </span>

                            `;

                        }

                        else if (
                            user.role ===
                            "admin"
                        ) {

                            actionHTML = `

                                <button
                                    type="button"
                                    class="
                                        admin-action
                                        danger
                                    "
                                    onclick="
                                        changeUserRole(
                                            ${user.id},
                                            'demote'
                                        )
                                    "
                                >
                                    Remove Admin
                                </button>

                            `;

                        }

                        else {

                            actionHTML = `

                                <button
                                    type="button"
                                    class="admin-action"
                                    onclick="
                                        changeUserRole(
                                            ${user.id},
                                            'promote'
                                        )
                                    "
                                >
                                    Give Admin
                                </button>

                            `;

                        }


                        return `

                            <div class="table-row">

                                <div class="table-cell">

                                    <strong>
                                        ${escapeHtml(
                                            user.email
                                        )}
                                    </strong>

                                </div>


                                <div class="table-cell">

                                    ${escapeHtml(
                                        user.role
                                    )}

                                </div>


                                <div class="table-cell">

                                    ${
                                        user.is_active
                                            ? "Active"
                                            : "Disabled"
                                    }

                                </div>


                                <div class="table-cell">

                                    ${actionHTML}

                                </div>

                            </div>

                        `;

                    }
                )
                .join("")
        }

    `;

}


/* =========================================================
   CHANGE USER ROLE
========================================================= */

async function changeUserRole(
    userId,
    action
) {

    if (
        !currentUser ||
        currentUser.role !==
            "owner"
    ) {

        window.alert(
            "Only the owner can manage admin access."
        );

        return;

    }


    const user =
        users.find(
            item =>
                Number(item.id) ===
                Number(userId)
        );


    if (!user) {

        return;

    }


    if (
        user.role ===
        "owner"
    ) {

        window.alert(
            "The owner account cannot be changed."
        );

        return;

    }


    const question =
        action === "promote"
            ? `Give admin access to ${user.email}?`
            : `Remove admin access from ${user.email}?`;


    if (
        !window.confirm(
            question
        )
    ) {

        return;

    }


    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    const endpoint =
        action === "promote"
            ? `/api/admin/users/${user.id}/promote`
            : `/api/admin/users/${user.id}/demote`;


    try {

        const response =
            await fetch(
                endpoint,
                {
                    method:
                        "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
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

            redirectToLogin();

            return;

        }


        if (!response.ok) {

            throw new Error(
                getApiError(
                    data,
                    "Unable to update admin access."
                )
            );

        }


        await loadUsers();

        renderUsers();

    }

    catch (error) {

        console.error(
            "Admin role error:",
            error
        );


        window.alert(
            error.message
        );

    }

}


/* =========================================================
   =========================================================
   REAL STATION IMPORT
   =========================================================
========================================================= */


/* =========================================================
   SETUP IMPORT
========================================================= */

function setupStationImport() {

    /*
     * We create the import button dynamically.
     * Therefore the existing index.html does not need
     * to be changed yet.
     */

    createImportButton();

    createImportModal();

}


/* =========================================================
   CREATE IMPORT BUTTON
========================================================= */

function createImportButton() {

    const addButton =
        document.getElementById(
            "addStationButton"
        );


    if (!addButton) {

        console.warn(
            "Add Station button not found."
        );

        return;

    }


    if (
        document.getElementById(
            "importStationsButton"
        )
    ) {

        return;

    }


    const button =
        document.createElement(
            "button"
        );


    button.id =
        "importStationsButton";


    button.type =
        "button";


    button.className =
        "admin-secondary-button";


    button.style.marginLeft =
        "8px";


    button.innerHTML =
        "⚡ Import Real Stations";


    button.addEventListener(
        "click",
        openImportModal
    );


    addButton.parentElement?.appendChild(
        button
    );

}


/* =========================================================
   CREATE IMPORT MODAL
========================================================= */

function createImportModal() {

    if (
        document.getElementById(
            "stationImportModal"
        )
    ) {

        return;

    }


    const overlay =
        document.createElement(
            "div"
        );


    overlay.id =
        "stationImportModal";


    overlay.style.cssText = `

        position:fixed;
        inset:0;
        z-index:6000;
        display:none;
        align-items:center;
        justify-content:center;
        padding:20px;
        background:rgba(0,0,0,.82);
        backdrop-filter:blur(10px);

    `;


    overlay.innerHTML = `

        <div
            id="stationImportPanel"
            style="
                width:min(900px,100%);
                max-height:92vh;
                overflow:auto;
                padding:28px;
                border:1px solid rgba(255,255,255,.10);
                border-radius:18px;
                background:#0d1b15;
                color:#f4f7f5;
                box-shadow:0 40px 100px rgba(0,0,0,.65);
            "
        >

            <div
                style="
                    display:flex;
                    align-items:flex-start;
                    justify-content:space-between;
                    gap:15px;
                "
            >

                <div>

                    <div
                        style="
                            color:#41e39b;
                            font-size:10px;
                            font-weight:850;
                            letter-spacing:1.7px;
                        "
                    >
                        REAL STATION DATA
                    </div>

                    <h2
                        style="
                            margin-top:7px;
                            font-size:27px;
                        "
                    >
                        Import real charging stations
                    </h2>

                    <p
                        style="
                            margin-top:8px;
                            color:#8fa29a;
                            font-size:13px;
                            line-height:1.55;
                        "
                    >
                        Find charging stations from Open Charge Map
                        near a location and review them before adding
                        them to ChargeLens.
                    </p>

                </div>


                <button
                    id="stationImportClose"
                    type="button"
                    style="
                        width:38px;
                        height:38px;
                        flex-shrink:0;
                        border:1px solid rgba(255,255,255,.10);
                        border-radius:50%;
                        background:rgba(255,255,255,.03);
                        color:#8fa29a;
                        font-size:20px;
                    "
                >
                    ×
                </button>

            </div>


            <div
                style="
                    margin-top:24px;
                    display:grid;
                    grid-template-columns:
                        repeat(2,minmax(0,1fr));
                    gap:12px;
                "
            >

                <label
                    style="
                        display:flex;
                        flex-direction:column;
                        gap:7px;
                        color:#a7b5af;
                        font-size:12px;
                    "
                >

                    Latitude

                    <input
                        id="importLatitude"
                        type="number"
                        step="any"
                        value="17.3850"
                        style="
                            min-height:46px;
                            padding:0 12px;
                            border:1px solid rgba(255,255,255,.09);
                            border-radius:8px;
                            background:#07120d;
                            color:#f4f7f5;
                        "
                    >

                </label>


                <label
                    style="
                        display:flex;
                        flex-direction:column;
                        gap:7px;
                        color:#a7b5af;
                        font-size:12px;
                    "
                >

                    Longitude

                    <input
                        id="importLongitude"
                        type="number"
                        step="any"
                        value="78.4867"
                        style="
                            min-height:46px;
                            padding:0 12px;
                            border:1px solid rgba(255,255,255,.09);
                            border-radius:8px;
                            background:#07120d;
                            color:#f4f7f5;
                        "
                    >

                </label>


                <label
                    style="
                        display:flex;
                        flex-direction:column;
                        gap:7px;
                        color:#a7b5af;
                        font-size:12px;
                    "
                >

                    Search radius (km)

                    <input
                        id="importRadius"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value="25"
                        style="
                            min-height:46px;
                            padding:0 12px;
                            border:1px solid rgba(255,255,255,.09);
                            border-radius:8px;
                            background:#07120d;
                            color:#f4f7f5;
                        "
                    >

                </label>


                <label
                    style="
                        display:flex;
                        flex-direction:column;
                        gap:7px;
                        color:#a7b5af;
                        font-size:12px;
                    "
                >

                    Maximum stations

                    <input
                        id="importMaxResults"
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        value="100"
                        style="
                            min-height:46px;
                            padding:0 12px;
                            border:1px solid rgba(255,255,255,.09);
                            border-radius:8px;
                            background:#07120d;
                            color:#f4f7f5;
                        "
                    >

                </label>

            </div>


            <div
                style="
                    margin-top:10px;
                    display:flex;
                    gap:8px;
                    flex-wrap:wrap;
                "
            >

                <button
                    id="importUseLocationButton"
                    type="button"
                    style="
                        min-height:40px;
                        padding:0 13px;
                        border:1px solid rgba(65,227,155,.18);
                        border-radius:8px;
                        background:rgba(65,227,155,.05);
                        color:#41e39b;
                        font-weight:750;
                    "
                >
                    📍 Use my location
                </button>


                <button
                    id="importSearchButton"
                    type="button"
                    style="
                        min-height:44px;
                        padding:0 18px;
                        border:0;
                        border-radius:8px;
                        background:#41e39b;
                        color:#03130c;
                        font-weight:850;
                    "
                >
                    Find Real Stations
                </button>

            </div>


            <div
                id="importMessage"
                style="
                    min-height:20px;
                    margin-top:12px;
                    color:#8fa29a;
                    font-size:12px;
                "
            ></div>


            <div
                id="importSummary"
                style="
                    margin-top:15px;
                "
            ></div>


            <div
                id="importResults"
                style="
                    margin-top:12px;
                "
            ></div>

        </div>

    `;


    document.body.appendChild(
        overlay
    );


    document
        .getElementById(
            "stationImportClose"
        )
        ?.addEventListener(
            "click",
            closeImportModal
        );


    overlay.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                overlay
            ) {

                closeImportModal();

            }

        }
    );


    document
        .getElementById(
            "importSearchButton"
        )
        ?.addEventListener(
            "click",
            searchRealStations
        );


    document
        .getElementById(
            "importUseLocationButton"
        )
        ?.addEventListener(
            "click",
            useLocationForImport
        );

}


/* =========================================================
   OPEN IMPORT MODAL
========================================================= */

function openImportModal() {

    const modal =
        document.getElementById(
            "stationImportModal"
        );


    if (!modal) {

        createImportModal();

    }


    const actualModal =
        document.getElementById(
            "stationImportModal"
        );


    if (actualModal) {

        actualModal.style.display =
            "flex";

    }


    setImportMessage(
        ""
    );


    const results =
        document.getElementById(
            "importResults"
        );


    const summary =
        document.getElementById(
            "importSummary"
        );


    if (results) {

        results.innerHTML =
            "";

    }


    if (summary) {

        summary.innerHTML =
            "";

    }

}


/* =========================================================
   CLOSE IMPORT MODAL
========================================================= */

function closeImportModal() {

    const modal =
        document.getElementById(
            "stationImportModal"
        );


    if (modal) {

        modal.style.display =
            "none";

    }

}


/* =========================================================
   IMPORT MESSAGE
========================================================= */

function setImportMessage(
    message,
    isError = false
) {

    const element =
        document.getElementById(
            "importMessage"
        );


    if (!element) {

        return;

    }


    element.textContent =
        message;


    element.style.color =
        isError
            ? "#f25d5d"
            : "#8fa29a";

}


/* =========================================================
   USE CURRENT LOCATION FOR IMPORT
========================================================= */

function useLocationForImport() {

    if (
        !navigator.geolocation
    ) {

        setImportMessage(
            "Your browser does not support location.",
            true
        );

        return;

    }


    setImportMessage(
        "Getting your current location..."
    );


    navigator.geolocation.getCurrentPosition(

        position => {

            const latitude =
                position.coords.latitude;


            const longitude =
                position.coords.longitude;


            const latitudeInput =
                document.getElementById(
                    "importLatitude"
                );


            const longitudeInput =
                document.getElementById(
                    "importLongitude"
                );


            if (latitudeInput) {

                latitudeInput.value =
                    latitude.toFixed(6);

            }


            if (longitudeInput) {

                longitudeInput.value =
                    longitude.toFixed(6);

            }


            setImportMessage(
                "Current location selected."
            );

        },

        error => {

            console.error(
                "Import location error:",
                error
            );


            setImportMessage(
                error.code ===
                    error.PERMISSION_DENIED
                    ? "Location permission was denied."
                    : "Unable to get your current location.",
                true
            );

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
   SEARCH REAL STATIONS
========================================================= */

async function searchRealStations() {

    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        redirectToLogin();

        return;

    }


    const latitude =
        Number(
            document.getElementById(
                "importLatitude"
            )?.value
        );


    const longitude =
        Number(
            document.getElementById(
                "importLongitude"
            )?.value
        );


    const radius =
        Number(
            document.getElementById(
                "importRadius"
            )?.value
        );


    const maxResults =
        Number(
            document.getElementById(
                "importMaxResults"
            )?.value
        );


    if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
    ) {

        setImportMessage(
            "Enter a valid latitude.",
            true
        );

        return;

    }


    if (
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {

        setImportMessage(
            "Enter a valid longitude.",
            true
        );

        return;

    }


    if (
        !Number.isFinite(radius) ||
        radius <= 0 ||
        radius > 100
    ) {

        setImportMessage(
            "Radius must be between 1 and 100 km.",
            true
        );

        return;

    }


    if (
        !Number.isFinite(maxResults) ||
        maxResults <= 0 ||
        maxResults > 1000
    ) {

        setImportMessage(
            "Maximum stations must be between 1 and 1000.",
            true
        );

        return;

    }


    const searchButton =
        document.getElementById(
            "importSearchButton"
        );


    if (searchButton) {

        searchButton.disabled =
            true;

        searchButton.textContent =
            "Searching...";

    }


    setImportMessage(
        "Searching Open Charge Map for real charging stations..."
    );


    const results =
        document.getElementById(
            "importResults"
        );


    if (results) {

        results.innerHTML =
            "";

    }


    try {

        const url =
            "/api/admin/import/openchargemap"
            +
            `?latitude=${encodeURIComponent(latitude)}`
            +
            `&longitude=${encodeURIComponent(longitude)}`
            +
            `&distance_km=${encodeURIComponent(radius)}`
            +
            `&max_results=${encodeURIComponent(maxResults)}`;


        const response =
            await fetch(
                url,
                {

                    method:
                        "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${token}`

                    }

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

            redirectToLogin();

            return;

        }


        if (!response.ok) {

            throw new Error(
                getApiError(
                    data,
                    "Unable to import real stations."
                )
            );

        }


        renderImportResults(
            data
        );


        setImportMessage(
            "Real station search completed."
        );

    }

    catch (error) {

        console.error(
            "Real station import error:",
            error
        );


        setImportMessage(
            error.message ||
            "Unable to import real stations.",
            true
        );

    }

    finally {

        if (searchButton) {

            searchButton.disabled =
                false;

            searchButton.textContent =
                "Find Real Stations";

        }

    }

}


/* =========================================================
   RENDER IMPORT RESULTS
========================================================= */

function renderImportResults(
    data
) {

    const summary =
        document.getElementById(
            "importSummary"
        );


    const results =
        document.getElementById(
            "importResults"
        );


    if (!summary || !results) {

        return;

    }


    const externalResults =
        Number(
            data?.summary?.external_results
        ) || 0;


    const newStations =
        Number(
            data?.summary?.new_stations
        ) || 0;


    const duplicates =
        Number(
            data?.summary?.duplicates
        ) || 0;


    summary.innerHTML = `

        <div
            style="
                display:grid;
                grid-template-columns:
                    repeat(3,minmax(0,1fr));
                gap:8px;
            "
        >

            ${createImportStat(
                "Found",
                externalResults,
                "#f4f7f5"
            )}

            ${createImportStat(
                "New",
                newStations,
                "#41e39b"
            )}

            ${createImportStat(
                "Duplicates",
                duplicates,
                "#eebe53"
            )}

        </div>

    `;


    /*
     * Store the imported stations globally.
     * The Approve buttons will use their index.
     */

    pendingImportedStations =
        Array.isArray(
            data?.new_stations
        )
            ? data.new_stations
            : [];


    if (
        pendingImportedStations.length === 0
    ) {

        results.innerHTML = `

            <div
                style="
                    margin-top:12px;
                    padding:25px;
                    border:1px solid rgba(255,255,255,.07);
                    border-radius:12px;
                    text-align:center;
                    color:#8fa29a;
                    font-size:13px;
                "
            >
                No new stations were found in this area.
            </div>

        `;

        return;

    }


    results.innerHTML = `

        <div
            style="
                margin-top:18px;
                color:#41e39b;
                font-size:10px;
                font-weight:850;
                letter-spacing:1.4px;
            "
        >
            NEW STATIONS FOR REVIEW
        </div>


        <div
            style="
                margin-top:10px;
                display:grid;
                gap:8px;
            "
        >

            ${
                pendingImportedStations
                    .map(
                        (station, index) =>
                            createImportedStationCard(
                                station,
                                index
                            )
                    )
                    .join("")
            }

        </div>

    `;


    /*
     * Connect every Approve button.
     */

    document
        .querySelectorAll(
            ".import-approve-button"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const index =
                            Number(
                                button.dataset.index
                            );

                        approveImportedStation(
                            index
                        );

                    }
                );

            }
        );

}


/* =========================================================
   IMPORT STAT
========================================================= */

function createImportStat(
    label,
    value,
    color
) {

    return `

        <div
            style="
                padding:14px;
                border:1px solid rgba(255,255,255,.07);
                border-radius:10px;
                background:rgba(255,255,255,.018);
            "
        >

            <div
                style="
                    color:#667871;
                    font-size:9px;
                    text-transform:uppercase;
                    letter-spacing:1px;
                "
            >
                ${label}
            </div>


            <div
                style="
                    margin-top:6px;
                    color:${color};
                    font-size:22px;
                    font-weight:850;
                "
            >
                ${value}
            </div>

        </div>

    `;

}


/* =========================================================
   IMPORTED STATION CARD
========================================================= */

function createImportedStationCard(
    station,
    index
) {

    const connector =
        station.connector_type ||
        "Unknown";


    const power =
        Number(
            station.power_kw
        ) || 0;


    const status =
        station.status ||
        "unknown";


    return `

        <article
            style="
                padding:16px;
                border:1px solid rgba(255,255,255,.08);
                border-radius:12px;
                background:rgba(255,255,255,.018);
            "
        >

            <div
                style="
                    display:flex;
                    align-items:flex-start;
                    justify-content:space-between;
                    gap:15px;
                "
            >

                <div>

                    <div
                        style="
                            color:#f4f7f5;
                            font-size:14px;
                            font-weight:750;
                        "
                    >

                        ${escapeHtml(
                            station.name ||
                            "Unnamed station"
                        )}

                    </div>


                    <div
                        style="
                            margin-top:4px;
                            color:#8fa29a;
                            font-size:11px;
                        "
                    >

                        ${escapeHtml(
                            station.operator_name ||
                            "Unknown operator"
                        )}

                    </div>

                </div>


                <span
                    style="
                        padding:5px 8px;
                        border-radius:6px;
                        background:rgba(65,227,155,.07);
                        color:#41e39b;
                        font-size:10px;
                        font-weight:800;
                    "
                >

                    ${escapeHtml(
                        status
                    )}

                </span>

            </div>


            <div
                style="
                    margin-top:12px;
                    display:flex;
                    flex-wrap:wrap;
                    gap:7px;
                "
            >

                ${createImportChip(
                    connector
                )}

                ${createImportChip(
                    `${power} kW`
                )}

                ${createImportChip(
                    station.address ||
                    "Address unavailable"
                )}

            </div>


            <div
                style="
                    margin-top:13px;
                    display:flex;
                    justify-content:flex-end;
                "
            >

                <button
                    type="button"
                    class="
                        admin-primary-button
                        import-approve-button
                    "
                    data-index="${index}"
                >

                    ✅ Approve station

                </button>

            </div>

        </article>

    `;

}


/* =========================================================
   IMPORT CHIP
========================================================= */

function createImportChip(
    value
) {

    return `

        <span
            style="
                display:inline-flex;
                align-items:center;
                min-height:25px;
                max-width:100%;
                padding:0 8px;
                border:1px solid rgba(255,255,255,.08);
                border-radius:6px;
                color:#8fa29a;
                font-size:10px;
            "
        >
            ${escapeHtml(
                String(value)
            )}
        </span>

    `;

}


/* =========================================================
   APPROVE IMPORTED STATION
========================================================= */

async function approveImportedStation(
    index
) {

    const station =
        pendingImportedStations[
            Number(index)
        ];


    if (!station) {

        window.alert(
            "Station data could not be found. Please search again."
        );

        return;

    }


    const token =
        localStorage.getItem(
            "chargelens_token"
        );


    if (!token) {

        redirectToLogin();

        return;

    }


    const confirmed =
        window.confirm(
            `Add "${station.name}" to ChargeLens?`
        );


    if (!confirmed) {

        return;

    }


    try {

        const response =
            await fetch(
                "/api/admin/import/openchargemap/approve",
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

                            name:
                                station.name,

                            operator_name:
                                station.operator_name,

                            latitude:
                                station.latitude,

                            longitude:
                                station.longitude,

                            address:
                                station.address,

                            connector_type:
                                station.connector_type,

                            power_kw:
                                station.power_kw,

                            status:
                                station.status

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

            redirectToLogin();

            return;

        }


        if (!response.ok) {

            throw new Error(
                getApiError(
                    data,
                    "Unable to approve station."
                )
            );

        }


        window.alert(
            "✅ Station added to ChargeLens successfully."
        );


        /*
         * Remove the approved station from
         * the pending list.
         */

        pendingImportedStations =
            pendingImportedStations.filter(
                (_, stationIndex) =>
                    stationIndex !==
                    Number(index)
            );


        /*
         * Refresh normal admin station table.
         */

        await refreshStations();

        await refreshDashboardStats();


        /*
         * Redraw remaining import results.
         */

        renderImportResults({

            summary: {

                external_results:
                    pendingImportedStations.length,

                new_stations:
                    pendingImportedStations.length,

                duplicates:
                    0

            },

            new_stations:
                pendingImportedStations,

            duplicates:
                []

        });


    }

    catch (error) {

        console.error(
            "Station approval error:",
            error
        );


        window.alert(
            error.message ||
            "Unable to approve station."
        );

    }

}


/* =========================================================
   API ERROR
========================================================= */

function getApiError(
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
                    typeof item ===
                    "string"

                        ? item

                        : (
                            item.msg ||
                            item.message ||
                            "Invalid request."
                        )
            )
            .join(
                ", "
            );

    }


    return fallback;

}


/* =========================================================
   SCORE CLASS
========================================================= */

function getScoreClass(
    score
) {

    const value =
        Number(
            score
        ) || 0;


    if (value >= 90) {

        return "high";

    }


    if (value >= 70) {

        return "medium";

    }


    return "low";

}


/* =========================================================
   CONFIDENCE LABEL
========================================================= */

function getConfidenceLabel(
    score
) {

    const value =
        Number(
            score
        ) || 0;


    if (value >= 90) {

        return "VERY HIGH";

    }


    if (value >= 80) {

        return "HIGH";

    }


    if (value >= 70) {

        return "GOOD";

    }


    if (value >= 50) {

        return "UNCERTAIN";

    }


    return "LOW";

}


/* =========================================================
   REPORT CLASS
========================================================= */

function getReportClass(
    type
) {

    const value =
        String(
            type || ""
        )
        .toLowerCase();


    if (
        value === "working" ||
        value === "available"
    ) {

        return "positive";

    }


    if (
        value === "busy" ||
        value === "queue"
    ) {

        return "warning";

    }


    return "negative";

}


/* =========================================================
   REPORT LABEL
========================================================= */

function formatReportType(
    type
) {

    const labels = {

        working:
            "Working",

        available:
            "Working",

        busy:
            "Busy",

        queue:
            "Queue",

        broken:
            "Broken",

        maintenance:
            "Maintenance",

        payment_problem:
            "Payment",

        slow_charging:
            "Slow charging"

    };


    return (
        labels[
            String(
                type || ""
            ).toLowerCase()
        ]
        ||
        "Report"
    );

}


/* =========================================================
   STATUS LABEL
========================================================= */

function formatStatus(
    status
) {

    const labels = {

        available:
            "Available",

        working:
            "Working",

        busy:
            "Busy",

        queue:
            "Busy / Queue",

        maintenance:
            "Maintenance",

        broken:
            "Broken",

        unknown:
            "Unknown"

    };


    return (
        labels[
            String(
                status || ""
            ).toLowerCase()
        ]
        ||
        "Unknown"
    );

}


/* =========================================================
   DATE
========================================================= */

function formatDate(
    timestamp
) {

    if (!timestamp) {

        return "—";

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

        return "—";

    }


    return date.toLocaleString();

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
