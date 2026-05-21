import type { RBACSupabaseClient } from '@solvera/pace-core/rbac';

export interface PumpPostgrestQueryResult<T> {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
}

/** Minimal chainable query shape for pump Supabase tables (RBAC client returns unknown from .from). */
export interface PumpPostgrestQueryBuilder {
  select(
    columns: string,
    options?: { count: 'exact'; head: true }
  ): PumpPostgrestQueryBuilder;
  eq(column: string, value: unknown): PumpPostgrestQueryBuilder;
  in(column: string, values: unknown[]): PumpPostgrestQueryBuilder;
  or(filter: string): PumpPostgrestQueryBuilder;
  order(
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean }
  ): PumpPostgrestQueryBuilder;
  range(from: number, to: number): PromiseLike<PumpPostgrestQueryResult<unknown[]>>;
  maybeSingle(): PromiseLike<PumpPostgrestQueryResult<unknown>>;
  then<T>(
    onfulfilled?: (value: PumpPostgrestQueryResult<unknown>) => T | PromiseLike<T>
  ): Promise<T>;
}

export function pumpFrom(
  client: RBACSupabaseClient,
  table: string
): PumpPostgrestQueryBuilder {
  return client.from(table) as PumpPostgrestQueryBuilder;
}
