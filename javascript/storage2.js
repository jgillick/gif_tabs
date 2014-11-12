
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

      // Create image stores
      ['gifs', 'history', 'favorites'].forEach(function(name){
        var store = db.createObjectStore(name, {keyPath: "id"});
        store.createIndex("feed", "feed", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      });

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
    Get all records from a store

    @param {String} storeName The name of the store the transaction is for
    @param {String} indexName (optional) The index to match against
    @param {String} value     (optional) The value of the index to match
    @returns {Object} with deferred, transaction and store
  */
  function getAll(storeName, indexName, value) {
    var trans = transaction(storeName, "readonly"),
        all = [],
        cursor, index, range;

    trans.oncomplete = undefined;

    // Target records matching an index value
    if (indexName){
      index = trans.store.index(indexName);
      if (typeof value != 'undefined') {
        range = IDBKeyRange.only(value);
      }
      cursor = index.openCursor(range);
    }
    else {
      index = trans.store.index('timestamp');
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
    The Storage API for the entire app

    @class Store
  */
  window.Store2 = {
    settings: {},
    lastFeedUpdate: 0,
    gifIds: [],
    historyIds: [],
    favoriteIds: [],

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
      Get an object by ID

      @param {String} storeName The name of the store to get the object from
      @param {String} id The ID to search for
      @return {Promise}
    */
    getByID: function(storeName, id) {
      var dfd = new jQuery.Deferred(),
          trans = db.transaction([storeName], 'readonly'),
          req = trans.objectStore(storeName).get(id);

      trans.onerror = function(e) {
        dfd.reject(e.value)
      };
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
      var promise = getAll('gifs');

      // Update local map
      promise.then((function(gifs){
        this.gifIds = gifs.map(function(g){ return g.id; });
      }).bind(this));

      return promise;
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
          gif.timestamp = Date.now();
          trans.store.put(gif);
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
      Delete gifs that match a property and value

      Delete gif by ID:
          deleteGifsBy('id', 'g123'})

      Delete gif by feed:
          deleteGifsBy('feed', 'feed'})

      @param Promise
    */
    deleteGifsBy: function(property, value){
      var dfd = new jQuery.Deferred();

      // Find gifs matching property/value
      getAll('gifs', property, value).then((function(gifs){
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
      Clear the all the gifs
    */
    clearAllGifs: function() {
      var trans = transaction('gifs');
      trans.store.clear();
      this.gifIds = [];
      return trans.deferred.promise();
    },

    /**
      Get history

      @returns Promise
    */
    getHistory: function(){
      var dfd = new jQuery.Deferred();

      // Update local cache and truncate to 20
      getAll('history').then((function(gifs){
        var extra = gifs.slice(20),
            history = gifs.slice(0, 20),
            removeTrans = transaction('history');

        this.historyIds = history.map(function(g){ return g.id; });

        // Delete all over 20 items
        if (extra) {
          extra.forEach(function(gif){
            removeTrans.store.delete(gif.id);
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
      var trans = transaction('history'),
          historyGif = _.clone(gif);

      historyGif.timestamp = Date.now();
      trans.store.put(historyGif);

      // Notify everything
      trans.deferred.promise().then((function(){
        Messenger.send('history-updated');
      }).bind(this));

      return trans.deferred.promise();
    },

    /**
      Returns TRUE if a history gif with this ID exists in the history DB

      @param {String} id The gif ID to check
    */
    inHistory: function(id){
      return (this.historyIds.indexOf(id) > -1);
    },

    /**
      Get favorites
    */
    getFavorites: function(){
      var promise = getAll('favorites');

      // Update local map
      promise.then((function(gifs){
        this.favoriteIds = gifs.map(function(g){ return g.id; });
      }).bind(this));

      return promise;
    },

    /**
      Add gif to favorites

      @param {Object} gif The gif to add to the history list
    */
    addToFavorites: function(gif){
      var trans = transaction('favorites'),
          favGif = _.clone(gif);

      console.log('Add fav', favGif.id);

      favGif.timestamp = Date.now();
      trans.store.put(favGif);

      // Notify everything
      trans.deferred.promise().then((function(){
        Messenger.send('favorites-updated');
      }).bind(this));

      return trans.deferred.promise();
    },

    /**
      Remove a favorite by ID

      @param {String} id The ID of the favorite to remove
    */
    removeFavorite: function(id){
      var trans = transaction('favorites');
      trans.store.delete(id);
      return trans.deferred.promise();
    },

    /**
      Returns TRUE if this gif ID is marked as a favorite

      @param {String} id The gif ID to check
    */
    isFavorite: function(id){
      return (this.favoriteIds.indexOf(id) > -1);
    },

    /**
      Get a config value
    */
    getConfig: function(name) {

    },

    /**
      Set a config value
    */
    setConfig: function(name, value) {

    }
  };
})();