import assert from 'assert'
import { config as dotenv } from 'dotenv'
import * as Eta from 'eta'
import fastify_ from 'fastify'
import i18next from 'i18next'
import Backend from 'i18next-fs-backend'
import { createRequire } from 'module'
import crypto from 'node:crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import { options } from './config/options/_options_.js'
import config from './configuration.js'
import { softVerifyJWT, testVerifyJWT, verifyJWT, wsauth } from './libs/decorators/jwt.js'
import isBot from './libs/decorators/visitorsFilter.js'
import indexRouter from './libs/routes/index.js'
import socketsRouter from './libs/routes/sockets.js'
import Mailer from './libs/services/mailer.js'
import { cache } from './libs/services/mongo-mem.js'
import RedisAPI from './libs/services/redis.js'
import { plugins } from './_app_.js'

const { helmet, logger } = options
const { fastifyCompress, fastifyAuth, fastifyCookies, fastifyJWT, GracefulServer } = plugins
const { i18nextMiddleware, fastifySession, fastifyWebsocket, viewsPlugin } = plugins
const { fastifyFormbody, fastifyHelmet, fastifyMongodb, fastifyRateLimit, fastifyRedis, fastifyServe } =
    plugins

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const require = createRequire(import.meta.url)

dotenv()

// Incremental is better
const NODE_ENV = {
    api: -1,
    localhost: 0,
    production: 1,
}[process.env.NODE_ENV]

const dbName = 'secrets_db'


/**
 * Initialize the fastify app. It could be called many time
 * for NodeJS cluster case
 */
/**
 * build a Fastify instance and run a server or not
 * @param { Boolean } doRun if true run the app on a server
 * @returns { Promise <import('fastify').FastifyInstance> }
 */
