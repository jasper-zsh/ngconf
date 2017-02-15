/**
 * Created by Nicholas on 2017/2/10.
 */
'use strict';

const NgConf = require('../');
const path = require('path');
const expect = require('chai').expect;

describe('Base tests', function () {
    var ngconf;

    it('Initialize with default options', function () {
        ngconf = new NgConf('http://127.0.0.1:2379', 'ngconf_test');
        expect(ngconf._namespace).to.be.equal('ngconf_test', 'Namespace not initialized');
        expect(ngconf._profile).to.be.equal('development', 'Profile not initialized');
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

    it('Read raw file', function (done) {
        ngconf.raw('test.conf', function (err, data) {
            expect(err).to.be.equal(null);
            expect(data).to.be.equal(ngconf._localCache.development['/test.conf'])
            done();
        });
    });

    it('Read json file', function (done) {
        ngconf.json('test.json', function (err, data) {
            expect(err).to.be.equal(null);
            expect(data).to.deep.equal(JSON.parse(ngconf._localCache.development['/test.json']));
            done();
        })
    });

    it('Set raw file', function (done) {
        ngconf.set('development', 'testchange.json', '{"changed":"raw file"}', function (err) {
            expect(err).to.be.equal(null);
            done();
        })
    });

    it('Watch json file', function (done) {
        var watched = false;
        ngconf.json('testchange.json', function (err, data) {
            expect(data).to.deep.equal({
                changed: 'raw file'
            });
            data.watched = true;
            ngconf.set('development', 'testchange.json', JSON.stringify(data), function (err, response) {
                expect(err).to.be.equal(null);
            })
        }, function (data) {
            watched = true;
            expect(data.watched).to.be.equal(true);
            done();
        });
        setTimeout(function () {
            expect(watched).to.be.equal(true);
        }, 1000);
    })
});