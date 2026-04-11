(function () {
  /* Must match src/js/lib/i18n.js LANG_KEY and supported codes */
  var KEY = 'broker-ui-lang';
  var ALLOWED = { en: 1, ru: 1, he: 1 };

  function getLang() {
    try {
      var v = localStorage.getItem(KEY) || 'en';
      return ALLOWED[v] ? v : 'en';
    } catch (e) {
      return 'en';
    }
  }

  var lang = getLang();
  document.documentElement.lang = lang === 'he' ? 'he' : lang === 'ru' ? 'ru' : 'en';
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
})();
