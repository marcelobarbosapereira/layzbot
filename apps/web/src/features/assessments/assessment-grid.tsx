'use client';

import { useMemo, useState, type ClipboardEvent } from 'react';
import { DataGrid, type Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import {
  updateAssessment,
  type AssessmentMutationInput,
  type AssessmentMutationResult,
} from './actions';
import { parseBrazilianCents } from './revenue';

export type AssessmentRow = {
  id: string;
  taxpayerId: string;
  profileId: string;
  companyName: string;
  document: string;
  revenueCents: number;
  activity: 'commerce' | 'services';
  responsible: string;
  status: string;
  documentsCount: number;
  selected: boolean;
  version: number;
};

type UpdateAction = (input: AssessmentMutationInput) => Promise<AssessmentMutationResult>;

function formatRevenue(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function maskDocument(document: string) {
  return document.length === 14 ? '**.***.***/****-**' : '***.***.***-**';
}

export function AssessmentGrid({
  rows: initialRows,
  competence,
  onUpdate = updateAssessment,
}: {
  rows: AssessmentRow[];
  competence: string;
  onUpdate?: UpdateAction;
}) {
  const [rows, setRows] = useState(initialRows);
  const [revenueDrafts, setRevenueDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialRows.map((row) => [row.id, formatRevenue(row.revenueCents)])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, 'saving' | 'saved'>>({});
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const visibleRows = useMemo(() => rows.filter((row) => {
    const companyMatches = row.companyName.toLocaleLowerCase('pt-BR')
      .includes(companyFilter.toLocaleLowerCase('pt-BR'));
    return companyMatches && (!statusFilter || row.status === statusFilter);
  }), [companyFilter, rows, statusFilter]);

  async function persist(row: AssessmentRow, revenue: string, selected = row.selected) {
    if (parseBrazilianCents(revenue) === null) {
      setErrors((current) => ({ ...current, [row.id]: 'Receita inválida' }));
      setSaveStates((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      return;
    }

    setErrors((current) => ({ ...current, [row.id]: '' }));
    setSaveStates((current) => ({ ...current, [row.id]: 'saving' }));
    const result = await onUpdate({
      assessmentId: row.id,
      profileId: row.profileId,
      version: row.version,
      revenue,
      selected,
    });
    if (result.status !== 'success') {
      setErrors((current) => ({ ...current, [row.id]: result.message }));
      setSaveStates((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      return;
    }

    const cents = parseBrazilianCents(revenue)!;
    setRows((current) => current.map((candidate) => candidate.id === row.id
      ? { ...candidate, revenueCents: cents, selected, version: result.version }
      : candidate));
    setSaveStates((current) => ({ ...current, [row.id]: 'saved' }));
  }

  async function pasteRevenues(event: ClipboardEvent<HTMLInputElement>, startRow: AssessmentRow) {
    event.preventDefault();
    const values = event.clipboardData.getData('text').split(/[\t\r\n]+/).filter(Boolean);
    const startIndex = visibleRows.findIndex((row) => row.id === startRow.id);
    const targets = visibleRows.slice(startIndex, startIndex + values.length);

    const validEntries = targets.map((row, index) => ({ row, value: values[index].trim() }));
    setRevenueDrafts((current) => ({
      ...current,
      ...Object.fromEntries(validEntries.map(({ row, value }) => [row.id, value])),
    }));
    await Promise.all(validEntries.map(({ row, value }) => persist(row, value)));
  }

  const columns: readonly Column<AssessmentRow>[] = [
    {
      key: 'selected',
      name: 'Executar',
      width: 90,
      renderCell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Executar ${row.companyName}`}
          checked={row.selected}
          onChange={(event) => void persist(row, revenueDrafts[row.id], event.target.checked)}
        />
      ),
    },
    { key: 'companyName', name: 'Empresa', minWidth: 210 },
    {
      key: 'document',
      name: 'CNPJ',
      width: 190,
      renderCell: ({ row }) => (
        <span>
          {revealed.has(row.id) ? row.document : maskDocument(row.document)}{' '}
          <button
            type="button"
            aria-label={`${revealed.has(row.id) ? 'Ocultar' : 'Revelar'} CNPJ de ${row.companyName}`}
            onClick={() => setRevealed((current) => {
              const next = new Set(current);
              if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
              return next;
            })}
          >
            {revealed.has(row.id) ? 'Ocultar' : 'Revelar'}
          </button>
        </span>
      ),
    },
    {
      key: 'revenueCents',
      name: 'Receita do período',
      width: 190,
      renderCell: ({ row }) => (
        <span>
          <input
            aria-label={`Receita de ${row.companyName}`}
            inputMode="decimal"
            value={revenueDrafts[row.id] ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setRevenueDrafts((current) => ({ ...current, [row.id]: value }));
              setErrors((current) => ({
                ...current,
                [row.id]: parseBrazilianCents(value) === null ? 'Receita inválida' : '',
              }));
            }}
            onBlur={(event) => void persist(row, event.target.value)}
            onPaste={(event) => void pasteRevenues(event, row)}
          />
          {errors[row.id] ? <span role="alert">{errors[row.id]}</span> : null}
          {saveStates[row.id] ? (
            <span role="status" aria-label={`Salvamento de ${row.companyName}`}>
              {saveStates[row.id] === 'saving' ? 'Salvando…' : 'Salvo'}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'activity',
      name: 'Atividade',
      width: 120,
      renderCell: ({ row }) => row.activity === 'commerce' ? 'Comércio' : 'Serviços',
    },
    { key: 'responsible', name: 'Responsável', minWidth: 170 },
    { key: 'status', name: 'Status', width: 130 },
    {
      key: 'documentsCount',
      name: 'Documentos',
      width: 110,
      renderCell: ({ row }) => String(row.documentsCount),
    },
  ];

  return (
    <section>
      <div className="assessment-filters">
        <label>
          Filtrar empresas
          <input value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} />
        </label>
        <label>
          Filtrar por status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="completed">Concluído</option>
            <option value="needs_attention">Requer atenção</option>
          </select>
        </label>
      </div>
      <DataGrid
        aria-label={`Apurações de ${competence}`}
        columns={columns}
        rows={visibleRows}
        rowKeyGetter={(row) => row.id}
        enableVirtualization={false}
        className="rdg-light assessment-grid"
      />
    </section>
  );
}
