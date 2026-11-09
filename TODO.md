# Regreso de salidas definitivas a inventario

- [x] Mostrar “Regresar a inventario” a supervisores y administradores en entradas con salida definitiva activa; confirmar la salida concreta y el material que vuelve.
- [x] Conservar el ID, FIFO, fecha y cantidades de la entrada original. No insertar una nueva entrada ni borrar la salida original; auditar el retorno y bloquear una segunda devolución de la misma salida.
- [x] Actualizar disponibilidad de Inventario y Racks respetando otras asignaciones, transferencias y salidas pendientes. En coincidencias históricas ambiguas, liberar únicamente la entrada seleccionada.
- [x] Excluir salidas devueltas del saldo neto en nuevas comparaciones y conservar los reportes guardados y el historial de movimientos sin duplicarlos.

Validación: ocho pruebas locales de coincidencia, bloqueo, devoluciones y no duplicación; compilación TypeScript/Vite; ESLint dirigido a todos los módulos cambiados. Migraciones aplicadas en Supabase, con verificación de permisos efectivos y equivalencia de normalización Unicode. No se ejecutaron devoluciones reales durante las pruebas. Pendiente: aprobación para fusionar el PR y publicar el frontend.
