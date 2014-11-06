
/**
  Manage compiling and caching SASS files
*/
window.SassController  = {

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
    style.textContent = css;
  },

  /**
    Import a specific file to the page

    @param {String} path The path to the scss file to import
    @param {String} to   (optional) The ID of a style block to put the compiled SCSS
                         (will replace whatever is already there)
    @returns Promise
  */
  importFile: function(path, to) {
    var dfd = new jQuery.Deferred();

    $.get(path)
      .then((function(src){
        this['import'](src, to || path.toLowerCase());
        dfd.resolve();
      }).bind(this))
      .fail(function(xhr){
        console.error('Failed to load'+ path, xhr);
        dfd.reject(xhr);
      });

    return dfd.promise();
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