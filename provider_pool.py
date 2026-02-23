import redis.asyncio as redis
from datetime import timedelta
from config import PROVIDERS, REDIS_URL

EXHAUSTION_PREFIX = "provider_exhausted:"

class ProviderPool:
    def __init__(self):
        self.providers = PROVIDERS
        self.index = 0
        self.redis = redis.from_url(REDIS_URL)

    async def get_provider(self):
        total = len(self.providers)

        for _ in range(total):
            provider = self.providers[self.index]
            self.index = (self.index + 1) % total

            key = EXHAUSTION_PREFIX + provider["name"]
            exhausted = await self.redis.get(key)

            if not exhausted:
                return provider

        return None

    async def mark_exhausted(self, provider):
        key = EXHAUSTION_PREFIX + provider["name"]

        # 24h TTL
        await self.redis.set(
            key,
            "1",
            ex=int(timedelta(hours=24).total_seconds())
        )


pool = ProviderPool()


def is_daily_limit(status_code: int, response_json):
    if status_code != 429:
        return False

    if not response_json:
        return False

    msg = str(response_json).lower()

    return (
        "daily" in msg
        or "quota" in msg
        or "limit reached" in msg
        or "billing" in msg
    )