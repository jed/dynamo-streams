var through = require("through2")

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
  if (value === "") throw new Error("Cannot serialize empty string.")

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

function RequestStream(db) {
  return through.obj(function(req, enc, cb) {
    db.makeRequest(req.operation, req.params, function(err, data) {
      if (err) return cb(err)

      this.push(data)
      cb()
    }.bind(this))
  })
}

function ReadStream(db, operation, params) {
  var rs = RequestStream(db)
  var req = {
    operation: operation,
    params: shallowCopy(params || {})
  }

  var transform = through.obj(function(data, enc, cb) {
    data.Items.forEach(function(item) {
      this.push(parse({M: item}))
    }, this)

    if (data.LastEvalutatedKey) {
      req.params.ExclusiveStartKey = data.LastEvalutatedKey
      rs.write(req)
    }

    else rs.end()

    cb()
  })

  rs.write(req)

  return rs.pipe(transform)
}

function ScanStream(db, params) {
  return ReadStream(db, "scan", params)
}

function QueryStream(db, params) {
  return ReadStream(db, "query", params)
}

function WriteStream(db, operation, params) {
  var rs = RequestStream(db)
  var batch = through.obj(transform, flush)
  var ops = []
  batch.pipe(rs)

  return batch

  function transform(data, enc, cb) {
    ops.push(data) >= 25 ? flush.call(this, cb) : cb()
  }

  function flush(cb) {
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
    this.push(req)
    cb()
  }
}

function DeleteStream(db, params) {
  return WriteStream(db, "delete", params)
}

function PutStream(db, params) {
  return WriteStream(db, "put", params)
}

function exports(db) {
  db.createScanStream = ScanStream.bind(null, db)
  db.createQueryStream = QueryStream.bind(null, db)
  db.createDeleteStream = DeleteStream.bind(null, db)
  db.createPutStream = PutStream.bind(null, db)

  db.createWriteStream = WriteStream.bind(null, db)
  db.createReadStream = ReadStream.bind(null, db)

  return db
}

exports.createScanStream = ScanStream
exports.createQueryStream = QueryStream
exports.createDeleteStream = DeleteStream
exports.createPutStream = PutStream
exports.createWriteStream = WriteStream
exports.createReadStream = ReadStream

module.exports = exports
