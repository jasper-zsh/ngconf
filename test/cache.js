/**
 * Created by zhangsihao on 17/3/22.
 */
const {expect} = require('chai');
const Cache = require('../lib/cache');
const Etcd = require('etcd-cli');

describe('Cache tests', () => {
    it('Test init cache', function () {
        let cache = new Cache({
            localPath: './examples'
        });
        return cache.init().then(() => {

        });
    })

    it('Test sync cache', function () {
        let cache = new Cache({
            localPath: './examples'
        });
        return cache.init().then(() => {
            return cache.sync(cache._cache);
        }).then(() => {

        });
    })
});