/**
 * Created by Nicholas on 2017/2/10.
 */
'use strict';

const Etcd = require('etcd-cli');
const path = require('path');
const _ = require('lodash');
const arguejs = require('arguejs');
const Promise = require('bluebird');
const events = require('events');
const util = require('util');
const Cache = require('./lib/cache');
const bunyan = require('bunyan');

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
    this._cache = new Cache({
        localPath: this._options.localPath,
        cachePath: this._options.cachePath,
        logger: this._logger
    });
    this._version = null;
    this._inited = false;
    this._remoteOnly = false;
    this._connected = false;
    this._cache.init().then(() => {
        // Initialize remote configs
        return this.initRemote();
    }).then(() => {
        // Create version watcher
        //TODO: Watch from exact index
        return this._etcd.watcher(path.join('/', this._namespace, this._profile, 'version')).then((watcher) => {
            this._watcher = watcher;
            watcher.on('change', (data) => {
                this._logger.info('Profile version changed to %s, loading new profile.', data.node.value);
                this.loadVersion(data.node.value).then(() => {
                    this._logger.info('New profile version %d loaded.', this._version);
                    this.emit('change');
                })
            })
        })
    }).then(() => {
        this._inited = true;
        this.emit('init');
    })
}

util.inherits(NgConf, events.EventEmitter);

NgConf.prototype.loadVersion = function (version) {
    return this._etcd.get(path.join('/', this._namespace, this._profile, 'versions', String(version)), {
        recursive: true
    }).then((data) => {
        this._logger.debug('Got config version %d data %s', version, data);
        return this._cache.sync(this.buildCacheItems(data.node));
    })
};

NgConf.prototype.initRemote = function () {
    return this._etcd.get(path.join('/', this._namespace, this._profile, 'version')).then((data) => {
        // Load current version
        this._version = Number(data.node.value);
        this._logger.info('Got current version %d, loading', this._version);
        return this.loadVersion(this._version).then(() => {
            this._logger.info('Version %d loaded.', this._version);
        });
    }).catch((err) => {
        if (err.errorCode === 100) {
            // Profile does not exist, initialize it.
            this._logger.info('Remote profile %s does not exist in project %s, initializing.', this._profile, this._namespace);
            let promises = [];
            let localConfigs = this._cache.getAll();
            if (!this._cache.getProfile(this._profile)) {
                throw new Error('Local profile does not exist.');
            }
            for (let profile in localConfigs) {
                let configs = localConfigs[profile];
                for (let name in configs) {
                    promises.push(this._etcd.set(path.join('/', this._namespace, profile, 'versions', '0', name), configs[name], {
                        prevExist: false
                    }).then((data) => {
                        this._logger.debug('Key %s set.', data.node.key);
                    }).catch((err) => {
                        if (err.errorCode !== 105) {
                            throw err;
                        }
                        this._logger.debug('Key %s has been set by other process, ignore.', err.cause);
                    }))
                }
                promises.push(this._etcd.set(path.join('/', this._namespace, profile, 'version'), '0', {
                    prevExist: false
                }).catch((err) => {
                    if (err.errorCode !== 105) {
                        throw err;
                    }
                    this._logger.debug('Version key %s has been initialized by other process, ignore.', err.cause);
                }).then((data) => {
                    this._version = 0;
                    this._logger.debug('Version key %s set.', data.node.key);
                }))
            }
            return Promise.all(promises).then(() => {
                this._logger.info('All remote profiles has been initialized.');
            })
        } else {
            throw err;
        }
    }).then(() => {
        this._logger.info('Remote profile initialized.');
        this._connected = true;
        this.emit('connected');
    }).catch((err) => {
        this._logger.warn('Failed to initialize remote profile, retry after 5s.');
        this._connected = false;
        this._cache.isProfileCached(this._profile).then((cached) => {
            if (cached) {
                this._logger.warn('This profile has been cached, use cached profile.');
                this._remoteOnly = false;
            } else {
                this._logger.warn('This profile has not been cached, reject all requests.');
                this._remoteOnly = true;
            }
            this._retryTimer = setTimeout(() => {
                this.initRemote();
            }, 5000);
        });
    })
};

NgConf.prototype.buildCacheItems = function (rootNode) {
    let cacheItems = {};
    cacheItems[this._profile] = {};
    let extract = (node) => {
        let result = [];
        if (node.nodes) {
            node.nodes.forEach((node) => {
                extract(node).forEach((r) => {
                    result.push(r);
                })
            });
        } else {
            result.push({
                name: node.key.substr(rootNode.key.length),
                value: node.value
            })
        }
        return result;
    };
    rootNode.nodes.forEach((node) => {
        extract(node).forEach((config) => {
            cacheItems[this._profile][config.name] = config.value;
        })
    });
    return cacheItems;
};

NgConf.prototype.raw = function (name) {
    if (!this._inited) {
        throw new Error('NgConf not initialized.');
    }
    if (!this._connected && this._remoteOnly) {
        throw new Error('Not initialized before and cannot connect to etcd');
    }
    let args = arguejs({
        name: String
    }, arguments);
    if (args.name.indexOf('/') !== 0) {
        args.name = '/' + args.name;
    }
    return this._cache.get(this._profile, args.name);
};

NgConf.prototype.json = function (name) {
    let args = arguejs({
        name: String
    }, arguments);
    return JSON.parse(this.raw(args.name));
};

module.exports = NgConf;
