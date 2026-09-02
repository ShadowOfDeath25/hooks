export class UnauthorizedError extends Error {
    constructor() {
        super('Invalid or missing API key.');
        this.name = 'UnauthorizedError';
        this.statusCode = 401;
    }
}
