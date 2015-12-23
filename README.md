# elitech-reader
Elitech Reader is a nodejs module which allows acquire data from Elitec RC-4 temperature sensor data logger.

#Adding it to your project
In your project home and with [npm](https://npmjs.org), do:

```
npm install elitech-reader --save
```

# Using it
Please feel free to get our code and improve it. You are welcome to be a contributor. Contact us!

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

#Get the code
```
git clone https://github.com/sidneibasei/elitech-reader.git
```
