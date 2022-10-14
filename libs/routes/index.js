import authAdapter from '../decorators/auth.js'
// import queries from '../services/mongo.js'

// The function would need to be declared async for return to work.
// Only routes accept next parameter.
async function routes(fastify, options) {
    const { db } = fastify.mongo
    const { redis } = fastify

    // const QInstance = new queries(db, redis)
    let { softAuth } = authAdapter(fastify)

    fastify.get('/', { preHandler: softAuth }, async function (req, reply) {

        reply.send({ wow: 'nice' })
    })

    fastify.get('/channel/:id', { preHandler: softAuth }, async function (req, reply) {
        const channel = req.params.id
        reply.view('./pages/index', { title: 'this is a title', intro: 'this is an intro', channel })
    })

    fastify.get('/dashboard', { preHandler: softAuth }, async function (req, reply) {
        reply.view('./pages/index', { title: 'this is a title', intro: 'this is an intro' })
    })




        /**
     * GET one new channel at least or all channels for the current logged viewer.
     * If the viewer is author, then gets all channels for the current thread (other viewers)
     * If not, then get the unique channel between the viewer and the author for the current thread
     */
    // TODO: cache later on Redis
    const allChannels = [
        {
            au: 'super_author',
            vi: 'logged_in_viewer',
            th: 'LISTING0435232',
        },
    ]
    fastify.get('/id/:id/channels', { preHandler: auth }, async function (req, reply) {
        let channels = []
        let readableChannels = []
        const viewer = req.params.username
        const thread = req.params.id
        const mongoHex = /^(?=[a-f\d]{24}$)(\d+[a-f]|[a-f]+\d)/i
        // replace getListingById by a quicker QInstance.listingExists()
        const [err, elem] = mongoHex.test(thread)
            ? await to(QInstance.getListingById(thread, false, viewer))
            : ['NOT_FOUND', undefined]
        if (err === 'NOT_FOUND' || !elem) return reply.send({ err: 'NOT_FOUND' })
        if (err) {
            req.log.error(`get/id#getListingById: ${err.message}`)
            return reply.send({ err: 'SERVER_ERROR' })
        }
        const author = elem.usr
        const newChannel = { au: author, vi: viewer, th: thread }

        // update allChannels with new channel if needed (new logged viewers landing on a thread)
        if (!allChannels.find((ch) => ch.au == author && ch.vi == viewer && ch.th == thread)) {
            allChannels.push(newChannel)
        }
        console.log('all channels')
        console.log(allChannels)
        // get channels convenient to this thread and viewer
        if (author === viewer) {
            // get channels of all visitors (viewer) for the author
            channels = allChannels.filter((ch) => ch.au == author && ch.th == thread)
        } else {
            // find the one channel for the current viewer
            channels = [allChannels.find((ch) => ch.au == author && ch.vi == viewer && ch.th == thread)]
        }
        console.log('result channels')
        console.log(channels)
        readableChannels = channels.map((ch) => `${ch.au},${ch.vi},${elem.title.slice(0, 20)}`)
        // encrypt channels names
        channels = channels.map((ch) => crypto.encrypt(key, `${ch.au},${ch.vi},${ch.th}`))
        return reply.send({ channels, readableChannels })
    })
}

export default routes
