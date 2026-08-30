import fp from 'fastify-plugin'
import { db } from '../db/index.js'


async function dbConnector(fastify) {
    fastify.decorate('db', db)
}

export default fp(dbConnector)
