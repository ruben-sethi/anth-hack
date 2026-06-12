"""Loaders for the GSE218989 (training) and GSE207422 (validation) cohorts.

Each loader returns a GEODataset: an immutable record containing aligned
numpy arrays for TPM expression, gene names, sample identifiers, and binary
response labels (1 = responder, 0 = non-responder).
"""

from __future__ import annotations

import gzip
from dataclasses import dataclass
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class GEODataset:
    """Aligned arrays for one GEO RNA-seq cohort.

    Arrays are parallel along axis-0 (sample axis).

    Attributes
    ----------
    geo_id:
        GEO series accession string (e.g. ``"GSE218989"``).
    tpm:
        float32 array, shape ``(n_samples, n_genes)``. Raw TPM values
        exactly as deposited — apply ``log2(tpm + 1)`` before modelling.
    gene_names:
        object array, shape ``(n_genes,)``. HGNC gene symbols.
    sample_ids:
        object array, shape ``(n_samples,)``. GEO sample titles.
    labels:
        int8 array, shape ``(n_samples,)``. 1 = responder, 0 = non-responder.
    label_str:
        object array, shape ``(n_samples,)``. Human-readable label strings.
    """

    geo_id: str
    tpm: np.ndarray
    gene_names: np.ndarray
    sample_ids: np.ndarray
    labels: np.ndarray
    label_str: np.ndarray

    def __post_init__(self) -> None:
        n = len(self.sample_ids)
        assert self.tpm.shape == (n, len(self.gene_names)), (
            f"tpm shape {self.tpm.shape} inconsistent with "
            f"{n} samples × {len(self.gene_names)} genes"
        )
        assert self.labels.shape == (n,)
        assert self.label_str.shape == (n,)

    @property
    def n_samples(self) -> int:
        return len(self.sample_ids)

    @property
    def n_genes(self) -> int:
        return len(self.gene_names)

    @property
    def n_responders(self) -> int:
        return int((self.labels == 1).sum())

    @property
    def n_nonresponders(self) -> int:
        return int((self.labels == 0).sum())


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_soft_row(line: str) -> tuple[str, list[str]]:
    """Split a SOFT-format tab-separated row into (key, [values])."""
    parts = line.rstrip("\n").split("\t")
    key = parts[0]
    vals = [v.strip('"') for v in parts[1:]]
    return key, vals


def _load_tpm_gz(path: Path) -> tuple[np.ndarray, list[str], list[str]]:
    """Load a gzipped tab-separated TPM matrix.

    Returns
    -------
    tpm : ndarray, shape (n_samples, n_genes), float32
    gene_names : list[str]
    sample_ids : list[str]
    """
    with gzip.open(path, "rt") as fh:
        header = fh.readline().rstrip("\n").split("\t")
        sample_ids = header[1:]  # first column is gene name
        rows: list[list[float]] = []
        gene_names: list[str] = []
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            gene_names.append(parts[0])
            rows.append([float(v) for v in parts[1:]])

    # rows is (n_genes, n_samples); transpose to (n_samples, n_genes)
    tpm = np.array(rows, dtype=np.float32).T
    return tpm, gene_names, sample_ids


# ---------------------------------------------------------------------------
# GSE218989 — training cohort (355 NSCLC patients, PD-1/PD-L1 inhibitors)
# ---------------------------------------------------------------------------

def _parse_gse218989_labels(meta_path: Path) -> dict[str, str]:
    """Return {sample_title: outcome_string} from the SOFT metadata file."""
    titles: list[str] = []
    outcomes: list[str] = []

    with gzip.open(meta_path, "rt") as fh:
        for line in fh:
            key, vals = _parse_soft_row(line)
            if key == "!Sample_title":
                titles = vals
            elif key == "!Sample_characteristics_ch1":
                # Multiple characteristic rows exist; find the treatment outcome row
                if any(v.startswith("treatment outcome:") for v in vals):
                    outcomes = [
                        v.split(":", 1)[1].strip() if v.startswith("treatment outcome:") else ""
                        for v in vals
                    ]

    return dict(zip(titles, outcomes))


