import { AppError } from './AppError.js';

export class ApiKeyLimitError extends AppError {
    constructor(limit) {
        super(`The maximum amount of ${limit} API keys have been reached. Please delete an API key and try again.`, 422);
        this.name = "ApiKeyLimitError";
        this.limit = limit;
    }
}