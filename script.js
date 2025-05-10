// script.js

// — Clipboard paste (fallback notice)
document.getElementById('paste-btn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('json-input').value = text;
  } catch {
    alert(
      '⚠️ Clipboard API requires HTTPS or localhost.\n' +
      'Please serve over http://localhost or paste manually.'
    );
  }
});

// — File load
const fileInput = document.getElementById('file-input');
document.getElementById('file-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => (document.getElementById('json-input').value = reader.result);
  reader.readAsText(file);
});

// — Analyze button
document.getElementById('analyze-btn').addEventListener('click', () => {
  const raw = document.getElementById('json-input').value.trim();
  if (!raw) return alert('Please paste or load some JSON first!');
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (err) {
    return alert('Invalid JSON: ' + err.message);
  }
  renderProfiles(cfg.streams || []);
  renderGlobalSettings(cfg);
  clearDiff();
  syncScrollbars();
});

// — Render Profiles (enabled first)
function renderProfiles(streams) {
  const container = document.getElementById('profiles-container');
  container.innerHTML = '';
  streams
    .slice()
    .sort((a,b) => (a.enabled === b.enabled) ? 0 : (a.enabled? -1:1))
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
          <tbody>${buildDetailsRows(stream)}</tbody>
        </table>
      `;
      container.appendChild(div);
    });
  setupCompareListener();
}

// flatten one level, add color‐classes on value
function buildDetailsRows(obj) {
  let rows = '';
  for (const [k,v] of Object.entries(obj)) {
    if (['name','enabled','url','streams'].includes(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ik,iv] of Object.entries(v)) {
        if (iv === null) continue;
        if (['string','number','boolean'].includes(typeof iv)) {
          const cls = String(iv).toLowerCase() === 'true'
                    ? 'value-true'
                    : String(iv).toLowerCase() === 'false'
                      ? 'value-false'
                      : '';
          rows += `<tr>
            <td>${k}</td><td>${ik}</td>
            <td class="${cls}">${iv}</td>
          </tr>`;
        } else {
          // nested object → nested table
          rows += `<tr>
            <td>${k}</td><td>${ik}</td>
            <td>${nestedTable(iv)}</td>
          </tr>`;
        }
      }
    } else {
      const val = Array.isArray(v) ? JSON.stringify(v) : v;
      const cls = String(val).toLowerCase() === 'true'
                ? 'value-true'
                : String(val).toLowerCase() === 'false'
                  ? 'value-false'
                  : '';
      rows += `<tr>
        <td>General</td><td>${k}</td>
        <td class="${cls}">${val}</td>
      </tr>`;
    }
  }
  return rows;
}

// build a nested table for any object
function nestedTable(o) {
  let out = `<table class="global-inner-table">
    <thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
  Object.entries(o).forEach(([k,v]) => {
    const val = (v !== null && typeof v === 'object')
      ? JSON.stringify(v)
      : v;
    const cls = String(val).toLowerCase() === 'true'
              ? 'value-true'
              : String(val).toLowerCase() === 'false'
                ? 'value-false'
                : '';
    out += `<tr><td>${k}</td><td class="${cls}">${val}</td></tr>`;
  });
  out += `</tbody></table>`;
  return out;
}

