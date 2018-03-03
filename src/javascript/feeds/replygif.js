
import Gifs from '../gifs';
import Feeds from '../feedLoader';

import $ from 'jquery';


/**
 * Loads all gifs from the ReplyGif API
 */
export default {
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
    return new Promise((resolve) => {
      $.get('http://replygif.net/api/gifs?tag=&api-key=39YAprx5Yi')
      .then((xhr) => {
        let gifs = [],
            start, end;

        xhr.forEach((gif) => {
          gifs.push(this.normalizeGif(gif));
        });

        // Force feed limit by choosing a random chunk of the data
        end = gifs.length;
        if (end > Feeds.MAX_PER_FEED) {
          end -= Feeds.MAX_PER_FEED;
        }
        start = Math.round(Math.random() * end);
        end = start + Feeds.MAX_PER_FEED;
        gifs = gifs.slice(start, end);

        // Save gifs to storage
        if (gifs.length) {
          console.info('Loaded', gifs.length, 'from', this.name);
          Gifs.addGifs(gifs).then(function(){
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
        rPrefix = new RegExp('^'+ this.prefix +'\-'),
        dfd = new jQuery.Deferred();

    // Remove prefix
    id = (!Array.isArray(id)) ? [id] : id;
    let gids = id.map((i) => i.replace(rPrefix, ''));

    return new Promise((resolve) => {
      $.get('http://replygif.net/api/gifs?tag=&api-key=39YAprx5Yi')
      .then((xhr) => {
        gifs = xhr.filter((gif) => {
          return (gids.indexOf(gif.id) > -1);
        });
        console.info('GET', gifs.length, 'from', this.name);
        resolve(gifs);
      });
    });
  }
};
