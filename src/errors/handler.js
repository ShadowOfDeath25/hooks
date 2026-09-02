import { AppError } from './AppError.js';

export function globalErrorHandler(error, request, reply) {
    // 1. Handle Custom Domain Errors (e.g., NotFoundError thrown from services)
    if (error instanceof AppError) {
        return reply.code(error.statusCode).send({ 
            error: error.name, 
            message: error.message 
        });
    }

    // 2. Pass through Fastify's native HTTP errors (like AJV 400 Bad Request)
    if (error.statusCode >= 400 && error.statusCode < 500) {
        return reply.code(error.statusCode).send(error);
    }

    // 3. Handle Database Errors (PostgreSQL)
    // Extract real postgres code through Drizzle's error wrapper
    const pgCode = error.code || (error.cause && error.cause.code);
    switch (pgCode) {
        case '23503': // Foreign Key Violation
            return reply.code(400).send({ error: 'Bad Request', message: 'Invalid reference. The linked resource (e.g., consumerId) does not exist.' });
        case '23505': // Unique Violation
            return reply.code(409).send({ error: 'Conflict', message: 'This URL is already registered in the system.' });
        case '23514': // Check Constraint Violation
            return reply.code(400).send({ error: 'Bad Request', message: 'Database constraint failed. Ensure the data format is strictly correct.' });
    }

    // 4. Catch-all for Programmer/System errors (TypeError, DB connection fail, etc.)
    // Log the true stack trace for debugging in production
    request.log.error(error);
    
    // Determine how much to reveal based on environment
    const isDev = process.env.NODE_ENV === 'development';
    
    return reply.code(500).send({ 
        error: 'Internal Server Error',
        // RFC 7807 structured error tracing support (if request has an id)
        requestId: request.id,
        // Expose stack trace only in development
        message: isDev ? error.message : undefined,
        stack: isDev ? error.stack : undefined
    });
}
