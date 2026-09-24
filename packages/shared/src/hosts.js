/**
 * Host handling: turning what a person typed, or what a request carried, into a hostname
 * this platform can reason about — and deciding whose it is.
 *
 * Pure and dependency-free on purpose. The API resolves hosts, and the edge that terminates
 * the request has to reach the same verdict about the same string; one implementation, no I/O,
 * is how they stay in agreement.
 *
 * Two entry points, because the two inputs deserve different trust:
 *
 *   normalizeHostname  — a hostname someone *typed* to claim. Strict: anything that is not
 *                        already a bare hostname is refused with a reason, never repaired.
 *                        Stripping a scheme or path would mean guessing what they meant.
 *   hostFromHeader     — the value of a `Host` header. Real clients send an upper-case name,
 *                        a port, or a trailing dot, so those are tolerated (and only those).
 *
 * Whose a host is comes from `classifyHost`, which is the single place the two namespaces are
 * kept apart: every `{slug}.<root>` belongs to StoreKit and can only ever be a store's slug,
 * and a custom hostname may never sit under the root. That disjointness is what lets the two
 * kinds of address share one resolver without a shared lock.
 */

export const HOSTNAME_MAX_LENGTH = 253;
export const LABEL_MAX_LENGTH = 63;

const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const reject = (reason, message) => ({ ok: false, reason, message });

const looksLikeIpv4 = (value) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);

/**
 * Validates and canonicalises a hostname someone typed. Only trimming and lower-casing are
 * applied; everything else that is wrong is a rejection with a reason a form can show.
 *
 * `reason` is stable and meant for code; `message` is meant for people.
 */
export const normalizeHostname = (input) => {
  if (typeof input !== 'string') return reject('not_text', 'Enter a domain name');

  const value = input.trim();
  if (value.length === 0) return reject('empty', 'Enter a domain name');
  if (/\s/.test(value)) return reject('whitespace', 'A domain name cannot contain spaces');

  // Order matters: the first thing wrong is the most useful thing to say. A pasted URL is
  // a scheme problem before it is a path problem.
  if (SCHEME.test(value) || value.startsWith('//')) {
    return reject('has_protocol', 'Enter the domain only, without http:// or https://');
  }
  if (value.includes('@')) return reject('has_userinfo', 'Enter the domain only, without a username');
  if (/[/\\]/.test(value)) return reject('has_path', 'Enter the domain only, without a path such as /shop');
  if (value.includes('?')) return reject('has_query', 'Enter the domain only, without a query string');
  if (value.includes('#')) return reject('has_fragment', 'Enter the domain only, without a # fragment');

  // IPv6 literals ("[::1]", "::1") and anything with two colons cannot be a hostname.
  if (value.startsWith('[') || (value.match(/:/g) ?? []).length > 1) {
    return reject('ip_address', 'An IP address cannot be used as a store domain');
  }
  if (value.includes(':')) return reject('has_port', 'Enter the domain only, without a port number');

  if (value.includes('*')) return reject('wildcard', 'Wildcard domains are not supported');
  // Not a canonicalisation we can do without a punycode table, and not one to guess at.
  if (/[^\x00-\x7f]/.test(value)) {
    return reject('not_ascii', 'Use the ASCII (xn--) form of an international domain name');
  }

  const hostname = value.toLowerCase();

  if (hostname.endsWith('.')) return reject('trailing_dot', 'Remove the dot at the end of the domain');
  if (hostname.length > HOSTNAME_MAX_LENGTH) return reject('too_long', 'That domain name is too long');
  if (looksLikeIpv4(hostname)) return reject('ip_address', 'An IP address cannot be used as a store domain');

  const labels = hostname.split('.');
  if (labels.length < 2) return reject('single_label', 'Enter a full domain such as shop.example.com');

  for (const label of labels) {
    if (label.length === 0) return reject('invalid_label', 'A domain cannot contain an empty part (two dots in a row)');
    if (label.length > LABEL_MAX_LENGTH) return reject('invalid_label', 'Each part of a domain must be 63 characters or fewer');
    if (!LABEL.test(label)) {
      return reject('invalid_label', 'Use letters, numbers and hyphens only, and do not start or end a part with a hyphen');
    }
    // RFC 5891: a "--" in the third and fourth places is reserved for xn-- (international) labels.
    if (label[2] === '-' && label[3] === '-' && !label.startsWith('xn--')) {
      return reject('invalid_label', 'A part of a domain cannot have two hyphens in the third and fourth places');
    }
  }

  if (!TLD.test(labels[labels.length - 1])) {
    return reject('invalid_tld', 'The end of the domain (such as .com or .in) is not valid');
  }

  return { ok: true, hostname };
};

