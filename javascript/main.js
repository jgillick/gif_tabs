
$(document).ready(function(){
  var gifs = [],
      history = [],
      lastFeedUpdate = 0,
      randomChooseCount = 0,
      currentGif = null,
      historyStart = 0,
      historyIndex = -1,
      settings = {},
      errorCount = 0,
      unloading = false;

  $(window).bind('beforeunload', function() {
    unloading = true;
  });

  /**
    Run the page program
  */
  function init() {

    // Load from storage, then build page
    chrome.storage.local.get(null, function(items){
      var cachedId, selected;

      settings          = items.settings;
      gifs              = items.gifs || [];
      history           = items.history || [];
      lastFeedUpdate    = items.lastFeedUpdate || 0;
      randomChooseCount = items.randomChooseCount || 0;

      updateSettings();
      setTheme(settings.theme);

      // Attempt to find a cached ID
      if (document.location.hash.length > 1) {
        cachedId = document.location.hash.substr(1);
      }
      else if ($("#gifid").val() != '') {
        cachedId = $("#gifid").val();
      }

      // Attempt to load existing gif (from location hash)
      if (cachedId && gifs.length > 0 && (selected = gifForId(cachedId)) ) {
        buildGif(selected);

        // Find in history
        historyIndex = history.indexOf(cachedId);
        if (historyIndex > -1) {
          historyStart = (historyIndex > 1) ? historyIndex - 2 : 0;
        }

        loadNewGifs();
      }

      // Show random gif
      else {
        if (gifs.length > 0) {
          buildRandomGif();
          loadNewGifs();
        }
        // No gifs, load and show
        else {
          loadNewGifs().then(buildRandomGif);
        }
      }

      buildHistory();
    });

    // Clicking history loads image
    $('section.history').click(function(evt){
      var target = $(evt.target),
          id;

      if (target.is('img')) {
        id = target.attr('id');
        historyIndex = parseInt(target.attr('data-index'));
        buildGif(gifForId(id));
        buildHistory();
      }
    });

    // Next / Previous
    $('nav .arrow').click(function(evt){
      var target = $(evt.target),
          inc = 0;

      // Move up/down history index
      if (target.is('.arrow.left')) {
        inc = 1;
      } else if (target.is('.arrow.right')) {
        inc = -1;
      }

      // Set index
      historyIndex += inc;
      if (currentGif && history[historyIndex] == currentGif.id) {
        historyIndex += inc;
      }
      if (historyIndex < -1) historyIndex = -1;

      // Show history gif
      if (history[historyIndex]) {
        buildGif(gifForId(history[historyIndex]));
      }
      // Out of range, show random
      else {
        buildRandomGif();
      }
      buildHistory();

      return false;
    });

    // If image fails to load, try another one
    $('.main img').error(function(){
      if (errorCount < 5) {
        buildRandomGif();
        errorCount++;
      }
    });

    // Loaded successfully
    $('.main img').load(function(){
      errorCount = 0;
      setTimeout(setWindowSizing, 50);
    });

    // Change theme
    $('#theme-select').change(function(){
      var chooser = $(this),
          theme = chooser.val();

      setTheme(theme);
      updateStorage();
    });

    // Change checkbox settings
    $('.settings input[type=checkbox]').change(function(){
      var checkbox = $(this),
          name = this.id.replace(/setting\-/, ''),
          feed = checkbox.data('feed');

      settings[name] = checkbox.is(':checked');

      // You need to have at least one feed selected
      if (checkbox.attr('name') == 'image-feed' && $('.settings input[name=image-feed]:checked').length == 0) {
        alert('You need to have at least one image feed service selected');
        this.checked = true;
        return false;
      } else {
        updateStorage();
      }

      // Update feed
      if (checkbox.is('input[name=image-feed]') && !checkbox.checked) {
        pruneImageList();
      }

      return true;
    })

    $(window).resize(setWindowSizing);
  }

  /**
    Setup the settings panel
  */
  function updateSettings() {

    // Defaults
    settings = _.defaults(settings, {
      theme: 'light_gray',
      giphy: true,
      reddit: true
    });

    $('#theme-select').val(settings.theme);
    $('#setting-giphy').attr('checked', settings.giphy);
    $('#setting-reddit').attr('checked', settings.reddit);
  }

  /**
    Set the theme of the page

    @param {String} name The file name to the stylesheet file for the theme
  */
  function setTheme(name) {
    var stylesheet = $('#theme-stylesheet'),
        chooser = $('#theme-select');

    stylesheet.attr('href', '/themes/'+ name +'.css');
    chooser.val(name);
    settings.theme = name;
  }

  /**
    Update the storage and return a promise
  */
  function updateStorage() {
    var store = {},
        dfd = new jQuery.Deferred();

    // Truncate to 500 gifs and 10 history
    if (gifs.length > 500) {
      gifs = gifs.slice(0, 500);
    }
    if (history.length > 20) {
      history = history.slice(0, 20);
    }

    store.version = chrome.app.getDetails().version;
    store.gifs = gifs;
    store.history = _.compact(history);
    store.lastFeedUpdate = lastFeedUpdate;
    store.randomChooseCount = randomChooseCount;
    store.settings = settings;

    console.log('Save', store);

    // Save to chrome storage
    chrome.storage.local.set(store, function(){
      dfd.resolve();
    });

    return dfd.promise();
  }

  /**
    Load gifs from Giphy and Reddit and returns a
    promise that will resolve as soon as the first source is done

    @param {boolean} force Force the gif update
  */
  function loadNewGifs(force) {
    var dfd = new jQuery.Deferred(),
        now = Date.now();

    // Don't load new gifs unless it's been 12 hours
    // or we've gone through at least 1/4 of the existing pool
    if (force !== true && gifs.length > 0 && randomChooseCount < (gifs.length / 4) && now - lastFeedUpdate < (60 * 60 * 12 * 1000)) {
      console.log('No need to update');
      return;
    }

    lastFeedUpdate = now;
    randomChooseCount = 0;

    // Clear all gifs, but what is in history
    gifs = gifs.filter(function(gif) {
      return history.indexOf(gif.id) > -1;
    });

    // Reddit
    if (settings.reddit !== false) {
      $.get('http://www.reddit.com/r/gifs/.json?limit=100')
      .then(function(xhr){

        xhr.data.children.forEach(function(gif){
          gif = gif.data;

          var type  = gif.url.match(/\.([^\.]*)$/)[1],
              id    = "r"+ gif.id;

          // Skip
          if (gif.over_18 || gif.thumbnail == 'nsfw' || type != 'gif') {
            return;
          }

          // Setup gif storage
          gifs.unshift({
            id: id,
            url: gif.url,
            thumb: gif.thumbnail,
            sources: ["http://reddit.com/"+ gif.permalink],
            feed: 'reddit',
            title: gif.title
          });
        });

        // Save gifs to storage
        updateStorage().then(function(){
          dfd.resolve();
        });
      });
    }

    // Giphy
    if (settings.giphy !== false) {
      $.get('http://api.giphy.com/v1/gifs/trending?api_key=dc6zaTOxFJmzC&limit=100')
      .then(function(xhr){

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
          gifs.unshift({
            id: id,
            url: gif.images.original.url,
            thumb: gif.images.fixed_height.url,
            sources: sources,
            feed: 'giphy',
            title: gif.title
          });
        });

        // Save gifs to storage
        updateStorage().then(function(){
          dfd.resolve();
        });
      });
    }

    return dfd.promise();
  };

  /**
    Prune the image list of images that should
    be filtered out by the settings
  */
  function pruneImageList() {

    // Filter history, then load a new list
    history = history.map(function(id, index) {
      var gif = gifForId(id);

      // Feed
      if (settings[gif.feed] === false) {
        return null;
      }
      return id;
    });
    history = _.compact(history);

    loadNewGifs(true).then(function(){
      // Update current gif
      if (settings[currentGif.feed] === false) {
        buildRandomGif();
      }
    });

    buildHistory();
  }

  /**
    Return a gif from the gifs pool by ID
  */
  function gifForId(id) {
    var found = _.find(gifs, function(gif){
      return gif.id == id;
    });

    return found;
  }

  /**
    Select a gif at random and display it
  */
  function buildRandomGif() {
    var i = Math.round(Math.random() * gifs.length),
        gif = gifs[i];

    // Error
    if (!gif) {
      console.error('No gif at index', i);
      buildRandomGif();
      return;
    }

    historyIndex = 0;
    addToHistory(gif);
    buildGif(gif);
    randomChooseCount++;
  }

  /**
    Display a gif
  */
  function buildGif(gif) {
    var container = $('section.main');

    currentGif = gif;

    // Clear gif
    container.find('a.image img').attr('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==');

    // Build GIF html
    container.find('a.image').attr({
      id: gif.id,
      href: gif.url
    });
    container.find('a.image img').attr('src', gif.url);

    // Title
    if (gif.title && gif.title != '') {
      container.addClass('has-title');
      container.find('figcaption').text(gif.title);
    } else {
      container.removeClass('has-title');
      container.find('figcaption').text('');
    }

    // Sources
    container.find('cite span').empty();
    if (gif.sources) {
      gif.sources.forEach(function(source) {
        var urlParts = source.match(/https?:\/\/(.*?)([\/|\?].*)?$/),
            link = $("<a>"),
            siteName;

        // grab the second to last domain part
        // i.e. www.reddit.com -> reddit
        siteName = urlParts[1].split('.').slice(-2)[0];

        // Build source link
        link.attr('href', source);
        link.text(siteName);

        container.find('cite span').append(link);
      });

      container.find('cite').addClass('has-source');
    } else {
      container.find('cite').removeClass('has-source');
    }

    container.removeClass('loading');
    $("#gifid").val(gif.id);
    if (!unloading) {
      document.location.hash = gif.id;
    }

    setTimeout(setWindowSizing, 50);
  }

  /**
    Update the history list by putting this gif on top
  */
  function addToHistory(gif) {

    // Remove duplicate
    if (history.indexOf(gif.id) > -1) {
      delete history[history.indexOf(gif.id)];
    }

    // Add and save
    history.unshift(gif.id);
    updateStorage();
  }

  /**
    Build the history gifs list
  */
  function buildHistory() {
    var container = $('section.history'),
        list = container.find('ul'),
        elements = list.find('li'),
        i = 0;

    // Adjust the history range
    if ((historyIndex >= historyStart + 4)
        || (historyIndex <= historyStart && historyIndex > 0)) {
      historyStart = historyIndex - 2;
    }

    // Keep historyStart within bounds
    if (historyStart < 0) {
      historyStart = 0;
    } else if (historyStart >= history.length - 5) {
      historyStart = history.length - 5;
    }

    // Build list
    history.slice(historyStart, historyStart + 10).every(function(id, index){
      var gif = gifForId(id),
          item, img,
          preload = new Image();

      if (!gif) {
        return true;
      } else if (i >= 5) {
        return false;
      }

      // Reuse list item
      if (item = elements.get(index)) {
        item = $(item);
        img = item.find('img');

      } else {
        item = $('<li>');
        img  = $('<img>');
        item.append(img);
        list.append(item);
      }

      img.removeClass('loaded');
      img.addClass('loading');

      // Set loaded class onload
      img.get(0).onload = function(){
        img.removeClass('loading');
        img.addClass('loaded');
      };

      function setSrc() {
        img.attr('src', gif.thumb);
        if (img.get(0).complete) {
          img.get(0).onload.call(img.get(0));
        }
      }

      // To give time to fade out former image
      if (!img.attr('id') || img.attr('id') != gif.id) {
        (new Image()).src = gif.thumb; // precache while we wait
        setTimeout(setSrc, 100);
      } else {
        setSrc();
      }

      img.attr('id', gif.id);
      img.attr('alt', gif.title);
      img.attr('title', gif.title);
      img.attr('data-index', historyStart + index);

      // Is it the current gif being display
      if (currentGif && id == currentGif.id) {
        item.addClass('selected');
      } else {
        item.removeClass('selected');
      }

      // Preload full image
      preload.src = gif.url;

      i++;
      return true;
    });

    if (i > 0) {
      container.removeClass('empty');
    } else {
      container.addClass('empty');
    }

    setWindowSizing();
  }

  /**
    If there's room  for all content in the viewport add body
    class "fits-view"
  */
  function setWindowSizing() {
    var viewport = $( window ).height(),
        body = $(document.body),
        main = $('.main'),
        history = $('.history'),
        buffer = 20;

    body.removeClass('fits-view');

    // The body height is less than the viewport
    if (body.outerHeight(true) < viewport) {
      body.addClass('fits-view');
    }
  }

  init();
});