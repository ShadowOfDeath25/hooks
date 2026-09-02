import { AppError } from './AppError.js';

export class InvalidRequestError extends AppError {
    constructor(message = 'Invalid request') {
        super(message, 400);
    }
}