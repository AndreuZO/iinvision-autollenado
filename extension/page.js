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
const NO_TRANSLATE = '#reportBody, kendo-popup, .aa-panel, kendo-card:has([id^="toggleValue"]), kendo-card:has(kendo-multicolumncombobox)';
function protectFromTranslation(doc) {
  const mark = () => doc.querySelectorAll(NO_TRANSLATE).forEach(e => {
    if (e.getAttribute('translate') !== 'no') e.setAttribute('translate', 'no');
  });
  mark();
  new MutationObserver(mark).observe(doc.body, { childList: true, subtree: true });
}

// true si Chrome ya tradujo el reporte (antes de que se pudiera proteger): sus textos no son confiables.
const reportTranslated = report => !!report.querySelector('font');

// Después de aplicar: baja el reporte hasta "Hardware check" y pulsa Add del módulo Damages.
// Damages se ubica por estructura (el panel donde están las Notas), no por su texto.
function goToDamages(doc) {
  const report = doc.getElementById('reportBody');
  const heading = report && [...report.querySelectorAll('h1, h2, h3, h4')]
    .find(h => /^hardware check$/i.test(h.textContent.trim()));
  if (heading) {
    let box = heading.parentElement; // contenedor con scroll del reporte
    while (box && !(box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
    if (box) box.scrollTop += heading.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  }
  const adds = doc.querySelector('#notes')?.closest('kendo-expansionpanel')?.querySelectorAll('button.btnAdd') || [];
  if (adds.length !== 1) return false; // no se reconoce el botón: mejor no pulsar nada
  adds[0].scrollIntoView({ block: 'center' });
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
