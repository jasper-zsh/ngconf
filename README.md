# ngconf
[![Build Status](https://travis-ci.org/jasonz93/ngconf.svg?branch=master)](https://travis-ci.org/jasonz93/ngconf)

A new generation distribute configuration component used etcd, currently for Node.JS

## Quick Start
See example.js

```javascript
const NgConf = require('ngconf');
const path = require('path');

let ngconf = new NgConf('http://127.0.0.1:2379', 'ngconf-example');

ngconf.local({
    development: './examples',
    production: {
        '/test.conf': './examples-prod/test.conf',
        'test.json': path.join(__dirname, 'examples-prod', 'test.json')
    }
});

ngconf.raw('/test.conf', readResult, watcherResult);

ngconf.json('/test.json', readResult, watcherResult);

function readResult(err, data) {
    console.log('This is read result.', data);
}

function watcherResult(data) {
    console.log('This is watcher result.', data);
}
```

1. Put these files in the same directory

> - example.js (shown above)
> - examples/
> - examples-prod/

2. Development environment
```shell
$ node example.js
```
3. Use NODE_ENV to switch profile.
```shell
$ NODE_ENV=production node example.js
```

## Base Usage
```javascript
new NgConf(etcdHosts, namespace, [options])
```

### Args
- etcdHosts: String or array.`'http://127.0.0.1:2379'` or `['http://127.0.0.1:2379', 'http://192.168.1.1:2379']`
- namespace: String, usually use project name.
- options: Object. Full options and default values like this.
```javascript
let opts = {
    localOnly: false     //When true, ngconf will only use content in local cache, and won't update configs in etcd
    profile: function () {  //function or string, returns profile name
        return process.env.NODE_ENV || 'development';
    }
}
```

### Callbacks

#### callback
```javascript
function callback(err, data) {}
```

#### watcher
```javascript
function watcher(data) {}
```

### Methods
```javascript
ngconf.raw(name, callback, [watcher]);
```
```javascript
ngconf.json(name, callback, [watcher]);
```