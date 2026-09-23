#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

fail() { printf 'Error: %s\n' "$1" >&2; exit 1; }

case "${1:-}" in
  "") PREFLIGHT_ONLY=false ;;
  --preflight) PREFLIGHT_ONLY=true ;;
  *) fail 'Usage: scripts/setup-aws-s3.sh [--preflight]' ;;
esac

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$REPO_ROOT" "$1" ;;
  esac
}

AWS_ROLES_ANYWHERE_CONFIG_FILE=$(resolve_path "${AWS_ROLES_ANYWHERE_CONFIG_FILE:-runtime/aws/config}")
AWS_ROLES_ANYWHERE_CERTIFICATE_FILE=$(resolve_path "${AWS_ROLES_ANYWHERE_CERTIFICATE_FILE:-runtime/aws/workload.crt}")
AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE=$(resolve_path "${AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE:-runtime/aws/workload.key}")
AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE=$(resolve_path "${AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE:-../cannyboiz-devops-hub/terraform/ez-dk-citizen/certs/ca.crt}")
export AWS_ROLES_ANYWHERE_CONFIG_FILE AWS_ROLES_ANYWHERE_CERTIFICATE_FILE AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE

assert_runtime_file_ignored() {
  local file="$1" relative
  case "$file" in
    "$REPO_ROOT"/*)
      relative="${file#"$REPO_ROOT/"}"
      git check-ignore -q -- "$relative" || fail "Runtime identity files must be Git-ignored: $relative"
      ;;
  esac
}

for file in "$AWS_ROLES_ANYWHERE_CONFIG_FILE" "$AWS_ROLES_ANYWHERE_CERTIFICATE_FILE" "$AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE"; do
  assert_runtime_file_ignored "$file"
done

[[ -f "$AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE" && -r "$AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE" ]] || fail "Dedicated CA public certificate is missing or unreadable: $AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE"
[[ -f "$AWS_ROLES_ANYWHERE_CERTIFICATE_FILE" && -r "$AWS_ROLES_ANYWHERE_CERTIFICATE_FILE" ]] || fail "Workload certificate is missing or unreadable: $AWS_ROLES_ANYWHERE_CERTIFICATE_FILE"
[[ -f "$AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE" && -r "$AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE" ]] || fail "Workload private key is missing or unreadable: $AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE"

key_mode=$(stat -c '%a' -- "$AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE" 2>/dev/null || stat -f '%Lp' "$AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE" 2>/dev/null) || fail "Could not inspect workload private-key permissions."
[[ "$key_mode" == "600" ]] || fail "Workload private key must have mode 0600; found $key_mode: $AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE"

subject=$(openssl x509 -in "$AWS_ROLES_ANYWHERE_CERTIFICATE_FILE" -noout -subject -nameopt RFC2253) || fail "Could not read the workload certificate: $AWS_ROLES_ANYWHERE_CERTIFICATE_FILE"
subject=${subject#subject=}
[[ "$subject" =~ (^|,)CN=aws-iam-app(,|$) ]] || fail "Workload certificate subject must contain CN=aws-iam-app; found $subject"
openssl verify -CAfile "$AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE" "$AWS_ROLES_ANYWHERE_CERTIFICATE_FILE" >/dev/null || fail "Workload certificate does not chain to the dedicated CA certificate: $AWS_ROLES_ANYWHERE_CA_CERTIFICATE_FILE"
expires=$(openssl x509 -in "$AWS_ROLES_ANYWHERE_CERTIFICATE_FILE" -noout -enddate | cut -d= -f2-) || fail "Could not read workload certificate expiry."
printf 'Certificate subject: %s\nCertificate expires: %s\nPrivate-key mode: 0600\n' "$subject" "$expires"
if ! openssl x509 -in "$AWS_ROLES_ANYWHERE_CERTIFICATE_FILE" -noout -checkend 2592000 >/dev/null; then
  printf 'Warning: workload certificate expires within 30 days; schedule routine rotation.\n' >&2
fi

ENV_FILE="$REPO_ROOT/.env"
if [[ -f "$ENV_FILE" ]] && grep -Eq '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)=' "$ENV_FILE"; then
  fail "Remove legacy AWS access-key variables from .env before continuing; this workflow never reads or stores them."
fi

read_env() {
  [[ -f "$ENV_FILE" ]] || return 0
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); value = $0 } END { print value }' "$ENV_FILE"
}

prompt_value() {
  local name="$1" label="$2" default="$3" input
  [[ -n "${!name:-}" ]] && return
  if [[ ! -t 0 ]]; then
    [[ -n "$default" ]] || fail "Set $name before running this non-interactively."
    printf -v "$name" '%s' "$default"
    return
  fi
  if [[ -n "$default" ]]; then
    read -r -p "$label [$default]: " input || true
    input=${input:-$default}
  else
    read -r -p "$label: " input || true
  fi
  [[ -n "$input" ]] || fail "$name is required."
  printf -v "$name" '%s' "$input"
}

AWS_REGION=${AWS_REGION:-$(read_env AWS_REGION)}
S3_BUCKET=${S3_BUCKET:-$(read_env S3_BUCKET)}
prompt_value AWS_REGION 'AWS region' 'eu-north-1'
prompt_value S3_BUCKET 'S3 bucket' 'ez-dk-citizen-audio'
[[ "$AWS_REGION" =~ ^[a-z0-9-]+$ ]] || fail "AWS_REGION contains unsupported characters."
[[ "$S3_BUCKET" =~ ^[a-z0-9.-]+$ ]] || fail "S3_BUCKET contains unsupported characters."
export AWS_REGION S3_BUCKET

valid_trust_anchor() { [[ "$1" =~ ^arn:aws:rolesanywhere:[a-z0-9-]+:[0-9]{12}:trust-anchor/[A-Fa-f0-9-]+$ ]]; }
valid_profile() { [[ "$1" =~ ^arn:aws:rolesanywhere:[a-z0-9-]+:[0-9]{12}:profile/[A-Fa-f0-9-]+$ ]]; }
valid_role() { [[ "$1" =~ ^arn:aws:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]+$ ]]; }

profile_property() {
  awk -v section='[profile roles-anywhere]' -v property="$1" '
    /^\[/ { active = ($0 == section); next }
    active && $0 ~ "^[[:space:]]*" property "[[:space:]]*=" {
      sub(/^[^=]*=[[:space:]]*/, ""); print; exit
    }
  ' "$AWS_ROLES_ANYWHERE_CONFIG_FILE"
}

