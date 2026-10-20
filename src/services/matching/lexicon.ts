// Technology lexicon: recognises skills in job descriptions, in the profile, and in generated text.

function w(src: string, flags = "gi"): RegExp {
  // Custom boundaries so "Node.js" is not also read as "JS", "MySQL" as "SQL", or "Java" as part of "JavaScript".
  return new RegExp(`(?<![\\w+#.])(?:${src})(?![\\w+#])`, flags);
}

const LEXICON: [name: string, pattern: RegExp][] = [
  ["JavaScript", w("javascript|js|es6|ecmascript")],
  ["TypeScript", w("typescript")],
  ["React Native", w("react[- ]native")],
  ["React", w("react(?:\\.?js)?(?![- ]native)")],
  ["Next.js", w("next\\.?js")],
  ["Node.js", w("node(?:\\.?js)?")],
  ["Express", w("express\\.?js|express(?= framework| server| middleware| api)")],
  ["NestJS", w("nest\\.?js")],
  ["MongoDB", w("mongo(?:db)?|mongoose")],
  ["SQL Server", w("(?:ms |microsoft )?sql server|mssql|ms sql|t-sql|tsql|ssms")],
  ["PostgreSQL", w("postgres(?:ql)?")],
  ["MySQL", w("mysql")],
  ["SQL", w("sql(?! server)")],
  ["Redis", w("redis")],
  ["Kafka", w("kafka")],
  ["Elasticsearch", w("elastic ?search")],
  ["DynamoDB", w("dynamodb")],
  ["Firebase", w("firebase|firestore")],
  ["Supabase", w("supabase")],
  ["Prisma", w("prisma")],
  ["HTML", w("html5?")],
  ["CSS", w("css3?")],
  ["Sass", w("sass|scss")],
  ["Tailwind CSS", w("tailwind(?: ?css)?")],
  ["Bootstrap", w("bootstrap")],
  ["Material UI", w("material[- ]?ui|mui")],
  ["Redux", w("redux(?: toolkit)?")],
  ["Zustand", w("zustand")],
  ["React Query", w("react query|tanstack(?: query)?")],
  ["GraphQL", w("graphql|apollo")],
  ["REST APIs", w("rest(?:ful)?(?: ?api| ?apis| services| endpoints)|restful")],
  ["REST APIs", w("REST", "g")],
  ["JWT", w("jwt|json web tokens?")],
  ["OAuth", w("oauth2?|openid connect|oidc")],
  ["GitHub", w("github")],
  ["Git", w("git")],
  ["Postman", w("postman")],
  ["Vite", w("vite")],
  ["Webpack", w("webpack")],
  ["Jest", w("jest|vitest")],
  ["Cypress", w("cypress")],
  ["Playwright", w("playwright")],
  ["Testing Library", w("(?:react )?testing library")],
  ["Storybook", w("storybook")],
  ["Docker", w("docker")],
  ["Kubernetes", w("kubernetes|k8s")],
  ["AWS", w("aws|amazon web services")],
  ["Azure", w("azure")],
  ["GCP", w("gcp|google cloud")],
  ["CI/CD", w("ci ?/ ?cd|ci-cd|continuous integration|github actions|jenkins")],
  ["Terraform", w("terraform")],
  ["Linux", w("linux|unix")],
  ["Python", w("python")],
  ["Django", w("django")],
  ["Flask", w("flask|fastapi")],
  ["Java", w("java")],
  ["Spring", w("spring ?boot|spring framework|spring mvc")],
  ["Kotlin", w("kotlin")],
  ["C#", w("c#|c sharp|csharp")],
  [".NET", new RegExp("(?<![\\w+#])(?:\\.net(?: core)?|asp\\.net|dotnet)(?![\\w+#])", "gi")],
  ["C++", w("c\\+\\+")],
  ["Go", w("golang")],
  ["Go", new RegExp("(?<![\\w+#.])Go(?=\\s*(?:,|/|\\)| and | or | developer| engineer| programming| services| microservices))", "g")],
  ["Rust", w("rust")],
  ["PHP", w("php|laravel|symfony")],
  ["Ruby", w("ruby(?: on rails)?|rails")],
  ["Scala", w("scala")],
  ["Elixir", w("elixir|phoenix liveview")],
  ["Angular", w("angular(?:\\.?js)?")],
  ["Vue", w("vue(?:\\.?js)?|nuxt(?:\\.?js)?")],
  ["Svelte", w("svelte(?:kit)?")],
  ["Swift", new RegExp("(?<![\\w+#.])(?:Swift|SwiftUI)(?![\\w+#])", "g")],
  ["Flutter", w("flutter|dart")],
  ["Android", w("android")],
  ["iOS", new RegExp("(?<![\\w+#.])iOS(?![\\w+#])", "g")],
  ["Figma", w("figma")],
  ["WebSockets", w("web ?sockets?|socket\\.io")],
  ["Microservices", w("micro-?services?")],
  ["SMTP", w("smtp")],
  ["IMAP", w("imap")],
  ["MERN", w("mern")],
  ["Agile", w("agile|scrum|sprint planning")],
  ["Machine Learning", w("machine learning|deep learning|pytorch|tensorflow")],
  ["LLM", w("llms?|generative ai|gen ?ai|langchain|prompt engineering")],
  ["Salesforce", w("salesforce|apex")],
  ["WordPress", w("wordpress")],
  ["Shopify", w("shopify|liquid")],
  ["Web3", w("solidity|web3|blockchain|smart contracts?")],
  ["Stored Procedures", w("stored procedures?")],
  ["RBAC", w("rbac|role[- ]based access(?: control)?")],
  ["Responsive Design", w("responsive (?:design|ui|web|layouts?)")],
];

