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
  // iinvision es una SPA: el botón se muestra solo en fichas de equipo.
  setInterval(() => { btn.hidden = !onItemPage(); }, 1000);
  btn.hidden = !onItemPage();

  let panel = null;
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
    const close = el('button', 'Cerrar');
    close.type = 'button';
    close.addEventListener('click', closePanel);
    const actions = el('div', null, 'aa-actions');
    actions.append(close);
    panel.append(actions);
    document.body.appendChild(panel);
    return actions;
  }

  function run() {
    // Se lee todo de nuevo en cada clic: la página puede haber cambiado de equipo.
    const report = document.getElementById('reportBody');
    if (!report) return openPanel(el('p', 'Abre primero el reporte Blancco'));
    const state = readItemState(document);
    const proposal = proposeValues(readReportPairs(report), state.notes);
    const plan = planChanges(proposal, state.current, state.serial, state.productType);
    if (plan.blocked) return openPanel(el('p', plan.blocked));

    const table = el('table');
    for (const c of plan.changes) {
      const tr = el('tr', null, 'aa-' + c.action);
      tr.append(el('td', c.target.label), el('td', show(c.current) + ' → ' + show(c.proposed)), el('td', STATUS[c.action]));
      table.append(tr);
    }
    const parts = [table];
    if (proposal.failedChecks.length) {
      parts.push(el('p', '⚠ Hardware check falló: ' + proposal.failedChecks.join(', '), 'aa-warn'));
    }
    const actions = openPanel(...parts);
    const apply = el('button', 'Aplicar');
    apply.type = 'button';
    apply.disabled = true; // se habilita en la siguiente entrega
    actions.prepend(apply);
  }
})();
