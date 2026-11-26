# Historial de entradas con paginación en Supabase

- [x] El Historial consulta a Supabase solo las 25 filas de la página elegida y presenta el total de resultados que coincide con los filtros.
- [x] La búsqueda por número de parte, descripción, unidad, usuario o PO y los filtros Desde/Hasta se ejecutan en Supabase; las búsquedas por texto esperan una pausa corta al escribir.
- [x] El filtro Disponibles conserva su comportamiento y se aplica en servidor; los estados de asignación/salida y las acciones Regresar a inventario corresponden a las filas visibles.
- [x] Las tarjetas de totales conservan el total general del historial; Descargar CSV exporta todas las filas coincidentes, no solo la página visible.
- [x] El Registro diario mantiene su carga y filtros actuales; los cambios no editan, duplican ni eliminan entradas.

## Master Pallet List por locación

- [x] Desde **Racks / Locaciones**, al abrir una ubicación seleccionada (por ejemplo, rack A, ubicación A-04), se puede generar una hoja imprimible titulada **MASTER PALLET LIST** para colocar físicamente en el rack; contiene las columnas **ITEM NUMBER** y **QUANTITY**, además de líneas de **SIGNATURE** y **LOCATION**. En el encabezado, **RACK A** y **LOCATION A-04** aparecen más grandes y en negritas; al pie, **LOCATION: A-04** aparece centrado.
- [x] La hoja muestra una fila por número de parte distinto y su cantidad correspondiente; no reemplaza las cantidades por un total combinado de todos los números de parte de la ubicación. Si el mismo número de parte tiene varias asignaciones, solo se suman entre sí las cantidades de ese mismo número.
- [x] Todos los textos impresos de la hoja usan tamaño de fuente **48 puntos** —título, rack y ubicación, encabezados de columnas, números de parte, cantidades, firma y ubicación del pie— y el ejemplo A-04 se acomoda sin superposiciones en una sola página.
