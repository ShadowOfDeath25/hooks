import { AppError } from './AppError.js';

export class QueueError extends AppError {
    constructor(message = 'Queue operation failed') {
        super(message, 500);
    }
}
