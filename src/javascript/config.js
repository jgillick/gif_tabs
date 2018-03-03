
import messenger from './messenger';

/**
  Handles the app's central storage
*/
const Config = {
  settings: {},
  lastFeedUpdate: 0,


  /**
    Load the storage into variables

    @param {String or Array} properties (optional) List of property names to update
    @returns Promise
  */
  load: function(properties){
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(properties, (items) => {
        this.settings          = items.settings || this.settings;
        this.lastFeedUpdate    = items.lastFeedUpdate || this.lastFeedUpdate;

        // Default settings
        const defaults = {
          theme: 'light_gray',
          giphy: true,
          reddit: true,
          replygif: true
        };
        this.settings = Object.assign({}, defaults, this.settings);

        resolve();
      });
    });
  },

  /**
    Update the storage and return a promise

    @param {String} property The property name to save
    @returns Promise
  */
  save: function(property) {
    var store = {}, singleStore;

    // Setup store
    store = {
      version: chrome.app.getDetails().version,
      settings: this.settings,
      lastFeedUpdate: this.lastFeedUpdate,
    };

    return new Promise((resolve, reject) => {

      // Only save one property
      if (typeof property == 'string') {

        if (typeof store[property] === 'undefined') {
          reject();
          return;
        }

        singleStore = {};
        singleStore[property] = store[property];
        store = singleStore;
      }

      // console.log('Save', store);

      // Save to chrome storage
      chrome.storage.local.set(store, function(){
        resolve();

        // Send event trigger for all updated properties
        for (var name in store) if (store.hasOwnProperty(name)) {
          messenger.send(name +'-updated', store[name]);
        }
        messenger.send('config-updated', property);
      });
    });
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
        pathMatch = name.match(/^([^\.]+)\.(.+)$/);

    if (pathMatch) {
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
};

// Update store when another window updates
messenger.addListener('config-updated', function(property){
  Config.load(property);
});

export default Config;
