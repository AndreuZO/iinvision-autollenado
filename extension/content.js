// Botón "Autollenar" + panel de resumen. Nunca pulsa Save.
(function () {
  // Textos en español para el panel (iinvision y Blancco están en inglés).
  const FIELD_ES = {
    incoming_HasWireless: '¿Tiene WiFi? (Incoming)',
    current_HasWireless: '¿Tiene WiFi?',
    incoming_HasEthernet: '¿Tiene Gigabit Ethernet? (Incoming)',
    current_HasEthernet: '¿Tiene Gigabit Ethernet?',
    current_HasTouchscreen: '¿Tiene pantalla táctil?',
    current_HasWebcam: '¿Tiene webcam?',
    'chk:item.hasBattery': '¿Tiene batería?',
    'chk:item.hasAdapter': '¿Tiene adaptador AC?',
    'attr:Fingerprint Scanner': 'Lector de huella',
    'attr:WWAN': 'WWAN',
    'combo:Screen Resolution': 'Resolución de pantalla',
    'attr:Webcam': 'Webcam',
    'attr:Touchscreen': 'Pantalla táctil',
    'attr:Bluetooth': 'Bluetooth',
    'combo:HDMI Ports': 'Puertos HDMI',
    'combo:SD Card Slots': 'Ranuras SD',
    'field:item.anti': 'Anti-Theft activado',
    notes: 'Notas',
  };
  const TEST_ES = {
    'Battery capacity': 'Capacidad de batería',
    'Motherboard': 'Placa madre',
    'Pointer': 'Puntero (touchpad)',
    'Keyboard': 'Teclado',
    'Touchscreen': 'Pantalla táctil',
    'Webcam': 'Webcam',
    'Display': 'Pantalla',
    'Speakers': 'Parlantes',
    'Microphone': 'Micrófono',
    'USB ports': 'Puertos USB',
    'SIM card presence': 'Tarjeta SIM',
  };
  // Razones conocidas de Blancco; las nuevas se muestran en inglés hasta agregarlas aquí.
  const REASON_ES = {
    'internal clock is off, check cmos battery.': 'el reloj interno está desfasado, revisar la pila CMOS',
    'component is missing or not detected.': 'el componente falta o no se detecta',
  };
  const NOTE = { conflict: 'Distinto, no se cambia', undetermined: 'No determinado' };
  const show = v => (v === true ? 'Sí' : v === false ? 'No' : v === null ? '—' : v === '' ? '(vacío)'
    : v === 'unspecified' ? 'Sin especificar' : v === 'None' ? 'Ninguno' : String(v));
  const fieldName = c => FIELD_ES[c.target.id] || c.target.label;
  const reasonEs = r => REASON_ES[r.trim().toLowerCase()] || r;
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const onItemPage = () => location.pathname.startsWith('/Item/Detail/');

  // Íconos dibujados en línea (nada se descarga).
  const ICON = {
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    x: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
    warn: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  };
  function icon(name, cls) {
    const span = el('span', null, cls);
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
    return span;
  }

  const btn = document.createElement('button');
  btn.id = 'aa-btn';
  btn.type = 'button';
  btn.textContent = 'Autollenar';
  btn.setAttribute('translate', 'no');
  btn.addEventListener('click', run);
  document.body.appendChild(btn);
  protectFromTranslation(document);

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

  function openPanel(subtitle, children) {
    closePanel();
    panel = el('div', null, 'aa-panel');
    panel.setAttribute('translate', 'no');
    const head = el('div', null, 'aa-head');
    const titles = el('div');
    const h3 = el('h3', 'Diagnóstico Blancco ');
    const unique = location.pathname.split('/').filter(Boolean).pop(); // /Item/Detail/<unique>
    if (/^\d+$/.test(unique)) h3.append(el('span', unique, 'aa-unique'));
    titles.append(h3, el('p', subtitle, 'aa-sub'));
    head.append(icon('bolt', 'aa-logo'), titles);
    const body = el('div', null, 'aa-body');
    body.append(...children);
    const close = el('button', 'Cancelar', 'aa-btn-ghost');
    close.type = 'button';
    close.addEventListener('click', closePanel);
    const actions = el('div', null, 'aa-actions');
    actions.append(close);
    panel.append(head, body, actions);
    document.body.appendChild(panel);
    return actions;
  }

  // Lee todo de nuevo (sin caché): la página puede haber cambiado.
  function computePlan() {
    const report = document.getElementById('reportBody');
    if (!report) return { blocked: 'Abre primero el reporte Blancco', changes: [], alerts: [] };
    if (reportTranslated(report)) {
      return { blocked: 'Chrome tradujo el reporte Blancco. Pulsa F5 y vuelve a abrirlo; la extensión lo mantiene en su idioma original.', changes: [], alerts: [] };
    }
    const state = readItemState(document);
    const proposal = proposeValues(readReportPairs(report), state.notes);
    return { ...planChanges(proposal, state.current, state.serial, state.productType), alerts: proposal.alerts };
  }

  function alertCard(a) {
    const failed = a.status === 'Falló';
    const card = el('div', null, 'aa-card ' + (failed ? 'aa-card-red' : 'aa-card-amber'));
    const text = el('div');
    text.append(el('strong', TEST_ES[a.name] || a.name),
      el('span', a.status + (a.reason ? ' · ' + reasonEs(a.reason) : ''), 'aa-card-msg'));
    card.append(icon(failed ? 'x' : 'warn', 'aa-icon'), text);
    return card;
  }

  const pill = (text, cls) => el('span', text, 'aa-pill' + (cls ? ' ' + cls : ''));

  // Aviso breve abajo a la derecha (el panel ya se cerró).
  function toast(text) {
    const t = el('div', text, 'aa-toast');
    t.setAttribute('translate', 'no');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 7000);
  }

  function run() {
    if (busy) return;
    const plan = computePlan();
    if (plan.blocked) return openPanel(plan.blocked, []);

    // Solo se listan los cambios; lo que ya está bien se resume en una línea.
    // Los atributos sin dato en el reporte no van en la lista: se llenan a mano.
    const manual = plan.changes.filter(c => c.defaulted && c.action === 'apply');
    const listed = plan.changes.filter(c => c.action !== 'same' && !manual.includes(c));
    const sameCount = plan.changes.filter(c => c.action === 'same').length;
    const shown = [];
    const statusById = {};
    const confirmById = {};
    const inputById = {};
    const parts = [];

    // Pruebas de Blancco que fallaron (rojo) o no se hicieron (ámbar), con su razón.
    if (plan.alerts.length) {
      parts.push(el('div', 'Requiere revisión', 'aa-section aa-section-red'));
      parts.push(...plan.alerts.map(alertCard));
    }

    if (manual.length) {
      const card = el('div', null, 'aa-card aa-card-amber');
      const text = el('div');
      text.append(el('strong', 'No están en el reporte'),
        el('span', 'Complétalos aquí (por defecto 1).', 'aa-card-msg'));
      const inputs = el('div', null, 'aa-inputs');
      for (const c of manual) {
        const input = el('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.value = c.proposed;
        const status = el('span', '', 'aa-status');
        const label = el('label', fieldName(c) + ' ');
        label.append(input, status);
        inputs.append(label);
        shown.push(c);
        statusById[c.target.id] = status;
        inputById[c.target.id] = input;
      }
      text.append(inputs);
      card.append(icon('warn', 'aa-icon'), text);
      parts.push(card);
    }

    for (const [title, group] of [['Campos que se actualizarán', listed.filter(c => !c.instant)],
                                  ['Atributos (se guardan al instante)', listed.filter(c => c.instant)]]) {
      if (!group.length) continue;
      parts.push(el('div', title, 'aa-section'));
      const list = el('div', null, 'aa-list');
      for (const c of group) {
        const row = el('div', null, 'aa-row aa-' + c.action);
        const name = el('div', null, 'aa-name');
        const status = el('span', NOTE[c.action] || '', 'aa-status');
        name.append(el('span', fieldName(c)), status);
        if (c.action === 'apply' && c.confirm) {
          const box = el('input');
          box.type = 'checkbox';
          const label = el('label', null, 'aa-confirm');
          label.append(box, ' Confirmar');
          status.append(label);
          confirmById[c.target.id] = box;
        }
        const change = el('div', null, 'aa-change');
        if (c.addition) change.append(pill('+ ' + c.addition, 'aa-pill-bad')); // solo existe con batería < 60%
        else {
          // Verde cuando se agrega algo; un "No"/"Ninguno" se muestra neutro, como en el diseño.
          const negative = c.proposed === false || c.proposed === 'None';
          const cls = c.action !== 'apply' ? '' : negative ? 'aa-pill-strong' : 'aa-pill-new';
          change.append(pill(show(c.current)), el('span', '→', 'aa-arrow'), pill(show(c.proposed), cls));
        }
        row.append(name, change);
        list.append(row);
        if (c.action === 'apply') { shown.push(c); statusById[c.target.id] = status; }
      }
      parts.push(list);
    }

    const foot = [];
    if (sameCount) foot.push('✔ ' + plural(sameCount, 'campo ya estaba bien', 'campos ya estaban bien') + '.');
    foot.push(shown.length ? 'Los cambios se guardan al presionar Save.' : 'Nada que aplicar.');
    parts.push(el('p', foot.join(' '), 'aa-foot'));

    const subtitle = plural(plan.alerts.length, 'prueba con alerta', 'pruebas con alerta') + ' · ' +
      plural(shown.length, 'campo por actualizar', 'campos por actualizar');
    const actions = openPanel(subtitle, parts);
    const apply = el('button', 'Aplicar cambios', 'aa-btn-primary');
    apply.type = 'button';
    actions.append(apply); // sin cambios igual sirve: lleva a Hardware check y Damages
    apply.addEventListener('click', async () => {
      if (busy) return;
      apply.disabled = true;
      const fresh = computePlan();
      if (fresh.blocked) { actions.prepend(el('span', fresh.blocked, 'aa-done aa-warn')); return; }
      const confirmed = shown.filter(c => !confirmById[c.target.id] || confirmById[c.target.id].checked);
      // Lo escrito a mano reemplaza el 1 por defecto; si no es un número, ese campo no se aplica.
      const todo = stillToApply(confirmed, fresh).flatMap(c => {
        const input = inputById[c.target.id];
        if (!input) return [c];
        const value = input.value.trim();
        if (!/^\d+$/.test(value)) { statusById[c.target.id].textContent = '✘ Falta un número'; return []; }
        return [{ ...c, proposed: value }];
      });
      busy = btn.disabled = true;
      try {
        for (const c of shown) {
          if (todo.some(t => t.target.id === c.target.id) || statusById[c.target.id].textContent.startsWith('✘')) continue;
          statusById[c.target.id].textContent = confirmed.includes(c) ? '— Cambió, no se aplicó' : 'Sin confirmar, no se aplicó';
        }
        for (const change of todo) {
          const ok = await applyChange(document, change);
          statusById[change.target.id].textContent = ok ? '✔ Aplicado' : '✘ No se pudo';
          statusById[change.target.id].classList.add(ok ? 'aa-ok' : 'aa-bad');
        }
      } finally {
        busy = btn.disabled = false;
      }
      // Si algo falló, el panel se queda abierto para que se vea qué; si no, se cierra y sigue con Damages.
      const failed = shown.filter(c => statusById[c.target.id].textContent.startsWith('✘')).length;
      if (failed) {
        actions.prepend(el('span', '✘ ' + plural(failed, 'campo no se aplicó', 'campos no se aplicaron') +
          '. Revísalo a mano; no se abrió Damages.', 'aa-done aa-warn'));
        return;
      }
      closePanel();
      const opened = goToDamages(document);
      toast((todo.length ? '✔ ' + plural(todo.length, 'cambio aplicado', 'cambios aplicados') + '. ' : '') +
        (opened ? 'Agrega los daños y pulsa Save.' : 'No se encontró el botón Add de Damages. Revisa y pulsa Save.'));
    });
  }
})();
