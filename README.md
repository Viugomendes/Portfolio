# Victor Hugo · Cybersecurity & Pentesting Portfolio

[![Deploy](https://github.com/Viugomendes/Portfolio/actions/workflows/deploy.yaml/badge.svg?branch=v5)](https://github.com/Viugomendes/Portfolio/actions/workflows/deploy.yaml)

[![Victor Hugo, cybersecurity and pentesting portfolio](content/static/og-home.png)](https://viugomendes.github.io/Portfolio/)

**Live site:** https://viugomendes.github.io/Portfolio/

This is the source of my personal site. I use it to document the machines I compromise in my lab, step by step, to write about the ideas that shape how I work, and to keep my training and certifications in one place.

## What you'll find

| Section | Description |
| --- | --- |
| [Writeups](https://viugomendes.github.io/Portfolio/writeups/) | Full walkthroughs of VulnHub machines, from reconnaissance to root: SQL injection, LFI to RCE, XXE, CSRF, file upload bypasses, buffer overflows, container escapes and Linux privilege escalation. Every writeup can be downloaded as Markdown. |
| [Blog](https://viugomendes.github.io/Portfolio/blog/) | Short essays on philosophy, trust and teamwork, and what they have to do with security work. |
| [Certifications](https://viugomendes.github.io/Portfolio/certifications) | Courses and certifications in offensive security, Linux and cloud, with their credentials. |
| [Contact](https://viugomendes.github.io/Portfolio/contacto) | The quickest way to reach me. |

## How it works

I write everything in Markdown with [Obsidian](https://obsidian.md/). [Quartz v5](https://quartz.jzhao.xyz/) turns those notes into a static site, and a GitHub Actions workflow builds it and publishes it to GitHub Pages on every push to `v5`.

On top of Quartz I added and customised:

- **Landing page** with an animated particle background and social links.
- **Header navigation** with dropdown menus generated from the content folders. It hides when you scroll down and comes back when you scroll up.
- **Machine panel** on every writeup: platform, difficulty, techniques, initial vector and privilege escalation, read from the note's front matter.
- **Download as Markdown** button on writeups. A small build step publishes each note's source next to its page.
- **Certificate gallery** with a lightbox viewer.
- **Live filter** on the writeup and blog listings.
- **Dark theme** with a custom red palette.

## Repository layout

| Path | Purpose |
| --- | --- |
| `content/` | The site's content: writeups, blog posts and pages, in Markdown. |
| `quartz.config.yaml` | Site configuration: theme, plugins and page layout. |
| `quartz.ts` | Build hooks and the client-side scripts specific to this site. |
| `quartz/styles/custom.scss` | The site's custom styling. |
| `.github/workflows/deploy.yaml` | Build and deploy pipeline. |
| `sync-conf.bat` | Windows helper that commits and pushes new content. |
| `quartz/`, `docs/` | The Quartz engine and its documentation (upstream). |

## Run it locally

Requires Node.js 22 or later.

```bash
git clone https://github.com/Viugomendes/Portfolio.git
cd Portfolio
npm ci
npx quartz build --serve
```

The site is then available at http://localhost:8080.

## A note on the writeups

Every writeup covers an intentionally vulnerable machine running in an isolated lab. The techniques are documented for learning and for defensive awareness. Only test systems you own or have explicit permission to assess.

## Credits and license

- Site engine: [Quartz](https://github.com/jackyzha0/quartz) by Jacky Zhao, MIT License (see [LICENSE.txt](LICENSE.txt)).
- Landing page adapted from the Neumorphism theme by Long Do, MIT License (see [quartz/static/neumorphism/LICENSE](quartz/static/neumorphism/LICENSE)).
- Background animation: [particles.js](https://github.com/VincentGarreau/particles.js) by Vincent Garreau, MIT License.

The writeups, blog posts and the rest of the site's content are my own work.

## Contact

[Contact form](https://viugomendes.github.io/Portfolio/contacto) · [LinkedIn](https://www.linkedin.com/in/victorhugomnds/) · [GitHub](https://github.com/Viugomendes) · [X](https://x.com/JrPentester)

Victor Hugo
