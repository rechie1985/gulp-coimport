var through = require('through2');
var path = require('path');
var gutil = require('gulp-util');
var fs = require('fs');
var path = require('path');
var http = require('http');

var PluginError = gutil.PluginError;

// consts
const PLUGIN_NAME = 'gulp-coimport';

/**
 * 线上文件控制类
 * @type {Object}
 */
var OnlineFile = {
    length: 0,
    loadedLength: 0,
    onlineCacheMap: {},
    restore: function(key, text) {
        this.loadedLength += 1;
        this.onlineCacheMap[key] = text;
    },
    get: function(key) {
        return this.onlineCacheMap[key];
    },
    isAllLoaded: function() {
        return this.length === this.loadedLength;
    },
    isRestore: function(key) {
        return !!this.get(key);
    }
    resetCount: function() {
        OnlineFile.length = 0;
        OnlineFile.loadedLength = 0;
    },
    /**
     * 获取线上的文件
     * @param  {String}   url      线上文件地址
     * @param  {Function} callback 回调函数
     * @return {}
     */
    load: function(url, callback) {
        this.length += 1;
        http.get(url, function(res) {
            var body = '';
            // console.log('STATUS: ' + res.statusCode);
            // console.log('HEADERS: ' + JSON.stringify(res.headers));
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                // 将data拼接到一起，在end的时候，进行反序列化操作
                body += chunk;
            });

            res.on('end', function() {
                var error = null;
                if(res.statusCode !== 200) {
                    console.log('load online file ' + url + ' error: STATUS:' + res.statusCode);
                    error = new PluginError(PLUGIN_NAME, ('load online file ' + url + ' error: STATUS:' + res.statusCode));
                }
                if (typeof callback === 'function') {
                    callback(url, body, error);
                }
            });
        }).on('error', function(e) {
            console.log("OnlineFile.load " + url + " Error:" + e.message);
            callback(null, null, e);
        });
    }
}


var _ = {
    // 已加载的模块列表
    /**
     * 获取绝对目录地址
     * @param  {String} dir 相对地址或绝对地址
     * @return {String}     绝对地址
     */
    getFullPath: function(dir) {
        return path.resolve(process.cwd(), dir);
    },
    /**
     * 参考coimport uniform
     * @param  {String} css
     * @return {String}
     */
    uniform: function(css) {
        // uniform @import
        css = css
            .replace(/@import\s+url\(\s*"([^"]+)"\s*\)\s*;/g, '@import "$1";')
            .replace(/@import\s+url\(\s*\'([^\']+)\'\s*\)\s*;/g, '@import "$1";')
            .replace(/@import\s+url\(\s*([\S^\)]+)\s*\)\s*;/g, '@import "$1";')
            .replace(/@import\s*"([^"]+)"\s*;/g, '@import "$1";')
            .replace(/@import\s*\'([^\']+)\'\s*;/g, '@import "$1";');
        // uniform url()
        css = css
            .replace(/url\(\s*"([^"]+)"\s*\)/g, 'url($1)')
            .replace(/url\(\s*\'([^\']+)\'\s*\)/g, 'url($1)')
            .replace(/url\(\s*([\S^\)]+)\s*\)/g, 'url($1)');

        return css;
    }
};

// 不能使用静态类，多文件操作时，会共用内部的pathCacheList和cssText;
var CssConcat = function() {
    // 初始化时，将OnlineFile的计数器归零，获取的内容可保留，防止多次下载相同文件
    OnlineFile.resetCount();
    // 成功后的回调函数
    var successCallback,
        pathCacheList = [],
        cssText = '';
    /**
     * 获取文件的内容，如有@import会递归
     * @param  {[type]} cssPath [description]
     * @return {[type]}         [description]
     */
    function getFileStr(cssPath) {
        var dirname = path.dirname(cssPath);
        var filepath = _.getFullPath(cssPath);
        // 先判断当前文件是否已加载
        if (pathCacheList.indexOf(filepath) > -1) {
            // console.log('loaded', filepath);
            return '';
        }
        // 读取文件时，记录当前目录
        // console.log('load', filepath);
        pathCacheList.push(filepath);
        //读取当前文件内容
        var cssText = fs.readFileSync(filepath, {
            encoding: 'utf8'
        });
        return resolveStr(cssText, dirname);
    }
    /**
     * 分析cssText，如有import则解析出filepath，并通过getFileStr获取内容
     * 如有在线文件，通过OnlineFile类来操作
     * @param  {[type]} cssText  [description]
     * @param  {[type]} dirname [description]
     * @return {[type]}         [description]
     */
    function resolveStr(cssText, dirname) {
        dirname = dirname || '';
        cssText = _.uniform(cssText);
        cssText = cssText.replace(/@import\s*"([^"]+)"\s*;/g, function(a, b) {
            // online?
            if (/^http/i.test(b)) {
                // 在线文件，先从线上拉取下来缓存，最后阶段再替换
                OnlineFile.load(b, function(key, text, error) {
                    if(error) {
                        successCallback(null, error);
                        return ;
                    }
                    if(OnlineFile.isRestore(key) === false) {
                        OnlineFile.restore(key, text);
                    }
                    check();
                });
                return a;
            }
            // 拼接成相对目录
            var innerPath = path.resolve(dirname, b);
            // console.log('dirname', dirname);
            // console.log('innerPath', innerPath);
            // 递归开始
            return getFileStr(innerPath);
        });
        return cssText;
    }
    /**
     * 最终的检测函数
     * 检测在线文件是否完全加载完，如果都加载完，执行替换并完成
     * @return {[type]} [description]
     */
    function check() {
        if (OnlineFile.isAllLoaded()) {
            cssText = replaceOnlineFile(cssText);
            if(typeof successCallback === 'function') {
                successCallback(cssText);
            }
        }
    }
    /**
     * 替换在线文件并写入到最终文件中
     * @return {[type]}         [description]
     */
    function replaceOnlineFile(cssText) {
        cssText = cssText.replace(/@import\s*"([^"]+)"\s*;/g, function(a, b) {
            return OnlineFile.get(b);
        });
        return cssText;
    }
    /**
     * 开放接口，通过srcPath来合并css
     * @param  {String} srcPath  css的目录地址
     * @param  {String} distPath 合并后的文件地址
     * @param  {Function} distPath 合并成功后的回调
     * @return {}
     */
    function startByFile(srcPath, distPath, callback) {
        successCallback = callback;
        cssText = getFileStr(srcPath);
        CssConcat.check();
    }
    /**
     * 开放接口，通过cssText来合并css
     * @param  {String} str      cssText
     * @param  {String} distPath 合并后的文件地址
     * @param  {Function} distPath 合并成功后的回调
     * @return {}
     */
    function startByStr(str, filepath, callback) {
        successCallback = callback;
        // 
        if (filepath) {
            var dirname = path.dirname(filepath);
            pathCacheList.push(filepath);
        }
        cssText = resolveStr(str, dirname);
        check();
    }

    // 对外接口
    return {
        concatByFile: startByFile,
        concatByStr: startByStr
    }
};




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
            new CssConcat().concatByStr(cssText, srcPath, function(concatText, error) {
                if(error) {
                    self.emit('error', error);
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