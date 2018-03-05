'use strict';

import Feeds from './feedLoader';
import Config from './config';
import messenger from './messenger';

var db = null;

const MAX_HISTORY_STORED = 20;

/**
 * The Gif Storage API for the entire app
 *
 * @class Gifs
 */
const Gifs = {

  /**
    Init the DB
  */
  init: function(){
    var version = chrome.app.getDetails().version,
        verParts, request;

    // Convert version string to float
    verParts = version.replace(/^([^0-9\.]\.)|[^0-9\.]/, '').split('.');           // Remove non-digits and any leading digit/dot combo
    version = [verParts.shift(), verParts.join('')].join('.').replace(/\.$/, '');  // Combine first digit, followed by a dot and all the rest
    version = parseFloat(version);

    // Open DB
    return new Promise((resolve, reject) => {
      request = indexedDB.open("gif_tab", version);
      request.onupgradeneeded = migrations;
      request.onsuccess = function(e) {
        db = e.target.result;
        resolve();
      };
      request.onerror = function(e){
        reject(e.value);
      };
    });
  },

  /**
    Get the number of records in a store

    @returns {Promise}
  */
  gifCount: function() {
    const count = transaction('readonly').store.count();
    return new Promise((resolve, reject) => {
      count.onsuccess = () => {
        resolve(count.result);
      };
      count.onerror = (e) => {
        reject(e.value);
      };
    });
  },

  /**
    Get a gif object by ID

    @param {String} id The gif ID to search for
    @return {Promise}
  */
  getByID: function(id) {
    return new Promise((resolve, reject) => {
      const trans = db.transaction(['gifs'], 'readonly');
      trans.onerror = (e) => {
        reject(e.value);
      };

      const req = trans.objectStore('gifs').get(id);
      req.onerror = (e) => {
        reject(e.value);
      };
      req.onsuccess = () => {
        const gif = req.result;
        if (gif) {
          resolve(gif);
        } else {
          reject();
        }
      };
    });
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
    return new Promise((resolve, reject) => {
      Gifs.getGifs()
      .then((gifs) => {
        let gif;

        // Filter out feeds disabled in settings
        const filteredGifs = gifs.filter((g) => (Config.settings[g.feed] !== false));

        // Loop until we find a good random one
        let tries = 0;
        const numGifs = filteredGifs.length;
        if (numGifs === 0) {
          reject();
          return;
        }
        do {
          let i = Math.round(Math.random() * numGifs);
          gif = filteredGifs[i];

          // It has already been used
          if (gif && gif.history > 0 && tries < 10) {
            gif = null;
            tries++;
          }
        } while(!gif && tries < 20);

        resolve(gif);
      });
    });
  },

  /**
    Load gifs from the APIs and returns a
    promise that will resolve as soon as the first source is done

    @param {boolean} forceUpdate Force the gif update
    @returns Promise
  */
  loadNewGifs: function(forceUpdate) {
    const now = Date.now();
    const sinceUpdate = now - Config.lastFeedUpdate;
    const UPDATE_SECS = 60 * 60 * 6 * 1000; // 6 hours

    return this.gifCount()
    .then((gifLen) => {
      console.info('All gifs', gifLen);

      // Don't load new gifs unless it's been 6 hours
      // or we've gone through at least 1/4 of the existing pool
      if (forceUpdate !== true && gifLen > MAX_HISTORY_STORED && sinceUpdate < UPDATE_SECS) {
        return [];
      }

      Config.set('lastFeedUpdate', now);

      // Clear all gifs, then load new ones
      return this.clearFeedGifs().then(() => Feeds.loadAll());
    });
  },

  /**
    Add an array of gifs to the DB

    @param {Array} gifs An array of gif objects
    @return Promise
  */
  addGifs: function(gifs) {
    const trans = transaction();

    // No gifs
    if (!gifs || gifs.length === 0) {
      trans.resolve([]);
      return trans.promise;
    }

    // Add all gifs
    gifs.forEach((gif) => {
      try {
        gif.addedOn = Date.now();
        gif.history = 0;
        gif.favorited = gif.favorited || 0;
        trans.store.add(gif).onerror = (e) => {
          e.preventDefault();
        };
      } catch(e) {
        console.error(e.message);
      }
    });

    // Get updated list
    trans.promise
    .then(() => {
      if (gifs && gifs.length) {
        messenger.send('gifs-updated');
      }
    });

    return trans.promise;
  },

  /**
    Remove gifs from a specific feed

    @param {String} feed The name of the feed (reddit or giphy)
    @return Promise
  */
  removeGifsByFeed: function(feed) {
    return new Promise((resolve) => {
      getAll('feed, favorite, history', IDBKeyRange.only(feed, 0, 0))
      .then((gifs) => {
        const trans = transaction();

        // Delete gifs
        gifs.forEach((gif) => {
          trans.store.delete(gif.id);
        });

        // Notify everything
        if (gifs.length > 0) {
          trans.promise.then(() => {
            messenger.send('gifs-updated');
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
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
        trans.resolve();
      }
    };
    cursor.onerror = function(e) {
      trans.reject(e.value);
    };

    return trans.promise;
  },

  /**
    Get history

    @returns Promise
  */
  getHistory: function(){
    return new Promise((resolve) => {

      // Update local cache and truncate to max history length
      getAll('history', IDBKeyRange.lowerBound(1))
      .then((gifs) => {
        const extra = gifs.slice(MAX_HISTORY_STORED);
        const history = gifs.slice(0, MAX_HISTORY_STORED);
        const removeTrans = transaction();

        // Remove everything over the max history length
        if (extra.length) {
          extra.forEach(function(gif){
            gif.history = 0;
            removeTrans.store.put(gif);
          });

          removeTrans.promise.then(() => {
            resolve(history);
          });
        } else {
          resolve(history);
        }

      });
    });
  },

  /**
    Add gif to history

    @param {Object} gif The gif to add to the history list
  */
  addToHistory: function(gif) {
    const req = changeGifProperty(gif, 'history', Date.now());
    req.then(function(){
      messenger.send('history-updated');
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
      messenger.send('favorites-updated');
    });

    // Sync with cloud
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get('favorites', (data) => {
        data.favorites = data.favorites || {};

        if (!data.favorites[gif.id]) {
          data.favorites[gif.id] = now;

          chrome.storage.sync.set(data, () => {
            if (chrome.runtime.lastError) {
              console.error('Error trying to sync the favorites: ', runtime.lastError);
              reject(runtime.lastError);
            } else {
              console.info('Added to favorites!', gif);
              resolve();
            }
          });
        }
      });
    });
  },

  /**
    Remove a favorite by ID

    @param {Object} gif The gif to remove from favorites
  */
  removeFavorite: function(gif){
    var req = changeGifProperty(gif, 'favorited', 0);
    req.then(function(){
      messenger.send('favorites-updated');
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
    return new Promise((resolve) => {

      // Get favorites from the cloud
      chrome.storage.sync.get('favorites', (data) => {
        let cloudFavs = data.favorites || {};

        // Get favorites from the DB
        this.getFavorites()
        .then((localFavs) => {
          let queue = [];

          // Prune favs not in cloud
          localFavs.forEach((fav) => {
            if (!cloudFavs[fav.id]) {
              changeGifProperty(fav, 'favorited', 0);
            }
          });

          // Add new favs
          Object.keys(cloudFavs).forEach((id) => {
            const timestamp = cloudFavs[id];

            let found = localFavs.filter((f) => (f.id === id));

            // Add to favs
            if (found.length) {
              found = found[0];
              if (found.favorited === 0) {
                changeGifProperty(found, 'favorited', timestamp);
              }
            }
            // Queue up to load from the feed
            else {
              queue.push(id);
            }

          });

          // Check if images are already in DB
          let findPromises = [];
          if (queue.length) {
            findPromises = queue.map((id) => {
              return this.getByID(id)
              .then((gif) => {
                queue = queue.filter(i => i !== id);
                this.addToFavorites(gif);
              })
              .catch(() => null); // skip errors
            });
          }

          // Load any additional images from the feeds.
          Promise.all(findPromises)
          .then(() => {
            if (queue.length) {
              Feeds.get(queue)
              .then((gifs) => {
                gifs.forEach((gif) => {
                  gif.favorited = cloudFavs[gif.id] || 1;
                });
                this.addGifs(gifs).then(resolve);
              });
            }
            resolve();
          });
        });
      });
    });
  }
};
export default Gifs;


/**
  DB Migrations
*/
function migrations(event){
  let db = event.target.result,
      oldVersion = event.oldVersion;

  event.target.transaction.onerror = function(e){
    throw "Could not update DB: "+ e.value;
  };

  if (oldVersion < 1) {
    // Create gifs stores
    const store = db.createObjectStore('gifs', {keyPath: 'id'});
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
  }
}

/**
  Create a transaction for a store and setup a
  promise to handle the success and error states

  @param {String} mode (optional) The transaction mode (readwrite or readonly)
  @returns {Object} with promise, resolve, reject, transaction and store
*/
function transaction(mode='readwrite') {
  const trans = db.transaction(['gifs'], mode);
  const store = trans.objectStore('gifs');

  let promiseResolve, promiseReject;
  const transPromise = new Promise((resolve, reject) => {
    promiseResolve = resolve;
    promiseReject = reject;
    trans.oncomplete = () => {
      resolve([]);
    };
    trans.onerror = (e) => {
      let value = trans.error || e.value;
      if (!value && e.target.error) {
        value = e.target.error.message;
      }
      reject(value || 'Unknown error');
    };
  });

  return {
    promise: transPromise,
    resolve: promiseResolve,
    reject: promiseReject,
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
      trans.resolve(all);
    }
  };
  cursor.onerror = function(e) {
    trans.reject(e.value);
  };

  return trans.promise;
}

/**
  Change a value on a gif. For example, adding a gif to the favorites list.

  @param {Object} gif The gif object to update
  @param {String} property  The property to updated
  @param {Variant} value The value to set the property to
  @return Promise
*/
function changeGifProperty(gif, property, value) {
  return new Promise((resolve) => {
    Gifs.getByID(gif.id)
    .then((foundGif) => {
      const trans = transaction();

      gif = foundGif || gif;
      gif[property] = value;

      trans.store.put(gif);
      trans.promise.then(() => {
        resolve(gif);
      });
    });
  });
}


/**
  Checks if gif ID exists in a specific list

  @params {String} list The list to check the gif against ("history" or "favorites")
  @params {String} id The ID to check the list for
  @return Promise
*/
function inList(list, id) {
  let trans = transaction('readonly'),
      index, range, request;

  if (list != 'history' && list != 'favorites') {
    throw 'Invalid list type specified "'+ list +'"';
  }

  index = trans.store.index("id, "+ list);
  range = IDBKeyRange.bound([id, 1], [id, Date.now()]);

  return new Promise((resolve, reject) => {
    request = index.get(range);
    request.onsuccess = function(event) {
      resolve(!!event.target.result);
    }
    request.onerror = function(event){
      reject(event.value);
    }
  });
}

