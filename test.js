var url = require("url")
var dynalite = require("dynalite")
var aws = require("aws-sdk")
var concat = require("concat-stream")
var assert = require("assert")
var dynamoStreams = require("./")

var server = dynalite({createTableMs: 0})
var local = [
  {id: 1, name: "Jed"},
  {id: 2, name: "Michael"},
  {id: 3, name: "Martin"}
]

server.listen(function(err) {
  if (err) throw err

  var address = server.address()
  var endpoint = url.format({
    protocol: "http",
    hostname: address.address,
    port: address.port
  })

  var db = new aws.DynamoDB({
    endpoint: endpoint,
    region: "us-east-1"
  })

  db = dynamoStreams(db)

  var params = {
    TableName: "people",
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

  console.log("creating database...")

  db.createTable(params, function(err, data) {
    if (err) throw err

    console.log("database created.")
    console.log("putting rows...")

    var put = db.createPutStream({TableName: "people"})

    put.on("finish", function() {
      console.log("all rows put.")
      console.log("reading rows...")

      setTimeout(function() {
        var write = concat(function(remote) {
          remote.sort(function(a, b){ return a.id - b.id })

          console.log("testing equality...")

          assert.deepEqual(local, remote)

          console.log("done.")
          server.close()
        })

        db.createScanStream({TableName: "people"}).pipe(write)
      }, 50)
    })

    local.forEach(put.write, put)
    put.end()
  })
})
