# 02: Version the audio bucket

**What to build:** Apply ADR-0010 in `../cannyboiz-devops-hub/terraform/ez-dk-citizen/s3.tf`: switch `aws_s3_bucket_versioning` from `Suspended` to `Enabled`, and add a lifecycle rule that expires noncurrent versions and expired delete markers after 30 days. The role keeps no `s3:DeleteObjectVersion`.

**Blocked by:** none

**Status:** ready-for-human

**Acceptance criteria:**

- [ ] A reviewed Terraform plan changes only versioning and the lifecycle rule; it is applied with approval.
- [ ] The live S3 tracer still passes: uploads succeed with `If-None-Match: *`, and overwriting a live object is still refused.
- [ ] After a tracer delete, the object's earlier version is still listed until the lifecycle rule removes it.
