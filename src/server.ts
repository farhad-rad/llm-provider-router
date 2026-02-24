import express from "express";
import dotenv from "dotenv";
import { createClient } from "redis";
import { ProviderManager } from "./providerManager.js";
import { handleProxy } from "./proxy.js";

console.log(`[SERVER] Starting application...`);
dotenv.config();
console.log(`[SERVER] Environment variables loaded`);

const app = express();
app.use(express.json({ limit: "20mb" }));
console.log(`[SERVER] Express middleware configured`);

const providers = JSON.parse(process.env.PROVIDERS_JSON || "[]");
console.log(`[SERVER] Loaded ${providers.length} providers from environment`);

const redis = createClient({
	                           url: process.env.REDIS_URL
                           });
console.log(`[SERVER] Redis client created with URL: ${process.env.REDIS_URL}`);

await redis.connect();
console.log(`[SERVER] Redis connected successfully`);

const manager = new ProviderManager(providers, redis);

// All OpenAI compatible routes
app.all("*", (req, res) => handleProxy(req, res, manager));
console.log(`[SERVER] Routes configured`);

const port = process.env.PORT || 8000;
app.listen(port, () => {
	console.log(`[SERVER] LLM router running on port ${port}`);
});