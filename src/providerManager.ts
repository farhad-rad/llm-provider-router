import { RedisClientType } from "redis";

export interface Provider {
	name: string;
	baseURL: string;
	apiKey: string;
}

export class ProviderManager {
	private providers: Provider[];
	private redis: any;

	constructor(providers: Provider[], redis: any) {
		console.log(`[MANAGER] Initializing with ${providers.length} providers:`, providers.map(p => p.name));
		this.providers = providers;
		this.redis = redis;
	}

	async getNextAvailable(): Promise<Provider | null> {
		console.log(`[MANAGER] Searching for available provider`);
		for (const provider of this.providers) {
			console.log(`[MANAGER] Checking provider: ${provider.name}`);
			const invalid = await this.redis.get(`provider:invalid:${provider.name}`);
			console.log(`[MANAGER] Provider ${provider.name} invalid status:`, invalid);
			if (!invalid) {
				console.log(`[MANAGER] Found available provider: ${provider.name}`);
				return provider;
			}
		}
		console.log(`[MANAGER] No available providers found`);
		return null;
	}

	async invalidate(name: string) {
		console.log(`[MANAGER] Invalidating provider: ${name} for 24 hours`);
		await this.redis.set(`provider:invalid:${name}`, "1", {
			EX: 86400
		});
		console.log(`[MANAGER] Provider ${name} successfully invalidated`);
	}
}