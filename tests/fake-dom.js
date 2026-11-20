// A small stand-in for the browser DOM, so that a test can run js/page.js in Node and
// read what the page shows. Not a test file itself (node --test reads only *.test.js).
// It does only what js/page.js uses. A value that is not a node becomes a text node,
// as in a browser: append(null) shows the text "null", so a test sees that fault too.

class FakeNode {
    constructor() { this.parentNode = null; }
    get nextSibling() {
        const p = this.parentNode;
        if (!p) return null;
        const i = p.childNodes.indexOf(this);
        return p.childNodes[i + 1] || null;
    }
    remove() {
        const p = this.parentNode;
        if (!p) return;
        p.childNodes.splice(p.childNodes.indexOf(this), 1);
        this.parentNode = null;
    }
    after(...nodes) {
        const p = this.parentNode;
        const at = p.childNodes.indexOf(this) + 1;
        const list = nodes.map(toNode);
        for (const n of list) { if (n.parentNode) n.remove(); n.parentNode = p; }
        p.childNodes.splice(at, 0, ...list);
    }
}

class FakeText extends FakeNode {
    constructor(text) { super(); this.data = String(text); }
    get textContent() { return this.data; }
}

const toNode = (x) => (x instanceof FakeNode ? x : new FakeText(String(x)));

class FakeClassList {
    constructor(el) { this.el = el; }
    get list() { return String(this.el.className || '').split(/\s+/).filter((x) => x); }
    add(c) { if (!this.contains(c)) this.el.className = [...this.list, c].join(' '); }
    remove(c) { this.el.className = this.list.filter((x) => x !== c).join(' '); }
    contains(c) { return this.list.includes(c); }
}

export class FakeElement extends FakeNode {
    constructor(tag) {
        super();
        this.tagName = String(tag).toUpperCase();
        this.childNodes = [];
        this.attributes = {};
        this.listeners = {};
        this.dataset = {};
        this.style = {};
        this.className = '';
        this.classList = new FakeClassList(this);
        this.hidden = false;
        this.disabled = false;
        this.value = '';
        this.id = '';
        if (this.tagName === 'TABLE') this.tBodies = [new FakeElement('tbody')];
    }
    get children() { return this.childNodes.filter((n) => n instanceof FakeElement); }
    get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
    set textContent(v) { this.childNodes = []; if (v !== '' && v !== null && v !== undefined) this.append(String(v)); }
    append(...xs) {
        for (const x of xs) {
            if (x instanceof FakeFragment) { for (const c of [...x.childNodes]) this.append(c); continue; }
            const n = toNode(x);
            if (n.parentNode) n.remove();
            n.parentNode = this;
            this.childNodes.push(n);
        }
    }
    replaceChildren(...xs) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...xs); }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
    removeAttribute(k) { delete this.attributes[k]; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    dispatch(type, extra = {}) {
        const e = { type, target: this, preventDefault() {}, stopPropagation() {}, ...extra };
        for (const fn of this.listeners[type] || []) fn(e);
    }
    click() { this.dispatch('click'); }
    // Every element below this one (depth first), this one not included.
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    // Elements with a class, below this one.
    byClass(c) { return this.all().filter((e) => e.classList.contains(c)); }
    byTag(t) { return this.all().filter((e) => e.tagName === t.toUpperCase()); }
}

class FakeFragment extends FakeElement { constructor() { super('#fragment'); } }

// Make the globals that js/page.js reads. headers: the column names of the results table.
export function installFakeDom(headers) {
    const byId = new Map();
    const document = {
        documentElement: new FakeElement('html'),
        body: new FakeElement('body'),
        location: { href: 'https://contoso.example.com/' },
        getElementById(id) {
            if (!byId.has(id)) { const e = new FakeElement(id === 'table' ? 'table' : 'div'); e.id = id; byId.set(id, e); }
            return byId.get(id);
        },
        createElement: (tag) => new FakeElement(tag),
        createTextNode: (t) => new FakeText(t),
        createDocumentFragment: () => new FakeFragment(),
        createRange: () => ({ selectNodeContents() {} }),
        querySelectorAll(selector) {
            if (selector === '#table thead th') return headers.map((h) => { const th = new FakeElement('th'); th.append(h); return th; });
            return [];
        },
    };
    const window = {};
    window.top = window;
    window.self = window;
    Object.assign(globalThis, {
        document, window, Node: FakeNode,
        getSelection: () => ({ toString: () => '', removeAllRanges() {}, addRange() {} }),
    });
    return document;
}
