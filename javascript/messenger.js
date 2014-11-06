
/**
  Manages sending/receiving messages between windows
*/
(function(){

  window.Messenger = {

    init: function(){
      port = chrome.extension.connect({name: 'gif-tabs-messenger'});

      // Notify all listeners when a message comes in
      chrome.extension.onConnect.addListener(function(port) {
        port.onMessage.addListener(function(msg) {
          radio(msg.name).broadcast(msg.data);
        });
      });
    },

    /**
      Subscribe to an event

      @param {String} name The event name
      @param {Function} func The function you want called when this event is triggered
    */
    addListener: function(name, func) {
      radio(name).subscribe(func);
    },

    /**
      Broadcast a message to all windows

      @param {String} name The event name
      @param {Object} data Data to send with this event
    */
    send: function(name, data) {
      var port = chrome.extension.connect({name: 'gif-tabs-messenger'}),
          msg = {'name': name, 'data': data};
      port.postMessage(msg);
      radio(name).broadcast(data);
      console.log('Broadcast', msg);
    }
  }

  Messenger.init();
})();
