(function () {
  const root = document.documentElement;
  const toggle = document.querySelector(".theme-toggle");
  const storageKey = "theme";

  function getTheme() {
    return root.dataset.theme === "light" ? "light" : "dark";
  }

  function setTheme(theme, shouldPersist) {
    const nextTheme = theme === "light" ? "light" : "dark";

    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;

    if (toggle) {
      toggle.setAttribute("aria-pressed", String(nextTheme === "light"));
      toggle.setAttribute(
        "aria-label",
        nextTheme === "light" ? "Switch to dark theme" : "Switch to light theme"
      );
    }

    if (shouldPersist) {
      try {
        localStorage.setItem(storageKey, nextTheme);
      } catch (error) {
        // Ignore storage failures in restricted browser contexts.
      }
    }
  }

  if (toggle) {
    setTheme(getTheme(), false);

    toggle.addEventListener("click", function () {
      setTheme(getTheme() === "light" ? "dark" : "light", true);
    });
  }
})();