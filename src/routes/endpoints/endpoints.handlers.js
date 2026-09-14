import { createEndpointService, getConsumerEndpointsService, updateEndpointService, deleteEndpointService, restoreEndpointService } from './endpoints.services.js';

export async function createEndpointHandler(request, reply) {
    const { label, url } = request.body;
    const { consumerId } = request.params;
    const db = request.server.db; 

    const { newEndpoint, plainTextSecret } = await createEndpointService(db, label, url, consumerId);

    return reply.code(201).send({
        ...newEndpoint,
        secret: plainTextSecret
    });
}

export async function listEndpointsHandler(request, reply) {
    const { limit, offset, includeInactive, includeDeleted } = request.query;
    const { consumerId } = request.params;
    const db = request.server.db; 

    const consumerEndpoints = await getConsumerEndpointsService(db, consumerId, limit, offset, includeInactive, includeDeleted);
    return reply.code(200).send(consumerEndpoints);
}

export async function updateEndpointHandler(request, reply) {
    const { id } = request.params;
    const { consumerId } = request.params;
    const updateData = request.body;
    const db = request.server.db; 

    const updatedEndpoint = await updateEndpointService(db, id, consumerId, updateData);
    
    return reply.code(200).send(updatedEndpoint);
}

export async function deleteEndpointHandler(request, reply) {
    const { id } = request.params;
    const { consumerId } = request.params;
    const db = request.server.db;

    const deletedEndpoint = await deleteEndpointService(db, id, consumerId);
    
    return reply.code(200).send(deletedEndpoint);
}

export async function restoreEndpointHandler(request, reply) {
    const { id } = request.params;
    const { consumerId } = request.params;
    const db = request.server.db;

    const restoredEndpoint = await restoreEndpointService(db, id, consumerId);
    
    return reply.code(200).send(restoredEndpoint);
}
