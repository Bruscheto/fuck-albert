/**
 * Chrome API mock for test harness.
 * Uses BroadcastChannel to sync storage changes across same-origin iframes.
 * Self-detecting: does nothing when running as a real Chrome extension.
 */
(function () {
	// Skip if real Chrome extension API exists
	if (window.chrome?.runtime?.getManifest) return;

	// Skip if not inside the test harness
	let sharedStorage;
	try {
		sharedStorage = window.parent?.__sharedStorage;
	} catch (e) {
		return;
	}
	if (!sharedStorage) return;

	const ORIGIN = window.location.origin + "/";
	const localListeners = [];
	const channel = new BroadcastChannel("chrome-storage-sync");

	// Listen for storage changes from OTHER iframes
	channel.addEventListener("message", (event) => {
		const { changes, namespace } = event.data;
		for (const cb of localListeners) {
			try {
				cb(changes, namespace);
			} catch (e) {
				console.error("[chrome-mock] listener error:", e);
			}
		}
	});

	window.chrome = {
		runtime: {
			getURL: (path) => ORIGIN + path,
			sendMessage: () => Promise.resolve(),
			onMessage: { addListener: () => {}, removeListener: () => {} },
			id: "test-harness-mock",
		},
		storage: {
			local: {
				get: (keys) =>
					new Promise((resolve) => {
						const storage = window.parent.__sharedStorage;
						if (keys === null) { resolve({ ...storage }); return; }
						const result = {};
						const keyList = Array.isArray(keys)
							? keys
							: typeof keys === "string"
								? [keys]
								: Object.keys(keys || {});
						for (const k of keyList) {
							if (k in storage)
								result[k] = JSON.parse(JSON.stringify(storage[k]));
						}
						resolve(result);
					}),
				set: (items) =>
					new Promise((resolve) => {
						const storage = window.parent.__sharedStorage;
						const changes = {};
						for (const [k, v] of Object.entries(items)) {
							const oldValue = storage[k];
							storage[k] = JSON.parse(JSON.stringify(v));
							changes[k] = { oldValue, newValue: storage[k] };
						}
						// Fire local listeners (this iframe)
						for (const cb of localListeners) {
							try { cb(changes, "local"); } catch (e) { console.error(e); }
						}
						// Broadcast to OTHER iframes
						channel.postMessage({ changes, namespace: "local" });
						resolve();
					}),
				clear: () =>
					new Promise((resolve) => {
						const storage = window.parent.__sharedStorage;
						for (const k of Object.keys(storage)) delete storage[k];
						resolve();
					}),
			},
			onChanged: {
				addListener: (cb) => localListeners.push(cb),
				removeListener: (cb) => {
					const i = localListeners.indexOf(cb);
					if (i >= 0) localListeners.splice(i, 1);
				},
			},
		},
		tabs: {
			query: () => Promise.resolve([{ id: 1, url: "https://sis.nyu.edu" }]),
			sendMessage: () => Promise.resolve(null),
			create: (opts) => { if (opts.url) window.open(opts.url, "_blank"); },
		},
		action: {
			setBadgeText: () => Promise.resolve(),
			setBadgeBackgroundColor: () => Promise.resolve(),
		},
		scripting: { executeScript: () => Promise.resolve() },
		contextMenus: { create: () => {}, onClicked: { addListener: () => {} } },
	};

	console.log("[chrome-mock] Active");
})();
