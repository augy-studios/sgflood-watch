'use strict';

import { initGuestKey, signedFetch } from '/lib/uwu-request-signing.js';

const APP_ID = 'sg-flood-watch';

// ── State
const State = {
    userLat: null,
    userLng: null,
    locationLabel: null,
    alerts: [],
    expiredAlerts: [],
    lastFetchedAt: null,
    fetchFailed: false,
    nearbyOnly: true,
    searchLat: null,
    searchLng: null,
    searchLabel: null,
    refreshTimer: null,
    countdownInterval: null,
    theme: localStorage.getItem('sgfw_theme') || 'classic',
};

// ── Map
let map = null;
let userMarker = null;
let alertCircles = [];

// ── Severity helpers
const SEVERITY_ORDER = {
    Extreme: 4,
    Severe: 3,
    Moderate: 2,
    Minor: 1
};
const SEVERITY_COLOUR = {
    Extreme: '#ff3b30',
    Severe: '#ff9500',
    Moderate: '#ffcc00',
    Minor: '#34c759',
};
const SEVERITY_CLASS = {
    Extreme: 'extreme',
    Severe: 'severe',
    Moderate: 'moderate',
    Minor: 'minor'
};

function severityColour(s) {
    return SEVERITY_COLOUR[s] || '#34c759';
}

function severityClass(s) {
    return SEVERITY_CLASS[s] || 'minor';
}

// ── Haversine distance (km)
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371,
        rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad,
        dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Parse "lat,lng radius" from circle string
function parseCircle(circleStr) {
    if (!circleStr) return null;
    const parts = circleStr.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const [latStr, lngStr] = parts[0].split(',');
    return {
        lat: parseFloat(latStr),
        lng: parseFloat(lngStr),
        radius: parseFloat(parts[1])
    };
}

// ── Time helpers
function timeAgo(isoStr) {
    const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    return `${Math.floor(diff/3600)}h ago`;
}

function countdown(isoStr) {
    const diff = Math.floor((new Date(isoStr) - Date.now()) / 1000);
    if (diff <= 0) return {
        text: 'Expired',
        urgent: true
    };
    const h = Math.floor(diff / 3600),
        m = Math.floor((diff % 3600) / 60),
        s = diff % 60;
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return {
        text: `Expires in ${parts.join(' ')}`,
        urgent: diff < 600
    };
}

// ── Toast
const TOAST_ICONS = {
    error: 'fa-circle-exclamation',
    cancel: 'fa-triangle-exclamation',
    success: 'fa-circle-check',
};

function showToast(msg, type = '', duration = 4000) {
    const tc = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const iconClass = TOAST_ICONS[type];
    if (iconClass) {
        const icon = document.createElement('i');
        icon.className = `fas ${iconClass}`;
        el.appendChild(icon);
        el.appendChild(document.createTextNode(' ' + msg));
    } else {
        el.textContent = msg;
    }
    tc.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        el.style.transition = '0.3s ease';
        setTimeout(() => el.remove(), 300);
    }, duration);
}

// ── Theme
function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    State.theme = theme;
    localStorage.setItem('sgfw_theme', theme);
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

