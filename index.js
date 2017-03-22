/**
 * Created by Nicholas on 2017/2/10.
 */
'use strict';

const Etcd = require('etcd-cli');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const deasync = require('deasync');
const arguejs = require('arguejs');
const Promise = require('bluebird');
const events = require('events');
const util = require('util');
const bunyan = require('bunyan');

Promise.promisifyAll(fs);

function NgConf(etcd, namespace, options) {
    events.EventEmitter.apply(this);
    this._etcd = new Etcd.V2HTTPClient(etcd);
    this._namespace = namespace;
    let _defaults = {
        localOnly: false,
        profile: function () {
            return process.env.NODE_ENV || 'development';
        },
        cachePath: './cache',
        localPath: './config'
    };
    this._options = _.defaultsDeep(options, _defaults);
    if (typeof this._options.profile === 'function') {
        this._profile = this._options.profile();
    } else {
        this._profile = this._options.profile;
    }
    if (this._options.logger) {
        this._logger = this._options.logger;
    } else {
        this._logger = bunyan.createLogger({
            name: 'NgConf'
        });
    }
    this._watchers = {};
    this.initCache().then(() => {
        this.emit('init');
    })
}

util.inherits(NgConf, events.EventEmitter);

NgConf.prototype.initCache = function () {
    let recursiveFunc = (root, dirPath) => {
        return fs.readdirAsync(path.join(root, dirPath)).then((filenames) => {
            let promises = [];
            filenames.forEach((filename) => {
                let filepath = path.join(root, dirPath, filename);
                let cachepath = path.join(this._options.cachePath, dirPath, filename);
                promises.push(fs.accessAsync(cachepath, fs.constants.F_OK).then(() => {
                    return fs.statAsync(filepath).then((stat) => {
                        if (stat.isDirectory()) {
                            return recursiveFunc(root, path.join(dirPath, filename));
                        }
                    })
                }).catch((err) => {
                    return fs.statAsync(filepath).then((stat) => {
                        if (stat.isDirectory()) {
                            return fs.mkdirAsync(cachepath).then(() => {
                                this._logger.debug('Cache config dir %s does not exists, created.', filepath);
                            });
                        } else {
                            return new Promise((resolve, reject) => {
                                let readStream = fs.createReadStream(filepath);
                                let writeStream = fs.createWriteStream(cachepath);
                                readStream.pipe(writeStream);
                                readStream.on('end', () => {
                                    writeStream.end();
                                    resolve();
                                });
                                readStream.on('error', reject);
                                writeStream.on('error', reject);
                            }).then(() => {
                                this._logger.debug('Cache config file %s does not exist, copied.', filepath);
                            })
                        }
                    })
                }));
            });
            return Promise.all(promises);
        })
    };
    return fs.accessAsync(this._options.cachePath, fs.constants.F_OK).catch((err) => {
        return fs.mkdirAsync(this._options.cachePath).then(() => {
            this._logger.debug('Cache dir %s does not exist, created', this._options.cachePath);
        })
    }).then(recursiveFunc(this._options.localPath, '.'))
        .then(() => {
            return this._etcd.get(path.join('/', this._namespace, this._profile, version)).catch((err) => {
                if (err.errorCode === 100) {
                    return 0;
                } else {
                    throw err;
                }
            }).then((version) => {

            })
        })
}

NgConf.prototype.readFromCache = function (name) {

}

NgConf.prototype.setLocalProfileContent = function (profile, name, content) {
    if (!this._localCache) {
        this._localCache = {};
    }
    if (!this._localCache[profile]) {
        this._localCache[profile] = {};
    }
    this._localCache[profile][name] = content.toString();
};

NgConf.prototype.setLocalProfilePath = function (profile, name, filepath) {
    if (!this._localPaths) {
        this._localPaths = {};
    }
    if (!this._localPaths[profile]) {
        this._localPaths[profile] = {};
    }
    this._localPaths[profile][name] = filepath;
};

