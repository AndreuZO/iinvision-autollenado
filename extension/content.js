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
    const body = el('div', null, 'aa-body');
    body.append(...children);
    panel.append(el('h3', 'Autollenado desde Blancco'), body);
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
    if (!report) return { blocked: 'Abre primero el reporte Blancco', changes: [], alerts: [] };
    const state = readItemState(document);
    const proposal = proposeValues(readReportPairs(report), state.notes);
    return { ...planChanges(proposal, state.current, state.serial, state.productType), alerts: proposal.alerts };
  }

  function run() {
    if (busy) return;
    const plan = computePlan();
    if (plan.blocked) return openPanel(el('p', plan.blocked));

    // Solo se listan los cambios; lo que ya está bien se resume en una línea (panel compacto).
    const listed = plan.changes.filter(c => c.action !== 'same');
    const sameCount = plan.changes.length - listed.length;
    const table = el('table');
    const shown = [];
    const statusById = {};
    const confirmById = {};
    for (const [title, group] of [['Campos (se guardan con Save)', listed.filter(c => !c.instant)],
                                  ['Atributos (se guardan al instante)', listed.filter(c => c.instant)]]) {
      if (!group.length) continue;
      const head = el('tr', null, 'aa-group');
      const th = el('td', title);
      th.colSpan = 3;
      head.append(th);
      table.append(head);
      for (const c of group) {
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
        const change = c.addition ? '+ ' + c.addition : show(c.current) + ' → ' + show(c.proposed) + (c.defaulted ? ' (por defecto)' : '');
        tr.append(el('td', c.target.label), el('td', change), status);
        table.append(tr);
        if (c.action === 'apply') { shown.push(c); statusById[c.target.id] = status; }
      }
    }

    const parts = [];
    // Pruebas de Blancco que fallaron o no se hicieron: en rojo, con su razón.
    for (const a of plan.alerts) {
      parts.push(el('p', '✖ ' + a.name + ': ' + a.status + (a.reason ? ' — ' + a.reason : ''), 'aa-error'));
    }
    const defaulted = shown.filter(c => c.defaulted);
    if (defaulted.length) {
      parts.push(el('p', '⚠ No se encontraron en el reporte: ' + defaulted.map(c => c.target.label).join(', ') + '. Se pondrá 1 por defecto.', 'aa-warn'));
    }
    if (shown.some(c => c.instant)) parts.push(el('p', '⚠ Los atributos se guardan en iinvision al pulsar Aplicar.', 'aa-warn'));
    parts.push(table);
    if (sameCount) parts.push(el('p', '✔ ' + sameCount + ' campos ya estaban bien.', 'aa-muted'));
    if (!shown.length) parts.push(el('p', 'Nada que aplicar.', 'aa-muted'));

    const actions = openPanel(...parts);
    const apply = el('button', 'Aplicar');
    apply.type = 'button';
    apply.disabled = shown.length === 0;
    actions.prepend(apply);
    apply.addEventListener('click', async () => {
      if (busy) return;
      apply.disabled = true;
      const fresh = computePlan();
      if (fresh.blocked) { actions.prepend(el('span', fresh.blocked, 'aa-warn')); return; }
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
      actions.prepend(el('span', 'Listo. Revisa y pulsa Save.', 'aa-muted'));
    });
  }
})();
