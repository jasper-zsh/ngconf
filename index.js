/**
 * Created by Nicholas on 2017/2/10.
 */
'use strict';

const Etcd = require('node-etcd');
const _ = require('lodash');

function NgConf(etcd, namespace, options) {
    this._etcd = new Etcd(etcd);
    this._namespace = namespace;
    let _defaults = {
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
}

module.exports = NgConf;