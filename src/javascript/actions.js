
import Gifs from './gifs';
import Config from './config';

import $ from 'jquery';

const UI_NEXT = 1;
const UI_PREV = -1;

/**
 * Define all the browser event handlers and actions.
 */
export default function initBrowserActions() {

  var errorCount = 0;

  /**
    Toggle favorites
  */
  $('.main .make-favorite').click(function(evt){
    $(this).addClass('clicked');

    Gifs.isFavorite(UI.currentGif.id).then(function(isFav){
      if (isFav) {
        Gifs.removeFavorite(UI.currentGif);
      } else {
        Gifs.addToFavorites(UI.currentGif);
      }
    });
  });
  $('.main .make-favorite').mouseover(function(){

    // Already processed
    if ($(this).is('.clicked')) {
      return false;
    }

    if (UI.isFavorite()) {
      this.title = "Remove from favorites";
    } else {
      this.title = "Add to favorites";
    }
  });
  $('.main .make-favorite').mouseout(function(){
    $(this).removeClass('clicked');
  });

  /**
   Clicking image in list loads the image
  */
  $('section.history, section.favorites').click(function(evt){
    var target = $(evt.target),
        store = ($(this).is('.history')) ? 'history' : 'favorites',
        id;

    if (target.is('img')) {
      id = target.attr('data-id');
      Gifs.getByID(id).then(function(gif){
        UI.showGif(gif);
        UI.updateHistorySelection();
      });
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
      UI.historyIncrement(UI_PREV);
    } else if (target.is('.arrow.right')) {
      UI.historyIncrement(UI_NEXT);
    }

    return false;
  });

  /**
    Loaded successfully
  */
  $('a.image img, a.image video').on('load', function(el){
    errorCount = 0;
    setTimeout(() => {
      UI.setWindowSizing();
    }, 100);
  });

  /**
    Change theme
  */
  $('#theme-select').change(function(){
    var chooser = $(this),
        theme = chooser.val();

    UI.setTheme(theme);
  });

  /**
    Change checkbox settings
  */
  $('.settings input[type=checkbox]').change(function(){
    var checkbox = $(this),
        name = this.id.replace(/setting\-/, '');

    // You need to have at least one feed selected
    if (checkbox.attr('name') === 'image-feed' && $('.settings input[name=image-feed]:checked').length === 0) {
      alert('You need to have at least one image feed service selected');
      this.checked = true;
      return false;
    } else {
      Config.set('settings.'+ name, checkbox.is(':checked'));
    }

    // Update feed
    if (checkbox.is('input[name=image-feed]') && !checkbox.is(':checked')) {
      Gifs.removeGifsByFeed(checkbox.val()).then(function(){

        // Update current gif
        if (Config.settings[UI.currentGif.feed] === false) {
          UI.showRandomGif();
        }
      });
    } else {
      Gifs.loadNewGifs(true);
    }

    return true;
  });

  /**
    Force reload all feeds
  */
  $('.settings .reload button').click(function(){
    Gifs.loadNewGifs(true).then(UI.showRandomGif.bind(UI));
    return false;
  });

  /**
    Keyboard handlers
  */
  $(document).keydown(function(evt){
    var ARROW_LEFT = 37,
        ARROW_RIGHT = 39;

    switch (evt.which) {
      case ARROW_LEFT:
        UI.historyIncrement(UI_PREV);
      break;
      case ARROW_RIGHT:
        UI.historyIncrement(UI_NEXT);
      break;
    }
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

}
