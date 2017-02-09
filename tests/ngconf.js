/**
 * Created by Nicholas on 2017/2/10.
 */
'use strict';

const NgConf = require('../');
const expect = require('chai').expect;

describe('Base tests', function () {
    it('Initialize with default options', function () {
        let ngconf = new NgConf('http://127.0.0.1:2379', 'ngconf_test');
        expect(ngconf._namespace).to.be.equal('ngconf_test', 'Namespace not initialized');
        expect(ngconf._profile).to.be.equal('development', 'Profile not initialized');
    })
});