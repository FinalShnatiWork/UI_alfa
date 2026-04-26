/**
 * Apply user color preferences on every page load.
 * This script runs inline before the page renders to avoid color flash.
 */
(function () {
  const color = localStorage.getItem('pref_accent_color');
  if (color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-strong', color + 'CC');
  }
})();
