# Benchmark Methodology

## Overview

The seu-claude benchmark framework provides industrial-grade evaluation with PhD-level statistical rigor. This document describes the methodology used for all benchmark suites.

## Design Principles

1. **Language Agnostic** - Works with any language supported by Tree-sitter
2. **Large Codebase Ready** - Tested on codebases up to 1.5M+ lines of code
3. **Statistically Rigorous** - Proper significance testing and effect sizes
4. **Reproducible** - Deterministic seeds and versioned datasets
5. **Comparative** - Baseline comparisons for context

## Benchmark Suites

### 1. Code Understanding Suite

**Purpose:** Evaluates symbol resolution and call graph accuracy.

**Test Cases:**

- Symbol lookup by name
- Find all callers of a function
- Find all callees of a function
- Class hierarchy resolution
- Cross-file reference tracking

**Metrics:**
| Metric | Description | Formula |
|--------|-------------|---------|
| Precision@K | Correct items in top K | TP@K / K |
| Recall | Found vs expected | TP / (TP + FN) |
| F1 Score | Harmonic mean | 2 × P × R / (P + R) |
| MRR | Mean Reciprocal Rank | 1/N × Σ(1/rank) |

### 2. Dependency Analysis Suite

**Purpose:** Evaluates import resolution and dependency graph accuracy.

**Test Cases:**

- Relative imports (`./`, `../`)
- Absolute imports (`@org/package`)
- Dynamic imports
- Conditional imports
- Re-exports and barrel files
- Circular dependency detection

**Metrics:**
| Metric | Description |
|--------|-------------|
| Resolution Accuracy | Correct import paths resolved |
| Circular Detection Rate | True positive rate for cycles |
| Graph Completeness | Edges found vs ground truth |
| Build Time | Time to construct full graph |

## Statistical Methods

### Bootstrap Confidence Intervals

For all metrics, we compute 95% confidence intervals using bootstrap sampling:

```
1. Draw B bootstrap samples (default: 1000)
2. Compute metric for each sample
3. Take 2.5th and 97.5th percentiles
```

### Significance Testing

We use the **Mann-Whitney U test** (non-parametric) for comparing two systems:

- Does not assume normality
- Robust to outliers
- Compares rank distributions

Significance threshold: p < 0.05

### Effect Size

**Cohen's d** measures practical significance:

|           | d          |     | Interpretation |
| --------- | ---------- | --- | -------------- |
| < 0.2     | Negligible |
| 0.2 - 0.5 | Small      |
| 0.5 - 0.8 | Medium     |
| > 0.8     | Large      |

## Baseline Comparisons

### NaiveGrepBaseline

Simple pattern-matching baseline:

- Uses grep for symbol search
- Regex-based import detection
- No semantic understanding

Provides lower bound for comparison.

### CtrlFlowBaseline (Planned)

Traditional static analysis baseline:

- Control flow analysis
- Data flow analysis
- Standard compiler techniques

## Reproducibility

### Random Seeds

All randomized operations use deterministic seeds:

```typescript
const runner = new BenchmarkRunner({
  seed: 42, // Reproducible results
});
```

### Dataset Versioning

Datasets include version metadata:

```json
{
  "version": "1.0.0",
  "created": "2024-01-27",
  "files": 1523,
  "linesOfCode": 523847
}
```

### Environment Recording

Reports include:

- Node.js version
- OS and architecture
- Git commit hash
- Dependency versions

## Reporting

### JSON Format

Machine-readable for CI/CD integration.

### HTML Format

Interactive dashboard with visualizations.

### LaTeX Format

Publication-ready tables for papers.

### Markdown Format

GitHub-friendly summary.

## Running Benchmarks

```bash
# Run all suites
/bench run --all

# Run specific suite
/bench run code-understanding

# Compare with baseline
/bench compare naive-grep

# Generate report
/bench report --format=html
```

## References

1. Voorhees, E. M. "The TREC-8 Question Answering Track Report" (1999)
2. Manning, C. D. et al. "Introduction to Information Retrieval" (2008)
3. Cohen, J. "Statistical Power Analysis for the Behavioral Sciences" (1988)
4. Efron, B. & Tibshirani, R. J. "An Introduction to the Bootstrap" (1993)
