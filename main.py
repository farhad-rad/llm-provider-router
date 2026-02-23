import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse
from provider_pool import pool, is_daily_limit

app = FastAPI(title="llm-router")


async def forward(request: Request):
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)

    attempts = 0
    max_attempts = len(pool.providers)

    while attempts < max_attempts:
        attempts += 1

        provider = await pool.get_provider()

        if not provider:
            return Response(
                content='{"error":"All providers exhausted"}',
                status_code=429,
                media_type="application/json",
            )

        headers["Authorization"] = f"Bearer {provider['api_key']}"

        target_url = f"{provider['base_url']}{request.url.path}"
        if request.url.query:
            target_url += f"?{request.url.query}"

        async with httpx.AsyncClient(timeout=None) as client:

            # STREAM
            if request.headers.get("accept") == "text/event-stream":

                async def stream():
                    async with client.stream(
                        request.method,
                        target_url,
                        headers=headers,
                        content=body,
                    ) as resp:

                        if resp.status_code == 429:
                            data = await resp.aread()
                            try:
                                json_data = resp.json()
                            except:
                                json_data = None

                            if is_daily_limit(resp.status_code, json_data):
                                await pool.mark_exhausted(provider)
                                return

                        async for chunk in resp.aiter_bytes():
                            yield chunk

                return StreamingResponse(
                    stream(),
                    media_type="text/event-stream",
                )

            # NORMAL
            resp = await client.request(
                request.method,
                target_url,
                headers=headers,
                content=body,
            )

            try:
                data = resp.json()
            except:
                data = None

            if is_daily_limit(resp.status_code, data):
                await pool.mark_exhausted(provider)
                continue

            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=dict(resp.headers),
            )

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