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
  const hdmi = /HDMI:\s*(\d+)/i.exec(hw.find(p => p.label === 'Ports')?.value || '');
  const autopilot = hw.find(p => p.label === 'Autopilot status')?.value || '';
  // Solo un estado claramente activo cuenta; lo no reconocido queda en None (pedido del auditor).
  const autopilotActive = /\b(enabled|active|enrolled)\b/i.test(autopilot) && !/\b(not|unknown|disabled|inactive)\b/i.test(autopilot);
  return {
    serial: serial ? serial.value : null,
    fields: {
      wifi: hw.some(p => p.label.startsWith('Wi-Fi adapter')),
      ethernet: internal.some(p => /^(Ethernet|Network) adapter/i.test(p.label) || /ethernet/i.test(p.value)),
      battery: has('Battery'),
      touchscreen: has('Touchscreen'),
      webcam: anyValue(/camera|webcam/i), // Lenovo: "Integrated Camera"; Dell: "IntegratedWebcamHD"
      fingerprint: anyValue(/fingerprint/i),
      wwan: anyValue(/\b(WWAN|LTE|Mobile Broadband)\b/i),
      bluetooth: hw.some(p => p.label.startsWith('Bluetooth adapter')),
      acAdapter: acAdapterFromNotes(notes),
      screenResolution: res ? res[1] : null,
      hdmiPorts: hdmi ? hdmi[1] : null,
      sdCardSlots: anyValue(/card reader/i) ? '1' : null,
      antiTheft: autopilotActive ? 'Microsoft Intune' : 'None',
    },
    alerts: hardwareAlerts(pairs),
    batteryNote: batteryNote(pairs),
  };
}

// Pruebas de "Hardware check" que el auditor debe ver en rojo: Failed y Not performed, con su razón.
// Successful se ignora, y Not available también (el equipo no tiene ese componente).
const ALERT_STATUS = { 'failed': 'Falló', 'not performed': 'No se probó' };
const BATTERY_LIMIT = 60; // regla del auditor: batería por debajo del 60% es una falla
function hardwareAlerts(pairs) {
  return pairs.filter(p => p.section === 'Hardware check').flatMap(p => {
    if (p.label === 'Battery capacity') {
      const missing = batteryMissing(pairs);
      if (missing !== null) return [{ name: p.label, status: 'No detectada', reason: missing }];
      const pct = weakBattery(pairs);
      return pct === null ? [] : [{ name: p.label, status: 'Falló', reason: pct + '% (mínimo ' + BATTERY_LIMIT + '%)' }];
    }
    const m = /^(Failed|Not performed)\b[,\s]*(.*)$/i.exec(p.value); // en la página no siempre hay coma
    return m ? [{ name: p.label, status: ALERT_STATUS[m[1].toLowerCase()], reason: m[2] || '' }] : [];
  });
}

// Porcentaje de salud de la batería si está por debajo del 60% (o si Blancco la marca Failed); si no, null.
function weakBattery(pairs) {
  const check = pairs.find(p => p.section === 'Hardware check' && p.label === 'Battery capacity');
  const pct = check && /(\d+)\s*%/.exec(check.value);
  if (!pct) return null;
  return Number(pct[1]) < BATTERY_LIMIT || /^Failed/i.test(check.value) ? Number(pct[1]) : null;
}

// Regla del auditor: "Not available" en Battery capacity = batería no detectada (requiere revisión).
// Devuelve la razón de Blancco ('' si no trae) o null si la batería sí se detectó.
function batteryMissing(pairs) {
  const check = pairs.find(p => p.section === 'Hardware check' && p.label === 'Battery capacity');
  const m = check && /^Not available\b[,\s]*(.*)$/i.exec(check.value);
  return m ? m[1] : null;
}

function batteryNote(pairs) {
  if (batteryMissing(pairs) !== null) return 'Bateria no detectada';
  const pct = weakBattery(pairs);
  return pct === null ? null : 'Estado de Bateria : ' + pct + '%';
}

