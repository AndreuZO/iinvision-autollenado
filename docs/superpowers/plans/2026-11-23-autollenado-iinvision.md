# Autollenado iinvision — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extensión de Chrome que, en la ficha de una laptop en iinvision, lee el reporte Blancco abierto y las Notas, muestra un resumen de cambios y, al confirmar, llena solo los campos vacíos.

**Architecture:** Tres capas. `rules.js` es puro (pares del reporte + notas → valores propuestos → lista de cambios) y se prueba con Node. `page.js` es la única capa que toca el DOM de iinvision (leer estado, aplicar un cambio). `content.js` agrega el botón y el panel de resumen y conecta las dos.

**Tech Stack:** Chrome Extension Manifest V3, JavaScript plano sin dependencias ni build; pruebas con `node --test` (Node ≥ 18) y `node:assert`.

**Spec:** `docs/2026-11-23-autollenado-iinvision-diseno.md`

## Global Constraints

- Sin dependencias, sin build, sin permisos de red; `content_scripts.matches` = `https://iinvision.epcglobalsolutions.com/Item/Detail/*` y ningún otro permiso.
- La extensión **nunca** pulsa "Save" ni envía datos fuera de la página; no guarda datos de equipos.
- Nunca sobrescribe: solo cambia campos en Unspecified / vacíos / desmarcados. Un valor distinto ya puesto → conflicto, no se toca. Nunca desmarca un checkbox.
- Si el valor no se puede decidir → no se toca, se muestra "no determinado".
- Solo laptops: si "Product Type" de la ficha no contiene `Notebook` → aviso "Por ahora solo laptops", nada más.
- Serial del reporte (sección Hardware Details, `Serial:`) debe ser igual a "Serial #" de la ficha; si no → aviso "El reporte abierto no es de este equipo", nada más.
- Interacción con Angular/Kendo: aplicar simulando al usuario (`.click()` en radios/checkboxes; escribir y elegir en el combo), nunca asignar `.checked`/`.value` a secas.
- Textos de la interfaz en español.
- Pruebas manuales en iinvision (producción): **nunca pulsar Save**; recargar la página para descartar.

## Review Focus

1. **Reporte no abierto o cerrado** → aviso "Abre primero el reporte Blancco", ningún cambio. (Task 3, prueba manual)
2. **Reporte de otro equipo** (serial distinto) → ningún cambio. (Task 2, `planChanges` con serial distinto)
3. **Notas en minúsculas o con ambas frases** ("sin cargador", "con cargador … sin cargador") → insensible a mayúsculas; ambas → `null`. (Task 1)
4. **Resolución que no existe en el combo** → no se toca y se lista como no aplicada. (Task 4, prueba manual)
5. **Pulsar "Autollenar" dos veces, o cambiar de equipo sin recargar (SPA)** → la segunda vez todo sale "ya está", nada se alterna; cada clic vuelve a leer la página, sin caché. (Task 2 idempotencia + Task 3 manual)

---

## Estructura de archivos

```
extension/
  manifest.json     MV3; content script en Item/Detail/*
  rules.js          puro: proposeValues, planChanges (exporta a Node con module.exports si existe)
  page.js           DOM: readReportPairs, readItemState, applyChange
  content.js        botón flotante + panel de resumen + flujo
  content.css       estilos del botón y panel
tests/
  fixtures/x1-yoga.json   pares del reporte real (anonimizado)
  rules.test.js
```

Orden de carga en el manifest: `rules.js`, `page.js`, `content.js` (comparten el scope del content script).

**Tipos compartidos (definidos aquí, usados en todas las tareas):**

```js
// Pair: { section: string, label: string, value: string }
//   section = texto del encabezado anterior del reporte ("Erasure Results",
//   "Hardware Details", "Hardware check", "Report Details");
//   label sin los dos puntos finales y sin el índice (" 1"): "Display: 1" -> "Display";
//   value = textos de los .data que siguen al .label hasta el próximo .label, unidos con ", ".
//
// Proposal: {
//   serial: string|null,
//   fields: { wifi, ethernet, battery, touchscreen, webcam, fingerprint, wwan: boolean,
//             acAdapter: boolean|null, screenResolution: string|null },
//   failedChecks: string[]            // labels de "Hardware check" cuyo value empieza con "Failed"
// }
//
// FieldKey: 'wifi'|'ethernet'|'battery'|'touchscreen'|'webcam'|'fingerprint'|'wwan'|'acAdapter'|'screenResolution'
// Target: { key: FieldKey, id: string, label: string }   // un campo físico; wifi y ethernet tienen 2 (incoming, current)
// CurrentValue: 'unspecified' | true | false | string      // radios: 'unspecified'|true|false; checkbox: true|false; combo: '' o texto
// Change: { target: Target, current: CurrentValue, proposed: boolean|string|null,
//           action: 'apply'|'same'|'conflict'|'undetermined' }
```

