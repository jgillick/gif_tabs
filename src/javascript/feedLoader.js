
'use strict';

import Config from './config';

import Giphy from './feeds/giphy';
import Imgur from './feeds/imgur';
import Reddit from './feeds/reddit';
import Replygif from './feeds/replygif';


/**
 * Handles loading gifs from all feed handlers
 */
export default {

  /**
    The maximum number of gifs to load for any given feed
  */
  MAX_PER_FEED: 200,

  /**
    List of enabled handlers and keyed by their ID prefixes
    (set at the end of this file)
  */
  handlers: {
    'g': Giphy,
    'r': Reddit,
    'i': Imgur,
    'rg': Replygif
  },


  /**
    Load all feeds and return a promise that will resolve when the first one returns

    @return Promise
  */
  loadAll: function(){
    return new Promise((resolve, reject) => {

      Object.keys(this.handlers).forEach((prefix) => {
        const handler = this.handlers[prefix];
        if (Config.settings[handler.name] !== false) {
          handler.load()
          .then(function(gifs){
            resolve(gifs);
          })
          .catch(function(gifs){
            reject(gifs);
          });
          }
      });

    });
  },

  /**
    Get the data from one or more gifs from the feeds

    @param {String or Array} id The id (or array of ids) get
    @return Promise
  */
  get: function(id) {
    let groups = {},
        groupCount = 0,
        allGifs = [];

    id = (!Array.isArray(id)) ? [id] : id;
    id = id.sort();

    // Group the IDs into feeds
    id.forEach((id) => {
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
    const promises = Object.keys(groups).map((prefix) => {
      const group = groups[prefix];

      return this.handlers[prefix]
      .get(group)
      .then((gifs) => {
        allGifs = allGifs.concat(gifs);
        return gifs;
      })
      .catch((e) => {
        return [];
      });

    });

    return Promise.all(promises).then(() => allGifs);
  }
};
