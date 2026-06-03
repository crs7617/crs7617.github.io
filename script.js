(function () {
  const root = document.documentElement;
  const toggle = document.querySelector(".theme-toggle");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  const storageKey = "theme";
  const statsCacheKey = "github-stats-v1";
  const statsTtl = 6 * 60 * 60 * 1000;
  const userUrl = "https://api.github.com/users/crs7617";
  const reposUrl = "https://api.github.com/users/crs7617/repos?per_page=100&page=";
  const themeColors = {
    dark: "#0d0e11",
    light: "#f4f1eb",
  };

  const statsStatus = document.querySelector("[data-stats-status]");
  const statValueNodes = {
    repos: document.querySelector('[data-stat-value="repos"]'),
    stars: document.querySelector('[data-stat-value="stars"]'),
    followers: document.querySelector('[data-stat-value="followers"]'),
  };
  const languageChart = document.querySelector("[data-language-chart]");

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // Ignore storage failures in restricted browser contexts.
    }
  }

  function getTheme() {
    return root.dataset.theme === "light" ? "light" : "dark";
  }

  function setTheme(theme, shouldPersist) {
    const nextTheme = theme === "light" ? "light" : "dark";

    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;

    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", themeColors[nextTheme]);
    }

    if (toggle) {
      toggle.setAttribute("aria-pressed", String(nextTheme === "light"));
      toggle.setAttribute("aria-label", nextTheme === "light" ? "Switch to dark theme" : "Switch to light theme");
    }

    if (shouldPersist) {
      safeStorageSet(storageKey, nextTheme);
    }
  }

  function setStatus(message, isError) {
    if (!statsStatus) {
      return;
    }

    statsStatus.textContent = message;
    statsStatus.dataset.state = isError ? "error" : "ready";
  }

  function renderStats(statData) {
    if (statValueNodes.repos) {
      statValueNodes.repos.textContent = String(statData.repos);
    }

    if (statValueNodes.stars) {
      statValueNodes.stars.textContent = String(statData.stars);
    }

    if (statValueNodes.followers) {
      statValueNodes.followers.textContent = String(statData.followers);
    }

    if (!languageChart) {
      return;
    }

    languageChart.innerHTML = "";

    if (!statData.languages.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "chart-placeholder";
      emptyMessage.textContent = "No language data available yet.";
      languageChart.appendChild(emptyMessage);
      return;
    }

    statData.languages.forEach(function (entry) {
      const row = document.createElement("div");
      row.className = "language-row";

      const name = document.createElement("span");
      name.className = "language-name";
      name.textContent = entry.name;

      const track = document.createElement("div");
      track.className = "language-track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", `${entry.name} usage`);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(entry.percent));

      const fill = document.createElement("div");
      fill.className = "language-fill";
      fill.style.width = `${Math.max(entry.percent, 4)}%`;
      track.appendChild(fill);

      const percent = document.createElement("span");
      percent.className = "language-percent";
      percent.textContent = `${entry.percent}%`;

      row.append(name, track, percent);
      languageChart.appendChild(row);
    });
  }

  function readCachedStats() {
    const cachedValue = safeStorageGet(statsCacheKey);

    if (!cachedValue) {
      return null;
    }

    try {
      return JSON.parse(cachedValue);
    } catch (error) {
      return null;
    }
  }

  function writeCachedStats(payload) {
    safeStorageSet(statsCacheKey, JSON.stringify(payload));
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub request failed with ${response.status}`);
    }

    return response.json();
  }

  async function fetchAllRepos() {
    const repos = [];
    let page = 1;

    while (page <= 10) {
      const batch = await fetchJson(`${reposUrl}${page}`);
      repos.push(...batch);

      if (batch.length < 100) {
        break;
      }

      page += 1;
    }

    return repos;
  }

  function buildStats(userData, repos) {
    const totalStars = repos.reduce(function (sum, repo) {
      return sum + (repo.stargazers_count || 0);
    }, 0);

    const languageCounts = new Map();

    repos.forEach(function (repo) {
      if (!repo.language) {
        return;
      }

      languageCounts.set(repo.language, (languageCounts.get(repo.language) || 0) + 1);
    });

    const languageEntries = Array.from(languageCounts.entries())
      .map(function ([name, count]) {
        return { name, count };
      })
      .sort(function (left, right) {
        return right.count - left.count;
      });

    const chartSlice = languageEntries.slice(0, 4);
    const chartTotal = chartSlice.reduce(function (sum, entry) {
      return sum + entry.count;
    }, 0);

    return {
      repos: typeof userData.public_repos === "number" ? userData.public_repos : repos.length,
      stars: totalStars,
      followers: typeof userData.followers === "number" ? userData.followers : 0,
      languages: chartSlice
        .map(function (entry) {
          return {
            name: entry.name,
            percent: chartTotal ? Math.max(1, Math.round((entry.count / chartTotal) * 100)) : 0,
          };
        })
        .filter(function (entry) {
          return entry.percent > 0;
        }),
    };
  }

  async function loadGitHubStats() {
    const cached = readCachedStats();
    const isFresh = cached && typeof cached.timestamp === "number" && Date.now() - cached.timestamp < statsTtl;

    if (isFresh && cached.data) {
      renderStats(cached.data);
      setStatus("Showing cached GitHub stats.", false);
      return;
    }

    setStatus("Loading live GitHub stats…", false);

    try {
      const [userData, repos] = await Promise.all([fetchJson(userUrl), fetchAllRepos()]);
      const statData = buildStats(userData, repos);

      renderStats(statData);
      writeCachedStats({ timestamp: Date.now(), data: statData });
      setStatus("Live GitHub stats loaded.", false);
    } catch (error) {
      if (cached && cached.data) {
        renderStats(cached.data);
        setStatus("GitHub API unavailable right now, so cached stats are being shown.", true);
        return;
      }

      if (statsStatus) {
        statsStatus.textContent = "GitHub stats are unavailable right now. Try again later.";
        statsStatus.dataset.state = "error";
      }

      if (languageChart) {
        languageChart.innerHTML = "";
        const fallback = document.createElement("p");
        fallback.className = "chart-placeholder";
        fallback.textContent = "Unable to load GitHub language data at the moment.";
        languageChart.appendChild(fallback);
      }
    }
  }

  if (toggle) {
    setTheme(getTheme(), false);

    toggle.addEventListener("click", function () {
      setTheme(getTheme() === "light" ? "dark" : "light", true);
    });
  }

  loadGitHubStats();
})();