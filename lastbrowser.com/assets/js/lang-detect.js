/**
 * Lastbrowser Client-Side Language Router
 * Runs synchronously in <head> to prevent FOUC / layout shift
 */
(function() {
  try {
    var pathname = window.location.pathname;
    // Only auto-route when user lands on root or root index
    if (pathname !== '/' && pathname !== '/index.html') return;

    var stored = localStorage.getItem('preferred_lang');
    var supported = ['en', 'es', 'fr', 'it', 'pt', 'ja'];

    if (stored) {
      if (stored !== 'de' && supported.indexOf(stored) !== -1) {
        window.location.replace('/' + stored + '/');
      }
      return;
    }

    var navLang = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    if (supported.indexOf(navLang) !== -1) {
      localStorage.setItem('preferred_lang', navLang);
      window.location.replace('/' + navLang + '/');
    }
  } catch (e) {
    // Fail silently in strict privacy / storage-disabled contexts
  }
})();
