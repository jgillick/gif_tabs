import Gifs from '../gifs';

import $ from 'jquery';

const MAX_STORED = 200;

/**
 * Loads all gifs from the Giphy API
 */
export default {
  name: 'giphy',
  prefix: 'g',

  /**
   * Normalize the JSON from the server into the standard gif object
   * @param {Object} data Raw gif from the server
   * @return {Object} Gif object
   */
  normalizeGif: function(data){
    var id = this.prefix +'-'+ data.id,
        sources = [data.url];

    // Skip NSFW
    if (data.rating.match(/r|x/i)) {
      return false;
    }

    // Add external source
    if (data.source !== '') {
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
    var gifs = [];

    return new Promise((resolve) => {
      $.get('http://api.giphy.com/v1/gifs/trending?api_key=11zvNWrJ4cOCJi&limit='+ MAX_STORED)
      .then((xhr) => {

        xhr.data.forEach((gif) => {
          gif = this.normalizeGif(gif);
          if (gif) gifs.push(gif);
        });

        // Save gifs to storage
        if (gifs.length) {
          console.info('Loaded', gifs.length, 'from', this.name);
          Gifs.addGifs(gifs).then(() => {
            resolve(gifs);
          });
        }
      });
    });
  },

  /**
    Load the data for one or more images

    @param {String or Array} id The id (or array of ids) get
    @return Promise
  */
  get: function(id){
    var gifs = [],
        rPrefix = new RegExp('^'+ this.prefix +'\-');

    // Remove prefix
    id = (!Array.isArray(id)) ? [id] : id;
    let gids = id.map((i) => i.replace(rPrefix, ''));

    return new Promise((resolve) => {
      $.get('http://api.giphy.com/v1/gifs?api_key=11zvNWrJ4cOCJi&ids='+ gids.join(','))
      .then((xhr) => {

        xhr.data.forEach((gif) => {
          gif = this.normalizeGif(gif);
          if (gif) gifs.push(gif);
        });

        console.info('GET', gifs.length, 'from', this.name);
        resolve(gifs);
      });
    });
  }
};
