'use strict';
((doc, userId) => {
if (window.__vkAudioSaverInit) return;
window.__vkAudioSaverInit = 1;

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
		.vkVidBtn { display:inline-flex !important; align-items:center !important; gap:6px !important; margin:0 0 0 8px !important; padding:6px 12px !important; border-radius:8px !important; cursor:pointer !important; background:#0077ff !important; color:#fff !important; font:600 13px/1.2 system-ui,sans-serif !important; position:relative !important; z-index:2147483646 !important; user-select:none !important; vertical-align:middle !important; white-space:nowrap !important; }
		.vkVidBtn:hover { background:#0066dd !important; }
		.vkVidMenu { display:none !important; position:fixed !important; min-width:200px !important; max-height:280px !important; overflow:auto !important; padding:6px !important; background:#1a1a2e !important; border:1px solid rgba(255,255,255,.12) !important; border-radius:10px !important; box-shadow:0 12px 40px rgba(0,0,0,.55) !important; z-index:2147483647 !important; }
		.vkVidMenu.open { display:block !important; }
		.vkVidMenu .vk-vid-item { display:flex !important; justify-content:space-between !important; gap:12px !important; padding:8px 10px !important; border-radius:8px !important; color:#e8e8f0 !important; font:500 12px/1.2 system-ui,sans-serif !important; cursor:pointer !important; white-space:nowrap !important; }
		.vkVidMenu .vk-vid-item:hover { background:rgba(0,119,255,.25) !important; color:#fff !important; }
		.vkVidMenu .vk-vid-item span { color:#9aa3b2 !important; }
	`;
	body.append(style);

	const uidMatch = doc.head.textContent.match(/\bid:\s?(\d+)/);
	if (uidMatch) userId = +uidMatch[1];

	scanNodes(body);
	ensureVideoUi();
	let lastHref = location.href;
	setInterval(() => {
		if (location.href !== lastHref) {
			lastHref = location.href;
			ensureVideoUi();
		} else if (extractVideoId(null)) {
			ensureVideoUi();
		}
	}, 1000);
	new MutationObserver(mutations => {
		for (const m of mutations) {
			if (m.type === 'childList') {
				for (const node of m.addedNodes) {
					if (node.nodeType === 1) scanNodes(node);
				}
			}
		}
		ensureVideoUi();
	}).observe(body, { childList: true, subtree: true });
}

function scanNodes(el) {
	if (el.dataset && el.dataset.testid === 'audiorow-actions') {
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
	if (el.querySelectorAll) {
		el.querySelectorAll('[data-testid=audiorow-actions]').forEach(scanNodes);
	}
	ensureVideoUi();
}

function extractVideoIdFromString(str) {
	if (!str) return null;
	let m = String(str).match(/video(-?\d+_\d+)/i);
	if (m) return m[1];
	m = String(str).match(/(?:^|[?&#=/\-])(-?\d+_\d+)(?:$|[?&#/])/);
	return m ? m[1] : null;
}

function extractVideoId(el) {
	const fromUrl = extractVideoIdFromString(location.href) || extractVideoIdFromString(location.hash) || extractVideoIdFromString(location.search);
	if (fromUrl) return fromUrl;
	if (!el) return null;
	const idAttr = el.id || '';
	let m = idAttr.match(/video_box_wrap(-?\d+_\d+)/);
	if (m) return m[1];
	const dataVideo = el.getAttribute?.('data-video') || el.dataset?.video || '';
	if (/^-?\d+_\d+$/.test(dataVideo)) return dataVideo;
	const href = el.href || el.querySelector?.('a[href*="video"]')?.href || '';
	m = extractVideoIdFromString(href);
	if (m) return m;
	return null;
}

function extractListId() {
	try {
		const u = new URL(location.href);
		return u.searchParams.get('list') || u.searchParams.get('playlist') || '';
	} catch (e) { return ''; }
}

function findSubscribeButton() {
	const re = /^(subscribe|подписаться|подписка|вы подписаны|following|unfollow)$/i;
	const nodes = Array.from(doc.querySelectorAll('button, a, [role="button"]'));
	for (const n of nodes) {
		const t = (n.textContent || n.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim();
		if (!re.test(t) && !/subscribe|подписаться|подписка/i.test(t)) continue;
		if (t.length > 32) continue;
		if (n.closest?.('.vkVidBtn')) continue;
		if (!n.offsetParent && !n.getClientRects().length) continue;
		return n;
	}
	return null;
}

function placeNextToSubscribe(btn) {
	const sub = findSubscribeButton();
	if (!sub || !sub.parentElement) return false;
	if (sub.nextSibling === btn) return true;
	if (btn.parentElement) btn.parentElement.removeChild(btn);
	if (sub.nextSibling) sub.parentElement.insertBefore(btn, sub.nextSibling);
	else sub.parentElement.append(btn);
	return true;
}

function findVideoMount() {
	const sub = findSubscribeButton();
	if (sub?.parentElement) return sub.parentElement;

	const preferred = [
		'.mv_info_wide_column',
		'#mv_info_wide_column',
		'[class*="mv_info_wide_column"]',
		'#mv_info',
		'.mv_info',
		'#mv_main_info .like_btns',
		'#mv_actions',
		'.mv_actions',
		'.like_btns'
	];
	for (const sel of preferred) {
		const hit = doc.querySelector(sel);
		if (hit) return hit;
	}
	return null;
}

function ensureVideoUi() {
	const videoId = extractVideoId(null);
	if (!videoId) {
		doc.querySelectorAll('.vkVidBtn, .vkVidMenu').forEach(n => n.remove());
		return;
	}
	const existing = doc.querySelector(`.vkVidBtn[data-vid="${videoId}"]`);
	if (existing) {
		if (!placeNextToSubscribe(existing)) {
			const mount = findVideoMount();
			if (mount && !mount.contains(existing)) mount.append(existing);
		}
		return;
	}
	doc.querySelectorAll('.vkVidBtn, .vkVidMenu').forEach(n => n.remove());
	injectVideoButton(videoId);
}

function scanVideoNode() {
	ensureVideoUi();
}

function injectVideoButton(videoId) {
	if (doc.querySelector(`.vkVidBtn[data-vid="${videoId}"]`)) return;
	if (doc.querySelector('.video_yt_player, iframe[src*="youtube"], iframe[src*="youtu.be"]')) return;

	const mount = findVideoMount();
	if (!mount) return;

	const btn = doc.createElement('div');
	btn.className = 'vkVidBtn';
	btn.dataset.vid = videoId;
	btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span class="vk-vid-label">Download</span>`;
	const menu = doc.createElement('div');
	menu.className = 'vkVidMenu';
	menu.dataset.vid = videoId;
	doc.body.append(menu);
	const label = btn.querySelector('.vk-vid-label');
	let loaded = false;
	let loading = false;
	let cache = null;

	const positionMenu = () => {
		const r = btn.getBoundingClientRect();
		const mw = Math.max(200, menu.offsetWidth || 200);
		const mh = Math.min(280, menu.scrollHeight || 200);
		let left = r.left;
		let top = r.bottom + 8;
		if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
		if (left < 8) left = 8;
		if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 8);
		menu.style.left = left + 'px';
		menu.style.top = top + 'px';
	};

	const closeMenu = () => {
		menu.classList.remove('open');
		btn.classList.remove('open');
	};

	const openMenu = () => {
		menu.classList.add('open');
		btn.classList.add('open');
		positionMenu();
	};

	btn.addEventListener('click', e => {
		e.preventDefault();
		e.stopPropagation();
		if (btn.classList.contains('open')) {
			closeMenu();
			return;
		}
		if (loaded && cache) {
			openMenu();
			return;
		}
		if (loading) return;
		loading = true;
		label.textContent = 'Loading...';
		resolveVideo(videoId, extractListId(), info => {
			loading = false;
			if (!info || !info.downloads?.length) {
				label.textContent = 'Unavailable';
				return;
			}
			cache = info;
			label.textContent = 'Download';
			menu.innerHTML = '';
			info.downloads
				.sort((a, b) => (+b.quality || 0) - (+a.quality || 0))
				.forEach(item => {
					const row = doc.createElement('div');
					row.className = 'vk-vid-item';
					const qLabel = /^\d+$/.test(item.quality) ? (item.quality + 'p') : String(item.quality).toUpperCase();
					row.innerHTML = `<b>${qLabel}</b><span>${item.format || 'mp4'}</span>`;
					row.addEventListener('click', ev => {
						ev.preventDefault();
						ev.stopPropagation();
						const q = /^\d+$/.test(item.quality) ? ('_' + item.quality + 'p') : '';
						const base = ((cache && cache.title) || pageVideoTitle() || ('video_' + videoId)) + q;
						startDownload(item.url, sanitizeName(base, '.mp4'));
						closeMenu();
						label.textContent = 'Saved';
						setTimeout(() => { label.textContent = 'Download'; }, 1200);
					});
					menu.append(row);
				});
			loaded = true;
			openMenu();
		});
	});

	doc.addEventListener('click', e => {
		if (!btn.contains(e.target) && !menu.contains(e.target)) closeMenu();
	}, true);
	window.addEventListener('scroll', () => { if (btn.classList.contains('open')) positionMenu(); }, true);
	window.addEventListener('resize', () => { if (btn.classList.contains('open')) positionMenu(); });

	if (!placeNextToSubscribe(btn)) {
		const likeRow = mount.querySelector?.('.like_btns, #mv_actions, .mv_actions, [class*="actions"]');
		if (likeRow) likeRow.append(btn);
		else mount.prepend(btn);
	}
}

function resolveVideo(videoId, listId, callback) {
	const tries = [
		{ url: '/al_video.php?act=show', body: 'act=show&al=1&autoplay=1&module=videolayer&video=' + encodeURIComponent(videoId) + (listId ? '&list=' + encodeURIComponent(listId) : '') },
		{ url: '/al_video.php?act=show', body: 'act=show&al=1&autoplay=1&module=groups&video=' + encodeURIComponent(videoId) + (listId ? '&list=' + encodeURIComponent(listId) : '') }
	];

	const tryOne = i => {
		if (i >= tries.length) return callback(null);
		const t = tries[i];
		xhrPost(t.url, t.body, resp => {
			try {
				const text = resp.responseText || '';
				const json = JSON.parse(text);
				const downloads = parseVideoPayload(json, videoId);
				if (downloads) return callback(downloads);
			} catch (e) {}
			tryOne(i + 1);
		});
	};
	tryOne(0);
}

function parseVideoPayload(json, videoId) {
	const arr = json?.payload?.[1];
	if (!Array.isArray(arr) || !arr.length) return null;

	// walk payload for player.params[0] or any object with url### keys
	const stack = arr.slice();
	let params = null;
	let meta = null;
	while (stack.length) {
		const cur = stack.pop();
		if (!cur || typeof cur !== 'object') continue;
		if (cur.player?.params?.[0]) {
			params = cur.player.params[0];
			meta = cur.mvData || meta;
			break;
		}
		if (!params) {
			const keys = Object.keys(cur);
			if (keys.some(k => /^url\d+$/.test(k))) {
				params = cur;
			}
		}
		if (Array.isArray(cur)) stack.push(...cur);
		else Object.values(cur).forEach(v => {
			if (v && typeof v === 'object') stack.push(v);
		});
	}
	if (!params) return null;

	const downloads = [];
	Object.keys(params).forEach(key => {
		const m = key.match(/^url(\d+)$/);
		if (m && typeof params[key] === 'string' && /^https?:\/\//.test(params[key])) {
			downloads.push({ quality: m[1], format: 'mp4', url: params[key] });
		}
	});
	// also support HLS manifests as last resort labels
	['hls', 'hls_ondemand', 'live_mp4'].forEach(k => {
		if (typeof params[k] === 'string' && /^https?:\/\//.test(params[k]) && !downloads.length) {
			downloads.push({ quality: k === 'hls' ? 'hls' : k, format: 'm3u8', url: params[k] });
		}
	});
	if (!downloads.length) return null;
	const pageTitle = (doc.querySelector('h1, h2, [class*="VideoTitle"], [class*="video_title"], [class*="mv_title"]')?.textContent || '')
		.replace(/\s+/g, ' ')
		.trim();
	const title = meta?.title || params.md_title || params.title || pageTitle || ('video_' + videoId);
	return {
		id: meta?.videoRaw || videoId,
		title,
		downloads
	};
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
			startDownload(btn.url, info.name || btn.download || 'audio.mp3');
			tip.textContent = 'saved';
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
				startDownload(result.url, info.name || 'audio.mp3');
				tip.textContent = 'saved';
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

function pageVideoTitle() {
	const el = doc.querySelector('h1, h2, [class*="VideoTitle"], [class*="video_title"], [class*="mv_title"]');
	const t = (el?.textContent || '').replace(/\s+/g, ' ').trim();
	return t.length > 2 ? t : '';
}

function sanitizeName(raw, ext = '.mp3') {
	raw = String(raw || 'vk-media').replace(/&#([0-9]{2,5});/g, (_, num) => String.fromCharCode(+num));
	const el = doc.createElement('div');
	el.innerHTML = raw;
	let base = el.textContent.replace(/[\/:*?"<>|~]+/g, '').replace(/[_\s]+/g, ' ').trim() || 'vk-media';
	// avoid pure numeric CDN-style names
	if (/^\d+(\(\d+\))?$/.test(base)) base = 'vk_video_' + base;
	return base + (ext.startsWith('.') ? ext : '.' + ext);
}

let lastDlKey = '';
let lastDlAt = 0;
function startDownload(url, filename) {
	if (!url) return;
	const key = url + '|' + (filename || '');
	const now = Date.now();
	if (key === lastDlKey && now - lastDlAt < 2500) return;
	lastDlKey = key;
	lastDlAt = now;
	window.postMessage({
		source: 'vk-audio-saver',
		type: 'download',
		url,
		filename: filename || 'vk-media',
		id: now + '_' + Math.random().toString(36).slice(2, 8)
	}, '*');
}

doc.readyState === 'loading'
	? doc.addEventListener('DOMContentLoaded', init)
	: init();

})(document);