---

### Task 1: Reglas — de pares del reporte y notas a valores propuestos

**Files:**
- Create: `extension/rules.js`, `tests/fixtures/x1-yoga.json`, `tests/rules.test.js`

**Interfaces:**
- Produces: `proposeValues(pairs: Pair[], notes: string) -> Proposal`, `acAdapterFromNotes(notes: string) -> boolean|null`

- [ ] **Step 1: Iniciar git** — `git init` en la raíz; `.gitignore` vacío no hace falta.

- [ ] **Step 2: Crear el fixture** `tests/fixtures/x1-yoga.json` con los pares del reporte del equipo 11851840013 (spec §5), anonimizados: serial `TESTSERIAL1`, sin UUID ni MAC. Mínimo estos pares, en este orden:

```json
[
  {"section":"Erasure Results","label":"Serial","value":"DISKSERIAL1"},
  {"section":"Hardware Details","label":"Manufacturer","value":"LENOVO"},
  {"section":"Hardware Details","label":"Chassis Type","value":"Convertible"},
  {"section":"Hardware Details","label":"Serial","value":"TESTSERIAL1"},
  {"section":"Hardware Details","label":"Total Memory","value":"32GB, Occupied memory banks: 8/8"},
  {"section":"Hardware Details","label":"Display","value":"AU Optronics, AUO B140UAN02.1, Native Resolution: 1920x1200, Refresh Rate: 60Hz, Size: 14.0\", Year: 2020"},
  {"section":"Hardware Details","label":"Touchscreen","value":"Unknown Vendor, Unknown model"},
  {"section":"Hardware Details","label":"Wi-Fi adapter","value":"Wireless, Intel Corporation Wi-Fi 6 AX201"},
  {"section":"Hardware Details","label":"Bluetooth adapter","value":"Intel Corp., AX201 Bluetooth"},
  {"section":"Hardware Details","label":"USB device","value":"Luxvisions Innotech Limited, Unknown model (0x0026), Integrated Camera 2.01"},
  {"section":"Hardware Details","label":"USB device","value":"Synaptics, Inc., Prometheus Fingerprint Reader 2.00"},
  {"section":"Hardware Details","label":"USB device","value":"Kingston Technology, DataTraveler 100 G3/G4/SE9 G2/50 Kyson"},
  {"section":"Hardware Details","label":"USB device","value":"Symbol Technologies, Bar Code Scanner"},
  {"section":"Hardware Details","label":"Battery","value":"Vendor: Sunwoda, Capacity: 56990 / 57000 mWh"},
  {"section":"Hardware check","label":"Battery capacity","value":"Successful, 99%"},
  {"section":"Hardware check","label":"Touchscreen","value":"Successful"},
  {"section":"Hardware check","label":"Webcam","value":"Failed"}
]
```

- [ ] **Step 3: Escribir las pruebas que fallan** en `tests/rules.test.js` (`node:test`, `node:assert/strict`; cargar con `require('../extension/rules.js')`):

