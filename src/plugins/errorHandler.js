import fp from 'fastify-plugin';
import { globalErrorHandler } from '../errors/handler.js';

export default fp(async function (fastify, opts) {
    fastify.setErrorHandler(globalErrorHandler);
});