// ── Init Map
function initMap() {
    if (map) return;
    map = L.map('map', {
        zoomControl: true,
        attributionControl: true
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    // Centre on Singapore
    map.setView([1.3521, 103.8198], 12);
}

// ── Update Map
function updateMap() {
    if (!map) return;

    // Clear old circles
    alertCircles.forEach(c => map.removeLayer(c));
    alertCircles = [];

    const activeAlerts = State.alerts.filter(a => a.msgType !== 'Cancel');

    activeAlerts.forEach(alert => {
        const c = parseCircle(alert.circle);
        if (!c) return;
        const colour = severityColour(alert.severity);
        const circle = L.circle([c.lat, c.lng], {
            radius: c.radius * 1000, // km → m
            color: colour,
            fillColor: colour,
            fillOpacity: 0.18,
            weight: 2,
            opacity: 0.7,
        }).addTo(map);

        circle.bindPopup(`
      <div style="font-family:'Noto Sans',sans-serif;min-width:160px">
        <strong style="font-family:'Jua',sans-serif">${alert.headline || 'Flood Alert'}</strong><br/>
        <span style="font-size:0.8em;color:#555">${alert.areaDesc || ''}</span><br/>
        <span style="background:${colour};color:#fff;font-size:0.72em;padding:2px 8px;border-radius:20px;display:inline-block;margin-top:4px">${alert.severity || 'Unknown'}</span><br/>
        <p style="margin-top:6px;font-size:0.82em;color:#333">${alert.description || ''}</p>
        <em style="font-size:0.75em;color:#888"><i class="fas fa-triangle-exclamation"></i> Circle = broadcast radius only</em>
      </div>
    `);
        alertCircles.push(circle);
    });

    // User location marker
    const refLat = State.searchLat || State.userLat;
    const refLng = State.searchLng || State.userLng;

    if (userMarker) {
        map.removeLayer(userMarker);
        userMarker = null;
    }
    if (refLat && refLng) {
        const icon = L.divIcon({
            className: '',
            html: `<div class="user-location-marker"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        userMarker = L.marker([refLat, refLng], {
            icon
        }).addTo(map);
        userMarker.bindPopup(`<div style="font-family:'Jua',sans-serif">${State.searchLabel || State.locationLabel || 'Your Location'}</div>`);

        if (activeAlerts.length > 0) {
            // Fit to show user + all circles
            const latlngs = [L.latLng(refLat, refLng)];
            alertCircles.forEach(c => {
                const b = c.getBounds();
                latlngs.push(b.getNorthEast(), b.getSouthWest());
            });
            if (latlngs.length > 1) map.fitBounds(L.latLngBounds(latlngs), {
                padding: [30, 30]
            });
            else map.setView([refLat, refLng], 13);
        } else {
            map.setView([refLat, refLng], 13);
        }
    } else if (activeAlerts.length > 0 && alertCircles.length > 0) {
        const bounds = alertCircles.reduce((b, c) => b.extend(c.getBounds()), alertCircles[0].getBounds());
        map.fitBounds(bounds, {
            padding: [30, 30]
        });
    } else {
        map.setView([1.3521, 103.8198], 12);
    }
}

// ── Alert Cards
function renderAlerts() {
    const refLat = State.searchLat !== null ? State.searchLat : State.userLat;
    const refLng = State.searchLng !== null ? State.searchLng : State.userLng;

    let visible = State.alerts;
    if (State.nearbyOnly && refLat !== null) {
        visible = State.alerts.filter(a => {
            const c = parseCircle(a.circle);
            if (!c) return false;
            return haversine(refLat, refLng, c.lat, c.lng) <= (c.radius + 5);
        });
    }

    // Sort by severity desc
    visible.sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0));

    const activeVisible = visible.filter(a => a.msgType !== 'Cancel');
    const cancelledVisible = visible.filter(a => a.msgType === 'Cancel');

    const list = document.getElementById('alerts-list');
    list.innerHTML = '';
    const allClear = document.getElementById('all-clear-banner');
    const heading = document.getElementById('alerts-heading');
    const badge = document.getElementById('alert-count');

    heading.textContent = State.nearbyOnly ? 'Alerts Near Me' : 'Active Alerts';
    badge.textContent = activeVisible.length;

    if (activeVisible.length === 0 && cancelledVisible.length === 0) {
        allClear.classList.remove('hidden');
    } else {
        allClear.classList.add('hidden');
    }

    [...activeVisible, ...cancelledVisible].forEach(alert => renderCard(alert, list, refLat, refLng));

    // Expired
    const expSection = document.getElementById('expired-section');
    const expList = document.getElementById('expired-list');
    expList.innerHTML = '';
    if (State.expiredAlerts.length > 0) {
        expSection.classList.remove('hidden');
        State.expiredAlerts.slice(0, 5).forEach(a => renderCard(a, expList, refLat, refLng, true));
    } else {
        expSection.classList.add('hidden');
    }
}

function renderCard(alert, container, refLat, refLng, expired = false) {
    const sc = severityClass(alert.severity || 'Minor');
    const c = parseCircle(alert.circle);
    let distText = '';
    if (refLat !== null && c) {
        const dist = haversine(refLat, refLng, c.lat, c.lng);
        distText = dist < 1 ? `~${Math.round(dist*1000)}m away` : `~${dist.toFixed(1)}km away`;
    }

    const isNearby = refLat !== null && c && haversine(refLat, refLng, c.lat, c.lng) <= (c.radius + 1);
    const isCancel = alert.msgType === 'Cancel';

    const card = document.createElement('div');
    card.className = `alert-card ${sc} ${isCancel ? 'cancelled' : ''} ${expired ? 'expired' : ''}`;

    const cdInfo = alert.expires ? countdown(alert.expires) : {
        text: '',
        urgent: false
    };

    card.innerHTML = `
    <div class="alert-card-top">
      <div class="alert-headline">${alert.headline || 'Flood Alert'}</div>
      <div class="alert-badges">
        ${isCancel ? `<span class="msgtype-badge cancel">Cancelled</span>` : ''}
        ${expired ? `<span class="urgency-badge">Resolved</span>` : ''}
        <span class="severity-badge ${sc}">${alert.severity || 'Unknown'}</span>
        ${alert.urgency && !isCancel ? `<span class="urgency-badge">${alert.urgency}</span>` : ''}
        ${isNearby && !expired ? `<span class="nearby-tag"><i class="fas fa-location-dot"></i> Near You</span>` : ''}
      </div>
    </div>
    ${alert.areaDesc ? `<div class="alert-area"><i class="fas fa-map-pin"></i> ${alert.areaDesc}</div>` : ''}
    ${alert.description ? `<div class="alert-desc">${alert.description}</div>` : ''}
    ${alert.instruction && !isCancel ? `<div class="alert-instruction"><i class="fas fa-lightbulb"></i> ${alert.instruction}</div>` : ''}
    <div class="alert-footer">
      <div>
        ${cdInfo.text ? `<div class="alert-countdown ${cdInfo.urgent ? 'urgent' : ''}" data-expires="${alert.expires || ''}">${cdInfo.text}</div>` : ''}
        ${distText ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px"><i class="fas fa-ruler"></i> ${distText}</div>` : ''}
      </div>
      ${c ? `<button class="alert-map-btn" data-lat="${c.lat}" data-lng="${c.lng}"><i class="fas fa-map"></i> Show on Map</button>` : ''}
    </div>
  `;

    card.querySelector('.alert-map-btn')?.addEventListener('click', (e) => {
        const lat = parseFloat(e.target.dataset.lat);
        const lng = parseFloat(e.target.dataset.lng);
        map.flyTo([lat, lng], 15, {
            duration: 1.2
        });
        document.getElementById('map').scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    });

    container.appendChild(card);
}

// ── Countdown ticks
function tickCountdowns() {
    document.querySelectorAll('.alert-countdown[data-expires]').forEach(el => {
        const expires = el.dataset.expires;
        if (!expires) return;
        const {
            text,
            urgent
        } = countdown(expires);
        el.textContent = text;
        el.classList.toggle('urgent', urgent);
    });

    const lrEl = document.getElementById('last-refreshed');
    if (State.lastFetchedAt) {
        lrEl.textContent = `Last refreshed: ${timeAgo(State.lastFetchedAt)}`;
    }
}

// ── Danger overlay
function checkDanger() {
    if (State.userLat === null) return;
    const activeAlerts = State.alerts.filter(a => a.msgType !== 'Cancel');
    const dangerous = activeAlerts.find(a => {
        const c = parseCircle(a.circle);
        if (!c) return false;
        return haversine(State.userLat, State.userLng, c.lat, c.lng) <= c.radius;
    });

    const overlay = document.getElementById('danger-overlay');
    if (dangerous) {
        document.getElementById('danger-headline').textContent = dangerous.headline || 'Flood Alert Near You';
        document.getElementById('danger-desc').textContent = dangerous.description || '';
        document.getElementById('danger-instruction').textContent = dangerous.instruction || '';
        document.getElementById('danger-severity').textContent = dangerous.severity || '';
        document.getElementById('danger-severity').className = `severity-badge ${severityClass(dangerous.severity)}`;
        document.getElementById('danger-urgency').textContent = dangerous.urgency || '';
        document.getElementById('danger-urgency').className = 'urgency-badge';
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// ── Fetch alerts
const CACHE_KEY = 'sgfw_last_alerts';
const LOCATION_KEY = 'sgfw_location';
const SUBSCRIPTIONS_KEY = 'sgfw_subscriptions';

async function fetchAlerts() {
    const si = document.getElementById('status-indicator');
    const st = document.getElementById('status-text');
    si.className = 'status-indicator loading';
    st.textContent = 'Refreshing…';

    try {
        const res = await signedFetch('/api/flood-alerts');
        const data = await res.json();

        if (!data.ok) throw new Error(data.error || 'Unknown error');

        const prev = State.alerts.map(a => a.alertId);
        State.alerts = data.alerts.filter(a => !isPastExpiry(a));
        State.lastFetchedAt = data.fetchedAt;
        State.fetchFailed = false;

        // Detect new cancellations
        const cancelledNow = State.alerts.filter(a => a.msgType === 'Cancel');
        cancelledNow.forEach(a => {
            if (!prev.includes(a.alertId)) {
                showToast(`Alert Cancelled: ${a.headline || a.areaDesc || 'Flood alert cancelled'}`, 'cancel');
            }
        });

        // Detect new alerts
        State.alerts.filter(a => a.msgType !== 'Cancel').forEach(a => {
            if (!prev.includes(a.alertId)) {
                showToast(`New Alert: ${a.headline || a.areaDesc || 'Flood alert issued'}`, 'error', 6000);
            }
        });

        // Cache
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            fetchedAt: data.fetchedAt,
            alerts: data.alerts
        }));

        si.className = 'status-indicator ok';
        st.textContent = 'Live';
        document.getElementById('fetch-error').classList.add('hidden');
    } catch (err) {
        console.error('Fetch error:', err);
        State.fetchFailed = true;

        // Try cache
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const {
                    fetchedAt,
                    alerts
                } = JSON.parse(cached);
                State.alerts = alerts.filter(a => !isPastExpiry(a));
                State.lastFetchedAt = fetchedAt;
            } catch (_) {}
        }

        si.className = 'status-indicator error';
        st.textContent = 'Offline';
        document.getElementById('fetch-error').classList.remove('hidden');
    }

    renderAlerts();
    updateMap();
    checkDanger();
}

function isPastExpiry(alert) {
    if (!alert.expires) return false;
    const expiry = new Date(alert.expires);
    const expired = expiry < new Date();
    if (expired) {
        if (!State.expiredAlerts.find(a => a.alertId === alert.alertId)) {
            State.expiredAlerts.unshift(alert);
            if (State.expiredAlerts.length > 10) State.expiredAlerts.pop();
        }
    }
    return expired;
}

// ── Geocode search (Nominatim)
async function geocodeSearch(query) {
    const sg = 'Singapore';
    const q = query.toLowerCase().includes('singapore') ? query : `${query}, ${sg}`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=sg`;
    const res = await fetch(url, {
        headers: {
            'Accept-Language': 'en'
        }
    });
    const data = await res.json();
    if (!data.length) return null;
    return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        label: data[0].display_name.split(',')[0]
    };
}

// ── Geolocation
async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const data = await res.json();
        return data.address?.suburb || data.address?.neighbourhood || data.address?.road || 'Your Location';
    } catch {
        return 'Your Location';
    }
}

function requestLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            }),
            err => reject(err), {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 60000
            }
        );
    });
}

