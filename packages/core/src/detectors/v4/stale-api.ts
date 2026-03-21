/**
 * StaleAPIDetector — V4 detector for deprecated APIs and packages.
 *
 * AI models are trained on historical data and frequently generate code using
 * APIs that have since been deprecated. This detector catches them through:
 * 1. Dynamic registry deprecation checks (npm deprecated field, etc.)
 * 2. Well-known per-language deprecated API patterns
 *
 * V4 improvements over V3:
 * - Registry-based deprecation checks instead of hardcoded data
 * - Operates on CodeUnit IR (calls + imports)
 * - Per-language deprecation pattern database
 * - Confidence scoring based on deprecation source
 *
 * @since 0.4.0
 */

import type { CodeUnit, SupportedLanguage } from '../../ir/types.js';
import type { V4Detector, DetectorResult, DetectorCategory, DetectorContext } from './types.js';

// ─── Deprecated Pattern Definition ────────────────────────────────

/** Definition of a deprecated API pattern for detection. */
export interface DeprecatedPattern {
  /** Pattern to match in call expressions (callee string) */
  pattern: string | RegExp;
  /** What replaces it */
  replacement: string;
  /** Since when deprecated */
  since?: string;
  /** Confidence level */
  confidence: number;
  /** Human-readable description */
  description?: string;
}

// ─── Well-known deprecation patterns per language ──────────────────

