/* global L */
"use strict";
// Demo uses deliberately synthetic geometry, with no claims about real hazards/prices.
const center = [35.5074, 139.6176];
const d = 0.0012;
const demo = {
  meta: {mode: "mock", query: {lat: center[0], lon: center[1], target_apis: [3,5,26]},
    note: "Synthetic geometry; not Japanese government observations"},
  geojson: {type: "FeatureCollection", features: [
    {type: "Feature", geometry: {type: "Point", coordinates: [center[1],center[0]]},
      properties: {name: "架空の地価ポイント", api_id: 3, mock: true}},
    {type: "Feature", geometry: {type: "Polygon", coordinates: [[
      [center[1]-d,center[0]-d],[center[1]+d,center[0]-d],
      [center[1]+d,center[0]+d],[center[1]-d,center[0]+d],
      [center[1]-d,center[0]-d]]]},
      properties: {name: "架空の用途地域ポリゴン", api_id: 5, mock: true}},
    {type: "Feature", geometry: {type: "Point", coordinates: [center[1]+0.0015,center[0]-0.0007]},
      properties: {name: "架空の浸水データ例", api_id: 26, mock: true}},
  ]},
};
const el = id => document.getElementById(id);
let map, vectorLayer;
if (typeof L !== "undefined") {
  map = L.map("map", {zoomControl: true}).setView(center, 14);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: "© OpenStreetMap contributors",
  }).addTo(map);
} else {
  el("map").textContent = "地図ライブラリの読み込みに失敗しました。ネットワーク接続を確認してください。";
}
function extract(node, limit=2000) {
  const features = [];
  const seen = new Set();
  function visit(value, depth=0) {
    if (depth > 14 || features.length >= limit) return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth+1);
    } else if (value && typeof value === "object") {
      if (value.type === "FeatureCollection" && Array.isArray(value.features)) {
        visit(value.features, depth+1); return;
      }
      if (value.type === "Feature" && value.geometry) {
        const key = JSON.stringify(value);
        if (!seen.has(key)) {seen.add(key); features.push(value);}
        return;
      }
      for (const val of Object.values(value)) visit(val, depth+1);
    }
  }
  visit(node);
  return {type: "FeatureCollection", features};
}
const palette = {3:"#13b8a6",5:"#3b82f6",15:"#f59e0b",26:"#f472b6",29:"#ef4444"};
function popup(feature) {
  const box = document.createElement("div");
  const heading = document.createElement("b");
  heading.textContent = String(feature.properties?.name || "GeoJSON feature");
  box.append(heading);
  Object.entries(feature.properties || {}).slice(0,12).forEach(([key, value]) => {
    const line = document.createElement("div");
    line.textContent = key + ": " + String(value).slice(0,220);
    box.append(line);
  });
  return box;
}
function render(obj, fileName="合成サンプル") {
  const collection = obj.geojson?.type === "FeatureCollection" ? obj.geojson : extract(obj);
  const valid = collection.features.filter(f => f?.geometry?.type && f?.geometry?.coordinates);
  const mode = obj.meta?.mode || "imported";
  const synthetic = mode === "mock" || valid.some(f => f.properties?.mock === true);
  el("mode").textContent = synthetic ? "MOCK / 合成" : mode === "live" ? "LIVE / API" : "IMPORTED";
  el("featureCount").textContent = String(valid.length);
  el("fileName").textContent = fileName;
  el("mapStatus").textContent = valid.length + " 件 / " + (synthetic ? "架空データ" : "読み込みデータ");
  el("apiNumbers").textContent = (obj.meta?.query?.target_apis || 
    [...new Set(valid.map(f => f.properties?.api_id).filter(x => x != null))]).join(" / ") || "不明";
  const types = [...new Set(valid.map(f=>f.geometry.type))];
  el("summary").textContent = (types.join(" / ") || "位置データなし") + 
    "\n" + (synthetic ? "テスト専用。実際の地理情報ではありません。" : 
    "取引・防災等の判定には公的原典の年度・凡例・座標を確認してください。");
  el("modeNotice").textContent = synthetic
    ? "合成サンプル表示中。実際の地価・用途地域・災害危険性を示すものではありません。"
    : "外部から読み込んだデータです。真正性・取得年月・更新状況・凡例は未検証です。";
  el("jsonPreview").textContent = JSON.stringify(obj, null, 2).slice(0,18000);
  const source = obj.result?.data?.map_url;
  const anchor = el("sourceMap");
  if (typeof source === "string" && source.startsWith("https://www.reinfolib.mlit.go.jp/")) {
    anchor.href = source; anchor.hidden = false;
  } else anchor.hidden = true;
  if (!map) return;
  if (vectorLayer) map.removeLayer(vectorLayer);
  vectorLayer = L.geoJSON({type:"FeatureCollection",features:valid}, {
    style(feature) {
      const color=palette[feature.properties?.api_id] || "#65c6e8";
      return {color,weight:3,opacity:.9,fillColor:color,fillOpacity:.24};
    },
    pointToLayer(feature,latlng) {
      const color=palette[feature.properties?.api_id] || "#65c6e8";
      return L.circleMarker(latlng,{radius:8,color:"#071626",weight:2,
        fillColor:color,fillOpacity:.95});
    },
    onEachFeature(feature,layer) {layer.bindPopup(popup(feature));},
  }).addTo(map);
  const bounds=vectorLayer.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds.pad(.35),{maxZoom:15});
  else map.setView(center,14);
}
el("fileInput").addEventListener("change", async event => {
  const file=event.target.files?.[0];
  if (!file) return;
  if (file.size>15*1024*1024) {
    el("fileName").textContent="15MB以下のJSONファイルを選択してください";return;
  }
  try {
    const parsed=JSON.parse(await file.text());
    render(parsed,file.name);
  } catch (error) {
    el("fileName").textContent="読み込み失敗: "+error.message;
  }
});
el("resetButton").addEventListener("click", () => {
  el("fileInput").value="";
  render(demo);
});
render(demo);