// — Compare logic (unchanged) —
function setupCompareListener() {
  document.querySelectorAll('.compare-checkbox').forEach(cb =>
    cb.addEventListener('change', doCompare)
  );
}
function clearDiff() {
  const ex = document.getElementById('diff-section');
  if (ex) ex.remove();
}
function doCompare() {
  const checked = Array.from(document.querySelectorAll('.compare-checkbox:checked'));
  clearDiff();
  if (checked.length!==2) return;
  const [one,two] = checked.map(cb=>cb.value);
  const profiles = Array.from(document.querySelectorAll('.profile'));
  const p1 = profiles.find(p=>p.querySelector('input').value===one);
  const p2 = profiles.find(p=>p.querySelector('input').value===two);
  const mapValues = prof => {
    const m = {};
    prof.querySelectorAll('table').forEach(tbl=>{
      tbl.querySelectorAll('tr').forEach((tr,i)=>{
        if(i===0 && tbl.classList.contains('details-table')) return;
        const c = tr.children;
        const key = c[1].textContent;
        const cat = c.length===4?c[0].textContent:'General';
        const val = c[c.length-1].textContent;
        m[key]={cat,val};
      });
    });
    return m;
  };
  const m1=mapValues(p1), m2=mapValues(p2);
  const all = new Set([...Object.keys(m1),...Object.keys(m2)]);
  let html = `<div id="diff-section"><h2>Differences: ${one} vs ${two}</h2>
    <table><thead><tr><th>Category</th><th>Key</th><th>${one}</th><th>${two}</th></tr></thead><tbody>`;
  all.forEach(key=>{
    const a=m1[key]?.val||'', b=m2[key]?.val||'';
    if(a!==b){
      const cat = m1[key]?.cat||m2[key]?.cat||'';
      html+=`<tr><td>${cat}</td><td>${key}</td><td>${a}</td><td>${b}</td></tr>`;
    }
  });
  html+=`</tbody></table></div>`;
  document.body.appendChild(Object.assign(document.createElement('div'),{innerHTML:html}));
}

// — Render Global Settings with nested tables everywhere
function renderGlobalSettings(cfg) {
  const ignore = new Set(['streams']);
  let html = '', first=true;
  for(const [cat,v] of Object.entries(cfg)){
    if(ignore.has(cat)) continue;
    if(!first) html+='<hr>'; first=false;
    html+=`<h3>${cat}</h3>`;

    // remoteControl with nested client.relay
    if(cat==='remoteControl'){
      html+=`<table class="global-table">
        <colgroup><col><col></colgroup>
        <thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
      // server
      Object.entries(v.server||{}).forEach(([k,val])=>{
        html+=buildGlobalRow(`server.${k}`,val);
      });
      // client
      const c=v.client||{};
      Object.entries(c).forEach(([k,val])=>{
        if(k==='relay') return;
        html+=buildGlobalRow(`client.${k}`,val);
      });
      // relay nested
      if(c.relay){
        html+=`<tr><td>client.relay</td><td>${nestedTable(c.relay)}</td></tr>`;
      }
      html+=buildGlobalRow('password',v.password);
      html+=`</tbody></table>`;
      continue;
    }

    // widgets
    if(cat==='widgets'&&Array.isArray(v)){
      v.forEach(w=>{
        html+=`<h4>${w.name||'Unnamed'}</h4>
          <table class="global-table"><colgroup><col><col></colgroup>
            <thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
        Object.entries(w).forEach(([k,val])=>{
          if(k==='id')return;
          if(['string','number','boolean'].includes(typeof val))
            html+=buildGlobalRow(k,val);
          else if(typeof val==='object')
            html+=`<tr><td>${k}</td><td>${nestedTable(val)}</td></tr>`;
        });
        html+=`</tbody></table>`;
      });
      continue;
    }

    // bitratePresets
    if(cat==='bitratePresets'&&Array.isArray(v)){
      html+=`<table class="global-table"><colgroup><col><col></colgroup>
        <thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
      v.forEach(e=>{
        html+=buildGlobalRow(`${e.bitrate/1e6}Mbps`,e.bitrate);
      });
      html+=`</tbody></table>`;
      continue;
    }

    // globalButtons
    if(cat==='globalButtons'&&Array.isArray(v)){
      html+=`<table class="global-table"><colgroup>
          <col><col><col><col></colgroup>
        <thead><tr>
          <th>Name</th><th>Enabled</th><th>IsActive</th><th>Color</th>
        </tr></thead><tbody>`;
      v.forEach(b=>{
        const color = formatColor(b.backgroundColor);
        html+=`<tr>
          <td>${b.name}</td>
          <td class="${b.enabled}">${b.enabled}</td>
          <td class="${b.isOn}">${b.isOn}</td>
          <td class="color-cell" style="background:${color};">${color}</td>
        </tr>`;
      });
      html+=`</tbody></table>`;
      continue;
    }

    // scenes
    if(cat==='scenes'&&Array.isArray(v)){
      v.forEach(s=>{
        html+=`<h4>${s.name}</h4>
          <table class="global-table"><colgroup><col><col></colgroup>
            <thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
        Object.entries(s).forEach(([k,val])=>{
          if(['id','name'].includes(k))return;
          if(['string','number','boolean'].includes(typeof val))
            html+=buildGlobalRow(k,val);
          else html+=`<tr><td>${k}</td><td>${nestedTable(val)}</td></tr>`;
        });
        html+=`</tbody></table>`;
      });
      continue;
    }

    // gameControllers (buttons)
    if(cat==='gameControllers'&&Array.isArray(v)){
      html+=`<table class="global-table"><colgroup>
          <col><col><col><col></colgroup>
        <thead><tr><th>Name</th><th>Text</th><th>Function</th><th>SceneID</th></tr></thead><tbody>`;
      v.forEach(ctrl=>{
        (ctrl.buttons||[]).forEach(btn=>{
          html+=`<tr>
            <td>${btn.name}</td>
            <td>${btn.text}</td>
            <td>${btn.function}</td>
            <td>${btn.sceneId}</td>
          </tr>`;
        });
      });
      html+=`</tbody></table>`;
      continue;
    }

    // generic
    if(v && typeof v==='object'){
      if(Array.isArray(v)){
        html+=`<pre>${JSON.stringify(v,null,2)}</pre>`;
      } else {
        html+=`<table class="global-table"><colgroup><col><col></colgroup>
          <thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
        Object.entries(v).forEach(([k,val])=>{
          if(val===null) return;
          if(['string','number','boolean'].includes(typeof val)){
            html+=buildGlobalRow(k,val);
          } else {
            html+=`<tr><td>${k}</td><td>${nestedTable(val)}</td></tr>`;
          }
        });
        html+=`</tbody></table>`;
      }
      continue;
    }

    // primitive
    html+=`<table class="global-table"><colgroup><col><col></colgroup>
      <thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
    html+=buildGlobalRow(cat,v);
    html+=`</tbody></table>`;
  }
  document.getElementById('global-settings').innerHTML = html;
}