const TYPESCRIPT_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bnew\s+Buffer\b/,
    replacement: 'Buffer.from() / Buffer.alloc()',
    since: 'Node.js 6',
    confidence: 0.95,
    description: 'Buffer constructor is deprecated due to security and usability issues',
  },
  {
    pattern: /\burl\.parse\b/,
    replacement: 'new URL()',
    since: 'Node.js 11',
    confidence: 0.85,
    description: 'url.parse() is deprecated in favor of the WHATWG URL API',
  },
  {
    pattern: /\bfs\.exists\b/,
    replacement: 'fs.existsSync() or fs.access()',
    since: 'Node.js 1.0',
    confidence: 0.9,
    description: 'fs.exists() is deprecated; use fs.existsSync() or fs.access()',
  },
  {
    pattern: /\brequire\s*\(\s*['"]querystring['"]\s*\)/,
    replacement: 'URLSearchParams',
    since: 'Node.js 12',
    confidence: 0.8,
    description: 'querystring module is deprecated in favor of URLSearchParams',
  },
  {
    pattern: /\brequire\s*\(\s*['"]domain['"]\s*\)/,
    replacement: 'async_hooks or structured error handling',
    since: 'Node.js 4',
    confidence: 0.9,
    description: 'domain module is deprecated and pending removal',
  },
  {
    pattern: /\brequire\s*\(\s*['"]punycode['"]\s*\)/,
    replacement: 'Use a userland alternative or URL API',
    since: 'Node.js 7',
    confidence: 0.8,
    description: 'punycode module is deprecated',
  },
  {
    pattern: /\bSlowBuffer\b/,
    replacement: 'Buffer.allocUnsafeSlow()',
    since: 'Node.js 6',
    confidence: 0.9,
    description: 'SlowBuffer is deprecated in favor of Buffer.allocUnsafeSlow()',
  },
];

// ── React deprecated lifecycle methods & APIs ──────────────────────

const REACT_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bcomponentWillMount\b/,
    replacement: 'componentDidMount or useEffect',
    since: 'React 16.3',
    confidence: 0.95,
    description: 'componentWillMount is unsafe for async rendering. Use componentDidMount or useEffect instead.',
  },
  {
    pattern: /\bcomponentWillReceiveProps\b/,
    replacement: 'getDerivedStateFromProps or componentDidUpdate',
    since: 'React 16.3',
    confidence: 0.95,
    description: 'componentWillReceiveProps is unsafe for async rendering. Use static getDerivedStateFromProps or componentDidUpdate.',
  },
  {
    pattern: /\bcomponentWillUpdate\b/,
    replacement: 'getSnapshotBeforeUpdate or componentDidUpdate',
    since: 'React 16.3',
    confidence: 0.95,
    description: 'componentWillUpdate is unsafe for async rendering. Use getSnapshotBeforeUpdate or componentDidUpdate.',
  },
  {
    pattern: /\bgetDefaultProps\b/,
    replacement: 'static defaultProps class property',
    since: 'React 16.3',
    confidence: 0.9,
    description: 'getDefaultProps is deprecated. Use static defaultProps as a class property.',
  },
  {
    pattern: /\bReact\.createFactory\b/,
    replacement: 'React.createElement or JSX',
    since: 'React 16',
    confidence: 0.9,
    description: 'React.createFactory is deprecated. Use React.createElement or JSX directly.',
  },
  {
    pattern: /\bReact\.DOM\b/,
    replacement: 'react-dom package',
    since: 'React 15.5',
    confidence: 0.9,
    description: 'React.DOM is removed. Import from react-dom instead.',
  },
  {
    pattern: /\bfindDOMNode\b/,
    replacement: 'React refs (useRef / React.createRef)',
    since: 'React 18',
    confidence: 0.95,
    description: 'findDOMNode is deprecated and removed in strict mode. Use React refs instead.',
  },
  {
    pattern: /\bString\s+refs\s*\(this\.refs\)/,
    replacement: 'React.createRef() or useRef()',
    since: 'React 16.3',
    confidence: 0.85,
    description: 'String refs are deprecated. Use React.createRef() or useRef() callback refs.',
  },
  {
    pattern: /\bthis\.isMounted\b/,
    replacement: 'componentDidMount + cleanup in componentWillUnmount',
    since: 'React 16',
    confidence: 0.95,
    description: 'isMounted is deprecated as an anti-pattern. Restructure to use proper lifecycle cleanup.',
  },
  {
    pattern: /\bUNSAFE_componentWillMount\b/,
    replacement: 'componentDidMount or useEffect',
    since: 'React 16.3',
    confidence: 0.9,
    description: 'UNSAFE_componentWillMount still exists but is a migration path only. Move to useEffect.',
  },
  {
    pattern: /\bUNSAFE_componentWillReceiveProps\b/,
    replacement: 'getDerivedStateFromProps or componentDidUpdate',
    since: 'React 16.3',
    confidence: 0.9,
    description: 'UNSAFE_componentWillReceiveProps is a migration path only. Move to getDerivedStateFromProps.',
  },
  {
    pattern: /\bUNSAFE_componentWillUpdate\b/,
    replacement: 'getSnapshotBeforeUpdate or componentDidUpdate',
    since: 'React 16.3',
    confidence: 0.9,
    description: 'UNSAFE_componentWillUpdate is a migration path only. Move to getSnapshotBeforeUpdate.',
  },
  {
    pattern: /\bReact\.PureComponent\s*\(\s*\{\s*\}/,
    replacement: 'React.memo() for functional components',
    since: 'React 16.6+',
    confidence: 0.7,
    description: 'Consider using React.memo() for functional components instead of PureComponent class.',
  },
  {
    pattern: /\blegacyRenderSubtreeIntoContainer\b/,
    replacement: 'createRoot().render()',
    since: 'React 18',
    confidence: 0.95,
    description: 'ReactDOM.render is replaced by createRoot().render() in React 18.',
  },
  {
    pattern: /\bReactDOM\.render\b/,
    replacement: 'createRoot().render()',
    since: 'React 18',
    confidence: 0.95,
    description: 'ReactDOM.render is deprecated in React 18. Use createRoot from react-dom/client.',
  },
  {
    pattern: /\bReactDOM\.hydrate\b/,
    replacement: 'hydrateRoot()',
    since: 'React 18',
    confidence: 0.95,
    description: 'ReactDOM.hydrate is deprecated in React 18. Use hydrateRoot from react-dom/client.',
  },
  {
    pattern: /\bReactDOM\.unmountComponentAtNode\b/,
    replacement: 'root.unmount()',
    since: 'React 18',
    confidence: 0.95,
    description: 'unmountComponentAtNode is deprecated in React 18. Use root.unmount() instead.',
  },
];

// ── Vue deprecated APIs ────────────────────────────────────────────

const VUE_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bVue\.set\b/,
    replacement: 'Direct assignment (reactiveProxy.prop = value)',
    since: 'Vue 3',
    confidence: 0.95,
    description: 'Vue.set is not needed in Vue 3 — the reactivity system handles it natively.',
  },
  {
    pattern: /\bVue\.delete\b/,
    replacement: 'delete reactiveProxy.prop',
    since: 'Vue 3',
    confidence: 0.95,
    description: 'Vue.delete is not needed in Vue 3 — use the native delete operator.',
  },
  {
    pattern: /\bthis\.\$set\b/,
    replacement: 'Direct assignment',
    since: 'Vue 3',
    confidence: 0.95,
    description: 'this.$set is removed in Vue 3. Reactivity handles reassignment natively.',
  },
  {
    pattern: /\bthis\.\$delete\b/,
    replacement: 'delete this.prop',
    since: 'Vue 3',
    confidence: 0.95,
    description: 'this.$delete is removed in Vue 3. Use native delete.',
  },
  {
    pattern: /\bthis\.\$on\b/,
    replacement: 'mitt or provide/inject',
    since: 'Vue 3',
    confidence: 0.95,
    description: 'this.$on (event bus) is removed in Vue 3. Use an external event emitter like mitt.',
  },
  {
    pattern: /\bthis\.\$off\b/,
    replacement: 'mitt or provide/inject',
    since: 'Vue 3',
    confidence: 0.95,
    description: 'this.$off is removed in Vue 3. Use an external event emitter.',
  },
  {
    pattern: /\bthis\.\$once\b/,
    replacement: 'mitt or provide/inject',
    since: 'Vue 3',
    confidence: 0.95,
    description: 'this.$once is removed in Vue 3.',
  },
  {
    pattern: /\bthis\.\$listeners\b/,
    replacement: '$attrs (Vue 3 merges $listeners into $attrs)',
    since: 'Vue 3',
    confidence: 0.9,
    description: '$listeners is removed in Vue 3 — listeners are now part of $attrs.',
  },
  {
    pattern: /\bthis\.\$children\b/,
    replacement: 'template refs or provide/inject',
    since: 'Vue 3',
    confidence: 0.95,
    description: '$children is removed in Vue 3. Use template refs or provide/inject.',
  },
  {
    pattern: /\bthis\.\$scopedSlots\b/,
    replacement: '$slots (Vue 3 unifies $slots and $scopedSlots)',
    since: 'Vue 3',
    confidence: 0.9,
    description: '$scopedSlots is removed in Vue 3. Use $slots for all slots.',
  },
  {
    pattern: /\bVue\.filter\b/,
    replacement: 'computed properties or methods',
    since: 'Vue 3',
    confidence: 0.95,
    description: 'Filters are removed in Vue 3. Use computed properties or method calls in templates.',
  },
  {
    pattern: /\bVue\.directive\b/,
    replacement: 'app.directive()',
    since: 'Vue 3',
    confidence: 0.85,
    description: 'Vue.directive is removed in Vue 3. Register directives on the app instance.',
  },
  {
    pattern: /\bVue\.component\b/,
    replacement: 'app.component()',
    since: 'Vue 3',
    confidence: 0.8,
    description: 'Vue.component global registration syntax changed in Vue 3. Use app.component().',
  },
  {
    pattern: /\bVue\.mixin\b/,
    replacement: 'composables or provide/inject',
    since: 'Vue 3',
    confidence: 0.9,
    description: 'Vue.mixin is removed in Vue 3. Use composables or provide/inject for shared logic.',
  },
  {
    pattern: /\bVue\.use\b/,
    replacement: 'app.use()',
    since: 'Vue 3',
    confidence: 0.85,
    description: 'Vue.use plugin installation changed in Vue 3. Use app.use() on the app instance.',
  },
  {
    pattern: /\bnew\s+Vue\b/,
    replacement: 'createApp()',
    since: 'Vue 3',
    confidence: 0.85,
    description: 'new Vue() constructor is removed in Vue 3. Use createApp() from vue.',
  },
  {
    pattern: /\bv-bind:\w+\.sync\b/,
    replacement: 'v-model:propName',
    since: 'Vue 3',
    confidence: 0.95,
    description: '.sync modifier is removed in Vue 3. Use v-model:propName instead.',
  },
  {
    pattern: /\.\w+\.sync(?:\s|=|>|$)/,
    replacement: 'v-model:propName',
    since: 'Vue 3',
    confidence: 0.85,
    description: '.sync modifier is removed in Vue 3. Use v-model:propName instead.',
  },
  {
    pattern: /\bv-on\.native\b/,
    replacement: 'emits option',
    since: 'Vue 3',
    confidence: 0.95,
    description: '.native modifier is removed in Vue 3. Use the emits option to declare component events.',
  },
];

// ── Angular deprecated APIs ────────────────────────────────────────

const ANGULAR_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bHttpClientModule\b/,
    replacement: 'provideHttpClient()',
    since: 'Angular 17',
    confidence: 0.9,
    description: 'HttpClientModule is deprecated in Angular 17+. Use provideHttpClient() in app.config.',
  },
  {
    pattern: /\bBrowserAnimationsModule\b/,
    replacement: 'provideAnimations() or provideAnimationsAsync()',
    since: 'Angular 17',
    confidence: 0.9,
    description: 'BrowserAnimationsModule is deprecated in Angular 17+. Use provideAnimations() in app.config.',
  },
  {
    pattern: /\b\@angular\/platform-browser-dynamic\b/,
    replacement: 'bootstrapApplication()',
    since: 'Angular 17',
    confidence: 0.7,
    description: 'platformBrowserDynamic().bootstrapModule() is the legacy bootstrap method. Use bootstrapApplication().',
  },
  {
    pattern: /\bViewChild\b.*?\bstatic\s*:\s*true\b/,
    replacement: 'signals-based ViewChild (no static flag needed)',
    since: 'Angular 17+',
    confidence: 0.7,
    description: 'ViewChild static flag is being phased out. Consider using Angular signals.',
  },
  {
    pattern: /\bRenderer\b/,
    replacement: 'Renderer2',
    since: 'Angular 4+',
    confidence: 0.85,
    description: 'Renderer is deprecated since Angular 4. Use Renderer2 instead.',
  },
  {
    pattern: /\b\@angular\/common\/http\/\$Http\b/,
    replacement: 'HttpClient',
    since: 'Angular 5',
    confidence: 0.95,
    description: 'The legacy Http service is removed. Use HttpClient from @angular/common/http.',
  },
];

