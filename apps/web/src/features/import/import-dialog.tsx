'use client';

import type { ImportPreview } from '@lazybot/contracts';
import { useActionState } from 'react';
import {
  commitImport,
  previewImport,
  type CommitImportState,
  type PreviewImportState,
} from './actions';

const initialPreviewState: PreviewImportState = { status: 'idle' };
const initialCommitState: CommitImportState = { status: 'idle' };

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ImportPreviewDetails({
  preview,
  previewToken,
}: {
  preview: ImportPreview;
  previewToken?: string;
}) {
  const [commitState, commitAction, commitPending] = useActionState(commitImport, initialCommitState);

  return (
    <section aria-labelledby="preview-heading">
      <h2 id="preview-heading">Prévia da importação</h2>
      <p>
        {countLabel(preview.validRows.length, 'linha válida', 'linhas válidas')} e{' '}
        {countLabel(preview.invalidRows.length, 'linha inválida', 'linhas inválidas')}.
      </p>

      {preview.invalidRows.length > 0 ? (
        <div>
          <h3>Linhas que não serão importadas</h3>
          <table>
            <thead>
              <tr>
                <th>Aba</th>
                <th>Linha</th>
                <th>Documento</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {preview.invalidRows.map((row) => (
                <tr key={`${row.sheet}-${row.rowNumber}`}>
                  <td>{row.sheet}</td>
                  <td>Linha {row.rowNumber}</td>
                  <td>{row.document || 'Não informado'}</td>
                  <td>{row.errors.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {previewToken ? (
        <form action={commitAction}>
          <input type="hidden" name="previewToken" value={previewToken} />
          <button type="submit" disabled={commitPending || commitState.status === 'committed'}>
            {commitPending ? 'Confirmando…' : 'Confirmar importação'}
          </button>
        </form>
      ) : (
        <p>Nenhuma linha válida para confirmar.</p>
      )}

      <p aria-live="polite">
        {commitState.status === 'committed'
          ? `${commitState.processedRows} linhas importadas.`
          : commitState.status === 'error'
            ? commitState.message
            : ''}
      </p>
    </section>
  );
}

export function ImportDialog() {
  const [previewState, previewAction, previewPending] = useActionState(previewImport, initialPreviewState);

  return (
    <div>
      <form action={previewAction}>
        <div>
          <label htmlFor="competence">Competência</label>
          <input id="competence" name="competence" type="month" required />
        </div>
        <div>
          <label htmlFor="workbook">Arquivo XLSX</label>
          <input
            id="workbook"
            name="workbook"
            type="file"
            accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
            required
          />
        </div>
        <button type="submit" disabled={previewPending}>
          {previewPending ? 'Lendo arquivo…' : 'Gerar prévia'}
        </button>
      </form>

      <p aria-live="polite">
        {previewState.status === 'error'
          ? previewState.message
          : previewState.status === 'preview' && previewState.message
            ? previewState.message
            : ''}
      </p>

      {previewState.status === 'preview' ? (
        <ImportPreviewDetails preview={previewState.preview} previewToken={previewState.previewToken} />
      ) : null}
    </div>
  );
}
