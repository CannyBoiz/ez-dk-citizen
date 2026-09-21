# Use IAM Roles Anywhere for the external BFF workload

The BFF, intended for deployment on Hetzner, authenticates to S3 through IAM
Roles Anywhere instead of a permanent IAM-user access key. A dedicated private
CA, the exact Trust Anchor, and workload certificate CN `aws-iam-app` constrain
the role; the official signing helper runs as `credential_process` inside a
glibc-compatible BFF image while the AWS SDK refreshes temporary credentials
through its normal provider chain. A credential sidecar and custom refresh code
were rejected as unnecessary for this single-workload PoC, and only the public
CA certificate is committed while all private keys remain external to
Terraform and the images.
The helper is pinned and checksum-verified, runtime identity files are mounted
read-only only into the BFF, and legacy access-key environment variables are
rejected at startup. The PoC has no CRL: compromise response disables the
profile, replaces the key and certificate with a new certificate identity, and
updates the trust-policy constraint before access is restored; rotating the
dedicated CA remains the fallback.

The cutover is first proven with the production-like BFF container running
locally against live S3 because no repository-driven VPS deployment exists yet.
The manually managed Hetzner server is reconciled separately during Stage 6.
