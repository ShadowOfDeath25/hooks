import { AppError } from './AppError.js';

export class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to access this resource') {
        super(message, 403);
    }
}
