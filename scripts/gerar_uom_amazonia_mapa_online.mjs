import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const sourcePath = path.join(root, "UOMESTABELECIMENTOS.csv");
const filtroPath = path.join(root, "base_filtro.csv");
const dataPath = path.join(root, "mapa_online", "data", "map-data.js");
const filteredCsvPath = path.join(root, "Localizacao_uom_amazonia_legal.csv");

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  const [headers, ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function asNumber(value) {
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function cnes(value) {
  return String(value || "").replace(/\D/g, "").padStart(7, "0");
}

function byUf(items) {
  return items.reduce((acc, item) => {
    acc[item.uf] = (acc[item.uf] || 0) + 1;
    return acc;
  }, {});
}

const uomRows = parseCsv(fs.readFileSync(sourcePath, "utf8"), ",");
const filtroRows = parseCsv(fs.readFileSync(filtroPath, "utf8"), ";");

const amazoniaIbge = new Set(
  filtroRows
    .filter((row) => String(row.AMAZONIA_LEGAL || "").toUpperCase() === "SIM")
    .flatMap((row) => [row.IBGE, row.IBGE_TEXTO])
    .filter(Boolean)
    .map(String),
);

const uomAmazonia = uomRows
  .filter((row) => amazoniaIbge.has(String(row.CO_MUNICIPIO_IBGE)))
  .map((row) => {
    const lat = asNumber(row.LATITUDE);
    const lon = asNumber(row.LONGITUDE);
    return {
      layer: "uomMcom",
      id: cnes(row.CO_CNES),
      cnes: cnes(row.CO_CNES),
      lat,
      lon,
      uf: row.UF || "",
      municipio: row.MUNICIPIO || "",
      name: row.NOME_UNIDADE || `UOM CNES ${cnes(row.CO_CNES)}`,
      type: "UOM Amazonia Legal - localizacao SCNES",
      status: row.SITUACAO_REGISTRO || "",
      competencia: row.COMPETENCIA_CNES || "",
      municipioIbge: row.CO_MUNICIPIO_IBGE || "",
      amazoniaLegal: "SIM",
      fonte: "UOMESTABELECIMENTOS.csv",
    };
  })
  .filter((row) => row.lat !== null && row.lon !== null)
  .sort((a, b) => a.uf.localeCompare(b.uf) || a.municipio.localeCompare(b.municipio) || a.id.localeCompare(b.id));

const csvHeaders = [
  "CO_CNES",
  "NOME_UNIDADE",
  "UF",
  "CO_MUNICIPIO_IBGE",
  "MUNICIPIO",
  "LATITUDE",
  "LONGITUDE",
  "COMPETENCIA_CNES",
  "SITUACAO_REGISTRO",
  "AMAZONIA_LEGAL",
];
const filteredCsv = [
  csvHeaders.join(","),
  ...uomAmazonia.map((row) =>
    [
      row.cnes,
      row.name,
      row.uf,
      row.municipioIbge,
      row.municipio,
      row.lat,
      row.lon,
      row.competencia,
      row.status,
      row.amazoniaLegal,
    ].map(csvEscape).join(","),
  ),
].join("\n");
fs.writeFileSync(filteredCsvPath, `${filteredCsv}\n`, "utf8");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(dataPath, "utf8"), sandbox);
const data = sandbox.window.MAPA_APS_DATA;
data.summary.uomMcomTotal = uomAmazonia.length;
data.summary.uomMcomMapped = uomAmazonia.length;
data.summary.uomMcomByUf = byUf(uomAmazonia);
data.summary.uomAmazoniaTotal = uomAmazonia.length;
data.summary.uomAmazoniaMapped = uomAmazonia.length;
data.summary.uomAmazoniaByUf = byUf(uomAmazonia);
data.summary.uomAmazoniaSource = "UOMESTABELECIMENTOS.csv";
data.layers.uomMcom = uomAmazonia;

const output = `window.MAPA_APS_DATA = ${JSON.stringify(data, null, 2)};\n`;
fs.writeFileSync(dataPath, output, "utf8");

console.log(JSON.stringify({
  fonteTotal: uomRows.length,
  amazoniaLegal: uomAmazonia.length,
  porUf: byUf(uomAmazonia),
  saidaCsv: path.basename(filteredCsvPath),
}, null, 2));
