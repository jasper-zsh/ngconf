/**
 * Created by zhangsihao on 17/3/21.
 */
const fs = require('fs-extra');
const klaw = require('klaw');
const Promise = require('bluebird');
const bunyan = require('bunyan');
const _ = require('lodash');
const path = require('path');
const klawAsync = function (directory) {
    return new Promise((resolve, reject) => {
        let items = [];
        klaw(directory).on('data', (item) => {
            items.push(item.path);
        }).on('end', () => {
            resolve(items);
        }).on('error', reject);
    })
};
Promise.promisifyAll(fs);

function Cache(options) {
    this._options = _.defaultsDeep(options, {
        localPath: './config',
        cachePath: './cache'
    });
    if (options.logger) {
        this._logger = options.logger;
    } else {
        this._logger = bunyan.createLogger({
            name: 'NgConf.Cache'
        });
    }
    this._cache = {};
}

Cache.prototype.init = function () {
    return klawAsync(this._options.localPath).then((localFiles) => {
        // Load local cache files
        let promises = [];
        for (let i = 1; i < localFiles.length; i ++) {
            (() => {
                let localFile = localFiles[i];
                let relativePaths = path.relative(this._options.localPath, localFile).split(path.sep);
                if (relativePaths.length === 1) return;
                let profile = relativePaths[0];
                let name = '/' + relativePaths.slice(1).join('/');
                this._logger.debug('Initing local file %s for profile %s name %s', localFile, profile, name);
                if (!this._cache[profile]) {
                    this._cache[profile] = {};
                }
                promises.push(fs.statAsync(localFile).then((stat) => {
                    if (!stat.isDirectory()) {
                        return fs.readFileAsync(localFile, {encoding: 'utf-8'}).then((data) => {
                            this._cache[profile][name] = data;
                        })
                    }
                }));
            })();
        }
        return Promise.all(promises).then(() => {
            this._logger.debug('Local file loaded.');
        })
    });
};

Cache.prototype.sync = function (cachedItems) {
    let promises = [];
    for (let profile in cachedItems) {
        for (let name in cachedItems[profile]) {
            let cacheFile = path.join(this._options.cachePath, profile, name);
            let dirPath = path.dirname(cacheFile);
            promises.push(fs.mkdirpAsync(dirPath).then(() => {
                return fs.writeFileAsync(cacheFile, cachedItems[profile][name]).then(() => {
                    this._logger.debug('Local cache file %s written.', cacheFile);
                });
            }))
        }
    }
    return Promise.all(promises).then(() => {
        this._cache = cachedItems;
        this._logger.debug('Local cache synced.');
    })
};

Cache.prototype.get = function (profile, name) {
    try {
        return this._cache[profile][name];
    } catch (e) {
        return undefined;
    }
};

Cache.prototype.getProfile = function (profile) {
    try {
        return this._cache[profile];
    } catch (e) {
        return undefined;
    }
};

Cache.prototype.getAll = function () {
    return this._cache;
};

Cache.prototype.isProfileCached = function (profile) {
    return fs.accessAsync(path.join(this._options.cachePath, profile), fs.constants.F_OK).then(() => {
        return Promise.resolve(true);
    }).catch((err) => {
        return Promise.resolve(false);
    })
};

exports = module.exports = Cache;