const PYTHON_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bimport\s+optparse\b/,
    replacement: 'argparse',
    since: 'Python 3.2',
    confidence: 0.95,
    description: 'optparse is deprecated in favor of argparse',
  },
  {
    pattern: /\bimport\s+imp\b/,
    replacement: 'importlib',
    since: 'Python 3.4',
    confidence: 0.95,
    description: 'imp module is deprecated in favor of importlib',
  },
  {
    pattern: /\bcollections\.MutableMapping\b/,
    replacement: 'collections.abc.MutableMapping',
    since: 'Python 3.3',
    confidence: 0.9,
    description: 'Direct access to abstract base classes from collections is deprecated',
  },
  {
    pattern: /\bcollections\.MutableSequence\b/,
    replacement: 'collections.abc.MutableSequence',
    since: 'Python 3.3',
    confidence: 0.9,
    description: 'Direct access to abstract base classes from collections is deprecated',
  },
  {
    pattern: /\bcollections\.MutableSet\b/,
    replacement: 'collections.abc.MutableSet',
    since: 'Python 3.3',
    confidence: 0.9,
    description: 'Direct access to abstract base classes from collections is deprecated',
  },
  {
    pattern: /\basyncio\.coroutine\b/,
    replacement: 'async def',
    since: 'Python 3.8',
    confidence: 0.95,
    description: '@asyncio.coroutine decorator is deprecated in favor of async def',
  },
  {
    pattern: /\bimport\s+distutils\b/,
    replacement: 'setuptools',
    since: 'Python 3.10',
    confidence: 0.9,
    description: 'distutils is deprecated and removed in Python 3.12',
  },
  {
    pattern: /\bimport\s+cgi\b/,
    replacement: 'urllib.parse or email.message',
    since: 'Python 3.11',
    confidence: 0.85,
    description: 'cgi module is deprecated',
  },
];

const JAVA_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bnew\s+Date\(\)/,
    replacement: 'LocalDateTime.now() / Instant.now()',
    since: 'Java 8',
    confidence: 0.7,
    description: 'java.util.Date is largely deprecated in favor of java.time API',
  },
  {
    pattern: /\bVector\b/,
    replacement: 'ArrayList (or Collections.synchronizedList)',
    since: 'Java 1.2',
    confidence: 0.85,
    description: 'Vector is legacy; use ArrayList or CopyOnWriteArrayList',
  },
  {
    pattern: /\bStringBuffer\b/,
    replacement: 'StringBuilder',
    since: 'Java 1.5',
    confidence: 0.8,
    description: 'StringBuffer is slower than StringBuilder; use StringBuilder unless thread-safety needed',
  },
  {
    pattern: /\bThread\.stop\b/,
    replacement: 'Thread interruption pattern',
    since: 'Java 1.2',
    confidence: 0.95,
    description: 'Thread.stop() is deprecated because it is inherently unsafe',
  },
  {
    pattern: /\bThread\.suspend\b/,
    replacement: 'Use wait/notify or LockSupport',
    since: 'Java 1.2',
    confidence: 0.95,
    description: 'Thread.suspend() is deprecated due to deadlock risks',
  },
  {
    pattern: /\bThread\.resume\b/,
    replacement: 'Use wait/notify or LockSupport',
    since: 'Java 1.2',
    confidence: 0.95,
    description: 'Thread.resume() is deprecated due to deadlock risks',
  },
  {
    pattern: /\bHashtable\b/,
    replacement: 'HashMap or ConcurrentHashMap',
    since: 'Java 1.2',
    confidence: 0.8,
    description: 'Hashtable is legacy; use HashMap or ConcurrentHashMap',
  },
  {
    pattern: /\bRuntime\.getRuntime\(\)\.exec\b/,
    replacement: 'ProcessBuilder',
    since: 'Java 9',
    confidence: 0.7,
    description: 'Runtime.exec() has known issues; prefer ProcessBuilder',
  },
];

