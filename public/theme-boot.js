try {
  var t = localStorage.getItem("my-game-library.theme.v1");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t === "light" ? "light" : "dark";
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && t === "light") m.setAttribute("content", "#f2f3f5");
  }
} catch (e) { }

/* Block browser pinch-zoom on iOS/iPad Safari (viewport user-scalable ignored). */
(function () {
  function blockGesture(event) {
    event.preventDefault();
  }
  function blockPinchTouch(event) {
    if (event.touches.length < 2) return;
    /* Lightbox uses its own pinch via Pointer Events + touch-action: none. */
    if (event.target && event.target.closest && event.target.closest(".image-lightbox__stage")) return;
    event.preventDefault();
  }
  document.addEventListener("gesturestart", blockGesture, { passive: false });
  document.addEventListener("gesturechange", blockGesture, { passive: false });
  document.addEventListener("touchmove", blockPinchTouch, { passive: false });
})();
