const test = require('node:test');
const assert = require('node:assert/strict');
const { proposeValues, acAdapterFromNotes } = require('../extension/rules.js');
const fixture = require('./fixtures/x1-yoga.json');

const hw = (label, value) => ({ section: 'Hardware Details', label, value });

test('x1 yoga: valores propuestos', () => {
  const p = proposeValues(fixture, 'Case - Minor Dents; CON CARGADOR LENOVO TIPO C 65W');
  assert.equal(p.serial, 'TESTSERIAL1'); // el de Hardware Details, no el del disco
  assert.deepEqual(p.fields, { wifi: true, ethernet: false, battery: true, touchscreen: true,
    webcam: true, fingerprint: true, wwan: false, bluetooth: true, acAdapter: true, screenResolution: '1920x1200',
    hdmiPorts: null, sdCardSlots: null, antiTheft: 'None' });
  assert.deepEqual(p.alerts, [{ name: 'Webcam', status: 'Falló', reason: '' }]);
});

test('sin pares de Hardware Details: todo en false, resolución null, serial null', () => {
  const p = proposeValues([{ section: 'Erasure Results', label: 'Serial', value: 'X' }], '');
  assert.equal(p.serial, null);
  assert.deepEqual(p.fields, { wifi: false, ethernet: false, battery: false, touchscreen: false,
    webcam: false, fingerprint: false, wwan: false, bluetooth: false, acAdapter: null, screenResolution: null,
    hdmiPorts: null, sdCardSlots: null, antiTheft: 'None' });
  assert.deepEqual(p.alerts, []);
});

test('Ethernet interno cuenta', () => {
  const p = proposeValues([hw('Network adapter', 'Intel Corporation Ethernet Connection I219-LM')], '');
  assert.equal(p.fields.ethernet, true);
});

test('Ethernet por USB no cuenta', () => {
  const p = proposeValues([hw('USB device', 'Realtek USB GbE Ethernet Controller')], '');
  assert.equal(p.fields.ethernet, false);
});

test('WiFi por USB no cuenta', () => {
  const p = proposeValues([hw('USB device', 'TP-Link Wi-Fi USB adapter')], '');
  assert.equal(p.fields.wifi, false);
});

test('WWAN detectado por LTE, WWAN o Mobile Broadband', () => {
  for (const v of ['Fibocom L850-GL LTE Module', 'Intel XMM7360 WWAN', 'Sierra Mobile Broadband']) {
    assert.equal(proposeValues([hw('USB device', v)], '').fields.wwan, true, v);
  }
});

test('Touchscreen solo en Hardware check no cuenta', () => {
  const p = proposeValues([{ section: 'Hardware check', label: 'Touchscreen', value: 'Successful' }], '');
  assert.equal(p.fields.touchscreen, false);
});

test('acAdapterFromNotes', () => {
  assert.equal(acAdapterFromNotes('con cargador hp'), true);
  assert.equal(acAdapterFromNotes('SIN CARGADOR'), false);
  assert.equal(acAdapterFromNotes('Sin Cargador; con cargador'), null);
  assert.equal(acAdapterFromNotes(''), null);
});

// ---- Task 2: planChanges ----
const { planChanges, TARGETS } = require('../extension/rules.js');
const prop = proposeValues(fixture, 'CON CARGADOR');
const empty = () => ({
  incoming_HasWireless: 'unspecified', current_HasWireless: 'unspecified',
  incoming_HasEthernet: 'unspecified', current_HasEthernet: 'unspecified',
  current_HasTouchscreen: 'unspecified', current_HasWebcam: 'unspecified',
  'chk:Has Battery?': false, 'chk:Has AC Adapter?': false,
  'attr:Fingerprint Scanner': 'unspecified', 'attr:WWAN': 'unspecified',
  'combo:Screen Resolution': '',
  'attr:Webcam': 'unspecified', 'attr:Touchscreen': 'unspecified', 'attr:Bluetooth': 'unspecified',
  'combo:HDMI Ports': '', 'combo:SD Card Slots': '', 'field:item.anti': '',
  notes: '',
});
const plan = (current, serial = 'TESTSERIAL1', type = 'PC - Notebook', p = prop) =>
  planChanges(p, current, serial, type);
const find = (r, id) => r.changes.find(c => c.target.id === id);

