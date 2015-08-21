'use strict';


(function(){
  var db = null,
      maxHistory = 20;


  /**
    DB Migrations
  */
  function migrations(event){
    var db = event.target.result,
        oldVersion = event.oldVersion,
        newVersion = event.newVersion;

    event.target.transaction.onerror = function(e){
      throw "Could not update DB: "+ e.value;
    }

    switch (newVersion) {
      case 1:

        // Create gifs stores
        var store = db.createObjectStore('gifs', {keyPath: "id"});
        store.createIndex('feed',      'feed',      {unique: false});
        store.createIndex('favorited', 'favorited', {unique: false});
        store.createIndex('history',   'history',   {unique: false});
        store.createIndex('addedOn',   'addedOn',   {unique: false});
        store.createIndex('id, history',             ['id', 'history'], {unique: false});
        store.createIndex('id, favorites',           ['id', 'favorited'], {unique: false});
        store.createIndex('favorite, history',       ['favorited', 'history'], {unique: false});
        store.createIndex('feed, favorite, history', ['feed', 'favorited', 'history'], {unique: false});

        // Settings & config store
        db.createObjectStore('config', {keyPath: "name"})
          .createIndex("timestamp", "timestamp", { unique: false });

      break;
    }
  }

  /**
    Create a transaction for a store and setup a
    deferred promise to handle the success and error states

    @param {String} mode (optional) The transaction mode (readwrite or readonly)
    @returns {Object} with deferred, transaction and store
  */
  function transaction(mode) {
    var dfd = new jQuery.Deferred(),
        mode = mode || "readwrite",
        trans = db.transaction(['gifs'], mode),
        store = trans.objectStore('gifs');

    trans.oncomplete = function(e) {
      dfd.resolve();
    };
    trans.onerror = function(e) {
      dfd.reject(e.value)
    };

    return {
      deferred: dfd,
      transaction: trans,
      store: store
    };
  }

  /**
    Get all gif objects which match an index and range

    @param {String} indexName (optional) The index to match against
    @param {String} range     (optional) The range of values to retrieve
    @returns {Object} with deferred, transaction and store
  */
  function getAll(indexName, range) {
    var trans = transaction('readonly'),
        all = [],
        cursor, index;

    trans.oncomplete = undefined;

    // Target records matching an index value
    if (indexName){
      index = trans.store.index(indexName);
      cursor = index.openCursor(range, 'prev');
    }
    else {
      index = trans.store.index('addedOn');
      range = IDBKeyRange.lowerBound(0);
      cursor = index.openCursor(range, 'prev');
    }


    cursor.onsuccess = function(event) {
      var cursor = event.target.result;
      if (cursor) {
        all.push(cursor.value);
        cursor.continue();
      }
      else {
        trans.deferred.resolve(all);
      }
    };
    cursor.onerror = function(e) {
      trans.deferred.reject(e.value)
    };

    return trans.deferred.promise();
  }

  /**
    Change a value on a gif. For example, adding a gif to the favorites list.

    @param {Object} gif The gif object to update
    @param {String} property  The property to updated
    @param {Variant} value The value to set the property to
    @return Promise
  */
  function changeGifProperty(gif, property, value) {
    var dfd = new jQuery.Deferred();

    Gifs.getByID(gif.id).then((function(foundGif){
      var trans = transaction();

      gif = foundGif || gif;
      gif[property] = value;

      trans.store.put(gif);
      trans.deferred.then(function(){
        dfd.resolve(gif);
      });
    }).bind(this));

    return dfd.promise();
  }


  /**
    Checks if gif ID exists in a specific list

    @params {String} list The list to check the gif against ("history" or "favorites")
    @params {String} id The ID to check the list for
    @return Promise
  */
  function inList(list, id) {
    var dfd = new jQuery.Deferred(),
        trans = transaction('readonly'),
        index, range, request;

    if (list != 'history' && list != 'favorites') {
      throw 'Invalid list type specified "'+ list +'"';
    }

    index = trans.store.index("id, "+ list);
    range = IDBKeyRange.bound([id, 1], [id, Date.now()]);

    request = index.get(range);
    request.onsuccess = function(event) {
      dfd.resolve(!!event.target.result);
    }
    request.onerror = function(event){
      dfd.reject(event.value)
    }

    return dfd.promise();
  }

  /**
    The Storage API for the entire app

    @class Store
  */
  window.Gifs = {

    /**
      Init the DB
    */
    init: function(){
      // indexedDB.deleteDatabase('gif_tabs');
      var dfd = new jQuery.Deferred(),
          version = chrome.app.getDetails().version,
          verParts, request;

      // Convert version string to float
      verParts = version.replace(/^([^0-9\.]\.)|[^0-9\.]/, '').split('.');           // Remove non-digits and any leading digit/dot combo
      version = [verParts.shift(), verParts.join('')].join('.').replace(/\.$/, '');  // Combine first digit, followed by a dot and all the rest
      version = parseFloat(version);

      // Open DB
      request = indexedDB.open("gif_tabs", version),
      request.onupgradeneeded = migrations;
      request.onsuccess = function(e) {
        db = e.target.result;
        dfd.resolve();
      };
      request.onerror = function(e){
        dfd.reject(e.value)
      }

      return dfd.promise();
    },

    /**
      Get the number of records in a store

      @returns {Promise}
    */
    gifCount: function() {
      var dfd = new jQuery.Deferred(),
          count = transaction('readonly').store.count();

      count.onsuccess = function() {
        dfd.resolve(count.result);
      }
      count.onerror = function(e){
        dfd.reject(e.value)
      }

      return dfd.promise();
    },

    /**
      Get a gif object by ID

      @param {String} id The gif ID to search for
      @return {Promise}
    */
    getByID: function(id) {
      var dfd = new jQuery.Deferred(),
          trans = db.transaction(['gifs'], 'readonly'),
          req;

      trans.onerror = function(e) {
        dfd.reject(e.value)
      };

      req = trans.objectStore('gifs').get(id)
      req.onerror = function(e) {
        dfd.reject(e.value)
      };
      req.onsuccess = function(e) {
        dfd.resolve(req.result);
      };

      return dfd.promise();
    },

    /**
      Get all the gifs
    */
    getGifs: function(){
      return getAll('favorite, history', IDBKeyRange.bound([0, 0], [Date.now(), 0]));
    },

    /**
      Return a random gif via a Promise

      @return Promise
    */
    random: function(){
      var dfd = new jQuery.Deferred();

      Gifs.getGifs().then(function(gifs){
        var i, gif,
            tries = 0,
            numGifs = gifs.length;

        // Loop until we find a good random one
        do {
          i = Math.round(Math.random() * numGifs),
          gif = gifs[i];

          // It has already been used
          if (gif && gif.history > 0 && tries < 10) {
            gif = null;
            tries++;
          }
        } while(!gif && tries < 20);

        dfd.resolve(gif);
      });

      return dfd.promise();
    },

    /**
      Load gifs from the APIs and returns a
      promise that will resolve as soon as the first source is done

      @param {boolean} forceUpdate Force the gif update
      @returns Promise
    */
    loadNewGifs: function(forceUpdate) {
      var dfd = new jQuery.Deferred(),
          now = Date.now(),
          limiPerFeed = 300;

      this.gifCount().then((function(gifLen){
        console.info('All gifs', gifLen);

        // Don't load new gifs unless it's been 12 hours
        // or we've gone through at least 1/4 of the existing pool
        if (forceUpdate !== true
            && gifLen > maxHistory
            && now - Config.lastFeedUpdate < (60 * 60 * 6 * 1000)) {
          dfd.resolve([]);
          return dfd.promise();
        }

        Config.set('lastFeedUpdate', now);

        // Clear all gifs, then load new ones
        this.clearFeedGifs().then(function(){
          Feeds.loadAll().then(dfd.resolve);
        });
      }).bind(this));

      return dfd.promise();
    },

    /**
      Add an array of gifs to the DB

      @param {Array} gifs An array of gif objects
      @return Promise
    */
    addGifs: function(gifs) {
      var trans = transaction();

      // No gifs
      if (!gifs || gifs.length == 0) {
        trans.deferred.resolve([]);
      }

      // Add all gifs
      gifs.forEach(function(gif){
        try {
          gif.addedOn = Date.now();
          gif.history = 0;
          gif.favorited = gif.favorited || 0;
          trans.store.add(gif).onerror = function(e) {
            e.preventDefault();
          }
        } catch(e) {
          console.error(e.message);
        }
      });

      // Get updated list
      trans.deferred.promise().then((function(gifs){
        if (gifs && gifs.length) {
          Messenger.send('gifs-updated');
        }
      }).bind(this));

      return trans.deferred.promise();
    },

    /**
      Remove gifs from a specific feed

      @param {String} feed The name of the feed (reddit or giphy)
      @return Promise
    */
    removeGifsByFeed: function(feed) {
      var dfd = new jQuery.Deferred();

      getAll('feed, favorite, history', IDBKeyRange.only(feed, 0, 0)).then((function(gifs){
        var trans = transaction()

        // Delete gifs
        gifs.forEach((function(gif){
          trans.store.delete(gif.id);
        }).bind(this));

        // Notify everything
        if (gifs.length > 0) {
          trans.deferred.promise().then((function(){
            Messenger.send('gifs-updated');
            dfd.resolve();
          }).bind(this));
        } else {
          dfd.resolve();
        }
      }).bind(this));

      return dfd.promise();
    },

    /**
      Clear the all the gifs that aren't favorites or in history
    */
    clearFeedGifs: function() {
      var trans = transaction(),
          cursor = trans.store.index('favorite, history').openCursor(IDBKeyRange.only([0, 0]));

      trans.oncomplete = undefined;
      cursor.onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
          trans.store.delete(cursor.value.id);
          cursor.continue();
        }
        else {
          trans.deferred.resolve();
        }
      };
      cursor.onerror = function(e) {
        trans.deferred.reject(e.value)
      };

      return trans.deferred.promise();
    },

    /**
      Get history

      @returns Promise
    */
    getHistory: function(){
      var dfd = new jQuery.Deferred();

      // Update local cache and truncate to max history length
      getAll('history', IDBKeyRange.lowerBound(1)).then((function(gifs){
        var extra = gifs.slice(maxHistory),
            history = gifs.slice(0, maxHistory),
            removeTrans = transaction();

        // Remove everything over the max history length
        if (extra.length) {
          extra.forEach(function(gif){
            gif.history = 0;
            removeTrans.store.put(gif);
          });

          removeTrans.deferred.promise().then((function(){
            dfd.resolve(history);
          }).bind(this));
        } else {
          dfd.resolve(history);
        }

      }).bind(this));

      return dfd.promise();
    },

    /**
      Add gif to history

      @param {Object} gif The gif to add to the history list
    */
    addToHistory: function(gif) {
      var req = changeGifProperty(gif, 'history', Date.now());
      req.then(function(){
        Messenger.send('history-updated');
      });
      return req;
    },

    /**
      Returns TRUE if a history gif with this ID exists in the history DB

      @param {String} id The gif ID to check
    */
    inHistory: function(id){
      return inList('history', id);
    },

    /**
      Get favorites
    */
    getFavorites: function(){
      return getAll('favorited', IDBKeyRange.lowerBound(1));
    },

    /**
      Add gif to favorites

      @param {Object} gif The gif to add to the favorites list
    */
    addToFavorites: function(gif){
      var now = Date.now(),
          req = changeGifProperty(gif, 'favorited', now);
      req.then(function(){
        Messenger.send('favorites-updated');
      });

      // Sync with cloud
      chrome.storage.sync.get('favorites', function(data){
        data.favorites = data.favorites || {};

        if (!data.favorites[gif.id]) {
          data.favorites[gif.id] = now;

          chrome.storage.sync.set(data, function(){
            if (chrome.runtime.lastError) {
              console.error('Error trying to sync the favorites: ', runtime.lastError);
            } else {
              console.info('Favorites synced');
            }
          });
        }
      });

      return req;
    },

    /**
      Remove a favorite by ID

      @param {Object} gif The gif to remove from favorites
    */
    removeFavorite: function(gif){
      var req = changeGifProperty(gif, 'favorited', 0);
      req.then(function(){
        Messenger.send('favorites-updated');
      });

      // Sync with cloud
      chrome.storage.sync.get('favorites', function(data){
        data.favorites = data.favorites || {};
        if (data.favorites[gif.id]) {
          delete data.favorites[gif.id];
          chrome.storage.sync.set(data, function(){
            if (chrome.runtime.lastError) {
              console.error('Error trying to sync the favorites: ', runtime.lastError);
            } else {
              console.info('Favorites synced');
            }
          });
        }
      });

      return req;
    },

    /**
      Returns TRUE if this gif ID is marked as a favorite

      @param {String} id The gif ID to check
    */
    isFavorite: function(id){
      return inList('favorites', id);
    },

    /**
      Get the favorites from the cloud and update our list
      (assume the cloud has the correct list)
    */
    syncFavorites: function(){
      var dfd = new jQuery.Deferred();

      // Get favorites from the cloud
      chrome.storage.sync.get('favorites', (function(data){
        var cloudFavs = data.favorites || {};

        // Get favorites from the DB
        this.getFavorites().then((function(localFavs){
          var queue = [];

          // Prune favs not in clouse
          localFavs.forEach((function(fav){
            if (!cloudFavs[fav.id]) {
              console.info('Remove', fav.id);
              changeGifProperty(fav, 'favorited', 0)
            }
          }).bind(this));

          // Add new favs
          _.each(cloudFavs, (function(timestamp, id){
            var found = null;

            localFavs.every(function(f){
              if (f.id == id) {
                found = f;
                return false;
              }
              return true;
            });

            // Add to favs
            if (found) {
              if (found.favorited == 0) {
                changeGifProperty(found, 'favorited', timestamp);
              }
            }
            // Queue up to load from the feed
            else {
              queue.push(id);
            }

          }).bind(this));

          // Load images from the feeds
          if (queue.length) {
            Feeds.get(queue).then((function(gifs){

              // Add timestamps then add to DB
              gifs.forEach((function(gif){
                gif.favorited = localFavs[gif.id] || 0;
              }).bind(this));

              this.addGifs(gifs).then(dfd.resolve);
            }).bind(this));
          } else {
            dfd.resolve();
          }
        }).bind(this));
      }).bind(this));

      return dfd.promise();
    }
  };
})();