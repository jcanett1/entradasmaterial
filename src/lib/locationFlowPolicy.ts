/* ── Reglas de flujo por rack ──────────────────────────────────────────────
   Los racks de tiendas (TIENDAS) no participan en transferencias ni en KITTEO.
   El material asignado ahí solo admite dos acciones:
     · Liberar  → la partida vuelve al inventario disponible.
     · Salida definitiva → se registra en shipping_direct (historial).
   Agregar un rack nuevo a DIRECT_EXIT_RACKS habilita el mismo flujo. */

export const DIRECT_EXIT_RACKS: readonly string[] = ['TIENDAS'];

export const normalizeRack = (rack: string | null | undefined) =>
  (rack ?? '').trim().toUpperCase();

/* Las locaciones de tienda usan códigos TIENDAS-<TIENDA>, así que el prefijo
   permite reconocer el rack aunque la fila no lo traiga. */
export const inferRackFromLocationCode = (locationCode: string | null | undefined) =>
  (locationCode ?? '').trim().split('-')[0];

export const resolveRack = (rack: string | null | undefined, locationCode?: string | null) =>
  normalizeRack(rack) || normalizeRack(inferRackFromLocationCode(locationCode));

export const isDirectExitRack = (rack: string | null | undefined, locationCode?: string | null) =>
  DIRECT_EXIT_RACKS.includes(resolveRack(rack, locationCode));

/* Salida definitiva: exclusivo de los racks de tienda. */
export const allowsFinalExit = (rack: string | null | undefined, locationCode?: string | null) =>
  isDirectExitRack(rack, locationCode);

/* Transferencia a KITTEO: todo lo que no sea un rack de tienda. */
export const allowsKitteoTransfer = (rack: string | null | undefined, locationCode?: string | null) =>
  !isDirectExitRack(rack, locationCode);

/* Nombre legible de la tienda a partir del código de locación. */
export const getStoreLabel = (locationCode: string | null | undefined) => {
  const normalized = (locationCode ?? '').trim();
  if (!normalized) return '';
  const separatorIndex = normalized.indexOf('-');
  return separatorIndex === -1 ? normalized : normalized.slice(separatorIndex + 1);
};
