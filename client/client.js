// client: start a vehicles subscription
// Meteor.subscribe("vehicles");

var width  = 1600,
    height = 1160;

var CSS_VEH_OPACITY = 0.5;
var CSS_VEH_RADIUS = 3;
var CSS_VEH_RADIUS_MOVING = 6;
var CSS_VEH_MOVING_DURATION_SEC = 5;
var CSS_VEH_COLOR = "white";

// Subscribe to 'lists' collection on startup.
// Select a list once data has arrived.
var vehiclesHandle = Meteor.subscribe('vehicles', function () {
  // var handle = Vehicles.find({}).observeChanges({
  //   changed: function (id, fields) {
  //     var vehicle = Vehicles.findOne({_id:id});
  //     if (!_U.existy(vehicle)) return;
  //     console.log('moving vehicle ->');
  //     console.log(vehicle);
  //   }
  // });
});


///////////////////////////////////////////////////////////////////////////////
// Map display
var previousData = [];

function previousCoordinates(vehicle) {
  var vehicle = _.findWhere(previousData, {vehicleId:vehicle.vehicleId});
  if (_U.existy(vehicle)) return {latitude:vehicle.latitude, longitude:vehicle.longitude};
  return undefined;
}

function hasMoved(vehicle) {
  var oldCoords = previousCoordinates(vehicle);
  return _U.existy(oldCoords) && !(oldCoords.latitude === vehicle.latitude && oldCoords.longitude === vehicle.longitude);
}

Template.map.rendered = function () {
  var self = this;
  self.node = self.find("svg");
  var svg = d3.select("svg");

  // Define the projection:

  // Only O‘ahu:
  var projection = d3.geo.albers()
    .center([0, 21.4667])
    .rotate([157.9, 0])
    .parallels([15, 25])
    .scale(130000)
    .translate([width / 2, height / 2]);

  Deps.autorun(function () {
    var vehicles = Vehicles.find().fetch();

    var movedVehicles = _.filter(vehicles, hasMoved);
    var movedVehiclesCount = parseFloat(movedVehicles.length);
    function moveDelay(d) {
      if (!hasMoved(d)) return 0;
      var count = _.max([1, movedVehiclesCount]);
      var index = _.max([0, _.indexOf(movedVehicles, d)]);
      var delay = (30000.0 / count) * index; 
      return delay; 
    }

    // Data join
    var circles = svg.selectAll("circle.vehicle")
      .data(vehicles, function (vehicle) { return vehicle._id; });

    // Entering vehicles
    circles
      .enter()
        .append("circle")
          .attr("class", "vehicle")
          .attr("id", function(d) {return "v" + d.vehicleId;})
          .attr("transform", function(d) {return "translate(" + projection([d.longitude,d.latitude]) + ")";})
          .attr("r", 100)
          .style("opacity", 0)
        .transition()
          .duration(2000)
          .attr("r", CSS_VEH_RADIUS)
          .style("opacity", CSS_VEH_OPACITY);

    // Transition entering/updating vehicles
    circles
      .transition()
        .delay(moveDelay)
        .duration(CSS_VEH_MOVING_DURATION_SEC*1000.0)
        .style("opacity", 1)
        .attr("transform", function(d) {return "translate(" + projection([d.longitude,d.latitude]) + ")";})
        .attr("r", function(d) {
          return hasMoved(d) ? CSS_VEH_RADIUS_MOVING : CSS_VEH_RADIUS;
        })
      .transition()
        .duration(2000)
        .attr("r", CSS_VEH_RADIUS)
        .style("opacity", CSS_VEH_OPACITY);

    // Exititing vehicles
    circles
      .exit()
      .transition()
        .duration(10000)
        .attr("r", 100)
        .style("opacity", 0)
        .remove();

    // Record old data:
    previousData = vehicles;
  });

  // Draw routes
  if (! self.handle) {
    self.handle = Deps.autorun(function () {

      var drawTopo = function( topo_json, feature_class ) {

        // Define path generator:
        var path = d3.geo.path()
          .projection(projection)
          .pointRadius(2);

        // Add state path:
        svg.append("path")
          .datum(topo_json)
          .attr("class", "path_defaults "+feature_class)
          .attr("d", path);
      };

      var geojson_tag_from_data_url = function(data_url) {
        var file = _.last(data_url.split("/"));
        return _.first(file.split("_topo.json")) + "_geo";
      };

      var load_dataset = function(dataset) {
        var data_url = dataset["data_url"];
        d3.json(data_url, function(topo_data) {
          // Convert back to GeoJSON:
          var geojson_tag = geojson_tag_from_data_url(data_url);
          var json = topojson.object(topo_data, topo_data.objects[geojson_tag]);
          drawTopo(json, dataset["feature_class"]);
        });
      };

      var datasets = [
        { 
          "data_url": "data/bus_topo.json",
          "feature_class": "bus_routes",
          "color": "orange",
          "circa": "2006" }
      ];

      var task = function(data_idx) {
        return function(callback) {
          load_dataset(datasets[data_idx]);
          // first argument is error reason, second is result
          callback(null);
        }
      }

      var create_legend = function(data){
        var legend = svg.append("g")
          .attr("class", "legend")
          .attr("x", 20)
          .attr("y", 25)
          .attr("height", 100)
          .attr("width", 100);

        var legend_enter = legend.selectAll('rect')
          .data(data)
          .enter()
          .append("rect")
            .attr("x", 20)
            .attr("y", function(d, i){ return i * 20 + 20;})
            .attr("width", 30)
            .attr("height", 10)
            .attr("class", "legend_rect")
            .style("fill", function(d, i) { 
               return d["color"];
            })
            .style("cursor", "pointer")
          .on("click", function(d) {
            var feature_class = "."+d["feature_class"];
            var is_hidden = d3.select(feature_class).style("display") === "none";

            // toggle it
            d3.selectAll(feature_class).style("display", is_hidden ? "block" : "none");
            d3.select(this).style("fill-opacity", is_hidden ? 1 : 0);
          });
            
        legend.selectAll("text")
          .data(data)
          .enter()
          .append("text")
            .text(function(d) {
              return d["feature_class"]+" [~"+d["circa"]+"]";
            })
            .attr("x", 60)
            .attr("y", function(d, i){ return i * 20 + 30;})
            .attr("font-family", "sans-serif")
            .attr("font-size", "11px")
            .attr("fill", "white");
      };

      var q = queue(4);
      var tasks = _.map(_.range(datasets.length), task);
      _.each(tasks, function(t) { q.defer(t); });

      // create legend
      create_legend(datasets);
    });
  }
};
