import { ulid as ulidImpl } from 'ulid';

export function ulid(): string {
  return ulidImpl();
}
