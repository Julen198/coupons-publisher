// Embeddable widget: <script src="https://…/widget.js" data-client="x" data-store="y" async></script>
// Inserts the public coupon page in an iframe right where the script tag is, auto-sized to its content.
const WIDGET = `(function () {
  var s = document.currentScript;
  if (!s) return;
  var client = s.getAttribute('data-client'), store = s.getAttribute('data-store');
  if (!client || !store) return;
  var origin = new URL(s.src).origin;
  var f = document.createElement('iframe');
  f.src = origin + '/p/' + encodeURIComponent(client) + '/' + encodeURIComponent(store) + '?o=widget';
  f.title = 'Cupones ' + store;
  f.loading = 'lazy';
  f.style.cssText = 'width:100%;border:0;display:block;min-height:480px';
  s.parentNode.insertBefore(f, s.nextSibling);
  window.addEventListener('message', function (e) {
    if (e.source === f.contentWindow && e.origin === origin && e.data && e.data.cpHeight) f.style.height = e.data.cpHeight + 'px';
  });
})();`;

export function GET() {
  return new Response(WIDGET, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