NgConf.prototype.local = function (profiles) {
    var that = this;
    let setNotExist = deasync(function (key, value, callback) {
        that._etcd.compareAndSwap(key, value, ' ', {prevExist: false}, function (err) {
            if (err) {
                callback(null, false);
            } else {
                callback(null, true);
            }
        });
    });
    for (let profile in profiles) {
        let content = profiles[profile];
        let result = {};
        if (typeof content === 'string') {
            let files = readDirectory(content);
            for (let filename in files) {
                let file = files[filename];
                let key = path.join('/', path.relative(content, filename));
                result[key] = file;
                that.setLocalProfilePath(profile, key, filename);
            }
        } else if (typeof content === 'object') {
            //Assign configs manually
            for (let key in content) {
                let realpath = content[key];
                if (fs.existsSync(realpath)) {
                    result[key] = fs.readFileSync(realpath);
                    that.setLocalProfilePath(profile, key, realpath);
                }
            }
        }
        for (let key in result) {
            if (!this._options.localOnly) {
                setNotExist(path.join('/', this._namespace, profile, key), result[key]);
            }
            that.setLocalProfileContent(profile, key, result[key]);
        }
    }
};

function readDirectory(file, parent) {
    if (!parent) {
        parent = '';
    }
    let fullpath = path.join(parent, file);
    let stat = fs.lstatSync(fullpath);
    let result = {};
    if (stat.isDirectory()) {
        let files = fs.readdirSync(file);
        files.forEach(function (filename) {
            result = _.merge(result, readDirectory(filename, path.join(parent, file)));
        });
    } else {
        result[fullpath] = fs.readFileSync(fullpath);
    }
    return result;
}

NgConf.prototype.persist = function (name, value) {
    let args = arguejs({
        name: String,
        value: String
    }, arguments);
    return new Promise((resolve, reject) => {
        let key = path.join('/', name);
        if (this._localPaths[this._profile][key]) {
            fs.writeFile(this._localPaths[this._profile][key], value, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        } else {
            resolve();
        }
    })
};

NgConf.prototype.raw = function (name, watcher) {
    let args = arguejs({
        name: String,
        watcher: [Function, [null]]
    }, arguments);
    var that = this;
    return new Promise((resolve, reject) => {
        let key = path.join("/", name);
        let urlPath = path.join('/ngconf', this._namespace, this._profile, key);
        if (this._options.localOnly) {
            if (this._localCache[this._profile][key]) {
                return resolve(this._localCache[this._profile][key]);
            } else {
                return reject(new Error('Failed to load local cache.'));
            }
        }
        this._etcd.get(urlPath, function (err, data) {
            if (err) {
                if (that._localCache[that._profile][key]) {
                    return resolve(that._localCache[that._profile][key]);
                } else {
                    return reject(err);
                }
            } else {
                let version = data.node.modifiedIndex;
                that.persist(name, data.node.value).then(() => {
                    resolve(data.node.value);
                }).catch(reject);
            }
        });
        if (args.watcher) {
            let _watcher;
            if (!this._watchers[name]) {
                _watcher = this._etcd.watcher(urlPath);
                this._watchers[name] = _watcher;
            } else {
                _watcher = this._watchers[name];
            }
            _watcher.on('change', function (data) {
                let version = data.node.modifiedIndex;
                switch (data.action) {
                    case 'compareAndSwap':
                    case 'set':
                        that.persist(name, data.node.value);
                        watcher(data.node.value);
                        break;
                }
            });
        }
    })
};

NgConf.prototype.json = function (name, watcher) {
    let args = arguejs({
        name: String,
        watcher: [Function, [null]]
    }, arguments)
    return this.raw(name, (data) => {
        if (args.watcher) {
            args.watcher(JSON.parse(data));
        }
    }).then((data) => {
        return JSON.parse(data);
    });
};

NgConf.prototype.set = function (profile, name, data) {
    return new Promise((resolve, reject) => {
        this._etcd.set(path.join('/ngconf', this._namespace, profile, name), data, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    })
};


module.exports = NgConf;
