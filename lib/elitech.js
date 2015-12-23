var mapSeries = require("promise-map-series");
var jspack = require("jspack").jspack;
var serialport = require("serialport");
var sleep = require("sleep");

var initRequest = new Buffer("CC000A00D6", "hex");
var devInfoRequest = new Buffer("CC000600D2", "hex");
var debug_enabled = false;
var default_wait = 500;

function getElitechReader() {
	return new Promise((resolve,reject) => {
		serialport.list(function (err, ports) {
			if (err) {
				reject(err);
			} else {
				var ports = ports.filter(port => port.vendorId == "0x10c4" && port.productId == "0xea60");
				if(ports.length == 1) {
					resolve(ports[0]);
				} else if (ports.length == 0){
					reject('No RC-4 USB found. Are you using windows COM? Don\'t use getElitechReader().');
				}else {
					console.log(ports);
					reject('Too many RC-4 connected. You must connect just one.');
				}
			}
		});
	});
}

function getDevice(deviceId) {

	var stream;
	var r;

	setup();

	return {
		open: open,
		close: close,
		init: init,
		getDeviceInfo: getDeviceInfo,
		getData: getData
	};

	function setup() {
		stream = new serialport.SerialPort(deviceId, {
			baudRate: 115200,
			dataBits: 8,
			stopBits: 1,
			parity: "none"
		}, false);

		r = {};

		stream.on("data", function (data) {
			r.buffers.push(data);
			r.length += data.length;
			if (r.length === r.expected) {
				r.reject_call = function() {};
				stream.flush(function(err,results){
					var buffer = Buffer.concat(r.buffers);
					if(debug_enabled) {
						console.log("Response", buffer.toString("hex"));
					}
					r.resolve(r.responseParser(buffer));
				});
			}
		});

		stream.on("close", function () {
		});

		stream.on("error", function (error) {
			if(error) {
				console.log("Error: ", error);
			}
		});
	}

	function send(command, calcChecksum, expected, responseParser, wait) {
		return new Promise((resolve, reject) => {
			r.buffers = [];
			r.length = 0;
			r.expected = expected;
			r.responseParser = responseParser;
			r.resolve = resolve;
			r.reject = reject;

			r.reject_call = function() {
				// stream.close(function(err){
					reject('Serial I/O timeout.');
				// });
			};

			if (calcChecksum) {
				var checksum = command.reduce((value, sum) => value + sum, 0);
				command[command.length - 1] = checksum % 0x100;
			}

			if(debug_enabled) {
				console.log("Request", command.toString("hex"));
			}

			stream.write(command, err => {
				if (err) {
					console.error(err);
					reject(err);
				} else {
					setTimeout(r.reject_call, 3000);
				}
			});
		}).then(result => {
			if (wait) {
				sleep.usleep(wait * 1000);
			} else {
				sleep.usleep(default_wait * 1000); // default wait
			}
			return result;
		});
	}

	/**
	 * Connects to the device.
	 *
	 * @returns {Promise}
	 */
	function open() {
		return new Promise((resolve, reject) => {
			stream.open(err => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			})
		});
	}

	function close(_callback) {
		return new Promise((resolve, reject) => {
				stream.flush(function(err,results){
						stream.close(err => {
							if (err) {
								reject(err);
							} else {
								resolve();
							}
						});
				});

		});
	}

	/**
	 * Initializes the device.
	 */
	function init() {
		return send(initRequest, false, 3, initResponse);
	}

	/**
	 * Gets the device info.
	 */
	function getDeviceInfo() {
		console.log("Retrieving device info ...");
		return send(devInfoRequest, false, 160, deviceInfoResponse, 500);
	}

	/**
	 * Gets the data header.
	 */
	function getDataHeader(stationNo) {
		console.log("Retrieving data header ...");
		return send(dataHeaderRequest(stationNo), true, 11, dataHeaderResponse);
	}

	/**
	 * Gets a data page.
	 */
	function getDataPage(stationNo, startTime, interval, pageIndex, recordCount) {
		console.log(`Retrieving data page, pageIndex = ${pageIndex}, recordCount = ${recordCount}, startTime = ${startTime}, interval = ${interval} ...`);
		return send(dataRequest(stationNo, pageIndex), true, recordCount * 2 + 2, dataResponseFactory(startTime, interval));
	}

	/**
	 * Gets data.
	 */
	function getData(startDate) {
		var startTime = startDate ? new Date(startDate).getTime() : 0;
		console.log(`Retrieving data, startDate = ${startDate} ...`);
		var deviceInfo;

		return getDeviceInfo()
			.then(info => {
				deviceInfo = info;
				return getDataHeader(deviceInfo.stationNo);
			})
			.then(header => {
				var interval = deviceInfo.recInterval * 1000; // to milliseconds
				var pageSize = 100;
				var pageCount = Math.ceil(header.recordCount / pageSize);

				var requests = [];
				for (var pageIndex = pageCount - 1; pageIndex >= 0; pageIndex--) {
					var isLastPage = (pageIndex === (pageCount - 1));
					var recordCount = isLastPage ? header.recordCount % pageSize : pageSize;
					var pageStartTime = new Date(header.startTime).getTime() + pageIndex * pageSize * interval;

					requests.push({ pageIndex: pageIndex, recordCount: recordCount, startTime: pageStartTime });

					if (startTime > pageStartTime) {
						break;
					}
				}

				return mapSeries(requests, request => getDataPage(deviceInfo.stationNo, request.startTime, interval, request.pageIndex, request.recordCount))
					.then(pages => concat(pages).filter(record => {
						// console.log(`return ${record.time} >  ${startDate} = ${record.time >  startDate}`);
						return !startDate || record.time >  startDate;
					}));
			});
	}

	function concat(pages) {
		return [].concat.apply([], pages);
	}

	function initResponse(b) {
		return {
			serialNo: b.toString("hex")
		};
	}

	function deviceInfoResponse(b) {
		var d = jspack.Unpack(">1s b 3A 3A h h 7A b 7A b b h 7A 100s 10s b b b b b 7A", b);
		//console.log(d);
		return {
			stationNo: d[1],
			recInterval: parseTimeDuration(d[3]),
			upperLimit: parseTemp(d[4]),
			lowerLimit: parseTemp(d[5]),
			lastOnline: parseDateTime(d[6]),
			workStatus: parseWorkStatus(d[7]),
			startTime: parseDateTime(d[8]),
			stopButton: parseStopButton(d[9]),
			recordCount: d[11],
			currentTime: parseDateTime(d[12]),
			info: parseString(d[13]),
			deviceNumber: parseString(d[14]),
			delayTime: parseDelay(d[15]),
			toneSet: parseToneSet(d[16]),
			alarm: parseAlarm(d[17]),
			tempUnit: parseTempUnit(d[18]),
			tempCalibration: parseTemp(d[19])
		};
	}

	function dataHeaderRequest(stationNo) {
		return new Buffer(jspack.Pack(">b b b b b", [0x33, stationNo, 0x01, 0x00, 0x00]));
	}

	function dataHeaderResponse(b) {
		var d = jspack.Unpack(">1s h 7A b", b);
		return {
			recordCount: d[1],
			startTime: parseDateTime(d[2])
		};
	}

	function dataRequest(stationNo, pageNo) {
		return new Buffer(jspack.Pack(">b b b b b", [0x33, stationNo, 0x02, pageNo, 0x00]));
	}

	function dataResponseFactory(startTime, interval, recordCount) {
		return function dataResponse(b) {
			var records = [];
			for (var i = 1; i < b.length - 1; i += 2) {
				records.push({
					time: new Date(startTime + ((i - 1) / 2) * interval).toISOString(),
					temp: (b[i] * 256 + b[i + 1]) / 10.0
				});
			}
			return records;
		};
	}

	function parseTimeDuration(b) {
		//return `P${b[0]}H${b[1]}M${b[2]}S`;
		return 3600 * b[0] + 60 * b[1] + b[2];
	}

	function parseDateTime(b) {
		//return new Date(b[0] * 256 + b[1], b[2], b[3], b[4], b[5], b[6]).getTime();
		return new Date(b[0] * 256 + b[1], b[2] - 1, b[3], b[4], b[5], b[6]).toISOString();
	}

	function parseStopButton(b) {
		return (b == 0x31) ? "prohibit" : (b == 0x13) ? "permit" : "unknown";
	}

	function parseString(b) {
		return b.substring(0, b.indexOf('\u0000'));
	}

	function parseDelay(b) {
		switch (b) {
			case 0x00:
			case 0x01:
			case 0x10:
			case 0x11:
			case 0x20:
			case 0x21:
				return Math.floor(b / 16.0) + 0.5 * (b % 16);
			default:
				return 0;
		}
	}

	function parseToneSet(b) {
		return (b == 0x31) ? "none" : (b == 0x13) ? "permit" : "unknown";
	}

	function parseAlarm(b) {
		return (b == 0x03) ? "T3" : (b == 0x0A) ? "T10" ? (b == 0x00) : "none" : "unknown";
	}

	function parseTempUnit(b) {
		return (b == 0x31) ? "C" : (b == 0x13) ? "F" : "unknown";
	}

	function parseTemp(b) {
		return b / 10.0;
	}

	function parseWorkStatus(b) {
		return (b == 0x00) ? "not_start" : (b == 0x01) ? "start" : (b == 0x02) ? "stop" : (b == 0x03) ? "delay_start" : "unknown";
	}
}

/* gets serial port list */
function getSerialPorts() {
	return new Promise((resolve,reject) => {
		serialport.list(function (err, ports) {
			if (err) {
				reject(err);
			} else {
				resolve(ports);
			}
		});
	});
}

exports.getDevice = getDevice;
exports.getElitechReader = getElitechReader;
exports.getSerialPorts = getSerialPorts;
