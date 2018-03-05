
import Gifs from '../gifs';
import Feeds from '../feedLoader';

import $ from 'jquery';

/**
 * Loads all gifs from the imgur API
 */
export default {
  name: 'imgur',
  prefix: 'i',
  client_id: '97aa3148456ebe1',

  /**
    Return a jQuery Ajax request for an imgur endpoint

    @param {String} endpoint The endpoint to get (i.e. /gallery/r/gifs/)
    @param {Object} data Any query params to send to the endpoint
  */
  ajax: function(endpoint, data) {
    return $.ajax(`https://api.imgur.com/3/${endpoint}`, {
      type: 'GET',
      data: data,
      headers: {
        Authorization: 'Client-ID '+ this.client_id
      }
    });
  },

  /**
    Normalize the JSON from the server into the standard gif object
    @param {Object} data Raw gif from the server
    @return {Object} Gif object
  */
  normalizeGif: function(data){
    var gif;

    if (!data || !data.animated || data.nsfw) {
      return null;
    }

    gif = {
      id: this.prefix +'-'+ data.id,
      url: data.link,
      thumb: data.link,
      sources: [`http://imgur.com/${data.id}`],
      feed: this.name,
      title: data.title,
      description: data.description
    };

    // High-quality video
    var embeddable = data.mp4 || data.webm || data.gifv;
    if (embeddable){
      gif.url = embeddable;
      gif.embed = `<video src="${embeddable}" autoplay loop></video>`;
    }

    // Broken thumbnail
    if (!data.link && data.gifv) {
      data.thumb = data.gifv.replace(/gifv$/i, 'gif');
    }

    return gif;
  },

  /**
    Load the entire feed and add to the Gif DB
    @return Promise
  */
  load: function(){
    var gifs = [];

    return new Promise((resolve) => {
      const loadPages = (p) => {
        p = p || 0;

        this.ajax(`/gallery/hot/viral/${p}.json`)
        .then((xhr) => {
          var data = xhr.data;

          // Normalize all gif objects
          data.forEach((gif) => {
            gif = this.normalizeGif(gif);
            if (gif) gifs.push(gif);
          });

          // Save gifs to storage
          if (data.length === 0 || gifs.length >= Feeds.MAX_PER_FEED) {
            gifs = gifs.splice(0, Feeds.MAX_PER_FEED);
            console.info('Loaded', gifs.length, 'from', this.name);
            Gifs.addGifs(gifs).then(function(){
              resolve(gifs);
            });
          }

          // Get next page
          else {
            loadPages(++p);
          }
        });
      };

      loadPages();
    });
  },

  /**
    Load the data for one or more images

    @param {String or Array} id The id (or array of ids) get
    @return Promise
  */
  get: function(id){
    let gifs = [],
        rPrefix = new RegExp('^'+ this.prefix +'\-');

    // Remove prefix
    id = (!Array.isArray(id)) ? [id] : id;
    let gids = id.map((i) => i.replace(rPrefix, ''));

    // Get all images by ID
    const promises = gids.map((id) => {
      return new Promise((resolve) => {
        this.ajax(`/image/${id}`)
        .then((xhr) => {
          // Process gif
          var gif = this.normalizeGif(xhr.data);
          if (gif) gifs.push(gif);
          resolve(gif);
        })
        .fail(() => {
          resolve(null);
        });
      });
    });

    return Promise.all(promises).then(() => {
      console.info('GET', gifs.length, 'from', this.name);
      return gifs;
    });
  }
};
