from __future__ import annotations

from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json

from ..config import settings


# =========================================================
# OPEN CHARGE MAP CONFIGURATION
# =========================================================

OPEN_CHARGE_MAP_API_URL = (
    "https://api.openchargemap.io/v3/poi/"
)


# =========================================================
# EXCEPTIONS
# =========================================================

class OpenChargeMapError(Exception):
    """Raised when Open Charge Map cannot be reached
    or returns unusable data.
    """



# =========================================================
# BASIC HTTP REQUEST
# =========================================================

def _make_request(
    params: dict[str, Any],
) -> list[dict[str, Any]]:

    if not settings.openchargemap_api_key:

        raise OpenChargeMapError(
            "Open Charge Map API key is not configured."
        )


    params = {
        "output": "json",

        "key":
            settings.openchargemap_api_key,

        **params,
    }


    url = (
        OPEN_CHARGE_MAP_API_URL
        +
        "?"
        +
        urlencode(params)
    )


    request = Request(
        url,
        headers={
            "User-Agent":
                "ChargeLens/0.1"
        },
        method="GET",
    )


    try:

        with urlopen(
            request,
            timeout=20,
        ) as response:

            raw_data = response.read().decode(
                    "utf-8"
                )


    except HTTPError as error:

        raise OpenChargeMapError(
            (
                "Open Charge Map API returned "
                f"HTTP {error.code}."
            )
        ) from error


    except URLError as error:

        raise OpenChargeMapError(
            (
                "Unable to connect to "
                "Open Charge Map."
            )
        ) from error


    except TimeoutError as error:

        raise OpenChargeMapError(
            "Open Charge Map request timed out."
        ) from error


    try:

        data = json.loads(
            raw_data
        )

    except json.JSONDecodeError as error:

        raise OpenChargeMapError(
            "Open Charge Map returned invalid JSON."
        ) from error


    if not isinstance(
        data,
        list,
    ):

        raise OpenChargeMapError(
            "Unexpected Open Charge Map response."
        )


    return data


# =========================================================
# FETCH NEARBY CHARGING STATIONS
# =========================================================

def fetch_nearby_stations(
    latitude: float,
    longitude: float,
    distance_km: float | None = None,
    max_results: int | None = None,
    country_code: str = "IN",
) -> list[dict[str, Any]]:

    """
    Fetch charging stations near a geographic point.

    The default country is India.

    latitude:
        User/search latitude.

    longitude:
        User/search longitude.

    distance_km:
        Search radius in kilometres.

    max_results:
        Maximum number of records requested.

    country_code:
        Two-letter country code.
    """


    if not (
        -90
        <= latitude
        <= 90
    ):

        raise ValueError(
            "Invalid latitude."
        )


    if not (
        -180
        <= longitude
        <= 180
    ):

        raise ValueError(
            "Invalid longitude."
        )


    if distance_km is None:

        distance_km = (
            settings
            .openchargemap_default_distance_km
        )


    if max_results is None:

        max_results = (
            settings
            .openchargemap_max_results
        )


    distance_km = max(
        1,
        min(
            float(distance_km),
            100,
        ),
    )


    max_results = max(
        1,
        min(
            int(max_results),
            1000,
        ),
    )


    params = {

        "latitude":
            latitude,

        "longitude":
            longitude,

        "distance":
            distance_km,

        "distanceunit":
            "KM",

        "maxresults":
            max_results,

        "countrycode":
            country_code.upper(),

        "compact":
            "true",

        "verbose":
            "false",

    }


    return _make_request(
        params
    )


# =========================================================
# NORMALIZE CONNECTION DATA
# =========================================================

def _extract_connection_data(
    connections: Any,
) -> dict[str, Any]:

    if not isinstance(
        connections,
        list,
    ):

        return {

            "connector_type":
                "Unknown",

            "power_kw":
                0,

            "quantity":
                0,

        }


    connector_types: list[str] = []

    power_values: list[float] = []

    quantities: list[int] = []


    for connection in connections:

        if not isinstance(
            connection,
            dict,
        ):

            continue


        connection_type = connection.get(
                "ConnectionType"
            )


        if isinstance(
            connection_type,
            dict,
        ):

            title = connection_type.get(
                    "Title"
                )

            if title:

                connector_types.append(
                    str(title)
                )


        power = connection.get(
                "PowerKW"
            )


        try:

            if power is not None:

                power_values.append(
                    float(power)
                )

        except (
            TypeError,
            ValueError,
        ):

            pass


        quantity = connection.get(
                "Quantity"
            )


        try:

            if quantity is not None:

                quantities.append(
                    int(quantity)
                )

        except (
            TypeError,
            ValueError,
        ):

            pass


    connector_type = (
        ", ".join(
            dict.fromkeys(
                connector_types
            )
        )
        if connector_types
        else "Unknown"
    )


    power_kw = (
        max(power_values)
        if power_values
        else 0
    )


    quantity = (
        sum(quantities)
        if quantities
        else 0
    )


    return {

        "connector_type":
            connector_type,

        "power_kw":
            power_kw,

        "quantity":
            quantity,

    }


