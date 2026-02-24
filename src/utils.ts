export function isDailyLimitError(error: any): boolean {
	console.log(`[UTILS] Checking if error is daily limit error`);
	const message = JSON.stringify(error?.response?.data || "").toLowerCase();
	console.log(`[UTILS] Error message to check:`, message.substring(0, 200));

	const isLimit = (
		message.includes("rate limit") ||
		message.includes("quota") ||
		message.includes("daily limit") ||
		message.includes("insufficient_quota")
	);
	console.log(`[UTILS] Is daily limit error: ${isLimit}`);
	return isLimit;
}