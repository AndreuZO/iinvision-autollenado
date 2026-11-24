// Única capa que toca el DOM de iinvision (Angular + Kendo UI).

// Pares label/valor del reporte Blancco abierto en el panel lateral (#reportBody).
function readReportPairs(root) {
  const pairs = [];
  let section = '';
  let cur = null;
  for (const el of root.querySelectorAll('h1, h2, h3, h4, .label, .data')) {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    if (/^H\d$/.test(el.tagName)) {
      section = text;
      cur = null;
    } else if (el.classList.contains('label')) {
      cur = { section, label: text.replace(/:\s*\d*$/, ''), value: '' }; // "Display: 1" -> "Display"
      pairs.push(cur);
    } else if (cur) {
      cur.value = cur.value ? cur.value + ', ' + text : text;
    }
  }
  return pairs;
}

const formElement = (doc, title) =>
  doc.querySelector(`kendo-label[title="${title}"]`)?.closest('.form-group')?.querySelector('.form-element');
const tableRow = (doc, name) =>
  [...doc.querySelectorAll('tr')].find(tr => tr.firstElementChild?.textContent.trim() === name);

// Resuelve un Target.id a los elementos que lo controlan, o null si no existe en la ficha.
function locate(doc, id) {
  if (id === 'notes') {
    const area = doc.querySelector('#notes textarea');
    return area && { kind: 'text', area };
  }
  const [kind, name] = id.includes(':') ? id.split(/:(.+)/) : ['radio', id];
  if (kind === 'radio') {
    const yes = doc.getElementById(name + '_true');
    return yes && { kind: 'radio', yes, no: doc.getElementById(name + '_false') };
  }
  if (kind === 'chk') {
    const box = formElement(doc, name)?.querySelector('input[type=checkbox]') ||
      doc.querySelector(`kendo-label[title="${name}"]`)?.closest('.form-group')?.querySelector('input[type=checkbox]');
    return box && { kind: 'chk', box };
  }
  if (kind === 'field') {
    const input = formElement(doc, name)?.querySelector('kendo-multicolumncombobox input');
    return input && { kind: 'combo', input };
  }
  const row = tableRow(doc, name);
  if (!row) return null;
  if (kind === 'attr') {
    const yes = row.querySelector('input[type=radio][id$="_true"]');
    return yes && { kind: 'radio', yes, no: row.querySelector('input[type=radio][id$="_false"]') };
  }
  const input = row.querySelector('kendo-multicolumncombobox input');
  return input && { kind: 'combo', input };
}

