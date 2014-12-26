var url = require("url")
var dynalite = require("dynalite")
var aws = require("aws-sdk")
var concat = require("concat-stream")
var assert = require("assert")
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
  var write = streams.createPutStream(db, {TableName: "stooges"})
  var read = stream(stooges[1930])

  read.pipe(write).on("end", function() {
    setTimeout(function() {
      var read = streams.createScanStream(db, {TableName: "stooges", ScanIndexForward: true})
      var write = concat(function(remote) {
        assert.deepEqual(remote, stooges[1930])
        cb()
      })

      read.pipe(write)
    }, 10)
  })
}

function testScanSyncStream(cb) {
  var write = streams.createPutStream(db, {TableName: "stooges"})
  var read = stream(stooges[1930])

  read.pipe(write).on("end", function() {
    setTimeout(function() {
      var write = streams.createScanSyncStream(db, {TableName: "stooges"})
      var read = stream(stooges[1932])

      read.pipe(write).on("end", function() {
        setTimeout(function() {
          var read = streams.createScanStream(db, {TableName: "stooges", ScanIndexForward: true})
          var write = concat(function(remote) {
            assert.deepEqual(remote, stooges[1932])
            cb()
          })

          read.pipe(write)
        }, 10)
      })
    }, 10)
  })
}
