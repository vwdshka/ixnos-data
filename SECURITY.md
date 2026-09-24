# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability):
the **Security** tab of this repository → **Report a vulnerability**.

Please include what is affected, how to reproduce it, and what impact you expect. You will get
an acknowledgement within a week. Fixes are released as soon as practical, and reporters are
credited unless they prefer not to be.

## Scope

In scope: this repository's code and the ixnos-data service built from it (API, web app, alerts),
including anything that exposes account data (emails, saved searches) or lets someone alter
what ixnos-data shows.

Out of scope: the source systems themselves (ΚΗΜΔΗΣ, Διαύγεια). Report problems with those to
their operators.

## Supported versions

ixnos-data is deployed from `main`; only the latest version is supported.
