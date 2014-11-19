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
    var dfd = new jQuery.Deferred();

    Store2.getGifs().then(function(gifs){
      var i, gif,
          tries = 0,
          numGifs = gifs.length;

      // Loop until we find a good random one
      do {
        i = Math.round(Math.random() * numGifs),
        gif = gifs[i];

        // It has already been used
        if (gif && gif.history > 0 && tries < 10) {
          gif = null;
          tries++;
        }
      } while(!gif && tries < 20);

      dfd.resolve(gif);
    });

    return dfd.promise();
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
    Load gifs from the APIs and returns a
    promise that will resolve as soon as the first source is done

    @param {boolean} forceUpdate Force the gif update
    @returns Promise
  */
  loadNewGifs: function(forceUpdate) {
    var dfd = new jQuery.Deferred(),
        now = Date.now();

    Store2.getGifs().then((function(allGifs){
      var gifLen = allGifs.length;

      // Don't load new gifs unless it's been 12 hours
      // or we've gone through at least 1/4 of the existing pool
      if (forceUpdate !== true
          && gifLen > 0
          && now - Store.lastFeedUpdate < (60 * 60 * 6 * 1000)) {
        dfd.resolve();
        return dfd.promise();
      }

      Store.lastFeedUpdate = now;
      Store.save('lastFeedUpdate');

      // Clear all gifs, then load new ones
      Store2.clearFeedGifs().then((function(){

        // Reddit
        if (Store.settings.reddit !== false) {
          $.get('http://www.reddit.com/r/gifs/.json?limit=200')
          .then((function(xhr){
            var gifs = [];

            xhr.data.children.forEach(function(gif){
              gif = gif.data;

              var type  = gif.url.match(/\.([^\.]*)$/)[1],
                  id    = "r-"+ gif.id;

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
          $.get('http://api.giphy.com/v1/gifs/trending?api_key=11zvNWrJ4cOCJi&limit=200')
          .then((function(xhr){
            var gifs = [];

            xhr.data.forEach(function(gif){
              var id = "g-"+ gif.id,
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

        // Replygif
        if (Store.settings.replygif !== false) {
          $.get('http://replygif.net/api/gifs?tag=&api-key=39YAprx5Yi')
          .then((function(xhr){
            var gifs = [],
                start, end;

            xhr.forEach(function(gif){
              var id = "rg-"+ gif.id,
                  sources = [gif.url];

              // Add gif to storage
              gifs.push({
                id: "rg-"+ gif.id,
                url: gif.file,
                thumb: gif.file,
                sources: [gif.url],
                feed: 'replygif',
                title: (typeof gif.caption == "string") ? gif.caption : ""
              });
            });

            // Save random ~200 gifs to storage
            end = gifs.length;
            if (end > 300) {
              end -= 200;
            }
            start = Math.round(Math.random() * end);
            end = start + 200;
            gifs = gifs.slice(start, end);
            if (gifs.length > 0) {
              Store2.addGifs(gifs).then(function(){
                dfd.resolve();
              });
            }
          }).bind(this));
        }

      }).bind(this));
    }).bind(this));

    return dfd.promise();
  }

}
