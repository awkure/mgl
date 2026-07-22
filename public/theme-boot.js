try {
  var t = localStorage.getItem("my-game-library.theme.v1");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t === "light" ? "light" : "dark";
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && t === "light") m.setAttribute("content", "#f2f3f5");
  }
} catch (e) { }

/* Block browser pinch-zoom on iOS/iPad Safari (viewport user-scalable often ignored). */
(function () {
  function blockGesture(event) {
    event.preventDefault();
  }
  document.addEventListener("gesturestart", blockGesture, { passive: false });
  document.addEventListener("gesturechange", blockGesture, { passive: false });
})();
