/**
  Manages loading GIFs from various external
  feeds.
*/
window.Gifs = {

  /**
    All the gifs
  */
  all: function(){
    return Store.gifs;
  },


  /**
    Return a random gif
  */
  random: function(){
    Store.gifs = _.compact(Store.gifs);

    var i, gif,
        tries = 0,
        numGifs = Store.gifs.length,
        numHist = _.compact(Store.history).length;

    // Be sure to remove any undefined parts of the gif array
    if (Store.gifs.length == 0) {
      throw "No gifs are loaded yet";
    }

    // Loop until we find a good random one
    do {
      i = Math.round(Math.random() * numGifs),
      gif = Store.gifs[i];

      // It has already been used
      if (gif && Store.history.indexOf(gif.id) > -1 && tries < 10) {
        gif = null;
        tries++;
      }
    } while(!gif && tries < 20);

    return gif;
  },

  /**
    Returns if a gif ID is marked as a favorite

    @param {String} id The ID to the gif
    @return True if this gif is a favorite
  */
  isFavorite: function(id) {
    return Store2.isFavorite(id);
  },

  /**
    Load gifs from Giphy and Reddit and returns a
    promise that will resolve as soon as the first source is done

    @param {boolean} forceUpdate Force the gif update
    @returns Promise
  */
  loadNewGifs: function(forceUpdate) {
    var dfd = new jQuery.Deferred(),
        now = Date.now(),
        gifLen = Store.gifs.length;

    // Don't load new gifs unless it's been 12 hours
    // or we've gone through at least 1/4 of the existing pool
    if (false && forceUpdate !== true
        && gifLen > 0
        && now - Store.lastFeedUpdate < (60 * 60 * 6 * 1000)) {
      dfd.resolve();
      return dfd.promise();
    }

    Store.lastFeedUpdate = now;

    // Clear all gifs, then load new ones
    Store2.clearAllGifs().then((function(){

      // Reddit
      if (Store.settings.reddit !== false) {
        $.get('http://www.reddit.com/r/gifs/.json?limit=100')
        .then((function(xhr){
          var gifs = [];

          xhr.data.children.forEach(function(gif){
            gif = gif.data;

            var type  = gif.url.match(/\.([^\.]*)$/)[1],
                id    = "r"+ gif.id;

            // Skip
            if (gif.over_18 || gif.thumbnail == 'nsfw' || type != 'gif') {
              return;
            }

            // Update gif storage
            gifs.push({
              id: id,
              url: gif.url,
              thumb: gif.thumbnail,
              sources: ["http://reddit.com/"+ gif.permalink],
              feed: 'reddit',
              title: gif.title
            });
          });

          // Save gifs to storage
          Store2.addGifs(gifs).then(function(){
            dfd.resolve();
          });
        }).bind(this));
      }

      // Giphy
      if (Store.settings.giphy !== false) {
        $.get('http://api.giphy.com/v1/gifs/trending?api_key=11zvNWrJ4cOCJi&limit=100')
        .then((function(xhr){
          var gifs = [];

          xhr.data.forEach(function(gif){
            var id = "g"+ gif.id,
                sources = [gif.url];

            // Skip NSFW
            if (gif.rating.match(/r|x/i)) {
              return;
            }

            // Add external source
            if (gif.source != '') {
              sources.push(gif.source);
            }

            // Setup gif storage
            gifs.push({
              id: id,
              url: gif.images.original.url,
              thumb: gif.images.fixed_height_still.url,
              sources: sources,
              feed: 'giphy',
              title: gif.title
            });
          });

          // Save gifs to storage
          Store2.addGifs(gifs).then(function(){
            dfd.resolve();
          });
        }).bind(this));
      }
    }).bind(this));

    return dfd.promise();
  }

}
