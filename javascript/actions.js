
(function(){
  var errorCount = 0;

/**
  Add to favorites
*/
$('.main .make-favorite').click(function(evt){
  addToFavorites();
});

/**
 Clicking history loads image
*/
$('section.history').click(function(evt){
  var target = $(evt.target),
      id;

  if (target.is('img')) {
    id = target.attr('id');
    // historyIndex = parseInt(target.attr('data-index'));
    UI.showGif(Gifs.forID(id));
    UI.buildHistory();
  }
});

/**
  Next / Previous buttons
*/
$('nav .arrow').click(function(evt){
  var target = $(evt.target),
      inc = 0;

  // Move up/down history index
  if (target.is('.arrow.left')) {
    UI.historyIncrement(UI_NEXT);
  } else if (target.is('.arrow.right')) {
    UI.historyIncrement(UI_PREV);
  }

  return false;
});

/**
  If image fails to load, try another one
*/
$('.main img').error(function(){
  if (errorCount < 5) {
    UI.showRandomGif();
    errorCount++;
  }
});

/**
  Loaded successfully
*/
$('.main img').load(function(){
  errorCount = 0;
  setTimeout(UI.setWindowSizing, 50);
});

/**
  Change theme
*/
$('#theme-select').change(function(){
  var chooser = $(this),
      theme = chooser.val();

  UI.setTheme(theme);
  Store.save('settings');
});

/**
  Change checkbox settings
*/
$('.settings input[type=checkbox]').change(function(){
  var checkbox = $(this),
      name = this.id.replace(/setting\-/, ''),
      feed = checkbox.data('feed');

  Store.settings[name] = checkbox.is(':checked');

  // You need to have at least one feed selected
  if (checkbox.attr('name') == 'image-feed' && $('.settings input[name=image-feed]:checked').length == 0) {
    alert('You need to have at least one image feed service selected');
    this.checked = true;
    return false;
  } else {
    Store.save('settings');
  }

  // Update feed
  if (checkbox.is('input[name=image-feed]') && !checkbox.checked) {
    Store.pruneImageList().then(function(){

      // Update current gif
      if (Store.settings[UI.currentGif.feed] === false) {
        UI.showRandomGif();
      }

      UI.buildHistory();
    });
  }

  return true;
});


/**
  Window resize
*/
$(window).resize(UI.setWindowSizing);

/**
  Set unloading variable
*/
$(window).bind('beforeunload', function() {
  UI.unloading = true;
});

})();