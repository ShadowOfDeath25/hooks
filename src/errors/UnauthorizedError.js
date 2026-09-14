import { AppError } from './AppError.js';

export class UnauthorizedError extends AppError {
    constructor() {
        super('Invalid or missing API key.', 401);
        this.name = 'UnauthorizedError';
    }
}
