var http = Npm.require('http');
var Fiber = Npm.require('fibers');
var GTFS_VEHICLE_BATCH_SIZE = 500;
var GTFS_VEHICLE_POLL_SECONDS = 10;

function gtfsRecorder() {
  var offset = 0;
  return function (msg) {
    var batch = _.first(_.rest(msg.entity, offset), GTFS_VEHICLE_BATCH_SIZE);
    _.each(batch, function(entity) {
      Fiber(function() {
        var opts = {
          vehicleId: entity.vehicle.vehicle.id,
          lastUpdate: entity.vehicle.timestamp.low * 1000,
          longitude: entity.vehicle.position.longitude,
          latitude: entity.vehicle.position.latitude
        };
        updateVehicle(opts);
      }).run();
    });
    offset += GTFS_VEHICLE_BATCH_SIZE;
    if (offset > msg.entity.length-1) offset = 0;
    console.log('next batch starts at: ' + offset + '/' + msg.entity.length);
  }
}

var recorder = gtfsRecorder();
function pollGTFS(builder) {
  var options = {
    hostname: 'webapps.thebus.org',
    port: 80,
    path: '/transitdata/production/vehloc/',
    method: 'GET'
  };
  var req = http.get(options, function (res) {
    var data = [];

    res.on('data', function (chunk) {
      data.push(chunk);

    }).on('end', function() {
      //at this point data is an array of Buffers
      //so we take each octet in each of the buffers
      //and combine them into one big octet array to pass to a
      //new buffer instance constructor
      var buffer = new Buffer(data.reduce(function(prev, current) {
          return prev.concat(Array.prototype.slice.call(current));
        }, []));
      var GTFSRealTime = builder.build("transit_realtime");
      var decoder = GTFSRealTime.FeedMessage;
      var buff = new Buffer(buffer, "base64");
      try{
        var msg = decoder.decode(buff);
        recorder(msg);
      }
      catch(e){
        console.log('error on decode or record ->');
        console.log(e);
      }
    });
  });

  req.on('error', function(e) {
    console.log('problem with request: ' + e.message);
  });

  // write data to request body
  req.end();
}

Meteor.startup(function () {
  var path = Npm.require('path');
  var fs = Npm.require('fs');
  var base = path.resolve('.');
  var isBundle = fs.existsSync(base + '/bundle');
  var modulePath = base + (isBundle ? '/bundle/static' : '/public') + '/node_modules';
  var ProtoBuf = Npm.require(modulePath + '/protobufjs'); // NOTE, this is going to be a global variable

  var protoPath = base + (isBundle ? '/bundle/static' : '/public') + '/data';
  var builder = ProtoBuf.protoFromFile(protoPath + "/gtfs-realtime.proto");
  if (_U.existy(builder)) {
    console.log("builder ->");
    console.log(builder);
  } else {
    console.log("no builder!");
  }

  pollGTFS(builder);
  setInterval(function(){
    pollGTFS(builder);
  }, GTFS_VEHICLE_POLL_SECONDS*1000);
});


// Honolulu:
// Meteor.call('createUpdateVehicle', { vehicleId: "123", lastUpdate: Date.now(), latitude: 21.3069, longitude: -157.9583 })

// Waipahu 21.3867° N, 158.0092° W
// Meteor.call('createUpdateVehicle', { vehicleId: "456", lastUpdate: Date.now(), latitude: 21.3867, longitude: -158.0092 })

// Wahiawa 21.5028° N, 158.0236° W
// Meteor.call('createUpdateVehicle', { vehicleId: "789", lastUpdate: Date.now(), latitude: 21.5028, longitude: -158.0236 })

// server: publish all room documents
Meteor.publish("vehicles", function () {
  return Vehicles.find(); // everything
});
