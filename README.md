dynamo-streams
==============

A DynamoDB stream interface for the JavaScript aws-sdk library.

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

### db = dynamoStreams(new aws.DynamoDB)

Extends the existing DynamoDB instance with the following stream methods. Note that since all of these methods encode/decode DynamoDB string types automatically, all input and output is done with normal JavaScript objects. If you'd rather not extend the DynamoDB instance, all methods are available on the `dynamoStreams` module itself, but with the DynamoDB instance as the first argument.

### db#createScanStream(params)

Returns a readable stream of scanned rows. `params` is passed through to the underlying `db.scan` operation.

### db#createQueryStream(params)

Returns a readable stream of queried rows. `params` is passed through to the underlying `db.query` operation.

### db#createPutStream(params)

Returns a writeable stream of rows to put. `params` must include a `TableName` property specifying the DynamoDB table.

### db#createDeleteStream(params)

Returns a writeable stream of rows to delete. `params` must include a `TableName` property specifying the DynamoDB table.

TODO
----

- Support for string, number, and binary sets
- Support for table names
- Support for batch get operations

Credits
-------

Many thanks to [mhart](//github.com/mhart) for his awesome [dynalite](//github.com/mhart/dynalite) library.
