# Historial de entradas con paginación en Supabase

- [x] El Historial consulta a Supabase solo las 25 filas de la página elegida y presenta el total de resultados que coincide con los filtros.
- [x] La búsqueda por número de parte, descripción, unidad, usuario o PO y los filtros Desde/Hasta se ejecutan en Supabase; las búsquedas por texto esperan una pausa corta al escribir.
- [x] El filtro Disponibles conserva su comportamiento y se aplica en servidor; los estados de asignación/salida y las acciones Regresar a inventario corresponden a las filas visibles.
- [x] Las tarjetas de totales conservan el total general del historial; Descargar CSV exporta todas las filas coincidentes, no solo la página visible.
- [x] El Registro diario mantiene su carga y filtros actuales; los cambios no editan, duplican ni eliminan entradas.
