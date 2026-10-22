export interface IListWithContentTypes {
  Id: string;
  Title: string;
  ContentTypes?: { Name: string }[];
}

/**
 * Keeps the lists that carry the content type. When no content-type data is
 * available (empty/undefined), returns allLists unchanged as the fallback.
 */
export function filterListsByContentType<T extends { Id: string }>(
  allLists: T[],
  listsWithCts: IListWithContentTypes[] | undefined,
  contentTypeName: string
): T[] {
  if (!listsWithCts || listsWithCts.length === 0) { return allLists; }
  const ok = new Set(
    listsWithCts
      .filter(l => (l.ContentTypes ?? []).some(ct => ct.Name === contentTypeName))
      .map(l => l.Id.toLowerCase())
  );
  return allLists.filter(l => ok.has(l.Id.toLowerCase()));
}
