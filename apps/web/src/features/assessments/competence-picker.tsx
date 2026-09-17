'use client';

import { useState } from 'react';
import { createCompetence, type CompetenceCreationResult } from './actions';

function labelForCompetence(competence: string) {
  const [year, month] = competence.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function CompetencePicker({
  currentCompetence,
  competences: initialCompetences,
  onCreate = createCompetence,
}: {
  currentCompetence: string;
  competences: string[];
  onCreate?: (competence: string) => Promise<CompetenceCreationResult>;
}) {
  const [competences, setCompetences] = useState(initialCompetences);
  const [newCompetence, setNewCompetence] = useState(currentCompetence);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    const result = await onCreate(newCompetence);
    setPending(false);
    if (result.status === 'error') {
      setMessage(result.message);
      return;
    }
    setCompetences((current) => [...new Set([...current, newCompetence])].sort().reverse());
    setMessage(`${result.createdCount ?? 0} apurações criadas.`);
  }

  return (
    <section aria-label="Competências">
      <nav aria-label="Competências disponíveis">
        {competences.map((competence) => (
          <a
            key={competence}
            href={`?competence=${competence}`}
            aria-current={competence === currentCompetence ? 'page' : undefined}
          >
            {labelForCompetence(competence)}
          </a>
        ))}
      </nav>
      <label>
        Nova competência
        <input
          type="month"
          value={newCompetence}
          onChange={(event) => setNewCompetence(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => void create()} disabled={pending || !newCompetence}>
        {pending ? 'Criando…' : 'Criar competência'}
      </button>
      <p aria-live="polite">{message}</p>
    </section>
  );
}
