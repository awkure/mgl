try {
  var t = localStorage.getItem("my-game-library.theme.v1");
  if (t === "light" || t === "dark" || t === "glass") {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t === "light" ? "light" : "dark";
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) {
      if (t === "light") m.setAttribute("content", "#f2f3f5");
      else if (t === "glass") m.setAttribute("content", "#0c0d10");
    }
  }
} catch (e) {}
