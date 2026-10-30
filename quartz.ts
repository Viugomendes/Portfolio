import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import fs from "node:fs/promises"
import nodePath from "node:path"

const config = await loadQuartzConfig()

// Emit the raw Markdown source of each writeup alongside its HTML (e.g.
// public/Writeups/Infovore.md) so it can be offered as a download.
async function* emitRawWriteups(ctx: any, content: any[]) {
  for (const [, file] of content) {
    const slug = file?.data?.slug
    if (!slug || !String(slug).toLowerCase().startsWith("writeups/")) continue
    const src =
      file?.path ??
      (file?.data?.relativePath
        ? nodePath.join(ctx.argv.directory, file.data.relativePath)
        : undefined)
    if (!src) continue
    let raw: string
    try {
      raw = await fs.readFile(src, "utf8")
    } catch {
      continue
    }
    const out = nodePath.join(ctx.argv.output, String(slug) + ".md")
    await fs.mkdir(nodePath.dirname(out), { recursive: true })
    await fs.writeFile(out, raw)
    yield out
  }
}

config.plugins.emitters.push({
  name: "RawWriteupSource",
  emit: emitRawWriteups,
  partialEmit: emitRawWriteups,
  getQuartzComponents: () => [],
} as any)

export default config

const layout = await loadQuartzLayout()

