import Gifs from '../gifs';

import $ from 'jquery';

const MAX_STORED = 200;

/**
 * Loads all gifs from the Giphy API
 */
export default {
  name: 'reddit',
  prefix: 'r',

  /**
    Normalize the JSON from the server into the standard gif object
    @param {Object} data Raw gif from the server
    @return {Object} Gif object
  */
  normalizeGif: function(data){
    var type  = data.url.match(/\.([^\.]*)$/)[1],
        id    = this.prefix +'-'+ data.name,
        gif   = {};

    // Skip
    if (data.over_18 || data.thumbnail == 'nsfw' || (type != 'gif' && type != 'gifv')) {
      return false;
    }

    // Build gif object
    gif = {
      id: id,
      url: data.url,
      thumb: data.thumbnail,
      sources: ["http://reddit.com/"+ data.permalink],
      feed: this.name,
      title: data.title,
      description: null
    };

    // Static thumbnail
    try {
      if (data.preview.images[0].resolutions[1]) {
        gif.thumb = data.preview.images[0].resolutions[1].url;
      } else {
        gif.thumb = data.preview.images[0].resolutions[0].url;
      }
      gif.thumb = gif.thumb.replace(/&amp;/g, '&');
    } catch(e) {}

    // Embedded iframe (decode escaped HTML first)
    if (data.media_embed && data.media_embed.content) {
      var el = document.createElement('div');
      el.innerHTML = data.media_embed.content;
      el = $(el.firstChild.nodeValue);

      // Add 'http:' to urls that start with '//'
      if (el.attr('src').match(/^\/\//)) {
        el.attr('src', 'http:'+ el.attr('src'));
      }

      gif.url = el.attr('src');
      gif.embed = $('<div>').append(el).html();
    }

    return gif;
  },

  /**
    Load the entire feed and add to the Gif DB
    @return Promise
  */
  load: function(){
    let gifs = [];

    return new Promise((resolve) => {
      const loadPages = (next) => {
        let url = 'http://www.reddit.com/r/gifs/hot.json';

        if (next) {
          url += '?after='+ next;
        }

        $.ajax(url)
        .then((xhr) => {
          const data = xhr.data,
                next = data.after,
                records = data.children;

          // Normalize all gif objects
          records.forEach((gif) => {
            gif = this.normalizeGif(gif.data);
            if (gif) gifs.push(gif);
          });

          // Save gifs to storage
          if (records.length === 0 || gifs.length >= MAX_STORED) {
            gifs = gifs.splice(0, MAX_STORED);
            console.info('Loaded', gifs.length, 'from', this.name);
            Gifs.addGifs(gifs).then(() => {
              resolve(gifs);
            });
          }
          // Get next page
          else {
            loadPages(next);
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
    var gifs = [],
        rPrefix = new RegExp(`^${this.prefix}\-`);

    // Remove prefix
    id = (!Array.isArray(id)) ? [id] : id;
    let gids = id.map((i) => i.replace(rPrefix, ''));

    return new Promise((resolve) => {
      $.get('http://www.reddit.com/by_id/'+ gids.join(',') +'.json')
      .then((xhr) => {

        xhr.data.children.forEach((gif) => {
          gif = this.normalizeGif(gif.data);
          if (gif) gifs.push(gif);
        });

        console.info('GET', gifs.length, 'from', this.name);
        resolve(gifs);
      });
    });
  }
};
