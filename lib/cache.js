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

function Cache(etcd, options) {
    this._etcd = etcd;
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
}

Cache.prototype.init = function () {
    return klawAsync(this._options.localPath).then((localFiles) => {
        for (let i = 1; i < localFiles.length; i ++) {
            let localFile = localFiles[i];
            let absolutePaths = path.relative(this._options.localPath, localFile).split(path.sep);
            if (absolutePaths.length === 1) continue;
            let profile = absolutePaths[0];
            let name = '/' + absolutePaths.slice(1).join('/');
            this._logger.debug('Initing local file %s for profile %s name %s', localFile, profile, name);
        }
    });
}

Cache.prototype.sync = function () {

}

exports = module.exports = Cache;