async function build(doRun) {
    const fastify = fastify_({
        logger: logger(),
        disableRequestLogging: true,
        keepAliveTimeout: 10000,
        requestTimeout: 5000,
    })
    const gracefulServer = GracefulServer(fastify.server)
    // TODO: manage open resources (not working !)
    gracefulServer.on(GracefulServer.READY, () => {
        fastify.log.info('Server is ready')
        console.log('Server is ready')
    })
    gracefulServer.on(GracefulServer.SHUTTING_DOWN, () => {
        fastify.log.error('Server is shutting down')
        console.error('Server is shutting down')
    })
    gracefulServer.on(GracefulServer.SHUTDOWN, (error) => {
        fastify.log.error('Server is down because of', error)
        console.error('Server is down because of', error)
    })
    // TODO: SERVE STATIC CONTENT! LATER PREFERABLY ON A SEPARATE SERVER WITH PROPER PROTECTION
    fastify.register(fastifyServe, { root: path.join(__dirname, 'public') })


    fastify.decorate('conf', (tag) => config(tag))

    fastify.register(fastifyFormbody)
    fastify.register(fastifyWebsocket)

    fastify.register(fastifyHelmet, helmet())
    // fastify.register(cors, require('./config/options/cors'))

    
    fastify.register(fastifyMongodb, { forceClose: true, url: config('MONGODB_URI', { dbName }) })
    fastify.register(fastifyRedis, {
        host: config('REDIS_HOST'),
        port: 6379,
        ...(NODE_ENV === 1 ? { password: config('PASSWORD') } : {}),
    })

    await fastify.register(fastifyJWT, { secret: process.env.JWT_SECRET })
    await fastify.register(fastifyAuth)
    // TODO: fastify.after(routes)
    fastify.register(fastifyCookies)
    fastify.register(fastifySession, {
        cookieName: 'session',
        secret: crypto.randomBytes(16).toString('hex'),
        cookie: {
            secure: false,
            maxAge: 2592000000,
        },
    })

    // Set authentication as soon as possible
    // after necessary plugins have been loaded
    fastify.decorate('verifyJWT', verifyJWT)
    fastify.decorate('softVerifyJWT', softVerifyJWT)
    fastify.decorate('testVerifyJWT', testVerifyJWT)
    fastify.decorate('wsauth', wsauth)

    // Same db instance all over the all over the app.
    // never close !
    // const { db } = fastify.mongo

    const mongoURL = config('MONGODB_URI', { dbName })

    /*********************************************************************************************** */
    // Seeming heavy so use/register these after starting the app
    // !!TRANSLATIONS !!
    i18next
        .use(Backend)
        .use(i18nextMiddleware.LanguageDetector)
        .init({
            backend: {
                loadPath: __dirname + '/data/locales/{{lng}}/common.json',
            },
            fallbackLng: process.env.DEFAULT_LANG,
            preload: ['en-US', 'ar', 'fr', 'de'],
            cookiename: 'locale',
            detection: {
                order: ['cookie'],
                lookupCookie: 'locale',
                caches: ['cookie'],
            },
            // cache: {
            //     enabled: true,
            // },
            // load: 'languageOnly',
            // TODO: what's going on with en and en-US!!
            // debug: NODE_ENV < 1,
        })
    fastify.register(i18nextMiddleware.plugin, {
        i18next,
        ignoreRoutes: ['/data/', '/admin/'],
    })
    // Ping this from client side to change default language
    fastify.get('/i18n/:locale', (req, reply) => {
        reply.cookie('locale', req.params.locale, { path: '/' })
        req.i18n.changeLanguage(req.params.locale)
        if (req.headers.referer) reply.redirect(req.headers.referer)
        else reply.redirect('/')
    })
    /*********************************************************************************************** */
    // TODO: find a way to strip very long ejs logging errors
    fastify.register(viewsPlugin, {
        engine: {
            eta: Eta,
        },
        root: path.join(__dirname, 'templates'),
        options: { useWith: true },
    })
    /*********************************************************************************************** */
    // !!PREHANDERS AND HOOKS !!
    fastify.addHook('onRequest', (req, reply, done) => {
        const perPage = 12
        const page = req.query.p || 1
        req.pagination = { perPage: perPage, page: page }
        done()
    })
    fastify.addHook('onRequest', isBot)

    // Mine topK events
    // fastify.addHook('preHandler', miner)

    /*********************************************************************************************** */
    // !!SPAM ASSASSIN !!
    if (NODE_ENV === 1) {
        fastify.register(fastifyRateLimit, config('PING_LIMITER'))
    }

    // against 404 endpoint ddos
    // fastify.setNotFoundHandler({
    //     preHandler: fastify.rateLimit()
    // }, function (request, reply) {
    //     reply.code(404).send({ hello: 'world' })
    // })


    // All unhandled errors which are handled by fastify: just send http response
    fastify.setErrorHandler(function (error, request, reply) {
        if (reply.statusCode === 429) {
            error.message = 'You hit the rate limit! Slow down please!'
            reply.send(error)
            return reply
        }

        if (error.validation) {
            reply.status(422).send(error.validation)
            return reply
        }
        error.message = error.message.slice(0, 3000)
        request.log.error(error)
        error.message = 'Server is having hard times :( Please try again later.'
        reply.status(409).send(error)
    })

    /*********************************************************************************************** */
    // !!REGISTER ROUTES !!
    fastify.register(indexRouter)
    
    fastify.register(socketsRouter, { prefix: 'sockets' })

    /*********************************************************************************************** */

    
    // const adminAuth = fastify.auth([fastify.verifyJWT('admin')])

    const start = async () => {
        try {
            // whatever the env (like heroku)  wants
            const port = process.env.PORT || fastify.conf('NODE_PORT')
            console.log('The app is accessible on port: ' + port)
            await fastify.listen({ port, host: '0.0.0.0' })
            const mailer = await Mailer.getInstance(mongoURL, dbName)

            // if (NODE_ENV === 1)
            //     mailer.sendMail({
            //         to: process.env.ADMIN_EMAIL,
            //         subject: 'App instance bootstrap',
            //         text: 'App instance bootstrapped correctly',
            //         html: 'App instance bootstrapped correctly',
            //     })
            gracefulServer.setReady()
        } catch (err) {
            console.log(err)
            fastify.log.error(err)
            process.exit(1)
        }
    }
    if (doRun) await start()

    /*********************************************************************************************** */
    // !!BOOTSTRAP ENVIRONMENT AND DATA!!

    // Run only on one node
    if (process.env.worker_id == '1') {
        fastify.log.info('Checking environment data once')
        assert(fastify.mongo.db, 'MongoDB connection error')
        assert(fastify.redis, 'Redis DB connection error')        
    }

    return fastify
}

export default build
