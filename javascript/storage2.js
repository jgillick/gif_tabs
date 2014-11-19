
(function(){
  var db = null;


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

    if (newVersion == 1) {

      // Create gifs stores
      var store = db.createObjectStore('gifs', {keyPath: "id"});
      store.createIndex('feed',      'feed',      {unique: false});
      store.createIndex('favorited', 'favorited', {unique: false});
      store.createIndex('history',   'history',   {unique: false});
      store.createIndex('addedOn',   'addedOn',   {unique: false});
      store.createIndex('id, history',             ['id', 'history'], {unique: false});
      store.createIndex('id, favorites',          ['id', 'favorited'], {unique: false});
      store.createIndex('favorite, history',       ['favorited', 'history'], {unique: false});
      store.createIndex('feed, favorite, history', ['feed', 'favorited', 'history'], {unique: false});

      // Settings & config store
      db.createObjectStore('config', {keyPath: "name"})
        .createIndex("timestamp", "timestamp", { unique: false });
    }
  }

  /**
    Create a transaction for a store and setup a
    deferred promise to handle the success and error states

    @param {String} storeName The name of the store the transaction is for
    @param {String} mode (optional) The transaction mode (readwrite or readonly)
    @returns {Object} with deferred, transaction and store
  */
  function transaction(storeName, mode) {
    var dfd = new jQuery.Deferred(),
        mode = mode || "readwrite",
        trans = db.transaction([storeName], mode),
        store = trans.objectStore(storeName);

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
    var trans = transaction('gifs', "readonly"),
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
    Change a value on a gif

    @param {Object} gif The gif object to update
    @param {String} property  The property to updated
    @param {Variant} value The value to set the property to
    @return Promise
  */
  function changeGifProperty(gif, property, value) {
    var dfd = new jQuery.Deferred();

    Store2.getByID(gif.id).then((function(foundGif){
      var trans = transaction('gifs');

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
        trans = transaction('gifs', "readonly"),
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
  window.Store2 = {

    /**
      Init the DB
    */
    init: function(){
      // indexedDB.deleteDatabase('gif_tabs')
      var dfd = new jQuery.Deferred(),
          request = indexedDB.open("gif_tabs", chrome.app.getDetails().version);

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

      @param {String} storeName The name of the store the transaction is for
      @returns {Promise}
    */
    recordCount: function(storeName) {
      var dfd = new jQuery.Deferred(),
          store = db.transaction([storeName]).objectStore(storeName),
          count = store.count();

      count.onsuccess = function() {
        dfd.resolve(count.result);
      }
      request.onerror = function(e){
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
      return getAll('favorite, history', IDBKeyRange.bound([0, 0], [0, Date.now()]));
    },

    /**
      Add an array of gifs to the DB

      @param {Array} gifs An array of gif objects
    */
    addGifs: function(gifs) {
      var trans = transaction('gifs');

      // Add all gifs
      gifs.forEach(function(gif){
        try {
          gif.addedOn = Date.now();
          gif.history = 0;
          gif.favorited = 0;
          trans.store.add(gif).onerror = function(e) {
            e.preventDefault();
          }
        } catch(e) {
          console.error(e.message);
        }
      });

      // Get updated list
      trans.deferred.promise().then((function(gifs){
        Messenger.send('gifs-updated');
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

      getAll('feed', IDBKeyRange.only(feed)).then((function(gifs){
        var trans = transaction('gifs')

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
      var trans = transaction('gifs'),
          index = trans.store.index('favorite, history')
          range = IDBKeyRange.only([0, 0]),
          cursor = index.openCursor(range);

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

      // Update local cache and truncate to 20
      getAll('history', IDBKeyRange.lowerBound(1)).then((function(gifs){
        var extra = gifs.slice(20),
            history = gifs.slice(0, 20),
            removeTrans = transaction('gifs');

        // Remove everything over 20 from history
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
      var req = changeGifProperty(gif, 'favorited', Date.now());
      req.then(function(){
        Messenger.send('favorites-updated');
      });
      return req;
    },

    /**
      Remove a favorite by ID

      @param {Object} gif The gif to remove from favorites
    */
    removeFavorite: function(gif){
      console.log('remove from favorites')
      var req = changeGifProperty(gif, 'favorited', 0);
      req.then(function(){
        Messenger.send('favorites-updated');
      });
      return req;
    },

    /**
      Returns TRUE if this gif ID is marked as a favorite

      @param {String} id The gif ID to check
    */
    isFavorite: function(id){
      return inList('favorites', id);
    }
  };
})();