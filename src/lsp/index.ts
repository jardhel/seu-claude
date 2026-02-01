/**
 * LSP Module Exports
 */

export { LSPClient, createLSPClient, SymbolKind } from './client.js';
export {
  SymbolResolver,
  createSymbolResolver,
  type SymbolDefinition,
  type SymbolReference,
  type SymbolResolutionResult,
} from './symbol-resolver.js';
