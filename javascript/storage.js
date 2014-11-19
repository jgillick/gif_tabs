
/**
  Handles the app's central storage
*/
(function(){


  window.Store = {
    scss: {},
    settings: {},
    lastFeedUpdate: 0,


    /**
      Load the storage into variables

      @param {String or Array} properties List of property names to update
      @returns Promise
    */
    load: function(properties){
      var dfd = new jQuery.Deferred();

      chrome.storage.local.get(properties, (function(items){
        this.scss              = items.scss || this.scss;
        this.settings          = items.settings || this.settings;
        this.lastFeedUpdate    = items.lastFeedUpdate || this.lastFeedUpdate;

        // Default settings
        this.settings = _.defaults(this.settings || {}, {
          theme: 'light_gray',
          giphy: true,
          reddit: true,
          replygif: true
        });

        dfd.resolve();
      }).bind(this));

      return dfd.promise();
    },

    /**
      Update the storage and return a promise

      @param {String} property The property name to save
      @returns Promise
    */
    save: function(property) {
      var store = {}, singleStore,
          dfd = new jQuery.Deferred();

      // Setup store
      store = {
        version:           chrome.app.getDetails().version,
        scss:              this.scss,
        settings:          this.settings,
        lastFeedUpdate:    this.lastFeedUpdate,
      }

      // Only save one property
      if (typeof property == 'string') {
        singleStore = {};
        singleStore[property] = store[property];
        store = singleStore;
      }

      // console.log('Save', store);

      // Save to chrome storage
      chrome.storage.local.set(store, function(){
        dfd.resolve();

        // Send event trigger for all updated properties
        for (var name in store) if (store.hasOwnProperty(name)) {
          Messenger.send(name +'-updated', store[name]);
        }
        Messenger.send('store-updated', property);
      });

      return dfd.promise();
    }
  }

  // Update store when another window updates
  Messenger.addListener('store-updated', function(property){
    Store.load(property);
  });
})();