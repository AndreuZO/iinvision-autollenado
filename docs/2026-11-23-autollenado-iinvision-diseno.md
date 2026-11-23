# Autollenado iinvision desde el reporte Blancco — Documento de alcance y diseño

**Fecha:** 2026-11-23 · **Estado:** borrador para aprobación

## 1. Visión y por qué

En auditoría, por cada equipo (laptop, PC) se abre su ficha en iinvision
(`https://iinvision.epcglobalsolutions.com/Item/Detail/<Unique#>`) y se copian a mano,
uno por uno, datos que ya están en el **reporte de borrado de Blancco** que la misma
página muestra en un panel lateral. Es repetitivo, lento y propenso a errores.

**Objetivo:** con un clic, llenar esos campos a partir del reporte, para que el auditor
dedique su tiempo a lo que sí requiere criterio: revisar el daño físico.

**Contexto clave:** el usuario no es del área de TI y no quiere depender de TI ni
generar riesgos. Todo debe correr **localmente en su navegador**, sin APIs, servidores
ni servicios externos.

## 2. Alcance

### Objetivos (v1)
- Una extensión de Chrome que, en la ficha de un equipo, agrega un botón **"Autollenar"**.
- Al pulsarlo: lee el reporte Blancco (panel lateral) y las Notas, calcula los valores,
  **muestra un resumen** (campo · valor actual → valor propuesto) y, si el auditor
  confirma, los aplica en el formulario.
- Campos cubiertos (ver reglas en §5): Has WiFi (Incoming y Current), Has Gigabit
  Ethernet (Incoming y Current), Has Battery, Has Touchscreen, Has Webcam, Has AC
  Adapter, Anti Theft Activated, y los atributos Fingerprint Scanner, WWAN y
  Screen Resolution.
- Aviso visible cuando el "Hardware check" de Blancco tiene alguna prueba **Failed**
  (ej. Webcam), para tenerlo en cuenta al registrar daños.

### No objetivos (fuera de v1)
- SD Card Slots, Stylus, Backlit Keyboard: siguen siendo manuales (dato físico).
- Registrar daños.
- Procesar varios equipos en lote.
- Leer archivos PDF descargados (el reporte ya está dentro de la página).

### Anti-objetivos (sería un fracaso aunque "funcione")
- **Pulsar "Save".** La extensión nunca guarda; guardar siempre es decisión del auditor.
- **Inventar un valor.** Si el reporte no permite decidir un campo, se deja como está y
  se marca en el resumen como "no determinado".
- **Sacar datos de la PC.** Sin permisos de red, sin analítica, sin enviar nada a
  ningún servidor, sin guardar datos de equipos.
- Romper o alterar el funcionamiento normal de iinvision.

## 3. Restricciones

- **Navegador:** Google Chrome (PC del trabajo).
- **Instalación:** extensión "sin empaquetar" con el **Modo de desarrollador**. Pendiente
  verificar que esté permitido en la PC del trabajo (`chrome://extensions`).
- **Política de la empresa:** se recomienda informar al jefe antes de usarla en
  producción.
- **iinvision es de un tercero (EPC)** y puede cambiar sin aviso; la extensión debe
  fallar de forma segura (no llenar nada y avisar) si no encuentra lo que espera.
- **Cómo está hecha la página** (observado el 2026-11-23):
  - Angular + componentes Kendo UI. No sirve cambiar `.checked` o `.value` por código:
    hay que simular la interacción (clic en el radio/checkbox, o escribir y elegir en
    los combos) para que la página registre el cambio.
  - Radios Yes/No/Unspecified con ids estables: `incoming_HasWireless_*`,
    `incoming_HasEthernet_*`, `current_HasWireless_*`, `current_HasEthernet_*`,
    `current_HasTouchscreen_*`, `current_HasWebcam_*` (sufijos `_true`, `_false`,
    `_unspecified`).
  - Atributos (tabla "Attributes"): radios `toggleValue<N>_*`, donde N depende del
    orden de la fila → **localizar la fila por su nombre** ("Fingerprint Scanner",
    "WWAN"), nunca por N. "Screen Resolution" es un combo Kendo
    (`kendo-multicolumncombobox`) en su fila.
  - Has AC Adapter / Has Battery / AMT Unconfigured: checkboxes Kendo sin id;
    localizar por el texto de su etiqueta.
  - Reporte Blancco: dentro de `#reportBody`, como pares
    `<div class="label">X:</div><div class="data">valor</div>`. Solo existe cuando el
    auditor abre el reporte (Views/Reports) en el panel lateral.
  - Notas: campo de texto editable de la sección "Notes & Damages".

