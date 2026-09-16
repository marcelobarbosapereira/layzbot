import { responsibleInput, taxpayerInput } from '@lazybot/contracts';

it('trims names while preserving a normalized taxpayer document', () => {
  expect(taxpayerInput.parse({
    name: '  Empresa teste  ', document: '11111111111111',
    responsibleId: '20000000-0000-4000-8000-000000000001',
  })).toEqual({
    name: 'Empresa teste', document: '11111111111111',
    responsibleId: '20000000-0000-4000-8000-000000000001',
  });
});

it.each(['123', '111.111.111-11', 'abcdefghijk'])('rejects a malformed document %s', (document) => {
  expect(responsibleInput.safeParse({ name: 'Teste', document }).success).toBe(false);
});

it('rejects blank names and invalid responsible links', () => {
  expect(responsibleInput.safeParse({ name: '  ', document: '11111111111' }).success).toBe(false);
  expect(taxpayerInput.safeParse({ name: 'Teste', document: '11111111111', responsibleId: 'other' }).success).toBe(false);
});
