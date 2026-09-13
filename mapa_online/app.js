(function () {
  const data = window.MAPA_APS_DATA || { summary: {}, layers: {} };
  const layers = {
    mcom: data.layers.mcom || [],
    ubsf: data.layers.ubsf || [],
    apoio: data.layers.apoio || [],
  };
  const state = { mcom: true, ubsf: true, apoio: false, search: "", uf: "", type: "" };

  const map = L.map("map", { zoomControl: false }).setView([-9.5, -55], 4);
  L.control.zoom({ position: "topright" }).addTo(map);
  const baseLayers = [
    {
      url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
      options: {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    {
      url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
      options: {
        subdomains: "abc",
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team',
      },
    },
  ];
  addBaseLayer(0);

  const cluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 42,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
  }).addTo(map);
  const markerIndex = new Map();

  const els = {
    metricMcom: byId("metricMcom"),
    metricUbsf: byId("metricUbsf"),
    metricApoio: byId("metricApoio"),
    visibleCount: byId("visibleCount"),
    selectedCount: byId("selectedCount"),
    resultCount: byId("resultCount"),
    resultList: byId("resultList"),
    selectedBadge: byId("selectedBadge"),
    selectedContent: byId("selectedContent"),
    mcomToggle: byId("mcomToggle"),
    ubsfToggle: byId("ubsfToggle"),
    apoioToggle: byId("apoioToggle"),
    searchInput: byId("searchInput"),
    ufFilter: byId("ufFilter"),
    typeFilter: byId("typeFilter"),
    clearBtn: byId("clearBtn"),
    fitBtn: byId("fitBtn"),
  };

  els.metricMcom.textContent = fmt(data.summary.mcomMapped || layers.mcom.length);
  els.metricUbsf.textContent = fmt(data.summary.ubsfMapped || layers.ubsf.length);
  els.metricApoio.textContent = fmt(data.summary.apoioEstimated || layers.apoio.length);

  fillSelect(els.ufFilter, unique([...layers.mcom, ...layers.ubsf, ...layers.apoio].map((d) => d.uf)).sort());
  fillSelect(els.typeFilter, unique(layers.mcom.map((d) => d.type)).sort());

  els.mcomToggle.addEventListener("change", () => { state.mcom = els.mcomToggle.checked; render(); });
  els.ubsfToggle.addEventListener("change", () => { state.ubsf = els.ubsfToggle.checked; render(); });
  els.apoioToggle.addEventListener("change", () => { state.apoio = els.apoioToggle.checked; render(); });
  els.searchInput.addEventListener("input", () => { state.search = normalize(els.searchInput.value); render(); });
  els.ufFilter.addEventListener("change", () => { state.uf = els.ufFilter.value; render(); });
  els.typeFilter.addEventListener("change", () => { state.type = els.typeFilter.value; render(); });
  els.clearBtn.addEventListener("click", () => {
    state.search = ""; state.uf = ""; state.type = "";
    els.searchInput.value = ""; els.ufFilter.value = ""; els.typeFilter.value = "";
    render();
  });
  els.fitBtn.addEventListener("click", fitAll);

  render();
  fitAll();

  function render() {
    cluster.clearLayers();
    markerIndex.clear();
    const visible = getVisible();
    const markers = visible.map((item) => {
      const marker = L.marker([item.lat, item.lon], { icon: iconFor(item) }).bindPopup(popup(item));
      marker.on("click", () => showSelected(item));
      markerIndex.set(key(item), marker);
      return marker;
    });
    cluster.addLayers(markers);
    els.visibleCount.textContent = fmt(visible.length);
    els.selectedCount.textContent = fmt(visible.length);
    els.resultCount.textContent = fmt(visible.length);
    renderResults(visible);
  }

  function addBaseLayer(index) {
    const base = baseLayers[index];
    const tileLayer = L.tileLayer(base.url, base.options).addTo(map);
    if (baseLayers[index + 1]) {
      tileLayer.once("tileerror", () => {
        map.removeLayer(tileLayer);
        addBaseLayer(index + 1);
      });
    }
  }

  function getVisible() {
    return [
      ...(state.mcom ? layers.mcom : []),
      ...(state.ubsf ? layers.ubsf : []),
      ...(state.apoio ? layers.apoio : []),
    ].filter((item) => {
      if (state.uf && item.uf !== state.uf) return false;
      if (state.type && item.layer !== "mcom") return false;
      if (state.type && item.type !== state.type) return false;
      if (!state.search) return true;
      const text = normalize([item.id, item.cnes, item.name, item.municipio, item.uf, item.type, item.endereco, item.ubsf].join(" "));
      return text.includes(state.search);
    });
  }

  function renderResults(items) {
    els.resultList.innerHTML = "";
    items.slice(0, 160).forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result-item";
      btn.innerHTML = `
        <div class="result-title"><i class="dot ${colorClass(item)}"></i><span>${esc(item.name || "Sem nome")}</span></div>
        <div class="result-meta">${esc(labelId(item))} · ${esc(item.municipio || "-")}/${esc(item.uf || "-")}<br>${esc(item.type || "")}</div>
      `;
      btn.addEventListener("click", () => {
        showSelected(item);
        const marker = markerIndex.get(key(item));
        if (marker) {
          map.setView([item.lat, item.lon], Math.max(map.getZoom(), 9));
          marker.openPopup();
        }
      });
      els.resultList.appendChild(btn);
    });
  }

  function showSelected(item) {
    els.selectedBadge.textContent = item.layer === "apoio" ? "Apoio" : item.layer === "ubsf" ? "UBSF" : "MCom";
    const rows = item.layer === "apoio"
      ? [["CNES UBSF", item.cnes], ["Endereço", item.endereco], ["UBSF", item.ubsf], ["Confiança", item.confianca]]
      : item.layer === "ubsf"
        ? [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Apoios", item.qtdApoio], ["Endereço", [item.logradouro, item.bairro, item.cep].filter(Boolean).join(", ")]]
        : [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Tipo", item.type], ["Fibra", item.fibra], ["ERB", item.erb]];
    els.selectedContent.innerHTML = `<h3>${esc(item.name || "Sem nome")}</h3><dl>${rows.map(([a,b]) => `<dt>${esc(a)}</dt><dd>${esc(b || "-")}</dd>`).join("")}</dl>`;
  }

  function popup(item) {
    const title = esc(item.name || "Sem nome");
    const rows = item.layer === "apoio"
      ? [["CNES UBSF", item.cnes], ["Município", `${item.municipio}/${item.uf}`], ["Endereço", item.endereco], ["Uso", "estimado"]]
      : item.layer === "ubsf"
        ? [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Apoios", item.qtdApoio]]
        : [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Tipo", item.type], ["Fibra", item.fibra || "-"]];
    return `<h3>${title}</h3><dl>${rows.map(([a,b]) => `<dt>${esc(a)}</dt><dd>${esc(b || "-")}</dd>`).join("")}</dl>`;
  }

  function iconFor(item) {
    const cls = item.layer === "apoio" ? "marker-apoio" : item.layer === "ubsf" ? "marker-ubsf" : "marker-mcom";
    const size = item.layer === "apoio" ? [10, 10] : [15, 15];
    const anchor = [size[0] / 2, size[1] / 2];
    return L.divIcon({ className: `marker-dot ${cls}`, html: "", iconSize: size, iconAnchor: anchor });
  }

  function fitAll() {
    const visible = getVisible();
    if (!visible.length) return;
    map.fitBounds(L.latLngBounds(visible.map((d) => [d.lat, d.lon])).pad(0.12), { maxZoom: 8 });
  }

  function colorClass(item) {
    return item.layer === "apoio" ? "orange" : item.layer === "ubsf" ? "green" : "blue";
  }
  function labelId(item) { return item.layer === "apoio" ? `Apoio ${item.id}` : `CNES ${item.id}`; }
  function byId(id) { return document.getElementById(id); }
  function unique(values) { return Array.from(new Set(values.filter(Boolean))); }
  function fillSelect(select, values) { values.forEach((value) => { const o = document.createElement("option"); o.value = value; o.textContent = value; select.appendChild(o); }); }
  function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
  function fmt(value) { return Number(value || 0).toLocaleString("pt-BR"); }
  function key(item) { return `${item.layer}:${item.id}`; }
  function esc(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
})();
