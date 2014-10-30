
var UI_NEXT = 1,
    UI_PREV = -1;


/**
  Setup and manage the UI of the page
*/
(function() {
  var historyStart = 0,
      historyIndex = -1;

  window.UI = {
    currentGif: null,
    unloading: false,

    /**
      Run the page program
    */
    init: function() {

      // Load from storage, then build page
      Store.load(null, 'init').then((function(){
        var cachedId, selected;

        this.updateSettings();
        this.setTheme(Store.settings.theme);

        // Attempt to find a cached ID
        if (document.location.hash.length > 1) {
          cachedId = document.location.hash.substr(1);
        }
        else if ($("#gifid").val() != '') {
          cachedId = $("#gifid").val();
        }

        // Attempt to load existing gif (from location hash)
        if (cachedId && (selected = Gifs.forID(cachedId)) ) {
          this.showGif(selected);
          this.buildHistory();

          // Find in history
          historyIndex = Store.history.indexOf(cachedId);
          if (historyIndex > -1) {
            historyStart = (historyIndex > 1) ? historyIndex - 2 : 0;
          }

          Gifs.loadNewGifs();
        }

        // Show random gif
        else {
          if (Store.gifs.length > 0) {
            this.showRandomGif();
            Gifs.loadNewGifs();
          }
          // No gifs, load and show
          else {
            Gifs.loadNewGifs().then(this.showRandomGif.bind(this));
          }
        }
      }).bind(this));
    },

    /**
      Setup the settings panel
    */
    updateSettings: function() {
      $('#theme-select').val(Store.settings.theme);
      $('#setting-giphy').attr('checked', Store.settings.giphy);
      $('#setting-reddit').attr('checked', Store.settings.reddit);
    },

    /**
      Set the theme of the page

      @param {String} name The file name to the stylesheet file for the theme
    */
    setTheme: function(name) {
      var stylesheet = $('#theme-stylesheet'),
          chooser = $('#theme-select');

      stylesheet.attr('href', '/themes/'+ name +'.css');
      chooser.val(name);

      Store.settings.theme = name;
      Store.save('theme');
    },

    /**
      Select a gif at random and display it
    */
    showRandomGif: function() {
      var gif = Gifs.random();
      if (gif) {
        historyIndex = 0;
        Store.addToHistory(gif).then(this.buildHistory.bind(this));
        this.showGif(gif);
        Store.randomChooseCount++;
      }
    },

    /**
      Display a gif

      @param {Object} gif The gif to show
    */
    showGif: function(gif) {
      var container = $('section.main'),
          aEl = container.find('a.image'),
          imgEl = container.find('a.image img');

      this.currentGif = gif;

      // Clear image
      imgEl.attr('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==');

      // Attributes
      aEl.attr({
        id: gif.id,
        href: gif.url
      });
      imgEl.attr('src', gif.url);

      // Title
      if (gif.title && gif.title != '') {
        container.addClass('has-title');
        container.find('figcaption span').text(gif.title);
        document.title = "New Tab ("+ gif.title +")";
      } else {
        container.removeClass('has-title');
        container.find('figcaption span').text('');
        document.title = "New Tab";
      }

      // Source list
      container.find('cite span').empty();
      if (gif.sources) {
        gif.sources.forEach(function(source) {
          var urlParts = source.match(/https?:\/\/(.*?)([\/|\?].*)?$/),
              link = $("<a>"),
              siteName;

          // grab the second to last domain part
          // i.e. www.reddit.com -> reddit
          siteName = urlParts[1].split('.').slice(-2)[0];

          // Build source link
          link.attr('href', source);
          link.text(siteName);

          container.find('cite span').append(link);
        });

        container.find('cite').addClass('has-source');
      } else {
        container.find('cite').removeClass('has-source');
      }

      // Finish up
      container.removeClass('loading');
      $("#gifid").val(gif.id);
      if (!this.unloading) {
        document.location.replace("#"+ gif.id);
      }

      setTimeout(this.setWindowSizing, 50);
    },

    /**
      Build a list of gifs

      @param {HTMLNode} to The UL to build the list to
      @param {Array} from The array of images or image IDs to build from
      @param {int} start The index of the array to start at
      @param {int} limit The maximum number of images to build to this list
    */
    buildList: function(to, from, start, limit) {

    },

    /**
      Build the history list
    */
    buildHistory: function() {
      var container = $('section.history'),
          list = container.find('ul'),
          elements = list.find('li'),
          i = 0;

      Store.load('history').then((function(){

        // Adjust the history range
        if (historyIndex > historyStart + 4) {
          historyStart++;
        }
        else if (historyIndex < historyStart && historyIndex > 0) {
          historyStart--;
        }

        // Keep historyStart within bounds
        if (historyStart < 0) {
          historyStart = 0;
        } else if (historyStart >= Store.history.length - 5) {
          historyStart = history.length - 5;
        }

        // Build list
        Store.history.slice(historyStart, historyStart + 10).every((function(id, index){
          var gif = Gifs.forID(id),
              item, img,
              preload = new Image();

          if (!gif) {
            return true;
          } else if (i >= 5) {
            return false;
          }

          // Reuse list item
          if (item = elements.get(i)) {
            item = $(item);
            img = item.find('img');

          } else {
            item = $('<li>');
            img  = $('<img>');
            item.append(img);
            list.append(item);
          }

          // New image
          if (img.attr('id') != gif.id) {

            img.removeClass('loaded');
            img.addClass('loading');

            // Set loaded class when image loads
            img.get(0).onload = function(){
              img.removeClass('loading');
              img.addClass('loaded');
            };

            // Set the SRC after a slight delay
            // (in case CSS is fading the old image out)
            setTimeout(function(){
              img.attr('src', gif.thumb);

              // Call onload if image is cached
              if (img.get(0).complete) {
                img.get(0).onload.call(img.get(0));
              }
            }, 100);


            // Other attributes
            img.attr('id', gif.id);
            img.attr('alt', gif.title);
            img.attr('title', gif.title);
            img.attr('data-index', historyStart + index);

            // Preload full image version
            preload.src = gif.url;
          }

          // Is it the current gif being display
          if (this.currentGif && id == this.currentGif.id) {
            item.addClass('selected');
          } else {
            item.removeClass('selected');
          }

          i++;
          return true;
        }).bind(this));

        if (i > 0) {
          container.removeClass('empty');
        } else {
          container.addClass('empty');
        }

        this.setWindowSizing();

      }).bind(this));
    },

    /**
      Change the history element we're viewing, either next or previous

      @param {int} dir The direction to me (1 = next, -1 = previous)
    */
    historyIncrement: function(dir) {

      // Set index
      historyIndex += dir;
      if (this.currentGif && Store.history[historyIndex] == this.currentGif.id) {
        historyIndex += dir;
      }
      if (historyIndex < -1) {
        historyIndex = -1;
      }

      // Show history gif
      if (Store.history[historyIndex]) {
        this.showGif(Gifs.forID(Store.history[historyIndex]));
      }
      // Out of range, show random
      else {
        this.showRandomGif();
      }
      this.buildHistory();
    },

    /**
      If there's room  for all content in the viewport add body
      class "fits-view"
    */
    setWindowSizing: function() {
      var viewport = $(window).height(),
          body = $(document.body);

      body.removeClass('fits-view');

      // The document fits in the viewport
      if (viewport >= $(document).height()) {
        body.addClass('fits-view');
      }
    }

  }
})();

UI.init();