## 4. Enfoques considerados

| Enfoque | Ventajas | Desventajas |
|---|---|---|
| **A. Extensión de Chrome propia** ✅ elegido | Botón integrado, resumen antes de aplicar, fácil de mantener, sin terceros | Requiere Modo de desarrollador |
| B. Script en Tampermonkey | Funciona si solo se permite la Chrome Web Store | Depende de una extensión de terceros con permisos amplios |
| C. Bookmarklet (favorito con código) | Cero instalación | Incómodo de mantener, sin botón fijo, puede bloquearse por seguridad de la página |
| D. Python + automatización de navegador | — | Otro navegador, otro inicio de sesión, más visible y complejo. Descartado |

**Decisión del usuario:** A. **Plan B** si el Modo de desarrollador está bloqueado: C,
reutilizando la misma lógica.

## 5. Reglas de llenado

Fuente "Reporte" = texto dentro de `#reportBody`. Si el reporte no está abierto, el
botón avisa "Abre primero el reporte Blancco" y no hace nada.

**Control de coincidencia** *(decisión del asistente)*: el "Serial" de Hardware Details
del reporte debe ser igual al "Serial #" de la ficha (ej. PF3P1FD2 = PF3P1FD2). Si no
coinciden → no se llena nada y se avisa "El reporte abierto no es de este equipo". Se
usa siempre el reporte que el auditor tiene abierto en el panel.

**No sobrescribir** *(decidido por el auditor)*: solo se llenan campos en
"Unspecified", vacíos o desmarcados. Si un campo ya tiene un valor distinto al
propuesto, el resumen lo muestra como aviso y **no se cambia**. En la práctica los
campos Yes/No suelen venir ya cargados; lo que más varía por equipo son los
**atributos** (Screen Resolution, Fingerprint Scanner, WWAN).

**Laptops y todo en uno** *(decidido por el auditor; todo en uno agregado el 2026-11-23)*:
si el "Product Type" de la ficha no es Notebook ni All-In-One, el botón avisa "Por ahora
solo laptops y todo en uno" y no hace nada. Desktops y otros equipos, en una versión
posterior. En la ficha de un todo en uno los atributos son Webcam, Touchscreen y
Bluetooth (Yes/No) en lugar de Fingerprint, WWAN y Screen Resolution; se llenan con las
mismas reglas de Webcam y Touchscreen, y Bluetooth = existe "Bluetooth adapter" en
Hardware Details. En laptops esas filas son de solo lectura (tipo Model) y se ignoran.
Verificado en el todo en uno 11933370086 (ThinkCentre M70a), que además confirmó la
regla de Ethernet ("Network Adapter: Ethernet … Gigabit Ethernet Controller") y mostró
"Autopilot status: Not enrolled" ↔ Anti Theft = "None".

**Fuera de alcance** *(decisión del asistente)*: "Active Mgmt. Tech (AMT) Unconfigured"
no se toca (no está en la lista del auditor).

| Campo iinvision | Regla | Si no se puede decidir |
|---|---|---|
| Has WiFi? (Incoming y Current) | Existe etiqueta "Wi-Fi adapter" → Yes; si no → No | — |
| Has Gigabit Ethernet? (Incoming y Current) | Existe un adaptador de red cableado (Ethernet) **interno** en el reporte → Yes; si no → No. Lo conectado por USB durante el borrado (memorias, lector de códigos) es externo y **no cuenta** para WiFi ni Ethernet | — |
| Has Battery? | Existe etiqueta "Battery:" en Hardware Details → marcado; si no → desmarcado | — |
| Has Touchscreen? | Existe etiqueta "Touchscreen:" en Hardware Details → Yes; si no → No | — |
| Has Webcam? | Algún "USB device" contiene "Camera" → Yes; si no → No | — |
| Has AC Adapter? | Notas contienen "CON CARGADOR" → marcado; "SIN CARGADOR" → desmarcado (sin distinguir mayúsculas) | Ninguna o ambas → no tocar, avisar |
| Anti Theft Activated | Reporte indica Computrace o Autopilot **activado** → marcado. Nunca se desmarca automáticamente *(decisión del asistente)* | Texto exacto pendiente (§9). Mientras tanto → no tocar |
| Fingerprint Scanner (atributo) | Algún dispositivo contiene "Fingerprint" → Yes; si no → No | — |
| WWAN (atributo) | Algún dispositivo indica módem móvil / WWAN / LTE → Yes; si no → No | — |
| Screen Resolution (atributo) | "Native Resolution: AxB" del Display 1 → elegir "AxB" en el combo | Si "AxB" no existe en la lista → no tocar, avisar |

