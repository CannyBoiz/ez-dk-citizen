# Use AWS S3 for PoC object storage

The PoC stores audio in AWS S3 in `eu-north-1`, matching the bucket and IAM
resources already maintained in the infrastructure repository. Azure Blob
Storage was rejected because supporting or switching providers adds work
without improving the PoC success path.
