'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; //-------------------------------------------------------------------------------
// Imports
//-------------------------------------------------------------------------------

var _bugcore = require('bugcore');

var _through = require('through2');

var _gulpUtil = require('gulp-util');

var _rxLite = require('rx-lite');

var _awsSdk = require('aws-sdk');

var _path = require('path');

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

//-------------------------------------------------------------------------------
// Simplify References
//-------------------------------------------------------------------------------

var range = _rxLite.Observable.range,
    timer = _rxLite.Observable.timer,
    just = _rxLite.Observable.just,
    fromNodeCallback = _rxLite.Observable.fromNodeCallback;
var pow = Math.pow;
var stringify = JSON.stringify;

//-------------------------------------------------------------------------------
// Declare Class
//-------------------------------------------------------------------------------

/**
 * @class
 * @extends {Obj}
 */

var GulpCloudformation = _bugcore.Class.extend(_bugcore.Obj, {

    _name: 'gulp.GulpCloudformation',

    //-------------------------------------------------------------------------------
    // Constructor
    //-------------------------------------------------------------------------------

    /**
     * @constructs
     * @param {*} options
     */
    _constructor: function _constructor(options) {

        this._super();

        //-------------------------------------------------------------------------------
        // Public Properties
        //-------------------------------------------------------------------------------

        /**
         * @private
         * @type {CloudFormation}
         */
        this.context = new _awsSdk.CloudFormation(options);

        this.describeStacks = fromNodeCallback(this.context.describeStacks, this.context);

        this.createStack = fromNodeCallback(this.context.createStack, this.context);

        this.updateStack = fromNodeCallback(this.context.updateStack, this.context);

        this.validateTemplate = fromNodeCallback(this.context.validateTemplate, this.context);
    },


    //-------------------------------------------------------------------------------
    // Public Methods
    //-------------------------------------------------------------------------------

    validate: function validate() {
        var _this2 = this;

        var main = function main(_ref) {
            var TemplateBody = _ref.TemplateBody;

            return _this2.validateTemplate({
                TemplateBody: TemplateBody
            }).map(_gulpUtil.log).catch(function (err) {
                (0, _gulpUtil.log)(err);
                throw err;
            });
        };

        function transform(file, enc, done) {
            var _this3 = this;

            if (file.isNull() || file.isStream()) {
                this.push(file);
                return done();
            }

            var contents = file.contents;

            var TemplateBody = contents.toString(enc);

            return main({ TemplateBody: TemplateBody }).subscribe(function () {
                _this3.push(file);
                return done();
            });
        }

        return (0, _through.obj)(transform);
    },
    deploy: function deploy() {
        var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

        var _this = this;
        function transform(file, enc, done) {
            var _this4 = this;

            if (file.isNull() || file.isStream()) {
                this.push(file);
                return done();
            }

            var path = file.path,
                contents = file.contents;

            var ext = (0, _path.extname)(path);
            var StackName = (0, _path.basename)(path, ext);
            var TemplateBody = contents.toString(enc);

            var acc = void 0;

            return _this.doDeploy(StackName, TemplateBody, params).subscribe(function (value) {
                return acc = value;
            }, done, function () {
                var buffer = new Buffer(stringify(acc), enc);
                var newFile = new _gulpUtil.File(_extends({}, file, { contents: buffer }));
                _this4.push(newFile);
                return done();
            });
        }

        return (0, _through.obj)(transform);
    },


    //-------------------------------------------------------------------------------
    // Private Methods
    //-------------------------------------------------------------------------------

    /**
     * @private
     * @param {string} StackName
     * @param {string} TemplateBody
     * @param params
     * @returns {Observable}
     */
    doDeploy: function doDeploy(StackName, TemplateBody, params) {
        var _this5 = this;

        return this.upsertStack(_extends({
            StackName: StackName,
            TemplateBody: TemplateBody
        }, params)).map(_gulpUtil.log).map(function () {
            return { StackName: StackName };
        }).catch(function (err) {
            (0, _gulpUtil.log)(err);
            return just({ StackName: StackName });
        }).flatMap(function (fetchParams) {
            return _this5.fetchOutputs(fetchParams);
        }).flatMap(function (_ref2) {
            var Outputs = _ref2.Outputs;
            return Outputs;
        }).map(function (_ref3) {
            var OutputKey = _ref3.OutputKey,
                OutputValue = _ref3.OutputValue;

            return _defineProperty({}, OutputKey, OutputValue);
        }).scan(function (acc, value) {
            return Object.assign(acc, value);
        }, {});
    },
    hasStack: function hasStack(params) {
        return this.describeStacks(params).flatMap(function (_ref5) {
            var Stacks = _ref5.Stacks;
            return Stacks;
        }).filter(this.isComplete).catch(function () {
            return just(false);
        });
    },
    upsertStack: function upsertStack(params) {
        var _this6 = this;

        var StackName = params.StackName;

        return this.hasStack({ StackName: StackName }).flatMap(function (hasStack) {
            if (hasStack) {
                return _this6.updateStack(params);
            }

            return _this6.createStack(_extends({}, params, {
                OnFailure: 'DELETE'
            }));
        });
    },
    fetchOutputs: function fetchOutputs(params) {
        var _this7 = this;

        return range(0, 20).delay(function (x) {
            return timer(1000 * pow(2, x));
        }).flatMap(function () {
            return _this7.describeStacks(params);
        }).flatMap(function (_ref6) {
            var Stacks = _ref6.Stacks;
            return Stacks;
        }).filter(this.isComplete).take(1);
    },


    /**
     * @private
     * @param {{StackStatus: string}}
     * @returns {boolean}
     */
    isComplete: function isComplete(_ref7) {
        var StackStatus = _ref7.StackStatus;

        (0, _gulpUtil.log)('StackStatus', StackStatus);

        switch (StackStatus) {
            case 'CREATE_COMPLETE':
            case 'DELETE_COMPLETE':
            case 'ROLLBACK_COMPLETE':
            case 'UPDATE_COMPLETE':
            case 'UPDATE_ROLLBACK_COMPLETE':
                return true;

            case 'CREATE_FAILED':
            case 'DELETE_FAILED':
            case 'ROLLBACK_FAILED':
            case 'UPDATE_ROLLBACK_FAILED':
                throw new Error();

            case 'CREATE_IN_PROGRESS':
            case 'DELETE_IN_PROGRESS':
            case 'ROLLBACK_IN_PROGRESS':
            case 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS':
            case 'UPDATE_IN_PROGRESS':
            case 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS':
            case 'UPDATE_ROLLBACK_IN_PROGRESS':
            default:
                return false;
        }
    }
});

//-------------------------------------------------------------------------------
// Private Static Properties
//-------------------------------------------------------------------------------

/**
 * @static
 * @private
 * @type {GulpCloudformation}
 */
GulpCloudformation.instance = null;

//-------------------------------------------------------------------------------
// Static Methods
//-------------------------------------------------------------------------------

/**
 * @static
 * @return {GulpCloudformation}
 */
GulpCloudformation.getInstance = function () {
    if (GulpCloudformation.instance === null) {
        throw _bugcore.Throwables.exception('MustInit', {}, 'Must call init() on gulp-cloudformation first');
    }
    return GulpCloudformation.instance;
};

/**
 * @static
 * @param {{}} params
 * @return {function()}
 */
GulpCloudformation.deploy = function (params) {
    return GulpCloudformation.getInstance().deploy(params);
};

/**
 * @static
 * @param {*} options
 * @return {function()}
 */
GulpCloudformation.init = function (options) {
    GulpCloudformation.instance = new GulpCloudformation(options);
    return GulpCloudformation.getInstance().validate();
};

//-------------------------------------------------------------------------------
// Exports
//-------------------------------------------------------------------------------

exports.default = GulpCloudformation;
//# sourceMappingURL=GulpCloudformation.js.map
