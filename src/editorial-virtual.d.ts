declare module 'virtual:published-content' {
  interface PublishedContentSnapshot {
    revision: string;
    kind: string;
    slug: string;
    state: 'published' | 'unpublished';
    data: any;
    assets: { name: string; path: string; sha256: string; url: string }[];
  }
  const snapshots: PublishedContentSnapshot[] | null;
  export default snapshots;
}
