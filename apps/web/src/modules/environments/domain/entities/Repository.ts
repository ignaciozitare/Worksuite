export type RepositoryId = string;

export interface Repository {
  id:          RepositoryId;
  name:        string;
  url:         string | null;
  is_archived: boolean;
}

export function repositoryFromRow(row: Record<string, unknown>): Repository {
  return {
    id:          row.id as string,
    name:        row.name as string ?? "",
    url:         row.url as string | null,
    is_archived: row.is_archived as boolean ?? false,
  };
}