// ── Notification
const VAPID_PUBLIC_KEY = 'BBGuOcxgFek9smCXtYZ4JW4tFW0_MpqQheE1nlZxZKul0lh4zyhAgCRidLFqwafErYQ0AO99kriThhp8bLTV_pI';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function enableNotifications() {
    const statusEl = document.getElementById('notif-status-text');

    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        statusEl.innerHTML = '<i class="fas fa-circle-xmark"></i> Push notifications are not supported in this browser.';
        return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
        statusEl.innerHTML = '<i class="fas fa-circle-xmark"></i> Permission denied. Please enable in browser settings.';
        return;
    }

    try {
        statusEl.innerHTML = '<i class="fas fa-hourglass-half fa-spin"></i> Registering…';
        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        const label = State.locationLabel || 'My Location';
        await signedFetch('/api/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subscription,
                lat: State.userLat,
                lng: State.userLng,
                label
            })
        });

        saveSubscription(subscription.endpoint, label, State.userLat, State.userLng);
        updateNotifModalStatus();
        renderSubscriptionsList();
        statusEl.innerHTML = '<i class="fas fa-circle-check"></i> Notifications enabled! You\'ll be alerted when a flood warning is issued near you.';
        showToast('Push notifications enabled!', 'success');
    } catch (err) {
        console.error('Push subscription error:', err);
        const errMsg = document.createTextNode(` Failed to enable notifications: ${err.message}`);
        statusEl.innerHTML = '<i class="fas fa-circle-xmark"></i>';
        statusEl.appendChild(errMsg);
    }
}

