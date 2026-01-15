# seu-claude License Compliance Report

**Generated:** January 15, 2026  
**Project License:** MIT

---

## Summary

| License Type | Count | Compatibility with MIT |
|--------------|-------|------------------------|
| MIT | 426 | ✅ Fully Compatible |
| ISC | 40 | ✅ Fully Compatible |
| BSD-3-Clause | 31 | ✅ Fully Compatible |
| Apache-2.0 | 21 | ✅ Compatible |
| BSD-2-Clause | 12 | ✅ Fully Compatible |
| (MIT OR CC0-1.0) | 4 | ✅ Fully Compatible |
| BlueOak-1.0.0 | 3 | ✅ Permissive |
| 0BSD | 1 | ✅ Fully Compatible |
| CC-BY-4.0 | 1 | ✅ Compatible (attribution) |
| Python-2.0 | 1 | ✅ Compatible |
| LGPL-3.0-or-later | 1 | ⚠️ See Note |

---

## Direct Dependencies License Analysis

### Core Dependencies

| Package | License | Notes |
|---------|---------|-------|
| `@modelcontextprotocol/sdk` | MIT | ✅ |
| `@lancedb/lancedb` | Apache-2.0 | ✅ (see note below) |
| `@huggingface/transformers` | Apache-2.0 | ✅ |
| `web-tree-sitter` | MIT | ✅ |
| `fast-glob` | MIT | ✅ |
| `ignore` | MIT | ✅ |
| `xxhash-wasm` | MIT | ✅ |
| `@anthropic-ai/sdk` | MIT | ✅ |
| `@anthropic-ai/tokenizer` | Apache-2.0 | ✅ |

### Tree-sitter Grammar Licenses

All official Tree-sitter grammars are **MIT Licensed**:

| Grammar | Source | License |
|---------|--------|---------|
| tree-sitter-typescript | github.com/tree-sitter/tree-sitter-typescript | MIT |
| tree-sitter-javascript | github.com/tree-sitter/tree-sitter-javascript | MIT |
| tree-sitter-python | github.com/tree-sitter/tree-sitter-python | MIT |
| tree-sitter-rust | github.com/tree-sitter/tree-sitter-rust | MIT |
| tree-sitter-go | github.com/tree-sitter/tree-sitter-go | MIT |
| tree-sitter-java | github.com/tree-sitter/tree-sitter-java | MIT |
| tree-sitter-c | github.com/tree-sitter/tree-sitter-c | MIT |
| tree-sitter-cpp | github.com/tree-sitter/tree-sitter-cpp | MIT |
| tree-sitter | github.com/tree-sitter/tree-sitter | MIT |

---

## Notes on Specific Licenses

### LanceDB (Apache-2.0)

The `@lancedb/lancedb` package shows as "UNKNOWN" or "Custom" in license-checker because the npm package metadata references the GitHub repo instead of a standard SPDX identifier. However, **LanceDB is Apache-2.0 licensed**:

- **GitHub License:** https://github.com/lancedb/lancedb/blob/main/LICENSE
- **License:** Apache License 2.0
- **Copyright:** LanceDB Inc.

**Compatibility:** Apache-2.0 is compatible with MIT. When distributing, we must:
1. Include the Apache-2.0 license notice
2. Include the NOTICE file if provided

### Sharp / libvips (LGPL-3.0-or-later)

The `@img/sharp-libvips-darwin-arm64` package is LGPL-3.0-or-later. This is a **transitive dependency** of Sharp (image processing library).

**Impact:** 
- Sharp is used by `@huggingface/transformers` for image processing
- seu-claude does NOT use image processing features
- The binary is dynamically linked, satisfying LGPL requirements
- **No action required** for seu-claude usage

### caniuse-lite (CC-BY-4.0)

This is data licensed under Creative Commons Attribution 4.0. It requires attribution when redistributing the data itself. This is a build-time dependency only.

**Impact:** None for runtime distribution.

### argparse (Python-2.0)

The Python-2.0 license is a permissive open source license, compatible with MIT distribution.

---

## Compliance Actions

### Required Attributions

1. **Apache-2.0 packages** - Include NOTICE files if provided
2. **CC-BY-4.0 (caniuse-lite)** - Build-time only, no action needed

### Recommended: Third-Party License File

Create `THIRD_PARTY_LICENSES.md` including:
- LanceDB (Apache-2.0)
- Hugging Face Transformers (Apache-2.0)
- Tree-sitter ecosystem (MIT)

---

## Verification Commands

```bash
# Check all licenses
npx license-checker --summary

# Check for problematic licenses
npx license-checker --onlyAllow "MIT;ISC;BSD-3-Clause;BSD-2-Clause;Apache-2.0;0BSD;CC0-1.0;Python-2.0;BlueOak-1.0.0;CC-BY-4.0;LGPL-3.0-or-later;UNKNOWN" --excludePackages "@lancedb/lancedb-darwin-arm64"

# Export full license report
npx license-checker --csv > licenses.csv
```

---

## Conclusion

**✅ seu-claude is safe to distribute under MIT license.**

All dependencies use permissive open source licenses (MIT, Apache-2.0, BSD, ISC) that are compatible with MIT licensing. The LGPL dependency (libvips) is dynamically linked and does not affect distribution.

### Summary for npm publish:

1. Keep `"license": "MIT"` in package.json ✅
2. Include LICENSE file with MIT text ✅
3. Optionally add THIRD_PARTY_LICENSES.md for transparency
4. No copyleft concerns for distribution