test('TARGETS cubre los 18 campos', () => {
  assert.deepEqual(TARGETS.map(t => t.id).sort(), Object.keys(empty()).sort());
});

test('campos vacíos -> apply; iguales -> same; distintos -> conflict', () => {
  const r = plan({ ...empty(), current_HasWireless: true, incoming_HasEthernet: true });
  assert.equal(r.blocked, null);
  assert.equal(find(r, 'incoming_HasWireless').action, 'apply');
  assert.equal(find(r, 'current_HasWireless').action, 'same');
  assert.equal(find(r, 'incoming_HasEthernet').action, 'conflict');
  assert.equal(find(r, 'incoming_HasEthernet').proposed, false);
});

test('checkbox nunca se desmarca', () => {
  const noAc = proposeValues(fixture, 'SIN CARGADOR');
  assert.equal(find(plan(empty()), 'chk:Has AC Adapter?').action, 'apply');
  assert.equal(find(plan({ ...empty(), 'chk:Has AC Adapter?': true }, 'TESTSERIAL1', 'PC - Notebook', noAc), 'chk:Has AC Adapter?').action, 'conflict');
  assert.equal(find(plan(empty(), 'TESTSERIAL1', 'PC - Notebook', noAc), 'chk:Has AC Adapter?').action, 'same');
});

test('acAdapter null -> undetermined', () => {
  const r = plan(empty(), 'TESTSERIAL1', 'PC - Notebook', proposeValues(fixture, ''));
  assert.equal(find(r, 'chk:Has AC Adapter?').action, 'undetermined');
});

test('combo screenResolution', () => {
  assert.equal(find(plan(empty()), 'combo:Screen Resolution').action, 'apply');
  assert.equal(find(plan({ ...empty(), 'combo:Screen Resolution': '1366x768' }), 'combo:Screen Resolution').action, 'conflict');
  const noRes = { ...prop, fields: { ...prop.fields, screenResolution: null } };
  assert.equal(find(plan(empty(), 'TESTSERIAL1', 'PC - Notebook', noRes), 'combo:Screen Resolution').action, 'undetermined');
});

test('campo que no existe en la ficha se omite', () => {
  const cur = empty(); delete cur['attr:WWAN'];
  assert.equal(find(plan(cur), 'attr:WWAN'), undefined);
});

test('serial distinto bloquea', () => {
  assert.deepEqual(plan(empty(), 'OTRO'), { blocked: 'El reporte abierto no es de este equipo', changes: [] });
});

test('serial igual ignora espacios y mayúsculas', () => {
  assert.equal(plan(empty(), ' testserial1 ').blocked, null);
});

test('serial null bloquea', () => {
  const p = { ...prop, serial: null };
  assert.equal(plan(empty(), 'TESTSERIAL1', 'PC - Notebook', p).blocked, 'El reporte abierto no es de este equipo');
});

test('product type sin Notebook bloquea', () => {
  assert.deepEqual(plan(empty(), 'TESTSERIAL1', 'PC - Desktop'), { blocked: 'Por ahora solo laptops y todo en uno', changes: [] });
});

test('idempotente', () => {
  const cur = empty();
  for (const c of plan(cur).changes) if (c.action === 'apply') cur[c.target.id] = c.proposed;
  assert.equal(plan(cur).changes.filter(c => c.action === 'apply').length, 0);
});

// ---- Final review: re-validar al pulsar Aplicar ----
const { stillToApply } = require('../extension/rules.js');

test('stillToApply: campo cambiado a mano después del resumen no se aplica', () => {
  const shown = plan(empty()).changes.filter(c => c.action === 'apply');
  const fresh = plan({ ...empty(), current_HasWireless: false }); // auditor puso No a mano
  const ids = stillToApply(shown, fresh).map(c => c.target.id);
  assert.ok(!ids.includes('current_HasWireless'));
  assert.ok(ids.includes('incoming_HasWireless'));
});

test('stillToApply: otro equipo (plan bloqueado) no aplica nada', () => {
  const shown = plan(empty()).changes.filter(c => c.action === 'apply');
  assert.deepEqual(stillToApply(shown, plan(empty(), 'OTRO')), []);
});

