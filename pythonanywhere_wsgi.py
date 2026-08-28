import os
import sys
import asyncio
from http import HTTPStatus
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.chdir(PROJECT_ROOT)

from backend.app.main import app as fastapi_app  # noqa: E402


def _get_status_line(status_code):
    try:
        phrase = HTTPStatus(status_code).phrase
    except ValueError:
        phrase = "Unknown"

    return f"{status_code} {phrase}"


def _get_request_headers(environ):
    headers = []

    for key, value in environ.items():
        if not key.startswith("HTTP_"):
            continue

        name = key[5:].replace("_", "-").lower().encode("latin-1")
        headers.append((name, str(value).encode("latin-1")))

    if "CONTENT_TYPE" in environ:
        headers.append((b"content-type", environ["CONTENT_TYPE"].encode("latin-1")))

    if "CONTENT_LENGTH" in environ:
        headers.append((b"content-length", environ["CONTENT_LENGTH"].encode("latin-1")))

    return headers


def application(environ, start_response):
    body_size = int(environ.get("CONTENT_LENGTH") or 0)
    request_body = environ["wsgi.input"].read(body_size) if body_size else b""
    response_status = 500
    response_headers = []
    response_body = []
    received = False

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.1"},
        "http_version": environ.get("SERVER_PROTOCOL", "HTTP/1.1").split("/")[-1],
        "method": environ.get("REQUEST_METHOD", "GET"),
        "scheme": environ.get("wsgi.url_scheme", "http"),
        "path": environ.get("PATH_INFO", "") or "/",
        "raw_path": (environ.get("PATH_INFO", "") or "/").encode("latin-1"),
        "query_string": environ.get("QUERY_STRING", "").encode("latin-1"),
        "root_path": environ.get("SCRIPT_NAME", ""),
        "headers": _get_request_headers(environ),
        "client": (
            environ.get("REMOTE_ADDR", ""),
            int(environ.get("REMOTE_PORT") or 0),
        ),
        "server": (
            environ.get("SERVER_NAME", ""),
            int(environ.get("SERVER_PORT") or 0),
        ),
    }

    async def receive():
        nonlocal received

        if received:
            return {"type": "http.disconnect"}

        received = True
        return {
            "type": "http.request",
            "body": request_body,
            "more_body": False,
        }

    async def send(message):
        nonlocal response_status, response_headers

        if message["type"] == "http.response.start":
            response_status = message["status"]
            response_headers = [
                (
                    name.decode("latin-1"),
                    value.decode("latin-1"),
                )
                for name, value in message.get("headers", [])
            ]

        if message["type"] == "http.response.body":
            response_body.append(message.get("body", b""))

    asyncio.run(fastapi_app(scope, receive, send))

    start_response(
        _get_status_line(response_status),
        response_headers,
    )

    return response_body
