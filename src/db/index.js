import 'dotenv/config'
import {drizzle} from 'drizzle-orm/node-postgres'
import {Pool} from 'pg'
import {consumers} from './schema/consumers.js'
import {endpoints} from './schema/endpoints.js'
import {events} from './schema/events.js'
import {deliveries} from './schema/deliveries.js'
import {attempts} from './schema/attempts.js'
import {apiKeys} from './schema/apiKeys.js'
import {relations} from './relations.js'

const schema = {consumers, endpoints, events, deliveries, attempts, api_keys: apiKeys};

const {POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_HOST, POSTGRES_PORT} = process.env
const requiredVars = ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_HOST', 'POSTGRES_PORT'];
for (const envVar of requiredVars) {
    if (!process.env[envVar]) {
        throw new Error(`Missing required Postgres environment variable: ${envVar}`);
    }
}
const pool = new Pool({
    connectionString: `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`
})

export const db = drizzle({client: pool, schema, relations});