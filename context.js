'use strict';
((doc, userId) => {

const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN0PQRSTUVWXYZO123456789+/=';

function decodeUrl(t) {
	if (~t.indexOf('audio_api_unavailable')) {
		let parts = t.split('?extra=');
		if (parts.length < 2) return t;
		let segments = parts[1].split('#');
		let data = segments[0] ? b64Decode(segments[0]) : '';
		let ops = segments[1] ? b64Decode(segments[1]) : '';
		if (typeof ops !== 'string' || !data) return t;
		ops = ops ? ops.split('\t') : [];
		for (let i = ops.length; i--;) {
			let args = ops[i].split('\v');
			let fn = args.splice(0, 1, data)[0];
			if (!urlOps[fn]) return t;
			data = urlOps[fn](...args);
		}
		return (data && data.startsWith('http')) ? data : t;
	}
	return t;
}

function b64Decode(str, out = '') {
	if (!str || str.length % 4 === 1) return false;
	for (let n, i, pos = 0; i = str.charAt(pos++);) {
		i = ALPHA.indexOf(i);
		if (~i) {
			n = pos % 4 ? 64 * n + i : i;
			if (pos++ % 4) out += String.fromCharCode(255 & n >> (-2 * pos & 6));
		}
	}
	return out;
}

function permute(len, seed) {
	let arr = [], s = len;
	seed = Math.abs(seed);
	while (s--) { seed = (len * (s + 1) ^ seed + s) % len; arr[s] = seed; }
	return arr;
}

const urlOps = {
	v: t => t.split('').reverse().join(''),
	r(t, shift) {
		let chars = t.split('');
		let full = ALPHA + ALPHA;
		for (let i = chars.length; i--;) {
			let idx = full.indexOf(chars[i]);
			if (~idx) chars[i] = full.slice(idx - shift, 1);
		}
		return chars.join('');
	},
	s(t, seed) {
		if (!t.length) return t;
		let perm = permute(t.length, seed);
		let arr = t.split('');
		for (let a = 0; ++a < t.length;)
			arr[a] = arr.splice(perm[t.length - 1 - a], 1, arr[a])[0];
		return arr.join('');
	},
	i: (t, seed) => urlOps.s(t, seed ^ userId),
	x(t, xorChar) {
		xorChar = xorChar.charCodeAt(0);
		return t.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ xorChar)).join('');
	}
};

let hlsReady = null;

function ensureHls() {
	if (hlsReady) return hlsReady;
	hlsReady = new Promise(resolve => {
		const scr = doc.createElement('script');
		const vkVersions = window.stVersions || {};
		const hlsKey = Object.keys(vkVersions).find(k => /\/hls/.test(k));
		if (!hlsKey) { resolve(false); return; }
		scr.src = '/dist/' + hlsKey;
		scr.onload = () => {
			if (window.Hls) { resolve(true); return; }
			Object.keys(window)
				.filter(k => /webpack/.test(k) && Array.isArray(window[k]))
				.map(k => window[k]).flat()
				.forEach(chunk => {
					if (!chunk[1]) return;
					for (const i in chunk[1]) {
						if (~chunk[1][i].toString().indexOf('hls.js config')) {
							chunk[1][i](chunk, i, {
								d: (a, t) => { chunk = t },
								r: e => e
							});
							if (chunk.default) {
								window.Hls = chunk.default();
								resolve(true);
								return;
							}
						}
					}
				});
			resolve(false);
		};
		scr.onerror = () => resolve(false);
		doc.head.append(scr);
	});
	return hlsReady;
}

function estimateSize(url, tip, duration, onDone) {
	tip.textContent = 'loading...';

	const hls = new window.Hls();
	const audio = doc.createElement('audio');
	let frag = null;
	let frags = 0;
	let totalDuration = 0;
	let mediaErrors = 0;
	let isAac = false;

	function cleanup(err) {
		if (err) tip.textContent = 'size error';
		try { hls.stopLoad(); hls.destroy(); } catch(e) {}
	}

	hls.on(window.Hls.Events.MANIFEST_PARSED, (e, data) => {
		const details = data.levels[0].details;
		frags = details.fragments.length;
		totalDuration = details.totalduration;
	});

	hls.on(window.Hls.Events.BUFFER_CODECS, (e, data) => {
		isAac = data.audio && data.audio.container === 'audio/mp4';
	});

	hls.on(window.Hls.Events.BUFFER_APPENDING, (e, data) => {
		frag = data.data;
	});

	hls.on(window.Hls.Events.FRAG_BUFFERED, (e, data) => {
		if (frag) {
			const bytes = frag.length;
			const fragDur = data.frag.duration;
			const estimatedBytes = (bytes / fragDur) * totalDuration;
			setSizeText(tip, estimatedBytes, duration);
			cleanup();
			onDone();
		}
	});

	hls.on(window.Hls.Events.ERROR, (e, data) => {
		if (data.details === 'bufferFullError' || data.details === 'fragLoadError') {
			cleanup(data);
			return;
		}
		if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && mediaErrors < 2) {
			mediaErrors++;
			if (mediaErrors > 1) hls.swapAudioCodec();
			hls.recoverMediaError();
			return;
		}
		cleanup(data);
	});

	hls.loadSource(url);
	hls.attachMedia(audio);
}

