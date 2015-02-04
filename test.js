var assert = require('assert');
var coimport = require('./');
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');


var buildedFile = 'test/dist/a.css';

describe('gulp-coimport', function() {
	describe('exec gulp', function() {
		this.timeout(10000);

	    // 执行合并
	    before( function( done ){
	        exec('gulp', function( err, stdOut, stdErr){

	            // Warning: No assertions can be done on null and undefined.
	            assert.equal( err, null );
	            assert.equal( stdErr, '' );
	            done();
	        });
	    });
		it('should coimport all import file', function(done) {
	        fs.stat(path.resolve(process.cwd(), buildedFile), function( err, info ){
	            assert.equal( err, null );
	            done();
	        });
		});
	});

	describe('check concat file', function() {
		this.timeout(10000);
		var distContent = '';
	    before(function(done){
	        fs.readFile(path.resolve(process.cwd(), buildedFile), 'utf-8', function(err, content){
	            assert.equal(err, null);
	            distContent = content;
	            done();
	        });
	    });
	    it('should not have import', function(done) {
	    	var isHave = /@import\s*"([^"]+)"\s*;/g.test(distContent);
	    	assert.equal(isHave, false);
	    	done()
	    });
	});
})
