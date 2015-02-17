var url = require("url")
var assert = require("assert")
var dynalite = require("dynalite")
var aws = require("aws-sdk")
var concat = require("concat-stream")
var Diff = require("diff-stream2")
var async = require("async")
var through = require("through2")
var streams = require("./")

var server
var db

var stooges = {
  1930: [
    {id: 1, name: "Moe"},
    {id: 2, name: "Shemp"},
    {id: 3, name: "Larry"}
  ],

  1932: [
    {id: 1, name: "Moe"},
    {id: 3, name: "Larry"},
    {id: 4, name: "Curly"}
  ]
}

for (var i = 5; i < 1000; i++) {
  stooges[1930].push({id: i, name: "Iggy"})
  stooges[1932].push({id: i, name: "Iggy"})
}

async.series([
  openDatabase,
  createTable,

    testPutStream,

  resetTable,

    testScanSyncStream,

  deleteTable,
  closeDatabase
])

function stream(arr) {
  var rs = through.obj()

  arr.forEach(rs.push, rs)
  rs.end()

  return rs
}

function openDatabase(cb) {
  server = dynalite({createTableMs: 0})

  server.listen(function(err) {
    if (err) throw err

    var address = server.address()
    var endpoint = url.format({
      protocol: "http",
      hostname: address.address,
      port: address.port
    })

    db = new aws.DynamoDB({
      endpoint: endpoint,
      region: "us-east-1",
      accessKeyId: "....................",
      secretAccessKey: "........................................"
    })

    cb()
  })
}

function closeDatabase(cb) {
  server.close(cb)
}

function createTable(cb) {
  var params = {
    TableName: "stooges",
    KeySchema: [{
      "AttributeName": "id",
      "KeyType": "HASH"
    }],
    AttributeDefinitions: [{
      AttributeName: "id",
      AttributeType: "N"
    }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  }

  db.createTable(params, function(err) {
    if (err) throw err

    setTimeout(cb, 1000)
  })
}

function deleteTable(cb) {
  var params = {
    TableName: "stooges"
  }

  db.deleteTable(params, function(err) {
    if (err) throw err

    setTimeout(cb, 1000)
  })
}

function resetTable(cb) {
  async.series([deleteTable, createTable], cb)
}

function testPutStream(cb) {
  streams.getTableSchema(db, "stooges", function(err, schema) {
    if (err) return cb(err)

    var comparator = streams.createTableComparator(schema)
    var write = streams.createPutStream(db, {TableName: "stooges"})

    stream(stooges[1930]).pipe(write).on("end", function() {
      var remote = streams.createScanStream(db, {TableName: "stooges"})
      var local = stream(stooges[1930])
      var write = concat(function(diff) {
        assert.deepEqual(diff, [])
        cb()
      })

      Diff({local: local, remote: remote}, {comparator: comparator}).pipe(write)
    }).resume()
  })
}

function testScanSyncStream(cb) {
  streams.getTableSchema(db, "stooges", function(err, schema) {
    if (err) return cb(err)

    var comparator = streams.createTableComparator(schema)
    var write = streams.createPutStream(db, {TableName: "stooges"})
    var read = stream(stooges[1930])

    read.pipe(write).on("end", function() {
      var write = streams.createScanSyncStream(db, {TableName: "stooges"})
      var read = stream(stooges[1932])

      read.pipe(write).on("end", function() {
        setTimeout(function() {
          var remote = streams.createScanStream(db, {TableName: "stooges"})
          var local = stream(stooges[1932])

          var write = concat(function(diff) {
            assert.deepEqual(diff, [])
            cb()
          })

          Diff({local: local, remote: remote}, {comparator: comparator}).pipe(write)
        }, 1000)
      })
    }).resume()
  })
}
