// Base application error class
export class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

// 404 Not Found
export class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

// 409 Conflict
export class ConflictError extends AppError {
    constructor(message = 'Resource conflict') {
        super(message, 409);
    }
}

// 403 Forbidden
export class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to access this resource') {
        super(message, 403);
    }
}
