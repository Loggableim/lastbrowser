/**
 * Lastbrowser Theme Switcher
 * Supports Dark/Light mode with persistence in localStorage
 */
(function() {
  function getPreferredTheme() {
    var stored = localStorage.getItem('theme');
    if (stored) return stored;
    return 'dark'; // Default to dark cyberpunk brand theme
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var toggles = document.querySelectorAll('.theme-toggle');
    toggles.forEach(function(btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln');
      btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    });
  }

  var currentTheme = getPreferredTheme();
  applyTheme(currentTheme);

  window.toggleTheme = function() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
  };

  document.addEventListener('DOMContentLoaded', function() {
    applyTheme(currentTheme);
  });
})();
