(function () {
  var KEY = 'broker-ui-theme';

  function getMode() {
    try {
      return localStorage.getItem(KEY) || 'dark';
    } catch (e) {
      return 'dark';
    }
  }

  function effective(mode) {
    if (mode === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    }
    return mode === 'light' ? 'light' : 'dark';
  }

  function apply() {
    document.documentElement.setAttribute('data-theme', effective(getMode()));
  }

  function detachMq() {
    if (window._brokerThemeMq && window._brokerThemeMqHandler) {
      window._brokerThemeMq.removeEventListener('change', window._brokerThemeMqHandler);
      window._brokerThemeMqHandler = null;
      window._brokerThemeMq = null;
    }
  }

  function attachMqIfNeeded() {
    detachMq();
    if (getMode() !== 'system' || !window.matchMedia) return;
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    window._brokerThemeMq = mq;
    window._brokerThemeMqHandler = apply;
    mq.addEventListener('change', apply);
  }

  window.BrokerTheme = {
    getMode: getMode,
    setMode: function (mode) {
      try {
        localStorage.setItem(KEY, mode);
      } catch {
        /* storage blocked */
      }
      detachMq();
      apply();
      attachMqIfNeeded();
    },
    apply: apply
  };

  apply();
  attachMqIfNeeded();
})();
