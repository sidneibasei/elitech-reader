#!/usr/bin/env node
var elitech = require("./elitech");
var getopt = require("node-getopt");

var opt = getopt.create([
	["p", "port=<port>", "COM port (eg.: /dev/cu.SLAB_USBtoUART)"],
	["c", "command=<command>", "command (eg. data, devices)"],
	["h", "help", "display this help"]
]);

var args = opt.parseSystem().options;

if (!args.command) {
	opt.showHelp();
	process.exit(1);
	return;
}

if (args.command === "data") {
	if (!args.port) {
		console.log("port argument is required");
		process.exit(1);
		return;
	}

	var device = elitech.getDevice(args.port);
	device.open()
		//.then(() => device.init())
		//.then(() => device.getDeviceInfo())
		.then(() => device.getData()) // Retrieve all data
		//.then(() => device.getData("2015-12-22T11:00:00Z")) // Retrieve only pages after given date
		.then(result => { console.log(result) }, error => { console.error(error) });

} else if (args.command === "devices") {
	require("./enumerate");

} else {
	console.error("unknown command");
}
