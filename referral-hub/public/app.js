(function () {
  var HOST = document.getElementById("hub");
  if (!HOST) return;
  fetch("/data/links.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var html = "";
      (data.categories || []).forEach(function (cat) {
        var links = (cat.links || []).filter(function (l) { return l.published !== false; });
        if (!links.length) return;
        html += '<section class="cat-section"><h2>' + cat.title + '</h2><div class="grid">';
        links.forEach(function (l) {
          var img = l.image
            ? '<img src="' + l.image + '" alt="" loading="lazy" class="card-img">'
            : '<div class="card-img card-img-placeholder">' + cat.title.charAt(0) + '</div>';
          html += '<a class="card" href="' + l.url + '" target="_blank" rel="noopener sponsored">' +
                  img + '<strong>' + l.name + '</strong><span>' + (l.note || "") + '</span></a>';
        });
        html += '</div></section>';
      });
      HOST.innerHTML = html;
    })
    .catch(function () { HOST.innerHTML = '<p class="muted">Could not load items.</p>'; });
})();
