// script.js

// ===== On Page Load: Auto-apply saved config if present =====
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('moblinConfig');
  if (saved) {
    document.getElementById('json-input').value = saved;
    document.getElementById('delete-btn').style.display = 'inline-block';
    analyze();
  }
});

// ===== File Load =====
const fileInput = document.getElementById('file-input');
document.getElementById('file-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => document.getElementById('json-input').value = reader.result;
  reader.readAsText(file);
});

// ===== Analyze Configuration =====
document.getElementById('analyze-btn').addEventListener('click', analyze);

function analyze() {
  const raw = document.getElementById('json-input').value.trim();
  if (!raw) {
    return alert('Please paste or load some JSON first!');
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    return alert('Invalid JSON: ' + err.message);
  }

  // persist for later page loads
  localStorage.setItem('moblinConfig', raw);
  document.getElementById('delete-btn').style.display = 'inline-block';

  window.loadedConfig = cfg;
  renderProfiles(cfg.streams || []);
  renderGlobalSettings(cfg);
  clearDiff();
  syncScrollbars();
}

// ===== Delete Stored Data =====
document.getElementById('delete-btn').addEventListener('click', () => {
  localStorage.removeItem('moblinConfig');
  document.getElementById('json-input').value = '';
  document.getElementById('delete-btn').style.display = 'none';
  document.getElementById('profiles-container').innerHTML = '';
  document.getElementById('global-settings').innerHTML = '';
});

// ===== Render Profiles =====
function renderProfiles(streams) {
  const container = document.getElementById('profiles-container');
  container.innerHTML = '';
  streams
    .slice()
    .sort((a,b) => (a.enabled === b.enabled) ? 0 : (a.enabled ? -1 : 1))
    .forEach(stream => {
      const div = document.createElement('div');
      div.className = 'profile';
      div.innerHTML = `
        <h3>
          ${stream.name}
          <label class="compare-label">
            <input type="checkbox" class="compare-checkbox" value="${stream.name}">
            Compare
          </label>
        </h3>
        <table class="basic-table">
          <tr>
            <th>Enabled</th>
            <td class="enabled-cell ${stream.enabled}">${stream.enabled}</td>
          </tr>
          <tr>
            <th>URL</th>
            <td class="url-cell">${stream.url}</td>
          </tr>
        </table>
        <h4>Details</h4>
        <table class="details-table">
          <thead><tr><th>Category</th><th>Key</th><th>Value</th></tr></thead>
          <tbody>
            ${buildDetailsRows(stream)}
          </tbody>
        </table>
      `;
      container.appendChild(div);
    });
  setupCompareListener();
}

// Flattened one-level details, color-booleans
function buildDetailsRows(obj) {
  let rows = '';
  for (const [k, v] of Object.entries(obj)) {
    if (['name','enabled','url','streams'].includes(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ik, iv] of Object.entries(v)) {
        if (iv === null) continue;
        if (['string','number','boolean'].includes(typeof iv)) {
          const cls = (String(iv).toLowerCase() === 'true') ? 'value-true'
                    : (String(iv).toLowerCase() === 'false') ? 'value-false'
                    : '';
          rows += `<tr>
            <td>${k}</td><td>${ik}</td><td class="${cls}">${iv}</td>
          </tr>`;
        }
      }
    } else {
      const val = Array.isArray(v) ? JSON.stringify(v) : v;
      const cls = (String(val).toLowerCase() === 'true') ? 'value-true'
                : (String(val).toLowerCase() === 'false') ? 'value-false'
                : '';
      rows += `<tr>
        <td>General</td><td>${k}</td><td class="${cls}">${val}</td>
      </tr>`;
    }
  }
  return rows;
}

// Clear any inline diff section
function clearDiff() {
  const diff = document.getElementById('diff-section');
  if (diff) diff.remove();
}