test('stillToApply: solo lo que se mostró en el resumen', () => {
  const shown = plan(empty()).changes.filter(c => c.target.id === 'attr:WWAN');
  assert.deepEqual(stillToApply(shown, plan(empty())).map(c => c.target.id), ['attr:WWAN']);
});

// ---- Reporte real con puerto de red (ThinkCentre M70a, todo en uno) ----
test('m70a: Network Adapter interno -> ethernet true; sin batería ni touchscreen', () => {
  const p = proposeValues(require('./fixtures/m70a-aio.json'), '');
  assert.deepEqual(p.fields, { wifi: true, ethernet: true, battery: false, touchscreen: false,
    webcam: true, fingerprint: false, wwan: false, bluetooth: true, acAdapter: null, screenResolution: '1920x1080',
    hdmiPorts: '1', sdCardSlots: null, antiTheft: 'None' });
});

test('m70a: todo en uno se acepta y llena Current y sus atributos', () => {
  const p = proposeValues(require('./fixtures/m70a-aio.json'), '');
  const cur = { incoming_HasWireless: true, current_HasWireless: 'unspecified', incoming_HasEthernet: true,
    current_HasEthernet: 'unspecified', current_HasTouchscreen: 'unspecified', current_HasWebcam: 'unspecified',
    'chk:Has Battery?': false, 'chk:Has AC Adapter?': false,
    'attr:Webcam': 'unspecified', 'attr:Touchscreen': 'unspecified', 'attr:Bluetooth': 'unspecified' };
  const r = planChanges(p, cur, 'TESTSERIAL2', 'PC - All-In-One');
  assert.equal(r.blocked, null);
  const act = Object.fromEntries(r.changes.map(c => [c.target.id, c.action + ':' + c.proposed]));
  assert.deepEqual(act, {
    incoming_HasWireless: 'same:true', current_HasWireless: 'apply:true',
    incoming_HasEthernet: 'same:true', current_HasEthernet: 'apply:true',
    current_HasTouchscreen: 'apply:false', current_HasWebcam: 'apply:true',
    'chk:Has Battery?': 'same:false', 'chk:Has AC Adapter?': 'undetermined:null',
    'attr:Webcam': 'apply:true', 'attr:Touchscreen': 'apply:false', 'attr:Bluetooth': 'apply:true' });
});

// ---- Reporte real Dell Latitude 3420 (cámara llamada "IntegratedWebcamHD") ----
test('latitude 3420: cámara "Webcam" cuenta como webcam', () => {
  const p = proposeValues(require('./fixtures/latitude-3420.json'), 'CON CARGADOR DELL');
  assert.deepEqual(p.fields, { wifi: true, ethernet: true, battery: true, touchscreen: false,
    webcam: true, fingerprint: false, wwan: false, bluetooth: true, acAdapter: true, screenResolution: '1920x1080',
    hdmiPorts: null, sdCardSlots: null, antiTheft: 'None' });
  assert.deepEqual(p.alerts, [
    { name: 'Battery capacity', status: 'Falló', reason: '58% (< 60%)' },
    { name: 'Motherboard', status: 'Falló', reason: 'Internal clock is off, check CMOS battery.' },
    { name: 'Pointer', status: 'No se probó', reason: '' },
  ]); // Successful y Not available (componente que no existe) se ignoran
});

// ---- HDMI, SD, Anti Theft, valores por defecto y atributos instantáneos ----
test('Anti Theft: Autopilot activo -> Microsoft Intune; no activo o desconocido -> None', () => {
  for (const v of ['Enrolled', 'Enabled', 'Active']) assert.equal(proposeValues([hw('Autopilot status', v)], '').fields.antiTheft, 'Microsoft Intune', v);
  for (const v of ['Not enrolled', 'Unknown', 'Disabled', 'algo raro']) assert.equal(proposeValues([hw('Autopilot status', v)], '').fields.antiTheft, 'None', v);
});

test('SD Card Slots: lector de tarjetas en el reporte -> 1', () => {
  assert.equal(proposeValues([hw('USB device', 'Realtek USB 3.0 Card Reader')], '').fields.sdCardSlots, '1');
});

test('HDMI y SD sin dato en el reporte -> 1 por defecto, marcado como defaulted', () => {
  const r = plan(empty());
  assert.deepEqual([find(r, 'combo:HDMI Ports'), find(r, 'combo:SD Card Slots')].map(c => [c.action, c.proposed, c.defaulted]),
    [['apply', '1', true], ['apply', '1', true]]);
});