```js
test('x1 yoga: valores propuestos', () => {
  const p = proposeValues(fixture, 'Case - Minor Dents; CON CARGADOR LENOVO TIPO C 65W');
  assert.equal(p.serial, 'TESTSERIAL1');              // el de Hardware Details, no el del disco
  assert.deepEqual(p.fields, { wifi: true, ethernet: false, battery: true, touchscreen: true,
    webcam: true, fingerprint: true, wwan: false, acAdapter: true, screenResolution: '1920x1200' });
  assert.deepEqual(p.failedChecks, ['Webcam']);
});
test('sin pares de Hardware Details: todo en false, resolución null, serial null', ...);
test('Ethernet interno cuenta: label "Network adapter" con value que contiene "Ethernet" -> ethernet true', ...);
test('Ethernet por USB no cuenta: USB device "Realtek USB GbE Ethernet" -> ethernet false', ...);
test('WiFi por USB no cuenta: solo USB device con "Wi-Fi" -> wifi false', ...);
test('WWAN: value con "LTE" o "WWAN" o "Mobile Broadband" en Hardware Details -> wwan true', ...);
test('Touchscreen solo en Hardware check (no en Hardware Details) -> touchscreen false', ...);
test('acAdapterFromNotes', () => {
  assert.equal(acAdapterFromNotes('con cargador hp'), true);
  assert.equal(acAdapterFromNotes('SIN CARGADOR'), false);
  assert.equal(acAdapterFromNotes('Sin Cargador; con cargador'), null);
  assert.equal(acAdapterFromNotes(''), null);
});
```

- [ ] **Step 4: Ejecutar** `node --test tests/` → FAIL (`proposeValues is not a function` o módulo no encontrado).

- [ ] **Step 5: Implementar `proposeValues` y `acAdapterFromNotes` en `extension/rules.js`.** Reglas (solo sección `Hardware Details`, salvo `failedChecks`):
  - `serial`: value del label `Serial`.
  - `wifi`: existe label que empieza con `Wi-Fi adapter`.
  - `ethernet`: existe un par con label ≠ `USB device` y (label `/^(Ethernet|Network) adapter/i` o value `/ethernet/i`).
  - `battery`: existe label `Battery`. `touchscreen`: existe label `Touchscreen`.
  - `webcam`: algún value `/camera/i`. `fingerprint`: algún value `/fingerprint/i`. `wwan`: algún value `/\b(WWAN|LTE|Mobile Broadband)\b/i`.
  - `screenResolution`: del primer label `Display`, `/Native Resolution:\s*(\d+x\d+)/`; si no hay → `null`.
  - `acAdapter`: `acAdapterFromNotes(notes)` — `/sin cargador/i` y `/con cargador/i`; exactamente uno → su valor; ninguno o ambos → `null`.
  - Al final del archivo: `if (typeof module !== 'undefined') module.exports = { proposeValues, acAdapterFromNotes };` — Task 2 agrega `planChanges` y `TARGETS` a este export.

- [ ] **Step 6: Ejecutar** `node --test tests/` → PASS.

- [ ] **Step 7: Commit** — `git add extension/rules.js tests && git commit -m "feat: reglas de autollenado desde reporte Blancco"`

---

### Task 2: Plan de cambios — qué aplicar, qué no tocar

**Files:**
- Modify: `extension/rules.js`, `tests/rules.test.js`

**Interfaces:**
- Consumes: `Proposal` (Task 1)
- Produces: `TARGETS: Target[]`, `planChanges(proposal: Proposal, current: Record<string /*Target.id*/, CurrentValue>, itemSerial: string, productType: string) -> { blocked: string|null, changes: Change[] }`

- [ ] **Step 1: Pruebas que fallan:**

```js
test('campos vacíos -> apply; iguales -> same; distintos -> conflict', () => {
  const r = planChanges(prop, { incoming_HasWireless: 'unspecified', current_HasWireless: true,
    incoming_HasEthernet: true /* distinto de false */, ... }, 'TESTSERIAL1', 'PC - Notebook');
  assert.equal(find(r,'incoming_HasWireless').action, 'apply');
  assert.equal(find(r,'current_HasWireless').action, 'same');
  assert.equal(find(r,'incoming_HasEthernet').action, 'conflict');
});
test('checkbox: desmarcado + true -> apply; marcado + false -> conflict (nunca desmarca); desmarcado + false -> same', ...);
test('acAdapter null -> undetermined', ...);
test('combo screenResolution: "" + "1920x1200" -> apply; "1366x768" + "1920x1200" -> conflict; propuesto null -> undetermined', ...);
test('serial distinto -> blocked "El reporte abierto no es de este equipo", changes []', ...);
test('serial null -> blocked igual', ...);
test('productType sin "Notebook" -> blocked "Por ahora solo laptops", changes []', ...);
test('idempotente: aplicar los cambios "apply" al estado y volver a planificar -> ningún "apply"', ...);
```

