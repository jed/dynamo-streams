var through = require("through2")
var Diff = require("diff-stream2")

function shallowCopy(obj) {
  return Object.keys(obj).reduce(function(acc, key) {
    acc[key] = obj[key]
    return acc
  }, {})
}

function parse(value) {
  var type = Object.keys(value)[0]

  value = value[type]

  switch (type) {
    case "NULL" : return null
    case "S"    : return value
    case "B"    : return Buffer(value, "base64")
    case "BOOL" : return value
    case "N"    : return parseFloat(value, 10)
    case "L"    : return value.map(parse)
    case "M"    : return reduce(value)
    // TODO: Support sets
  }

  throw new Error("Cannot parse " + type + ".")

  function reduce(value) {
    return Object.keys(value).reduce(function(acc, key) {
      acc[key] = parse(value[key])
      return acc
    }, {})
  }
}

function serialize(value) {
  if (value === "") value = {NULL: true}

  var type = toString.call(value).slice(8, -1)

  switch (type) {
    case "Null"    : return {NULL: true}
    case "String"  : return {S: value}
    case "Buffer"  : return {B: value.toString("base64")}
    case "Boolean" : return {BOOL: value}
    case "Number"  : return {N: String(value)}
    case "Array"   : return {L: value.map(serialize)}
    case "Object"  : return {M: reduce(value)}
    // TODO: Support sets
  }

  throw new Error("Cannot serialize " + type + ".")

  function reduce(value) {
    return Object.keys(value).reduce(function(acc, key) {
      acc[key] = serialize(value[key])
      return acc
    }, {})
  }
}

function getTableSchema(db, tableName, cb) {
  db.describeTable({TableName: tableName}, function(err, data) {
    if (err) return cb(err)

    var schema = {}

    data.Table.KeySchema.forEach(function(item) {
      schema[item.KeyType.toLowerCase()] = item.AttributeName
    })

    cb(null, schema)
  })
}

function createTableComparator(schema) {
  return function(a, b) {
    if (!a) return 1
    if (!b) return -1

    var ah = a[schema.hash]
    var bh = b[schema.hash]

    if (ah > bh) return 1
    if (ah < bh) return -1

    if (!schema.range) return 0

    var ar = a[schema.range]
    var br = b[schema.range]

    if (ar > br) return 1
    if (ar < br) return -1

    return 0
  }
}

function ReadStream(db, operation, params) {
  var requestStream = through.obj(function(req, enc, cb) {
    db.makeRequest(req.operation, req.params, cb)
  })
  var req = {
    operation: operation,
    params: shallowCopy(params || {})
  }

  var transform = through.obj(function(data, enc, cb) {
    data.Items.forEach(function(item) {
      this.push(parse({M: item}))
    }, this)

    if (data.LastEvaluatedKey) {
      req.params.ExclusiveStartKey = data.LastEvaluatedKey
      requestStream.write(req, cb)
    }

    else requestStream.end(cb)
  })

  requestStream.write(req)

  return requestStream.pipe(transform)
}

function ScanStream(db, params) {
  return ReadStream(db, "scan", params)
}

function QueryStream(db, params) {
  return ReadStream(db, "query", params)
}

function WriteStream(db, operation, params) {
  var batch = through.obj({highWaterMark: 25}, transform, flush)
  var ops = []

  return batch

  function transform(data, enc, cb) {
    ops.push(data)
    ops.length < 25 ? cb() : flush(cb)
  }

  function flush(cb) {
    if (ops.length == 0) return cb()

    var items = ops.splice(0, 25).map(function(item) {
      item = serialize(item).M

      switch (operation) {
        case "delete": return {DeleteRequest: {Key: item}}
        case "put": return {PutRequest: {Item: item}}
      }
    })

    var req = {
      operation: "batchWriteItem",
      params: {RequestItems: {}}
    }

    req.params.RequestItems[params.TableName] = items

    db.makeRequest(req.operation, req.params, function(err, data) {
      // TODO: Check data.UnprocessedItems here
      cb(err)
    })
  }
}

function DeleteStream(db, params) {
  // remove all but hash/range
  return WriteStream(db, "delete", params)
}

function PutStream(db, params) {
  return WriteStream(db, "put", params)
}

function SyncStream(db, operation, params) {
  var local = through.obj()

  getTableSchema(db, params.TableName, function(err, schema) {
    if (err) return local.emit("error", err)

    var comparator = createTableComparator(schema)
    var remote = ReadStream(db, operation, params)

    var diff = Diff({local: local, remote: remote}, {comparator: comparator})
    var put = PutStream(db, {TableName: params.TableName})
    var del = DeleteStream(db, {TableName: params.TableName})
    var dispatch = through.obj(transform, flush)

    diff.pipe(dispatch)

    function transform(data, enc, cb) {
      if (data.local) {
        put.write(data.local, cb)
      }

      else {
        var obj = Object.keys(schema).reduce(function(acc, attr) {
          acc[schema[attr]] = data.remote[schema[attr]]
          return acc
        }, {})

        del.write(obj, cb)
      }
    }

    function flush(cb) {
      put.end(function(err) {
        if (err) return cb(err)
        del.end(cb)
      })
    }
  })

  return local
}

function ScanSyncStream(db, params) {
  return SyncStream(db, "scan", params)
}

function QuerySyncStream(db, params) {
  return SyncStream(db, "query", params)
}

function exports(db) {
  db.createScanStream = ScanStream.bind(null, db)
  db.createQueryStream = QueryStream.bind(null, db)
  db.createDeleteStream = DeleteStream.bind(null, db)
  db.createPutStream = PutStream.bind(null, db)
  db.createWriteStream = WriteStream.bind(null, db)
  db.createReadStream = ReadStream.bind(null, db)
  db.createScanSyncStream = ScanSyncStream.bind(null, db)
  db.createQuerySyncStream = QuerySyncStream.bind(null, db)
  db.createSyncStream = SyncStream.bind(null, db)
  db.getTableSchema = getTableSchema.bind(null, db)

  return db
}

exports.createScanStream = ScanStream
exports.createQueryStream = QueryStream
exports.createDeleteStream = DeleteStream
exports.createPutStream = PutStream
exports.createWriteStream = WriteStream
exports.createReadStream = ReadStream
exports.createScanSyncStream = ScanSyncStream
exports.createQuerySyncStream = QuerySyncStream
exports.createSyncStream = SyncStream
exports.parse = parse
exports.serialize = serialize
exports.getTableSchema = getTableSchema
exports.createTableComparator = createTableComparator

module.exports = exports
