declare module 'virtual:published-content' {
  interface PublishedLike {
    id: string;
    data: any;
    assets: { name: string; path: string; sha256: string; url: string }[];
  }
  const items: PublishedLike[];
  export default items;
}
