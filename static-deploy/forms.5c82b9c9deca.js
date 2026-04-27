window.staticDeployForms = {"endpoint":"","provider":"webhook","method":"POST","contentType":"application\/json","headers":{},"honeypotField":"_hp_field"};
/*!
 * Static Deploy — forms shim.
 *
 * Intercepts submission of any form patched with `data-stdp-patched="..."` and POSTs the
 * envelope `{form_id, form_slug, fields, meta}` to the configured endpoint. Per-provider
 * defaults come from the page-injected `window.staticDeployForms` object emitted by the
 * Forms companion at build time.
 *
 * No callback to the WP origin. Anti-feature regression test FORM-023 verifies this.
 */
(function () {
	'use strict';

	var cfg = window.staticDeployForms || {};
	var endpoint = cfg.endpoint || '';
	var provider = cfg.provider || 'webhook';
	var contentType = cfg.contentType || 'application/json';
	var method = (cfg.method || 'POST').toUpperCase();
	var headers = cfg.headers || {};
	var honeypotField = cfg.honeypotField || '_hp_field';

	if (!endpoint) {
		return;
	}

	function findFormSlug(form) {
		// Prefer `data-stdp-slug`, fall back to id, fall back to form name attribute.
		return form.getAttribute('data-stdp-slug') || form.id || form.getAttribute('name') || '';
	}

	function findFormId(form) {
		return form.getAttribute('data-stdp-form-id') || form.id || '';
	}

	function fieldsFromForm(form) {
		var data = {};
		var elements = form.querySelectorAll('input, textarea, select');
		for (var i = 0; i < elements.length; i++) {
			var el = elements[i];
			if (!el.name || el.disabled) continue;
			if (el.type === 'submit' || el.type === 'button' || el.type === 'image' || el.type === 'reset') continue;
			if (el.type === 'file') continue; // FORM-025: file uploads not supported in v1.
			if (el.type === 'checkbox' || el.type === 'radio') {
				if (!el.checked) continue;
			}
			data[el.name] = el.value;
		}
		return data;
	}

	function shouldReject(fields) {
		// Honeypot — non-empty value means a bot.
		return (fields[honeypotField] != null && fields[honeypotField] !== '');
	}

	function envelope(form) {
		var fields = fieldsFromForm(form);
		return {
			form_id: findFormId(form),
			form_slug: findFormSlug(form),
			fields: fields,
			meta: {
				submitted_at: new Date().toISOString(),
				source_url: window.location.href,
				honeypot_field: honeypotField,
				form_provider: form.getAttribute('data-stdp-patched') || provider
			}
		};
	}

	function intercept(event) {
		var form = event.target;
		if (!form || !form.matches || !form.matches('form[data-stdp-patched]')) {
			return;
		}
		event.preventDefault();
		var data = envelope(form);
		if (shouldReject(data.fields)) {
			form.dispatchEvent(new CustomEvent('stdp:form:rejected', { bubbles: true, detail: { reason: 'honeypot' } }));
			return;
		}
		fetch(endpoint, {
			method: method,
			headers: Object.assign({ 'Content-Type': contentType }, headers),
			body: contentType.indexOf('application/json') === 0 ? JSON.stringify(data) : JSON.stringify(data),
			credentials: 'omit'
		})
			.then(function (resp) {
				if (resp.ok) {
					form.dispatchEvent(new CustomEvent('stdp:form:success', { bubbles: true, detail: { status: resp.status } }));
					if (form.reset) form.reset();
				} else {
					form.dispatchEvent(new CustomEvent('stdp:form:error', { bubbles: true, detail: { status: resp.status } }));
				}
			})
			.catch(function (err) {
				form.dispatchEvent(new CustomEvent('stdp:form:error', { bubbles: true, detail: { error: String(err) } }));
			});
	}

	document.addEventListener('submit', intercept, true);
})();
