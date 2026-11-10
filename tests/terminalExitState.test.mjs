import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/lib/terminalExitState.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { matchesTerminalExit, isBlockedByTerminalExit, activeTerminalExits } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const entry = { id: 1, part_number: 'PART-01', po: 'PO1', total_units: 10, total_boxes: 1, registered_at: '2026-11-08T10:00:00Z' };
const exit = { id: 10, source: 'kitteo_exits', entry_id: 1, part_number: 'PART-01', po: 'PO1', qty: 10, boxes: 1, exited_at: '2026-11-08T12:00:00Z', returned_at: null };

test('salida activa bloquea exclusivamente el entry_id vinculado', () => {
  assert.equal(isBlockedByTerminalExit(entry, exit), true);
  assert.equal(isBlockedByTerminalExit({ ...entry, id: 2 }, exit), false);
});
test('salida devuelta ya no bloquea la entrada original', () => {
  for (const source of ['kitteo_exits', 'shipping_direct']) {
    assert.equal(isBlockedByTerminalExit(entry, { ...exit, source, returned_at: '2026-11-09T13:00:00Z' }), false);
  }
});
test('otro egreso activo mantiene el bloqueo después de una devolución', () => {
  const exits = [{ ...exit, returned_at: '2026-11-09T13:00:00Z' }, { ...exit, id: 11 }];
  assert.equal(exits.some(row => isBlockedByTerminalExit(entry, row)), true);
});
test('legacy coincide por parte, PO, cantidades y fecha válida', () => {
  const legacy = { ...exit, entry_id: null };
  assert.equal(matchesTerminalExit(entry, legacy), true);
  assert.equal(matchesTerminalExit({ ...entry, total_units: 11 }, legacy), false);
  assert.equal(matchesTerminalExit({ ...entry, total_boxes: 2 }, legacy), false);
  assert.equal(matchesTerminalExit({ ...entry, po: 'PO2' }, legacy), false);
  assert.equal(matchesTerminalExit({ ...entry, registered_at: '2026-11-09T10:00:00Z' }, legacy), false);
  assert.equal(matchesTerminalExit({ ...entry, registered_at: 'invalid' }, legacy), false);
});
test('legacy ambiguo vigente bloquea a las entradas candidatas', () => {
  const legacy = { ...exit, entry_id: null, source_match_is_ambiguous: true };
  assert.equal(isBlockedByTerminalExit(entry, legacy), true);
  assert.equal(isBlockedByTerminalExit({ ...entry, id: 1418 }, legacy), true);
});
test('legacy ambiguo devuelto libera a todas las entradas que coincidían', () => {
  // Regresar la salida histórica sin entry_id ya no deja bloqueadas de forma
  // permanente al resto de las entradas candidatas: al no quedar una salida
  // vigente no existía acción posible para liberarlas desde la tabla.
  const ambiguous = { ...exit, entry_id: null, returned_at: '2026-11-09T13:00:00Z', returned_entry_id: 1, source_match_is_ambiguous: true };
  for (const candidate of [entry, { ...entry, id: 2 }, { ...entry, id: 1418 }]) {
    assert.equal(isBlockedByTerminalExit(candidate, ambiguous), false);
    assert.deepEqual(activeTerminalExits(candidate, [ambiguous]), []);
  }
});
test('devolución legacy inequívoca no conserva el bloqueo histórico', () => {
  assert.equal(isBlockedByTerminalExit(entry, { ...exit, entry_id: null, returned_at: '2026-11-09T13:00:00Z', returned_entry_id: 1, source_match_is_ambiguous: false }), false);
});
test('toda entrada bloqueada por salida definitiva tiene una salida regresable', () => {
  const rows = [
    { ...exit, entry_id: null, returned_at: null },             // salida histórica vigente
    { ...exit, id: 12, returned_at: '2026-11-09T13:00:00Z' },   // salida propia ya devuelta
    { ...exit, id: 13, entry_id: 2, returned_at: null },        // salida vigente de otra entrada
  ];
  assert.deepEqual(activeTerminalExits(entry, rows).map(row => row.id), [10]);
  assert.deepEqual(activeTerminalExits({ ...entry, id: 2 }, rows).map(row => row.id), [10, 13]);
  // Otra PO no coincide con la salida histórica, así que queda libre.
  const otherPo = { ...entry, id: 3, po: 'PO9' };
  assert.deepEqual(activeTerminalExits(otherPo, rows), []);
  assert.equal(rows.some(row => isBlockedByTerminalExit(otherPo, row)), false);
  for (const candidate of [entry, { ...entry, id: 2 }, otherPo, { ...entry, id: 1418 }]) {
    const blocked = rows.some(row => isBlockedByTerminalExit(candidate, row));
    assert.equal(blocked, activeTerminalExits(candidate, rows).length > 0);
  }
});
test('normalización conserva equivalencia con búsqueda de inventario', () => {
  assert.equal(matchesTerminalExit({ ...entry, part_number: ' part – 01 ', po: ' po1 ' }, { ...exit, entry_id: null }), true);
});
test('migración nunca duplica entries ni elimina la salida original', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261109165000_return_terminal_exit_to_inventory.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+(?:public\.)?entries\b/i);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE\s+FROM)\s+(?:public\.)?entries\b/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+(?:public\.)?(?:shipping_direct|kitteo_exits)\b/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /source_exit_type, source_exit_id/i);
  assert.match(sql, /ua\.rol IN \('admin', 'supervisor'\)/);
});
