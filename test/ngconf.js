/**
 * Created by Nicholas on 2017/2/10.
 */
'use strict';

const NgConf = require('../');
const path = require('path');
const expect = require('chai').expect;
const fs = require('fs');
const Promise = require('bluebird');
const bunyan = require('bunyan');
Promise.promisifyAll(fs);

describe('Base tests', function () {
    var ngconf;

    it('Initialize with default options', function (done) {
        ngconf = new NgConf('http://127.0.0.1:2379', 'ngconf_test', {
            localPath: './examples',
            logger: bunyan.createLogger({
                name: 'NgConf',
                level: 'debug'
            })
        });
        expect(ngconf._namespace).to.be.equal('ngconf_test', 'Namespace not initialized');
        expect(ngconf._profile).to.be.equal('development', 'Profile not initialized');
        let dirEquals = (src, dest) => {
            return fs.readdirAsync(src).then((srcFiles) => {
                return fs.readdirAsync(dest).then((destFiles) => {
                    let promises = [];
                    srcFiles.forEach((srcFile) => {
                        if (destFiles.indexOf(srcFile) >= 0) {
                            let srcpath = path.join(src, srcFile);
                            let destpath = path.join(dest, srcFile);
                            promises.push(fs.statAsync(srcpath).then((srcStat) => {
                                return fs.statAsync(destpath).then((destStat) => {
                                    if (srcStat.isDirectory() && destStat.isDirectory()) {
                                        return dirEquals(srcpath, destpath);
                                    } else if (srcStat.isDirectory() || destStat.isDirectory()) {
                                        return false;
                                    } else {
                                        return true;
                                    }
                                })
                            }))
                        } else {
                            return Promise.resolve(false);
                        }
                    });
                    return Promise.all(promises).then((results) => {
                        let result = true;
                        results.forEach((r) => {
                            result = result && r;
                        });
                        return result;
                    })
                })
            })
        }
        ngconf.on('init', () => {
            return dirEquals('./examples', './cache').then((result) => {
                expect(result).to.be.equal(true);
                done();
            }).catch(done);
        })
    });

    it('Init data with local examples', function () {
        ngconf.local({
            development: path.join(__dirname, '..', 'examples'),
            production: {
                '/test.conf': path.join(__dirname, '..', 'examples-prod', 'test.conf'),
                'test.json': path.join(__dirname, '..', 'examples-prod', 'test.json')
            }
        });
        expect(ngconf._localPaths.development).to.be.deep.equal({
            '/test.conf': path.join(__dirname, '..', 'examples', 'test.conf'),
            '/test.json': path.join(__dirname, '..', 'examples', 'test.json')
        })
    });

    it('Read raw file', function () {
        return ngconf.raw('test.conf').then((data) => {
            expect(data).to.be.equal(ngconf._localCache.development['/test.conf'])
        });
    });

    it('Read json file', function () {
        return ngconf.json('test.json').then((data) => {
            expect(data).to.deep.equal(JSON.parse(ngconf._localCache.development['/test.json']));
        })
    });

    it('Set raw file', function () {
        return ngconf.set('development', 'testchange.json', '{"changed":"raw file"}')
    });

    it('Watch json file', function (done) {
        var watched = false;
        ngconf.json('testchange.json', (data) => {
            watched = true;
            expect(data.watched).to.be.equal(true);
        }).then((data) => {
            expect(data).to.deep.equal({
                changed: 'raw file'
            });
            data.watched = true;
            setTimeout(() => {
                expect(watched).to.be.equal(true);
                done();
            }, 1000);
            return ngconf.set('development', 'testchange.json', JSON.stringify(data));
        }).catch(done);
    })
});
