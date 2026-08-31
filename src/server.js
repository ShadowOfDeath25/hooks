import Fastify from 'fastify'

import dbConnector from './plugins/db.js'


const fastify = Fastify({
    logger: true
})


fastify.register(dbConnector)


fastify.get('/', async function (request, reply) {
    reply.send({status: "Ok"})
})
fastify.listen({port: 3000, host: '0.0.0.0'}, function (err, address) {
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }
})
