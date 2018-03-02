'use strict';

const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const notify = require("gulp-notify");
const sass = require('gulp-sass');
const del = require('del');
const ChromeExtension = require("crx");
const babel = require("gulp-babel");
const sourcemaps = require("gulp-sourcemaps");

const SRC = './src/';
const DIST = './dist/';
const BUILD = './build/';
const CRX_KEY = 'gif_tabs.pem';
const STATIC_GLOB = [
  `${SRC}/**/*`,
  `!${SRC}/**/*.js`,
  `!${SRC}/**/*.scss`,
];

/**
 * Run the program
 */
gulp.task('default', ['build', 'watch']);

/**
 * Build the files
 */
gulp.task('build', ['static', 'js', 'sass']);

/**
 * Update files when then change
 */
gulp.task('watch', () => {
  gulp.watch(STATIC_GLOB, ['static:watch']);
  gulp.watch(`${SRC}/**/*.scss`, ['sass:watch']);
  gulp.watch(`${SRC}/**/*`, jsTask);
  gulp.watch([
    `${BUILD}/**/*`,
  ], ['dist:watch']);
});

gulp.task('clean', (cb) => {
  return del(BUILD +'/*');
});

/**
 * Copy static files over
 */
gulp.task('static', [], staticTask);
gulp.task('static:watch', staticTask);
function staticTask(){
  return gulp
    .src(STATIC_GLOB, { base: SRC })
    .pipe(gulp.dest(BUILD));
}

/**
 * Process SCSS files
 */
gulp.task('sass', [], sassTask);
gulp.task('sass:watch', sassTask);
function sassTask() {
  return gulp
    .src(`${SRC}/**/*.scss`)
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest(BUILD))
    .on("error", notify.onError({
      title: "Error building SASS",
      message: "<%= error.message %>"
    }));
}

/**
 * Process JS files through babel
 */
gulp.task('js', [], jsTask);
gulp.task('js:watch', jsTask);
function jsTask() {
  return gulp
    .src(`${SRC}/**/*.js`)
    .pipe(sourcemaps.init())
    .pipe(babel({
        presets: ['env']
    }))
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest(BUILD));
}

/**
 * Create chrome extension
 */
gulp.task('dist', ['build'], extensionTask);
gulp.task('dist:watch', [], extensionTask);
function extensionTask(cb) {
  const updateFile = 'update.xml';
  const extFile =  'gif_tabs.crx';
  const codebase = 'https://github.com/jgillick/gif_tabs/dist/'+ extFile;

  const crx = new ChromeExtension({
    codebase: codebase,
    privateKey: fs.readFileSync(CRX_KEY)
  });

  crx.load( path.resolve(BUILD) )
    .then(crx => crx.pack())
    .then((crxBuffer) => {
      const updateXML = crx.generateUpdateXML()

      fs.writeFile(DIST + updateFile, updateXML);
      fs.writeFile(DIST + extFile, crxBuffer, cb);
    });
}