Ejemplo verificado (equipo 11851840013, ThinkPad X1 Yoga Gen 6): WiFi Yes, Ethernet No,
Battery ✓, Touchscreen Yes, Webcam Yes, AC Adapter ✓ ("CON CARGADOR LENOVO TIPO C
65W"), Fingerprint Yes, WWAN No, Screen Resolution 1920x1200. Hardware check:
**Webcam Failed** → mostrar aviso.

## 6. Flujo de uso

```
1. Abrir la ficha del equipo en iinvision
2. Abrir el reporte Blancco en el panel lateral (como hoy)
3. Clic en "Autollenar" (botón flotante de la extensión)
4. Ver el resumen:
     Has WiFi (Incoming)   Unspecified → Yes
     Has AC Adapter        ☐ → ☑   (Notas: "CON CARGADOR…")
     Anti Theft            no determinado
     ⚠ Hardware check: Webcam Failed
   [Aplicar]  [Cancelar]
5. Aplicar → se llenan los campos; el auditor revisa, registra daños y pulsa Save
```

## 7. Stack técnico

- **Chrome Extension Manifest V3**, JavaScript simple, sin frameworks ni dependencias
  ni paso de compilación.
- Un `content script` limitado a `https://iinvision.epcglobalsolutions.com/Item/Detail/*`.
- **Permisos:** solo ese dominio. Sin `host_permissions` adicionales, sin red, sin
  almacenamiento.
- Separación interna en dos partes:
  1. **Lectura y reglas** (texto del reporte + notas → valores propuestos): funciones
     puras, probables sin navegador.
  2. **Aplicación** (valores → clics en la página): la única parte que toca iinvision.

## 8. Metodología y buenas prácticas

**Metodología:** Kanban ligero con entregas pequeñas (un desarrollador + asistente;
Scrum completo no aporta a este tamaño). Cada entrega se prueba en equipos reales
antes de pasar a la siguiente.

| Entrega | Contenido | Hecho cuando… |
|---|---|---|
| 0 | Verificar Modo de desarrollador en la PC del trabajo | Se sabe si va A o C |
| 1 | Lectura + reglas + resumen (sin aplicar nada) | El resumen es correcto en 5 equipos reales distintos |
| 2 | Aplicar atributos (lo que más cambia): Screen Resolution (combo Kendo), Fingerprint Scanner, WWAN | Se llenan bien y iinvision guarda los valores tras Save |
| 3 | Aplicar radios y checkboxes (WiFi, Ethernet, Battery, Touchscreen, Webcam, AC Adapter) + aviso de pruebas fallidas | Igual que 2 |
| 4 | Anti Theft | Probado con un equipo con Computrace/Autopilot |
| Después de v1 | Desktops y otros tipos de equipo | — |

**Buenas prácticas:**
- **Git** para versionar, con commits pequeños por cambio.
- **Pruebas:** guardar como archivos de ejemplo el texto de varios reportes reales
  (anonimizados: sin seriales ni UUID) y probar las reglas con un test simple
  (`node` + `assert`), incluido un caso con Ethernet, uno sin cargador y uno con
  anti-theft.
- **Falla segura:** si un elemento no se encuentra, no se toca y se informa en el
  resumen.
- **Privacidad:** la extensión no registra ni guarda datos de equipos.
- **Revisión humana siempre:** el auditor confirma el resumen y pulsa Save.

## 9. Riesgos y pendientes

| Riesgo / pendiente | Mitigación |
|---|---|
| Modo de desarrollador bloqueado en la PC del trabajo | Plan B: bookmarklet |
| Política interna / TI | Informar al jefe antes de usarla en producción |
| iinvision cambia su diseño | Falla segura + localizar elementos por texto/ids estables |
| Texto exacto de Computrace/Autopilot en Blancco desconocido | Conseguir un reporte de un equipo bloqueado antes de la entrega 4 |
| Formato de Ethernet en el reporte no visto aún | Conseguir un reporte de un equipo con puerto RJ45 antes de la entrega 1 |
| Equipos de escritorio | Fuera de v1: la extensión se niega en fichas que no sean Notebook ni All-In-One |

## 10. Decisiones dejadas al desarrollador
- Aspecto visual del botón y del resumen.
- Estructura de archivos de la extensión.
- Cómo simular la interacción con los componentes Kendo, siempre que la página
  registre el cambio.