function init() {
	const body = doc.body;

	const style = doc.createElement('style');
	style.textContent = `
		.vkDlBtn { display:inline-flex !important; align-items:center !important; justify-content:center !important; width:28px !important; height:28px !important; border-radius:50% !important; cursor:pointer !important; transition:all .15s ease !important; flex-shrink:0 !important; position:relative !important; }
		.vkDlBtn:hover { background:rgba(0,123,255,.12) !important; }
		.vkDlBtn .dl-icon { width:18px; height:18px; color:rgba(0,0,0,.45) !important; transition:color .15s ease !important; }
		.vkDlBtn:hover .dl-icon { color:#007bff !important; }
		.vkDlBtn .dl-tip { display:none !important; position:fixed !important; padding:4px 10px !important; background:#1a1a2e !important; color:#e0e0e0 !important; font:600 11px/1.4 system-ui,sans-serif !important; border-radius:20px !important; white-space:nowrap !important; pointer-events:none !important; z-index:99999 !important; box-shadow:0 2px 8px rgba(0,0,0,.25) !important; }
		.vkDlBtn .dl-tip::after { content:'' !important; position:absolute !important; bottom:100% !important; left:50% !important; transform:translateX(-50%) !important; border:4px solid transparent !important; border-bottom-color:#1a1a2e !important; }
		.vkDlBtn:hover .dl-tip { display:block !important; }
	`;
	body.append(style);

	const uidMatch = doc.head.textContent.match(/\bid:\s?(\d+)/);
	if (uidMatch) userId = +uidMatch[1];

	scanNodes(body);
	new MutationObserver(mutations => {
		for (const m of mutations) {
			if (m.type === 'childList') {
				for (const node of m.addedNodes) {
					if (node.nodeType === 1) scanNodes(node);
				}
			}
		}
	}).observe(body, { childList: true, subtree: true });
}

function scanNodes(el) {
	if (el.dataset.testid === 'audiorow-actions') {
		let row = el;
		while (row && !/^(AudioLayer_PlaybackQueue_)?(MusicTrack|PodcastEpisodes?)(Cell|Row|Item)$/.test(row.dataset.testid))
			row = row.parentElement;
		if (!row) return;
		if (injectButton(row)) {
			row.addEventListener('mouseenter', () => {
				if (row.DLBtn && row.DLBtn.parentElement !== el.firstElementChild)
					el.firstElementChild?.append(row.DLBtn);
			});
		}
		return;
	}
	el.querySelectorAll('[data-testid=audiorow-actions]').forEach(scanNodes);
}

function injectButton(row) {
	if (row.DLBtn || row.querySelector('[aria-disabled=true]')) return false;

	const info = extractInfo(row);
	const cacheKey = info.ids.split('_', 2).join('_');
	if (injectButton[cacheKey]) { row.DLBtn = injectButton[cacheKey]; return false; }

	const btn = doc.createElement('a');
	btn.className = 'vkDlBtn';
	btn.title = '';

	const tip = doc.createElement('span');
	tip.className = 'dl-tip';
	tip.textContent = 'load...';

	btn.innerHTML = `<svg class="dl-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>`;
	btn.append(tip);

	btn.addEventListener('mouseenter', () => {
		const rect = btn.getBoundingClientRect();
		tip.style.left = (rect.left + rect.width / 2) + 'px';
		tip.style.top = (rect.top - 6) + 'px';
		tip.style.transform = 'translate(-50%, -100%)';
		if (tip.textContent === 'load...' || tip.textContent === 'loading...') {
			resolveUrl(info, result => {
				if (!result) { tip.textContent = 'unavailable'; return; }
				btn.download = info.name;
				btn.url = result.url;
				if (result.size) {
					setSizeText(tip, result.size, info.duration);
				} else if (info.duration) {
			tip.textContent = 'resolving...';
			ensureHls().then(ok => {
				if (ok && window.Hls && window.Hls.isSupported()) {
					estimateSize(result.url, tip, info.duration, () => {});
				} else {
					tip.textContent = 'ready';
				}
			});
				} else {
					tip.textContent = 'ready';
				}
			});
		}
	});

	btn.addEventListener('click', e => {
		e.preventDefault();
		e.stopPropagation();
		if (btn.url) {
			window.open(btn.url, '_blank');
		} else {
			tip.textContent = 'resolving...';
			const rect = btn.getBoundingClientRect();
			tip.style.left = (rect.left + rect.width / 2) + 'px';
			tip.style.top = (rect.top - 6) + 'px';
			tip.style.transform = 'translate(-50%, -100%)';
			resolveUrl(info, result => {
				if (!result) { tip.textContent = 'unavailable'; return; }
				btn.download = info.name;
				btn.url = result.url;
				window.open(result.url, '_blank');
			});
		}
	});

	row.DLBtn = injectButton[cacheKey] = btn;
	return true;
}