# =========================================================
# NORMALIZE ONE OPEN CHARGE MAP STATION
# =========================================================

def normalize_station(
    raw_station: dict[str, Any],
) -> dict[str, Any]:

    address_info = raw_station.get(
            "AddressInfo"
        )


    if not isinstance(
        address_info,
        dict,
    ):

        address_info = {}


    # -----------------------------------------------------
    # NAME
    # -----------------------------------------------------

    name = address_info.get(
            "Title"
        )


    if not name:

        name = "Unnamed charging station"


    # -----------------------------------------------------
    # OPERATOR
    # -----------------------------------------------------

    operator_name = (
        raw_station
        .get("OperatorInfo")
    )


    if isinstance(
        operator_name,
        dict,
    ):

        operator_name = operator_name.get(
                "Title"
            )


    if not operator_name:

        operator_name = (
            "Unknown"
        )


    # -----------------------------------------------------
    # GPS
    # -----------------------------------------------------

    latitude = address_info.get(
            "Latitude"
        )


    longitude = address_info.get(
            "Longitude"
        )


    try:

        latitude = float(latitude)

        longitude = float(longitude)

    except (
        TypeError,
        ValueError,
    ):

        latitude = None
        longitude = None


    # -----------------------------------------------------
    # ADDRESS
    # -----------------------------------------------------

    address_parts = []


    for field in (
        "AddressLine1",
        "AddressLine2",
        "Town",
        "StateOrProvince",
        "Postcode",
        "Country",
    ):

        value = address_info.get(
                field
            )


        if value:

            address_parts.append(
                str(value)
            )


    address = ", ".join(
            address_parts
        )


    # -----------------------------------------------------
    # CONNECTOR / POWER
    # -----------------------------------------------------

    connection_data = _extract_connection_data(
            raw_station.get(
                "Connections"
            )
        )


    # -----------------------------------------------------
    # STATUS
    # -----------------------------------------------------

    status = "unknown"


    status_type = raw_station.get(
            "StatusType"
        )


    if isinstance(
        status_type,
        dict,
    ):

        status_title = status_type.get(
                "Title"
            )


        if status_title:

            status_lower = str(
                    status_title
                ).lower()


            if (
                "operational"
                in status_lower
            ):

                status = "available"


            elif (
                "not operational"
                in status_lower
            ):

                status = "broken"


            elif (
                "planned"
                in status_lower
            ):

                status = "unknown"


    # -----------------------------------------------------
    # ACTIVE
    # -----------------------------------------------------

    is_active = status != "broken"


    # -----------------------------------------------------
    # EXTERNAL ID
    # -----------------------------------------------------

    external_id = raw_station.get(
            "ID"
        )


    # -----------------------------------------------------
    # FINAL NORMALIZED OBJECT
    # -----------------------------------------------------

    return {

        "external_id":
            external_id,

        "source":
            "openchargemap",

        "name":
            str(name),

        "operator_name":
            str(operator_name),

        "latitude":
            latitude,

        "longitude":
            longitude,

        "address":
            address,

        "connector_type":
            connection_data[
                "connector_type"
            ],

        "power_kw":
            connection_data[
                "power_kw"
            ],

        "connector_count":
            connection_data[
                "quantity"
            ],

        "status":
            status,

        "is_active":
            is_active,

        "raw":
            raw_station,

    }


# =========================================================
# NORMALIZE MANY STATIONS
# =========================================================

def normalize_stations(
    raw_stations: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    normalized = []


    for station in raw_stations:

        try:

            item = normalize_station(
                    station
                )


            # Only keep stations that have
            # valid GPS coordinates.

            if (
                item["latitude"]
                is None
                or
                item["longitude"]
                is None
            ):

                continue


            normalized.append(
                item
            )


        except Exception:

            # One malformed external station
            # should never break the entire import.

            continue


    return normalized


# =========================================================
# MAIN IMPORT FUNCTION
# =========================================================

def import_nearby_stations(
    latitude: float,
    longitude: float,
    distance_km: float | None = None,
    max_results: int | None = None,
) -> list[dict[str, Any]]:

    raw_stations = fetch_nearby_stations(
            latitude=latitude,
            longitude=longitude,
            distance_km=distance_km,
            max_results=max_results,
            country_code="IN",
        )


    return normalize_stations(
        raw_stations
    )