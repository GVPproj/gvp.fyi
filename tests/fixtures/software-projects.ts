import type { SoftwareProject } from './software-project.ts';

// Expected portfolio content for browser assertions, not publishing API fixtures.
// Pages and images are loaded from src/content/software.
export const softwareProjects: SoftwareProject[] = [
  {
    slug: 'tipbox',
    title: 'Tipbox.io',
    description:
      'A collaboration and workflow tool for the film and TV industries.',
    tooling: ['TypeScript', 'React', 'CSS'],
    url: 'https://www.tipbox.io',
    category: 'portfolio',
    role: {
      paragraphs: [
        "As a Full-Stack Engineer and Product Experience Lead at Tipbox, I architected and delivered end-to-end solutions for a collaborative document and tasks platform. My hundreds of commits span the frontend and backend, encompassing an entire task management ecosystem—from GraphQL schema design to React component implementation. I've owned database optimization, API development, UI state management, and UX design, leading architectural decisions and enhancing authentication flows. Bridging product vision with technical execution, I deliver complex features, integrating AWS, PostgreSQL, and React/TypeScript for robust performance and exceptional user experience.",
      ],
    },
    team: [
      { name: 'Graham Van Pelt' },
      { name: 'Howard Baral' },
      { name: 'Michael Schlein' },
      { name: 'Milton Gonzalez' },
      { name: 'Ben Frey' },
      { name: 'Jeffery Stefani' },
      { name: 'Jonny Nguyen' },
      { name: 'Dion Kodhyat' },
    ],
    galleryCount: 3,
  },
  {
    slug: 'bloom-bnb',
    title: 'A B&B Marketing Page',
    description:
      'Created with Gatsby, this performant marketing site features optimized images, speedy navigation, a nice gallery component and a phenomenal Lighthouse score.',
    tooling: ['Gatsby', 'React', 'CSS'],
    repo: 'https://github.com/GVPproj/bloom-bnb-gatsby',
    category: 'early-projects',
  },
  {
    slug: 'biolink',
    title: "A 'Linktree'-style React app",
    description:
      "A 'link-in-the-bio' type page to link my Instagram followers to my various musical activities.",
    tooling: ['React', 'JavaScript', 'CSS'],
    url: 'https://links.grahamvanpelt.com',
    repo: 'https://github.com/GVPproj/biolink-react',
    category: 'portfolio',
  },
  {
    slug: 'groundwaves',
    title: 'A music festival page built with Astro',
    description:
      'A marketing page for an outdoor performance series that explores the relationship between nature, technology, and ourselves through immersive art experiences.',
    tooling: ['Astro', 'React', 'TailwindCSS'],
    url: 'https://groundwaves.live',
    category: 'small-websites',
  },
  {
    slug: 'quizzical',
    title: 'An API-driven Quiz Game',
    description: 'A trivia app pulling in questions from the OpenTrivia API.',
    tooling: ['React', 'CSS'],
    url: 'https://gvp-react-quizzical.netlify.app/',
    repo: 'https://github.com/GVPproj/react-trivia',
    category: 'early-projects',
  },
  {
    slug: 'tenzies',
    title: 'A JavaScript Dice Game',
    description:
      'Tenzies, a dice-matching game with a timer and persistent high score.',
    tooling: ['HTML', 'JavaScript', 'CSS'],
    url: 'https://gvp-tenzies-react.netlify.app/',
    repo: 'https://github.com/GVPproj/react-tenzies',
    category: 'early-projects',
  },
  {
    slug: 'colour-scheme-generator',
    title: 'A JavaScript Colour Scheme Generator',
    description: 'Find a colour palette for your next project.',
    tooling: ['HTML', 'JavaScript', 'CSS'],
    url: 'https://gvpproj.github.io/colour-scheme-generator/',
    repo: 'https://github.com/GVPproj/colour-scheme-generator',
    category: 'early-projects',
  },
];