- [ ] **Step 2: Ejecutar** `node --test tests/` → FAIL.

- [ ] **Step 3: Implementar `TARGETS` y `planChanges` en `extension/rules.js`.** `TARGETS` (ids son claves lógicas que `page.js` sabe resolver):

| key | id | label (para el resumen) |
|---|---|---|
| wifi | `incoming_HasWireless` | Has WiFi? (Incoming) |
| wifi | `current_HasWireless` | Has WiFi? (Current) |
| ethernet | `incoming_HasEthernet` | Has Gigabit Ethernet? (Incoming) |
| ethernet | `current_HasEthernet` | Has Gigabit Ethernet? (Current) |
| touchscreen | `current_HasTouchscreen` | Has Touchscreen? |
| webcam | `current_HasWebcam` | Has Webcam? |
| battery | `chk:Has Battery?` | Has Battery? |
| acAdapter | `chk:Has AC Adapter?` | Has AC Adapter? |
| fingerprint | `attr:Fingerprint Scanner` | Fingerprint Scanner |
| wwan | `attr:WWAN` | WWAN |
| screenResolution | `combo:Screen Resolution` | Screen Resolution |

  Regla de `action`: propuesto `null` → `undetermined`; actual igual al propuesto → `same`; actual vacío (`'unspecified'`, `''`, o `false` en un `chk:`) → `apply`; resto → `conflict`. Un target cuyo id no esté en `current` (campo inexistente en la ficha) se omite. Comparar serial con `trim()` y sin distinguir mayúsculas. Agregar `planChanges` y `TARGETS` al `module.exports`.

- [ ] **Step 4: Ejecutar** `node --test tests/` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat: plan de cambios sin sobrescribir"`

---

### Task 3: Extensión de solo lectura — botón y resumen (Entrega 1)

**Files:**
- Create: `extension/manifest.json`, `extension/page.js`, `extension/content.js`, `extension/content.css`

**Interfaces:**
- Consumes: `proposeValues`, `planChanges`, `TARGETS` (Tasks 1–2)
- Produces (en `page.js`): `readReportPairs(root: Element) -> Pair[]`, `readItemState(doc: Document) -> { serial: string, productType: string, notes: string, current: Record<string, CurrentValue> }`

- [ ] **Step 1: `manifest.json`** — `manifest_version: 3`, `name: "Autollenado iinvision"`, `version: "0.1.0"`, un content script con los `matches` de Global Constraints, `js: ["rules.js","page.js","content.js"]`, `css: ["content.css"]`, `run_at: "document_idle"`. Sin `permissions` ni `host_permissions`.

- [ ] **Step 2: `readReportPairs(root)`** — recorre `root` (`#reportBody`) en orden de documento; un encabezado (`h1`–`h4`) actualiza `section`; cada `.label` abre un `Pair`; los `.data` siguientes se unen a su `value`. Normaliza el label según el tipo `Pair`.

- [ ] **Step 3: `readItemState(doc)`** — localiza por texto de etiqueta en la sección ITEM INFORMATION: "Serial #" (valor del input), "Product Type" (texto mostrado), y el campo "Notes" de NOTES & DAMAGES. `current` por cada `Target.id` presente:
  - id de radio (`incoming_HasWireless`, …): `#<id>_true`/`_false`/`_unspecified` marcado → `true`/`false`/`'unspecified'`; si no existe → omitir.
  - `chk:<texto>`: el `input[type=checkbox]` dentro del contenedor cuya etiqueta es ese texto → `checked`.
  - `attr:<nombre>`: fila `tr` de ATTRIBUTES cuyo primer `td` es el nombre; sus radios `*_true/_false/_unspecified` → igual que radio.
  - `combo:<nombre>`: fila de ATTRIBUTES; texto del `input` del `kendo-multicolumncombobox` → string (`''` si vacío).

- [ ] **Step 4: `content.js`** — botón flotante "Autollenar" (abajo a la derecha). Al clic, **leer todo de nuevo** (sin caché):
  1. Sin `#reportBody` → aviso "Abre primero el reporte Blancco".
  2. `planChanges(...)`; si `blocked` → mostrar ese texto.
  3. Si no, panel con una fila por `Change`: label · actual → propuesto · estado (`Se aplicará` / `Ya está` / `⚠ Distinto, no se cambia` / `No determinado`), más la lista `⚠ Hardware check falló: <labels>` si `failedChecks` no está vacío. Botones `Aplicar` (deshabilitado en esta tarea) y `Cerrar`.

