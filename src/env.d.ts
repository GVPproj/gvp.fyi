declare module 'virtual:published-release' {
  // Authoritative CMS catalogue; an empty array means no published releases.
  const release: import('./lib/music-releases').ReleaseData[];
  export default release;
}
