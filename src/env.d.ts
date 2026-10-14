declare module 'virtual:published-release' {
  // null: local fallback; false: validated explicit withdrawal.
  const release: import('./lib/music-releases').ReleaseData | import('./lib/music-releases').ReleaseData[] | null | false;
  export default release;
}