/**
 * Reads the hostname out of a `Host` (or `X-Forwarded-Host`) header value.
 *
 * Returns `{ hostname, port }` or null. Tolerates what real clients send — mixed case, a
 * `:port`, a single trailing dot — and nothing else; a value that would not survive
 * `normalizeHostname` afterwards is not a host we would ever have registered.
 */
export const hostFromHeader = (value) => {
  if (typeof value !== 'string') return null;
  // A header can carry a list when proxies append; the first entry is the client-facing one.
  const first = value.split(',')[0].trim();
  if (first.length === 0 || first.length > HOSTNAME_MAX_LENGTH + 6) return null;

  const match = /^(.*?)(?::(\d{1,5}))?$/.exec(first);
  if (!match) return null;

  const name = match[1].replace(/\.$/, '');
  const port = match[2] ? Number(match[2]) : null;
  if (port !== null && port > 65535) return null;

  const normalized = normalizeHostname(name);
  return normalized.ok ? { hostname: normalized.hostname, port } : null;
};

/** `{scheme, domain, port}` of the storefront root, e.g. `https://storekit.site` or `http://lvh.me:3000`. */
export const parseStorefrontRoot = (cfg) => {
  const match = /^(https?):\/\/([^/?#\s:]+)(?::(\d{1,5}))?/i.exec(String(cfg?.storefrontBaseUrl ?? ''));
  if (!match) throw new TypeError('storefrontBaseUrl must be an http(s) URL such as https://storekit.site');
  return { scheme: match[1].toLowerCase(), domain: match[2].toLowerCase(), port: match[3] ? Number(match[3]) : null };
};

/** True when `hostname` is the root itself or anything beneath it. */
export const isUnderRoot = (cfg, hostname) => {
  const { domain } = parseStorefrontRoot(cfg);
  return hostname === domain || hostname.endsWith(`.${domain}`);
};

/**
 * Whose is this host?
 *
 *   { kind: 'platform', hostname }        the root itself — marketing site, not a store
 *   { kind: 'storekit', hostname, slug }  exactly one label beneath the root
 *   { kind: 'custom',   hostname }        anywhere else — a claimed custom domain
 *   { kind: 'invalid' }                   not a usable host, or a place we never serve
 *
 * The last case includes `a.b.<root>`: it is inside StoreKit's namespace but is not a store
 * address, so it must not be mistaken for a custom domain (custom hostnames can never live
 * under the root) and must not be looked up as one.
 *
 * If the root carries a port (local development), the request must carry that same port;
 * in production the root has none and the request's port is not part of the identity.
 */
export const classifyHost = (cfg, hostHeader) => {
  const host = hostFromHeader(hostHeader);
  if (!host) return { kind: 'invalid' };

  const root = parseStorefrontRoot(cfg);
  if (root.port !== null && host.port !== root.port) {
    // A custom domain never carries the dev root's port either; nothing else is servable here.
    return { kind: 'invalid' };
  }

  const { hostname } = host;

  if (hostname === root.domain) return { kind: 'platform', hostname };

  if (hostname.endsWith(`.${root.domain}`)) {
    const slug = hostname.slice(0, -(root.domain.length + 1));
    if (slug.includes('.')) return { kind: 'invalid' };
    return { kind: 'storekit', hostname, slug };
  }

  return { kind: 'custom', hostname };
};

/* ───────────── Ownership challenge ───────────── */

/**
 * Where the owner publishes proof of control. It is a *separate name* from the domain
 * itself because a CNAME (which the domain needs, to route traffic) cannot coexist with
 * other records at the same name.
 */
export const CHALLENGE_LABEL = '_storekit-challenge';
export const challengeRecordName = (hostname) => `${CHALLENGE_LABEL}.${hostname}`;
export const challengeRecordValue = (token) => `storekit-verify=${token}`;
