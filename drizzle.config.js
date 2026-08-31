import 'dotenv/config'
import {defineConfig} from "drizzle-kit";

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema',
    out: './migrations',
    dbCredentials: {
        url: `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
    }
})