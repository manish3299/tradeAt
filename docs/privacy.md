# Privacy and data handling

TradeAt stores identity and workspace membership, market observations, research decisions, replay artifacts, paper trades, and user-authored journal notes. Journal text and identity data are the most sensitive application records. The product must not collect broker credentials or payment-card data.

Access is workspace scoped and deny-by-default. Logs must not contain passwords, bearer/refresh tokens, cookies, database URLs, journal text, or full request bodies. Exports and deletion must be authenticated, bounded, audited, and tested for workspace isolation. Retention periods require owner approval before production release; backups inherit the longest applicable retention and deletion constraints.

Production providers, regions, subprocessors, and legal retention requirements are deployment decisions and must be documented before real user data is accepted.
