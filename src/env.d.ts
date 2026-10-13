declare module 'virtual:published-release' {
  const release: import('./lib/music-releases').ReleaseData | null;
  export default release;
}
