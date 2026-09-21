import { notFound } from 'next/navigation';
import { z } from 'zod';
import { BatchProgress } from '../../../../features/batches/batch-progress';
import { getBatchProgress } from '../../../../features/batches/queries';

export default async function ExecutionPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  if (!z.string().uuid().safeParse(batchId).success) notFound();
  const progress = await getBatchProgress(batchId);
  if (!progress) notFound();
  return <main><BatchProgress batch={progress.batch} initialItems={progress.items} initialEvents={progress.events} devices={progress.devices} /></main>;
}
