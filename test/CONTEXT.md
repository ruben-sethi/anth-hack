# CONTEXT — biorepro

Reproduction of the ML analysis in:

> Mubarak R, Anik FI, Rodriguez JT, Sakib N, Rahman MA.
> *Unpacking Genomic Biomarkers for Programmed Cell Death Receptor-1
> Immunotherapy Success in Non–Small Cell Lung Cancer Using Deep Neural
> Networks: Quantitative Study.*
> JMIR Bioinform Biotech 2026;7:e70553. doi:10.2196/70553

The paper identifies RNA-seq biomarkers for PD-1 immunotherapy response in
NSCLC using differential expression (LIMMA), permutation-based feature
selection, and a DNN called DeepImmunoGene.

---

## Repository layout

```
/data/biorepro/
├── CONTEXT.md               ← this file
├── data/                    ← raw GEO downloads (do not modify)
│   ├── GSE218989_TPM.txt.gz       training cohort TPM matrix
│   ├── GSE218989_metadata.txt.gz  training cohort SOFT metadata
│   ├── GSE207422_TPM.txt.gz       validation cohort TPM matrix
│   └── GSE207422_metadata.txt.gz  validation cohort SOFT metadata
├── input/                   ← reference documents
│   └── paper_text.txt             full text of the paper (plain text)
├── nsclc_repro/             ← scratch / earlier prototype
│   ├── dataset.py                 ExpressionDataset class (genes×samples layout)
│   └── nsclc-repro-paper-2026.pdf paper PDF
└── biorepro/                ← main Python package (Poetry)
    ├── pyproject.toml
    ├── src/biorepro/
    │   ├── __init__.py
    │   └── data.py          ← GEODataset dataclass + loaders
    ├── notebooks/
    │   └── 01_data_qc.ipynb ← data loading + paper statistics QC
    └── tests/
```

---

## Data

### GSE218989 — training cohort
| Property | Value |
|----------|-------|
| GEO accession | GSE218989 |
| Samples | 355 NSCLC patients |
| Responders | 168 |
| Non-responders | 187 |
| Genes in deposit | 19 916 (paper reports 19 911; 5-row discrepancy) |
| Expression units | TPM (already normalised in deposit) |
| Response label | `!Sample_characteristics_ch1` → `treatment outcome: Responder / Non-responder` |
| Sample IDs | `SMC__PatN` pattern |
| Treatment | PD-1 / PD-L1 inhibitor monotherapy |

### GSE207422 — external validation cohort
| Property | Value |
|----------|-------|
| GEO accession | GSE207422 |
| Samples in TPM | 24 bulk RNA-seq pre-treatment biopsies (`R*LR*` IDs) |
| Responders | 9 (MPR + MPR pCR) |
| Non-responders | 15 (NMPR) |
| Genes | 58 387 |
| Expression units | TPM |
| Response label | `pathologic_response` characteristic: MPR/MPR(pCR)→Responder, NMPR→Non-responder |
| Treatment | PD-1 inhibitor + chemotherapy (neoadjuvant) |

> **Paper vs deposit discrepancy (GSE207422):** The paper claims 17 responders
> and 7 non-responders. The deposited metadata maps to 9 responders and 15
> non-responders using the MPR/NMPR classification. The source of this
> discrepancy is unknown; the deposit is used as ground truth.

The dataset also contains 15 scRNA-seq samples (`BD_immune*`) which are absent
from the bulk TPM matrix and are ignored by the loader.

---

## Python package — `biorepro`

**`src/biorepro/data.py`** — the only implemented module so far.

### `GEODataset` (frozen dataclass)
Aligned numpy arrays for one cohort. All arrays share axis-0 = samples.

| Field | dtype | shape | Description |
|-------|-------|-------|-------------|
| `geo_id` | `str` | — | GEO accession |
| `tpm` | `float32` | `(n_samples, n_genes)` | Raw TPM values |
| `gene_names` | `object` | `(n_genes,)` | HGNC symbols |
| `sample_ids` | `object` | `(n_samples,)` | GEO sample titles |
| `labels` | `int8` | `(n_samples,)` | 1=responder, 0=non-responder |
| `label_str` | `object` | `(n_samples,)` | `"Responder"` / `"Non-responder"` |

Properties: `n_samples`, `n_genes`, `n_responders`, `n_nonresponders`.

### Loaders
```python
from biorepro.data import load_gse218989, load_gse207422
ds_train = load_gse218989("/data/biorepro/data")
ds_val   = load_gse207422("/data/biorepro/data")
```

Apply `log2(tpm + 1)` before modelling (paper preprocessing).

---

## Paper pipeline (to reproduce)

1. **DEG identification** — LIMMA on GSE218989 (p < 0.05) → 1 093 DEGs
   (522 upregulated in responders, 571 in non-responders)
2. **Baseline models** — SVM and XGBoost on 1 093 DEGs
   (SVM: acc=0.68 AUC=0.76; XGBoost: acc=0.72 AUC=0.77)
3. **DNN** on 1 093 DEGs (acc=0.82, AUC=0.90, recall=0.85)
4. **Permutation importance** (4 × 50 iterations) on DNN → 98 key genes
5. **DeepImmunoGene** — DNN retrained on 98 genes
   (acc=0.87, AUC=0.95, recall=0.87, specificity=0.89)
6. **Biomarker stratification** — 36 genes upregulated in responders,
   62 in non-responders; top 10 each reported
7. **External validation** — violin plots on GSE207422 subset of top genes;
   Mann-Whitney U test; partial agreement found

### Top biomarkers (from paper)
Responders (top 10): GSTT2B, HMGA2, AC135050.2, ANKRD33B, MMP13, PLA2G2D,
RASGEF1A, BIRC7, DCAF4L2, CHMP7

Non-responders (top 10): SPINK1, FEZF1, THBS4, BEST3, TESC, C6orf226,
TSSK2, SFRP2, C1GALT1C1L, RARRES1

### DNN architecture
Input=256 → Hidden=[128, 100, 100] → Output=1
Activation: ELU, Optimizer: Adam, Loss: binary cross-entropy
Training: 100 epochs max, early stopping on val loss, batch size=100
Train/val/test split: 80 / 10 / 10 (284 train, 71 test from 355 total)

---

## Notes on `nsclc_repro/`

Contains an earlier `ExpressionDataset` class (genes × samples layout,
float64). Not used by the main `biorepro` package but kept as reference.
The `biorepro.data.GEODataset` uses samples × genes layout (conventional
for ML) and float32.
