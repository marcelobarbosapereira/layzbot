import { AssessmentGrid } from '../../../features/assessments/assessment-grid';
import { CompetencePicker } from '../../../features/assessments/competence-picker';
import { listAssessmentRows, listCompetences } from '../../../features/assessments/queries';

const competencePattern = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const obligationTabs = ['Simples', 'INSS', 'FGTS', 'GPS', 'eSocial', 'DCTF Web'];

function currentCompetence() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

export default async function SimplesPage({
  searchParams,
}: {
  searchParams: Promise<{ competence?: string }>;
}) {
  const requested = (await searchParams).competence;
  const competence = requested && competencePattern.test(requested) ? requested : currentCompetence();
  const [rows, knownCompetences] = await Promise.all([
    listAssessmentRows(competence),
    listCompetences(),
  ]);
  const competences = [...new Set([competence, ...knownCompetences])];

  return (
    <main className="assessments-page">
      <h1>Apurações mensais</h1>
      <nav aria-label="Obrigações" className="obligation-tabs">
        {obligationTabs.map((tab) => tab === 'Simples' ? (
          <span key={tab} aria-current="page">{tab}</span>
        ) : (
          <span key={tab} title="Cadastro disponível; automação em ciclo posterior">
            {tab} — Cadastro disponível; automação em ciclo posterior
          </span>
        ))}
      </nav>
      <CompetencePicker currentCompetence={competence} competences={competences} />
      {rows.length > 0 ? (
        <AssessmentGrid rows={rows} competence={competence} />
      ) : (
        <p>Nenhuma apuração nesta competência. Crie a competência para iniciar.</p>
      )}
    </main>
  );
}
