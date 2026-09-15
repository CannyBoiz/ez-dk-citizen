# 01 — Secure the private S3 boundary

**What to build:** Make the existing application bucket a private, narrowly
authorized object boundary that supports conditional browser uploads and
temporary playback without exposing unrelated storage access. The resulting
Terraform plan must preserve the existing bucket and IAM identity while making
the Stage 3 access rules explicit and reviewable.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Keep AWS S3 in `eu-north-1` and evolve the existing bucket and dedicated application IAM user in place rather than replacing them.
- [ ] Block all forms of public bucket and object access explicitly.
- [ ] Allow browser CORS only from the explicit local Admin origin and an optional explicit production Admin origin; do not use a wildcard origin.
- [ ] Limit browser CORS to conditional PUT uploads and only the request headers needed by the signed upload contract.
- [ ] Add a bucket policy that rejects object writes unless `If-None-Match` is present, so an existing generated key cannot be overwritten.
- [ ] Restrict the application IAM policy to GetObject, PutObject, and DeleteObject for only the `audio/` and `smoke/` prefixes in this bucket.
- [ ] Do not grant bucket listing, bucket administration, unrelated AWS permissions, or access to other buckets.
- [ ] Keep S3 bucket versioning disabled for the PoC.
- [ ] Do not create IAM access keys or place secret values in Terraform configuration, state outputs, source control, or logs.
- [ ] Format and validate the Terraform configuration and inspect a plan showing the public-access block, CORS policy, conditional-write policy, and narrowed IAM resources without destroying or replacing the bucket.

