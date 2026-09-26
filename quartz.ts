import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"

const config = await loadQuartzConfig()
export default config

const layout = await loadQuartzLayout()
const headerAndLandingScripts = `
if (!window.__quartzFolderDropdownsInitialized) {
	window.__quartzFolderDropdownsInitialized = true
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

	document.addEventListener("prenav", closeFolderDropdowns)
	document.addEventListener("nav", () => {
		if (document.body.dataset.slug === "index") window.setTimeout(closeFolderDropdowns, 0)
	})
}

if (!window.__neumorphismLandingInitialized) {
	window.__neumorphismLandingInitialized = true

	const initializeLanding = () => {
		const landing = document.getElementById("landing")
		if (!landing) return

		const configuredBasePath = document.body.dataset.basepath || "."
		const basePath =
			configuredBasePath.startsWith("/") && window.location.pathname.startsWith(configuredBasePath)
				? configuredBasePath
				: "."
		const assetUrl = (path) => new URL(basePath + "/static/neumorphism/" + path, window.location.href).href

		for (const icon of landing.querySelectorAll('use[href^="static/neumorphism/"]')) {
			const path = icon.getAttribute("href").replace("static/neumorphism/", "")
			icon.setAttribute("href", assetUrl(path))
		}

		const startParticles = () => {
			const activeLanding = document.getElementById("landing")
			if (!activeLanding || activeLanding.dataset.particlesLoaded === "true") return
			activeLanding.dataset.particlesLoaded = "true"
			window.particlesJS.load("landing", assetUrl("assets/particles.json"))
		}

		const loadParticles = () => {
			if (window.particlesJS) {
				startParticles()
				return
			}
			if (window.__neumorphismParticlesLoading) return
			window.__neumorphismParticlesLoading = true

			const script = document.createElement("script")
			script.src = assetUrl("particles.js")
			script.onload = () => {
				window.__neumorphismParticlesLoading = false
				startParticles()
			}
			script.onerror = () => {
				window.__neumorphismParticlesLoading = false
			}
			document.head.appendChild(script)
		}

		loadParticles()
	}

	document.addEventListener("nav", initializeLanding)
	initializeLanding()
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
    headerAndLandingScripts,
  ]
}

export { layout }
