export class ApiKeyLimitError extends Error {
    constructor(limit) {
        super(`The maximum amount of ${limit} API keys have been reached. Please delete an API key and try again.`);
        this.name = "ApiKeyLimitError";
        this.statusCode = 422;
        this.limit = limit;
    }
}