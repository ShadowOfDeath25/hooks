import Fastify from 'fastify'
import Autoload from '@fastify/autoload'
import * as path from "node:path";
import {fileURLToPath} from "node:url";

const fastify = Fastify({
    logger: true
})
const __dirname = path.dirname(fileURLToPath(import.meta.url));

fastify.register(Autoload, {
    dir: path.join(__dirname, 'plugins')
})
fastify.register(Autoload, {
    dir: path.join(__dirname, 'routes')
})


fastify.get('/', async function (request, reply) {
    reply.send({status: "Ok"})
})
fastify.listen({port: 3000, host: '0.0.0.0'}, function (err) {
    if (err) {
        fastify.log.error(err)
        process.exit(1)
    }
})
