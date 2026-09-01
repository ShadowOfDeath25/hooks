import { createEndpointService, getConsumerEndpointsService, updateEndpointService, deleteEndpointService } from './endpoints.services.js';

export async function createEndpointHandler(request, reply) {
    const { label, url, consumerId } = request.body;
    const db = request.server.db; 

    const { newEndpoint, plainTextSecret } = await createEndpointService(db, label, url, consumerId);

    // 4. Return the record PLUS the plain text secret exactly once.
    // Notice we do not return the `signingKey` buffer to the user.
    return reply.code(201).send({
        ...newEndpoint,
        secret: plainTextSecret
    });
}

export async function listEndpointsHandler(request, reply) {
    const { consumerId, limit, offset, includeInactive } = request.query;
    const db = request.server.db; 

    const consumerEndpoints = await getConsumerEndpointsService(db, consumerId, limit, offset, includeInactive);
    return reply.code(200).send(consumerEndpoints);
}

export async function updateEndpointHandler(request, reply) {
    const { id } = request.params;
    const { consumerId } = request.query;
    const updateData = request.body;
    const db = request.server.db; 

    // Service throws NotFoundError if the endpoint doesn't exist
    const updatedEndpoint = await updateEndpointService(db, id, consumerId, updateData);
    
    return reply.code(200).send(updatedEndpoint);
}

export async function deleteEndpointHandler(request, reply) {
    const { id } = request.params;
    const { consumerId } = request.query;
    const db = request.server.db;

    // Service throws NotFoundError if it doesn't exist
    const deletedEndpoint = await deleteEndpointService(db, id, consumerId);
    
    // Return 200 OK with the updated object so they can confirm isActive is false
    return reply.code(200).send(deletedEndpoint);
}
