import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse
from provider_pool import pool, is_daily_limit

app = FastAPI(title="llm-router")


async def forward(request: Request):
    print(f"[REQUEST] {request.method} {request.url.path}")
    body = await request.body()
    body_text = body.decode('utf-8', errors='replace')
    print(f"[REQUEST_BODY] {body_text}")
    headers = dict(request.headers)
    headers.pop("host", None)
    print(f"[REQUEST_HEADERS] {headers}")

    attempts = 0
    max_attempts = len(pool.providers)
    print(f"[POOL] Max attempts: {max_attempts}")

    while attempts < max_attempts:
        attempts += 1
        print(f"[ATTEMPT] {attempts}/{max_attempts}")

        provider = await pool.get_provider()

        if not provider:
            print("[ERROR] All providers exhausted")
            return Response(
                content='{"error":"All providers exhausted"}',
                status_code=429,
                media_type="application/json",
            )

        print(f"[PROVIDER] Using: {provider.get('name', 'unknown')} - {provider['base_url']}")
        headers["Authorization"] = f"Bearer {provider['api_key']}"

        target_url = f"{provider['base_url']}{request.url.path}"
        if request.url.query:
            target_url += f"?{request.url.query}"
        print(f"[TARGET] {target_url}")
        print(f"[TARGET_HEADERS] {headers}")
        print(f"[TARGET_BODY] {body_text}")

        async with httpx.AsyncClient(timeout=None) as client:

            # STREAM
            if request.headers.get("accept") == "text/event-stream":
                print("[MODE] Streaming")

                async def stream():
                    async with client.stream(
                        request.method,
                        target_url,
                        headers=headers,
                        content=body,
                    ) as resp:
                        print(f"[RESPONSE] Status: {resp.status_code}")

                        if resp.status_code == 429:
                            data = await resp.aread()
                            try:
                                json_data = resp.json()
                            except:
                                json_data = None

                            if is_daily_limit(resp.status_code, json_data):
                                print(f"[LIMIT] Provider exhausted")
                                await pool.mark_exhausted(provider)
                                return

                        async for chunk in resp.aiter_bytes():
                            yield chunk

                return StreamingResponse(
                    stream(),
                    media_type="text/event-stream",
                )

            print("[MODE] Normal")
            resp = await client.request(
                request.method,
                target_url,
                headers=headers,
                content=body,
            )
            print(f"[RESPONSE] Status: {resp.status_code}")
            print(f"[RESPONSE_HEADERS] {dict(resp.headers)}")
            print(f"[RESPONSE_BODY] {resp.text}")

            try:
                data = resp.json()
            except:
                data = None

            if is_daily_limit(resp.status_code, data):
                print(f"[LIMIT] Provider exhausted, trying next...")
                await pool.mark_exhausted(provider)
                continue

            print("[SUCCESS] Returning response")
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=dict(resp.headers),
            )

    print("[ERROR] All providers exhausted after all attempts")
    return Response(
        content='{"error":"All providers exhausted"}',
        status_code=429,
        media_type="application/json",
    )


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def proxy(request: Request):
    return await forward(request)