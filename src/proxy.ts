import axios from "axios";
import { Request, Response } from "express";
import { ProviderManager } from "./providerManager.js";
import { isDailyLimitError } from "./utils.js";

export async function handleProxy(
	req: Request,
	res: Response,
	manager: ProviderManager,
): Promise<void> {
	console.log(`[PROXY] Incoming request: ${req.method} ${req.originalUrl}`);

	const provider = await manager.getNextAvailable();
	console.log(`[PROXY] Selected provider:`, provider?.name || 'none');

	if (!provider) {
		console.log(`[PROXY] No providers available, returning 503`);
		res.status(503).json({ error: "No providers available" });
		return;
	}

	try {
		console.log(`[PROXY] Forwarding request to ${provider.baseURL}${req.originalUrl}`);
		console.log(`[PROXY] Request body:`, JSON.stringify(req.body).substring(0, 200));
		console.log(`[PROXY] Request headers:`, Object.keys(req.headers));
		
		const cleanHeaders = { ...req.headers };
		delete cleanHeaders.host;
		delete cleanHeaders.connection;
		delete cleanHeaders['content-length'];
		delete cleanHeaders['accept-encoding'];
		console.log(`[PROXY] Cleaned headers:`, Object.keys(cleanHeaders));
		
		const startTime = Date.now();
		console.log(`[PROXY] Starting request at ${startTime}`);
		
		const response = await axios({
			                             method: req.method,
			                             url: provider.baseURL + req.originalUrl,
			                             headers: {
				                             ...cleanHeaders,
				                             Authorization: `Bearer ${provider.apiKey}`,
			                             },
			                             data: req.body,
			                             responseType: "stream",
			                             validateStatus: () => true,
			                             timeout: 0,
		                             });
		console.log(`[PROXY] Request completed in ${Date.now() - startTime}ms`);
		console.log(`[PROXY] Received response with status: ${response.status}`);

		// If limit error → invalidate + retry
		if (response.status >= 400) {
			console.log(`[PROXY] Error response detected, checking for rate limit`);
			const dataString = await streamToString(response.data);
			console.log(`[PROXY] Error response body:`, dataString.substring(0, 200));
			const fakeError = { response: { data: dataString } };

			if (isDailyLimitError(fakeError)) {
				console.log(`[PROXY] Daily limit error detected for provider: ${provider.name}`);
				await manager.invalidate(provider.name);
				console.log(`[PROXY] Provider invalidated, retrying with next provider`);
				return handleProxy(req, res, manager);
			}

			console.log(`[PROXY] Returning error response to client: ${response.status}`);
			res.status(response.status).send(dataString);
			return;
		}

		console.log(`[PROXY] Streaming successful response to client`);
		res.status(response.status);
		response.data.pipe(res);

	} catch (err: any) {
		console.error(`[PROXY] Exception occurred:`, err.message);
		console.error(`[PROXY] Error code:`, err.code);
		console.error(`[PROXY] Error syscall:`, err.syscall);
		console.error(`[PROXY] Error errno:`, err.errno);
		console.error(`[PROXY] Error address:`, err.address);
		console.error(`[PROXY] Error port:`, err.port);
		if (err.errors && Array.isArray(err.errors)) {
			console.error(`[PROXY] Aggregate errors count:`, err.errors.length);
			err.errors.forEach((e: any, i: number) => {
				console.error(`[PROXY] Aggregate error ${i}:`, e.message, e.code, e.syscall);
			});
		}
		console.error(`[PROXY] Error stack:`, err.stack);
		res.status(500).json({ error: "Proxy failure" });
	}
}

function streamToString(stream: any): Promise<string> {
	console.log(`[PROXY] Converting stream to string`);
	return new Promise((resolve, reject) => {
		let data = "";
		stream.on("data", (chunk: any) => data += chunk);
		stream.on("end", () => {
			console.log(`[PROXY] Stream conversion complete, length: ${data.length}`);
			resolve(data);
		});
		stream.on("error", (err: any) => {
			console.error(`[PROXY] Stream error:`, err);
			reject(err);
		});
	});
}