'use strict';

(function(){

  /**
    Manage compiling and caching SASS files
  */
  window.SassController  = {
    cache: {},

    /**
      Startup the Sass Controller
    */
    init: function(){
      Sass.options({
        style: Sass.style.compact,
        comments: Sass.comments.default
      });
      this.initIncludes();
      this.loadCache();
    },

    /**
      Load the cached CSS from local storage

      @returns Promise
    */
    loadCache: function(){
      var dfd = new jQuery.Deferred();

      chrome.storage.local.get('scss', (function(store){
        this.cache = store.scss;
        for (var path in this.cache) if (this.cache.hasOwnProperty(path)) {
          Sass.writeFile(path, this.cache[path]);
        }
        dfd.resolve(this.cache);
      }).bind(this));

      return dfd.promise();
    },

    /**
      Setup files in the includes directory
    */
    initIncludes: function(){
      var files = ['themes/includes/_history.scss'];

      files.forEach(function(path) {
        var css = Module.read(path);
        Sass.writeFile(path, css);
      })
    },

    /**
      Add compiled SCSS to cache

      @param {String} path The path to the SCSS file we're caching
      @param {String} css  The compiled CSS
      @return Promise
    */
    addToCache: function(path, css) {
      var dfd = new jQuery.Deferred();

      this.cache[path] = css;
      chrome.storage.local.set({scss: this.cache}, function(){
        dfd.resolve();
      });

      return dfd.promise();
    },

    /**
      Import SCSS files. If passed without arguments, it looks
      through the page for loaded scss files and compiles them.

      @param {String} src The sass source code
      @param {String} to  The ID of a style block to put the compiled CSS
    */
    import: function(src, to) {
      var css, style;

      // Get style block
      if (to) {
        style = document.getElementById(to);
      }

      // No style block, create one
      if (!style) {
        style = document.createElement('style');
        if (style.id) style.id = to;
        document.head.appendChild(style);
      }

      // Compile and output
      css = Sass.compile(src);
      if (typeof css == 'string') {
        style.textContent = css;
      } else {
        throw 'line'+ css.line +', '+ css.message;
      }
    },

    /**
      Import a specific file to the page

      @param {String} path The path to the scss file to import
      @param {String} to   (optional) The ID of a style block to put the compiled SCSS
                           (will replace whatever is already there)
    */
    importFile: function(path, to) {
      var id = to || path,
          css;

      // First, load cached version of the file, if we have it
      if (Sass.listFiles().indexOf(path) > -1) {
        this.import("@import '"+ path +"';", id);
      }

      // Relative paths only
      if (path[0] == '/') {
        path = path.substr(1);
      }

      try {
        css = Module.read(path);
        Sass.writeFile(path, css);
        this.import("@import '"+ path +"';", id);

        // Cache
        this.addToCache(path, css);
      } catch(e) {
        console.error(e);
      }
    },

    /**
      Import all scss files in the page.
    */
    importAll: function() {
      var dfd = new jQuery.Deferred(),
          elements = document.querySelectorAll('link[rel="stylesheet/scss"], style[type="text/scss"]'),
          compile = [];

      // Find all styles
      [].forEach.call(elements, (function(element) {
        var file;

        if (element.hasAttribute('scss-imported')) {
          return;
        }

        // Inline sytle block
        if (element.nodeName === 'STYLE') {
          compile.push({ src: element.textContent,
                         from: element,
                         id: element.id });
        }

        // External include
        else if (element.nodeName === 'LINK') {
          this.importFile(element.getAttribute('href'), element.getAttribute('data-to'));
        }

      }).bind(this));

      // Compile all styles
      compile.forEach((function(scss){
        this['import'](scss.src, scss.id);
        scss.from.setAttribute('scss-imported', '1');
      }).bind(this));
    }

  }

  SassController.init();
})();
