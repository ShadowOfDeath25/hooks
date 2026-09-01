/**
 * Schema for POST /apiKeys — request body.
 */
export const createApiKeySchema = {
    body: {
        type: 'object',
        required: ['label'],
        properties: {
            label: { type: 'string', minLength: 1, maxLength: 255 }
        }
    }
}

/**
 * Schema for DELETE /apiKeys/:id — route params.
 */
export const deleteApiKeySchema = {
    params: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'integer' }
        }
    }
}
