(function () {
  function preferred() {
    try { var saved = localStorage.getItem('aoying-theme'); if (saved === 'dark' || saved === 'light') return saved; } catch (_) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
      var label = button.querySelector('[data-theme-label]');
      if (label) label.textContent = theme === 'dark' ? '浅色' : '深色';
    });
  }
  apply(preferred());
  document.addEventListener('DOMContentLoaded', function () {
    apply(document.documentElement.dataset.theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        apply(next);
        try { localStorage.setItem('aoying-theme', next); } catch (_) {}
      });
    });
  });
})();
