// A full database replica based on some collections sub-keys
// Data is replicated on startup and updated in realtime
// Methods must be synchronous and fast

let secrets

/**
 *
 * @param { MongoDBNamespace } mongoDB
 * @param { import('ioredis').Redis } redisDB
 */
export async function cache(mongoDB, redisDB) {
    console.log('Running MongoDB cache')
    let collection
    // fill in secrets
    collection = mongoDB.collection('secret')
    const tmp = await collection.find({}).project({ _id: 1.0, usr: 1.0 }).toArray()
    secrets = tmp.map((doc) => {
        return { id: doc._id.toHexString(), author: doc.usr }
    })
}

export function isAuthor(id, author) {
    return secrets.find((l) => l.id == id && l.author == author)
}