def load_gse218989(data_dir: str | Path) -> GEODataset:
    """Load the GSE218989 training cohort.

    Parameters
    ----------
    data_dir:
        Directory containing ``GSE218989_TPM.txt.gz`` and
        ``GSE218989_metadata.txt.gz``.

    Returns
    -------
    GEODataset
        355 samples × 19 911 genes (raw TPM, float32).
    """
    data_dir = Path(data_dir)
    tpm, gene_names, sample_ids = _load_tpm_gz(data_dir / "GSE218989_TPM.txt.gz")

    label_map = _parse_gse218989_labels(data_dir / "GSE218989_metadata.txt.gz")

    label_str = np.array(
        [label_map.get(sid, "") for sid in sample_ids], dtype=object
    )
    labels = np.where(label_str == "Responder", 1, 0).astype(np.int8)

    return GEODataset(
        geo_id="GSE218989",
        tpm=tpm,
        gene_names=np.array(gene_names, dtype=object),
        sample_ids=np.array(sample_ids, dtype=object),
        labels=labels,
        label_str=label_str,
    )


# ---------------------------------------------------------------------------
# GSE207422 — external validation cohort (24 NSCLC patients, PD-1 + chemo)
# ---------------------------------------------------------------------------

def _parse_gse207422_labels(meta_path: Path) -> dict[str, str]:
    """Return {sample_title: 'Responder'|'Non-responder'|''}.

    Only bulk RNA-seq pre-treatment samples (title starts with 'R') are
    returned; scRNA-seq samples (title starts with 'BD_immune') are excluded.

    MPR and MPR (pCR) are mapped to 'Responder'; NMPR to 'Non-responder';
    'Not available' to '' (excluded from labelled set but kept in the array).
    """
    _RESPONSE_MAP = {
        "MPR": "Responder",
        "MPR (pCR)": "Responder",
        "NMPR": "Non-responder",
        "Not available": "",
    }

    titles: list[str] = []
    char_rows: list[list[str]] = []

    with gzip.open(meta_path, "rt") as fh:
        for line in fh:
            key, vals = _parse_soft_row(line)
            if key == "!Sample_title":
                titles = vals
            elif key == "!Sample_characteristics_ch1":
                char_rows.append(vals)

    # Each char_rows[i] is a list of n_samples values for that characteristic.
    # Find the row that contains pathologic_response.
    path_row: list[str] = []
    for row in char_rows:
        if any(v.startswith("pathologic_response:") for v in row):
            path_row = row
            break

    result: dict[str, str] = {}
    for title, path_val in zip(titles, path_row):
        if not title.startswith("R"):  # skip scRNA-seq (BD_immune*) samples
            continue
        raw = path_val.split(":", 1)[1].strip() if ":" in path_val else ""
        result[title] = _RESPONSE_MAP.get(raw, "")

    return result


def load_gse207422(data_dir: str | Path) -> GEODataset:
    """Load the GSE207422 external validation cohort.

    Only the 24 bulk RNA-seq pre-treatment biopsy samples are included
    (sample titles matching the ``R*`` pattern). scRNA-seq samples
    (``BD_immune*``) are absent from the TPM matrix and ignored.

    Parameters
    ----------
    data_dir:
        Directory containing ``GSE207422_TPM.txt.gz`` and
        ``GSE207422_metadata.txt.gz``.

    Returns
    -------
    GEODataset
        24 samples × 58 387 genes (raw TPM, float32).
    """
    data_dir = Path(data_dir)
    tpm, gene_names, sample_ids = _load_tpm_gz(data_dir / "GSE207422_TPM.txt.gz")

    label_map = _parse_gse207422_labels(data_dir / "GSE207422_metadata.txt.gz")

    label_str = np.array(
        [label_map.get(sid, "") for sid in sample_ids], dtype=object
    )
    labels = np.where(label_str == "Responder", 1, 0).astype(np.int8)

    return GEODataset(
        geo_id="GSE207422",
        tpm=tpm,
        gene_names=np.array(gene_names, dtype=object),
        sample_ids=np.array(sample_ids, dtype=object),
        labels=labels,
        label_str=label_str,
    )