// ── Location persistence
function saveLocation(lat, lng, label) {
    localStorage.setItem(LOCATION_KEY, JSON.stringify({ lat, lng, label }));
}

function loadSavedLocation() {
    try {
        const saved = localStorage.getItem(LOCATION_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch { return null; }
}

// ── Subscription persistence (local tracking)
function getSavedSubscriptions() {
    try {
        const saved = localStorage.getItem(SUBSCRIPTIONS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
}

function saveSubscription(endpoint, label, lat, lng) {
    const subs = getSavedSubscriptions();
    const idx = subs.findIndex(s => s.endpoint === endpoint);
    const entry = { endpoint, label, lat, lng };
    if (idx >= 0) subs[idx] = entry;
    else subs.push(entry);
    localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
}

function removeSubscription(endpoint) {
    const subs = getSavedSubscriptions().filter(s => s.endpoint !== endpoint);
    localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subs));
}

function renderSubscriptionsList() {
    const subs = getSavedSubscriptions();
    const section = document.getElementById('notif-subscriptions-section');
    const list = document.getElementById('notif-subscriptions-list');

    if (subs.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    list.innerHTML = '';
    subs.forEach(sub => {
        const item = document.createElement('div');
        item.className = 'notif-subscription-item';
        item.innerHTML = `
            <div class="notif-sub-info">
                <i class="fas fa-location-dot"></i>
                <span>${sub.label || 'My Location'}</span>
            </div>
            <button class="btn-turn-off" data-endpoint="${sub.endpoint}">
                <i class="fas fa-bell-slash"></i> Turn Off
            </button>
        `;
        item.querySelector('button').addEventListener('click', () => {
            disableNotificationForLocation(sub.endpoint, sub.label);
        });
        list.appendChild(item);
    });
}

async function disableNotificationForLocation(endpoint, label) {
    try {
        await signedFetch('/api/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint })
        });
        removeSubscription(endpoint);
        renderSubscriptionsList();
        updateNotifModalStatus();
        showToast(`Notifications disabled for ${label || 'this location'}`, 'success');
    } catch (err) {
        showToast('Failed to turn off notifications', 'error');
    }
}

function updateNotifModalStatus() {
    const statusEl = document.getElementById('notif-status-text');
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        statusEl.innerHTML = '<i class="fas fa-circle-xmark"></i> Push notifications are not supported in this browser.';
        return;
    }
    if (Notification.permission === 'denied') {
        statusEl.innerHTML = '<i class="fas fa-circle-xmark"></i> Permission denied. Please enable notifications in your browser settings.';
    } else if (Notification.permission === 'granted' && getSavedSubscriptions().length > 0) {
        statusEl.innerHTML = '<i class="fas fa-circle-check"></i> Notifications are active. You can add more locations below.';
    } else {
        statusEl.innerHTML = '';
    }
}

// ── Auto-locate when geolocation permission already granted (no saved location)
async function tryAutoLocate() {
    if (!navigator.permissions) return;
    let permState;
    try {
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        permState = perm.state;
    } catch { return; }
    if (permState !== 'granted') return;

    State.locationLabel = 'Locating…';
    launchApp();
    try {
        const pos = await requestLocation();
        State.userLat = pos.lat;
        State.userLng = pos.lng;
        State.locationLabel = await reverseGeocode(pos.lat, pos.lng);
        saveLocation(State.userLat, State.userLng, State.locationLabel);
        document.getElementById('location-label').textContent = State.locationLabel;
        renderAlerts();
        updateMap();
        checkDanger();
    } catch {
        showToast('Could not get your location. Please allow access.', 'error');
    }
}

// ── Boot
async function boot() {
    // No login system on this site - every visitor is anonymous, so a guest
    // signing key is required before any signedFetch() call can run.
    try {
        await initGuestKey(APP_ID);
    } catch (err) {
        console.error('Failed to obtain guest signing key:', err);
    }

    applyTheme(State.theme);
    initMap();

    // Bind theme picker
    document.getElementById('theme-btn').addEventListener('click', () => {
        document.getElementById('theme-modal').classList.remove('hidden');
    });
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
        });
    });

    // Bind notification
    document.getElementById('notif-btn').addEventListener('click', () => {
        document.getElementById('notif-modal').classList.remove('hidden');
        updateNotifModalStatus();
        renderSubscriptionsList();
    });
    document.getElementById('enable-notif-btn').addEventListener('click', enableNotifications);

    // Bind modal closes
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById(btn.dataset.close).classList.add('hidden');
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });

    // Danger dismiss
    document.getElementById('danger-dismiss').addEventListener('click', () => {
        document.getElementById('danger-overlay').classList.add('hidden');
    });

    // Refresh btn
    document.getElementById('refresh-btn').addEventListener('click', fetchAlerts);

    // Nearby toggle
    document.getElementById('nearby-toggle').addEventListener('click', (e) => {
        State.nearbyOnly = !State.nearbyOnly;
        e.target.classList.toggle('active', State.nearbyOnly);
        renderAlerts();
        updateMap();
    });

    // Search
    document.getElementById('search-btn').addEventListener('click', handleSearch);
    document.getElementById('search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSearch();
    });

    // Location grant
    document.getElementById('grant-location-btn').addEventListener('click', async () => {
        const btn = document.getElementById('grant-location-btn');
        btn.innerHTML = '<i class="fas fa-hourglass-half fa-spin"></i> Getting location…';
        btn.disabled = true;
        try {
            const pos = await requestLocation();
            State.userLat = pos.lat;
            State.userLng = pos.lng;
            State.locationLabel = await reverseGeocode(pos.lat, pos.lng);
            saveLocation(State.userLat, State.userLng, State.locationLabel);
            launchApp();
        } catch (err) {
            btn.innerHTML = '<i class="fas fa-location-dot"></i> Allow Location Access';
            btn.disabled = false;
            showToast('Could not get your location. Please allow location access.', 'error');
        }
    });

    // Refresh saved location
    document.getElementById('refresh-location-btn').addEventListener('click', async () => {
        const btn = document.getElementById('refresh-location-btn');
        btn.innerHTML = '<i class="fas fa-hourglass-half fa-spin"></i>';
        btn.disabled = true;
        try {
            const pos = await requestLocation();
            State.userLat = pos.lat;
            State.userLng = pos.lng;
            State.locationLabel = await reverseGeocode(pos.lat, pos.lng);
            saveLocation(State.userLat, State.userLng, State.locationLabel);
            document.getElementById('location-label').textContent = State.locationLabel;
            State.searchLat = null;
            State.searchLng = null;
            State.searchLabel = null;
            document.getElementById('location-icon').className = 'fas fa-location-dot';
            renderAlerts();
            updateMap();
            showToast('Location updated', 'success');
        } catch (err) {
            showToast('Could not update location.', 'error');
        } finally {
            btn.innerHTML = '<i class="fas fa-rotate-right"></i>';
            btn.disabled = false;
        }
    });

    // Restore saved location if available
    const saved = loadSavedLocation();
    if (saved) {
        State.userLat = saved.lat;
        State.userLng = saved.lng;
        State.locationLabel = saved.label;
        launchApp();
        // Silently refresh location in background so coordinates stay current
        requestLocation().then(async pos => {
            const label = await reverseGeocode(pos.lat, pos.lng);
            State.userLat = pos.lat;
            State.userLng = pos.lng;
            State.locationLabel = label;
            saveLocation(pos.lat, pos.lng, label);
            document.getElementById('location-label').textContent = label;
            renderAlerts();
            updateMap();
        }).catch(() => {});
    } else {
        tryAutoLocate();
    }
}

