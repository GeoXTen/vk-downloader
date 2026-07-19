'use strict';

const recentDownloads = new Map();
const pendingNames = new Map();

async function init() {
	const scripts = [
		{
			id: 'vk-dl-main',
			js: ['context.js'],
			matches: ['https://vk.com/*', 'https://vk.ru/*'],
			runAt: 'document_start',
			world: 'MAIN'
		},
		{
			id: 'vk-dl-bridge',
			js: ['js/bridge.js'],
			matches: ['https://vk.com/*', 'https://vk.ru/*'],
			runAt: 'document_start',
			world: 'ISOLATED'
		}
	];
	const noop = () => {};
	await chrome.scripting.unregisterContentScripts({
		ids: scripts.map(s => s.id)
	}).catch(noop);
	await chrome.scripting.registerContentScripts(scripts).catch(noop);
}

function safeName(name) {
	return String(name || 'vk-media')
		.replace(/[\/\\:*?"<>|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120) || 'vk-media';
}

function ensureExt(filename, url) {
	if (/\.(mp3|mp4|m4a|webm|mkv)$/i.test(filename)) return filename;
	if (/\.m3u8|hls/i.test(url)) return filename + '.mp4';
	if (/audio|vkuseraudio/i.test(url)) return filename + '.mp3';
	return filename + '.mp4';
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
	const forced = pendingNames.get(item.id) || pendingNames.get(item.url);
	if (forced) {
		pendingNames.delete(item.id);
		pendingNames.delete(item.url);
		suggest({ filename: forced, conflictAction: 'uniquify' });
		return;
	}
	// If browser/CDN used a pure numeric name, keep extension but leave as-is only if no mapping
	suggest();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (!msg || msg.action !== 'download' || !msg.url) {
		sendResponse({ ok: false });
		return false;
	}

	const url = String(msg.url);
	const dedupeKey = String(msg.id || url);
	const now = Date.now();
	const prev = recentDownloads.get(dedupeKey) || 0;
	if (now - prev < 2500) {
		sendResponse({ ok: true, deduped: true });
		return false;
	}
	recentDownloads.set(dedupeKey, now);

	let filename = ensureExt(safeName(msg.filename), url);
	pendingNames.set(url, filename);

	chrome.downloads.download({
		url,
		filename,
		saveAs: false,
		conflictAction: 'uniquify'
	}, id => {
		if (chrome.runtime.lastError) {
			pendingNames.delete(url);
			sendResponse({ ok: false, error: chrome.runtime.lastError.message });
			return;
		}
		if (id != null) pendingNames.set(id, filename);
		sendResponse({ ok: true, id });
	});
	return true;
});

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
init();