const GO_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bioutil\.ReadFile\b/,
    replacement: 'os.ReadFile',
    since: 'Go 1.16',
    confidence: 0.95,
    description: 'io/ioutil is deprecated; use os.ReadFile',
  },
  {
    pattern: /\bioutil\.WriteFile\b/,
    replacement: 'os.WriteFile',
    since: 'Go 1.16',
    confidence: 0.95,
    description: 'io/ioutil is deprecated; use os.WriteFile',
  },
  {
    pattern: /\bioutil\.ReadAll\b/,
    replacement: 'io.ReadAll',
    since: 'Go 1.16',
    confidence: 0.95,
    description: 'io/ioutil is deprecated; use io.ReadAll',
  },
  {
    pattern: /\bioutil\.TempDir\b/,
    replacement: 'os.MkdirTemp',
    since: 'Go 1.16',
    confidence: 0.95,
    description: 'io/ioutil is deprecated; use os.MkdirTemp',
  },
  {
    pattern: /\bioutil\.TempFile\b/,
    replacement: 'os.CreateTemp',
    since: 'Go 1.16',
    confidence: 0.95,
    description: 'io/ioutil is deprecated; use os.CreateTemp',
  },
  {
    pattern: /\bioutil\.ReadDir\b/,
    replacement: 'os.ReadDir',
    since: 'Go 1.16',
    confidence: 0.95,
    description: 'io/ioutil is deprecated; use os.ReadDir',
  },
  {
    pattern: /\bioutil\.NopCloser\b/,
    replacement: 'io.NopCloser',
    since: 'Go 1.16',
    confidence: 0.95,
    description: 'io/ioutil is deprecated; use io.NopCloser',
  },
  {
    pattern: /\bimport\s+["']io\/ioutil["']/,
    replacement: 'io and os packages',
    since: 'Go 1.16',
    confidence: 0.95,
    description: 'The entire io/ioutil package is deprecated since Go 1.16',
  },
];

const KOTLIN_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bkotlin\.coroutines\.experimental\b/,
    replacement: 'kotlin.coroutines',
    since: 'Kotlin 1.3',
    confidence: 0.95,
    description: 'Experimental coroutines API is deprecated; use stable kotlin.coroutines',
  },
  {
    pattern: /\bwithDefault\b/,
    replacement: 'getOrElse or getOrPut',
    since: 'Kotlin 1.0',
    confidence: 0.5,
    description: 'withDefault creates a wrapper map; prefer getOrElse/getOrPut for simpler cases',
  },
  {
    pattern: /\bprint\b\s*\(/,
    replacement: 'kotlin.io.println',
    since: 'Kotlin 1.0',
    confidence: 0.4,
    description: 'print() without newline is rarely needed in server-side code; prefer println()',
  },
  {
    pattern: /\b!!\b(?!\s*[.=])/,
    replacement: 'Safe call (?.) or let { }',
    since: 'Kotlin 1.0',
    confidence: 0.55,
    description: 'Non-null assertion (!!) can cause NullPointerException. Prefer safe calls (?.) or null checks.',
  },
  // Kotlin inherits Java deprecations
  ...JAVA_DEPRECATIONS,
];

// ── Popular third-party library deprecated APIs ────────────────────
// AI models frequently generate code using outdated APIs from popular
// npm packages. These are the patterns traditional linters miss because
// they require framework-specific knowledge.

