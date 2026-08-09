export interface SyncInput {
  ownerId: string;
  sourceId: string;
  /** owner_source_connections.id — absent for connectors that need no OAuth (stratxcel_internal, stratxcel_admin_ui). */
  connectionId?: string;
  cursor: Record<string, unknown>;
}

export interface SyncOutput {
  eventsIngested: number;
  nextCursor: Record<string, unknown>;
}

export type SyncFn = (input: SyncInput) => Promise<SyncOutput>;
