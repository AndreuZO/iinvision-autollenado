const test = require('node:test');
const assert = require('node:assert/strict');
const { proposeValues, acAdapterFromNotes } = require('../extension/rules.js');
const fixture = require('./fixtures/x1-yoga.json');

const hw = (label, value) => ({ section: 'Hardware Details', label, value });

test('x1 yoga: valores propuestos', () => {
  const p = proposeValues(fixture, 'Case - Minor Dents; CON CARGADOR LENOVO TIPO C 65W');
  assert.equal(p.serial, 'TESTSERIAL1'); // el de Hardware Details, no el del disco
  assert.deepEqual(p.fields, { wifi: true, ethernet: false, battery: true, touchscreen: true,
    webcam: true, fingerprint: true, wwan: false, acAdapter: true, screenResolution: '1920x1200' });
  assert.deepEqual(p.failedChecks, ['Webcam']);
});

test('sin pares de Hardware Details: todo en false, resolución null, serial null', () => {
  const p = proposeValues([{ section: 'Erasure Results', label: 'Serial', value: 'X' }], '');
  assert.equal(p.serial, null);
  assert.deepEqual(p.fields, { wifi: false, ethernet: false, battery: false, touchscreen: false,
    webcam: false, fingerprint: false, wwan: false, acAdapter: null, screenResolution: null });
  assert.deepEqual(p.failedChecks, []);
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