validate_profile_arns() {
  valid_trust_anchor "$1" || fail "Roles Anywhere Trust Anchor ARN is missing or invalid."
  valid_profile "$2" || fail "Roles Anywhere profile ARN is missing or invalid."
  valid_role "$3" || fail "IAM role ARN is missing or invalid."
}

expected_process() {
  printf '/usr/local/bin/aws_signing_helper credential-process --certificate /run/ez-dk-citizen/identity/workload.crt --private-key /run/ez-dk-citizen/identity/workload.key --trust-anchor-arn %s --profile-arn %s --role-arn %s' "$1" "$2" "$3"
}

mkdir -p "$(dirname "$AWS_ROLES_ANYWHERE_CONFIG_FILE")"
assert_runtime_file_ignored "$AWS_ROLES_ANYWHERE_CONFIG_FILE"
if [[ -f "$AWS_ROLES_ANYWHERE_CONFIG_FILE" ]]; then
  config_region=$(profile_property region)
  credential_process=$(profile_property credential_process)
  [[ "$config_region" == "$AWS_REGION" ]] || fail "Shared profile region does not match AWS_REGION; review $AWS_ROLES_ANYWHERE_CONFIG_FILE."
  [[ -n "$credential_process" ]] || fail "Shared profile is missing credential_process: $AWS_ROLES_ANYWHERE_CONFIG_FILE"
  [[ "$credential_process" =~ --trust-anchor-arn[[:space:]]+([^[:space:]]+) ]] || fail "Shared profile is missing its Trust Anchor ARN."
  trust_anchor_arn=${BASH_REMATCH[1]}
  [[ "$credential_process" =~ --profile-arn[[:space:]]+([^[:space:]]+) ]] || fail "Shared profile is missing its Roles Anywhere profile ARN."
  profile_arn=${BASH_REMATCH[1]}
  [[ "$credential_process" =~ --role-arn[[:space:]]+([^[:space:]]+) ]] || fail "Shared profile is missing its IAM role ARN."
  role_arn=${BASH_REMATCH[1]}
  validate_profile_arns "$trust_anchor_arn" "$profile_arn" "$role_arn"
  [[ "$credential_process" == "$(expected_process "$trust_anchor_arn" "$profile_arn" "$role_arn")" ]] || fail "Shared profile must use the pinned helper and configured read-only identity mount paths."
  printf 'Shared AWS profile validated.\n'
