import { ImportDialog } from '../../../features/import/import-dialog';

export default function ImportPage() {
  return (
    <main>
      <h1>Importar Excel</h1>
      <p>Revise a prévia antes de gravar cadastros e apurações.</p>
      <ImportDialog />
    </main>
  );
}