// Site-specific client scripts. They live here instead of inside quartz/ so that
// `npx quartz upgrade` does not conflict with local changes to Quartz's own files.
const portfolioScripts = `
if (!window.__portfolioScriptsInitialized) {
	window.__portfolioScriptsInitialized = true

	// Assets resolve against the configured base path (/Portfolio) on GitHub Pages
	// and against the site root when served locally.
	const assetUrl = (path) => {
		const configuredBasePath = document.body.dataset.basepath || ""
		const basePath =
			configuredBasePath.startsWith("/") && window.location.pathname.startsWith(configuredBasePath)
				? configuredBasePath
				: ""
		return new URL(basePath + "/static/neumorphism/" + path, window.location.origin).href
	}

	// Explorer folder dropdowns in the header
	const closeFolderDropdowns = () => {
		document.querySelectorAll(".page-header .explorer-ul > li > .folder-outer.open").forEach((menu) => {
			menu.classList.remove("open")
		})
	}

	document.addEventListener("click", (event) => {
		const target = event.target
		if (!(target instanceof Element)) return

		if (target.closest(".page-header .page-title a")) {
			closeFolderDropdowns()
			return
		}

		const folder = target.closest(".page-header .explorer .folder-container")
		if (!folder) return

		const currentMenu = folder.parentElement?.querySelector(":scope > .folder-outer")
		const list = folder.closest(".explorer-ul")
		if (!currentMenu || !list) return

		for (const menu of list.querySelectorAll(":scope > li > .folder-outer.open")) {
			if (menu !== currentMenu) menu.classList.remove("open")
		}
	}, true)

	// The explorer re-renders its tree after navigation, which can reopen menus
	const closeFolderDropdownsAfterRender = () => {
		const explorerLists = document.querySelectorAll(".page-header .explorer-ul")
		if (explorerLists.length === 0) return

		const observer = new MutationObserver((mutations) => {
			const renderedTree = mutations.some((mutation) =>
				Array.from(mutation.addedNodes).some(
					(node) => node instanceof Element && !node.classList.contains("overflow-end"),
				),
			)
			if (!renderedTree) return

			closeFolderDropdowns()
			observer.disconnect()
		})

		explorerLists.forEach((list) => observer.observe(list, { childList: true }))
	}

	document.addEventListener("prenav", closeFolderDropdowns)
	document.addEventListener("nav", () => {
		closeFolderDropdownsAfterRender()
		if (document.body.dataset.slug === "index") window.setTimeout(closeFolderDropdowns, 0)
	})

	// particles.js is shared by the landing and the sidebars, so it is loaded only once
	const pendingParticleCallbacks = []
	let isLoadingParticles = false
	const withParticles = (callback) => {
		if (window.particlesJS) {
			callback()
			return
		}
		pendingParticleCallbacks.push(callback)
		if (isLoadingParticles) return
		isLoadingParticles = true

		const script = document.createElement("script")
		script.src = assetUrl("particles.js")
		script.dataset.persist = ""
		script.onload = () => {
			isLoadingParticles = false
			for (const pending of pendingParticleCallbacks.splice(0)) pending()
		}
		script.onerror = () => {
			isLoadingParticles = false
			pendingParticleCallbacks.length = 0
			script.remove()
		}
		document.head.appendChild(script)
	}

	// Landing page (content/index.md)
	const loadLandingFont = () => {
		if (document.getElementById("landing-font")) return
		const link = document.createElement("link")
		link.id = "landing-font"
		link.rel = "stylesheet"
		link.href = "https://fonts.googleapis.com/css?family=Raleway&display=swap"
		link.dataset.persist = ""
		document.head.appendChild(link)
	}

	const initializeLanding = () => {
		const landing = document.getElementById("landing")
		if (!landing) return

		loadLandingFont()
		for (const icon of landing.querySelectorAll('use[href^="static/neumorphism/"]')) {
			const path = icon.getAttribute("href").replace("static/neumorphism/", "")
			icon.setAttribute("href", assetUrl(path))
		}

		withParticles(() => {
			const activeLanding = document.getElementById("landing")
			if (!activeLanding || activeLanding.dataset.particlesLoaded === "true") return
			activeLanding.dataset.particlesLoaded = "true"
			window.particlesJS.load("landing", assetUrl("assets/particles.json"))
		})
	}

	// Full-screen particle background behind every page except the landing.
	// A single fixed host lives directly on <body> (outside #quartz-root) so it
	// survives SPA navigations, and the red particles show through the page gutters.
	const initializePageParticles = () => {
		let host = document.getElementById("page-particles")

		if (document.body.dataset.slug === "index") {
			if (host) host.style.display = "none"
			return
		}

		if (!window.particlesJS) {
			withParticles(initializePageParticles)
			return
		}

		if (!host) {
			host = document.createElement("div")
			host.id = "page-particles"
			host.setAttribute("aria-hidden", "true")
			host.dataset.persist = ""
			document.body.prepend(host)
		}
		host.style.display = ""

		if (host.dataset.particlesInitialized !== "true") {
			host.dataset.particlesInitialized = "true"
			window.particlesJS.load("page-particles", assetUrl("assets/particles.json"))
		}
	}

	document.addEventListener("nav", initializeLanding)
	document.addEventListener("nav", initializePageParticles)
	initializeLanding()
	initializePageParticles()

	// Auto-hiding top nav: hide it when scrolling down to free up reading space,
	// and bring it back on ANY upward scroll (headroom pattern). Reads the scroll
	// position defensively so it works whichever element is the scroll container.
	const getScrollY = () =>
		window.scrollY ||
		document.documentElement.scrollTop ||
		document.body.scrollTop ||
		0
	let lastScrollY = getScrollY()
	let headerTicking = false
	const SHOW_AT_TOP = 80
	const updateHeaderVisibility = () => {
		headerTicking = false
		if (document.body.dataset.slug === "index") {
			document.body.classList.remove("nav-hidden")
			lastScrollY = getScrollY()
			return
		}
		const current = getScrollY()
		if (current <= SHOW_AT_TOP || current < lastScrollY) {
			// at the top, or scrolling up → show
			document.body.classList.remove("nav-hidden")
		} else if (current > lastScrollY) {
			// scrolling down → hide
			document.body.classList.add("nav-hidden")
		}
		lastScrollY = current
	}
	const onHeaderScroll = () => {
		if (headerTicking) return
		headerTicking = true
		window.requestAnimationFrame(updateHeaderVisibility)
	}
	window.addEventListener("scroll", onHeaderScroll, { passive: true })
	document.addEventListener("scroll", onHeaderScroll, { passive: true, capture: true })
	document.addEventListener("nav", () => {
		lastScrollY = getScrollY()
		document.body.classList.remove("nav-hidden")
	})

	// "Download .md" button under the table of contents on writeup pages.
	const initializeMdDownload = () => {
		const slug = document.body.dataset.slug || ""
		const lowerSlug = slug.toLowerCase()
		if (!lowerSlug.startsWith("writeups/") || lowerSlug === "writeups/index") return
		const right = document.querySelector("#quartz-body > .right.sidebar")
		if (!right || right.querySelector(".md-download")) return
		const configuredBasePath = document.body.dataset.basepath || ""
		const basePath =
			configuredBasePath.startsWith("/") && window.location.pathname.startsWith(configuredBasePath)
				? configuredBasePath
				: ""
		const link = document.createElement("a")
		link.className = "md-download"
		link.href = basePath + "/" + slug + ".md"
		link.setAttribute("download", slug.split("/").pop() + ".md")
		link.innerHTML =
			'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Download .md</span>'
		const toc = right.querySelector(".toc")
		if (toc) toc.insertAdjacentElement("afterend", link)
		else right.appendChild(link)
	}
	document.addEventListener("nav", initializeMdDownload)
	initializeMdDownload()

	// Certificate lightbox: view cert images in an overlay instead of a new tab,
	// so you can close it (click outside, the × button, or Esc) without going back.
	const openCertLightbox = (src, alt) => {
		let overlay = document.getElementById("cert-lightbox")
		if (!overlay) {
			overlay = document.createElement("div")
			overlay.id = "cert-lightbox"
			overlay.className = "cert-lightbox"
			overlay.innerHTML =
				'<button class="cert-lightbox-close" type="button" aria-label="Close">&times;</button><img class="cert-lightbox-img" alt="" />'
			document.body.appendChild(overlay)
			const close = () => {
				overlay.classList.remove("open")
				document.body.classList.remove("cert-lightbox-open")
			}
			overlay.addEventListener("click", (e) => {
				if (e.target === overlay || (e.target instanceof Element && e.target.closest(".cert-lightbox-close"))) close()
			})
			document.addEventListener("keydown", (e) => {
				if (e.key === "Escape") close()
			})
		}
		const image = overlay.querySelector(".cert-lightbox-img")
		image.src = src
		image.alt = alt || ""
		overlay.classList.add("open")
		document.body.classList.add("cert-lightbox-open")
	}
	document.addEventListener(
		"click",
		(event) => {
			const target = event.target
			if (!(target instanceof Element)) return
			const link = target.closest(".cert-thumb")
			if (!link || link.classList.contains("cert-thumb-pdf")) return
			const image = link.querySelector("img")
			if (!image) return
			// Capture phase + stopPropagation so Quartz's SPA router (a window-level
			// click listener) never navigates to the raw image before we intercept.
			event.preventDefault()
			event.stopPropagation()
			openCertLightbox(link.getAttribute("href") || image.getAttribute("src"), image.getAttribute("alt"))
		},
		true,
	)

	// Folder listings (/writeups, /blog): no hover preview on the cards, plus a
	// discreet filter box with a live counter.
	const initializeListingTools = () => {
		const listing = document.querySelector(".page-listing")
		if (!listing) return
		listing.querySelectorAll("a.internal").forEach((a) => a.setAttribute("data-no-popover", "true"))
		if (listing.querySelector(".listing-tools")) return
		const items = Array.from(listing.querySelectorAll(".section-ul > .section-li"))
		if (!items.length) return
		const slug = (document.body.dataset.slug || "").toLowerCase()
		const noun = slug.startsWith("blog") ? "post" : "writeup"
		const total = items.length
		const label = (shown) =>
			(shown === total ? total : shown + " of " + total) + " " + noun + (total === 1 ? "" : "s")

		const tools = document.createElement("div")
		tools.className = "listing-tools"
		const input = document.createElement("input")
		input.type = "search"
		input.className = "listing-filter"
		input.placeholder = "Filter"
		input.setAttribute("aria-label", "Filter " + noun + "s")
		const count = document.createElement("span")
		count.className = "listing-count"
		count.textContent = label(total)
		tools.append(count, input)

		input.addEventListener("input", () => {
			const q = input.value.trim().toLowerCase()
			let shown = 0
			items.forEach((li) => {
				const match = !q || (li.textContent || "").toLowerCase().includes(q)
				li.style.display = match ? "" : "none"
				if (match) shown++
			})
			count.textContent = label(shown)
		})
		const ul = listing.querySelector(".section-ul")
		ul.parentElement.insertBefore(tools, ul)
	}
	document.addEventListener("nav", initializeListingTools)
	initializeListingTools()

	// Contact form (content/contacto.md) opens the visitor's mail client
	document.addEventListener("submit", (event) => {
		const form = event.target
		if (!(form instanceof HTMLFormElement) || form.id !== "contact-form") return

		event.preventDefault()
		const formData = new FormData(form)
		const name = String(formData.get("name") ?? "").trim()
		const email = String(formData.get("email") ?? "").trim()
		const subject = String(formData.get("subject") ?? "").trim()
		const message = String(formData.get("message") ?? "").trim()
		const body = ["Name: " + name, "Email: " + email, "", message].join("\\n")
		// URLSearchParams encodes spaces as "+", which mail clients show literally
		window.location.href =
			"mailto:victorhugomnds@hotmail.com?subject=" +
			encodeURIComponent(subject) +
			"&body=" +
			encodeURIComponent(body)
	})
}
`

const headerComponents = new Set([
  ...(layout.defaults.header ?? []),
  ...Object.values(layout.byPageType).flatMap((pageLayout) => pageLayout.header ?? []),
])

for (const component of headerComponents) {
  const existingScripts = component.afterDOMLoaded
  component.afterDOMLoaded = [
    ...(Array.isArray(existingScripts)
      ? existingScripts
      : existingScripts
        ? [existingScripts]
        : []),
    portfolioScripts,
  ]
}

export { layout }
