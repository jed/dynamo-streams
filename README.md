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

Example
-------

```javascript
var aws = require("aws-sdk")
var through = require("through2")
var dynamoStreams = require("dynamo-streams")

var db = dynamoStreams(new aws.DynamoDB)

// A silly example that bumps the timestamp on all rows
var read = db.createScanStream({TableName: "myTable"})
var write = db.createPutStream({TableName: "myTable"})
var update = through.obj(function(row, enc, cb) {
  row.updatedAt = new Date().toISOString()
  cb(null, row)
})

read.pipe(update).pipe(write).on("end", function() {
  console.log("myTable updated!")
})
```

API
---

#### dynamoStreams = require("dynamo-streams")

#### dbStreams = dynamoStreams(new aws.DynamoDB)

Extends the existing DynamoDB instance with the following stream methods. All methods encode/decode DynamoDB types (such as `S`, `N`, and `B`) automatically.

### Readable streams

#### dbStreams#createScanStream(params)

Returns a readable stream of scanned rows. `params` is passed through to the underlying `db.scan` operation, with one extension: if `ScanIndexForward` property is specified, the resulting stream is sorted according the the table schema. Keep in mind that sort requires the entire stream to be buffered.

#### dbStreams#createQueryStream(params)

Returns a readable stream of queried rows. `params` is passed through to the underlying `db.query` operation.

### Writable streams

#### dbStreams#createPutStream(params)

Returns a writeable stream of rows to put. `params` must include a `TableName` property specifying the DynamoDB table. Internally, operations are chunked using `db.BatchWriteItem`.

#### dbStreams#createDeleteStream(params)

Returns a writeable stream of rows to delete. `params` must include a `TableName` property specifying the DynamoDB table. Internally, operations are chunked using `db.BatchWriteItem`. All incoming objects are trimmed to keys of hash/range values.

#### dbStreams#createScanSyncStream(params)

Returns a writeable stream representing the state of the database for a given scan. Internally, `params` is passed to `createScanStream`, to return a readable stream. This (remote) readable stream is diffed against the items piped to the (local) stream, and the `db.BatchWriteItem` method is then used to delete items missing from the local stream and put items missing from the remote stream. In other words, the inbound items are compared with the existing items, and the minimum number of operations are then performed to update the database.

#### dbStreams#createQuerySyncStream(params)

Returns the same as the `createScanSyncStream`, but for a query instead of a scan.

Credits
-------

Many thanks to [mhart](//github.com/mhart) for his awesome [dynalite](//github.com/mhart/dynalite) library.