else
  TRUST_ANCHOR_ARN=${ROLES_ANYWHERE_TRUST_ANCHOR_ARN:-}
  PROFILE_ARN=${ROLES_ANYWHERE_PROFILE_ARN:-}
  ROLE_ARN=${ROLES_ANYWHERE_ROLE_ARN:-}
  prompt_value TRUST_ANCHOR_ARN 'Roles Anywhere Trust Anchor ARN' ''
  prompt_value PROFILE_ARN 'Roles Anywhere profile ARN' ''
  prompt_value ROLE_ARN 'IAM role ARN' ''
  validate_profile_arns "$TRUST_ANCHOR_ARN" "$PROFILE_ARN" "$ROLE_ARN"

  profile_tmp=$(mktemp)
  sed \
    -e "s|<AWS_REGION>|$AWS_REGION|g" \
    -e "s|<TRUST_ANCHOR_ARN>|$TRUST_ANCHOR_ARN|g" \
    -e "s|<PROFILE_ARN>|$PROFILE_ARN|g" \
    -e "s|<ROLE_ARN>|$ROLE_ARN|g" \
    extra-files/aws/roles-anywhere/config.example > "$profile_tmp"
  if grep -Eq '<(AWS_REGION|TRUST_ANCHOR_ARN|PROFILE_ARN|ROLE_ARN)>' "$profile_tmp"; then
    rm -f -- "$profile_tmp"
    fail "Roles Anywhere profile template still contains placeholders."
  fi
  chmod 0644 "$profile_tmp"
  mv -- "$profile_tmp" "$AWS_ROLES_ANYWHERE_CONFIG_FILE"
  printf 'Shared AWS profile prepared.\n'
fi

if ! git check-ignore -q -- .env; then fail 'Refusing to write AWS_REGION and S3_BUCKET because .env is not Git-ignored.'; fi
env_tmp=$(mktemp "$ENV_FILE.XXXXXX")
if [[ -f "$ENV_FILE" ]]; then
  awk -F= '$1 != "AWS_REGION" && $1 != "S3_BUCKET"' "$ENV_FILE" > "$env_tmp"
fi
printf 'AWS_REGION=%s\nS3_BUCKET=%s\n' "$AWS_REGION" "$S3_BUCKET" >> "$env_tmp"
mv -- "$env_tmp" "$ENV_FILE"

unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
if [[ "$PREFLIGHT_ONLY" == true ]]; then
  printf 'Running preflight checks without an STS exchange.\n'
  node scripts/test-roles-anywhere-container.mjs --preflight
else
  printf 'Running the production-like BFF image, mount, and STS identity checks.\n'
  pnpm test:roles-anywhere
fi
