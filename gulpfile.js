var gulp = require('gulp');
var coimport = require('./index');
var conf = require('./testOpt');
gulp.task('css', function() {
    gulp.src(conf.srcPath)
        .pipe(coimport())
        .pipe(gulp.dest(conf.distPath))
});

gulp.task('default', ['css']);