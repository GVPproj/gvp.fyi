export type SoftwareProjectCategory = 'portfolio' | 'small-websites' | 'early-projects';

export interface SoftwareProjectRole {
  title: string;
  paragraphs: string[];
}

export interface SoftwareProjectTeamMember {
  name: string;
  role: string;
  href?: string;
}

export interface SoftwareProjectImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface SoftwareProject {
  slug: string;
  title: string;
  description: string;
  screenshot: string;
  screenshotWidth: number;
  screenshotHeight: number;
  tooling: string[];
  url?: string;
  repo?: string;
  category: SoftwareProjectCategory;
  role?: SoftwareProjectRole;
  tagline?: string;
  team?: SoftwareProjectTeamMember[];
  gallery?: SoftwareProjectImage[];
}

// Imported from grahamvanpelt.dev's portfolioData.ts and portfolio.astro.
// Content and screenshots are local so builds do not depend on the old site.
export const softwareProjects: SoftwareProject[] = [
  {
    slug: 'tipbox',
    title: 'Tipbox.io',
    description:
      'A collaboration and workflow tool for the film and TV industries.',
    screenshot: '/images/software/tipboxThumb.webp',
    screenshotWidth: 2548,
    screenshotHeight: 1299,
    tooling: ['TypeScript', 'React', 'CSS'],
    url: 'https://www.tipbox.io',
    category: 'portfolio',
    role: {
      title: 'My Role',
      paragraphs: [
        "As a Full-Stack Engineer and Product Experience Lead at Tipbox, I architected and delivered end-to-end solutions for a collaborative document and tasks platform. My hundreds of commits span the frontend and backend, encompassing an entire task management ecosystem—from GraphQL schema design to React component implementation. I've owned database optimization, API development, UI state management, and UX design, leading architectural decisions and enhancing authentication flows. Bridging product vision with technical execution, I deliver complex features, integrating AWS, PostgreSQL, and React/TypeScript for robust performance and exceptional user experience.",
      ],
    },
    tagline:
      "Your production team's best friend – take all the headaches out of file sharing, task tracking, workflows and project management.",
    team: [
      {
        name: 'Graham Van Pelt',
        role: 'Full-Stack Engineer',
      },
      {
        name: 'Howard Baral',
        role: 'Founder & Chief Executive Officer',
        href: 'https://www.linkedin.com/in/howie-baral-9550aa4/',
      },
      {
        name: 'Michael Schlein',
        role: 'Chief Product Officer',
        href: 'https://www.linkedin.com/in/michaelschlein/',
      },
      {
        name: 'Milton Gonzalez',
        role: 'Chief Technical Officer',
        href: 'https://www.linkedin.com/in/giovangonzalez/',
      },
      {
        name: 'Ben Frey',
        role: 'Creative Director & Senior Product Designer',
        href: 'https://www.linkedin.com/in/ben-frey-88186a65/',
      },
      {
        name: 'Jeffery Stefani',
        role: 'Creative Director',
        href: 'https://www.linkedin.com/in/jeffrey-stefani-85563a221/',
      },
      {
        name: 'Jonny Nguyen',
        role: 'Full-stack, DevOps Engineer',
        href: 'https://www.linkedin.com/in/jonny-nguyen/',
      },
      {
        name: 'Dion Kodhyat',
        role: 'Front-End Developer',
        href: 'https://www.linkedin.com/in/dionkodhyat/',
      },
    ],
    gallery: [
      {
        src: '/images/software/laptop.png',
        alt: 'Tipbox.io laptop and mobile mockup',
        width: 2012,
        height: 1698,
      },
      {
        src: '/images/software/no-looking-back.png',
        alt: 'No looking back',
        width: 1538,
        height: 1302,
      },
      {
        src: '/images/software/project-board.jpg',
        alt: 'A Tipbox.io project board with attached media',
        width: 1920,
        height: 1080,
      },
    ],
  },
  {
    slug: 'bloom-bnb',
    title: 'A B&B Marketing Page',
    description:
      'Created with Gatsby, this performant marketing site features optimized images, speedy navigation, a nice gallery component and a phenomenal Lighthouse score.',
    screenshot: '/images/software/port-bloom.webp',
    screenshotWidth: 1436,
    screenshotHeight: 802,
    tooling: ['Gatsby', 'React', 'CSS'],
    repo: 'https://github.com/GVPproj/bloom-bnb-gatsby',
    category: 'early-projects',
  },
  {
    slug: 'biolink',
    title: "A 'Linktree'-style React app",
    description:
      "A 'link-in-the-bio' type page to link my Instagram followers to my various musical activities.",
    screenshot: '/images/software/port-links.webp',
    screenshotWidth: 1435,
    screenshotHeight: 812,
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
    screenshot: '/images/software/port-groundwaves.webp',
    screenshotWidth: 1438,
    screenshotHeight: 807,
    tooling: ['Astro', 'React', 'TailwindCSS'],
    url: 'https://groundwaves.live',
    category: 'small-websites',
  },
  {
    slug: 'quizzical',
    title: 'An API-driven Quiz Game',
    description: 'A trivia app pulling in questions from the OpenTrivia API.',
    screenshot: '/images/software/port-quizzical.webp',
    screenshotWidth: 1440,
    screenshotHeight: 811,
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
    screenshot: '/images/software/port-tenzies.webp',
    screenshotWidth: 1434,
    screenshotHeight: 807,
    tooling: ['HTML', 'JavaScript', 'CSS'],
    url: 'https://gvp-tenzies-react.netlify.app/',
    repo: 'https://github.com/GVPproj/react-tenzies',
    category: 'early-projects',
  },
  {
    slug: 'colour-scheme-generator',
    title: 'A JavaScript Colour Scheme Generator',
    description: 'Find a colour palette for your next project.',
    screenshot: '/images/software/port-colour.webp',
    screenshotWidth: 1447,
    screenshotHeight: 807,
    tooling: ['HTML', 'JavaScript', 'CSS'],
    url: 'https://gvpproj.github.io/colour-scheme-generator/',
    repo: 'https://github.com/GVPproj/colour-scheme-generator',
    category: 'early-projects',
  },
];
