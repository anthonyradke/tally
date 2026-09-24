// Resolve hook for running the app's pure modules under node:test: the `@/` alias, extensionless TypeScript
// imports, and small stubs for native-only packages (storage, haptics, navigation) that pure logic never calls.
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = new URL('../', import.meta.url)
const STUBS = {
  '@react-native-async-storage/async-storage': 'storage.mjs',
  'expo-haptics': 'noop.mjs',
  'expo-router': 'noop.mjs',
  'react-native': 'noop.mjs',
}

function withExt(url) {
  const path = fileURLToPath(url)
  for (const ext of ['', '.ts', '.tsx', '/index.ts']) if (existsSync(path + ext) && !path.endsWith('/')) {
    if (ext || /\.(m?js|tsx?)$/.test(path)) return pathToFileURL(path + ext).href
  }
  return null
}

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: new URL(`test/stubs/${STUBS[specifier]}`, root).href, shortCircuit: true }
  if (specifier.startsWith('@/')) {
    const url = withExt(new URL(`src/${specifier.slice(2)}`, root))
    if (url) return { url, shortCircuit: true }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith(root.href)
      && !context.parentURL.includes('/node_modules/')) {
    const url = withExt(new URL(specifier, context.parentURL))
    if (url) return { url, shortCircuit: true }
  }
  return next(specifier, context)
}

// Ubuntu's Node is built without type stripping, so transpile our own .ts files with the app's TypeScript.
let ts
export async function load(url, context, next) {
  if (url.startsWith(root.href) && !url.includes('/node_modules/') && /\.tsx?$/.test(url)) {
    ts ??= (await import('typescript')).default
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(fileURLToPath(url), 'utf8')
    const out = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, sourceMap: false },
    })
    return { format: 'module', source: out.outputText, shortCircuit: true }
  }
  return next(url, context)
}
