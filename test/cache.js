/**
 * Created by zhangsihao on 17/3/22.
 */
const {expect} = require('chai');
const Cache = require('../lib/cache');
const Etcd = require('etcd-cli');

describe('Cache tests', () => {
    it('Test init cache', function () {
        let etcd = new Etcd.V2HTTPClient('127.0.0.1:2379');
        let cache = new Cache(etcd, {
            localPath: './examples'
        })
        return cache.init().then(() => {

        });
    })
});