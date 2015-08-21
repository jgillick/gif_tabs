'use strict';

(function(){

  /**
    The maximum number of gifs to load for any given feed
  */
  var limiPerFeed = 200;

  /**
    Handles loading gifs from all feed handlers
  */
  window.Feeds = {

    /**
      List of enabled handlers and keyed by their ID prefixes
      (set at the end of this file)
    */
    handlers: {},


    /**
      Load all feeds and return a promise that will resolve when the first one returns

      @return Promise
    */
    loadAll: function(){
      var dfd = new jQuery.Deferred();

      _.each(this.handlers, function(handler, prefix){
        if (Config.settings[handler.name] !== false) {
          handler.load()
            .then(function(gifs){
              dfd.resolve(gifs);
            })
            .fail(function(gifs){
              dfd.reject(gifs);
            });
          }
      });

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
        var prefix = id.split('-', 1)[0];

        if (!prefix || !this.handlers[prefix]) {
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
        this.handlers[prefix].get(group)
        .then(function(gifs){
          if (gifs) {
            allGifs = allGifs.concat(gifs);
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
      var id = this.prefix +'-'+ data.id,
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
        url: data.images.original.webp || data.images.original.url,
        height: data.images.original.height,
        width: data.images.original.width,
        thumb: data.images.fixed_height_still.url,
        sources: sources,
        feed: this.name,
        title: data.title,
        description: null
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
          console.info('Loaded', gifs.length, 'from', this.name);
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
    get: function(id){
      var gifs = [],
          rPrefix = new RegExp('^'+ this.prefix +'\-'),
          dfd = new jQuery.Deferred();

      // Remove prefix
      id = (!_.isArray(id)) ? [id] : id;
      gids = id.map(function(i) { return i.replace(rPrefix, ''); });

      $.get('http://api.giphy.com/v1/gifs?api_key=11zvNWrJ4cOCJi&ids='+ gids.join(','))
      .then((function(xhr){

        xhr.data.forEach((function(gif){
          gif = this.normalizeGif(gif);
          if (gif) gifs.push(gif);
        }).bind(this));

        console.info('GET', gifs.length, 'from', this.name);
        dfd.resolve(gifs);
      }).bind(this));

      return dfd.promise();
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
          id    = this.prefix +'-'+ data.name,
          gif   = {};

      // Skip
      if (data.over_18 || data.thumbnail == 'nsfw' || (type != 'gif' && type != 'gifv')) {
        return false;
      }

      // Build gif object
      gif = {
        id: id,
        url: data.url,
        thumb: data.thumbnail,
        sources: ["http://reddit.com/"+ data.permalink],
        feed: this.name,
        title: data.title,
        description: null
      };

      // Static thumbnail
      try {
        if (data.preview.images[0].resolutions[1]) {
          gif.thumb = data.preview.images[0].resolutions[1].url;
        } else {
          gif.thumb = data.preview.images[0].resolutions[0].url;
        }
        gif.thumb = gif.thumb.replace(/&amp;/g, '&');
      } catch(e) {}

      // Embedded iframe (decode escaped HTML first)
      if (data.media_embed && data.media_embed.content) {
        var el = document.createElement('div');
        el.innerHTML = data.media_embed.content;
        el = $(el.firstChild.nodeValue);

        // Add 'http:' to urls that start with '//'
        if (el.attr('src').match(/^\/\//)) {
          el.attr('src', 'http:'+ el.attr('src'));
        }

        gif.url = el.attr('src');
        gif.embed = $('<div>').append(el).html();
      }

      return gif;
    },

    /**
      Load the entire feed and add to the Gif DB
      @return Promise
    */
    load: function(){
      var gifs = [],
          dfd = new jQuery.Deferred();

      var loadPages = (function (next) {
        var url = 'http://www.reddit.com/r/gifs/hot.json';

        if (next) {
          url += '?after='+ next;
        }

        $.ajax(url)
        .then((function(xhr) {
          var data = xhr.data,
              next = data.after,
              records = data.children;

          // Normalize all gif objects
          records.forEach((function(gif){
            gif = this.normalizeGif(gif.data);
            if (gif) gifs.push(gif);
          }).bind(this));

          // Save gifs to storage
          if (records.length == 0 || gifs.length >= limiPerFeed) {
            gifs = gifs.splice(0, limiPerFeed);
            console.info('Loaded', gifs.length, 'from', this.name);
            Gifs.addGifs(gifs).then(function(){
              dfd.resolve(gifs);
            });
          }

          // Get next page
          else {
            loadPages(next);
          }

        }).bind(this));

      }).bind(this);

      loadPages();

      return dfd.promise();
    },

    /**
      Load the data for one or more images

      @param {String or Array} id The id (or array of ids) get
      @return Promise
    */
    get: function(id){
      var gifs = [],
          rPrefix = new RegExp('^'+ this.prefix +'\-'),
          dfd = new jQuery.Deferred(),
          gids;

      // Remove prefix
      id = (!_.isArray(id)) ? [id] : id;
      gids = id.map(function(i) { return i.replace(rPrefix, ''); });

      $.get('http://www.reddit.com/by_id/'+ gids.join(',') +'.json')
      .then((function(xhr){

        xhr.data.children.forEach((function(gif){
          gif = this.normalizeGif(gif.data);
          if (gif) gifs.push(gif);
        }).bind(this));

        console.info('GET', gifs.length, 'from', this.name);
        dfd.resolve(gifs);

      }).bind(this));

      return dfd.promise();
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
        title: (typeof data.caption == 'string') ? data.caption : '',
        description: null
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
          console.info('Loaded', gifs.length, 'from', this.name);
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
    get: function(id){
      var gifs = [],
          rPrefix = new RegExp('^'+ this.prefix +'\-'),
          dfd = new jQuery.Deferred();

      // Remove prefix
      id = (!_.isArray(id)) ? [id] : id;
      gids = id.map(function(i) { return i.replace(rPrefix, ''); });

      $.get('http://replygif.net/api/gifs?tag=&api-key=39YAprx5Yi')
      .then((function(xhr){

        gifs = xhr.filter(function(gif){
          return (gids.indexOf(gif.id) > -1);
        });
        console.info('GET', gifs.length, 'from', this.name);
        dfd.resolve(gifs);

      }).bind(this));

      return dfd.promise();
    }
  };

  /**
    =============================
    ---- Imagur Feed Handlers ----
    =============================
  */
  var Imgur = {
    name: 'imgur',
    prefix: 'i',
    client_id: '97aa3148456ebe1',

    /**
      Return a jQuery Ajax request for an imgur endpoint

      @param {String} endpoint The endpoint to get (i.e. /gallery/r/gifs/)
      @param {Object} data Any query params to send to the endpoint
    */
    ajax: function(endpoint, data) {
      return $.ajax('https://api.imgur.com/3'+ endpoint, {
        type: 'GET',
        data: data,
        headers: {
          Authorization: 'Client-ID '+ this.client_id
        }
      });
    },

    /**
      Normalize the JSON from the server into the standard gif object
      @param {Object} data Raw gif from the server
      @return {Object} Gif object
    */
    normalizeGif: function(data){
      var gif;

      if (!data || !data.animated || data.nsfw) {
        return null;
      }

      gif = {
        id: this.prefix +'-'+ data.id,
        url: data.link,
        thumb: data.link,
        sources: ["http://imgur.com/"+ data.id],
        feed: this.name,
        title: data.title,
        description: data.description
      };

      if (data.webm) {
        gif.url = data.webm;
        gif.embed = '<video src="'+ data.webm +'" autoplay loop></video>'
      }

      return gif;
    },

    /**
      Load the entire feed and add to the Gif DB
      @return Promise
    */
    load: function(){
      var gifs = [],
          dfd = new jQuery.Deferred();

      var loadPages = (function (p) {
        p = p || 0;

        this.ajax('/gallery/r/gifs/top/week', { page: p })
        .then((function(xhr) {
          var data = xhr.data;

          // Normalize all gif objects
          data.forEach((function(gif){
            gif = this.normalizeGif(gif);
            if (gif) gifs.push(gif);
          }).bind(this));

          // Save gifs to storage
          if (data.length == 0 || gifs.length >= limiPerFeed) {
            gifs = gifs.splice(0, limiPerFeed);
            console.info('Loaded', gifs.length, 'from', this.name);
            Gifs.addGifs(gifs).then(function(){
              dfd.resolve(gifs);
            });
          }

          // Get next page
          else {
            loadPages(++p);
          }

        }).bind(this));

      }).bind(this);

      loadPages();


      return dfd.promise();
    },

    /**
      Load the data for one or more images

      @param {String or Array} id The id (or array of ids) get
      @return Promise
    */
    get: function(id){
      var gifs = [],
          responses = 0,
          rPrefix = new RegExp('^'+ this.prefix +'\-'),
          dfd = new jQuery.Deferred();

      // Remove prefix
      id = (!_.isArray(id)) ? [id] : id;
      gids = id.map(function(i) { return i.replace(rPrefix, ''); });

      // Get all images by ID
      gids.forEach((function(id, i){

        this.ajax('/image/'+ id)
        // Process gif
        .then((function(xhr) {
          var gif = this.normalizeGif(xhr.data);
          if (gif) gifs.push(gif);
        }).bind(this))
        // Resolve promise, if all gifs have returned
        .always((function(){
          responses++;
          if (responses == gids.length) {
            console.info('GET', gifs.length, 'from', this.name);
            dfd.resolve(gifs);
          }
        }).bind(this));

      }).bind(this));

      return dfd.promise();
    }
  };

  Feeds.handlers = {
    'g': Giphy,
    'r': Reddit,
    'i': Imgur,
    'rg': Replygif
  }

})();