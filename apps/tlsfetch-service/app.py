"""
[groundcraft] tlsfetch sidecar — TLS-impersonating HTTP fetch.

Self-hosted Firecrawl loses the `fire-engine;tlsclient` engine (cloud-only), which
means every request goes out with a Python/Node TLS handshake that matches no real
browser — JA3/JA4 fingerprinting blocks it before a byte of HTML is served. This
sidecar restores that capability for free using curl_cffi, which binds
curl-impersonate/BoringSSL to reproduce Chrome's exact ClientHello and HTTP/2
frame ordering.

Most SMB/directory/news pages are server-rendered, so this path returns the same
content as the browser at a fraction of the CPU and with a *better* network
fingerprint. It cannot execute JS, which is why the engine registers below the
browser in the fallback order.

Contract: POST /fetch {url, headers?, timeout?} -> {content, statusCode, contentType, error?}
"""

import os
from flask import Flask, request, jsonify
from curl_cffi import requests as cffi_requests

app = Flask(__name__)

# Pin a CURRENT Chrome profile: impersonating an old build (chrome99 etc.) is
# itself a tell in 2026.
IMPERSONATE = os.environ.get("TLSFETCH_IMPERSONATE", "chrome124")
DEFAULT_TIMEOUT = int(os.environ.get("TLSFETCH_TIMEOUT_MS", "30000")) / 1000.0
MAX_BYTES = int(os.environ.get("TLSFETCH_MAX_BYTES", str(8 * 1024 * 1024)))


@app.get("/healthz")
def healthz():
    return "ok", 200


@app.post("/fetch")
def fetch():
    payload = request.get_json(silent=True) or {}
    url = payload.get("url")
    if not url:
        return jsonify({"content": "", "statusCode": 0, "error": "missing url"}), 400

    headers = payload.get("headers") or {}
    timeout = float(payload.get("timeout", DEFAULT_TIMEOUT * 1000)) / 1000.0
    verify = not payload.get("skip_tls_verification", False)

    try:
        res = cffi_requests.get(
            url,
            headers=headers,
            impersonate=IMPERSONATE,
            timeout=min(timeout, 120.0),
            allow_redirects=True,
            verify=verify,
        )
        body = res.text or ""
        if len(body) > MAX_BYTES:
            body = body[:MAX_BYTES]
        return jsonify(
            {
                "content": body,
                "statusCode": res.status_code,
                "contentType": res.headers.get("content-type", ""),
                "url": str(res.url),
            }
        )
    except Exception as exc:  # noqa: BLE001 - surface the reason to the engine
        return jsonify({"content": "", "statusCode": 0, "error": str(exc)[:300]}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "3005")))
