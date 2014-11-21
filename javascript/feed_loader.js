
(function(){

  /**
    The maximum number of gifs to load for any given feed
  */
  var limiPerFeed = 300;

  /**
    List of enabled handlers and keyed by their ID prefixes
    (set at the end of this file)
  */
  var handlers = {};

  /**
    Handles loading gifs from all feed handlers
  */
  window.Feeds = {


    /**
      Load all feeds and return a promise that will resolve when the first one returns

      @return Promise
    */
    loadAll: function(){
      var dfd = new jQuery.Deferred();

      _.each(handlers, function(handler, prefix){
        if (Config.settings[handler.name] !== false) {
          handler.load()
            .then(function(gifs){
              dfd.resolve(gifs)
            })
            .fail(function(gifs){
              dfd.reject(gifs)
            });
          }
      })

      return dfd.promise();
    },

    /**
      Get the data from one or more gifs from the feeds

      @param {String or Array} id The id (or array of ids) get
      @return Promise
    */
    get: function(id) {
      var dfd = new jQuery.Deferred(),
          resolved = 0,
          groups = {},
          groupCount = 0,
          allGifs = [];

      id = (!_.isArray(id)) ? [id] : id;
      id = id.sort();

      // Group the IDs into feeds
      id.forEach(function(id){
        var prefix = id.split(':', 1)[0];

        if (!prefix || !handler[prefix]) {
          console.error("Gif does not have a valid prefix, ", id);
        }
        else {
          if (!groups[prefix]) {
            groups[prefix] = [];
            groupCount++;
          }
          groups[prefix].push(id);
        }
      });

      // Load images for each group
      _.each(groups, function(group, prefix){

        // Append to gif list
        handlers[prefix].get(group)
        .then(function(gifs){
          if (gifs) {
            gifs = (!_.isArray(gifs)) ? [gifs] : gifs;
            allGifs.concat(gifs);
            resolved++;
          }
        })
        // Whoops
        .fail(function(e){
          console.error(e);
          resolved++;
        })
        // All feeds have returned, resolve promise
        .always(function(){
          if (resolved == groupCount) {
            dfd.resolve(allGifs);
          }
        });
      });

      return dfd.promise();
    }
  }

  /**
    =============================
    ---- Giphy Feed Handlers ----
    =============================
  */
  var Giphy = {
    name: 'giphy',
    prefix: 'g',

    /**
      Normalize the JSON from the server into the standard gif object
      @param {Object} data Raw gif from the server
      @return {Object} Gif object
    */
    normalizeGif: function(data){
      var id = this.prefix +':'+ data.id,
          sources = [data.url];

      // Skip NSFW
      if (data.rating.match(/r|x/i)) {
        return false;
      }

      // Add external source
      if (data.source != '') {
        sources.push(data.source);
      }

      // Return object
      return {
        id: id,
        url: data.images.original.url,
        thumb: data.images.fixed_height_still.url,
        sources: sources,
        feed: this.name,
        title: data.title
      };
    },

    /**
      Load the entire feed and add to the Gif DB
      @return Promise
    */
    load: function(){
      var gifs = [],
          dfd = new jQuery.Deferred();

      $.get('http://api.giphy.com/v1/gifs/trending?api_key=11zvNWrJ4cOCJi&limit='+ limiPerFeed)
      .then((function(xhr){

        xhr.data.forEach((function(gif){
          gif = this.normalizeGif(gif);
          if (gif) gifs.push(gif);
        }).bind(this));

        // Save gifs to storage
        if (gifs.length) {
          console.log('Loaded', gifs.length, 'from', this.name);
          Gifs.addGifs(gifs).then(function(){
            dfd.resolve(gifs);
          });
        }
      }).bind(this));

      return dfd.promise();
    },

    /**
      Load the data for one or more images

      @param {String or Array} id The id (or array of ids) get
      @return Promise
    */
    get: function(){

    }
  };


  /**
    ==============================
    ---- Reddit Feed Handlers ----
    ==============================
  */
  var Reddit = {
    name: 'reddit',
    prefix: 'r',

    /**
      Normalize the JSON from the server into the standard gif object
      @param {Object} data Raw gif from the server
      @return {Object} Gif object
    */
    normalizeGif: function(data){
      var type  = data.url.match(/\.([^\.]*)$/)[1],
          id    = this.prefix +":"+ data.name;

      // Skip
      if (data.over_18 || data.thumbnail == 'nsfw' || (type != 'gif' && type != 'gifv')) {
        return false;
      }

      // Return gif object
      return {
        id: id,
        url: data.url,
        thumb: data.thumbnail,
        sources: ["http://reddit.com/"+ data.permalink],
        feed: this.name,
        title: data.title
      };
    },

    /**
      Load the entire feed and add to the Gif DB
      @return Promise
    */
    load: function(){
      var limit = Math.round(limiPerFeed / 3),
          dfd = new jQuery.Deferred();

      // Process data coming from reddit from both endpoints
      var processAll = (function(data, feed){
        var gifs = [];

        // Normalize all gif objects
        data.forEach((function(gif){
          gif = this.normalizeGif(gif.data);
          if (gif) gifs.push(gif);
        }).bind(this));

        // Save gifs to storage
        if (gifs.length) {
          console.log('Loaded', gifs.length, 'from', feed, this.name);
          Gifs.addGifs(gifs).then(function(){
            dfd.resolve(gifs);
          });
        }
      }).bind(this);

      // Hot gifs
      $.get('http://www.reddit.com/r/gifs/hot.json?limit='+ limit)
      .then((function(xhr){
        processAll(xhr.data.children, 'hot');
      }).bind(this));

      // Rising gifs
      $.get('http://www.reddit.com/r/gifs/rising.json?limit='+ limit)
      .then((function(xhr){
        processAll(xhr.data.children, 'rising');
      }).bind(this));

      // Top gifs
      $.get('http://www.reddit.com/r/gifs/top.json?limit='+ limit)
      .then((function(xhr){
        processAll(xhr.data.children, 'top');
      }).bind(this));

      return dfd.promise();
    },

    /**
      Load the data for one or more images

      @param {String or Array} id The id (or array of ids) get
      @return Promise
    */
    get: function(){

    }
  };


  /**
    ================================
    ---- Replygif Feed Handlers ----
    ================================
  */
  var Replygif = {
    name: 'replygif',
    prefix: 'rg',

    /**
      Normalize the JSON from the server into the standard gif object
      @param {Object} data Raw gif from the server
      @return {Object} Gif object
    */
    normalizeGif: function(data){
      return {
        id: this.prefix +'-'+ data.id,
        url: data.file,
        thumb: data.file,
        sources: [data.url],
        feed: this.name,
        title: (typeof data.caption == 'string') ? data.caption : ''
      };
    },

    /**
      Load the entire feed and add to the Gif DB
      @return Promise
    */
    load: function(){
      var gifs = [],
          dfd = new jQuery.Deferred();

      $.get('http://replygif.net/api/gifs?tag=&api-key=39YAprx5Yi')
      .then((function(xhr){
        var gifs = [],
            start, end;

        xhr.forEach((function(gif){
          gifs.push(this.normalizeGif(gif));
        }).bind(this));

        // Force feed limit (i.e limiPerFeed) by choosing a random chunk of the data
        end = gifs.length;
        if (end > limiPerFeed) {
          end -= limiPerFeed;
        }
        start = Math.round(Math.random() * end);
        end = start + limiPerFeed;
        gifs = gifs.slice(start, end);

        // Save gifs to storage
        if (gifs.length) {
          console.log('Loaded', gifs.length, 'from', this.name);
          Gifs.addGifs(gifs).then(function(){
            dfd.resolve(gifs);
          });
        }
      }).bind(this));

      return dfd.promise();
    },

    /**
      Load the data for one or more images

      @param {String or Array} id The id (or array of ids) get
      @return Promise
    */
    get: function(){

    }
  };


  handlers = {
    'g': Giphy,
    'r': Reddit,
    'rg': Replygif
  };
})();