/** Skills that are implied by another skill on the profile. */
const IMPLIES: Record<string, string[]> = {
  MERN: ["MongoDB", "Express", "React", "Node.js"],
  "SQL Server": ["SQL", "Stored Procedures"],
  "Next.js": ["React"],
  TypeScript: ["JavaScript"],
  "Express": ["Node.js"],
};

/** Soft, non-differentiating terms that should not count for or against a match. */
const GENERIC = new Set(["Git", "GitHub", "Agile", "HTML", "CSS", "Responsive Design", "Postman"]);

/** Languages / frameworks that define a role's core stack. */
export const CORE_STACK = new Set([
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express", "NestJS", "React Native", "Angular", "Vue", "Svelte",
  "Python", "Django", "Flask", "Java", "Spring", "Kotlin", "C#", ".NET", "C++", "Go", "Rust", "PHP", "Ruby", "Scala", "Elixir",
  "Swift", "Flutter", "Android", "iOS", "Salesforce", "WordPress", "Shopify", "Web3", "Machine Learning",
]);

/** Find every lexicon skill mentioned in a piece of text, in order of first appearance. */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  const found = new Map<string, number>();
  for (const [name, pattern] of LEXICON) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m && (!found.has(name) || m.index < found.get(name)!)) found.set(name, m.index);
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
}

export function expandImplied(skills: Iterable<string>): Set<string> {
  const out = new Set(skills);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of [...out]) {
      for (const implied of IMPLIES[s] ?? []) {
        if (!out.has(implied)) {
          out.add(implied);
          grew = true;
        }
      }
    }
  }
  return out;
}

export function isGeneric(skill: string): boolean {
  return GENERIC.has(skill);
}

const PREFERRED_HEADING = /^\W*(nice[- ]to[- ]haves?|good[- ]to[- ]haves?|preferred|bonus|pluses|plus points|it(?:'|’)?s a plus|desirable|optional|extra credit|what would be great|brownie points)/i;
const REQUIRED_HEADING = /^\W*(requirements?|required|qualifications?|must[- ]haves?|what you(?:'|’)?ll need|what we(?:'|’)?re looking for|who you are|skills|your profile|you have|basic qualifications|minimum qualifications|about you|responsibilities|what you(?:'|’)?ll do)/i;
const PREFERRED_INLINE = /\b(nice to have|good to have|is a plus|a plus|bonus|preferred|preferably|ideally|desirable|familiarity with|exposure to)\b/i;

/** Split the skills a job mentions into required vs preferred using section headings and inline cues. */
export function classifyJobSkills(description: string, title = ""): { required: string[]; preferred: string[] } {
  const required = new Set<string>(extractSkills(title));
  const preferred = new Set<string>();
  let zone: "required" | "preferred" = "required";
  for (const line of description.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.length < 80) {
      if (PREFERRED_HEADING.test(trimmed)) zone = "preferred";
      else if (REQUIRED_HEADING.test(trimmed)) zone = "required";
    }
    const skills = extractSkills(trimmed);
    if (!skills.length) continue;
    const target = zone === "preferred" || PREFERRED_INLINE.test(trimmed) ? preferred : required;
    for (const s of skills) target.add(s);
  }
  for (const s of required) preferred.delete(s);
  return { required: [...required], preferred: [...preferred] };
}
