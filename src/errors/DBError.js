import { AppError } from './AppError.js';

export class DBError extends AppError {
    constructor(message = 'Database operation failed') {
        super(message, 500);
    }
}