async function launchApp() {
    document.getElementById('location-label').textContent = State.locationLabel;
    document.getElementById('location-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    map.invalidateSize();

    await fetchAlerts();

    if (!State.refreshTimer) {
        State.refreshTimer = setInterval(fetchAlerts, 3 * 60 * 1000);
    }
    if (!State.countdownInterval) {
        State.countdownInterval = setInterval(tickCountdowns, 1000);
    }
}

async function handleSearch() {
    const q = document.getElementById('search-input').value.trim();
    if (!q) {
        // Reset to user location
        State.searchLat = null;
        State.searchLng = null;
        State.searchLabel = null;
        document.getElementById('location-icon').className = 'fas fa-location-dot';
        document.getElementById('location-label').textContent = State.locationLabel || 'Your Location';
        renderAlerts();
        updateMap();
        return;
    }

    showToast('Searching…');
    const result = await geocodeSearch(q);
    if (!result) {
        showToast(`No results found for "${q}"`, 'error');
        return;
    }

    State.searchLat = result.lat;
    State.searchLng = result.lng;
    State.searchLabel = result.label;
    document.getElementById('location-icon').className = 'fas fa-magnifying-glass';
    document.getElementById('location-label').textContent = result.label;

    renderAlerts();
    updateMap();
    showToast(`Showing alerts near ${result.label}`, 'success');
}

// ── Start
document.addEventListener('DOMContentLoaded', boot);