# Autollenado iinvision

Extensión de Chrome que llena campos de la ficha de un equipo en iinvision a partir del
reporte Blancco. Todo corre en tu navegador: no envía datos a ningún lado y **nunca pulsa Save**.

## Instalar
1. Chrome → `chrome://extensions`
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → elige la carpeta `extension/`.

Para actualizarla después de un cambio: botón ⟳ de la extensión en esa misma página.

## Usar
1. Abre la ficha del equipo (laptop).
2. **Secure Track ▾ → Detailed Secure Track Report** para abrir el reporte al lado.
3. Pulsa **Autollenar** (abajo a la derecha) y revisa el resumen.
4. **Aplicar** llena solo los campos vacíos. Revisa y pulsa **Save** tú.

## Pruebas
```
node --test tests/*.test.js
```

Diseño: `docs/2026-11-23-autollenado-iinvision-diseno.md`
