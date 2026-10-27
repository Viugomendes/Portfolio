import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"

const config = await loadQuartzConfig()
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

	// Particle background behind the sidebars of every other page
	let sidebarParticleResizeObserver
	const initializeSidebarParticles = () => {
		if (document.body.dataset.slug === "index") {
			sidebarParticleResizeObserver?.disconnect()
			return
		}

		const sidebars = document.querySelectorAll(
			"#quartz-body > .left.sidebar, #quartz-body > .right.sidebar",
		)
		if (sidebars.length === 0) return

		if (!window.particlesJS) {
			withParticles(initializeSidebarParticles)
			return
		}

		if (!sidebarParticleResizeObserver) {
			sidebarParticleResizeObserver = new ResizeObserver(() => {
				window.dispatchEvent(new Event("resize"))
			})
		}
		sidebarParticleResizeObserver.disconnect()

		sidebars.forEach((sidebar) => {
			let host = sidebar.querySelector(".sidebar-particles")
			if (!host) {
				host = document.createElement("div")
				host.className = "sidebar-particles"
				host.id = sidebar.classList.contains("left")
					? "left-sidebar-particles"
					: "right-sidebar-particles"
				host.setAttribute("aria-hidden", "true")
				sidebar.prepend(host)
			}

			if (host.dataset.particlesInitialized !== "true") {
				host.dataset.particlesInitialized = "true"
				window.particlesJS.load(host.id, assetUrl("assets/particles.json"))
			}
			sidebarParticleResizeObserver.observe(host)
		})
	}

	document.addEventListener("nav", initializeLanding)
	document.addEventListener("nav", initializeSidebarParticles)
	initializeLanding()
	initializeSidebarParticles()

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
