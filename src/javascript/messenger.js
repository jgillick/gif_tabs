
import radio from 'radio';

/**
  Manages sending/receiving messages between windows
*/
class Messenger {

  constructor() {
    const port = chrome.extension.connect({name: 'gif-tabs-messenger'});

    // Notify all listeners when a message comes in
    chrome.extension.onConnect.addListener((port) => {
      port.onMessage.addListener((msg) => {
        radio(msg.name).broadcast(msg.data);
      });
    });
  }

  /**
    Subscribe to an event

    @param {String} name The event name
    @param {Function} func The function you want called when this event is triggered
  */
  addListener(name, func) {
    radio(name).subscribe(func);
  }

  /**
    Broadcast a message to all windows

    @param {String} name The event name
    @param {Object} data Data to send with this event
  */
  send(name, data) {
    try {
      const port = chrome.extension.connect({name: 'gif-tabs-messenger'});
      port.postMessage({
        name,
        data
      });
      radio(name).broadcast(data);
    } catch(e) { console.log('Send err', e); }
  }
}
export default new Messenger();
