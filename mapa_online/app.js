(function () {
  const data = window.MAPA_APS_DATA || { summary: {}, layers: {} };
  const layers = {
    mcom: data.layers.mcom || [],
    uomMcom: data.layers.uomMcom || [],
    esfr: data.layers.esfr || [],
    ubsf: data.layers.ubsf || [],
    apoio: data.layers.apoio || [],
  };
  const state = { mcomFluvial: true, mcomTerrestre: true, uomMcom: false, esfr: false, ubsf: true, apoio: false, search: "", uf: "", type: "" };

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
    metricMcomFluvial: byId("metricMcomFluvial"),
    metricMcomTerrestre: byId("metricMcomTerrestre"),
    metricUomMcom: byId("metricUomMcom"),
    metricEsfr: byId("metricEsfr"),
    metricUbsf: byId("metricUbsf"),
    metricApoio: byId("metricApoio"),
    visibleCount: byId("visibleCount"),
    selectedCount: byId("selectedCount"),
    resultCount: byId("resultCount"),
    resultList: byId("resultList"),
    selectedBadge: byId("selectedBadge"),
    selectedContent: byId("selectedContent"),
    mcomFluvialToggle: byId("mcomFluvialToggle"),
    mcomTerrestreToggle: byId("mcomTerrestreToggle"),
    uomMcomToggle: byId("uomMcomToggle"),
    esfrToggle: byId("esfrToggle"),
    ubsfToggle: byId("ubsfToggle"),
    apoioToggle: byId("apoioToggle"),
    searchInput: byId("searchInput"),
    ufFilter: byId("ufFilter"),
    typeFilter: byId("typeFilter"),
    clearBtn: byId("clearBtn"),
    fitBtn: byId("fitBtn"),
  };

  els.metricMcomFluvial.textContent = fmt(countMcom("FLUVIAL"));
  els.metricMcomTerrestre.textContent = fmt(countMcom("TERRESTRE"));
  els.metricUomMcom.textContent = fmt(data.summary.uomAmazoniaMapped || data.summary.uomMcomMapped || layers.uomMcom.length);
  els.metricEsfr.textContent = fmt(data.summary.esfrMapped || layers.esfr.length);
  els.metricUbsf.textContent = fmt(data.summary.ubsfMapped || layers.ubsf.length);
  els.metricApoio.textContent = fmt(data.summary.apoioEstimated || layers.apoio.length);

  fillSelect(els.ufFilter, unique([...layers.mcom, ...layers.uomMcom, ...layers.esfr, ...layers.ubsf, ...layers.apoio].map((d) => d.uf)).sort());
  fillSelect(els.typeFilter, unique([...layers.mcom, ...layers.uomMcom, ...layers.esfr].map((d) => d.type)).sort());

  els.mcomFluvialToggle.addEventListener("change", () => { state.mcomFluvial = els.mcomFluvialToggle.checked; render(); });
  els.mcomTerrestreToggle.addEventListener("change", () => { state.mcomTerrestre = els.mcomTerrestreToggle.checked; render(); });
  els.uomMcomToggle.addEventListener("change", () => { state.uomMcom = els.uomMcomToggle.checked; render(); });
  els.esfrToggle.addEventListener("change", () => { state.esfr = els.esfrToggle.checked; render(); });
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
      ...(state.mcomFluvial ? layers.mcom.filter((item) => isMcomFluvial(item)) : []),
      ...(state.mcomTerrestre ? layers.mcom.filter((item) => isMcomTerrestre(item)) : []),
      ...(state.uomMcom ? layers.uomMcom : []),
      ...(state.esfr ? layers.esfr : []),
      ...(state.ubsf ? layers.ubsf : []),
      ...(state.apoio ? layers.apoio : []),
    ].filter((item) => {
      if (state.uf && item.uf !== state.uf) return false;
      if (state.type && !["mcom", "uomMcom", "esfr"].includes(item.layer)) return false;
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
        <div class="result-meta">
          <span>${esc(labelId(item))}</span>
          <span>${esc(item.municipio || "-")}/${esc(item.uf || "-")}</span>
          <span>${esc(shortType(item))}</span>
        </div>
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
    els.selectedBadge.textContent = badgeText(item);
    const rows = item.layer === "apoio"
      ? [["CNES UBSF", item.cnes], ["Endereço", item.endereco], ["UBSF", item.ubsf], ["Confiança", item.confianca]]
      : item.layer === "ubsf"
        ? [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Apoios", item.qtdApoio], ["Endereço", [item.logradouro, item.bairro, item.cep].filter(Boolean).join(", ")]]
        : item.layer === "uomMcom"
          ? [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Status", item.status], ["Fonte", item.fonte || "SCNES"]]
          : item.layer === "esfr"
            ? [["CNES", item.id], ["Tipo", item.type], ["Status", item.status]]
            : [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Tipo", item.type], ["Fibra", item.fibra], ["ERB", item.erb]];
    els.selectedContent.innerHTML = `<h3>${esc(item.name || "Sem nome")}</h3><dl>${rows.map(([a,b]) => `<dt>${esc(a)}</dt><dd>${esc(b || "-")}</dd>`).join("")}</dl>`;
  }

  function popup(item) {
    const title = esc(item.name || "Sem nome");
    const rows = item.layer === "apoio"
      ? [["CNES UBSF", item.cnes], ["Município", `${item.municipio}/${item.uf}`], ["Endereço", item.endereco], ["Uso", "estimado"]]
      : item.layer === "ubsf"
        ? [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Apoios", item.qtdApoio]]
        : item.layer === "uomMcom"
          ? [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Status", item.status], ["Fonte", item.fonte || "SCNES"]]
          : item.layer === "esfr"
            ? [["CNES", item.id], ["Tipo", item.type], ["Status", item.status]]
            : [["CNES", item.id], ["Município", `${item.municipio}/${item.uf}`], ["Tipo", item.type], ["Fibra", item.fibra || "-"]];
    return `<h3>${title}</h3><dl>${rows.map(([a,b]) => `<dt>${esc(a)}</dt><dd>${esc(b || "-")}</dd>`).join("")}</dl>`;
  }

  function iconFor(item) {
    const cls = item.layer === "apoio" ? "marker-apoio" : item.layer === "ubsf" ? "marker-ubsf" : item.layer === "uomMcom" ? "marker-uom-mcom" : item.layer === "esfr" ? "marker-esfr" : isMcomFluvial(item) ? "marker-mcom-fluvial" : "marker-mcom-terrestre";
    const size = item.layer === "apoio" || item.layer === "esfr" ? [10, 10] : [15, 15];
    const anchor = [size[0] / 2, size[1] / 2];
    return L.divIcon({ className: `marker-dot ${cls}`, html: "", iconSize: size, iconAnchor: anchor });
  }

  function fitAll() {
    const visible = getVisible();
    if (!visible.length) return;
    map.fitBounds(L.latLngBounds(visible.map((d) => [d.lat, d.lon])).pad(0.12), { maxZoom: 8 });
  }

  function colorClass(item) {
    return item.layer === "apoio" ? "orange" : item.layer === "ubsf" ? "green" : item.layer === "uomMcom" ? "red" : item.layer === "esfr" ? "teal" : isMcomFluvial(item) ? "blue" : "cyan";
  }
  function countMcom(kind) { return layers.mcom.filter((item) => normalize(item.type).includes(normalize(kind))).length; }
  function isMcomFluvial(item) { return item.layer === "mcom" && normalize(item.type).includes("fluvial"); }
  function isMcomTerrestre(item) { return item.layer === "mcom" && normalize(item.type).includes("terrestre"); }
  function badgeText(item) { return item.layer === "apoio" ? "Apoio" : item.layer === "ubsf" ? "UBSF" : item.layer === "uomMcom" ? "UOM Amazonia" : item.layer === "esfr" ? "eSFR" : isMcomFluvial(item) ? "MCom fluvial" : "MCom terrestre"; }
  function shortType(item) {
    if (item.layer === "mcom") return isMcomFluvial(item) ? "Fluvial" : "Terrestre";
    if (item.layer === "uomMcom") return "UOM Amazonia";
    if (item.layer === "esfr") return "eSFR";
    if (item.layer === "apoio") return "Apoio estimado";
    return "UBSF";
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