// Campos físicos de la ficha. Prefijos: (ninguno) radio por id, chk: checkbox por clave i18n de su etiqueta (no cambia con el idioma),
// attr: fila de Attributes, combo: combo Kendo en fila de Attributes.
const TARGETS = [
  { key: 'wifi', id: 'incoming_HasWireless', label: 'Has WiFi? (Incoming)' },
  { key: 'wifi', id: 'current_HasWireless', label: 'Has WiFi? (Current)' },
  { key: 'ethernet', id: 'incoming_HasEthernet', label: 'Has Gigabit Ethernet? (Incoming)' },
  { key: 'ethernet', id: 'current_HasEthernet', label: 'Has Gigabit Ethernet? (Current)' },
  { key: 'touchscreen', id: 'current_HasTouchscreen', label: 'Has Touchscreen?' },
  { key: 'webcam', id: 'current_HasWebcam', label: 'Has Webcam?' },
  { key: 'battery', id: 'chk:item.hasBattery', label: 'Has Battery?' },
  { key: 'acAdapter', id: 'chk:item.hasAdapter', label: 'Has AC Adapter?' },
  { key: 'fingerprint', id: 'attr:Fingerprint Scanner', label: 'Fingerprint Scanner' },
  { key: 'wwan', id: 'attr:WWAN', label: 'WWAN' },
  { key: 'screenResolution', id: 'combo:Screen Resolution', label: 'Screen Resolution' },
  // Atributos que trae la ficha de un todo en uno (en laptops estas filas son de solo lectura)
  { key: 'webcam', id: 'attr:Webcam', label: 'Webcam (atributo)' },
  { key: 'touchscreen', id: 'attr:Touchscreen', label: 'Touchscreen (atributo)' },
  { key: 'bluetooth', id: 'attr:Bluetooth', label: 'Bluetooth (atributo)' },
  { key: 'hdmiPorts', id: 'combo:HDMI Ports', label: 'HDMI Ports' },
  { key: 'sdCardSlots', id: 'combo:SD Card Slots', label: 'SD Card Slots' },
  { key: 'antiTheft', id: 'field:item.anti', label: 'Anti Theft Activated' }, // field: combo por kendo-label title
  { key: 'batteryNote', id: 'notes', label: 'Notas' }, // se agrega una línea, nunca se reemplaza
];

// Si el reporte no trae el dato, se propone este valor y el panel lo avisa (pedido del auditor).
const DEFAULTS = { hdmiPorts: '1', sdCardSlots: '1' };

function actionFor(target, current, proposed) {
  if (proposed === null) return 'undetermined';
  if (current === proposed) return 'same';
  const isEmpty = current === 'unspecified' || current === '' ||
    (target.id.startsWith('chk:') && current === false) ||
    (target.key in DEFAULTS && current === '0'); // iinvision trae HDMI/SD en 0 de fábrica (pedido del auditor)
  return isEmpty ? 'apply' : 'conflict';
}

function planChanges(proposal, current, itemSerial, productType) {
  if (!/notebook|all-in-one/i.test(productType || '')) return { blocked: 'Por ahora solo laptops y todo en uno', changes: [] };
  const norm = s => (s || '').trim().toUpperCase();
  if (!proposal.serial || norm(proposal.serial) !== norm(itemSerial)) {
    return { blocked: 'El reporte abierto no es de este equipo', changes: [] };
  }
  const changes = TARGETS.filter(t => t.id in current && !(t.key === 'batteryNote' && !proposal.batteryNote)).map(t => {
    if (t.key === 'batteryNote') return noteChange(t, current[t.id], proposal.batteryNote);
    const defaulted = proposal.fields[t.key] === null && t.key in DEFAULTS;
    const proposed = defaulted ? DEFAULTS[t.key] : proposal.fields[t.key];
    return {
      target: t, current: current[t.id], proposed, action: actionFor(t, current[t.id], proposed),
      defaulted,
      instant: /^(attr|combo):/.test(t.id), // iinvision guarda los atributos al instante, sin Save
      confirm: t.key === 'antiTheft' && proposed !== 'None',
    };
  });
  return { blocked: null, changes };
}

// Agrega la línea al final de las notas; si ya hay otra nota de batería, no se toca.
function noteChange(target, notes, line) {
  const action = notes.includes(line) ? 'same' : /estado de bateria|bateria no detectada/i.test(notes) ? 'conflict' : 'apply';
  const proposed = action === 'apply' ? (notes.trim() ? notes.trim() + '; ' + line : line) : notes;
  return { target, current: notes, proposed, action, addition: line, defaulted: false, instant: false, confirm: false };
}

// Al pulsar Aplicar: de lo que se mostró, solo lo que en un plan recién leído sigue
// siendo 'apply' con el mismo valor (el auditor pudo editar o cambiar de equipo).
function stillToApply(shown, freshPlan) {
  if (freshPlan.blocked) return [];
  return freshPlan.changes.filter(c => c.action === 'apply' &&
    shown.some(s => s.target.id === c.target.id && s.proposed === c.proposed));
}

if (typeof module !== 'undefined') module.exports = { proposeValues, acAdapterFromNotes, planChanges, TARGETS, stillToApply };