const EXPRESS_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bapp\.del\s*\(/,
    replacement: 'app.delete()',
    since: 'Express 5',
    confidence: 0.9,
    description: 'app.del() is removed in Express 5. Use app.delete() instead.',
  },
  {
    pattern: /\bres\.json\s*\(\s*\d+\s*,/,
    replacement: 'res.status(code).json(body)',
    since: 'Express 5',
    confidence: 0.85,
    description: 'res.json(status, body) signature is removed in Express 5. Use res.status(code).json(body).',
  },
  {
    pattern: /\bres\.send\s*\(\s*\d{3}\s*,/,
    replacement: 'res.status(code).send(body)',
    since: 'Express 5',
    confidence: 0.85,
    description: 'res.send(status, body) signature is removed in Express 5. Use res.status(code).send(body).',
  },
  {
    pattern: /\bres\.sendfile\b/,
    replacement: 'res.sendFile() (capital F)',
    since: 'Express 4.8',
    confidence: 0.9,
    description: 'res.sendfile() is deprecated. Use res.sendFile() (capital F) instead.',
  },
  {
    pattern: /\brequire\s*\(\s*['"]body-parser['"]\s*\)/,
    replacement: 'express.json() and express.urlencoded()',
    since: 'Express 4.16',
    confidence: 0.85,
    description: 'body-parser is built into Express since 4.16. Use express.json() and express.urlencoded().',
  },
  {
    pattern: /\bres\.redirect\s*\(\s*['"][^'"]+['"]\s*,\s*\d/,
    replacement: 'res.redirect(status, url)',
    since: 'Express 5',
    confidence: 0.8,
    description: 'res.redirect(url, status) argument order is reversed in Express 5. Use res.redirect(status, url).',
  },
];

const NEXTJS_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bfrom\s+['"]next\/image['"]/,
    replacement: 'next/image (new component)',
    since: 'Next.js 13',
    confidence: 0.3,
    description: 'next/image was redesigned in Next.js 13. If using the legacy component, migrate to the new API.',
  },
  {
    pattern: /\bfrom\s+['"]next\/legacy\/image['"]/,
    replacement: 'next/image (new component)',
    since: 'Next.js 13',
    confidence: 0.7,
    description: 'next/legacy/image is a compatibility wrapper. Migrate to the new next/image component.',
  },
  {
    pattern: /\bgetInitialProps\b/,
    replacement: 'getServerSideProps or getStaticProps (Pages) / server components (App Router)',
    since: 'Next.js 13',
    confidence: 0.8,
    description: 'getInitialProps is discouraged. Use getServerSideProps/getStaticProps or App Router server components.',
  },
  {
    pattern: /\bgetServerSideProps\b/,
    replacement: 'Server Components (App Router)',
    since: 'Next.js 13',
    confidence: 0.3,
    description: 'getServerSideProps is Pages Router only. In App Router, use server components with direct data fetching.',
  },
  {
    pattern: /\bgetStaticProps\b/,
    replacement: 'Server Components (App Router) with generateStaticParams',
    since: 'Next.js 13',
    confidence: 0.3,
    description: 'getStaticProps is Pages Router only. In App Router, use server components with generateStaticParams.',
  },
  {
    pattern: /\bfrom\s+['"]next\/router['"]/,
    replacement: 'next/navigation (App Router)',
    since: 'Next.js 13',
    confidence: 0.7,
    description: 'next/router is for Pages Router. In App Router, use useRouter from next/navigation.',
  },
  {
    pattern: /\bfrom\s+['"]next\/head['"]/,
    replacement: 'Metadata API (export const metadata) in App Router',
    since: 'Next.js 13',
    confidence: 0.7,
    description: 'next/head is for Pages Router. In App Router, use the Metadata API or generateMetadata.',
  },
  {
    pattern: /\bfrom\s+['"]next\/document['"]/,
    replacement: 'Root layout (app/layout.tsx) in App Router',
    since: 'Next.js 13',
    confidence: 0.7,
    description: 'next/document is for Pages Router. In App Router, customize HTML structure in the root layout.',
  },
];

const PRISMA_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bprisma\.\$on\s*\(\s*['"]beforeExit['"]/,
    replacement: 'process signal handlers or shutdown hooks',
    since: 'Prisma 5',
    confidence: 0.8,
    description: '$on("beforeExit") behavior changed in Prisma 5. Use process signal handlers for cleanup.',
  },
  {
    pattern: /\bfindUnique\s*\(\s*\{[^}]*where\s*:\s*\{[^}]*\b(?:AND|OR|NOT)\b/i,
    replacement: 'findFirst() for compound conditions',
    since: 'Prisma 5',
    confidence: 0.7,
    description: 'findUnique does not support compound filters (AND/OR/NOT) in where. Use findFirst() instead.',
  },
  {
    pattern: /\brejectOnNotFound\b/,
    replacement: 'findUniqueOrThrow() / findFirstOrThrow()',
    since: 'Prisma 5',
    confidence: 0.9,
    description: 'rejectOnNotFound is removed in Prisma 5. Use findUniqueOrThrow() or findFirstOrThrow().',
  },
];

const MONGOOSE_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bmongoose\.connect\s*\([^,]+,\s*\{[^}]*useNewUrlParser/,
    replacement: 'mongoose.connect(uri) (options no longer needed)',
    since: 'Mongoose 6',
    confidence: 0.9,
    description: 'useNewUrlParser option is removed in Mongoose 6+. These options are now always enabled.',
  },
  {
    pattern: /\buseUnifiedTopology\b/,
    replacement: 'Remove the option (always enabled)',
    since: 'Mongoose 6',
    confidence: 0.9,
    description: 'useUnifiedTopology is removed in Mongoose 6+. The unified topology is always used.',
  },
  {
    pattern: /\buseCreateIndex\b/,
    replacement: 'Remove the option (always enabled)',
    since: 'Mongoose 6',
    confidence: 0.9,
    description: 'useCreateIndex is removed in Mongoose 6+. createIndex is always used.',
  },
  {
    pattern: /\buseFindAndModify\b/,
    replacement: 'Remove the option (always disabled)',
    since: 'Mongoose 6',
    confidence: 0.9,
    description: 'useFindAndModify is removed in Mongoose 6+. findOneAndUpdate always uses findAndModify=false.',
  },
  {
    pattern: /\b\.update\s*\(/,
    replacement: 'updateOne() or updateMany()',
    since: 'Mongoose 6',
    confidence: 0.5,
    description: 'Model.update() is removed in Mongoose 6+. Use updateOne() or updateMany().',
  },
  {
    pattern: /\b\.remove\s*\(/,
    replacement: 'deleteOne() or deleteMany()',
    since: 'Mongoose 7',
    confidence: 0.4,
    description: 'Model.remove() and doc.remove() are removed in Mongoose 7. Use deleteOne() or deleteMany().',
  },
  {
    pattern: /\b\.count\s*\(/,
    replacement: 'countDocuments() or estimatedDocumentCount()',
    since: 'Mongoose 6',
    confidence: 0.4,
    description: 'Model.count() is deprecated. Use countDocuments() or estimatedDocumentCount().',
  },
];

const WEBPACK_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bmodule\.loaders\b/,
    replacement: 'module.rules',
    since: 'Webpack 4',
    confidence: 0.95,
    description: 'module.loaders is removed in Webpack 4+. Use module.rules.',
  },
  {
    pattern: /\bnew\s+webpack\.optimize\.CommonsChunkPlugin\b/,
    replacement: 'optimization.splitChunks',
    since: 'Webpack 4',
    confidence: 0.95,
    description: 'CommonsChunkPlugin is removed in Webpack 4+. Use optimization.splitChunks.',
  },
  {
    pattern: /\bnew\s+webpack\.optimize\.UglifyJsPlugin\b/,
    replacement: 'optimization.minimizer with TerserPlugin',
    since: 'Webpack 4',
    confidence: 0.95,
    description: 'UglifyJsPlugin is removed in Webpack 4+. Use TerserPlugin via optimization.minimizer.',
  },
  {
    pattern: /\bnew\s+webpack\.optimize\.DedupePlugin\b/,
    replacement: 'Remove (deduplication is automatic)',
    since: 'Webpack 4',
    confidence: 0.95,
    description: 'DedupePlugin is removed in Webpack 4+. Deduplication is handled automatically.',
  },
  {
    pattern: /\bnew\s+webpack\.NamedModulesPlugin\b/,
    replacement: 'optimization.moduleIds: "named"',
    since: 'Webpack 4',
    confidence: 0.9,
    description: 'NamedModulesPlugin is removed in Webpack 5. Use optimization.moduleIds: "named".',
  },
];

const JEST_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bjest\.fn\(\)\.mockReturnValue\b/,
    replacement: 'jest.fn().mockReturnValue (verify no deprecated usage)',
    since: 'Jest 27+',
    confidence: 0.2,
    description: 'Ensure using current Jest mock API. Some mock methods were restructured in Jest 27+.',
  },
  {
    pattern: /\bjest\.useFakeTimers\s*\(\s*['"]modern['"]\s*\)/,
    replacement: 'jest.useFakeTimers() (modern is now the default)',
    since: 'Jest 27',
    confidence: 0.8,
    description: 'jest.useFakeTimers("modern") is redundant since Jest 27. Modern timers are the default.',
  },
  {
    pattern: /\bjest\.useFakeTimers\s*\(\s*['"]legacy['"]\s*\)/,
    replacement: 'jest.useFakeTimers() (legacy timers are deprecated)',
    since: 'Jest 27',
    confidence: 0.85,
    description: 'Legacy fake timers are deprecated since Jest 27. Use modern timers (now the default).',
  },
];

const NESTJS_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\b\@nestjs\/swagger.*?ApiModelProperty\b/,
    replacement: 'ApiProperty()',
    since: 'NestJS Swagger 4',
    confidence: 0.95,
    description: '@ApiModelProperty() is removed. Use @ApiProperty() decorator instead.',
  },
  {
    pattern: /\bDocumentBuilder.*?\.setHost\b/,
    replacement: '.addServer()',
    since: 'NestJS Swagger 4',
    confidence: 0.9,
    description: 'DocumentBuilder.setHost() is removed in Swagger 4. Use addServer() for OpenAPI 3.',
  },
  {
    pattern: /\bDocumentBuilder.*?\.setSchemes\b/,
    replacement: '.addServer()',
    since: 'NestJS Swagger 4',
    confidence: 0.9,
    description: 'DocumentBuilder.setSchemes() is removed in Swagger 4. Use addServer() for OpenAPI 3.',
  },
];

const TYPEORM_DEPRECATIONS: DeprecatedPattern[] = [
  {
    pattern: /\bgetRepository\s*\(/,
    replacement: 'dataSource.getRepository() or @InjectRepository()',
    since: 'TypeORM 0.3',
    confidence: 0.7,
    description: 'getRepository() without DataSource context is deprecated in TypeORM 0.3. Use dataSource.getRepository().',
  },
  {
    pattern: /\bgetConnection\s*\(/,
    replacement: 'DataSource instance',
    since: 'TypeORM 0.3',
    confidence: 0.85,
    description: 'getConnection() is deprecated in TypeORM 0.3. Use a DataSource instance directly.',
  },
  {
    pattern: /\bgetManager\s*\(/,
    replacement: 'dataSource.manager',
    since: 'TypeORM 0.3',
    confidence: 0.85,
    description: 'getManager() is deprecated in TypeORM 0.3. Use dataSource.manager directly.',
  },
  {
    pattern: /\bgetCustomRepository\s*\(/,
    replacement: 'Custom repository classes with DataSource',
    since: 'TypeORM 0.3',
    confidence: 0.85,
    description: 'getCustomRepository() is removed in TypeORM 0.3. Use custom repository patterns with DataSource.',
  },
  {
    pattern: /\bnew\s+Connection\b/,
    replacement: 'new DataSource()',
    since: 'TypeORM 0.3',
    confidence: 0.85,
    description: 'Connection class is renamed to DataSource in TypeORM 0.3.',
  },
  {
    pattern: /\bcreateConnection\s*\(/,
    replacement: 'new DataSource().initialize()',
    since: 'TypeORM 0.3',
    confidence: 0.85,
    description: 'createConnection() is deprecated in TypeORM 0.3. Use new DataSource().initialize().',
  },
];

// ── Python third-party library deprecated APIs ─────────────────────

const PYTHON_THIRDPARTY_DEPRECATIONS: DeprecatedPattern[] = [
  // Flask
  {
    pattern: /\b\@app\.before_request\b/,
    replacement: '@app.before_request (verify compatibility with Flask 2.3+ changes)',
    since: 'Flask 2.3',
    confidence: 0.3,
    description: 'Flask 2.3 restructured request lifecycle hooks. Verify before_request usage is compatible.',
  },
  {
    pattern: /\bfrom\s+flask\.json\s+import\s+jsonify\b/,
    replacement: 'from flask import jsonify',
    since: 'Flask 2.2',
    confidence: 0.8,
    description: 'Importing jsonify from flask.json is deprecated. Import directly from flask.',
  },
  // Django
  {
    pattern: /\bfrom\s+django\.conf\.urls\s+import\s+url\b/,
    replacement: 'from django.urls import re_path or path',
    since: 'Django 4.0',
    confidence: 0.95,
    description: 'django.conf.urls.url() is removed in Django 4.0. Use path() or re_path() from django.urls.',
  },
  {
    pattern: /\bfrom\s+django\.utils\.encoding\s+import\s+(?:force_text|smart_text)\b/,
    replacement: 'force_str / smart_str',
    since: 'Django 4.0',
    confidence: 0.95,
    description: 'force_text and smart_text are removed in Django 4.0. Use force_str and smart_str.',
  },
  {
    pattern: /\bfrom\s+django\.utils\.translation\s+import\s+ugettext\b/,
    replacement: 'from django.utils.translation import gettext',
    since: 'Django 4.0',
    confidence: 0.95,
    description: 'ugettext is removed in Django 4.0. Use gettext (the u prefix was for Python 2 compat).',
  },
  {
    pattern: /\bdefault_app_config\b/,
    replacement: 'Remove (auto-discovery in Django 3.2+)',
    since: 'Django 3.2',
    confidence: 0.8,
    description: 'default_app_config is deprecated in Django 3.2. Apps are auto-discovered via AppConfig.',
  },
  // Requests
  {
    pattern: /\brequests\.packages\.urllib3\b/,
    replacement: 'import urllib3 directly',
    since: 'requests 2.16',
    confidence: 0.9,
    description: 'Accessing urllib3 through requests.packages is deprecated. Import urllib3 directly.',
  },
  // SQLAlchemy
  {
    pattern: /\bfrom\s+sqlalchemy\s+import\s+.*?\bengine_from_config\b/,
    replacement: 'create_engine()',
    since: 'SQLAlchemy 2.0',
    confidence: 0.85,
    description: 'engine_from_config is deprecated in SQLAlchemy 2.0. Use create_engine() with configuration.',
  },
  {
    pattern: /\bQuery\.get\b/,
    replacement: 'Session.get()',
    since: 'SQLAlchemy 2.0',
    confidence: 0.85,
    description: 'Query.get() is removed in SQLAlchemy 2.0. Use Session.get() instead.',
  },
];

// ── Go third-party library deprecated APIs ─────────────────────────

const GO_THIRDPARTY_DEPRECATIONS: DeprecatedPattern[] = [
  // Gin
  {
    pattern: /\bgin\.Default\(\)\.Use\(gin\.Logger\(\)\)/,
    replacement: 'gin.Default() (already includes Logger middleware)',
    since: 'Gin 1.0',
    confidence: 0.8,
    description: 'gin.Default() already includes Logger and Recovery middleware. Adding Logger again is redundant.',
  },
  {
    pattern: /\bc\.JSON\s*\(\s*200\s*,/,
    replacement: 'c.JSON(http.StatusOK, ...)',
    since: 'Go best practice',
    confidence: 0.4,
    description: 'Use http.StatusOK constant instead of magic number 200 for clarity.',
  },
  // GORM
  {
    pattern: /\bgorm\.Open\b/,
    replacement: 'gorm.Open() replaced by driver-specific open in GORM v2',
    since: 'GORM v2',
    confidence: 0.85,
    description: 'gorm.Open() is removed in GORM v2. Use gorm.Open(driver.Open(dsn)) with a specific driver.',
  },
  {
    pattern: /\.RecordNotFound\b/,
    replacement: 'errors.Is(err, gorm.ErrRecordNotFound)',
    since: 'GORM v2',
    confidence: 0.85,
    description: '.RecordNotFound() is removed in GORM v2. Use errors.Is(err, gorm.ErrRecordNotFound).',
  },
];

// ── Java third-party library deprecated APIs ───────────────────────

const JAVA_THIRDPARTY_DEPRECATIONS: DeprecatedPattern[] = [
  // Spring Boot
  {
    pattern: /\bWebSecurityConfigurerAdapter\b/,
    replacement: 'SecurityFilterChain @Bean',
    since: 'Spring Security 5.7',
    confidence: 0.95,
    description: 'WebSecurityConfigurerAdapter is deprecated in Spring Security 5.7. Use SecurityFilterChain @Bean.',
  },
  {
    pattern: /\bauthorizeRequests\b/,
    replacement: 'authorizeHttpRequests()',
    since: 'Spring Security 5.6',
    confidence: 0.8,
    description: 'authorizeRequests() is deprecated. Use authorizeHttpRequests() in Spring Security 5.6+.',
  },
  {
    pattern: /\bantMatchers\b/,
    replacement: 'requestMatchers()',
    since: 'Spring Security 6.0',
    confidence: 0.85,
    description: 'antMatchers() is removed in Spring Security 6.0. Use requestMatchers() instead.',
  },
  {
    pattern: /\bmvcMatchers\b/,
    replacement: 'requestMatchers()',
    since: 'Spring Security 6.0',
    confidence: 0.85,
    description: 'mvcMatchers() is removed in Spring Security 6.0. Use requestMatchers() instead.',
  },
  // JUnit
  {
    pattern: /\bimport\s+org\.junit\.Test\b/,
    replacement: 'import org.junit.jupiter.api.Test (JUnit 5)',
    since: 'JUnit 5',
    confidence: 0.8,
    description: 'JUnit 4 @Test annotation. Consider migrating to JUnit 5 (org.junit.jupiter.api.Test).',
  },
  {
    pattern: /\b\@RunWith\s*\(\s*SpringRunner\.class\s*\)/,
    replacement: '@ExtendWith(SpringExtension.class) or @SpringBootTest',
    since: 'Spring Boot 2.1 / JUnit 5',
    confidence: 0.85,
    description: '@RunWith(SpringRunner.class) is JUnit 4 style. Use @ExtendWith or @SpringBootTest with JUnit 5.',
  },
];

// ─── Deprecation patterns map ──────────────────────────────────────

/** Combined TypeScript/JavaScript patterns including Node.js + React + Vue + Angular + third-party libs. */
const TS_JS_DEPRECATIONS: DeprecatedPattern[] = [
  ...TYPESCRIPT_DEPRECATIONS,
  ...REACT_DEPRECATIONS,
  ...VUE_DEPRECATIONS,
  ...ANGULAR_DEPRECATIONS,
  ...EXPRESS_DEPRECATIONS,
  ...NEXTJS_DEPRECATIONS,
  ...PRISMA_DEPRECATIONS,
  ...MONGOOSE_DEPRECATIONS,
  ...WEBPACK_DEPRECATIONS,
  ...JEST_DEPRECATIONS,
  ...NESTJS_DEPRECATIONS,
  ...TYPEORM_DEPRECATIONS,
];

const DEPRECATION_PATTERNS: Map<SupportedLanguage, DeprecatedPattern[]> = new Map([
  ['typescript', TS_JS_DEPRECATIONS],
  ['javascript', TS_JS_DEPRECATIONS],
  ['python', [...PYTHON_DEPRECATIONS, ...PYTHON_THIRDPARTY_DEPRECATIONS]],
  ['java', [...JAVA_DEPRECATIONS, ...JAVA_THIRDPARTY_DEPRECATIONS]],
  ['go', [...GO_DEPRECATIONS, ...GO_THIRDPARTY_DEPRECATIONS]],
  ['kotlin', [...KOTLIN_DEPRECATIONS, ...JAVA_THIRDPARTY_DEPRECATIONS]],
]);

// ─── Deprecated import modules (package-level deprecation) ─────────

const DEPRECATED_IMPORT_MODULES: Map<SupportedLanguage, Map<string, { replacement: string; since?: string }>> = new Map([
  ['python', new Map([
    ['optparse', { replacement: 'argparse', since: 'Python 3.2' }],
    ['imp', { replacement: 'importlib', since: 'Python 3.4' }],
    ['distutils', { replacement: 'setuptools', since: 'Python 3.10' }],
    ['cgi', { replacement: 'urllib.parse or email.message', since: 'Python 3.11' }],
  ])],
  ['go', new Map([
    ['io/ioutil', { replacement: 'io and os packages', since: 'Go 1.16' }],
  ])],
]);

// ─── Detector ──────────────────────────────────────────────────────

export class StaleAPIDetector implements V4Detector {
  readonly id = 'stale-api';
  readonly name = 'Stale API Detector';
  readonly category: DetectorCategory = 'code-freshness';
  readonly supportedLanguages: SupportedLanguage[] = [];

  async detect(units: CodeUnit[], context: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];

    // Phase 1: Check package-level deprecation via registry
    await this.checkRegistryDeprecations(units, context, results);

    // Phase 2: Check well-known deprecated API patterns in source code
    this.checkPatternDeprecations(units, results);

    // Phase 3: Check deprecated import modules
    this.checkDeprecatedImports(units, results);

    return results;
  }

  /**
   * Check package deprecation status via the registry manager.
   */
  private async checkRegistryDeprecations(
    units: CodeUnit[],
    context: DetectorContext,
    results: DetectorResult[],
  ): Promise<void> {
    if (!context.registryManager) return;

    // Collect unique import packages by language
    const importsByLanguage = new Map<string, Map<string, { file: string; line: number }[]>>();

    for (const unit of units) {
      if (unit.kind !== 'file') continue;

      for (const imp of unit.imports) {
        if (imp.isRelative) continue;

        const packageName = this.extractPackageName(imp.module, unit.language);
        if (!importsByLanguage.has(unit.language)) {
          importsByLanguage.set(unit.language, new Map());
        }
        const langMap = importsByLanguage.get(unit.language)!;
        if (!langMap.has(packageName)) {
          langMap.set(packageName, []);
        }
        langMap.get(packageName)!.push({ file: unit.file, line: imp.line });
      }
    }

    // Check each package for deprecation
    for (const [language, packageMap] of importsByLanguage.entries()) {
      const registry = context.registryManager.getRegistry(language);
      if (!registry) continue;

      for (const [packageName, occurrences] of packageMap.entries()) {
        try {
          const deprecation = await registry.checkDeprecated(packageName);
          if (deprecation?.deprecated) {
            for (const occurrence of occurrences) {
              results.push({
                detectorId: this.id,
                severity: 'warning',
                category: this.category,
                messageKey: 'stale-api.registry-deprecated',
                message: `Package "${packageName}" is deprecated${deprecation.message ? ': ' + deprecation.message : ''}${deprecation.replacement ? '. Use ' + deprecation.replacement + ' instead' : ''}.`,
                file: occurrence.file,
                line: occurrence.line + 1, // 0-based to 1-based
                confidence: 0.95,
                metadata: {
                  packageName,
                  language,
                  source: 'registry',
                  deprecationMessage: deprecation.message,
                  replacement: deprecation.replacement,
                  since: deprecation.since,
                },
              });
            }
          }
        } catch {
          // Registry check failed; skip silently (conservative)
        }
      }
    }
  }

  /**
   * Check well-known deprecated API patterns in source code.
   */
  private checkPatternDeprecations(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      const patterns = DEPRECATION_PATTERNS.get(unit.language);
      if (!patterns) continue;

      // Check source text against known deprecated patterns
      const lines = unit.source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of patterns) {
          const regex = pattern.pattern instanceof RegExp
            ? pattern.pattern
            : new RegExp(this.escapeRegex(pattern.pattern), 'g');

          if (regex.test(line)) {
            const absoluteLine = unit.location.startLine + i;
            results.push({
              detectorId: this.id,
              severity: 'warning',
              category: this.category,
              messageKey: 'stale-api.deprecated-pattern',
              message: pattern.description || `Deprecated API usage detected. Use ${pattern.replacement} instead${pattern.since ? ' (deprecated since ' + pattern.since + ')' : ''}.`,
              file: unit.file,
              line: absoluteLine + 1, // 0-based to 1-based
              confidence: pattern.confidence,
              metadata: {
                language: unit.language,
                source: 'pattern',
                replacement: pattern.replacement,
                since: pattern.since,
                matchedPattern: pattern.pattern instanceof RegExp
                  ? pattern.pattern.source
                  : pattern.pattern,
              },
            });
          }
          // Reset regex lastIndex for global patterns
          if (pattern.pattern instanceof RegExp) {
            pattern.pattern.lastIndex = 0;
          }
        }
      }
    }
  }

  /**
   * Check deprecated import modules (entire modules that are deprecated).
   */
  private checkDeprecatedImports(
    units: CodeUnit[],
    results: DetectorResult[],
  ): void {
    for (const unit of units) {
      if (unit.kind !== 'file') continue;

      const deprecatedModules = DEPRECATED_IMPORT_MODULES.get(unit.language);
      if (!deprecatedModules) continue;

      for (const imp of unit.imports) {
        const topModule = imp.module.split(/[./]/)[0];
        const deprecation = deprecatedModules.get(imp.module) || deprecatedModules.get(topModule);
        if (deprecation) {
          results.push({
            detectorId: this.id,
            severity: 'warning',
            category: this.category,
            messageKey: 'stale-api.deprecated-module',
            message: `Module "${imp.module}" is deprecated${deprecation.since ? ' since ' + deprecation.since : ''}. Use ${deprecation.replacement} instead.`,
            file: unit.file,
            line: imp.line + 1, // 0-based to 1-based
            confidence: 0.9,
            metadata: {
              module: imp.module,
              language: unit.language,
              source: 'known-deprecation',
              replacement: deprecation.replacement,
              since: deprecation.since,
            },
          });
        }
      }
    }
  }

  /**
   * Extract top-level package name from a module path.
   */
  private extractPackageName(module: string, language: SupportedLanguage): string {
    switch (language) {
      case 'typescript':
      case 'javascript': {
        if (module.startsWith('@')) {
          const parts = module.split('/');
          return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : module;
        }
        return module.split('/')[0];
      }
      case 'python':
        return module.split('.')[0];
      case 'java':
      case 'kotlin':
        return module;
      case 'go': {
        const parts = module.split('/');
        if (parts.length >= 3 && module.includes('.')) {
          return parts.slice(0, 3).join('/');
        }
        return module;
      }
      default:
        return module;
    }
  }

  /**
   * Escape a string for use in a regular expression.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
