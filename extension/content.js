// Botón "Autollenar" + panel de resumen. Nunca pulsa Save.
(function () {
  const STATUS = {
    apply: 'Se aplicará',
    same: 'Ya está',
    conflict: '⚠ Distinto, no se cambia',
    undetermined: 'No determinado',
  };
  const show = v => (v === true ? 'Yes' : v === false ? 'No' : v === null ? '—' : v === '' ? '(vacío)' : v === 'unspecified' ? 'Unspecified' : String(v));
  const onItemPage = () => location.pathname.startsWith('/Item/Detail/');

  const btn = document.createElement('button');
  btn.id = 'aa-btn';
  btn.type = 'button';
  btn.textContent = 'Autollenar';
  btn.addEventListener('click', run);
  document.body.appendChild(btn);

  let panel = null;
  let busy = false;
  let lastPath = location.pathname;
  // iinvision es una SPA: el botón se muestra solo en fichas de equipo y el panel
  // se cierra al cambiar de página para no aplicar datos de otro equipo.
  setInterval(() => {
    btn.hidden = !onItemPage();
    if (location.pathname !== lastPath) { lastPath = location.pathname; closePanel(); }
  }, 1000);
  btn.hidden = !onItemPage();

  function closePanel() { panel?.remove(); panel = null; }

  function el(tag, text, cls) {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  function openPanel(...children) {
    closePanel();
    panel = el('div', null, 'aa-panel');
    panel.append(el('h3', 'Autollenado desde Blancco'), ...children);
    const close = el('button', 'Cancelar');
    close.type = 'button';
    close.addEventListener('click', closePanel);
    const actions = el('div', null, 'aa-actions');
    actions.append(close);
    panel.append(actions);
    document.body.appendChild(panel);
    return actions;
  }

  // Lee todo de nuevo (sin caché): la página puede haber cambiado.
  function computePlan() {
    const report = document.getElementById('reportBody');
    if (!report) return { blocked: 'Abre primero el reporte Blancco', changes: [], failedChecks: [] };
    const state = readItemState(document);
    const proposal = proposeValues(readReportPairs(report), state.notes);
    return { ...planChanges(proposal, state.current, state.serial, state.productType), failedChecks: proposal.failedChecks };
  }

  function run() {
    if (busy) return;
    const plan = computePlan();
    if (plan.blocked) return openPanel(el('p', plan.blocked));

    const parts = [];
    if (plan.failedChecks.length) {
      parts.push(el('p', '⚠ Hardware check falló: ' + plan.failedChecks.join(', '), 'aa-warn'));
    }
    parts.push(block('Campos (se guardan al pulsar Save)', plan.changes.filter(c => !c.instant),
      'Aplicar campos', 'Revisa y pulsa Save tú mismo.', []));
    const defaulted = plan.changes.filter(c => c.instant && c.defaulted && c.action === 'apply');
    parts.push(block('Atributos (⚠ iinvision los guarda al instante)', plan.changes.filter(c => c.instant),
      'Aplicar atributos (se guardan ya)', 'Atributos guardados en iinvision.',
      defaulted.length ? [el('p', '⚠ No se encontraron en el reporte: ' + defaulted.map(c => c.target.label).join(', ') +
        '. Se pondrá 1 por defecto.', 'aa-warn')] : []));
    openPanel(...parts);
  }

  // Un bloque del panel: tabla de cambios + su propio botón de aplicar.
  function block(title, changes, buttonText, doneText, notes) {
    const wrap = el('div', null, 'aa-block');
    wrap.append(el('h4', title));
    if (!changes.length) { wrap.append(el('p', 'Nada en esta ficha.')); return wrap; }
    const table = el('table');
    const shown = [];
    const statusById = {};
    const confirmById = {};
    for (const c of changes) {
      const tr = el('tr', null, 'aa-' + c.action);
      const status = el('td', STATUS[c.action]);
      if (c.action === 'apply' && c.confirm) {
        const box = el('input');
        box.type = 'checkbox';
        const label = el('label');
        label.append(box, ' Confirmar');
        status.replaceChildren(label);
        confirmById[c.target.id] = box;
      }
      tr.append(el('td', c.target.label), el('td', show(c.current) + ' → ' + show(c.proposed) + (c.defaulted ? ' (por defecto)' : '')), status);
      table.append(tr);
      if (c.action === 'apply') { shown.push(c); statusById[c.target.id] = status; }
    }
    const apply = el('button', buttonText);
    apply.type = 'button';
    apply.disabled = shown.length === 0;
    const row = el('div', null, 'aa-actions');
    row.append(apply);
    wrap.append(table, ...notes, row);
    apply.addEventListener('click', async () => {
      if (busy) return;
      apply.disabled = true;
      const fresh = computePlan();
      if (fresh.blocked) { row.prepend(el('span', fresh.blocked, 'aa-warn')); return; }
      const confirmed = shown.filter(c => !confirmById[c.target.id] || confirmById[c.target.id].checked);
      const todo = stillToApply(confirmed, fresh);
      busy = btn.disabled = true;
      try {
        for (const c of shown) {
          if (todo.some(t => t.target.id === c.target.id)) continue;
          statusById[c.target.id].textContent = confirmed.includes(c) ? '— Cambió, no se aplicó' : 'Sin confirmar, no se aplicó';
        }
        for (const change of todo) {
          const ok = await applyChange(document, change);
          statusById[change.target.id].textContent = ok ? '✔ Aplicado' : '✘ No se pudo';
        }
      } finally {
        busy = btn.disabled = false;
      }
      row.prepend(el('span', doneText));
    });
    return wrap;
  }
})();
