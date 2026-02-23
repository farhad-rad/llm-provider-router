import os
import json
from dotenv import load_dotenv

load_dotenv()

PROVIDERS = json.loads(os.getenv("PROVIDERS_JSON"))
REDIS_URL = os.getenv("REDIS_URL")