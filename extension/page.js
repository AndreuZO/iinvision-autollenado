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
  const [kind, name] = id.includes(':') ? id.split(/:(.+)/) : ['radio', id];
  if (kind === 'radio') {
    const yes = doc.getElementById(name + '_true');
    return yes && { kind: 'radio', yes, no: doc.getElementById(name + '_false') };
  }
  if (kind === 'chk') {
    const label = [...doc.querySelectorAll('kendo-label')].find(k => k.textContent.trim() === name);
    const box = label?.closest('.form-group')?.querySelector('input[type=checkbox]');
    return box && { kind: 'chk', box };
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
  if (loc.kind === 'radio') return loc.yes.checked ? true : loc.no.checked ? false : 'unspecified';
  if (loc.kind === 'chk') return loc.box.checked;
  return loc.input.value.trim();
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