test('HDMI del reporte no es defaulted', () => {
  const r = planChanges(proposeValues(require('./fixtures/m70a-aio.json'), ''), { 'combo:HDMI Ports': '' }, 'TESTSERIAL2', 'PC - All-In-One');
  assert.deepEqual([r.changes[0].proposed, r.changes[0].defaulted], ['1', false]);
});

test('HDMI ya lleno con otro valor -> conflict, no se toca', () => {
  assert.equal(find(plan({ ...empty(), 'combo:HDMI Ports': '2' }), 'combo:HDMI Ports').action, 'conflict');
});

test('Anti Theft Microsoft Intune pide confirmación; None no', () => {
  assert.equal(find(plan(empty()), 'field:item.anti').confirm, false);
  const p = { ...prop, fields: { ...prop.fields, antiTheft: 'Microsoft Intune' } };
  assert.equal(find(plan(empty(), 'TESTSERIAL1', 'PC - Notebook', p), 'field:item.anti').confirm, true);
});

test('atributos (attr:, combo:) son instantáneos; el resto no', () => {
  const r = plan(empty());
  assert.equal(find(r, 'attr:WWAN').instant, true);
  assert.equal(find(r, 'combo:HDMI Ports').instant, true);
  assert.equal(find(r, 'current_HasWireless').instant, false);
  assert.equal(find(r, 'field:item.anti').instant, false);
});

// ---- Nota de batería cuando falla "Battery capacity" (< 60%) ----
const dell = () => proposeValues(require('./fixtures/latitude-3420.json'), 'CON CARGADOR DELL');
const planDell = notes => planChanges(dell(), { notes }, 'TESTSERIAL3', 'PC - Notebook');

test('batería fallida -> nota "Estado de Bateria : 58%"', () => {
  assert.equal(dell().batteryNote, 'Estado de Bateria : 58%');
});

test('batería sana -> sin nota', () => {
  assert.equal(proposeValues(fixture, '').batteryNote, null);
  assert.equal(find(plan(empty()), 'notes'), undefined);
});

test('nota se agrega al final con "; "', () => {
  const c = planDell('SE COLOCA VOID; CON CARGADOR DELL').changes[0];
  assert.deepEqual([c.action, c.proposed, c.instant], ['apply', 'SE COLOCA VOID; CON CARGADOR DELL; Estado de Bateria : 58%', false]);
});

test('notas vacías -> solo la línea de batería', () => {
  assert.equal(planDell('').changes[0].proposed, 'Estado de Bateria : 58%');
});

test('nota ya presente -> same; otro porcentaje -> conflict', () => {
  assert.equal(planDell('X; Estado de Bateria : 58%').changes[0].action, 'same');
  assert.equal(planDell('X; estado de bateria : 70%').changes[0].action, 'conflict');
});

test('alertas: formato real de la página, sin coma después de Failed', () => {
  const chk = (label, value) => ({ section: 'Hardware check', label, value });
  assert.deepEqual(proposeValues([chk('Battery capacity', 'Failed 58% ( 59%)'),
    chk('Motherboard', 'Failed Internal clock is off, check CMOS battery.'),
    chk('Touchscreen', 'Not available Component is missing or not detected.')], '').alerts, [
    { name: 'Battery capacity', status: 'Falló', reason: '58% (< 60%)' },
    { name: 'Motherboard', status: 'Falló', reason: 'Internal clock is off, check CMOS battery.' },
  ]);
});

// ---- Regla del auditor: batería al 60% o menos = alerta + nota, aunque Blancco diga Successful ----
const chkB = value => [{ section: 'Hardware check', label: 'Battery capacity', value }];
test('batería 59% con Successful -> alerta y nota', () => {
  const p = proposeValues(chkB('Successful 59%'), '');
  assert.deepEqual(p.alerts, [{ name: 'Battery capacity', status: 'Falló', reason: '59% (< 60%)' }]);
  assert.equal(p.batteryNote, 'Estado de Bateria : 59%');
});
test('batería 60% -> sin alerta ni nota', () => {
  const p = proposeValues(chkB('Successful, 60%'), '');
  assert.deepEqual([p.alerts, p.batteryNote], [[], null]);
});
