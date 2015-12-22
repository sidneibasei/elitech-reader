var serialport = require("serialport");

serialport.list(function (err, ports) {
	if (err) {
		console.error(err);
	} else {
		ports
			.filter(port => port.vendorId == "0x10c4" && port.productId == "0xea60")
			.forEach(port => { console.log(port.comName) });
	}
});
