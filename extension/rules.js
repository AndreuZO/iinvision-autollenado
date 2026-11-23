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

if (typeof module !== 'undefined') module.exports = { proposeValues, acAdapterFromNotes };
