# Embedding ontoink in your own page

Since **0.7.2**, ontoink is not only an MkDocs plugin — you can embed its full
interactive runtime in **any** HTML page: a portal, a dashboard, an internal
tool, or a hand-written static page. And it runs under a strict
[Content-Security-Policy](https://developer.mozilla.org/docs/Web/HTTP/CSP)
(`script-src 'self'`): **no CDN, no inline event handlers, no `eval`**.

!!! tip "What you get"
    The embedded graph is the *same* runtime the MkDocs fences use — layout
    switching, IRI dereferencing, LOD levels, facets, namespace grouping, style
    presets (Ontoink / Chowlk / Graffoo / VOWL), in-graph SPARQL, and PNG / SVG /
    TTL export.

## 1. Build the self-contained bundle

From a source checkout:

```bash
python scripts/build_embed_bundle.py
```

This writes two files to `dist/`:

| File | Contents |
| --- | --- |
| `ontoink.embed.js` | Cytoscape + dagre + cytoscape-dagre + cytoscape-svg + CodeMirror (+ turtle mode) + the ontoink runtime — one file |
| `ontoink.embed.css` | CodeMirror + ontoink styles |

Both are fully self-contained: once loaded, ontoink makes **no external
requests**. Copy them into your site's static assets.

## 2. Mount a graph

```html
<link rel="stylesheet" href="/static/ontoink.embed.css">
<script src="/static/ontoink.embed.js"></script>

<div id="my-graph" style="height:500px"></div>
<script src="/static/my-mount.js"></script>   <!-- external file → CSP-safe -->
```

```js title="my-mount.js"
ontoink.embed("my-graph", {
  ttl: `@prefix ex: <http://example.org/> .
        ex:Alice a ex:Person ; ex:knows ex:Bob .
        ex:Bob   a ex:Person .`,
  shape: "",          // optional SHACL Turtle → constraint overlay
  layout: "cose",     // dagre | cose | circle | concentric | breadthfirst | grid
  height: "500px",
  editor: false,      // hide the Edit & Validate panel
});
```

### `ontoink.embed(elOrId, opts)`

| Option | Default | Description |
| --- | --- | --- |
| `ttl` (or `source`) | — | The Turtle to visualise (parsed client-side). |
| `shape` (or `shacl`) | — | Optional SHACL Turtle; renders the constraint overlay. |
| `layout` | `dagre` | Initial layout algorithm. |
| `height` | `500px` | Canvas height. |
| `editor` | `true` | Show the **Edit & Validate** panel. |
| `reasoning` | `true` | Show the **Reasoning** button. |

Returns the container's `id`. You can also pass an element instead of an id.

## Content-Security-Policy

ontoink wires its toolbar **and** every dynamically-created panel/popup via
`data-oi-on*` attributes plus a tiny eval-free interpreter, so an embedding host
needs neither `'unsafe-inline'` nor `'unsafe-eval'`:

```
Content-Security-Policy: default-src 'self'; script-src 'self';
                         style-src 'self' 'unsafe-inline'
```

!!! warning "Keep your mount code external"
    Put your `ontoink.embed(...)` call in an external `.js` file (as above), not
    an inline `<script>` — otherwise *your own* script violates `script-src
    'self'`. ontoink's code is already compliant.

## Passing server-produced TTL

When the Turtle is generated on the server, base64-encode it into a `data-`
attribute and decode it in your external mount script. This keeps the page
CSP-clean and avoids HTML-escaping problems:

```html
<div class="ontoink-embed"
     data-ontoink-ttl="{{ ttl_b64 }}"
     data-ontoink-shape="{{ shape_b64 }}"
     data-layout="cose"></div>
```

```js
document.querySelectorAll(".ontoink-embed").forEach(function (el) {
  var dec = function (s) { return s ? decodeURIComponent(escape(atob(s))) : ""; };
  ontoink.embed(el, {
    ttl: dec(el.getAttribute("data-ontoink-ttl")),
    shape: dec(el.getAttribute("data-ontoink-shape")) || undefined,
    layout: el.getAttribute("data-layout") || "cose",
  });
});
```

This is exactly how the NFDI-MatWerk curation portal renders an ontoink
neighbourhood graph on every entity page (built from live SPARQL) and its SHACL
validation shapes — all under a strict `script-src 'self'` policy.

## Notes & limits

- **OWL reasoning** in the embed uses the browser WASM backend, which needs the
  page to be [cross-origin isolated](https://web.dev/coop-coep/) (COOP/COEP). If
  it isn't, point ontoink at a running [API server](index.md) (`/reason`) or omit
  reasoning.
- **Live SHACL validation** in the editor loads a same-origin ESM module
  (`assets/shacl/shacl.mjs`); vendor it alongside the bundle if you need the
  in-browser **Validate** button. The build-time SHACL *overlay* (from the
  `shape` option) needs nothing extra.
