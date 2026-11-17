/**
 * Product rotator — cycles through every published link across all categories.
 * Reads /data/links.json and swaps the featured product every 7–10 seconds.
 */
(function () {
  var HOST = document.getElementById("rotator");
  if (!HOST) return;

  var MIN_MS = 7000;
  var MAX_MS = 10000;
  var state = { pool: [], idx: 0, seen: {}, timer: null };

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function render(link) {
    var img = link.image
      ? '<img src="' + link.image + '" alt="" loading="lazy" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:.5rem">'
      : '<div style="width:100%;height:140px;background:#0f0f0f;border-radius:8px;margin-bottom:.5rem;display:flex;align-items:center;justify-content:center;color:#444;font-size:.8em">' + (link.category || "Product") + '</div>';

    var safeName = (link.name || "").replace(/[<>]/g, "");
    var safeNote = (link.note || "").replace(/[<>]/g, "");

    HOST.innerHTML =
      '<a href="' + link.url + '" target="_blank" rel="noopener sponsored" data-rotator-id="' + link.id + '"' +
      ' style="display:block;text-decoration:none;color:inherit;padding:1rem;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;transition:border-color .2s">' +
        img +
        '<strong style="color:#f7931a;display:block;font-size:.95em;line-height:1.25">' + safeName + '</strong>' +
        '<span style="color:#888;font-size:.78em;display:block;margin-top:.15rem;min-height:1em">' + safeNote + '</span>' +
        '<span style="color:#555;font-size:.7em;display:block;margin-top:.5rem">Tap to open · ' + (link.category || "") + '</span>' +
      '</a>';
  }

  function next() {
    if (!state.pool.length) return;
    var link = state.pool[state.idx % state.pool.length];
    state.idx += 1;
    render(link);

    // Reset the pool when we've shown everything once
    if (state.idx % state.pool.length === 0) {
      state.pool = shuffle(state.pool);
      state.idx = 0;
    }

    // Randomize the next interval
    var delay = MIN_MS + Math.random() * (MAX_MS - MIN_MS);
    clearTimeout(state.timer);
    state.timer = setTimeout(next, delay);
  }

  fetch("/data/links.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var pool = [];
      (data.categories || []).forEach(function (cat) {
        (cat.links || []).forEach(function (l) {
          if (l.published !== false) {
            pool.push({
              id: l.id,
              name: l.name,
              url: l.url,
              note: l.note || "",
              image: l.image || "",
              category: cat.title
            });
          }
        });
      });

      if (!pool.length) {
        HOST.innerHTML = '<p style="color:#666;font-size:.85em">No published products yet.</p>';
        return;
      }

      state.pool = shuffle(pool);
      next();
    })
    .catch(function () {
      HOST.innerHTML = '<p style="color:#666;font-size:.85em">Rotator unavailable.</p>';
    });

  // Pause rotation while the tab is hidden (saves battery)
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      clearTimeout(state.timer);
    } else if (state.pool.length) {
      var delay = MIN_MS + Math.random() * (MAX_MS - MIN_MS);
      clearTimeout(state.timer);
      state.timer = setTimeout(next, delay);
    }
  });
})();
