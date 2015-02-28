var path = require('path');
var fs = require('fs');
var http = require('http');


/**
 * 内部util类
 * @namespace
 */
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

/**
 * 线上文件控制类
 * @namespace
 */
var OnlineFile = {
    length: 0,
    loadedLength: 0,
    onlineCacheMap: {},
    /**
     * 缓存对应的线上文件内容
     * @param  {String} key  线上文件地址
     * @param  {String} text 线上文件内容
     * @return {}      
     */
    restore: function(key, text) {
        this.loadedLength += 1;
        this.onlineCacheMap[key] = text;
    },
    /**
     * 通过地址获取缓存的内容
     * @param  {String} key 线上文件地址
     * @return {String}     线上文件内容，如果没有，则返回undefined
     */
    get: function(key) {
        return this.onlineCacheMap[key];
    },
    /**
     * 判断全部线上文件是否已经都获取到
     * @return {Boolean} 
     */
    isAllLoaded: function() {
        return this.length === this.loadedLength;
    },
    /**
     * 判断线上文件是否已经缓存
     * @param  {String}  key 线上文件地址
     * @return {Boolean}     
     */
    isRestore: function(key) {
        return !!this.get(key);
    },
    /**
     * 重置计数，每次new CssConcat的时候，需要调用该函数
     * @return {} 
     */
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
                    error = new Error('load online file ' + url + ' error: STATUS:' + res.statusCode);
                }
                if (typeof callback === 'function') {
                    callback(error, url, body);
                }
            });
        }).on('error', function(e) {
            console.log("OnlineFile.load " + url + " Error:" + e.message);
            callback(e, null, null);
        });
    }
}


// 不能使用静态类，多文件操作时，会共用内部的pathCacheList和cssText;
/**
 * 合并功能类
 * @constructor
 */
var CssConcat = function() {
    // 初始化时，将OnlineFile的计数器归零，获取的内容可保留，防止多次下载相同文件
    OnlineFile.resetCount();
    var _timeId = null;
    // 成功后的回调函数
    var pathCacheList = [],
        cssText = '';
    /**
     * 获取文件的内容，如有@import会递归
     * @param  {String} cssPath 目标文件地址
     * @return {String}         所有关联的文件内容，不包括线上文件
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
     * @param  {String} cssText css文件内容字符串
     * @param  {String} dirname 目录地址
     * @return {String}         合并后的文件内容，不包括线上文件
     */
    function resolveStr(cssText, dirname) {
        dirname = dirname || '';
        cssText = _.uniform(cssText);
        cssText = cssText.replace(/@import\s*"([^"]+)"\s*;/g, function(a, b) {
            // online?
            if (/^http/i.test(b)) {
                if(OnlineFile.isRestore(b) === false) {
                    // 在线文件，先从线上拉取下来缓存，最后阶段再替换
                    OnlineFile.load(b, function(error, key, text) {
                        if(error) {
                            throw error;
                        }
                        OnlineFile.restore(key, text);
                    });
                    return a;
                } else {
                    return OnlineFile.get(b);
                }
                
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
     * 替换在线文件并写入到最终文件中
     * @param  {String} cssText css文件内容字符串
     * @return {String}         合并后的文件内容，包括线上文件
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
        cssText = getFileStr(srcPath);
        check(callback);
    }
    /**
     * 开放接口，通过cssText来合并css
     * @param  {String} str      cssText
     * @param  {String} distPath 合并后的文件地址
     * @param  {Function} distPath 合并成功后的回调
     * @return {}
     */
    function startByStr(str, srcPath, callback) {
        if (srcPath) {
            var dirname = path.dirname(srcPath);
            pathCacheList.push(srcPath);
        }
        cssText = resolveStr(str, dirname);
        check(callback);
    }

    /**
     * 最终的检测函数
     * 检测在线文件是否完全加载完，如果都加载完，执行替换并完成
     * @param  {Function} callback 合并完成后的回调函数
     * @return {}            
     */
    function check(callback) {
        if (OnlineFile.isAllLoaded()) {
            cssText = replaceOnlineFile(cssText);
            if(typeof callback === 'function') {
                callback(null, cssText);
            }
            clearInterval(_timeId);
            _timeId = null;
            cssText = '';
        } else {
            if(_timeId === null) {
                _timeId = setInterval(function() {
                    check(callback);
                }, 200);
            }
        }
    }

    // 对外接口
    return {
        concatByFile: startByFile,
        concatByStr: startByStr
    }
};

module.exports = CssConcat;