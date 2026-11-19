(function(){
  var HOST = document.getElementById("category-hub");
  if(!HOST) return;
  var wanted = (HOST.dataset.cats || "").split(",").map(function(s){return s.trim();});
  fetch("/data/links.json")
    .then(function(r){return r.json();})
    .then(function(data){
      var html = "";
      (data.categories || []).forEach(function(cat){
        if(wanted.length && wanted.indexOf(cat.title) === -1) return;
        var links = (cat.links || []).filter(function(l){return l.published !== false;});
        if(!links.length) return;
        html += '<section class="cat-section"><h2>'+cat.title+'</h2><div class="grid">';
        links.forEach(function(l){
          var img = l.image ? '<img src="'+l.image+'" alt="" loading="lazy" class="card-img">' : '<div class="card-img card-img-placeholder">'+cat.title.charAt(0)+'</div>';
          html += '<a class="card" href="'+l.url+'" target="_blank" rel="noopener sponsored">'+img+'<strong>'+l.name+'</strong><span>'+(l.note || "")+'</span></a>';
        });
        html += '</div></section>';
      });
      HOST.innerHTML = html || '<p class="muted">No published items in this category yet.</p>';
    })
    .catch(function(){HOST.innerHTML='<p class="muted">Could not load items.</p>';});
})();
