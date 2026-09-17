'use server';

import type { ImportPreview } from '@lazybot/contracts';
import { z } from 'zod';
import { createClient } from '../../lib/supabase/server';
import { parseWorkbook } from './parse-workbook';

export type PreviewImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'preview'; preview: ImportPreview; previewToken?: string; message?: string };

export type CommitImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'committed'; processedRows: number };

const competenceSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const previewTokenSchema = z.string().uuid();
const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;

async function authenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return supabase;
}

export async function previewImport(
  _previousState: PreviewImportState,
  formData: FormData,
): Promise<PreviewImportState> {
  const supabase = await authenticatedClient();
  if (!supabase) return { status: 'error', message: 'Sessão inválida. Entre novamente.' };

  const competence = competenceSchema.safeParse(formData.get('competence'));
  const workbook = formData.get('workbook');
  if (!competence.success) return { status: 'error', message: 'Informe uma competência válida.' };
  if (!(workbook instanceof File) || workbook.size === 0 || !workbook.name.toLowerCase().endsWith('.xlsx')) {
    return { status: 'error', message: 'Selecione um arquivo XLSX válido.' };
  }
  if (workbook.size > MAX_WORKBOOK_BYTES) {
    return { status: 'error', message: 'O arquivo deve ter no máximo 10 MB.' };
  }

  let preview: ImportPreview;
  try {
    preview = await parseWorkbook(new Uint8Array(await workbook.arrayBuffer()));
  } catch {
    return { status: 'error', message: 'Não foi possível ler o arquivo XLSX.' };
  }

  if (preview.validRows.length === 0) {
    return {
      status: 'preview',
      preview,
      message: 'Nenhuma linha válida para importar.',
    };
  }

  const { data, error } = await supabase.rpc('create_import_preview', {
    p_competence: competence.data,
    p_valid_rows: preview.validRows,
  });
  if (error || typeof data !== 'string' || !previewTokenSchema.safeParse(data).success) {
    return { status: 'error', message: 'Não foi possível guardar a prévia. Tente novamente.' };
  }

  return { status: 'preview', preview, previewToken: data };
}

export async function commitImport(
  _previousState: CommitImportState,
  formData: FormData,
): Promise<CommitImportState> {
  const supabase = await authenticatedClient();
  if (!supabase) return { status: 'error', message: 'Sessão inválida. Entre novamente.' };

  const previewToken = previewTokenSchema.safeParse(formData.get('previewToken'));
  if (!previewToken.success) return { status: 'error', message: 'A prévia expirou. Envie o arquivo novamente.' };

  const { data, error } = await supabase.rpc('commit_import', {
    p_preview_token: previewToken.data,
  });
  const processedRows = Number((data as { processedRows?: unknown } | null)?.processedRows);
  if (error || !Number.isSafeInteger(processedRows) || processedRows < 1) {
    return { status: 'error', message: 'Não foi possível confirmar a importação.' };
  }

  return { status: 'committed', processedRows };
}
