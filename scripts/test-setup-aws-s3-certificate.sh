#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d)
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/repo/scripts" "$test_root/repo/extra-files/aws/roles-anywhere" "$test_root/bin"
cp "$repo_root/scripts/setup-aws-s3.sh" "$test_root/repo/scripts/"
cp "$repo_root/extra-files/aws/roles-anywhere/config.example" "$test_root/repo/extra-files/aws/roles-anywhere/"
printf '.env\nruntime/\n' > "$test_root/repo/.gitignore"
git -C "$test_root/repo" init --quiet

cat > "$test_root/bin/node" <<'EOF'
#!/usr/bin/env bash
[[ "$1" == scripts/test-roles-anywhere-container.mjs && "$2" == --preflight ]]
EOF
chmod +x "$test_root/bin/node"

for name in aws-iam-app aws-iam-app-replacement; do
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
    -subj "/CN=$name" -keyout "$test_root/$name.key" \
    -out "$test_root/$name.crt" >/dev/null 2>&1
  chmod 0600 "$test_root/$name.key"
done

run_setup() {
  local name=$1 expected_cn=${2-}
  env -i \
    PATH="$test_root/bin:$PATH" \
    AWS_REGION=eu-north-1 S3_BUCKET=test-bucket \
    AWS_ROLES_ANYWHERE_CONFIG_FILE="$test_root/repo/runtime/aws/config" \
    AWS_ROLES_ANYWHERE_CERTIFICATE_FILE="$test_root/$name.crt" \
    AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE="$test_root/$name.key" \
    AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE="$test_root/$name.crt" \
    AWS_ROLES_ANYWHERE_EXPECTED_CERTIFICATE_CN="$expected_cn" \
    ROLES_ANYWHERE_TRUST_ANCHOR_ARN=arn:aws:rolesanywhere:eu-north-1:123456789012:trust-anchor/1234abcd \
    ROLES_ANYWHERE_PROFILE_ARN=arn:aws:rolesanywhere:eu-north-1:123456789012:profile/1234abcd \
    ROLES_ANYWHERE_ROLE_ARN=arn:aws:iam::123456789012:role/ez-dk-citizen-role-anywhere-s3 \
    bash "$test_root/repo/scripts/setup-aws-s3.sh" --preflight
}

run_setup aws-iam-app > "$test_root/output" 2>&1 || { cat "$test_root/output"; exit 1; }
if run_setup aws-iam-app-replacement > "$test_root/output" 2>&1; then
  printf 'Replacement CN unexpectedly passed the routine check.\n' >&2
  exit 1
fi
[[ "$(<"$test_root/output")" == *"Workload certificate CN must be aws-iam-app;"* ]] || {
  cat "$test_root/output"
  exit 1
}
run_setup aws-iam-app-replacement aws-iam-app-replacement > "$test_root/output" 2>&1 || { cat "$test_root/output"; exit 1; }
if run_setup aws-iam-app aws-iam-app-replacement > "$test_root/output" 2>&1; then
  printf 'Current CN unexpectedly passed the replacement check.\n' >&2
  exit 1
fi
[[ "$(<"$test_root/output")" == *"Workload certificate CN must be aws-iam-app-replacement;"* ]] || {
  cat "$test_root/output"
  exit 1
}
printf 'Setup certificate identity checks passed.\n'