// ===== Compare Button =====
document.getElementById('compare-btn').addEventListener('click', () => {
  const checked = Array.from(document.querySelectorAll('.compare-checkbox:checked'));
  if (checked.length !== 2) {
    return alert('Please select exactly 2 profiles to compare.');
  }
  const names = checked.map(cb => cb.value);
  const streams = (window.loadedConfig && window.loadedConfig.streams) || [];
  const toCompare = streams.filter(s => names.includes(s.name));
  localStorage.setItem('profileComparison', JSON.stringify(toCompare));
  window.location.href = 'compare.html';
});

// ===== Render Global Settings =====
function renderGlobalSettings(cfg) {
  const container = document.getElementById('global-settings');
  container.innerHTML = '';
  const ignore = new Set(['streams']);
  let first = true;
  for (const [cat, v] of Object.entries(cfg)) {
    if (ignore.has(cat)) continue;
    if (!first) container.appendChild(document.createElement('hr'));
    first = false;

    const heading = document.createElement('h3');
    heading.textContent = cat;
    container.appendChild(heading);

    switch (cat) {
      case 'remoteControl': renderRemoteControl(container, v); break;
      case 'widgets':       renderWidgets(container, v);       break;
      case 'bitratePresets':renderBitratePresets(container, v);break;
      case 'globalButtons': renderGlobalButtons(container, v); break;
      case 'scenes':        renderScenes(container, v);        break;
      case 'gameControllers': renderGameControllers(container, v); break;
      default:
        if (v && typeof v === 'object') renderGenericObject(container, v);
        else if (Array.isArray(v)) {
          const pre = document.createElement('pre');
          pre.textContent = JSON.stringify(v, null, 2);
          container.appendChild(pre);
        } else {
          container.appendChild(buildTable([[cat, v]]));
        }
    }
  }
}

// --- Helpers for each Global section ---
function renderRemoteControl(parent, rc) {
  const rows = [];
  Object.entries(rc.server || {}).forEach(([k, val]) => rows.push([`server.${k}`, val]));
  const c = rc.client || {};
  Object.entries(c).forEach(([k, val]) => { if (k !== 'relay') rows.push([`client.${k}`, val]); });
  if (c.relay) rows.push(['client.relay', nestedTable(c.relay)]);
  rows.push(['password', rc.password]);
  parent.appendChild(buildTable(rows));
}

function renderWidgets(parent, arr) {
  arr.forEach(w => {
    const title = document.createElement('h4');
    title.textContent = w.name || 'Unnamed';
    parent.appendChild(title);
    const rows = [];
    Object.entries(w).forEach(([k, val]) => {
      if (k === 'id') return;
      if (['string','number','boolean'].includes(typeof val)) rows.push([k, val]);
      else if (val && typeof val === 'object') rows.push([k, nestedTable(val)]);
    });
    parent.appendChild(buildTable(rows));
  });
}

function renderBitratePresets(parent, arr) {
  parent.appendChild(buildTable(arr.map(e => [`${e.bitrate/1e6}Mbps`, e.bitrate])));
}

function renderGlobalButtons(parent, arr) {
  const tbl = document.createElement('table');
  tbl.className = 'global-table';
  tbl.innerHTML = `
    <colgroup><col><col><col><col></colgroup>
    <thead><tr>
      <th>Name</th><th>Enabled</th><th>IsActive</th><th>Color</th>
    </tr></thead>
    <tbody>
      ${arr.map(b => {
        const color = formatColor(b.backgroundColor);
        return `<tr>
          <td>${b.name}</td>
          <td class="${b.enabled}">${b.enabled}</td>
          <td class="${b.isOn}">${b.isOn}</td>
          <td class="color-cell" style="background:${color}">${color}</td>
        </tr>`;
      }).join('')}
    </tbody>`;
  parent.appendChild(tbl);
}

