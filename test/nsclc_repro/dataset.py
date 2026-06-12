import numpy as np

class ExpressionDataset:
    def __init__(self, expression_matrix: np.ndarray, gene_names: np.ndarray, sample_names: np.ndarray, outcomes: np.ndarray):
        """
        Core data structure for gene expression data.
        
        Args:
            expression_matrix: 2D numpy array of shape (genes, samples)
            gene_names: 1D numpy array of shape (genes,) containing gene names (str)
            sample_names: 1D numpy array of shape (samples,) containing sample names/IDs (str)
            outcomes: 1D numpy array of shape (samples,) containing binary outcomes (1 for Responder, 0 for Non-responder)
        """
        self.expression_matrix = np.asarray(expression_matrix, dtype=np.float64)
        self.gene_names = np.asarray(gene_names, dtype=str)
        self.sample_names = np.asarray(sample_names, dtype=str)
        self.outcomes = np.asarray(outcomes, dtype=np.int32)
        
        # Validation of dimensions
        if self.expression_matrix.ndim != 2:
            raise ValueError(f"expression_matrix must be a 2D array, got shape {self.expression_matrix.shape}")
        if self.expression_matrix.shape[0] != len(self.gene_names):
            raise ValueError(
                f"Number of genes in expression matrix ({self.expression_matrix.shape[0]}) "
                f"does not match length of gene_names ({len(self.gene_names)})"
            )
        if self.expression_matrix.shape[1] != len(self.sample_names):
            raise ValueError(
                f"Number of samples in expression matrix ({self.expression_matrix.shape[1]}) "
                f"does not match length of sample_names ({len(self.sample_names)})"
            )
        if len(self.sample_names) != len(self.outcomes):
            raise ValueError(
                f"Length of sample_names ({len(self.sample_names)}) "
                f"does not match length of outcomes ({len(self.outcomes)})"
            )

    @property
    def num_genes(self) -> int:
        return len(self.gene_names)

    @property
    def num_samples(self) -> int:
        return len(self.sample_names)

    def log2_transform(self) -> 'ExpressionDataset':
        """Applies a log2(TPM + 1) transformation to the expression matrix."""
        transformed_matrix = np.log2(self.expression_matrix + 1.0)
        return ExpressionDataset(transformed_matrix, self.gene_names, self.sample_names, self.outcomes)

    def subset_genes(self, gene_mask: np.ndarray) -> 'ExpressionDataset':
        """Subsets the dataset to a specific set of genes (boolean mask or index array)."""
        return ExpressionDataset(
            self.expression_matrix[gene_mask, :],
            self.gene_names[gene_mask],
            self.sample_names,
            self.outcomes
        )

    def subset_samples(self, sample_mask: np.ndarray) -> 'ExpressionDataset':
        """Subsets the dataset to a specific set of samples (boolean mask or index array)."""
        return ExpressionDataset(
            self.expression_matrix[:, sample_mask],
            self.gene_names,
            self.sample_names[sample_mask],
            self.outcomes[sample_mask]
        )
