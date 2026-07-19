'use strict';

if (!window.__vkAudioSaverBridge) {
	window.__vkAudioSaverBridge = 1;
	const seen = new Map();

	window.addEventListener('message', e => {
		if (e.source !== window) return;
		const data = e.data;
		if (!data || data.source !== 'vk-audio-saver' || data.type !== 'download') return;
		if (!data.url) return;

		const key = String(data.id || (data.url + '|' + (data.filename || '')));
		const now = Date.now();
		const prev = seen.get(key) || 0;
		if (now - prev < 2500) return;
		seen.set(key, now);
		if (seen.size > 50) {
			for (const [k, t] of seen) {
				if (now - t > 10000) seen.delete(k);
			}
		}

		chrome.runtime.sendMessage({
			action: 'download',
			url: data.url,
			filename: data.filename || '',
			id: key
		}, () => void chrome.runtime.lastError);
	});
}
