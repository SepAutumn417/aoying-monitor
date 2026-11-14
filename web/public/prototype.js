// Local presentation behavior only: no network calls or Telegram integration.
function revealTarget(hash) {
  if (!hash || hash === '#') return;
  const target = document.getElementById(decodeURIComponent(hash.slice(1)));
  if (!target) return;
  if (target.tagName === 'DETAILS') target.open = true;
  let parent = target.parentElement;
  while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
}
document.addEventListener('click', function (event) {
  const link = event.target.closest('a[href^="#"]');
  if (link) revealTarget(link.getAttribute('href'));
});
window.addEventListener('DOMContentLoaded', function () {
  if (window.location.hash) { revealTarget(window.location.hash); return; }
  const pane = document.querySelector('.message-scroll');
  const unread = document.querySelector('.unread-divider');
  if (pane && unread && window.matchMedia('(min-width:701px)').matches) {
    pane.scrollTop = unread.offsetTop - pane.getBoundingClientRect().top + pane.scrollTop - 24;
  }
});