function readValue(loc) {
  if (loc.kind === 'radio') return loc.yes.checked ? true : loc.no?.checked ? false : 'unspecified';
  if (loc.kind === 'chk') return loc.box.checked;
  if (loc.kind === 'text') return loc.area.value;
  return loc.input.value.trim();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Abre el combo Kendo y hace clic en la opción con ese texto exacto. Si no existe, lo cierra.
async function pickComboOption(doc, input, text) {
  const toggle = input.closest('kendo-multicolumncombobox').querySelector('button.k-input-button');
  toggle.click();
  for (let i = 0; i < 20; i++) { // hasta 2 s
    const option = [...doc.querySelectorAll('kendo-popup li[role=option]')].find(o => o.textContent.trim() === text);
    if (option) {
      option.click();
      await sleep(300);
      return;
    }
    await sleep(100);
  }
  toggle.click();
}

// Aplica un cambio simulando al usuario (Angular no registra .checked/.value asignados a secas).
// Devuelve true si, al volver a leer, el campo tiene el valor propuesto.
async function applyChange(doc, change) {
  const loc = locate(doc, change.target.id);
  if (!loc) return false;
  const v = change.proposed;
  if (loc.kind === 'radio') (v ? loc.yes : loc.no).click();
  else if (loc.kind === 'chk') { if (v === true && !loc.box.checked) loc.box.click(); } // nunca desmarca
  else if (loc.kind === 'text') {
    // Como si el usuario escribiera: valor + evento input para que Angular lo registre.
    loc.area.focus();
    loc.area.value = v;
    loc.area.dispatchEvent(new Event('input', { bubbles: true }));
    loc.area.dispatchEvent(new Event('change', { bubbles: true }));
    loc.area.blur();
  }
  else await pickComboOption(doc, loc.input, v);
  return readValue(loc) === v;
}

// Traducción de Chrome: reemplaza los textos de la página y la extensión lee textos
// (reporte Blancco, nombres de atributos, opciones de combos). Esas zonas se marcan
// translate="no" apenas aparecen, así se quedan en el idioma original aunque el
// resto de la página se traduzca.
const NO_TRANSLATE = '#reportBody, kendo-popup, .aa-panel, .k-tabstrip-items,kendo-card:has([id^="toggleValue"]), kendo-card:has(kendo-multicolumncombobox)';
function protectFromTranslation(doc) {
  const mark = () => doc.querySelectorAll(NO_TRANSLATE).forEach(e => {
    if (e.getAttribute('translate') !== 'no') e.setAttribute('translate', 'no');
  });
  mark();
  new MutationObserver(mark).observe(doc.body, { childList: true, subtree: true });
}

// true si Chrome ya tradujo el reporte (antes de que se pudiera proteger): sus textos no son confiables.
const reportTranslated = report => !!report.querySelector('font');

// Espera hasta ~3 s a que aparezca un elemento (Angular dibuja las pestañas al seleccionarlas).
async function waitFor(find) {
  for (let i = 0; i < 30; i++) {
    const found = find();
    if (found) return found;
    await sleep(100);
  }
  return null;
}

// Selecciona la pestaña Item Information y devuelve el panel Notes & Damages ya visible (o null).
// Item Information = la pestaña dueña del panel donde está #notes. En otra pestaña
// (p. ej. Project Details) #notes existe pero oculto. Kendo nombra la pestaña igual que su
// panel ("...-tabpanel-<id>-1" ↔ "...-tab-<id>-1"): no depende del idioma.
async function showItemInformation(doc) {
  const tabPanel = doc.querySelector('#notes')?.closest('[role=tabpanel]');
  if (tabPanel && tabPanel.getAttribute('aria-hidden') === 'true') {
    doc.getElementById(tabPanel.id.replace('-tabpanel-', '-tab-'))?.click();
  } else if (!doc.querySelector('#notes')) {
    [...doc.querySelectorAll('li[role=tab]')].find(t => /^item information$/i.test(t.textContent.trim()))?.click();
  }
  return waitFor(() => {
    const s = doc.querySelector('#notes')?.closest('kendo-expansionpanel');
    return s && s.offsetParent !== null ? s : null;
  });
}

// Después de aplicar: baja el reporte hasta "Hardware check", selecciona la pestaña
// Item Information, baja hasta Notes & Damages y pulsa Add de Damages.
// Notes & Damages se ubica por estructura (el panel donde está #notes), no por su texto.
async function goToDamages(doc) {
  const report = doc.getElementById('reportBody');
  const heading = report && [...report.querySelectorAll('h1, h2, h3, h4')]
    .find(h => /^hardware check$/i.test(h.textContent.trim()));
  if (heading) {
    let box = heading.parentElement; // contenedor con scroll del reporte
    while (box && !(box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (box) box.scrollTop += heading.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  }
  const section = await showItemInformation(doc);
  if (!section) return false;
  if (!section.classList.contains('k-expanded')) {
    section.querySelector('.k-expander-header')?.click(); // estaba plegado: se despliega
  }
  section.scrollIntoView({ block: 'start' });
  const adds = await waitFor(() => {
    const found = section.querySelectorAll('button.btnAdd');
    return found.length ? found : null;
  }) || [];
  if (adds.length !== 1) return false; // no se reconoce el botón: mejor no pulsar nada
  adds[0].click();
  return true;
}

function readItemState(doc) {
  const current = {};
  for (const t of TARGETS) {
    const loc = locate(doc, t.id);
    if (loc) current[t.id] = readValue(loc);
  }
  return {
    serial: formElement(doc, 'item.serial')?.querySelector('input')?.value || '',
    productType: formElement(doc, 'item.type')?.querySelector('input')?.value || '',
    notes: doc.querySelector('#notes textarea')?.value || '',
    current,
  };
}
