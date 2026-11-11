import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/lib/locationFlowPolicy.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  allowsFinalExit,
  allowsKitteoTransfer,
  inferRackFromLocationCode,
  getStoreLabel,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('las locaciones de tienda solo admiten salida definitiva', () => {
  assert.equal(allowsFinalExit('TIENDAS', 'TIENDAS-PGA'), true);
  assert.equal(allowsKitteoTransfer('TIENDAS', 'TIENDAS-PGA'), false);
});

test('los racks A-L conservan la transferencia a KITTEO', () => {
  assert.equal(allowsKitteoTransfer('A', 'A-01'), true);
  assert.equal(allowsFinalExit('A', 'A-01'), false);
  assert.equal(allowsKitteoTransfer('L', 'L-09'), true);
});

test('el rack se deduce del código cuando la fila no lo trae', () => {
  assert.equal(inferRackFromLocationCode('TIENDAS-GOLF-TOWN'), 'TIENDAS');
  assert.equal(allowsFinalExit(null, 'TIENDAS-SCHEELS'), true);
  assert.equal(allowsFinalExit(undefined, 'B-04'), false);
});

test('la etiqueta de tienda es el sufijo del código de locación', () => {
  assert.equal(getStoreLabel('TIENDAS-SUPERSTROKE'), 'SUPERSTROKE');
  assert.equal(getStoreLabel('TIENDAS-GOLF-TOWN'), 'GOLF-TOWN');
  assert.equal(getStoreLabel('TIENDAS'), 'TIENDAS');
  assert.equal(getStoreLabel(''), '');
});

test('el rack se normaliza sin distinguir mayúsculas ni espacios', () => {
  assert.equal(allowsFinalExit(' tiendas ', 'TIENDAS-AMAZON'), true);
});
