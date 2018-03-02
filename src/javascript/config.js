
/**
  Handles the app's central storage
*/
(function(){


  window.Config = {
    settings: {},
    lastFeedUpdate: 0,


    /**
      Load the storage into variables

      @param {String or Array} properties (optional) List of property names to update
      @returns Promise
    */
    load: function(properties){
      var dfd = new jQuery.Deferred();

      chrome.storage.local.get(properties, (function(items){
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
        settings:          this.settings,
        lastFeedUpdate:    this.lastFeedUpdate,
      }

      // Only save one property
      if (typeof property == 'string') {

        if (typeof store[property] == undefined) {
          dfd.reject();
          return dfd.promise();
        }

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
        Messenger.send('config-updated', property);
      });

      return dfd.promise();
    },

    /**
      Set and save a value on the Config object

      @param {String} name The config name
      @param {String} value The config value
      @returns Promise
    */
    set: function(name, value) {
      var scope = this,
          scopeName = name,
          pathMatch;

      if (pathMatch = name.match(/^([^\.]+)\.(.+)$/)) {
        scopeName = pathMatch[1];
        name = pathMatch[2];
        scope = this[scopeName];

        if (!scope) {
          throw "Invalid Config scope, "+ scopeName;
        }
      }

      scope[name] = value;
      return this.save(scopeName);
    }
  }

  // Update store when another window updates
  Messenger.addListener('config-updated', function(property){
    Config.load(property);
  });
})();