function renderScenes(parent, arr) {
  arr.forEach(s => {
    const title = document.createElement('h4');
    title.textContent = s.name;
    parent.appendChild(title);
    const rows = [];
    Object.entries(s).forEach(([k, val]) => {
      if (k === 'id' || k === 'name') return;
      if (['string','number','boolean'].includes(typeof val)) rows.push([k, val]);
      else rows.push([k, nestedTable(val)]);
    });
    parent.appendChild(buildTable(rows));
  });
}

function renderGameControllers(parent, arr) {
  const rows = [];
  arr.forEach(ctrl => {
    (ctrl.buttons || []).forEach(b => {
      rows.push([b.name, b.text, b.function, b.sceneId]);
    });
  });
  const tbl = document.createElement('table');
  tbl.className = 'global-table';
  tbl.innerHTML = `
    <colgroup><col><col><col><col></colgroup>
    <thead><tr><th>Name</th><th>Text</th><th>Function</th><th>SceneID</th></tr></thead>
    <tbody>
      ${rows.map(r => `
        <tr>
          <td>${r[0]}</td>
          <td>${r[1]}</td>
          <td>${r[2]}</td>
          <td>${r[3]}</td>
        </tr>
      `).join('')}
    </tbody>`;
  parent.appendChild(tbl);
}

function renderGenericObject(parent, obj) {
  const rows = [];
  Object.entries(obj).forEach(([k, val]) => {
    if (['string','number','boolean'].includes(typeof val)) rows.push([k, val]);
    else if (val && typeof val === 'object') rows.push([k, nestedTable(val)]);
  });
  parent.appendChild(buildTable(rows));
}

// Build a 2-column global table
function buildTable(rows) {
  const tbl = document.createElement('table');
  tbl.className = 'global-table';
  const header = `<thead><tr><th>Key</th><th>Value</th></tr></thead>`;
  const body = rows.map(([k, v]) => {
    const vs = String(v).toLowerCase();
    const cls = (vs === 'true' || vs === 'on') ? 'value-true'
              : (vs === 'false' || vs === 'off') ? 'value-false'
              : '';
    return `<tr><td>${k}</td><td class="${cls}">${v}</td></tr>`;
  }).join('');
  tbl.innerHTML = `<colgroup><col><col></colgroup>${header}<tbody>${body}</tbody>`;
  return tbl;
}

// Nested table builder (for relay, nested objects)
function nestedTable(o) {
  let html = `<table class="global-inner-table"><thead>
    <tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
  Object.entries(o).forEach(([k, v]) => {
    if (['string','number','boolean'].includes(typeof v)) {
      const vs = String(v).toLowerCase();
      const cls = (vs === 'true' || vs === 'on') ? 'value-true'
                : (vs === 'false' || vs === 'off') ? 'value-false'
                : '';
      html += `<tr><td>${k}</td><td class="${cls}">${v}</td></tr>`;
    }
  });
  html += `</tbody></table>`;
  return html;
}

// RGBA helper
function formatColor(c) {
  if (!c || typeof c !== 'object') return '';
  const {red,green,blue,opacity} = c;
  return `rgba(${red},${green},${blue},${opacity != null ? opacity : 1})`;
}

// ===== Scrollbar Sync =====
const topScroll    = document.getElementById('profiles-top-scroll');
const botScroll    = document.getElementById('profiles-bottom-scroll');
const profilesWrap = document.getElementById('profiles-container');

function syncScrollbars() {
  const width = profilesWrap.scrollWidth;
  [topScroll, botScroll].forEach(el => {
    el.innerHTML = `<div style="width:${width}px; height:1px;"></div>`;
  });
}

topScroll.addEventListener('scroll', () => {
  profilesWrap.scrollLeft = topScroll.scrollLeft;
});
botScroll.addEventListener('scroll', () => {
  profilesWrap.scrollLeft = botScroll.scrollLeft;
});
profilesWrap.addEventListener('scroll', () => {
  topScroll.scrollLeft = profilesWrap.scrollLeft;
  botScroll.scrollLeft = profilesWrap.scrollLeft;
});
window.addEventListener('resize', syncScrollbars);