- [ ] **Step 5: Verificación manual** (la hace el auditor; nunca Save): `chrome://extensions` → Modo de desarrollador → "Cargar sin empaquetar" → carpeta `extension/`. En 5 laptops distintas, abrir ficha + reporte, pulsar Autollenar y comparar el resumen con el reporte. Además: sin reporte abierto → aviso; pulsar dos veces → mismo resumen. Esperado: resumen correcto en las 5.

- [ ] **Step 6: Guardar como fixtures** (anonimizados) los pares de al menos un equipo con puerto RJ45 si aparece, y agregar su prueba a `tests/rules.test.js`; `node --test tests/` → PASS.

- [ ] **Step 7: Commit** — `git add extension tests && git commit -m "feat: botón Autollenar con resumen de solo lectura"`

---

### Task 4: Aplicar atributos — Fingerprint, WWAN, Screen Resolution (Entrega 2)

**Files:**
- Modify: `extension/page.js`, `extension/content.js`

**Interfaces:**
- Consumes: `Change` (Task 2), lectores de `page.js` (Task 3)
- Produces: `applyChange(doc: Document, change: Change) -> Promise<boolean>` (true si quedó aplicado según una nueva lectura)

- [ ] **Step 1: `applyChange` para `attr:`** — `.click()` en el radio `_true`/`_false` de la fila.
- [ ] **Step 2: `applyChange` para `combo:`** — enfocar el input del combo, escribir el texto (eventos `input`), esperar el popup de Kendo (máx. 2 s) y hacer clic en el ítem cuyo texto sea exactamente el valor. Si no aparece → cerrar el popup (Escape) y devolver `false`.
- [ ] **Step 3: Habilitar `Aplicar`** — aplica en orden solo los `action === 'apply'` de tipo `attr:`/`combo:`, luego vuelve a leer y marca cada fila `✔ Aplicado` o `✘ No se pudo` (ej. resolución inexistente en la lista).
- [ ] **Step 4: Verificación manual** (nunca Save): en 3 laptops, Aplicar → los atributos muestran el valor; recargar sin guardar → vuelven a como estaban. En una ficha, cambiar a mano Screen Resolution a otro valor → Autollenar lo muestra como `⚠ Distinto` y no lo toca. Luego, en **un** equipo real que el auditor iba a guardar igual, guardar y recargar → los valores persisten.
- [ ] **Step 5: Commit** — `git commit -am "feat: aplicar atributos"`

---

### Task 5: Aplicar radios y checkboxes (Entrega 3)

**Files:**
- Modify: `extension/page.js`, `extension/content.js`

**Interfaces:**
- Consumes/Produces: amplía `applyChange` (Task 4) a ids de radio y `chk:`.

- [ ] **Step 1: `applyChange` para radios** — `.click()` en `#<id>_true`/`_false`.
- [ ] **Step 2: `applyChange` para `chk:`** — `.click()` en el checkbox solo si está desmarcado y el propuesto es `true` (nunca desmarca).
- [ ] **Step 3: `Aplicar` incluye todos los tipos.**
- [ ] **Step 4: Verificación manual** — igual que Task 4 Step 4, con una ficha que tenga los Yes/No en Unspecified (o ponerlos así a mano sin guardar) y Notas con "SIN CARGADOR" → AC Adapter queda desmarcado y sin conflicto.
- [ ] **Step 5: Commit** — `git commit -am "feat: aplicar radios y checkboxes"`

---

## Fuera de este plan

- **Anti Theft (Entrega 4):** bloqueado hasta tener un reporte Blancco de un equipo con Computrace/Autopilot activado; entonces se agrega una regla a `proposeValues`, un target `chk:Anti Theft Activated` y su fixture.
- **Entrega 0:** verificar el Modo de desarrollador en la PC del trabajo (lo hace el auditor; si está bloqueado, se replantea como bookmarklet reutilizando `rules.js` y `page.js`).
- Desktops y otros tipos de equipo.
