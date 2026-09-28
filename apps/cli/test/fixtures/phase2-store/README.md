# Synthetic phase-2 import directory (store version 1)

Hand-built in the shape `leap generate` and `leap review` wrote in phase 2: `import.json` has no
`storeVersion`, the revision carries the engine fingerprint stamped when it was produced, and there are
no build records. `acceptances.jsonl` ends with a crash-truncated fragment on purpose, so a test can
prove phase-3 commands never repair (write) a legacy ledger. The `.h5p` bytes are a placeholder, not a
package. Tests copy this directory to a temporary `phase2-store/` and compare a hash of the whole tree
before and after.
