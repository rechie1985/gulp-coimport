var through = require('through2');
var gutil = require('gulp-util');
var CssConcat = require('./CssConcat');

var PluginError = gutil.PluginError;

// consts
const PLUGIN_NAME = 'gulp-coimport';



// exporting the plugin main function
module.exports = function() {
    var prefixText = '';
    prefixText = new Buffer(prefixText); // allocate ahead of time
    // creating a stream through which each file will pass
    var stream = through.obj(function(file, enc, cb) {
        var self = this;
        if (file.isStream()) {
            this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
            return cb();
        }
        if (file.isBuffer()) {
            var cssText = String(file.contents);
            var srcPath = String(file.path);
            new CssConcat().concatByFile(srcPath, srcPath, function(concatText, error) {
                if(error) {
                    self.emit('error', new PluginError(PLUGIN_NAME, error.message));
                } else {
                    file.contents = new Buffer(concatText);
                }
                self.push(file);

                // tell the stream engine that we are done with this file
                cb();
            })
        } else {
            this.push(file);
            cb();
        }
    });

    // returning the file stream
    return stream;
};