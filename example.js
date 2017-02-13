/**
 * Created by nicholas on 17-2-13.
 */
const NgConf = require('./');

let ngconf = new NgConf('http://127.0.0.1:2379', 'ngconf-example');

ngconf.local({
    development: './examples'
});

ngconf.raw('/test.conf', console.log, console.log);

ngconf.json('/test.json', console.log, console.log);