/**
 * Created by Nicholas on 2017/2/10.
 */
'use strict';

const Etcd = require('node-etcd');
const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const deasync = require('deasync');

function NgConf(etcd, namespace, options) {
    this._etcd = new Etcd(etcd);
    this._namespace = namespace;
    let _defaults = {
        localOnly: false,
        profile: function () {
            return process.env.NODE_ENV || 'development';
        }
    };
    this._options = _.defaultsDeep(options, _defaults);
    if (typeof this._options.profile === 'function') {
        this._profile = this._options.profile();
    } else {
        this._profile = this._options.profile;
    }
    this._watchers = {};
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

NgConf.prototype.persist = function (name, value, callback) {
    if (!callback) {
        callback = function () {

        }
    }
    let key = path.join('/', name);
    if (this._localPaths[this._profile][key]) {
        fs.writeFile(this._localPaths[this._profile][key], value, callback);
    } else {
        callback(null, null);
    }
};

NgConf.prototype.raw = function (name, callback, watcher) {
    var that = this;
    let key = path.join("/", name);
    let urlPath = path.join('/', this._namespace, this._profile, key);
    if (this._options.localOnly) {
        if (this._localCache[this._profile][key]) {
            callback(null, this._localCache[this._profile][key]);
        } else {
            callback(new Error('Failed to load local cache.'));
        }
        return;
    }
    this._etcd.get(urlPath, function (err, data) {
        if (err) {
            if (that._localCache[that._profile][key]) {
                callback(null, that._localCache[that._profile][key]);
            } else {
                callback(err);
            }
        } else {
            let version = data.node.modifiedIndex;
            that.persist(name, data.node.value);
            callback(null, data.node.value);
        }
    });
    if (typeof watcher === 'function') {
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
                case 'set':
                    that.persist(name, data.node.value);
                    watcher(data.node.value);
                    break;
            }
        });
    }
};

NgConf.prototype.json = function (name, callback, watcher) {
    this.raw(name, function (err, data) {
        if (err) {
            callback(err);
        } else {
            callback(null, JSON.parse(data));
        }
    }, function (data) {
        if (typeof watcher === 'function') {
            watcher(JSON.parse(data));
        }
    })
};

NgConf.prototype.set = function (profile, name, data, callback) {
    this._etcd.set(path.join('/', this._namespace, profile, name), data, callback);
};


module.exports = NgConf;