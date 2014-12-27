dynamo-streams
==============

[![Build Status](https://travis-ci.org/jed/dynamo-streams.svg)](https://travis-ci.org/jed/dynamo-streams)

A DynamoDB stream interface for the JavaScript aws-sdk library.

- Readable streams
  - [createScanStream](#dbstreamscreatescanstreamparams)
  - [createQueryStream](#dbstreamscreatequerystreamparams)
  - createTableStream (TODO)

- Writable streams
  - [createPutStream](#dbstreamscreateputstreamparams)
  - [createDeleteStream](#dbstreamscreatedeletestreamparams)
  - [createScanSyncStream](#dbstreamscreatescansyncstreamparams)
  - [createQuerySyncStream](#dbstreamscreatequerysyncstreamparams)

- Tranforms
  - createGetStream (TODO)

API
---

#### dbStreams = dynamoStreams(new aws.DynamoDB)

Extends the existing DynamoDB instance with the following stream methods. All methods encode/decode DynamoDB types (such as `S`, `N`, and `B`) automatically.

```javascript
var aws = require("aws-sdk")
var dynamoStreams = require("dynamo-streams")

var db = new aws.DynamoDB

// create each stream as a function...
var read = dynamoStreams.createScanStream(db, {TableName: "stooges"})

// ... or as a method.
var dbStreams = dynamoStreams(db)
var read = dbStreams.createScanStream({TableName: "stooges"})
```

### Readable streams

#### dbStreams#createScanStream(params)

Returns a readable stream of scanned rows. `params` is passed through to the underlying `db.scan` operation.

```javascript
var read = dbStreams.createScanStream({TableName: "stooges"})

read.on("data", console.log)

// {id: 1, name: "Moe"}
// {id: 2, name: "Shemp"}
// {id: 3, name: "Larry"}
```

#### dbStreams#createQueryStream(params)

Same as `createScanStream`, but for queries.

### Writable streams

#### dbStreams#createPutStream(params)

Returns a writeable stream of rows to put. `params` must include a `TableName` property specifying the DynamoDB table. Internally, operations are chunked using `db.BatchWriteItem`.

```javascript
var put = dbStreams.createPutStream({TableName: "stooges"})

put.write({id: 4, name: "Curly"})
put.end()

put.on("end", function() {
  var read = dbStreams.createScanStream({TableName: "stooges"})

  read.on("data", console.log)

  // {id: 1, name: "Moe"}
  // {id: 2, name: "Shemp"}
  // {id: 3, name: "Larry"}
  // {id: 4, name: "Curly"}
}
```

#### dbStreams#createDeleteStream(params)

Returns a writeable stream of rows to delete. `params` must include a `TableName` property specifying the DynamoDB table. Internally, operations are chunked using `db.BatchWriteItem`. All incoming objects are trimmed to keys of hash/range values.

```javascript
var put = dbStreams.createDeleteStream({TableName: "stooges"})

put.write({id: 2})
put.end()

put.on("end", function() {
  var read = dbStreams.createScanStream({TableName: "stooges"})

  read.on("data", console.log)

  // {id: 1, name: "Moe"}
  // {id: 3, name: "Larry"}
}
```

#### dbStreams#createScanSyncStream(params)

Returns a writeable stream representing the state of the database for a given scan. Internally, `params` is passed to `createScanStream`, to return a readable stream. This (remote) readable stream is diffed against the items piped to the (local) stream, and the `db.BatchWriteItem` method is then used to delete items missing from the local stream and put items missing from the remote stream. In other words, the inbound items are compared with the existing items, and the minimum number of operations are then performed to update the database.

```javascript
var put = dbStreams.createDeleteStream({TableName: "stooges"})

sync.write({id: 1, name: "Moe"})
sync.write({id: 3, name: "Larry"})
sync.write({id: 4, name: "Curly"})

sync.end()

put.on("end", function() {
  var read = dbStreams.createScanStream({TableName: "stooges"})

  read.on("data", console.log)

  // {id: 1, name: "Moe"}
  // {id: 3, name: "Larry"}
  // {id: 4, name: "Curly"}
}
```

#### dbStreams#createQuerySyncStream(params)

Returns the same as the `createScanSyncStream`, but for a query instead of a scan.

Credits
-------

Many thanks to [mhart](//github.com/mhart) for his awesome [dynalite](//github.com/mhart/dynalite) library.
