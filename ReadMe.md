
> 处理css文件中 @import。递归处理css文件中的@import，自动合并为一个css文件。

## Features ##
- 支持 css样式文件
- 支持 @import 递归处理
- 支持线上的import url 自动下载再合并

## Usage ##
    var gulp = require('gulp');
    var coimport = require('./index');
    var conf = require('./testOpt');
    gulp.task('css', function() {
    gulp.src(conf.srcPath)
    	.pipe(coimport())
    	.pipe(gulp.dest(conf.distPath))
    });
    
    gulp.task('default', ['css']);


## License ##
MIT

## 参考 ##
https://www.npmjs.com/package/coimport