// Reglas puras: pares del reporte Blancco + notas -> valores propuestos.
// Sin DOM: se carga en el content script y en Node (tests).

function acAdapterFromNotes(notes) {
  const sin = /sin cargador/i.test(notes || '');
  const con = /con cargador/i.test(notes || '');
  return sin === con ? null : con;
}

function proposeValues(pairs, notes) {
  const hw = pairs.filter(p => p.section === 'Hardware Details');
  const has = label => hw.some(p => p.label === label);
  const anyValue = re => hw.some(p => re.test(p.value));
  const internal = hw.filter(p => p.label !== 'USB device'); // lo conectado por USB es externo
  const serial = hw.find(p => p.label === 'Serial');
  const display = hw.find(p => p.label === 'Display');
  const res = display && /Native Resolution:\s*(\d+x\d+)/.exec(display.value);
  return {
    serial: serial ? serial.value : null,
    fields: {
      wifi: hw.some(p => p.label.startsWith('Wi-Fi adapter')),
      ethernet: internal.some(p => /^(Ethernet|Network) adapter/i.test(p.label) || /ethernet/i.test(p.value)),
      battery: has('Battery'),
      touchscreen: has('Touchscreen'),
      webcam: anyValue(/camera/i),
      fingerprint: anyValue(/fingerprint/i),
      wwan: anyValue(/\b(WWAN|LTE|Mobile Broadband)\b/i),
      acAdapter: acAdapterFromNotes(notes),
      screenResolution: res ? res[1] : null,
    },
    failedChecks: pairs
      .filter(p => p.section === 'Hardware check' && /^Failed/.test(p.value))
      .map(p => p.label),
  };
}

// Campos físicos de la ficha. Prefijos: (ninguno) radio por id, chk: checkbox por etiqueta,
// attr: fila de Attributes, combo: combo Kendo en fila de Attributes.
const TARGETS = [
  { key: 'wifi', id: 'incoming_HasWireless', label: 'Has WiFi? (Incoming)' },
  { key: 'wifi', id: 'current_HasWireless', label: 'Has WiFi? (Current)' },
  { key: 'ethernet', id: 'incoming_HasEthernet', label: 'Has Gigabit Ethernet? (Incoming)' },
  { key: 'ethernet', id: 'current_HasEthernet', label: 'Has Gigabit Ethernet? (Current)' },
  { key: 'touchscreen', id: 'current_HasTouchscreen', label: 'Has Touchscreen?' },
  { key: 'webcam', id: 'current_HasWebcam', label: 'Has Webcam?' },
  { key: 'battery', id: 'chk:Has Battery?', label: 'Has Battery?' },
  { key: 'acAdapter', id: 'chk:Has AC Adapter?', label: 'Has AC Adapter?' },
  { key: 'fingerprint', id: 'attr:Fingerprint Scanner', label: 'Fingerprint Scanner' },
  { key: 'wwan', id: 'attr:WWAN', label: 'WWAN' },
  { key: 'screenResolution', id: 'combo:Screen Resolution', label: 'Screen Resolution' },
];

function actionFor(target, current, proposed) {
  if (proposed === null) return 'undetermined';
  if (current === proposed) return 'same';
  const isEmpty = current === 'unspecified' || current === '' ||
    (target.id.startsWith('chk:') && current === false);
  return isEmpty ? 'apply' : 'conflict';
}

function planChanges(proposal, current, itemSerial, productType) {
  if (!/notebook/i.test(productType || '')) return { blocked: 'Por ahora solo laptops', changes: [] };
  const norm = s => (s || '').trim().toUpperCase();
  if (!proposal.serial || norm(proposal.serial) !== norm(itemSerial)) {
    return { blocked: 'El reporte abierto no es de este equipo', changes: [] };
  }
  const changes = TARGETS.filter(t => t.id in current).map(t => {
    const proposed = proposal.fields[t.key];
    return { target: t, current: current[t.id], proposed, action: actionFor(t, current[t.id], proposed) };
  });
  return { blocked: null, changes };
}

if (typeof module !== 'undefined') module.exports = { proposeValues, acAdapterFromNotes, planChanges, TARGETS };
