'use strict';

const gulp = require('gulp');
const fs = require('fs');
const path = require('path');
const notify = require("gulp-notify");
const sass = require('gulp-sass');
const del = require('del');
const ChromeExtension = require("crx");
const spawn = require('child_process').spawn;

const SRC = './src';
const DIST = './dist';
const BUILD = './build';
const CRX_KEY = 'gif_tabs.pem';
const STATIC_GLOB = [
  `${SRC}/**/*.*`,
  `!${SRC}/**/*.psd`,
  `!${SRC}/**/*.js`,
  `!${SRC}/**/*.scss`,
];

/**
 * Run the program
 */
gulp.task('default', ['build:watch']);

/**
 * Build steps
 */
gulp.task('build', ['static', 'sass', 'js']);
gulp.task('build:watch', ['static', 'sass', 'js:watch', 'watch']);

/**
 * Update files when then change
 */
gulp.task('watch', () => {
  gulp.watch(STATIC_GLOB, ['static']);
  gulp.watch(`${SRC}/**/*.scss`, ['sass']);
});

gulp.task('clean', () => {
  return del(BUILD +'/*');
});

/**
 * Copy static files over
 */
gulp.task('static', [], () => {
  return gulp
    .src(STATIC_GLOB, { base: SRC })
    .pipe(gulp.dest(BUILD));
});

/**
 * Process SCSS files
 */
gulp.task('sass', () => {
  return gulp
    .src(`${SRC}/**/*.scss`)
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest(BUILD))
    .on("error", notify.onError({
      title: "Error building SASS",
      message: "<%= error.message %>"
    }));
});

/**
 * Process JS files through webpack
 */
gulp.task('js', webpack);
gulp.task('js:watch', (cb) => webpack(cb, true));
function webpack(cb, watch=false) {
  const cmd = path.join(__dirname, './node_modules/.bin/', 'webpack');
  const params = ['--color'];
  if (watch) {
    params.push('--watch');
  }

  // Spawn process
  const webpackProcess = spawn(cmd, params, { cwd: __dirname });

  // Callback can only be called once.
  // Make it a no-op when it's been called.
  function callback(){
    cb();
    callback = ()=>{};
  }

  // Respond to stream events
  webpackProcess.stdout.on('data', (data) => {
    data = data.toString();
    console.log(data);

    // Initial pass of packing done when it outputs time
    if (watch && data.includes('Time:')) {
      callback();
    }
  });
  webpackProcess.stderr.on('data', (data) => {
    const err = data.toString();
    console.log(err);
    notify.onError({
      title: "Error building JS",
      message: "<%= err.message %>"
    });
  });
  webpackProcess.on('close', () => {
    callback();
  });
}

/**
 * Create chrome extension
 */
gulp.task('dist', ['build'], (cb) => {
  const updateFile = 'update.xml';
  const extFile =  'gif_tabs.crx';
  const codebase = 'https://github.com/jgillick/gif_tabs/dist/'+ extFile;

  const crx = new ChromeExtension({
    codebase: codebase,
    privateKey: fs.readFileSync(CRX_KEY)
  });

  crx.load(path.resolve(BUILD))
  .then(crx => crx.pack())
  .then((crxBuffer) => {
    const updateXML = crx.generateUpdateXML();
    fs.writeFile(path.join(DIST, updateFile), updateXML);
    fs.writeFile(path.join(DIST, extFile), crxBuffer, cb);
  });
});
