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

The operator setup script prepares or validates the shared profile from the
Trust Anchor, Roles Anywhere profile, and role ARNs. It verifies the workload
certificate subject and CA chain, private-key mode, production-like image,
read-only mounts, non-root key access, and same-container assumed-role identity.
It does not request or persist AWS access keys or temporary credentials. Routine
certificate rotation is scheduled at least 30 days before expiry and keeps the
trusted identity unchanged; compromise response uses a new certificate
identity. A preflight mode validates the replacement while the Roles Anywhere
profile is disabled and the operator inspects the updated role trust policy;
the full identity exchange runs immediately after the profile is re-enabled.

The cutover is first proven with the production-like BFF container running
locally against live S3 because no repository-driven VPS deployment exists yet.
The manually managed Hetzner server is reconciled separately during Stage 6.
The legacy workload IAM user had no access keys and was retired after fresh
keyless identity and S3 proof plus approval of the exact destroy plan, without
an idle observation delay. If the Roles Anywhere path fails, S3-dependent
requests fail until that path is repaired and reverified; creating an IAM-user
key is not a planned fallback.
For this PoC, that temporary loss of S3 availability is preferable to
reintroducing a long-lived workload credential.