function setSizeText(el, bytes, duration) {
	const kb = 1024;
	const tier = Math.floor(Math.log(bytes) / Math.log(kb));
	const bitrate = duration ? Math.min(320, Math.round(bytes / 4096 / duration) * 32) : 0;
	const sizeStr = (bytes / Math.pow(kb, tier)).toFixed(2) + [' B', ' KB', ' MB', ' GB'][tier];
	el.textContent = bitrate + 'kbs - ' + sizeStr;
}

function extractInfo(el) {
	if (el.dataset.audio) {
		const a = JSON.parse(el.dataset.audio);
		let ids = a[1] + '_' + a[0];
		if (a[13]) {
			const segs = a[13].split('/');
			ids += '_' + segs[segs[1].length === 0 ? 2 : 3] + '_' + segs[5];
		} else if (a[24]) {
			ids += '_' + a[24];
		}
		return {
			name: sanitizeName(a[4] + ' - ' + a[3] + (a[16] ? ' (' + a[16] + ')' : '')),
			duration: a[5],
			ids
		};
	}

	const audio = walkFiber(el);
	return {
		name: sanitizeName(audio.artist + ' - ' + audio.title + (audio.subtitle ? ' (' + audio.subtitle + ')' : '')),
		duration: audio.duration,
		ids: audio.owner_id + '_' + audio.id + '_' + audio.access_key,
		url: audio.url
	};
}

function walkFiber(el, up = false) {
	const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
	if (!key) return up && el.parentElement ? walkFiber(el.parentElement, true) : {};

	let fiber = el[key], depth = 0;
	while (fiber && depth++ < 15) {
		const p = fiber.memoizedProps;
		if (p && typeof p === 'object') {
			const hit = p.track?.entity?.apiAudio || p.episode?.entity?.apiAudio
				|| (p.audio?.id && p.audio?.url ? p.audio : null)
				|| p.audio?.entity?.apiAudio || p.originalAttachment
				|| p.track?.data?.apiAudio || p.episode?.data?.apiAudio;
			if (hit) return hit;
		}
		fiber = fiber.return;
	}
	return (!up && el.parentElement) ? walkFiber(el.parentElement, true) : {};
}

function resolveUrl(info, callback) {
	if (info.url) {
		callback({ url: decodeUrl(info.url) });
		return;
	}
	const ids = info.ids;
	const prefix = ids.split('_').length < 4 ? 's&audio_' : '&';
	xhrPost('/music', 'al=1&act=reload_audio' + prefix + 'ids=' + ids, resp => {
		try {
			const json = JSON.parse(resp.responseText);
			const track = json?.payload?.[1]?.[0]?.[0];
			if (track && typeof track !== 'string') {
				callback({ url: decodeUrl(track[2]) });
				return;
			}
		} catch (e) {}
		callback(null);
	});
}

function xhrPost(url, body, handler) {
	const xhr = new XMLHttpRequest();
	xhr.open('post', url, true);
	xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	xhr.onreadystatechange = () => { if (xhr.readyState === 4) handler(xhr); };
	xhr.send(body);
}

function sanitizeName(raw) {
	raw = raw.replace(/&#([0-9]{2,5});/g, (_, num) => String.fromCharCode(+num));
	const el = doc.createElement('div');
	el.innerHTML = raw;
	return el.textContent.replace(/[\/:*?"<>|~]/g, '').replace(/[_\s]+/g, ' ').trim() + '.mp3';
}

doc.readyState === 'loading'
	? doc.addEventListener('DOMContentLoaded', init)
	: init();

})(document);
