# Evidence store

The evidence store owns immutable, content-addressed blobs and atomic attempt
manifests. It is deliberately filesystem-only: database state may point at an
evidence digest, but it cannot make missing or changed evidence valid.

The store root and all directories are private to the current user. Blob and
manifest files are mode `0600`; symlinks and non-owned paths are rejected.
