import fastifyAuth from '@fastify/auth'
import fastifyCompress from '@fastify/compress'
import fastifyCookies from '@fastify/cookie'
import fastifyFormbody from '@fastify/formbody'
import fastifyHelmet from '@fastify/helmet'
import fastifyJWT from '@fastify/jwt'
import fastifyMongodb from '@fastify/mongodb'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyRedis from '@fastify/redis'
import fastifySession from '@fastify/session'
import fastifyServe from '@fastify/static'
// import { createRequire } from 'module'
import viewsPlugin from '@fastify/view'
import fastifyWebsocket from '@fastify/websocket'
import GracefulServer from '@gquittet/graceful-server'
import i18nextMiddleware from 'i18next-http-middleware'
// const require = createRequire(import.meta.url)

const plugins = {
    i18nextMiddleware,
    fastifyCompress,
    fastifyAuth,
    fastifyCookies,
    fastifyJWT,
    fastifySession,
    fastifyWebsocket,
    viewsPlugin,
    fastifyFormbody,
    fastifyHelmet,
    fastifyMongodb,
    fastifyRateLimit,
    fastifyRedis,
    fastifyServe,
    GracefulServer
}
export { plugins }

