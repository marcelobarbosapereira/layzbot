import { z } from 'zod';

export function buildOwnerStoragePrefix(ownerId: string): string {
  return `${z.string().uuid().parse(ownerId)}/`;
}
