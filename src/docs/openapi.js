const createErrorResponse = (description, example) => ({
    description,
    type: 'object',
    additionalProperties: true,
    properties: {
        statusCode: { type: 'integer' },
        code: { type: 'string' },
        error: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' }
    },
    examples: [example]
});

export const errorResponses = {
    400: createErrorResponse(
        'Bad request or validation error',
        {
            statusCode: 400,
            error: 'Bad Request',
            message: 'Request validation failed'
        }
    ),

    401: createErrorResponse(
        'Missing or invalid API key',
        {
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid or missing API key.'
        }
    ),

    404: createErrorResponse(
        'Resource not found',
        {
            error: 'NotFoundError',
            message: 'Resource not found'
        }
    ),

    409: createErrorResponse(
        'Resource conflict',
        {
            error: 'ConflictError',
            message: 'Resource conflict'
        }
    ),

    422: createErrorResponse(
        'Request cannot be processed',
        {
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: 'Request cannot be processed'
        }
    ),

    500: createErrorResponse(
        'Internal server error',
        {
            error: 'Internal Server Error',
            message: 'Internal server error'
        }
    )
};