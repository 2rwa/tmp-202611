"use strict";
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const repo = path.resolve(__dirname, "..");
const python = process.env.PYTHON || "python3";

function call(params) {
  return spawnSync(python, ["geo-mcp/probe.py", ...params], {
    cwd: repo, encoding: "utf8", timeout: 20000,
    env: {...process.env, LIBRARY_API_KEY: ""},
  });
}
function ok(params) {
  const run = call(params);
  assert.equal(run.status, 0, run.stderr || run.error?.message);
  return JSON.parse(run.stdout);
}
let count=0;
function test(name, body) {body();console.log("PASS geo-mcp: "+name);count++;}
test("MCP initialize/list/call + feature extraction",()=>{
  const output=ok(["--mock"]);
  assert.equal(output.meta.mode, "mock");
  assert.equal(output.meta.protocol_version, "2025-03-26");
  assert.deepEqual(output.meta.query.target_apis, [3,5,26]);
  assert.equal(output.meta.query.save_file, false);
  assert.equal(output.geojson.type, "FeatureCollection");
  assert.equal(output.geojson.features.length, 3);
  assert.deepEqual(output.geojson.features.map(f=>f.geometry.type), ["Point","Polygon","Polygon"]);
  assert.ok(output.geojson.features.every(f=>f.properties.mock === true));
  assert.equal(output.result.data.api_results.length,3);
});
test("custom coordinates / line shape / API IDs",()=>{
  const result=ok(["--mock","--lat","35.6","--lon","139.8","--apis","3,15","--distance","100"]);
  assert.deepEqual(result.meta.query.target_apis,[3,15]);
  assert.equal(result.meta.query.distance,100);
  assert.deepEqual(result.geojson.features.map(f=>f.geometry.type),["Point","LineString"]);
  const [x,y]=result.geojson.features[0].geometry.coordinates;
  assert.ok(Math.abs(x-139.8)<0.01 && Math.abs(y-35.6)<0.01);
});
test("reject radius >425 and unavailable live key",()=>{
  let bad=call(["--mock","--distance","426"]);
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/425/);
  bad=call(["--apis","3"]);
  assert.notEqual(bad.status,0);
  assert.match(bad.stderr,/LIBRARY_API_KEY/);
});
test("reject invalid API IDs and invalid coordinates",()=>{
  for(const argv of [
    ["--mock","--apis","1,31"],["--mock","--apis",""],
    ["--mock","--lat","91"],["--mock","--distance","0"],
  ]) assert.notEqual(call(argv).status,0,argv.join(" "));
});
test("map assets and gallery link",()=>{
  const html=fs.readFileSync(path.join(repo,"geo-mcp/index.html"),"utf8");
  const js=fs.readFileSync(path.join(repo,"geo-mcp/app.js"),"utf8");
  const gallery=fs.readFileSync(path.join(repo,"index.html"),"utf8");
  assert.match(html,/id="fileInput"/);
  assert.match(html,/id="map"/);
  assert.match(js,/L\.geoJSON/);
  assert.match(js,/function extract\(/);
  assert.match(gallery,/geo-mcp\/index\.html/);
});
console.log("ALL "+count+" GEO MCP SMOKE TESTS PASSED");