// — Build global row, but nested tables now generated in nestedTable()
function buildGlobalRow(key, rawVal) {
  const val = rawVal == null ? '' : rawVal;
  const vs = String(val).toLowerCase();
  const cls = (vs==='true'||vs==='on') ? 'value-true'
            : (vs==='false'||vs==='off') ? 'value-false'
            : '';
  return `<tr><td>${key}</td><td class="${cls}">${val}</td></tr>`;
}

// — Build a nested <table> for an object
function nestedTable(o) {
  let t = `<table class="global-inner-table">
    <thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>`;
  Object.entries(o).forEach(([k,v])=>{
    if(v==null) return;
    if(['string','number','boolean'].includes(typeof v)){
      const vs=String(v).toLowerCase();
      const cls=(vs==='true'||vs==='on')?'value-true'
                :(vs==='false'||vs==='off')?'value-false':'';
      t+=`<tr><td>${k}</td><td class="${cls}">${v}</td></tr>`;
    } else if(typeof v==='object'){
      t+=`<tr><td>${k}</td><td>${nestedTable(v)}</td></tr>`;
    }
  });
  t+=`</tbody></table>`;
  return t;
}

// — RGBA helper
function formatColor(c) {
  if(!c||typeof c!=='object') return '';
  const {red,green,blue,opacity} = c;
  return `rgba(${red},${green},${blue},${opacity!=null?opacity:1})`;
}

// — Sync scrollbars
const topScroll    = document.getElementById('profiles-top-scroll');
const botScroll    = document.getElementById('profiles-bottom-scroll');
const profilesWrap = document.getElementById('profiles-container');
function syncScrollbars() {
  const w = profilesWrap.scrollWidth;
  [topScroll,botScroll].forEach(el=>{
    el.innerHTML = `<div style="width:${w}px;height:1px"></div>`;
  });
}
topScroll.addEventListener('scroll', ()=>profilesWrap.scrollLeft = topScroll.scrollLeft);
botScroll.addEventListener('scroll', ()=>profilesWrap.scrollLeft = botScroll.scrollLeft);
profilesWrap.addEventListener('scroll', ()=>{
  topScroll.scrollLeft = profilesWrap.scrollLeft;
  botScroll.scrollLeft = profilesWrap.scrollLeft;
});
window.addEventListener('resize', syncScrollbars);
