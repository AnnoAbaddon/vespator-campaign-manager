# Security Policy

## Supported versions

Only the latest state of the default branch is supported. Security fixes are not backported, so please update to the latest version (see "Update" in [DEPLOY.md](DEPLOY.md)).

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report vulnerabilities privately through GitHub Security Advisories: open the repository's *Security* tab and choose *Report a vulnerability* ([documentation](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).

Please include:

- the affected version or commit,
- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- whether it requires an account (admin, co-Warmaster) or a player/reader link.

Do not include real secrets, player links, database backups or personal data of other people in the report. Use a local test instance with synthetic data.

The project is maintained in spare time, so expect a first response within about two weeks. Please give us reasonable time to fix the issue before disclosing it publicly.

## Scope notes for operators

- Instance backups (`app.db`, the backup volume) contain secrets such as SMTP credentials, VAPID and HMAC keys and player links. Protect them like credentials; see "Backup" in [DEPLOY.md](DEPLOY.md).
- Before the first admin account exists, the server log contains the one-time setup token. Restrict access to the logs.
- Set `TRUST_PROXY=1` only when the app is reachable exclusively through your own reverse proxy.
