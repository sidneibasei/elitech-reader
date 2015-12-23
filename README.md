# elitech-reader (1.1.x)
Elitech Reader is a nodejs module which allows acquire data from Elitec RC-4 temperature sensor data logger.

# Adding it to your project
In your project home and with [npm](https://npmjs.org), do:

```
npm install elitech-reader --save
```

# Using it
There is a simple example that how you can use it. Very easy!

```
var elitech = require('elitech-reader');
elitech.getElitechReader()
  .then(port => {
    var device = elitech.getDevice(port);
    device.open()
        .then(() => device.getDeviceInfo(), error=>console.error(error))
        .then(info => console.log(info), error=>console.error(error))
        .then(() => device.getData('2015-12-23T06:28:03.000Z'), error=>console.error(error))
        .then(result => console.log(result), error => console.error(error))
        .then(() => device.close(function(err) {console.log(err)}));
    }, error=> {
      console.error(error);
      process.exit(1);
    }
  );

```

Elitech Reader provides a function to list all serial ports available on operating System. Example
```
...
    elitech.getSerialPorts().then(ports=>console.log(ports), error=>console.error(error));
...
```


# Get the code
Please feel free to get our code and improve it. You are welcome to be a contributor. Contact us!
```
git clone https://github.com/sidneibasei/elitech-reader.git
```

# Sample application
You can also get our sample application nodejs-collector here: [npm module](https://www.npmjs.com/package/nodejs-collector) or [git](https://github.com/john-orr/collector).

# Finally
Cheers
